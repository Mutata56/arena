"""Начисление XP и дневной журнал.

Ставки взяты из раздела 5 плана. Словарь причин общий на весь продукт: по нему
сезонный счёт отбирает нодовый XP (раздел 9), поэтому свободный текст сюда не пишем.
"""

from __future__ import annotations

import sqlite3

from .db import now, today

# Причина начисления. Первая группа это нодовый XP (из него считается счёт бота
# в сезоне, раздел 9), вторая это фора ученика.
QUIZ_FIRST = "quiz_first"
QUIZ_REPEAT = "quiz_repeat"
QUIZ_BLOCK = "quiz_block"
READCODE = "readcode"
CODE = "code"
NODE_CLOSED = "node_closed"

CARD = "card"
CONTRACT = "contract"
ARTICLE = "article"
JAVARUSH = "javarush"
BOSS = "boss"
DEFENSE = "defense"
TZ = "tz"
REVIEW = "review"
FIELD_BOSS = "field_boss"

NODE_REASONS = (QUIZ_FIRST, QUIZ_REPEAT, QUIZ_BLOCK, READCODE, CODE, NODE_CLOSED)

AMOUNTS = {
    QUIZ_FIRST: 10,
    QUIZ_REPEAT: 2,
    QUIZ_BLOCK: 30,
    CARD: 5,
    CONTRACT: 50,
    NODE_CLOSED: 100,
    ARTICLE: 80,
    JAVARUSH: 20,
    REVIEW: 30,
    FIELD_BOSS: 500,
    # ТЗ этапа: тысяча за принятый проект плюс до трёхсот за качество по ревью
    # (бонус считает tz.quality_bonus и платит одной строкой вместе с базой).
    TZ: 1000,
}

# Микрозадачка кода платит по сложности (раздел 5 плана), поэтому живёт отдельно
# от плоского словаря ставок.
CODE_AMOUNTS = {0: 60, 1: 100, 2: 150}

# Босс платит по рангу. Ранг C это провал, и он тоже платит: 100 за разведку боем,
# потому что после провала ученик знает карту своих дыр (раздел 7).
BOSS_RANK_XP = {"S": 800, "A": 500, "B": 300, "C": 100}
# Защита: сумма баллов рубрики, нормированная к сотне (раздел 8).
DEFENSE_MAX = 100


def code_amount(difficulty: int) -> int:
    return CODE_AMOUNTS.get(int(difficulty or 0), CODE_AMOUNTS[0])


def already_paid(conn: sqlite3.Connection, reason: str, ref_type: str, ref_id: int) -> bool:
    """Общее правило анти-фарма: атом платит один раз за первое прохождение."""
    return conn.execute(
        "SELECT COUNT(*) FROM xp_ledger WHERE reason = ? AND ref_type = ? AND ref_id = ?",
        (reason, ref_type, ref_id),
    ).fetchone()[0] > 0


def paid_today(conn: sqlite3.Connection, ref_type: str, ref_id: int, day: str | None = None,
               reasons: tuple[str, ...] = (QUIZ_FIRST, QUIZ_REPEAT)) -> bool:
    """Заплатили ли уже сегодня за этот атом. Важно, что счёт идёт по деньгам,
    а не по попыткам: промах ничего не платит, поэтому не должен закрывать
    возможность заработать, когда ученик разобрался и ответил верно."""
    day = day or today()
    marks = ",".join("?" * len(reasons))
    return conn.execute(
        f"SELECT COUNT(*) FROM xp_ledger WHERE ref_type = ? AND ref_id = ? AND date(ts) = ? "
        f"AND reason IN ({marks})",
        (ref_type, ref_id, day, *reasons),
    ).fetchone()[0] > 0


def award(conn: sqlite3.Connection, amount: int, reason: str, ref_type: str | None = None,
          ref_id: int | None = None, day: str | None = None) -> int:
    """Записать начисление в леджер и в дневной счётчик. Возвращает начисленное."""
    if amount == 0:
        return 0
    day = day or today()
    conn.execute(
        "INSERT INTO xp_ledger(ts, amount, reason, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)",
        (now(), amount, reason, ref_type, ref_id),
    )
    ensure_day(conn, day)
    conn.execute("UPDATE days SET xp = xp + ? WHERE date = ?", (amount, day))
    return amount


def ensure_day(conn: sqlite3.Connection, day: str) -> None:
    conn.execute("INSERT INTO days(date) VALUES (?) ON CONFLICT(date) DO NOTHING", (day,))


def bump(conn: sqlite3.Connection, day: str, field: str, delta: int = 1) -> None:
    if field not in ("quiz_count", "cards_count", "code_count", "nodes_closed"):
        raise ValueError(f"нет такого счётчика дня: {field}")
    ensure_day(conn, day)
    conn.execute(f"UPDATE days SET {field} = {field} + ? WHERE date = ?", (delta, day))


def totals(conn: sqlite3.Connection, day: str | None = None) -> dict:
    day = day or today()
    total = conn.execute("SELECT COALESCE(SUM(amount), 0) FROM xp_ledger").fetchone()[0]
    row = conn.execute("SELECT xp FROM days WHERE date = ?", (day,)).fetchone()
    return {"total": total, "today": row["xp"] if row else 0}


def streak(conn: sqlite3.Connection, day: str) -> int:
    """Сколько дней подряд закрыт контракт, считая назад от сегодня.

    Вчерашний хвост тоже считается: день ещё не прожит, и обнулять серию с утра
    было бы ровно тем счётчиком вины, который запрещён разделом 6.
    """
    rows = {
        r["date"]: r["contract_done"]
        for r in conn.execute("SELECT date, contract_done FROM days WHERE date <= ?", (day,))
    }
    import datetime as dt

    cursor = dt.date.fromisoformat(day)
    if not rows.get(cursor.isoformat()):
        cursor -= dt.timedelta(days=1)
    count = 0
    while rows.get(cursor.isoformat()):
        count += 1
        cursor -= dt.timedelta(days=1)
    return count
