"""Лента событий: чем закончился каждый день.

Пока это только события ученика. Фаза 5 подмешает сюда реплики Опуса и события
сезона, поэтому лента сразу собирается из нескольких источников и сортируется
по времени. Пустые дни в ленту не попадают: счётчиков пропущенного в продукте нет.
"""

from __future__ import annotations

import datetime as dt
import sqlite3

from . import xp

MONTHS_OF = (
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)

LEDGER_TITLES = {
    xp.CONTRACT: "контракт дня закрыт",
    xp.QUIZ_BLOCK: "блок вопросов без единого промаха",
    xp.ARTICLE: "статья прочитана и разобрана",
    xp.JAVARUSH: "внешний подвиг зачтён",
    xp.REVIEW: "разбор с ИИ после сдачи",
    xp.BOSS: "босс этапа",
    xp.DEFENSE: "защита решения",
    xp.TZ: "ТЗ принято",
    xp.FIELD_BOSS: "полевой босс: собеседование",
}
# Одиночные ответы в ленту не попадают: они сворачиваются в итог дня.
LEDGER_KINDS = tuple(LEDGER_TITLES)


def plural(n: int, one: str, few: str, many: str) -> str:
    tail = abs(n) % 100
    if 11 <= tail <= 14:
        return f"{n} {many}"
    tail %= 10
    if tail == 1:
        return f"{n} {one}"
    if 2 <= tail <= 4:
        return f"{n} {few}"
    return f"{n} {many}"


def day_label(date: str, today: str) -> str:
    d = dt.date.fromisoformat(date)
    t = dt.date.fromisoformat(today)
    if d == t:
        return "сегодня"
    if d == t - dt.timedelta(days=1):
        return "вчера"
    label = f"{d.day} {MONTHS_OF[d.month - 1]}"
    return label if d.year == t.year else f"{label} {d.year}"


def build(conn: sqlite3.Connection, today: str, days_limit: int = 21) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM days WHERE quiz_count + cards_count + nodes_closed + xp > 0 "
        "ORDER BY date DESC LIMIT ?",
        (days_limit,),
    ).fetchall()
    if not rows:
        return []
    dates = [r["date"] for r in rows]
    oldest = min(dates)

    events: dict[str, list[dict]] = {d: [] for d in dates}

    marks = ", ".join("?" for _ in LEDGER_KINDS)
    for r in conn.execute(
        f"SELECT ts, amount, reason, ref_id FROM xp_ledger "
        f"WHERE reason IN ({marks}) AND date(ts) >= ? ORDER BY id DESC",
        (*LEDGER_KINDS, oldest),
    ):
        date = r["ts"][:10]
        if date in events:
            events[date].append({
                "kind": r["reason"],
                "text": LEDGER_TITLES.get(r["reason"], r["reason"]),
                "xp": r["amount"],
                "ts": r["ts"],
            })

    for r in conn.execute(
        "SELECT n.code, n.title, n.kind, n.closed_at, n.closed_by FROM nodes n "
        "WHERE n.status = 'closed' AND n.closed_at IS NOT NULL AND date(n.closed_at) >= ? "
        "ORDER BY n.closed_at DESC",
        (oldest,),
    ):
        date = r["closed_at"][:10]
        if date not in events:
            continue
        tail = {"note": " (по конспекту)", "note_empty": " (по конспекту)",
                "known": " (отмечена как знакомая)"}.get(r["closed_by"], "")
        events[date].append({
            "kind": "node_closed",
            "text": f"закрыта нода {r['code']} {r['title']}{tail}",
            "xp": xp.AMOUNTS[xp.NODE_CLOSED],
            "ts": r["closed_at"],
        })

    for r in conn.execute(
        "SELECT ts, kind, text, xp FROM bot_events WHERE date(ts) >= ? ORDER BY id DESC", (oldest,)
    ):
        date = r["ts"][:10]
        if date in events:
            events[date].append(
                {"kind": "bot", "text": r["text"], "xp": r["xp"], "ts": r["ts"]}
            )

    out = []
    for row in rows:
        date = row["date"]
        items = sorted(events[date], key=lambda e: e["ts"], reverse=True)
        summary = []
        if row["quiz_count"]:
            summary.append(plural(row["quiz_count"], "вопрос", "вопроса", "вопросов"))
        if row["cards_count"]:
            summary.append(plural(row["cards_count"], "карточка", "карточки", "карточек"))
        if row["code_count"]:
            summary.append(plural(row["code_count"], "задача", "задачи", "задач"))
        if summary:
            items.append({"kind": "day", "text": " и ".join(summary), "xp": 0, "ts": date})
        out.append({
            "date": date,
            "label": day_label(date, today),
            "xp": row["xp"],
            "green": bool(row["contract_done"]),
            "events": items,
        })
    return out
