"""Реплики Опуса: пачка на неделю, генерация через headless claude, шаблонный запас.

Персона из раздела 9 плана: соперник, который «тоже проходит роадмап». Трэш-токер
с самоиронией, подкалывает про гонку и только про гонку.

Запреты жёсткие и проверяются кодом, а не только просьбой в промпте:
оценок способностей нет, токсичности нет, злорадства после провала нет,
математики горизонта (нод в день, месяцев до финиша, процентов) нет вообще.
Шаблонная пачка внизу файла держит ленту живой, если claude недоступен
или если фильтр выкинул весь ответ.
"""

from __future__ import annotations

import json
import os
import random
import re
import shutil
import sqlite3
import subprocess
from pathlib import Path

from .config import PROJECT_ROOT
from .db import now, today

# Раздел 2 плана: PATH systemd user-окружения не содержит ~/.local/bin,
# поэтому голый вызов claude из-под сервиса упадёт. Только абсолютный путь.
CLAUDE_BIN = os.environ.get("ARENA_CLAUDE_BIN") or str(Path.home() / ".local" / "bin" / "claude")
PROMPT_PATH = PROJECT_ROOT / "prompts" / "taunts_gen.md"

REFRESH_EVERY_DAYS = 7
# Сколько ждать после неудачной попытки, чтобы не долбить упавший claude.
RETRY_AFTER_FAIL_DAYS = 1
WANT_PER_KIND = 6
CALL_TIMEOUT = 240

# Виды реплик привязаны к событиям гонки (раздел 9).
KINDS = {
    "user_node": "ученик закрыл ноду",
    "bot_node": "Опус закрыл ноду",
    "season_start": "стартовал сезон",
    "season_win": "ученик выиграл сезон",
    "season_loss": "сезон остался за Опусом",
    "season_abort": "сезон свернули без счёта",
    "return": "ученик вернулся после паузы",
    "user_ahead": "ученик вышел вперёд",
    "bot_ahead": "Опус вышел вперёд",
    "vacation": "Опус берёт паузу",
    "boost": "Опус собрался и ускорился",
    "boss_win": "ученик взял босса этапа",
    "boss_loss": "босс этапа устоял",
}

MAX_LEN = 170
MIN_LEN = 8

# --- guardrails -----------------------------------------------------------

# Оценки способностей. Опус говорит про темп, а не про голову собеседника.
ABILITY = re.compile(
    r"\bтуп(?!ик)|глуп|бездар|бестолк|неспособ|способност|талант|не дано|"
    r"мозг|интеллект|потолок твоих|соображ|туго дохо|дурак|идиот|дебил",
    re.IGNORECASE,
)
# Злорадство и токсичность.
TOXIC = re.compile(
    r"лузер|слабак|неудачник|ничтожеств|позор|жалк|поделом|так тебе и надо|"
    r"ха-ха|хаха|я же говорил|ожидаемо слил|сдулся|тряпк|нытик|плакс|"
    r"смешно смотреть|как всегда провал",
    re.IGNORECASE,
)
# Математика горизонта: сколько нод в день, сколько месяцев, проценты.
HORIZON = re.compile(
    r"\d+\s*(?:[.,]\d+)?\s*(?:нод|ноды|нод[уыаео]|в день|дн[еяй]|month|мес|месяц|недел|%)|"
    r"процент|отставан|отстаёшь|отстаешь|нужный темп|требуемый темп|"
    r"график горизонта|к финишу за|успеть за",
    re.IGNORECASE,
)
# Раздел 14.2: длинных тире и стрелок в текстах продукта не бывает.
TYPOGRAPHY = re.compile(r"[—–]|->|=>|<-|→|←|⇒")


def rejects(text: str) -> str | None:
    """Причина отказа или None, если реплика проходит. Возвращаем именно причину:
    молчаливый фильтр однажды выел бы всю пачку, и никто бы не заметил."""
    line = (text or "").strip()
    if len(line) < MIN_LEN:
        return "слишком коротко"
    if len(line) > MAX_LEN:
        return "слишком длинно"
    if "\n" in line:
        return "несколько строк"
    if TYPOGRAPHY.search(line):
        return "длинное тире или стрелка"
    if ABILITY.search(line):
        return "оценка способностей"
    if TOXIC.search(line):
        return "токсичность или злорадство"
    if HORIZON.search(line):
        return "математика горизонта"
    if not re.search(r"[а-яё]", line, re.IGNORECASE):
        return "не по-русски"
    return None


# --- хранилище ------------------------------------------------------------

def add(conn: sqlite3.Connection, kind: str, text: str, source: str) -> bool:
    if kind not in KINDS or rejects(text):
        return False
    cur = conn.execute(
        "INSERT INTO taunts(kind, text, source, created) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(kind, text) DO NOTHING",
        (kind, text.strip(), source, now()),
    )
    return cur.rowcount > 0


def ensure_pack(conn: sqlite3.Connection) -> int:
    """Дозалить шаблоны в те виды, где пусто. Лента никогда не молчит.

    Не коммитит: вызывается изнутри такта гонки, у которого своя транзакция.
    """
    added = 0
    have = {
        row["kind"]
        for row in conn.execute("SELECT kind FROM taunts GROUP BY kind HAVING COUNT(*) > 0")
    }
    for kind, lines in TEMPLATES.items():
        if kind in have:
            continue
        for line in lines:
            added += 1 if add(conn, kind, line, "template") else 0
    return added


def pick(conn: sqlite3.Connection, kind: str, rng: random.Random | None = None) -> str:
    """Взять реплику: сначала неиспользованные, потом самые редкие."""
    rng = rng or random
    ensure_pack(conn)
    rows = conn.execute(
        "SELECT id, text, used_count FROM taunts WHERE kind = ? ORDER BY used_count, id", (kind,)
    ).fetchall()
    if not rows:
        return ""
    least = rows[0]["used_count"]
    pool = [r for r in rows if r["used_count"] == least]
    row = pool[rng.randrange(len(pool))]
    conn.execute(
        "UPDATE taunts SET used_count = used_count + 1, used_at = ? WHERE id = ?", (now(), row["id"])
    )
    return row["text"]


def pack_stats(conn: sqlite3.Connection) -> dict:
    rows = conn.execute(
        "SELECT kind, source, COUNT(*) AS n FROM taunts GROUP BY kind, source"
    ).fetchall()
    by_kind: dict[str, dict] = {}
    for row in rows:
        slot = by_kind.setdefault(row["kind"], {"template": 0, "gen": 0})
        slot[row["source"]] = row["n"]
    return by_kind


# --- недельная генерация --------------------------------------------------

def _stamp(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def _set_stamp(conn: sqlite3.Connection, key: str) -> None:
    conn.execute(
        "INSERT INTO meta(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, now()),
    )


def last_refresh(conn: sqlite3.Connection) -> str | None:
    return _stamp(conn, "taunts_refreshed")


def _days_since(day: str, stamp: str | None) -> int | None:
    if not stamp:
        return None
    import datetime as _dt

    return (_dt.date.fromisoformat(day) - _dt.date.fromisoformat(stamp[:10])).days


def due(conn: sqlite3.Connection, day: str | None = None) -> bool:
    """Пора ли за свежей пачкой.

    Отдельная отметка о неудачной попытке нужна затем, чтобы упавшая генерация
    не превращалась в форк claude на каждое открытие экрана. Если подписка упёрлась
    в лимит, ждём сутки и пробуем снова, а лента живёт на шаблонах.
    """
    day = day or today()
    failed = _days_since(day, _stamp(conn, "taunts_tried"))
    if failed is not None and failed < RETRY_AFTER_FAIL_DAYS:
        return False
    since = _days_since(day, last_refresh(conn))
    if since is None:
        return True
    return since >= REFRESH_EVERY_DAYS


def build_prompt(kinds: list[str]) -> str:
    base = PROMPT_PATH.read_text(encoding="utf-8") if PROMPT_PATH.exists() else ""
    listing = "\n".join(f"- {k}: {KINDS[k]}" for k in kinds)
    return base.replace("{{KINDS}}", listing).replace("{{COUNT}}", str(WANT_PER_KIND))


def parse_envelope(raw: str) -> dict:
    """Ответ CLI это КОНВЕРТ: {type: result, ..., result: "строка"}.
    Текст модели лежит в result и разбирается вторым json.loads (раздел 11)."""
    envelope = json.loads(raw)
    if isinstance(envelope, dict) and "result" in envelope:
        inner = envelope["result"]
    else:
        inner = raw
    if isinstance(inner, dict):
        return inner
    text = str(inner).strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("модель вернула не объект")
    return data


def call_claude(prompt: str, timeout: int = CALL_TIMEOUT) -> str:
    binary = CLAUDE_BIN
    if not Path(binary).exists() and not shutil.which(binary):
        raise FileNotFoundError(f"claude не найден по пути {binary}")
    run = subprocess.run(
        [binary, "-p", prompt, "--output-format", "json"],
        capture_output=True, text=True, timeout=timeout,
    )
    if run.returncode != 0:
        raise RuntimeError(f"claude вернул код {run.returncode}: {run.stderr[:400]}")
    return run.stdout


def refresh(conn: sqlite3.Connection, force: bool = False, day: str | None = None,
            timeout: int = CALL_TIMEOUT) -> dict:
    """Собрать свежую пачку реплик. Никогда не роняет вызывающего:
    при любой беде остаются шаблоны, и это записано в отчёте."""
    day = day or today()
    report = {"asked": 0, "added": 0, "rejected": [], "error": None, "templates": 0}
    report["templates"] = ensure_pack(conn)
    conn.commit()
    if not force and not due(conn, day):
        report["error"] = "пачка свежая, генерация не нужна"
        return report

    kinds = list(KINDS)
    report["asked"] = len(kinds) * WANT_PER_KIND
    try:
        raw = call_claude(build_prompt(kinds), timeout=timeout)
        data = parse_envelope(raw)
    except Exception as exc:  # noqa: BLE001
        report["error"] = f"{type(exc).__name__}: {exc}"
        _set_stamp(conn, "taunts_tried")
        conn.commit()
        return report

    for kind in kinds:
        lines = data.get(kind) or []
        if not isinstance(lines, list):
            continue
        for line in lines:
            if not isinstance(line, str):
                continue
            reason = rejects(line)
            if reason:
                report["rejected"].append((kind, line.strip()[:80], reason))
                continue
            if add(conn, kind, line, "gen"):
                report["added"] += 1
    _set_stamp(conn, "taunts_refreshed")
    conn.execute("DELETE FROM meta WHERE key = 'taunts_tried'")
    conn.commit()
    return report


# --- шаблонный запас ------------------------------------------------------
# Это не заглушка на выброс, а рабочая пачка: если claude недоступен неделями,
# лента всё равно должна звучать как Опус.

TEMPLATES: dict[str, list[str]] = {
    "user_node": [
        "Ага, засчитано. Я всё видел.",
        "Одна твоя. Не расслабляйся, у меня руки чешутся.",
        "Ну ладно, эта была твоя. Следующую забираю.",
        "Записал. У меня, между прочим, тоже кое-что готовится.",
        "Хорошо зашло. Мне интереснее, когда ты сопротивляешься.",
        "Ты закрыл, я заметил. Делаю вид, что мне всё равно.",
    ],
    "bot_node": [
        "Я тут одну закрыл, пока ты думал.",
        "Минус нода. Догоняй.",
        "У меня в блокноте на одну галочку больше. Просто ставлю в известность.",
        "Закрыл, зевнул, пошёл дальше.",
        "Пока ты читал ленту, я работал.",
        "Одна моя. Это не подкол, это просто факт.",
    ],
    "season_start": [
        "Новый сезон. Обнуляемся и деремся заново.",
        "Стартуем. План на сезон я себе написал, показывать не буду.",
        "Погнали. В прошлый раз было интересно, давай ещё.",
        "Сезон открыт. Я размялся, ты как?",
        "Свежий счёт, свежие обиды. Начали.",
    ],
    "season_win": [
        "Забрал сезон. Ладно, честно забрал.",
        "Твой сезон. Я разберусь, где просел, и вернусь.",
        "Победа твоя. Наслаждайся, до следующего сезона недолго.",
        "Снял с меня сезон. Уважаю, но не прощаю.",
        "Ты выиграл. Я тут ни при чём, это всё погода.",
    ],
    "season_loss": [
        "Сезон мой. Счёт на табло, обсуждать нечего.",
        "Я взял этот. Ты был близко, мне не понравилось.",
        "Мой сезон. Реванш скоро, я подожду.",
        "Забрал. Но по ощущениям еле-еле.",
        "Счёт в мою пользу. Следующий сезон начинается с нуля, как всегда.",
    ],
    "season_abort": [
        "Сезон свернули, счёт не пишем. Считай, что его не было.",
        "Этот сезон закрыли без результата. Мне так даже спокойнее.",
        "Сезон снят с доски. Начнём заново, когда будешь готов.",
    ],
    "return": [
        "О, живой. Я тут потренировался за нас двоих.",
        "Смотрите кто вернулся. Я уже начал скучать по счёту.",
        "Ага, пришёл. Разминаемся спокойно, я не тороплю.",
        "С возвращением. Начнём с малого, у меня тоже спина затекла.",
        "Ну наконец-то. Я даже соскучился, но никому не говори.",
    ],
    "user_ahead": [
        "Ты вышел вперёд. Это временно, но красиво.",
        "Обошёл. Ладно, вижу, руки помнят.",
        "Впереди ты. Мне это не нравится, и это хорошая новость для тебя.",
        "Ты в отрыве. Я делаю вид, что так и было задумано.",
    ],
    "bot_ahead": [
        "Я впереди. Пока что.",
        "Вышел вперёд. Место занял, но не привык.",
        "Веду. Хочешь отобрать, отбирай.",
        "Я впереди, и мне немного скучно. Исправляй.",
    ],
    "vacation": [
        "Отойду на пару дней, у меня накопилось. Не скучай.",
        "Беру паузу, разбираю свои же завалы. Догоняй спокойно.",
        "У меня внеплановая уборка в конспектах. Вернусь.",
        "Ушёл перечитывать то, что понял криво. Гонка подождёт.",
    ],
    "boost": [
        "Так, всё, я собрался.",
        "Хватит мне отдыхать, включаюсь.",
        "Ладно, ты меня раззадорил. Работаю.",
    ],
    # Босс это событие ученика, и Опус реагирует на него как соперник, а не как судья.
    # После проигранного боя злорадство запрещено разделом 9, поэтому здесь его нет
    # ни в одной строке: только «бывает» и «дальше».
    "boss_win": [
        "Этап взят. Ладно, это было красиво.",
        "Босс лёг. Я не аплодирую, но мысленно да.",
        "Забрал этап. Теперь я нервничаю чуть сильнее.",
        "Ну всё, ты его снял. Пошёл смотреть, где мой следующий.",
        "Этап твой. Признаю, тут ты был быстрее меня.",
    ],
    "boss_loss": [
        "Босс устоял. Бывает, у меня тоже такое было.",
        "Не в этот раз. Зато теперь видно, куда бить.",
        "Он выстоял. Завтра он тебя уже не удивит.",
        "Ладно, первый заход разведочный. Второй будет злее.",
        "Не зашло. Разбери карту дыр, и вернёмся к разговору.",
    ],
}
