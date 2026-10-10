#!/usr/bin/env python3
"""Разложить карточки jcards по нодам роадмапа.

Карточки приезжают из конспектов волта, а конспект покрывает сразу несколько нод,
поэтому импорт вешал их на этап целиком. Из-за этого термин из середины этапа мог
выпасть в первый день. Здесь каждая карточка получает свою ноду: модель раскладывает
карточки одного конспекта по списку нод-кандидатов, а мы проверяем ответ по кодам.

    .venv/bin/python scripts/map_cards_to_nodes.py --dry
    .venv/bin/python scripts/map_cards_to_nodes.py

Без ключей работает по боевой базе, но пишет только items.node_id у карточек.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from arena import config as config_mod  # noqa: E402
from arena import db as db_mod  # noqa: E402
from arena.gen import claude, runtime  # noqa: E402

# Конспект и этапы, среди нод которых ищем место каждой карточке. Последним идёт
# запасной код: карточка, которую модель не разложила, поедет туда.
PLAN: list[tuple[str, list[int], str]] = [
    ("JVM, JRE, JDK", [1, 13], "1.03"),
    ("Загрузка классов", [13], "13.01"),
    ("Операндный стек", [13], "13.21"),
    ("Переменные", [2], "2.01"),
    ("switch", [2], "2.25"),
    ("Конструкторы", [3], "3.05"),
    ("Вложенные классы", [3], "3.48"),
    ("Enum", [3], "3.38"),
    ("Контракт equals", [4], "4.04"),
    ("String", [4], "4.12"),
    ("Типы-обёртки", [4], "4.29"),
    ("Числа с плавающей точкой", [4], "4.34"),
    ("Дженерики", [6], "6.01"),
    ("ArrayList и LinkedList", [7], "7.05"),
]

PROMPT = """Ты раскладываешь карточки для повторения по нодам учебного роадмапа Java.

Ноды-кандидаты, каждая строка это код и тема:
{nodes}

Карточки из конспекта «{note}», каждая строка это номер и лицевая сторона:
{cards}

Для каждой карточки выбери одну ноду, на которой эту тему разбирают впервые.
Если тема шире одной ноды, бери самую раннюю ноду, где её уже можно понять.
Если подходящей ноды нет совсем, поставь код {fallback}.

Ответь только JSON без пояснений, в формате:
{{"map": [{{"n": 1, "code": "3.05"}}, {{"n": 2, "code": "3.06"}}]}}
Номера должны покрыть все карточки ровно по одному разу."""


def load_cards(conn: sqlite3.Connection, needle: str) -> list[sqlite3.Row]:
    rows = conn.execute(
        "SELECT id, payload FROM items WHERE type = 'card' AND source = 'jcards' AND active = 1"
    ).fetchall()
    key = needle.lower().replace("ё", "е")
    out = []
    for r in rows:
        src = (json.loads(r["payload"]).get("src") or "").lower().replace("ё", "е")
        if key in src:
            out.append(r)
    return out


def node_lines(conn: sqlite3.Connection, stages: list[int]) -> tuple[str, dict[str, int]]:
    codes: dict[str, int] = {}
    lines = []
    for num in stages:
        for r in conn.execute(
            "SELECT n.id, n.code, n.title FROM nodes n JOIN stages s ON s.id = n.stage_id "
            "WHERE s.num = ? ORDER BY n.seq", (num,)
        ):
            codes[r["code"]] = r["id"]
            lines.append(f"{r['code']} {r['title']}")
    return "\n".join(lines), codes


def ask_map(note: str, cards: list[sqlite3.Row], nodes: str, fallback: str,
            argv: list[str]) -> dict[int, str]:
    fronts = []
    for i, r in enumerate(cards, 1):
        front = (json.loads(r["payload"]).get("front") or "").replace("\n", " ")
        fronts.append(f"{i}. {front[:160]}")
    prompt = PROMPT.format(nodes=nodes, note=note, cards="\n".join(fronts), fallback=fallback)
    reply = claude.ask(prompt, bin_argv=argv, model=runtime.LIGHT_MODEL,
                       tools="", effort="medium", timeout=900)
    if reply.status != "ok":
        print(f"  модель не ответила: {reply.error}")
        return {}
    data = reply.data or {}
    out = {}
    for row in data.get("map", []):
        try:
            out[int(row["n"])] = str(row["code"]).strip()
        except (KeyError, TypeError, ValueError):
            continue
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="показать раскладку, но не писать в базу")
    ap.add_argument("--env", default="prod")
    args = ap.parse_args()

    cfg = config_mod.load(env=args.env)
    kind, argv, why = runtime.mode(cfg)
    if kind == "off":
        print(f"звать модель нечем: {why}")
        return 1
    conn = db_mod.connect(cfg, create=False)
    # Никаких длинных транзакций по живой базе: пока скрипт ждёт модель, сервер
    # обязан спокойно писать. Пишем короткими блоками после каждого конспекта.
    conn.execute("PRAGMA busy_timeout = 5000")
    total = Counter()
    moved = 0

    for note, stages, fallback in PLAN:
        cards = load_cards(conn, note)
        if not cards:
            print(f"{note}: карточек нет")
            continue
        nodes, codes = node_lines(conn, stages)
        if fallback not in codes:
            print(f"{note}: запасной код {fallback} не найден, пропускаю")
            continue
        print(f"{note}: карточек {len(cards)}, нод-кандидатов {len(codes)}")
        mapping = ask_map(note, cards, nodes, fallback, argv)
        spread = Counter()
        for i, card in enumerate(cards, 1):
            code = mapping.get(i, "")
            if code not in codes:
                code = fallback
            spread[code] += 1
            total[code] += 1
            if not args.dry:
                conn.execute("UPDATE items SET node_id = ? WHERE id = ?", (codes[code], card["id"]))
                moved += 1
        if not args.dry:
            conn.commit()
        top = ", ".join(f"{c}: {n}" for c, n in sorted(spread.items()))
        print(f"  разложено {sum(spread.values())} -> {top}")

    print(f"\nвсего карточек размечено: {sum(total.values())}, записано: {moved}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
