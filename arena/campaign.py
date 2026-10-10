"""Кампания, чекпоинт 60-го дня и строка ETA.

Раздел 9 плана, последний блок. Математика горизонта живёт ровно в двух местах:
строка ETA на карте и окно чекпоинта. Больше нигде её быть не должно, поэтому
весь счёт сроков собран в этом файле, а не размазан по продукту.

Тон чекпоинта задан планом дословно: сначала итог построенного, потом три
равноправные ветки с ценой каждой. Не «ты не успел», а «твой темп уже выбрал
ветку, хочешь быстрее, вот сколько это стоит». Слова «отставание» и процентов
от нужного темпа в продукте нет.
"""

from __future__ import annotations

import datetime as dt
import math
import sqlite3

from . import pace
from .db import today

CHECKPOINT_DAY = 60
DEFAULT_TARGET_DAYS = 180

# Три равноправные ветки горизонта из раздела 1 плана.
BRANCHES = (6, 9, 12)
BRANCH_DAYS = {6: 180, 9: 270, 12: 365}
BRANCH_RATE = {6: 4.0, 9: 2.7, 12: 2.0}

MONTHS_TO = (
    "январю", "февралю", "марту", "апрелю", "маю", "июню",
    "июлю", "августу", "сентябрю", "октябрю", "ноябрю", "декабрю",
)


DEFAULTS = {
    "id": 1, "start_date": None, "target_days": DEFAULT_TARGET_DAYS, "checkpoint_at": None,
    "renegotiated": 0, "branch_months": None, "checkpoint_seen_at": None,
}


def state(conn: sqlite3.Connection) -> dict:
    """Чтение без записи: пока кампания не начата, строки в базе нет,
    и один только просмотр статуса её не заводит."""
    row = conn.execute("SELECT * FROM campaign WHERE id = 1").fetchone()
    return dict(row) if row is not None else dict(DEFAULTS)


def started(conn: sqlite3.Connection) -> bool:
    row = state(conn)
    return bool(row["start_date"])


def start(conn: sqlite3.Connection, day: str | None = None) -> dict:
    """Старт кампании. Только руками demo_user: до этого чекпоинт не тикает."""
    day = day or today()
    row = state(conn)
    if row["start_date"]:
        return row
    conn.execute("INSERT INTO campaign(id) VALUES (1) ON CONFLICT(id) DO NOTHING")
    conn.execute(
        "UPDATE campaign SET start_date = ?, target_days = ?, checkpoint_at = ? WHERE id = 1",
        (day, DEFAULT_TARGET_DAYS, pace.shift(day, CHECKPOINT_DAY)),
    )
    conn.commit()
    return state(conn)


def track_totals(conn: sqlite3.Connection) -> tuple[int, int]:
    """Закрыто и всего по траектории собесного минимума."""
    row = conn.execute(
        "SELECT COUNT(*) AS total, "
        "SUM(CASE WHEN n.status = 'closed' THEN 1 ELSE 0 END) AS closed "
        "FROM nodes n JOIN stages s ON s.id = n.stage_id WHERE s.in_track = 1"
    ).fetchone()
    return int(row["closed"] or 0), int(row["total"] or 0)


def current_rate(conn: sqlite3.Connection) -> float:
    """Темп для оценки сроков. Это EMA закрытых нод в день, та же, по которой
    живёт соперник: два разных темпа в одном продукте путали бы."""
    row = conn.execute("SELECT user_rate FROM bot_state WHERE id = 1").fetchone()
    return float(row["user_rate"]) if row else pace.RATE_FLOOR


def factual_rate(conn: sqlite3.Connection, day: str) -> float:
    """Фактический темп с начала кампании: закрытые ноды на прожитые дни."""
    row = state(conn)
    if not row["start_date"]:
        return current_rate(conn)
    days = max(1, pace.diff_days(day, row["start_date"]) + 1)
    closed = pace.nodes_closed_between(conn, row["start_date"], day)
    return closed / days


def eta(conn: sqlite3.Connection, day: str | None = None) -> dict:
    """Строка для карты: именно дата, без процентов и без слова «отставание»."""
    day = day or today()
    closed, total = track_totals(conn)
    left = max(0, total - closed)
    if left == 0 and total:
        return {"known": True, "done": True, "text": "траектория пройдена целиком",
                "month": None, "year": None, "days_left": 0}
    rate = current_rate(conn)
    if closed == 0 or rate <= 0:
        return {"known": False, "done": False,
                "text": "темп ещё набирается, оценка появится через несколько дней",
                "month": None, "year": None, "days_left": None}
    days_left = int(math.ceil(left / rate))
    finish = pace.to_date(day) + dt.timedelta(days=days_left)
    return {
        "known": True,
        "done": False,
        "text": f"при текущем темпе финиш примерно к {MONTHS_TO[finish.month - 1]} {finish.year}",
        "month": finish.month,
        "year": finish.year,
        "days_left": days_left,
    }


def _built(conn: sqlite3.Connection, day: str) -> dict:
    """Итог построенного. Это первый экран чекпоинта и он про сделанное."""
    from . import seasons, xp

    row = state(conn)
    closed, total = track_totals(conn)
    total_xp = conn.execute("SELECT COALESCE(SUM(amount), 0) FROM xp_ledger").fetchone()[0]
    green = conn.execute("SELECT COUNT(*) FROM days WHERE contract_done = 1").fetchone()[0]
    bosses = [
        {"stage": r["num"], "rank": r["rank"]}
        for r in conn.execute(
            "SELECT s.num, b.rank FROM bosses b JOIN stages s ON s.id = b.stage_id "
            "WHERE b.passed = 1 ORDER BY s.num"
        )
    ]
    played = conn.execute(
        "SELECT COUNT(*) FROM seasons WHERE outcome IN ('win', 'loss')"
    ).fetchone()[0]
    won = conn.execute("SELECT COUNT(*) FROM seasons WHERE outcome = 'win'").fetchone()[0]
    return {
        "days": pace.diff_days(day, row["start_date"]) + 1 if row["start_date"] else 0,
        "streak": xp.streak(conn, day),
        "green_days": green,
        "xp_total": int(total_xp),
        "nodes_closed": closed,
        "nodes_total": total,
        "bosses": bosses,
        "seasons_played": played,
        "seasons_won": won,
        "last_seasons": seasons.history(conn, limit=5),
    }


def preselect(rate: float) -> int:
    for months in BRANCHES:
        if rate >= BRANCH_RATE[months]:
            return months
    return BRANCHES[-1]


def branches(conn: sqlite3.Connection, day: str) -> list[dict]:
    row = state(conn)
    closed, total = track_totals(conn)
    left = max(0, total - closed)
    elapsed = pace.diff_days(day, row["start_date"]) + 1 if row["start_date"] else 0
    rate = factual_rate(conn, day)
    chosen = preselect(rate)
    out = []
    for months in BRANCHES:
        days_left = max(1, BRANCH_DAYS[months] - elapsed)
        out.append({
            "months": months,
            "title": f"{months} месяцев",
            "target_days": BRANCH_DAYS[months],
            "rate": BRANCH_RATE[months],
            "need_rate": round(left / days_left, 1),
            "nodes_left": left,
            "days_left": days_left,
            "selected": months == chosen,
        })
    return out


def checkpoint(conn: sqlite3.Connection, day: str | None = None, mark: bool = False) -> dict:
    """Окно чекпоинта 60-го дня. Порядок разделов из плана: сначала построенное,
    потом три равноправные ветки."""
    day = day or today()
    row = state(conn)
    if not row["start_date"]:
        return {"due": False, "reason": "кампания не начата"}
    if row["renegotiated"]:
        return {"due": False, "reason": "ветка уже выбрана", "branch_months": row["branch_months"]}
    if not row["checkpoint_at"] or day < row["checkpoint_at"]:
        return {"due": False, "reason": "рано",
                "at": row["checkpoint_at"],
                "days_to_go": pace.diff_days(row["checkpoint_at"], day) if row["checkpoint_at"] else None}
    if mark and not row["checkpoint_seen_at"]:
        conn.execute("UPDATE campaign SET checkpoint_seen_at = ? WHERE id = 1", (day,))
        conn.commit()
    rate = factual_rate(conn, day)
    chosen = preselect(rate)
    return {
        "due": True,
        "day_num": pace.diff_days(day, row["start_date"]) + 1,
        "sections": ["built", "branches"],
        "built": _built(conn, day),
        "branches": branches(conn, day),
        "preselected": chosen,
        "rate": round(rate, 2),
        "eta": eta(conn, day),
        "lead_in": "Шестьдесят дней позади. Сначала посмотри, что уже построено.",
        "frame": (f"Твой темп уже выбрал ветку «{chosen} месяцев». "
                  f"Хочешь побороться за более быструю, вот её цена."),
    }


def choose(conn: sqlite3.Connection, months: int, day: str | None = None) -> dict:
    """Выбор ветки двигает только срок. XP и история не трогаются."""
    day = day or today()
    if months not in BRANCH_DAYS:
        raise ValueError(f"веток три: {', '.join(str(m) for m in BRANCHES)}")
    row = state(conn)
    if not row["start_date"]:
        raise LookupError("кампания не начата")
    conn.execute(
        "UPDATE campaign SET target_days = ?, branch_months = ?, renegotiated = 1, "
        "checkpoint_seen_at = COALESCE(checkpoint_seen_at, ?) WHERE id = 1",
        (BRANCH_DAYS[months], months, day),
    )
    conn.commit()
    return {"branch_months": months, "target_days": BRANCH_DAYS[months]}


def board(conn: sqlite3.Connection, day: str | None = None) -> dict:
    day = day or today()
    row = state(conn)
    closed, total = track_totals(conn)
    out = {
        "started": bool(row["start_date"]),
        "start_date": row["start_date"],
        "target_days": row["target_days"],
        "branch_months": row["branch_months"],
        "checkpoint_at": row["checkpoint_at"],
        "renegotiated": bool(row["renegotiated"]),
        "nodes_closed": closed,
        "nodes_total": total,
        "rate": round(current_rate(conn), 2),
    }
    if row["start_date"]:
        out["day_num"] = pace.diff_days(day, row["start_date"]) + 1
    out["checkpoint"] = checkpoint(conn, day)
    return out
