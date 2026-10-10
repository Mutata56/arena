"""Опус: состояние соперника, дневной план и тики.

Раздел 9 плана. Числа стартовые, финальная калибровка сделана симуляцией
в приёмке фазы 5, подобранные значения записаны в STATUS-5.md.

Главная инварианта продукта: разрыв в пользу бота никогда не превышает LEAD_CAP.
Разгромный счёт демотивирует, а демотивация здесь стоит дороже честности бота,
поэтому потолок жёсткий и работает и внутри сезона тоже. Внутри сезона он
не трогает план бота (план честный и зафиксирован на старте), он лишь не даёт
боту закрывать ноды дальше потолка: бот «застревает на сложной теме».
"""

from __future__ import annotations

import json
import math
import random
import sqlite3

from . import pace, taunts
from .db import now

# База бота: чуть быстрее ученика. Нижнего клэмпа нет намеренно, при слабой
# неделе ученика бот тоже замедляется.
BOT_BASE = 1.05
BOT_RATE_CAP = 6.0

# Потолки разрыва в нодах.
LEAD_CAP = 15
# Внутри сезона отрыв ограничен ещё и относительно: бот не убегает дальше,
# чем на долю от сделанного учеником. Абсолютного потолка тут мало, потому что
# восемь нод отрыва при двух закрытых у ученика это уже разгром, а при тридцати
# закрытых это нормальная гонка.
SEASON_LEAD_CAP = 8
SEASON_LEAD_MIN = 4
SEASON_LEAD_SHARE = 0.6

# Резинка вне сезона.
USER_AHEAD_FOR_BOOST = 10
BOOST = 1.2

# Шум дневного плана и расписание тиков.
NOISE = 0.30
TICK_HOURS = (9, 11, 13, 15, 17, 19, 21, 23)
TICKS_MIN, TICKS_MAX = 2, 4
VACATION_MIN, VACATION_MAX = 2, 4


DEFAULT_STATE = {
    "id": 1, "rate": 1.0, "mood": None, "nodes_closed": 0, "last_tick": None,
    "vacation_until": None, "user_rate": pace.RATE_FLOOR, "carry": 0.0,
    "last_day": None, "losses": 0, "vacation_reason": None,
}


def ensure_state(conn: sqlite3.Connection) -> sqlite3.Row:
    conn.execute("INSERT INTO bot_state(id) VALUES (1) ON CONFLICT(id) DO NOTHING")
    return conn.execute("SELECT * FROM bot_state WHERE id = 1").fetchone()


def peek(conn: sqlite3.Connection) -> dict:
    """Прочитать состояние, ничего не создавая. Пока гонка не началась,
    база не должна обрастать служебными строками от одного взгляда на неё."""
    row = conn.execute("SELECT * FROM bot_state WHERE id = 1").fetchone()
    return dict(row) if row is not None else dict(DEFAULT_STATE)


def set_state(conn: sqlite3.Connection, **fields) -> None:
    if not fields:
        return
    cols = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE bot_state SET {cols} WHERE id = 1", tuple(fields.values()))


def event(conn: sqlite3.Connection, kind: str, text: str, ts: str | None = None,
          xp: int = 0) -> None:
    if not text:
        return
    conn.execute(
        "INSERT INTO bot_events(ts, kind, text, xp) VALUES (?, ?, ?, ?)",
        (ts or now(), kind, text, xp),
    )


def nodes_total(conn: sqlite3.Connection, until: str | None = None) -> int:
    if until is None:
        return conn.execute("SELECT COALESCE(SUM(done), 0) FROM bot_days").fetchone()[0]
    return conn.execute(
        "SELECT COALESCE(SUM(done), 0) FROM bot_days WHERE date <= ?", (until,)
    ).fetchone()[0]


def nodes_between(conn: sqlite3.Connection, start: str, end: str) -> int:
    return conn.execute(
        "SELECT COALESCE(SUM(done), 0) FROM bot_days WHERE date BETWEEN ? AND ?", (start, end)
    ).fetchone()[0]


def lead(conn: sqlite3.Connection, day: str) -> int:
    """Разрыв в нодах на конец дня. Плюс это бот впереди."""
    return nodes_total(conn, day) - pace.nodes_closed_total(conn, day)


def season_lead(conn: sqlite3.Connection, season: sqlite3.Row | None, day: str) -> int:
    if season is None:
        return 0
    return (nodes_between(conn, season["start"], day)
            - pace.nodes_closed_between(conn, season["start"], day))


def season_room(conn: sqlite3.Connection, season: sqlite3.Row, day: str) -> int:
    """Сколько нод бот ещё вправе оторвать внутри сезона."""
    mine = pace.nodes_closed_between(conn, season["start"], day)
    allowed = min(SEASON_LEAD_CAP, max(SEASON_LEAD_MIN, math.ceil(mine * SEASON_LEAD_SHARE)))
    return allowed - season_lead(conn, season, day)


def _schedule(target: int, rng: random.Random) -> list[dict]:
    """Разложить дневную норму по 2-4 тикам в живые часы."""
    count = rng.randint(TICKS_MIN, TICKS_MAX)
    hours = sorted(rng.sample(TICK_HOURS, count))
    plan = [0] * count
    for _ in range(target):
        plan[rng.randrange(count)] += 1
    return [{"h": h, "n": n, "d": 0} for h, n in zip(hours, plan)]


def plan_day(conn: sqlite3.Connection, day: str, season: sqlite3.Row | None,
             rng: random.Random) -> sqlite3.Row:
    """Назначить боту норму на день. Идемпотентно: строка дня создаётся один раз."""
    row = conn.execute("SELECT * FROM bot_days WHERE date = ?", (day,)).fetchone()
    if row is not None:
        return row
    st = ensure_state(conn)

    on_vacation = bool(st["vacation_until"]) and day <= st["vacation_until"]
    if season is None and not on_vacation:
        # Резинка работает только вне сезона: внутри сезона план честный.
        DEMO_PROJECT = lead(conn, pace.shift(day, -1))
        if DEMO_PROJECT >= LEAD_CAP:
            until = pace.shift(day, rng.randint(VACATION_MIN, VACATION_MAX))
            reason = taunts.pick(conn, "vacation", rng)
            set_state(conn, vacation_until=until, vacation_reason=reason, mood="отпуск")
            event(conn, "vacation", reason, ts=f"{day}T09:00:00")
            on_vacation = True

    if on_vacation:
        plan = 0.0
    elif season is not None:
        plan = float(season["bot_plan_rate"] or 0.0)
    else:
        plan = min(float(st["user_rate"]) * BOT_BASE, BOT_RATE_CAP)
        if lead(conn, pace.shift(day, -1)) <= -USER_AHEAD_FOR_BOOST:
            plan *= BOOST
            if st["mood"] != "разогнался":
                set_state(conn, mood="разогнался")
                event(conn, "boost", taunts.pick(conn, "boost", rng), ts=f"{day}T09:30:00")
        plan = min(plan, BOT_RATE_CAP)

    noisy = max(0.0, plan * (1 + rng.uniform(-NOISE, NOISE)))
    carry = float(st["carry"]) + noisy
    target = int(carry)
    carry -= target
    set_state(conn, carry=carry, rate=plan)
    conn.execute(
        "INSERT INTO bot_days(date, plan, target, done, schedule, season_id) "
        "VALUES (?, ?, ?, 0, ?, ?)",
        (day, noisy, target, json.dumps(_schedule(target, rng)),
         season["id"] if season is not None else None),
    )
    return conn.execute("SELECT * FROM bot_days WHERE date = ?", (day,)).fetchone()


def run_ticks(conn: sqlite3.Connection, day: str, hour: int, season: sqlite3.Row | None,
              rng: random.Random) -> int:
    """Отработать тики дня до указаны часа. Возвращает закрытые ноды."""
    row = conn.execute("SELECT * FROM bot_days WHERE date = ?", (day,)).fetchone()
    if row is None:
        return 0
    schedule = json.loads(row["schedule"] or "[]")
    done_now = 0
    for tick in schedule:
        if tick["d"] or tick["h"] > hour:
            continue
        tick["d"] = 1
        want = int(tick["n"])
        if want <= 0:
            continue
        room = LEAD_CAP - lead(conn, day)
        if season is not None:
            room = min(room, season_room(conn, season, day))
        take = max(0, min(want, room))
        if take == 0:
            # Бот упёрся в потолок разрыва. Молча: пустое хвастовство про
            # ноду, которой не было, ленту только засорит.
            continue
        conn.execute("UPDATE bot_days SET done = done + ? WHERE date = ?", (take, day))
        conn.execute("UPDATE bot_state SET nodes_closed = nodes_closed + ? WHERE id = 1", (take,))
        event(conn, "bot_node", taunts.pick(conn, "bot_node", rng),
              ts=f"{day}T{tick['h']:02d}:00:00")
        done_now += take
    conn.execute("UPDATE bot_days SET schedule = ? WHERE date = ?",
                 (json.dumps(schedule), day))
    if done_now:
        set_state(conn, last_tick=f"{day}T{hour:02d}:00:00")
    return done_now


def reset_after_pause(conn: sqlite3.Connection, day: str) -> float:
    """Сброс темпа после паузы ученика. Бот выходит из отпуска и начинает
    заново от текущего (упавшего) темпа ученика, без накопленного долга."""
    st = ensure_state(conn)
    rate = min(max(pace.RATE_FLOOR, float(st["user_rate"])) * BOT_BASE, BOT_RATE_CAP)
    set_state(conn, rate=rate, carry=0.0, vacation_until=None, vacation_reason=None,
              mood="раскатка")
    return rate
