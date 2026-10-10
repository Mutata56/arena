"""Вызов claude и разбор ответа.

Ответ CLI с --output-format json это КОНВЕРТ (раздел 11 плана):

    {"type": "result", "subtype": "success", "is_error": false, ..., "result": "строка"}

Текст модели лежит в поле result и разбирается вторым json.loads. Путать эти два
слоя нельзя: конверт всегда валидный JSON, даже когда модель ответила мусором,
и наоборот, оборванный конверт это сбой транспорта, а не плохой контент.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import subprocess
import time
from dataclasses import dataclass, field

from . import runtime

# Как CLI сообщает о лимитах. Первый случай это лимит подписки: после вертикальной
# черты стоит epoch, когда окно откроется. Второй это 429 от API.
LIMIT_MARKS = (
    "usage limit reached",
    "rate limit",
    "rate_limit",
    "429",
    "overloaded",
    "quota",
)
LIMIT_EPOCH = re.compile(r"usage limit reached\s*\|\s*(\d{9,13})", re.IGNORECASE)
FENCE = re.compile(r"^\s*```[a-zA-Z]*\s*|\s*```\s*$")

# Лимит без подсказки, когда откроется окно: ждём полчаса.
DEFAULT_BACKOFF_SEC = 30 * 60


@dataclass
class Reply:
    """Что вернул вызов. status: ok, invalid, limit, error."""

    status: str
    data: dict | None = None
    raw: str = ""
    error: str = ""
    seconds: float = 0.0
    cost: float | None = None
    model: str = ""
    retry_after: str | None = None
    argv: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.status == "ok"


def _epoch_to_stamp(value: int) -> str:
    if value > 10_000_000_000:  # миллисекунды
        value //= 1000
    return dt.datetime.fromtimestamp(value).isoformat(timespec="seconds")


def backoff_stamp(seconds: int = DEFAULT_BACKOFF_SEC) -> str:
    return (dt.datetime.now() + dt.timedelta(seconds=seconds)).isoformat(timespec="seconds")


def looks_like_limit(text: str) -> bool:
    low = (text or "").lower()
    return any(mark in low for mark in LIMIT_MARKS)


def limit_retry_after(text: str) -> str:
    found = LIMIT_EPOCH.search(text or "")
    if found:
        try:
            return _epoch_to_stamp(int(found.group(1)))
        except (ValueError, OSError, OverflowError):
            pass
    return backoff_stamp()


def strip_fence(text: str) -> str:
    """Снять обёртку ```json, если модель всё-таки её поставила.

    Промпт запрещает обёртку, но ронять из-за неё готовый контент глупо:
    это форма, а не смысл. Всё, что дальше не разобралось, честно уходит в невалид.
    """
    text = (text or "").strip()
    if text.startswith("```"):
        text = FENCE.sub("", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start > 0 and end > start:
        text = text[start:end + 1]
    return text


def parse_envelope(stdout: str) -> tuple[dict | None, str]:
    try:
        env = json.loads(stdout)
    except ValueError as exc:
        return None, f"конверт CLI не разобрался: {exc}"
    if not isinstance(env, dict):
        return None, "конверт CLI не объект"
    if env.get("type") != "result":
        return None, f"в конверте нет result, type={env.get('type')!r}"
    return env, ""


def build_argv(bin_argv: list[str], model: str, tools: str | None,
                effort: str = "") -> list[str]:
    """Собрать командную строку.

    Промпт уходит в stdin, а не аргументом: во-первых, он длинный, во-вторых,
    вариадический --tools съедает следующий позиционный аргумент, и промпт,
    поставленный после него, просто теряется (проверено на живом CLI).
    """
    argv = list(bin_argv) + ["-p", "--output-format", "json"]
    if model:
        argv += ["--model", model]
    if effort:
        argv += ["--effort", effort]
    # Чужие MCP-серверы и сохранённые сессии генерации не нужны: лишний контекст,
    # лишнее время и лишние поводы упасть.
    argv += ["--strict-mcp-config", "--no-session-persistence"]
    # --tools ставим последним, он вариадический.
    argv += ["--tools", tools if tools is not None else ""]
    return argv


def ask(prompt: str, *, bin_argv: list[str], model: str = "", tools: str | None = None,
        timeout: int | None = None, cwd: str | None = None, effort: str = "") -> Reply:
    """Один вызов модели. Наружу не бросает: любая беда это статус в ответе."""
    argv = build_argv(bin_argv, model, tools, effort)
    started = time.monotonic()
    try:
        proc = subprocess.run(
            argv, input=prompt, capture_output=True, text=True,
            timeout=timeout or runtime.timeout(), cwd=cwd, start_new_session=True,
        )
    except subprocess.TimeoutExpired:
        return Reply(status="error", error=f"вызов не уложился в {timeout or runtime.timeout()} секунд",
                     seconds=time.monotonic() - started, model=model, argv=argv)
    except OSError as exc:
        return Reply(status="error", error=f"не запустился {argv[0]}: {exc}",
                     seconds=time.monotonic() - started, model=model, argv=argv)

    seconds = time.monotonic() - started
    raw = proc.stdout or ""
    tail = (proc.stderr or "").strip()

    env, why = parse_envelope(raw)
    if env is None:
        # Разобрать конверт не вышло. Если в выводе видны следы лимита, это лимит,
        # а не сломанный контент: очередь встаёт на паузу, попытка не сгорает.
        blob = f"{raw}\n{tail}"
        if proc.returncode != 0 and looks_like_limit(blob):
            return Reply(status="limit", raw=blob[:8000], error="лимит подписки или 429",
                         seconds=seconds, model=model, retry_after=limit_retry_after(blob), argv=argv)
        return Reply(status="error", raw=blob[:8000],
                     error=f"{why}; код возврата {proc.returncode}" + (f"; stderr: {tail[:300]}" if tail else ""),
                     seconds=seconds, model=model, argv=argv)

    cost = env.get("total_cost_usd")
    text = env.get("result") or ""
    api_status = str(env.get("api_error_status") or "")
    is_error = bool(env.get("is_error")) or env.get("subtype") not in (None, "success")

    if api_status in ("429", "529") or (is_error and looks_like_limit(f"{text} {api_status}")):
        return Reply(status="limit", raw=raw[:8000], error=f"лимит: {text[:200] or api_status}",
                     seconds=seconds, cost=cost, model=model,
                     retry_after=limit_retry_after(text), argv=argv)
    if is_error:
        return Reply(status="error", raw=raw[:8000], error=f"CLI вернул ошибку: {text[:300]}",
                     seconds=seconds, cost=cost, model=model, argv=argv)

    try:
        data = json.loads(strip_fence(text))
    except ValueError as exc:
        return Reply(status="invalid", raw=text[:8000], error=f"ответ модели не разобрался как JSON: {exc}",
                     seconds=seconds, cost=cost, model=model, argv=argv)
    if not isinstance(data, dict):
        return Reply(status="invalid", raw=text[:8000], error="ответ модели не объект JSON",
                     seconds=seconds, cost=cost, model=model, argv=argv)
    return Reply(status="ok", data=data, raw=text[:8000], seconds=seconds, cost=cost,
                 model=model, argv=argv)
