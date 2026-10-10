"""Рукописные ТЗ из content/tz в банк постановок.

Лежат папкой по той же причине, что и код-задачи фазы 3: писать Java внутри
JSON-строки руками невозможно.

    content/tz/etap-02-volna/
        tz.json      этап, slug, заголовок, темы, обязательные конструкции
        spec.md      постановка целиком (её видит ученик)
        starter/     каркас, который получает ученик
        hidden/      скрытые тесты, ученику не показываются
        solution/    эталон, им же проверяется сама постановка
        tests/       тесты, которые написал бы ученик (эталон своей части приёмки)

В базу это едет ровно тем же payload, что кладёт генератор.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from .. import tz
from ..config import Config, PROJECT_ROOT

CONTENT_DIR = PROJECT_ROOT / "content" / "tz"


@dataclass
class ImportReport:
    added: int = 0
    updated: int = 0
    skipped: int = 0
    warnings: list[str] = field(default_factory=list)

    def render(self) -> str:
        lines = [f"ТЗ: добавлено {self.added}, обновлено {self.updated}, "
                 f"пропущено {self.skipped}"]
        lines.extend("  " + w for w in self.warnings)
        return "\n".join(lines)


def _files(folder: Path) -> dict[str, str]:
    if not folder.is_dir():
        return {}
    return {p.name: p.read_text(encoding="utf-8") for p in sorted(folder.glob("*.java"))}


def _one_file(folder: Path, what: str) -> str:
    files = sorted(folder.glob("*.java"))
    if len(files) != 1:
        raise ValueError(f"{folder}: ждал ровно один файл {what}, нашёл {len(files)}")
    return files[0].read_text(encoding="utf-8")


def build(folder: Path) -> dict:
    meta = json.loads((folder / "tz.json").read_text(encoding="utf-8"))
    payload = {
        "dir_name": meta.get("dir_name"),
        "topics": meta.get("topics", []),
        "must_use": meta.get("must_use", []),
        "starter_files": _files(folder / "starter"),
        "hidden_tests": _one_file(folder / "hidden", "со скрытыми тестами"),
        "reference_solution": _files(folder / "solution"),
        "reference_tests": _one_file(folder / "tests", "с тестами ученика"),
    }
    if not payload["reference_solution"]:
        raise ValueError(f"{folder}: нет эталонного решения")
    for rule in payload["must_use"]:
        if rule.get("id") not in tz.CONSTRUCTS:
            raise ValueError(f"{folder}: в must_use id не из каталога: {rule}")
    return {
        "stage": int(meta["stage"]),
        "slug": meta.get("slug") or folder.name,
        "title": meta["title"],
        "spec_md": (folder / "spec.md").read_text(encoding="utf-8").strip(),
        "payload": payload,
    }


def run(conn: sqlite3.Connection, cfg: Config, folder: Path | None = None,
        verify: bool = False) -> ImportReport:
    """Засеять банк. verify=True дополнительно гоняет эталон, как генератор."""
    report = ImportReport()
    root = folder or CONTENT_DIR
    if not root.is_dir():
        report.warnings.append(f"нет папки {root}, импортировать нечего")
        return report

    for spec_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        try:
            data = build(spec_dir)
        except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
            report.warnings.append(f"{spec_dir.name}: {exc}")
            report.skipped += 1
            continue

        stage = conn.execute("SELECT id FROM stages WHERE num = ?", (data["stage"],)).fetchone()
        if stage is None:
            report.warnings.append(f"{spec_dir.name}: этапа {data['stage']} нет в базе")
            report.skipped += 1
            continue
        if verify:
            from .. import tz_gen

            problems = tz_gen.check_spec(data["spec_md"], data["payload"], data["stage"])
            if problems:
                report.warnings.append(f"{spec_dir.name}: {problems[0]}")
                report.skipped += 1
                continue
            checked = tz_gen.self_check(cfg, data["payload"])
            if not checked["ok"]:
                report.warnings.append(f"{spec_dir.name}: эталон красный, {checked['why']}")
                report.skipped += 1
                continue

        existing = conn.execute(
            "SELECT id FROM tz_specs WHERE slug = ?", (data["slug"],)).fetchone()
        tz.add_spec(conn, stage["id"], data["slug"], data["title"], data["spec_md"],
                    data["payload"], source="manual")
        if existing is None:
            report.added += 1
        else:
            report.updated += 1
    return report
