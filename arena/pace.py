"""Темп ученика, паузы и раскатка.

Всё, что описывает ритм самого demo_user: сколько нод в день он закрывает,
когда он пропал и что делать, когда вернулся. Соперник и сезоны читают отсюда,
своих счётчиков не заводят.

Раздел 6 плана (раскатка) и первый блок раздела 9 (темп), плюс строка ETA:
математика горизонта живёт ровно в двух местах, на карте и в окне чекпоинта,
и всегда в виде даты, а не процентов и не слова «отставание».
"""

from __future__ import annotations

import datetime as dt
import sqlite3

# EMA закрытых нод в день. Альфа сама задаёт окно, поэтому «EMA за 14 дней»
# нигде не пишем: это разные вещи и путаница в формулировке уже стоила ревью времени.
EMA_ALPHA = 0.2
RATE_FLOOR = 0.5

# Пауза: столько дней без единого касания, и это уже не «занят», а «пропал».
PAUSE_DAYS = 4
# Раскатка: пониженный контракт на два дня после возвращения.
ROLLOUT_DAYS = 2
ROLLOUT_QUIZ = 5
ROLLOUT_CARDS = 5


def to_date(day: str) -> dt.date:
    return dt.date.fromisoformat(day)


def shift(day: str, days: int) -> str:
    return (to_date(day) + dt.timedelta(days=days)).isoformat()


def diff_days(later: str, earlier: str) -> int:
    return (to_date(later) - to_date(earlier)).days


def first_closed_day(conn: sqlite3.Connection) -> str | None:
    """День, когда ученик закрыл первую ноду. До него соперника не существует:
    гонка без единой закрытой ноды это гонка с пустотой."""
    row = conn.execute(
        "SELECT MIN(date(closed_at)) FROM nodes WHERE status = 'closed' AND closed_at IS NOT NULL"
    ).fetchone()
    return row[0] if row and row[0] else None


def nodes_closed_on(conn: sqlite3.Connection, day: str) -> int:
    """Ноды берём по closed_at, а не по счётчику дня: closed_at пишет тот,
    кто реально закрывает ноду, и это не зависит от того, дошли ли руки
    до дневных счётчиков."""
    return conn.execute(
        "SELECT COUNT(*) FROM nodes WHERE status = 'closed' AND date(closed_at) = ?", (day,)
    ).fetchone()[0]


def nodes_closed_between(conn: sqlite3.Connection, start: str, end: str) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM nodes WHERE status = 'closed' AND date(closed_at) BETWEEN ? AND ?",
        (start, end),
    ).fetchone()[0]


def nodes_closed_total(conn: sqlite3.Connection, until: str | None = None) -> int:
    if until is None:
        return conn.execute("SELECT COUNT(*) FROM nodes WHERE status = 'closed'").fetchone()[0]
    return conn.execute(
        "SELECT COUNT(*) FROM nodes WHERE status = 'closed' AND date(closed_at) <= ?", (until,)
    ).fetchone()[0]


def last_active_day(conn: sqlite3.Connection, until: str) -> str | None:
    """Последний день, в который ученик хоть что-то сделал.

    Пустая строка в days не считается активностью: её заводит само открытие
    экрана «Сегодня», и по ней нельзя судить, занимался человек или просто
    посмотрел на заголовок.
    """
    row = conn.execute(
        "SELECT MAX(date) FROM days WHERE date <= ? AND ("
        " contract_done = 1 OR quiz_count > 0 OR cards_count > 0"
        " OR code_count > 0 OR nodes_closed > 0)",
        (until,),
    ).fetchone()
    if row and row[0]:
        return row[0]
    # Резерв на случай, если дневные счётчики ещё не ведутся: закрытая нода
    # это тоже несомненная активность.
    row = conn.execute(
        "SELECT MAX(date(closed_at)) FROM nodes WHERE status = 'closed' AND date(closed_at) <= ?",
        (until,),
    ).fetchone()
    return row[0] if row and row[0] else None


def silence_gap(conn: sqlite3.Connection, day: str) -> int:
    """Сколько дней прошло с последнего живого дня. Ноль это «сегодня занимался»."""
    last = last_active_day(conn, day)
    if last is None:
        return 0
    return max(0, diff_days(day, last))


def step_rate(rate: float, nodes: int) -> float:
    """Один шаг EMA. Пол в 0.5 держит темп от падения в ноль: гонка,
    в которой соперник стоит намертво, перестаёт быть гонкой."""
    return max(RATE_FLOOR, EMA_ALPHA * nodes + (1 - EMA_ALPHA) * rate)


# --- раскатка -------------------------------------------------------------

def rollout_row(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM rollout WHERE id = 1").fetchone()


def rollout_active(conn: sqlite3.Connection, day: str) -> bool:
    row = rollout_row(conn)
    if row is None or not row["until"] or not row["since"]:
        return False
    return row["since"] <= day <= row["until"]


def start_rollout(conn: sqlite3.Connection, day: str, DEMO_PROJECT: int) -> None:
    conn.execute(
        "INSERT INTO rollout(id, since, until, gap_days) VALUES (1, ?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET since=excluded.since, until=excluded.until, "
        "gap_days=excluded.gap_days",
        (day, shift(day, ROLLOUT_DAYS - 1), DEMO_PROJECT),
    )


def contract_caps(conn: sqlite3.Connection, day: str) -> tuple[int, int]:
    """Потолки дневного контракта. В раскатке они ниже: вернуться должно быть
    легко, а не страшно."""
    from .contract import CARDS_TARGET, QUIZ_TARGET

    if rollout_active(conn, day):
        return ROLLOUT_QUIZ, ROLLOUT_CARDS
    return QUIZ_TARGET, CARDS_TARGET


# Синоним для читаемости в блоке ETA.
ALPHA = EMA_ALPHA
RATE_FLOOR = 0.5
# Пока темпа нет, дата была бы выдумкой на четыре года вперёд, а это ровно тот
# разговор, который раздел 9 запрещает. Показываем ETA, когда есть за что зацепиться.
MIN_DAYS = 3
MIN_CLOSED = 2

MONTHS_TO = (
    "январю", "февралю", "марту", "апрелю", "маю", "июню",
    "июлю", "августу", "сентябрю", "октябрю", "ноябрю", "декабрю",
)


def closed_by_day(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        r["date"]: r["nodes_closed"]
        for r in conn.execute("SELECT date, nodes_closed FROM days ORDER BY date")
    }


def user_rate(conn: sqlite3.Connection, day: str | None = None) -> float:
    """Сколько нод в день ученик закрывает по ощущению последних недель."""
    day = day or dt.date.today().isoformat()
    per_day = closed_by_day(conn)
    if not per_day:
        return RATE_FLOOR
    start = dt.date.fromisoformat(min(per_day))
    end = dt.date.fromisoformat(day)
    if end < start:
        end = start
    rate = float(per_day.get(start.isoformat(), 0))
    cursor = start + dt.timedelta(days=1)
    while cursor <= end:
        rate = ALPHA * per_day.get(cursor.isoformat(), 0) + (1 - ALPHA) * rate
        cursor += dt.timedelta(days=1)
    return max(RATE_FLOOR, rate)


def track_left(conn: sqlite3.Connection) -> tuple[int, int]:
    """Сколько нод собесного минимума закрыто и сколько всего."""
    row = conn.execute(
        "SELECT COUNT(*) AS total, "
        "  COALESCE(SUM(CASE WHEN n.status = 'closed' THEN 1 ELSE 0 END), 0) AS closed "
        "FROM nodes n JOIN stages s ON s.id = n.stage_id WHERE s.in_track = 1"
    ).fetchone()
    return row["closed"], row["total"]


def eta(conn: sqlite3.Connection, day: str | None = None) -> dict:
    """Строка горизонта для вкладки «Карта»."""
    day = day or dt.date.today().isoformat()
    closed, total = track_left(conn)
    left = max(0, total - closed)
    if left == 0 and total:
        return {"ready": True, "text": "собесный минимум пройден целиком", "date": None}

    active_days = conn.execute(
        "SELECT COUNT(*) FROM days WHERE quiz_count + cards_count + nodes_closed > 0"
    ).fetchone()[0]
    if active_days < MIN_DAYS or closed < MIN_CLOSED:
        return {
            "ready": False,
            "text": "дата финиша появится, когда наберётся темп",
            "date": None,
        }

    rate = user_rate(conn, day)
    finish = dt.date.fromisoformat(day) + dt.timedelta(days=int(round(left / rate)))
    return {
        "ready": True,
        "text": f"при текущем темпе финиш примерно к {MONTHS_TO[finish.month - 1]} {finish.year}",
        "date": finish.isoformat(),
    }
