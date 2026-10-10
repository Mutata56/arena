"""Конспекты Obsidian для нод без своего файла (этапы 4-26, раздел 11 плана).

Файл собирается здесь, а не моделью: так структура конспекта («Цель, Ключевые
тезисы, Мини-разбор, связи») и шапка с навигацией гарантированы, а модель отвечает
только за содержание. Проверить стиль машинально тоже становится возможно.

Два правила, которые тут важнее остальных:

1. Хаб этапа генератор не трогает НИКОГДА. Он пишет ровно один новый файл ноды.
2. Существующий файл не перезаписывается ни при каких обстоятельствах: волт это
   работа ученика, а не наша папка вывода.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

from ..config import Config
from ..roadmap import vault_relative

CODE_RE = re.compile(r"^\s*(\d{1,2}\.\d{2})\b[\s.:-]*(.*)$")
STARS_FULL = "★"
STARS_EMPTY = "☆"


def stars(level: int) -> str:
    level = max(1, min(5, int(level or 3)))
    return STARS_FULL * level + STARS_EMPTY * (5 - level)


def hub_name(hub_path: str) -> str:
    return Path(hub_path).stem


def neighbours(conn: sqlite3.Connection, node: sqlite3.Row) -> tuple[str, str]:
    """Ссылки «До» и «После»: соседние ноды этапа, а на краях хабы соседних этапов."""
    stage = conn.execute("SELECT * FROM stages WHERE id = ?", (node["stage_id"],)).fetchone()
    before = conn.execute(
        "SELECT code, title FROM nodes WHERE stage_id = ? AND seq < ? ORDER BY seq DESC LIMIT 1",
        (node["stage_id"], node["seq"]),
    ).fetchone()
    after = conn.execute(
        "SELECT code, title FROM nodes WHERE stage_id = ? AND seq > ? ORDER BY seq LIMIT 1",
        (node["stage_id"], node["seq"]),
    ).fetchone()

    def stage_hub(delta: int) -> str:
        row = conn.execute(
            "SELECT hub_path FROM stages WHERE num = ?", (stage["num"] + delta,)
        ).fetchone()
        return f"[[{hub_name(row['hub_path'])}]]" if row else f"[[{hub_name(stage['hub_path'])}]]"

    left = f"[[{before['code']} {before['title']}]]" if before else stage_hub(-1)
    right = f"[[{after['code']} {after['title']}]]" if after else stage_hub(1)
    return left, right


def stage_nodes(conn: sqlite3.Connection, stage_id: int) -> list[sqlite3.Row]:
    return list(conn.execute(
        "SELECT code, title, kind, descr FROM nodes WHERE stage_id = ? ORDER BY seq", (stage_id,)
    ))


def neighbours_block(conn: sqlite3.Connection, node: sqlite3.Row, span: int = 6) -> str:
    """Список соседних нод для промпта: на что можно ссылаться и куда не лезть."""
    rows = stage_nodes(conn, node["stage_id"])
    index = next((i for i, row in enumerate(rows) if row["code"] == node["code"]), 0)
    window = rows[max(0, index - span):index + span + 1]
    lines = []
    for row in window:
        mark = " (эта нода)" if row["code"] == node["code"] else ""
        lines.append(f"- {row['code']} {row['title']}{mark}: {row['descr'] or ''}".rstrip())
    return "\n".join(lines)


def resolve_links(conn: sqlite3.Connection, node: sqlite3.Row, raw: list[str]) -> list[str]:
    """Оставить только ссылки на существующие ноды: битых вики-ссылок в волте не заводим."""
    by_code = {row["code"]: row["title"] for row in conn.execute(
        "SELECT code, title FROM nodes").fetchall()}
    by_title = {}
    for code, title in by_code.items():
        by_title.setdefault(" ".join(title.split()).casefold(), code)

    out: list[str] = []
    for item in raw:
        text = " ".join(str(item).replace("[[", "").replace("]]", "").split())
        code = None
        found = CODE_RE.match(text)
        if found and found.group(1) in by_code:
            code = found.group(1)
        else:
            code = by_title.get(text.casefold())
            if code is None and found:
                code = by_title.get(found.group(2).casefold())
        if code is None or code == node["code"]:
            continue
        link = f"[[{code} {by_code[code]}]]"
        if link not in out:
            out.append(link)
    return out[:6]


def render(conn: sqlite3.Connection, node: sqlite3.Row, data: dict) -> str:
    """Собрать файл конспекта в стиле нод этапов 1-3."""
    stage = conn.execute("SELECT * FROM stages WHERE id = ?", (node["stage_id"],)).fetchone()
    left, right = neighbours(conn, node)
    links = resolve_links(conn, node, data.get("links") or [])
    if not links:
        links = [right] if right.startswith("[[") and not right.startswith("[[_") else []

    lines = [
        f"#Java #roadmap #этап{stage['num']}",
        f"**Этап:** [[{hub_name(stage['hub_path'])}|Этап {stage['num']}. {stage['title']}]] | "
        f"**Тип:** {node['kind']} | **Сложность:** {stars(data.get('stars', 3))}",
        f"**До:** {left} | **После:** {right}",
        "",
        f"# {node['title']}",
        "",
        "## Цель",
        data["goal"].strip(),
        "",
        "## Ключевые тезисы",
    ]
    lines += [f"- {thesis.strip()}" for thesis in data["theses"]]
    lines += [
        "",
        "## Мини-разбор",
        data["walkthrough_md"].strip(),
        "",
    ]
    if links:
        lines.append("**Связи:** " + ", ".join(links))
    return "\n".join(lines).rstrip() + "\n"


def target_path(cfg: Config, conn: sqlite3.Connection, node: sqlite3.Row) -> Path:
    """Куда ляжет файл: папка этапа рядом с хабом, имя как в вики-ссылке хаба."""
    stage = conn.execute(
        "SELECT hub_path FROM stages WHERE id = ?", (node["stage_id"],)).fetchone()
    folder = (cfg.vault_root / stage["hub_path"]).parent
    return folder / f"{node['code']} {node['title']}.md"


def publish(conn: sqlite3.Connection, cfg: Config, node: sqlite3.Row,
            data: dict) -> tuple[int, str, str]:
    """Записать конспект в волт и заполнить obsidian_path.

    Возвращает сколько файлов создано (0 или 1), путь относительно волта и заметку
    для журнала. Хаб не трогается, существующий файл не перезаписывается.
    """
    if not cfg.write_vault:
        raise PermissionError(
            "запись в волт выключена профилем, конспект писать некуда "
            "(в песочнице это ARENA_WRITE_VAULT=1)"
        )
    path = target_path(cfg, conn, node)
    if not path.parent.is_dir():
        raise FileNotFoundError(f"нет папки этапа {path.parent}")
    relative = vault_relative(cfg, path)
    if path.exists():
        # Так бывает после ручной правки волта: файл появился, а sync ещё не прошёл.
        # Перезаписывать чужой текст нельзя, но путь в базе поправить надо.
        conn.execute("UPDATE nodes SET obsidian_path = ? WHERE id = ?", (relative, node["id"]))
        conn.commit()
        return 0, relative, "файл уже был в волте, не трогаю, только записал путь"
    text = render(conn, node, data)
    path.write_text(text, encoding="utf-8")
    conn.execute("UPDATE nodes SET obsidian_path = ? WHERE id = ?", (relative, node["id"]))
    conn.commit()
    return 1, relative, f"конспект записан: {relative}"
