"""Вызов headless claude и разбор его ответа.

Два правила, оба из раздела 11 плана и оба выстраданные.

1. Путь к бинарю строго абсолютный. PATH у systemd user-окружения не содержит
   ~/.local/bin, поэтому голый вызов `claude` из-под сервиса упадёт, а из
   интерактивного шелла отработает: баг маскируется ровно там, где его отлаживают.
2. Ответ CLI это КОНВЕРТ вида {"type": "result", ..., "result": "строка"}.
   Текст модели лежит в поле result и разбирается вторым json.loads.

Модуль общий: им пользуются защита (фаза 6) и всё, что придёт потом. Реплики
Опуса продолжают звать claude через собственную обёртку в taunts.py: там своя
точка подмены бинаря, которую разбирает приёмка фазы 5, и трогать её незачем.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

CLAUDE_BIN = os.environ.get("ARENA_CLAUDE_BIN") or str(Path.home() / ".local" / "bin" / "claude")
TIMEOUT = 300


def binary() -> str:
    return os.environ.get("ARENA_CLAUDE_BIN") or CLAUDE_BIN


def call(prompt: str, timeout: int = TIMEOUT, binary_path: str | None = None,
         model: str | None = None) -> str:
    path = binary_path or binary()
    if not Path(path).exists() and not shutil.which(path):
        raise FileNotFoundError(f"claude не найден по пути {path}")
    cmd = [path, "-p", prompt, "--output-format", "json"]
    if model:
        cmd += ["--model", model]
    run = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if run.returncode != 0:
        raise RuntimeError(f"claude вернул код {run.returncode}: {run.stderr[:400]}")
    return run.stdout


def parse_envelope(raw: str):
    """Достать объект модели из конверта CLI. Кодовый блок вокруг JSON снимается."""
    envelope = json.loads(raw)
    inner = envelope["result"] if isinstance(envelope, dict) and "result" in envelope else raw
    if isinstance(inner, (dict, list)):
        return inner
    text = str(inner).strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    return json.loads(text)
