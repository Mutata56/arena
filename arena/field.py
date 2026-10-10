"""Внешний подвиг и полевой босс: две самоотметки, которые продукт не видит сам.

Внешний подвиг это JavaRush и всё, что ты решал вне arena (раздел 5 плана):
20 XP, не больше трёх штук в день. Потолок не наказание, а защита от кнопки
бесконечного XP: система верит на слово, и слово должно чего-то стоить.

Полевой босс это настоящее собеседование (раздел 7). Платит 500 XP независимо
от исхода, потому что платим за поход, а не за оффер. Анкета важнее денег:
темы, на которых ты поплыл, уходят в сводку слабых мест конвейера и через день
возвращаются вопросами и карточками.
"""

from __future__ import annotations

import json
import re
import sqlite3

from . import xp
from .db import now, today

JAVARUSH_LIMIT = 3
# Границы анкеты. Совсем пустая анкета бесполезна конвейеру, поэтому просим
# хотя бы пару слов, но не мучаем длиной: разбор пишется по горячим следам.
PLACE_MIN = 2
ASKED_MIN = 10
TOPIC_MAX_LEN = 70
TOPICS_MAX = 10


def deed_state(conn: sqlite3.Connection, day: str | None = None) -> dict:
    day = day or today()
    done = conn.execute(
        "SELECT COUNT(*) FROM xp_ledger WHERE reason = ? AND date(ts) = ?",
        (xp.JAVARUSH, day),
    ).fetchone()[0]
    return {
        "done": done,
        "limit": JAVARUSH_LIMIT,
        "left": max(0, JAVARUSH_LIMIT - done),
        "xp": xp.AMOUNTS[xp.JAVARUSH],
    }


def add_deed(conn: sqlite3.Connection, day: str | None = None) -> dict:
    """Отметить внешний подвиг. Потолок дня считается по леджеру, а не по флагу:
    так он переживает и перезапуск, и правку задним числом."""
    day = day or today()
    state = deed_state(conn, day)
    if state["left"] <= 0:
        raise PermissionError(
            f"на сегодня внешние подвиги закончились: их и так {state['done']}. "
            f"Дальше считается только то, что сделано здесь"
        )
    gained = xp.award(conn, xp.AMOUNTS[xp.JAVARUSH], xp.JAVARUSH, ref_type="deed", day=day)
    conn.commit()
    out = deed_state(conn, day)
    out["gained"] = gained
    return out


def topics_from(text: str) -> list[str]:
    """Разобрать «что завалил» на темы.

    Пишут это по-разному: списком, через запятую, одной фразой. Режем по строкам,
    запятым, точкам с запятой и маркерам списка, всё остальное оставляем как есть.
    """
    parts = re.split(r"[\n;,]+|(?:^|\s)[-*•]\s+", text or "")
    out: list[str] = []
    for part in parts:
        item = " ".join(part.split()).strip(" .-")
        if not item:
            continue
        if len(item) > TOPIC_MAX_LEN:
            item = item[:TOPIC_MAX_LEN - 1] + "…"
        if item.casefold() not in (t.casefold() for t in out):
            out.append(item)
    return out[:TOPICS_MAX]


def add_field(conn: sqlite3.Connection, place: str, asked: str, failed: str = "",
              outcome: str = "") -> dict:
    """Записать собеседование и заплатить за него."""
    place = " ".join((place or "").split())
    asked = (asked or "").strip()
    if len(place) < PLACE_MIN:
        raise ValueError("напиши, где был: название компании или хотя бы «телефонное»")
    if len(asked) < ASKED_MIN:
        raise ValueError("напиши хотя бы пару слов о том, что спрашивали")
    topics = topics_from(failed)
    survey = {
        "place": place,
        "asked": asked.strip(),
        "failed": topics,
        "failed_text": (failed or "").strip(),
        "outcome": " ".join((outcome or "").split()),
    }
    attempt_no = conn.execute(
        "SELECT COUNT(*) + 1 FROM bosses WHERE kind = 'field'"
    ).fetchone()[0]
    stamp = now()
    cur = conn.execute(
        "INSERT INTO bosses(stage_id, kind, attempt_no, ts, passed, survey, status, "
        "started_at, finished_at, xp) VALUES (NULL, 'field', ?, ?, 0, ?, 'done', ?, ?, ?)",
        (attempt_no, stamp, json.dumps(survey, ensure_ascii=False), stamp, stamp,
         xp.AMOUNTS[xp.FIELD_BOSS]),
    )
    boss_id = cur.lastrowid
    # passed остаётся нулём и ничего не означает: у собеседования нет ранга,
    # платим за поход. Сводка слабых мест читает анкеты полевых боссов независимо
    # от этого поля (gen/weak.py), поэтому удачный поход тоже учит конвейер.
    gained = xp.award(conn, xp.AMOUNTS[xp.FIELD_BOSS], xp.FIELD_BOSS,
                      ref_type="boss", ref_id=boss_id)
    conn.commit()
    return {"id": boss_id, "xp": gained, "topics": topics, "survey": survey,
            "attempt_no": attempt_no, "ts": stamp}


def history(conn: sqlite3.Connection, limit: int = 10) -> list[dict]:
    rows = conn.execute(
        "SELECT id, attempt_no, ts, xp, survey FROM bosses WHERE kind = 'field' "
        "ORDER BY id DESC LIMIT ?",
        (max(1, limit),),
    ).fetchall()
    out = []
    for row in rows:
        try:
            survey = json.loads(row["survey"] or "{}")
        except (ValueError, TypeError):
            survey = {}
        out.append({
            "id": row["id"],
            "attempt_no": row["attempt_no"],
            "ts": row["ts"],
            "xp": row["xp"],
            "place": survey.get("place", ""),
            "asked": survey.get("asked", ""),
            "failed": survey.get("failed", []),
            "outcome": survey.get("outcome", ""),
        })
    return out
