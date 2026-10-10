"""Сводка по базе: что синкнулось, что импортировалось, что уже пройдено.

Здесь же живёт содержимое вкладки «статистика»: XP по дням, теплокарта занятий,
точность по темам, история сезонов, боссов и собеседований.

Правило тона на всю вкладку одно и оно из разделов 6 и 9 плана: считаем в штуках,
показываем только то, что случилось. Пустой день в теплокарте это просто пустая
клетка, а не укор; сколько карточек просрочено и на сколько ты отстал от какого-то
темпа, продукт не считает нигде и не покажет.
"""

from __future__ import annotations

import datetime as dt
import sqlite3

from . import field as field_mod
from . import pace as pace_mod
from . import seasons as seasons_mod
from . import xp as xp_mod
from .config import Config
from .db import scalar, today as today_str


# Сколько дней показываем. График это последний месяц с хвостиком, теплокарта
# семнадцать недель: столько влезает в строку на ноутбуке без прокрутки.
CHART_DAYS = 35
HEAT_WEEKS = 17
# Порог по атомам, с которого клетка теплокарты становится следующей ступенью.
# Ступеней четыре, пустая клетка это ноль и никакого цвета.
HEAT_STEPS = (1, 5, 10, 20)
TOPIC_LIMIT = 12
TOPIC_MIN_ANSWERS = 3


def day_rows(conn: sqlite3.Connection, since: str, until: str) -> dict[str, sqlite3.Row]:
    rows = conn.execute(
        "SELECT date, xp, quiz_count, cards_count, code_count, nodes_closed, contract_done "
        "FROM days WHERE date BETWEEN ? AND ?",
        (since, until),
    ).fetchall()
    return {r["date"]: r for r in rows}


def _atoms(row: sqlite3.Row | None) -> int:
    if row is None:
        return 0
    return row["quiz_count"] + row["cards_count"] + row["code_count"]


def heat_level(atoms: int) -> int:
    level = 0
    for step in HEAT_STEPS:
        if atoms >= step:
            level += 1
    return level


def chart(conn: sqlite3.Connection, today: str, days: int = CHART_DAYS) -> list[dict]:
    """XP по дням. День без занятий отдаём нулём: на графике это просто пусто."""
    last = dt.date.fromisoformat(today)
    first = last - dt.timedelta(days=days - 1)
    rows = day_rows(conn, first.isoformat(), last.isoformat())
    out = []
    for i in range(days):
        date = (first + dt.timedelta(days=i)).isoformat()
        row = rows.get(date)
        out.append({
            "date": date,
            "xp": row["xp"] if row else 0,
            "green": bool(row["contract_done"]) if row else False,
        })
    return out


def heatmap(conn: sqlite3.Connection, today: str, weeks: int = HEAT_WEEKS) -> dict:
    """Теплокарта занятий по неделям, свежая неделя справа.

    Считаем атомы (вопросы, карточки, задачи), а не минуты: минут продукт не меряет.
    Ни одного счётчика пропущенного здесь нет и быть не может.
    """
    last = dt.date.fromisoformat(today)
    # Неделя начинается с понедельника, крайняя справа это текущая.
    week_start = last - dt.timedelta(days=last.weekday())
    first = week_start - dt.timedelta(weeks=weeks - 1)
    rows = day_rows(conn, first.isoformat(), last.isoformat())
    grid = []
    for w in range(weeks):
        column = []
        for d in range(7):
            date = first + dt.timedelta(weeks=w, days=d)
            if date > last:
                column.append(None)
                continue
            row = rows.get(date.isoformat())
            atoms = _atoms(row)
            column.append({
                "date": date.isoformat(),
                "atoms": atoms,
                "xp": row["xp"] if row else 0,
                "quiz": row["quiz_count"] if row else 0,
                "cards": row["cards_count"] if row else 0,
                "code": row["code_count"] if row else 0,
                "nodes": row["nodes_closed"] if row else 0,
                "green": bool(row["contract_done"]) if row else False,
                "level": heat_level(atoms),
            })
        grid.append(column)
    busy = sum(1 for col in grid for cell in col if cell and cell["atoms"] > 0)
    return {"weeks": grid, "from": first.isoformat(), "to": last.isoformat(), "busy_days": busy}


def topics(conn: sqlite3.Connection, limit: int = TOPIC_LIMIT) -> list[dict]:
    """Точность по темам в штуках.

    Только ежедневная петля: у ответов на бою свой вид (kind='boss'), и мешать
    экзамен с учёбой нельзя, иначе непонятно, что именно за число ты смотришь.
    """
    rows = conn.execute(
        "SELECT json_extract(i.payload, '$.topic') AS topic, "
        "       COUNT(*) AS total, SUM(a.correct) AS right_ "
        "FROM attempts a JOIN items i ON i.id = a.item_id "
        "WHERE a.kind = 'quiz' AND i.type = 'quiz' "
        "GROUP BY topic HAVING topic IS NOT NULL AND topic <> '' AND total >= ? "
        "ORDER BY (total - right_) DESC, total DESC LIMIT ?",
        (TOPIC_MIN_ANSWERS, max(1, limit)),
    ).fetchall()
    return [
        {"topic": r["topic"], "total": r["total"], "right": r["right_"] or 0,
         "wrong": r["total"] - (r["right_"] or 0)}
        for r in rows
    ]


def boss_history(conn: sqlite3.Connection, limit: int = 20) -> list[dict]:
    rows = conn.execute(
        "SELECT b.id, b.attempt_no, b.rank, b.passed, b.xp, b.ts, b.quiz_correct, b.quiz_total, "
        "       b.code_green, b.code_total, s.num AS stage_num, s.title AS stage_title "
        "FROM bosses b LEFT JOIN stages s ON s.id = b.stage_id "
        "WHERE b.kind = 'stage' AND b.status = 'done' ORDER BY b.id DESC LIMIT ?",
        (max(1, limit),),
    ).fetchall()
    return [dict(r) for r in rows]


def board(conn: sqlite3.Connection, today: str | None = None) -> dict:
    """Всё, что показывает вкладка «статистика»."""
    day = today or today_str()
    answered = scalar(conn, "SELECT COUNT(*) FROM attempts WHERE kind = 'quiz'")
    right = scalar(conn, "SELECT COUNT(*) FROM attempts WHERE kind = 'quiz' AND correct = 1")
    closed, total = pace_mod.track_left(conn)
    return {
        "xp_total": scalar(conn, "SELECT COALESCE(SUM(amount), 0) FROM xp_ledger"),
        "green_days": scalar(conn, "SELECT COUNT(*) FROM days WHERE contract_done = 1"),
        "streak": xp_mod.streak(conn, day),
        "nodes_closed": scalar(conn, "SELECT COUNT(*) FROM nodes WHERE status = 'closed'"),
        "track": {"closed": closed, "total": total},
        "cards_reviewed": scalar(conn, "SELECT COUNT(*) FROM attempts WHERE kind = 'card'"),
        "quiz_answered": answered,
        "quiz_right": right,
        "code_done": scalar(conn, "SELECT COUNT(*) FROM code_tasks WHERE passed_at IS NOT NULL"),
        "tz_accepted": scalar(conn, "SELECT COUNT(*) FROM tz_projects WHERE status = 'accepted'"),
        "chart": chart(conn, day),
        "heat": heatmap(conn, day),
        "topics": topics(conn),
        "seasons": seasons_mod.history(conn, limit=10),
        "bosses": boss_history(conn),
        "field": field_mod.history(conn),
        "javarush": field_mod.deed_state(conn, day),
    }


def render(conn: sqlite3.Connection, cfg: Config, full: bool = False) -> str:
    out: list[str] = [cfg.describe(), ""]

    stages = scalar(conn, "SELECT COUNT(*) FROM stages")
    nodes = scalar(conn, "SELECT COUNT(*) FROM nodes")
    track = scalar(conn, "SELECT COUNT(*) FROM nodes n JOIN stages s ON s.id = n.stage_id WHERE s.in_track = 1")
    with_file = scalar(conn, "SELECT COUNT(*) FROM nodes WHERE obsidian_path IS NOT NULL")
    no_kind = scalar(conn, "SELECT COUNT(*) FROM nodes WHERE kind IS NULL OR kind = ''")
    out.append(f"этапов {stages}, нод {nodes} (в траектории {track}), с конспектом {with_file}")
    if no_kind:
        out.append(f"ВНИМАНИЕ: нод без типа {no_kind}")

    statuses = conn.execute(
        "SELECT status, COUNT(*) c FROM nodes GROUP BY status ORDER BY c DESC"
    ).fetchall()
    out.append("статусы нод: " + ", ".join(f"{r['status']} {r['c']}" for r in statuses))

    kinds = conn.execute("SELECT kind, COUNT(*) c FROM nodes GROUP BY kind ORDER BY c DESC").fetchall()
    out.append("типы нод: " + ", ".join(f"{r['kind']} {r['c']}" for r in kinds))
    out.append("")

    items = scalar(conn, "SELECT COUNT(*) FROM items")
    by_type = conn.execute(
        "SELECT type, source, COUNT(*) c FROM items GROUP BY type, source ORDER BY type, source"
    ).fetchall()
    out.append(f"банк контента: {items} записей")
    for r in by_type:
        out.append(f"  {r['type']:9s} {r['source']:7s} {r['c']}")
    bound = scalar(conn, "SELECT COUNT(*) FROM items WHERE type='quiz' AND node_id IS NOT NULL")
    quizzes = scalar(conn, "SELECT COUNT(*) FROM items WHERE type='quiz'")
    if quizzes:
        out.append(f"  квизов привязано к нодам: {bound}, на уровне этапа: {quizzes - bound}")
    # localtime обязателен: date('now') в SQLite это UTC, а demo_user занимается ночью,
    # когда локальная дата уже следующая.
    cards_due = scalar(
        conn, "SELECT COUNT(*) FROM card_state WHERE due IS NOT NULL AND due <= date('now', 'localtime')"
    )
    cards = scalar(conn, "SELECT COUNT(*) FROM card_state")
    if cards:
        out.append(f"  карточек {cards}, из них созрело {cards_due}")
    code_total = scalar(conn, "SELECT COUNT(*) FROM items WHERE type='code'")
    if code_total:
        code_done = scalar(conn, "SELECT COUNT(*) FROM code_tasks WHERE passed_at IS NOT NULL")
        out.append(f"  код-задач {code_total}, сдано {code_done}")
    out.append("")

    xp = scalar(conn, "SELECT COALESCE(SUM(amount), 0) FROM xp_ledger")
    attempts = scalar(conn, "SELECT COUNT(*) FROM attempts")
    days = scalar(conn, "SELECT COUNT(*) FROM days")
    closed = scalar(conn, "SELECT COUNT(*) FROM nodes WHERE status = 'closed'")
    out.append(f"прогресс: закрыто нод {closed}, попыток {attempts}, дней в журнале {days}, XP {xp}")

    if full:
        out.append("")
        out.append(f"{'этап':<4} {'название':<38} {'нод':>4} {'закр':>5} {'квиз':>5} {'карт':>5} {'трек':>5}")
        rows = conn.execute(
            """
            SELECT s.num, s.title, s.in_track,
                   (SELECT COUNT(*) FROM nodes n WHERE n.stage_id = s.id) AS nodes,
                   (SELECT COUNT(*) FROM nodes n WHERE n.stage_id = s.id AND n.status='closed') AS closed,
                   (SELECT COUNT(*) FROM items i WHERE i.stage_id = s.id AND i.type='quiz') AS quiz,
                   (SELECT COUNT(*) FROM items i WHERE i.stage_id = s.id AND i.type='card') AS card
            FROM stages s ORDER BY s.num
            """
        ).fetchall()
        for r in rows:
            title = r["title"] if len(r["title"]) <= 38 else r["title"][:37] + "…"
            out.append(
                f"{r['num']:<4} {title:<38} {r['nodes']:>4} {r['closed']:>5} "
                f"{r['quiz']:>5} {r['card']:>5} {'да' if r['in_track'] else '':>5}"
            )

    return "\n".join(out)
