"""Сезоны и общий такт гонки.

Раздел 9 плана. Сезон длится 14 дней, между сезонами три дня межсезонья.
План бота фиксируется на старте сезона и внутри сезона не пересматривается.

Счёт сезона: XP ученика за окно против XP бота. XP бота считается ТОЛЬКО
из нодовых источников: его закрытые ноды умножаются на средний нодовый XP
ученика. Контракты, карточки, боссы, ТЗ и разборы в этот средний не входят,
и это сознательная фора: победа в сезоне покупается полной программой,
а не одними закрытыми нодами.

Такт всей фазы 5 живёт в heartbeat(): он докручивает пропущенные дни,
тикает ботом, открывает и закрывает сезоны и ловит паузу ученика.
"""

from __future__ import annotations

import datetime as dt
import random
import sqlite3

from . import bot, pace, taunts, xp
from .db import now

SEASON_DAYS = 14
OFFSEASON_DAYS = 3
# Первые дни после старта соперник просто разминается: темп ученика ещё
# не устоялся, и фиксировать по нему план сезона нечестно с обеих сторон.
WARMUP_DAYS = 3

# Множитель плана бота на сезон. Диапазон подобран симуляцией приёмки:
# на ровном темпе ученик забирает 55-65 процентов сезонов.
MULT_LO, MULT_HI = 0.95, 1.25
# После двух поражений подряд база падает до 0.85 (середина диапазона ниже).
MULT_LO_DOWN, MULT_HI_DOWN = 0.70, 1.00
LOSS_STREAK = 2

# Пока ученик не закрыл ни одной ноды, средний нодовый XP брать неоткуда.
COLD_NODE_XP = 300
# Курс пересчёта нод бота в очки держим в правдоподобных рамках. Причина в том,
# что среди нодовых причин есть бонус за блок вопросов, а он платится за день,
# а не за ноду: в сезоне, где ученик закрыл одну ноду, среднее иначе улетает
# втрое и бот получает за свои ноды несуществующие деньги.
NODE_XP_MIN, NODE_XP_MAX = 150.0, 500.0


def _fmt(value: int) -> str:
    return f"{int(value):,}".replace(",", " ")


def running(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM seasons WHERE outcome IS NULL ORDER BY num LIMIT 1").fetchone()


def last_finished(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM seasons WHERE outcome IS NOT NULL ORDER BY num DESC LIMIT 1"
    ).fetchone()


def history(conn: sqlite3.Connection, limit: int = 20) -> list[dict]:
    rows = conn.execute(
        'SELECT num, start, "end", outcome, user_xp, bot_xp, user_nodes, bot_nodes, '
        "bot_plan_rate, mult, summary FROM seasons WHERE outcome IS NOT NULL "
        "ORDER BY num DESC LIMIT ?",
        (max(1, min(limit, 100)),),
    ).fetchall()
    return [dict(r) for r in rows]


# --- счёт -----------------------------------------------------------------

def node_xp_window(conn: sqlite3.Connection, start: str, end: str) -> int:
    marks = ", ".join("?" for _ in xp.NODE_REASONS)
    return conn.execute(
        f"SELECT COALESCE(SUM(amount), 0) FROM xp_ledger "
        f"WHERE reason IN ({marks}) AND date(ts) BETWEEN ? AND ?",
        (*xp.NODE_REASONS, start, end),
    ).fetchone()[0]


def avg_node_xp(conn: sqlite3.Connection, start: str, end: str) -> float:
    """Средний нодовый XP ученика за окно. Он же курс, по которому ноды бота
    пересчитываются в его очки."""
    nodes = pace.nodes_closed_between(conn, start, end)
    total = node_xp_window(conn, start, end)
    if nodes <= 0 or total <= 0:
        return float(COLD_NODE_XP)
    return min(NODE_XP_MAX, max(NODE_XP_MIN, total / nodes))


def score(conn: sqlite3.Connection, season: sqlite3.Row, day: str | None = None) -> dict:
    start = season["start"]
    end = min(season["end"], day) if day else season["end"]
    user_xp = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM xp_ledger WHERE date(ts) BETWEEN ? AND ?",
        (start, end),
    ).fetchone()[0]
    rate = avg_node_xp(conn, start, end)
    bot_nodes = bot.nodes_between(conn, start, end)
    return {
        "user_xp": int(user_xp),
        "bot_xp": int(round(bot_nodes * rate)),
        "user_nodes": pace.nodes_closed_between(conn, start, end),
        "bot_nodes": bot_nodes,
        "avg_node_xp": round(rate, 1),
    }


# --- жизненный цикл -------------------------------------------------------

def can_start(conn: sqlite3.Connection, day: str) -> bool:
    if running(conn) is not None:
        return False
    first = pace.first_closed_day(conn)
    if first is None or pace.diff_days(day, first) < WARMUP_DAYS:
        return False
    if pace.rollout_active(conn, day):
        return False
    if pace.silence_gap(conn, day) >= pace.PAUSE_DAYS:
        return False
    last = conn.execute('SELECT "end" AS fin FROM seasons ORDER BY num DESC LIMIT 1').fetchone()
    if last is not None and pace.diff_days(day, last["fin"]) <= OFFSEASON_DAYS:
        return False
    return True


def start(conn: sqlite3.Connection, day: str, rng: random.Random) -> sqlite3.Row:
    st = bot.ensure_state(conn)
    losses = int(st["losses"])
    lo, hi = (MULT_LO_DOWN, MULT_HI_DOWN) if losses >= LOSS_STREAK else (MULT_LO, MULT_HI)
    mult = rng.uniform(lo, hi)
    # Нижнего клэмпа нет: если ученик просел, бот идёт от его текущего темпа.
    plan = min(float(st["user_rate"]) * mult, bot.BOT_RATE_CAP)
    num = (conn.execute("SELECT COALESCE(MAX(num), 0) FROM seasons").fetchone()[0]) + 1
    conn.execute(
        'INSERT INTO seasons(num, start, "end", bot_plan_rate, mult) VALUES (?, ?, ?, ?, ?)',
        (num, day, pace.shift(day, SEASON_DAYS - 1), round(plan, 3), round(mult, 3)),
    )
    bot.set_state(conn, mood="в сезоне")
    text = taunts.pick(conn, "season_start", rng)
    bot.event(conn, "season_start", f"Сезон {num}. {text}" if text else f"Сезон {num} начался.",
              ts=f"{day}T09:00:00")
    return running(conn)


def close(conn: sqlite3.Connection, season: sqlite3.Row, day: str, rng: random.Random,
          aborted: bool = False) -> dict:
    end = min(season["end"], day)
    sc = score(conn, season, end)
    if aborted:
        outcome = "aborted"
        summary = f"Сезон {season['num']} свернули без счёта: была пауза."
    elif sc["user_xp"] >= sc["bot_xp"]:
        outcome = "win"
        summary = (f"Сезон {season['num']} за тобой: "
                   f"{_fmt(sc['user_xp'])} против {_fmt(sc['bot_xp'])}.")
    else:
        outcome = "loss"
        summary = (f"Сезон {season['num']} забрал Опус: "
                   f"{_fmt(sc['bot_xp'])} против {_fmt(sc['user_xp'])}.")

    conn.execute(
        'UPDATE seasons SET "end" = ?, outcome = ?, summary = ?, user_xp = ?, bot_xp = ?, '
        "user_nodes = ?, bot_nodes = ?, avg_node_xp = ?, closed_at = ? WHERE id = ?",
        (end, outcome, summary, sc["user_xp"], sc["bot_xp"], sc["user_nodes"], sc["bot_nodes"],
         sc["avg_node_xp"], now(), season["id"]),
    )

    st = bot.ensure_state(conn)
    if outcome == "win":
        bot.set_state(conn, losses=0, mood="уязвлён")
    elif outcome == "loss":
        bot.set_state(conn, losses=int(st["losses"]) + 1, mood="доволен собой")

    kind = {"win": "season_win", "loss": "season_loss", "aborted": "season_abort"}[outcome]
    text = taunts.pick(conn, kind, rng)
    bot.event(conn, kind, f"{summary} {text}".strip(), ts=f"{end}T23:30:00")
    return {"outcome": outcome, "summary": summary, **sc}


# --- события ученика ------------------------------------------------------

EVENTS_PER_DAY = 2


def note_user_node(conn: sqlite3.Connection, day: str, rng: random.Random,
                   ts: str | None = None) -> None:
    """Отметить в ленте, что ученик закрыл ноду. Не чаще пары раз в день:
    трэш-ток хорош дозой, а не потоком."""
    seen = conn.execute(
        "SELECT COUNT(*) FROM bot_events WHERE kind = 'user_node' AND date(ts) = ?", (day,)
    ).fetchone()[0]
    if seen >= EVENTS_PER_DAY:
        return
    bot.event(conn, "user_node", taunts.pick(conn, "user_node", rng), ts=ts)


# --- такт -----------------------------------------------------------------

def _roll(conn: sqlite3.Connection, day: str, rng: random.Random) -> sqlite3.Row | None:
    season = running(conn)
    if season is not None and pace.silence_gap(conn, day) >= pace.PAUSE_DAYS:
        close(conn, season, day, rng, aborted=True)
        season = None
    if season is not None and day > season["end"]:
        close(conn, season, season["end"], rng)
        season = None
    if season is None and can_start(conn, day):
        season = start(conn, day, rng)
    return season


def _process_day(conn: sqlite3.Connection, day: str, hour: int, rng: random.Random) -> None:
    season = _roll(conn, day, rng)
    bot.plan_day(conn, day, season, rng)
    bot.run_ticks(conn, day, hour, season, rng)


def _finish_day(conn: sqlite3.Connection, day: str, rng: random.Random) -> None:
    st = bot.ensure_state(conn)
    closed = pace.nodes_closed_on(conn, day)
    bot.set_state(conn, user_rate=round(pace.step_rate(float(st["user_rate"]), closed), 4))
    if closed:
        note_user_node(conn, day, rng, ts=f"{day}T21:00:00")
    before = bot.lead(conn, pace.shift(day, -1))
    after = bot.lead(conn, day)
    if before > 0 >= after:
        bot.event(conn, "user_ahead", taunts.pick(conn, "user_ahead", rng), ts=f"{day}T23:00:00")
    elif before <= 0 < after:
        bot.event(conn, "bot_ahead", taunts.pick(conn, "bot_ahead", rng), ts=f"{day}T23:00:00")


def _check_return(conn: sqlite3.Connection, day: str, rng: random.Random) -> bool:
    """Ученик вернулся после паузы: пониженный контракт, сброс темпа бота,
    ни одного упрёка в ленте."""
    DEMO_PROJECT = pace.silence_gap(conn, day)
    if DEMO_PROJECT < pace.PAUSE_DAYS:
        return False
    row = pace.rollout_row(conn)
    if row is not None and row["since"] == day:
        return False
    pace.start_rollout(conn, day, DEMO_PROJECT)
    bot.reset_after_pause(conn, day)
    bot.event(conn, "return", taunts.pick(conn, "return", rng))
    return True


def board(conn: sqlite3.Connection, day: str | None = None) -> dict:
    """Картина гонки для экрана «Сезон». Ни ETA, ни сроков здесь нет:
    математика горизонта живёт только на карте и в чекпоинте."""
    from .db import today as _today

    day = day or _today()
    st = bot.peek(conn)
    season = running(conn)
    out: dict = {
        "date": day,
        "bot": {
            "mood": st["mood"],
            "nodes": bot.nodes_total(conn),
            "rate": round(float(st["rate"]), 2),
            "vacation_until": st["vacation_until"],
            "vacation_reason": st["vacation_reason"],
            "on_vacation": bool(st["vacation_until"]) and day <= (st["vacation_until"] or ""),
        },
        "user": {
            "nodes": pace.nodes_closed_total(conn),
            "rate": round(float(st["user_rate"]), 2),
        },
        "lead": bot.lead(conn, day),
        "lead_cap": bot.LEAD_CAP,
        "rollout": None,
        "season": None,
        "offseason": None,
        "history": history(conn, limit=10),
        "loss_streak": int(st["losses"]),
    }
    row = pace.rollout_row(conn)
    if row is not None and pace.rollout_active(conn, day):
        out["rollout"] = {
            "until": row["until"],
            "quiz": pace.ROLLOUT_QUIZ,
            "cards": pace.ROLLOUT_CARDS,
            "text": "раскатка: пара дней в половину силы, чтобы вработаться",
        }
    if season is not None:
        sc = score(conn, season, day)
        out["season"] = {
            "num": season["num"],
            "start": season["start"],
            "end": season["end"],
            "days_left": max(0, pace.diff_days(season["end"], day)),
            "day_num": pace.diff_days(day, season["start"]) + 1,
            "bot_plan_rate": round(float(season["bot_plan_rate"] or 0), 2),
            **sc,
            "ahead": "ты" if sc["user_xp"] >= sc["bot_xp"] else "Опус",
        }
    else:
        last = conn.execute(
            'SELECT num, "end" AS fin FROM seasons ORDER BY num DESC LIMIT 1'
        ).fetchone()
        if last is not None:
            resume = pace.shift(last["fin"], OFFSEASON_DAYS + 1)
            out["offseason"] = {
                "since": last["fin"],
                "next_start": resume,
                "days_left": max(0, pace.diff_days(resume, day)),
                "text": "межсезонье: отдых, итоги и разбор",
            }
        else:
            # Первого сезона ещё не было: идёт разминка. Молчать про это нечестно,
            # человек ждёт соперника, а тот по проекту сперва смотрит на темп.
            first = pace.first_closed_day(conn)
            if first is None:
                text = "Опус ждёт первой закрытой ноды: пока считать нечего"
                start_day, left = None, None
            else:
                left = max(0, WARMUP_DAYS - pace.diff_days(day, first))
                start_day = pace.shift(first, WARMUP_DAYS)
                text = (f"разминка: Опус смотрит на твой темп, гонка стартует {start_day}"
                        if left else "разминка закончена, сезон стартует сегодня")
            out["offseason"] = {
                "since": None, "next_start": start_day, "days_left": left,
                "warmup": True, "text": text,
            }
    out["feed"] = feed(conn, limit=12)
    return out


def feed(conn: sqlite3.Connection, limit: int = 20) -> list[dict]:
    rows = conn.execute(
        "SELECT ts, kind, text FROM bot_events ORDER BY id DESC LIMIT ?",
        (max(1, min(limit, 200)),),
    ).fetchall()
    return [dict(r) for r in rows]


def heartbeat(conn: sqlite3.Connection, at: dt.datetime | None = None, present: bool = False,
              rng: random.Random | None = None) -> dict:
    """Догнать гонку до текущего момента.

    present=True означает, что ученик прямо сейчас перед экраном: только тогда
    включается раскатка, потому что «вернулся» это про человека, а не про таймер.
    """
    at = at or dt.datetime.now()
    day = at.date().isoformat()
    rng = rng or random.Random()

    first = pace.first_closed_day(conn)
    if first is None:
        # Соперника нет, пока нет первой закрытой ноды: гонка с пустотой
        # это не мотивация, а издевательство. И база при этом остаётся чистой,
        # ни одной служебной строки до старта гонки не появляется.
        return {"idle": True}

    # Такт зовут сразу несколько мест: экран «Сегодня», экран «Сезон» (он тянет
    # две ручки разом), CLI. FastAPI гоняет синхронные обработчики в пуле потоков,
    # так что два такта на один день это не теория. Опасность в том, что двое
    # прокрутят EMA за один и тот же день, а это тихий сдвиг баланса без ошибки
    # в логе. Проверка показала, что сейчас порядок спасает случайно: первая же
    # операция ниже это запись, и SQLite сам разводит писателей по очереди.
    # Явная блокировка делает то же самое намеренно, чтобы правка порядка строк
    # однажды не сломала счёт молча. busy_timeout стоит в db.connect,
    # поэтому второй просто подождёт и увидит уже сделанную работу.
    holder = not conn.in_transaction
    if holder:
        conn.execute("BEGIN IMMEDIATE")
    try:
        st = bot.ensure_state(conn)
        taunts.ensure_pack(conn)
        if not st["last_day"]:
            bot.set_state(conn, last_day=pace.shift(first, -1),
                          user_rate=max(pace.RATE_FLOOR,
                                        float(pace.nodes_closed_on(conn, first))))
            st = bot.ensure_state(conn)

        cur = pace.shift(st["last_day"], 1)
        guard = 0
        while cur <= day and guard < 4000:
            guard += 1
            full = cur < day
            _process_day(conn, cur, 23 if full else at.hour, rng)
            if full:
                _finish_day(conn, cur, rng)
                bot.set_state(conn, last_day=cur)
            cur = pace.shift(cur, 1)

        if present:
            _check_return(conn, day, rng)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"idle": False}
