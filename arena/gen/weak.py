"""Сводка слабых мест ученика для промпта.

Раздел 11 плана: в промпт подкладывается краткая сводка последних ошибок
(неверные квиз-ответы, lapses карточек, темы проваленных боссов), и генератор
обязан целить в них не меньше трети вопросов.

Сводка нужна короткой. Промпт на сто строк ошибок модель прочитает по диагонали,
поэтому берём свежее и схлопываем по темам: тема важнее конкретной формулировки.
"""

from __future__ import annotations

import json
import sqlite3

WRONG_LOOKBACK = 60
WRONG_TOPICS = 8
CARD_TOPICS = 5
EMPTY = ("Пока пусто: ошибок в банке нет. Целься в типичные грабли новичков "
         "по теме ноды, их видно на собеседованиях.")


def _short(text: str, limit: int = 90) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[:limit - 1] + "…"


def wrong_quiz(conn: sqlite3.Connection, stage_id: int | None = None) -> list[dict]:
    """Свежие неверные ответы, схлопнутые по темам. Свой этап идёт первым."""
    rows = conn.execute(
        "SELECT a.item_id, a.ts, i.payload, i.stage_id, n.code AS node_code "
        "FROM attempts a JOIN items i ON i.id = a.item_id "
        "LEFT JOIN nodes n ON n.id = a.node_id "
        "WHERE a.kind = 'quiz' AND a.correct = 0 "
        "ORDER BY a.id DESC LIMIT ?",
        (WRONG_LOOKBACK,),
    ).fetchall()
    seen: dict[str, dict] = {}
    for row in rows:
        try:
            payload = json.loads(row["payload"])
        except (ValueError, TypeError):
            continue
        theme = str(payload.get("topic") or "").strip() or _short(payload.get("q", ""), 40)
        key = theme.casefold()
        entry = seen.setdefault(key, {
            "topic": theme,
            "q": _short(payload.get("q", "")),
            "node": row["node_code"] or "",
            "count": 0,
            "own_stage": stage_id is not None and row["stage_id"] == stage_id,
        })
        entry["count"] += 1
    ordered = sorted(seen.values(), key=lambda e: (not e["own_stage"], -e["count"]))
    return ordered[:WRONG_TOPICS]


def card_lapses(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT i.payload, cs.lapses FROM card_state cs JOIN items i ON i.id = cs.item_id "
        "WHERE cs.lapses > 0 AND i.active = 1 AND i.suspended = 0 "
        "ORDER BY cs.lapses DESC, cs.last DESC LIMIT ?",
        (CARD_TOPICS,),
    ).fetchall()
    out = []
    for row in rows:
        try:
            payload = json.loads(row["payload"])
        except (ValueError, TypeError):
            continue
        out.append({"front": _short(payload.get("front", ""), 80), "lapses": row["lapses"]})
    return out


def boss_fails(conn: sqlite3.Connection) -> list[str]:
    """Темы проваленных боссов и собеседований.

    Полевой босс попадает сюда независимо от того, чем кончился поход: у анкеты
    нет ранга, а темы, на которых человек поплыл, интересны в любом случае.
    """
    try:
        rows = conn.execute(
            "SELECT questions, survey FROM bosses WHERE passed = 0 OR kind = 'field' "
            "ORDER BY id DESC LIMIT 5"
        ).fetchall()
    except sqlite3.Error:
        return []
    themes: list[str] = []
    for row in rows:
        for blob in (row["questions"], row["survey"]):
            if not blob:
                continue
            try:
                data = json.loads(blob)
            except (ValueError, TypeError):
                themes.append(_short(blob, 80))
                continue
            if isinstance(data, dict):
                data = data.get("failed") or data.get("topics") or []
            if isinstance(data, list):
                for entry in data[:5]:
                    if isinstance(entry, str):
                        themes.append(_short(entry, 60))
                    elif isinstance(entry, dict) and entry.get("topic"):
                        themes.append(_short(entry["topic"], 60))
    seen: list[str] = []
    for theme in themes:
        if theme and theme not in seen:
            seen.append(theme)
    return seen[:5]


def summary(conn: sqlite3.Connection, stage_id: int | None = None) -> str:
    """Текст для промпта. Пустая сводка тоже осмысленная: генератор не должен гадать."""
    lines: list[str] = []
    wrong = wrong_quiz(conn, stage_id)
    if wrong:
        lines.append("Недавно ошибся в этих вопросах:")
        for entry in wrong:
            tail = f" (промахов {entry['count']})" if entry["count"] > 1 else ""
            place = f", нода {entry['node']}" if entry["node"] else ""
            lines.append(f"- {entry['topic']}: {entry['q']}{tail}{place}")
    cards = card_lapses(conn)
    if cards:
        lines.append("Карточки, которые он забывает:")
        for entry in cards:
            lines.append(f"- {entry['front']} (сбрасывал повтор {entry['lapses']} раз)")
    bosses = boss_fails(conn)
    if bosses:
        lines.append("Темы, проваленные на боссах и собеседованиях:")
        lines += [f"- {theme}" for theme in bosses]
    if not lines:
        return EMPTY
    return "\n".join(lines)
