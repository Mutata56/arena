"""Ручные код-задачи из content/code в банк.

Задача на диске лежит папкой, потому что писать Java внутри JSON руками невозможно:

    content/code/1.10-ramka/
        task.json      нода, сложность, заголовок, подсказки по стилю
        statement.md   постановка
        starter/       файлы, которые получит ученик
        visible/       тесты, которые он видит
        hidden/        тесты, которых он не видит
        solution/      эталон, им же проверяется сама задача

В базу это едет одним payload по формату раздела 3 плана:
{title, statement_md, starter_files, visible_tests, hidden_tests, reference_solution,
checkstyle_hints}. Генератор фазы 4 кладёт ровно такой же payload, только собирает
его сам, без файлов на диске.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from ..config import Config, PROJECT_ROOT
from ..db import now

CONTENT_DIR = PROJECT_ROOT / "content" / "code"


@dataclass
class ImportReport:
    added: int = 0
    updated: int = 0
    skipped: int = 0
    warnings: list[str] = field(default_factory=list)

    def render(self) -> str:
        lines = [f"код-задачи: добавлено {self.added}, обновлено {self.updated}, "
                 f"пропущено {self.skipped}"]
        lines.extend("  " + w for w in self.warnings)
        return "\n".join(lines)


def _one_file(folder: Path, what: str) -> str:
    files = sorted(folder.glob("*.java"))
    if len(files) != 1:
        raise ValueError(f"{folder}: ждал ровно один файл {what}, нашёл {len(files)}")
    return files[0].read_text(encoding="utf-8")


def _files(folder: Path) -> dict[str, str]:
    return {p.name: p.read_text(encoding="utf-8") for p in sorted(folder.glob("*.java"))}


def build_payload(folder: Path) -> tuple[dict, str, int]:
    meta = json.loads((folder / "task.json").read_text(encoding="utf-8"))
    payload = {
        "title": meta["title"],
        "statement_md": (folder / "statement.md").read_text(encoding="utf-8").strip(),
        "starter_files": _files(folder / "starter"),
        "visible_tests": _one_file(folder / "visible", "с видимыми тестами"),
        "hidden_tests": _one_file(folder / "hidden", "со скрытыми тестами"),
        "reference_solution": _files(folder / "solution"),
        "checkstyle_hints": meta.get("checkstyle_hints", []),
    }
    if not payload["starter_files"]:
        raise ValueError(f"{folder}: пустой стартовый набор")
    if not payload["reference_solution"]:
        raise ValueError(f"{folder}: нет эталонного решения")
    return payload, meta["node"], int(meta.get("difficulty", 0))


def run(conn: sqlite3.Connection, cfg: Config, folder: Path | None = None) -> ImportReport:
    report = ImportReport()
    root = folder or CONTENT_DIR
    if not root.is_dir():
        report.warnings.append(f"нет папки {root}, импортировать нечего")
        return report

    for task_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        try:
            payload, node_code, difficulty = build_payload(task_dir)
        except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
            report.warnings.append(f"{task_dir.name}: {exc}")
            report.skipped += 1
            continue

        node = conn.execute(
            "SELECT id, stage_id FROM nodes WHERE code = ?", (node_code,)
        ).fetchone()
        if node is None:
            report.warnings.append(f"{task_dir.name}: ноды {node_code} нет в базе, пропускаю")
            report.skipped += 1
            continue

        key = f"manual:code:{task_dir.name}"
        body = json.dumps(payload, ensure_ascii=False)
        row = conn.execute("SELECT id, payload FROM items WHERE source_key = ?", (key,)).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO items(node_id, stage_id, type, payload, difficulty, source, "
                "source_key, created) VALUES (?, ?, 'code', ?, ?, 'manual', ?, ?)",
                (node["id"], node["stage_id"], body, difficulty, key, now()),
            )
            report.added += 1
        elif row["payload"] != body:
            conn.execute(
                "UPDATE items SET payload = ?, difficulty = ?, node_id = ?, stage_id = ? "
                "WHERE id = ?",
                (body, difficulty, node["id"], node["stage_id"], row["id"]),
            )
            report.updated += 1
        else:
            report.skipped += 1
    conn.commit()
    return report
