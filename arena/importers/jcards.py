"""Миграция карточек из jcards.

Читаем чужую базу строго на чтение. SM-2 состояние переносим как есть,
чтобы история повторений не обнулилась. Привязка к этапу по имени конспекта.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from ..config import Config
from ..db import now

# Конспекты волта и этапы роадмапа, к которым они относятся.
SOURCE_STAGES: list[tuple[str, int]] = [
    ("JVM, JRE, JDK", 1),
    ("Загрузка классов", 13),
    ("Операндный стек", 13),
    ("Переменные", 2),
    ("switch", 2),
    ("Конструкторы", 3),
    ("Вложенные классы", 3),
    ("Enum", 3),
    ("Контракт equals", 4),
    ("String", 4),
    ("Типы-обёртки", 4),
    ("Числа с плавающей точкой", 4),
    ("Дженерики", 6),
    ("ArrayList и LinkedList", 7),
]


@dataclass
class CardsReport:
    read: int = 0
    added: int = 0
    existing: int = 0
    updated_state: int = 0
    by_stage: dict[int, int] = field(default_factory=dict)
    unmapped: list[str] = field(default_factory=list)

    def render(self) -> str:
        lines = [
            f"прочитано карточек: {self.read}",
            f"добавлено: {self.added}, уже было: {self.existing}, обновлено состояний: {self.updated_state}",
        ]
        if self.by_stage:
            spread = ", ".join(f"этап {k}: {v}" for k, v in sorted(self.by_stage.items()))
            lines.append("распределение: " + spread)
        if self.unmapped:
            lines.append("без этапа: " + ", ".join(sorted(set(self.unmapped))))
        return "\n".join(lines)


def stage_for_source(source: str) -> int | None:
    name = Path(source or "").name.lower().replace("ё", "е")
    for needle, stage in SOURCE_STAGES:
        if needle.lower().replace("ё", "е") in name:
            return stage
    return None


def run(conn: sqlite3.Connection, cfg: Config) -> CardsReport:
    report = CardsReport()
    if not cfg.jcards_db.exists():
        report.unmapped.append(f"базы jcards нет: {cfg.jcards_db}")
        return report

    src = sqlite3.connect(f"file:{cfg.jcards_db}?mode=ro", uri=True)
    src.row_factory = sqlite3.Row
    try:
        rows = src.execute("SELECT * FROM cards").fetchall()
    finally:
        src.close()

    stage_ids = {r["num"]: r["id"] for r in conn.execute("SELECT num, id FROM stages")}
    stamp = now()

    for row in rows:
        report.read += 1
        key = f"jcards:{row['id']}"
        stage_num = stage_for_source(row["source"])
        stage_id = stage_ids.get(stage_num) if stage_num else None
        if stage_num is None:
            report.unmapped.append(row["source"] or "без источника")

        payload = {
            "front": row["front"],
            "back": row["back"],
            "kind": row["kind"],
            "src": row["source"],
            "ctx": row["ctx"],
        }
        existing = conn.execute("SELECT id FROM items WHERE source_key = ?", (key,)).fetchone()
        if existing:
            item_id = existing["id"]
            report.existing += 1
        else:
            cur = conn.execute(
                "INSERT INTO items(node_id, stage_id, type, payload, difficulty, source, "
                "source_key, active, suspended, created) "
                "VALUES (NULL, ?, 'card', ?, 0, 'jcards', ?, ?, ?, ?)",
                (stage_id, json.dumps(payload, ensure_ascii=False), key,
                 1 if row["present"] else 0, 1 if row["suspended"] else 0, row["created"] or stamp),
            )
            item_id = cur.lastrowid
            report.added += 1
            if stage_num:
                report.by_stage[stage_num] = report.by_stage.get(stage_num, 0) + 1

        state = conn.execute("SELECT item_id FROM card_state WHERE item_id = ?", (item_id,)).fetchone()
        if state is None:
            conn.execute(
                "INSERT INTO card_state(item_id, ease, interval, reps, lapses, due, last) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (item_id, row["ease"], row["interval"], row["reps"], row["lapses"],
                 row["due"], row["last"] or None),
            )
            report.updated_state += 1

    conn.commit()
    return report
