"""Повторения карточек по SM-2.

Формулы взяты один в один из jcards, откуда приехали карточки: интервалы и ease
не должны поменяться от переезда. Оценки те же четыре: снова, трудно, хорошо, легко.
"""

from __future__ import annotations

import datetime as dt
import sqlite3

GRADES = ("again", "hard", "good", "easy")
GRADE_TITLES = {
    "again": "снова",
    "hard": "трудно",
    "good": "хорошо",
    "easy": "легко",
}
NEW_PER_DAY = 10


def _parse_day(value: str) -> dt.date:
    return dt.date.fromisoformat(value)


def grade_card(conn: sqlite3.Connection, item_id: int, grade: str, today: str) -> dict:
    if grade not in GRADES:
        raise ValueError(f"неизвестная оценка {grade!r}")
    row = conn.execute(
        "SELECT ease, interval, reps, lapses, last FROM card_state WHERE item_id = ?", (item_id,)
    ).fetchone()
    if row is None:
        raise LookupError(f"нет карточки {item_id}")

    ease, interval, reps, lapses = row["ease"], row["interval"], row["reps"], row["lapses"]
    was_new = row["last"] is None
    day = _parse_day(today)

    if grade == "again":
        ease = max(1.3, ease - 0.20)
        interval = 0
        reps = 0
        lapses += 1
        due = day
    else:
        if grade == "hard":
            ease = max(1.3, ease - 0.15)
            interval = max(1, round((interval or 1) * 1.2))
        elif grade == "good":
            interval = 1 if reps == 0 else (6 if reps == 1 else max(1, round(interval * ease)))
        else:
            ease += 0.15
            interval = 4 if reps == 0 else (6 if reps == 1 else max(1, round(interval * ease * 1.3)))
        reps += 1
        due = day + dt.timedelta(days=interval)

    conn.execute(
        "UPDATE card_state SET ease = ?, interval = ?, reps = ?, lapses = ?, due = ?, last = ? "
        "WHERE item_id = ?",
        (ease, interval, reps, lapses, due.isoformat(), today, item_id),
    )
    return {
        "due": due.isoformat(),
        "interval": interval,
        "ease": round(ease, 2),
        "was_new": was_new,
        "grade": grade,
    }


def new_today(conn: sqlite3.Connection, today: str) -> int:
    """Сколько новых карточек уже введено в оборот сегодня."""
    return conn.execute(
        "SELECT COUNT(*) FROM attempts WHERE kind = 'card' AND date(ts) = ? "
        "AND json_extract(result, '$.was_new') = 1",
        (today,),
    ).fetchone()[0]


def queue(conn: sqlite3.Connection, today: str, limit: int) -> list[sqlite3.Row]:
    """Очередь на сегодня: сперва самые горящие, потом новые в пределах дневной нормы.

    Размер долга наружу не отдаём: раздел 6 плана запрещает счётчики просроченного.
    """
    if limit <= 0:
        return []
    rows = list(conn.execute(
        "SELECT i.id, i.payload, cs.due, cs.reps FROM items i JOIN card_state cs ON cs.item_id = i.id "
        "WHERE i.type = 'card' AND i.active = 1 AND i.suspended = 0 "
        "AND cs.last IS NOT NULL AND cs.due <= ? "
        "AND i.id NOT IN (SELECT item_id FROM attempts WHERE kind = 'card' AND date(ts) = ?) "
        "ORDER BY cs.due, i.id LIMIT ?",
        (today, today, limit),
    ))
    room = limit - len(rows)
    if room > 0:
        allowance = max(0, NEW_PER_DAY - new_today(conn, today))
        if allowance:
            # Новую карточку показываем только из ноды, до которой ученик дошёл:
            # термин из середины этапа не должен выпадать в первый день. Уже начатые
            # карточки этим фильтром не трогаем, у них своё расписание повторений.
            rows += list(conn.execute(
                "SELECT i.id, i.payload, cs.due, cs.reps FROM items i "
                "JOIN card_state cs ON cs.item_id = i.id "
                "WHERE i.type = 'card' AND i.active = 1 AND i.suspended = 0 AND cs.last IS NULL "
                "AND (i.node_id IS NULL OR i.node_id IN "
                "     (SELECT id FROM nodes WHERE status IN ('closed', 'in_progress'))) "
                "AND i.id NOT IN (SELECT item_id FROM attempts WHERE kind = 'card' AND date(ts) = ?) "
                "ORDER BY i.created, i.id LIMIT ?",
                (today, min(room, allowance)),
            ))
    return rows


def available_today(conn: sqlite3.Connection, today: str) -> int:
    """Сколько карточек вообще можно показать сегодня. Нужно, чтобы посчитать контракт."""
    return len(queue(conn, today, limit=NEW_PER_DAY * 3))


def due_count(conn: sqlite3.Connection, today: str) -> int:
    """РЕАЛЬНОЕ число созревших карточек (due<=today, не отвечены сегодня) — без потолка
    queue(). Для счётчика «карточек созрело»: он обязан честно падать с каждым ответом,
    а не упираться в limit и застревать на одном числе."""
    return conn.execute(
        "SELECT COUNT(*) FROM items i JOIN card_state cs ON cs.item_id = i.id "
        "WHERE i.type = 'card' AND i.active = 1 AND i.suspended = 0 "
        "AND cs.last IS NOT NULL AND cs.due <= ? "
        "AND i.id NOT IN (SELECT item_id FROM attempts WHERE kind = 'card' AND date(ts) = ?)",
        (today, today),
    ).fetchone()[0]
