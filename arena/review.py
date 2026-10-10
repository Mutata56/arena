"""Повторение пройденного: расписание и осмысленная очередь.

Ученик справедливо заметил две вещи. Первая: когда придёт повторение, знала только
база, а на экране этого не было. Вторая: повторять те же вопросы подряд бессмысленно,
повторять надо то, что реально просело.

Поэтому здесь два ответа. `plan` показывает расписание: сколько карточек созрело,
сколько созреет по дням вперёд и сколько вопросов ждут второго подхода. `queue`
собирает сессию повторения в осознанном порядке: сперва то, где был промах, потом
самое давнее, потом карточки по расписанию SM-2. Вопросы, отвеченные верно сегодня,
в сессию не попадают: это было бы механическим прокликиванием.
"""

from __future__ import annotations

import json
import sqlite3

from . import srs
from .db import today

# Сколько дней вперёд показываем в расписании.
FORECAST_DAYS = 10
# Размер сессии повторения по умолчанию.
SESSION = 20
# Через сколько дней уже отвеченный вопрос снова считается «давно не попадался».
# Раньше учитывался только сегодняшний ответ, поэтому пройденные вчера вопросы
# наутро опять числились давними — счётчик сбрасывался каждый день.
STALE_DAYS = 14


def _rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    return list(conn.execute(sql, params))


def forecast(conn: sqlite3.Connection, day: str | None = None) -> list[dict]:
    """По дням: сколько карточек созреет. Долг наружу не отдаём, только план вперёд."""
    day = day or today()
    rows = _rows(conn, """
        SELECT cs.due AS due, COUNT(*) AS n
        FROM card_state cs JOIN items i ON i.id = cs.item_id
        WHERE i.active = 1 AND i.suspended = 0 AND cs.last IS NOT NULL
          AND cs.due > ? AND cs.due <= date(?, '+' || ? || ' days')
        GROUP BY cs.due ORDER BY cs.due
    """, (day, day, FORECAST_DAYS))
    return [{"date": r["due"], "cards": r["n"]} for r in rows]


def weak_quiz(conn: sqlite3.Connection, day: str | None = None, limit: int = SESSION) -> list[sqlite3.Row]:
    """Вопросы, где был промах, из уже пройденного материала.

    Берём только ноды, которые закрыты или в работе: повторять то, до чего ещё
    не дошёл, нельзя. Сегодняшние верные ответы исключаем.
    """
    day = day or today()
    return _rows(conn, """
        SELECT i.id, i.payload, i.type, n.code AS node_code, n.title AS node_title,
               (SELECT COUNT(*) FROM attempts a WHERE a.item_id = i.id AND a.correct = 0) AS misses,
               (SELECT MAX(a.ts) FROM attempts a WHERE a.item_id = i.id) AS last_seen
        FROM items i JOIN nodes n ON n.id = i.node_id
        WHERE i.type IN ('quiz', 'readcode') AND i.active = 1 AND i.suspended = 0
          AND n.status IN ('closed', 'in_progress')
          AND (SELECT COUNT(*) FROM attempts a WHERE a.item_id = i.id AND a.correct = 0) > 0
          AND i.id NOT IN (SELECT item_id FROM attempts
                           WHERE kind = 'quiz' AND correct = 1 AND date(ts) = ?)
        ORDER BY misses DESC, last_seen ASC
        LIMIT ?
    """, (day, limit))


def stale_quiz(conn: sqlite3.Connection, day: str | None = None, limit: int = SESSION) -> list[sqlite3.Row]:
    """Давно не показан вопросы из пройденного: механика «а помнишь ли ещё»."""
    day = day or today()
    return _rows(conn, """
        SELECT i.id, i.payload, i.type, n.code AS node_code, n.title AS node_title,
               (SELECT MAX(a.ts) FROM attempts a WHERE a.item_id = i.id) AS last_seen
        FROM items i JOIN nodes n ON n.id = i.node_id
        WHERE i.type IN ('quiz', 'readcode') AND i.active = 1 AND i.suspended = 0
          AND n.status = 'closed'
          AND ((SELECT MAX(a.ts) FROM attempts a WHERE a.item_id = i.id) IS NULL
               OR (SELECT MAX(a.ts) FROM attempts a WHERE a.item_id = i.id)
                    < date(?, '-' || ? || ' days'))
        ORDER BY last_seen IS NULL DESC, last_seen ASC
        LIMIT ?
    """, (day, STALE_DAYS, limit))


def weak_count(conn: sqlite3.Connection, day: str | None = None) -> int:
    """Сколько вопросов с промахом ждут повторения. Те же условия, что у weak_quiz."""
    day = day or today()
    return conn.execute("""
        SELECT COUNT(*)
        FROM items i JOIN nodes n ON n.id = i.node_id
        WHERE i.type IN ('quiz', 'readcode') AND i.active = 1 AND i.suspended = 0
          AND n.status IN ('closed', 'in_progress')
          AND (SELECT COUNT(*) FROM attempts a WHERE a.item_id = i.id AND a.correct = 0) > 0
          AND i.id NOT IN (SELECT item_id FROM attempts
                           WHERE kind = 'quiz' AND correct = 1 AND date(ts) = ?)
    """, (day,)).fetchone()[0]


def stale_count(conn: sqlite3.Connection, day: str | None = None) -> int:
    """Сколько давних вопросов ждут повторения. Те же условия, что у stale_quiz."""
    day = day or today()
    return conn.execute("""
        SELECT COUNT(*)
        FROM items i JOIN nodes n ON n.id = i.node_id
        WHERE i.type IN ('quiz', 'readcode') AND i.active = 1 AND i.suspended = 0
          AND n.status = 'closed'
          AND ((SELECT MAX(a.ts) FROM attempts a WHERE a.item_id = i.id) IS NULL
               OR (SELECT MAX(a.ts) FROM attempts a WHERE a.item_id = i.id)
                    < date(?, '-' || ? || ' days'))
    """, (day, STALE_DAYS)).fetchone()[0]


def plan(conn: sqlite3.Connection, day: str | None = None) -> dict:
    """Что показать на экране: расписание и объём того, что стоит повторить."""
    day = day or today()
    cards_due = srs.due_count(conn, day)   # реальное число созревших, без потолка queue()
    # Счётчики считаем COUNT-ом, а не длиной списка с LIMIT: раньше плитка
    # «давно не попадались» упиралась в 200 и не двигалась, сколько ни отвечай.
    weak = weak_count(conn, day)
    stale = stale_count(conn, day)
    closed = conn.execute("SELECT COUNT(*) FROM nodes WHERE status = 'closed'").fetchone()[0]
    ahead = forecast(conn, day)
    return {
        "cards_due": cards_due,
        "weak": weak,
        "stale": stale,
        "closed_nodes": closed,
        "forecast": ahead,
        "next_day": ahead[0]["date"] if ahead else None,
        "session": min(SESSION, cards_due + weak + stale),
    }


def queue(conn: sqlite3.Connection, day: str | None = None, limit: int = SESSION,
          only: str | None = None) -> list[dict]:
    """Очередь сессии повторения. Порядок осмысленный, а не случайный.

    only=None  — смешанная сессия (промахи → карточки → давнее, как раньше).
    only="weak"/"cards"/"stale" — сессия ТОЛЬКО одной категории (клик по счётчику
    в блоке «повторение пройденного»)."""
    day = day or today()
    out: list[dict] = []
    seen: set[int] = set()

    def push(row: sqlite3.Row, why: str) -> None:
        if row["id"] in seen or len(out) >= limit:
            return
        seen.add(row["id"])
        data = json.loads(row["payload"])
        out.append({
            "item_id": row["id"],
            "kind": row["type"],
            "why": why,
            "node_code": row["node_code"],
            "q": data.get("q") or data.get("question", ""),
            "code": data.get("code"),
            "opts": data.get("opts", []),
            "topic": data.get("topic", ""),
        })

    # Сперва промахи: именно они и есть «то, что реально повторить надо».
    if only in (None, "weak"):
        for row in weak_quiz(conn, day, limit):
            push(row, "тут был промах")
    # Потом карточки по расписанию SM-2: они и есть настоящее интервальное повторение.
    if only in (None, "cards"):
        for row in srs.queue(conn, day, limit=max(0, limit - len(out))):
            if row["id"] in seen or len(out) >= limit:
                continue
            seen.add(row["id"])
            data = json.loads(row["payload"])
            out.append({"item_id": row["id"], "kind": "card", "why": "карточка созрела",
                        "front": data["front"], "back": data["back"],
                        "src": data.get("src", ""), "is_new": row["reps"] == 0})
    # Хвост добиваем самым давним из закрытых нод.
    if only in (None, "stale"):
        for row in stale_quiz(conn, day, limit):
            push(row, "давно не попадался")
    return out[:limit]
