"""Сборка промптов из файлов prompts/.

Подстановка своя, а не str.format: в промптах полно фигурных скобок из примеров
JSON, и любой format их бы съел. Плейсхолдер выглядит как {{имя}}.
"""

from __future__ import annotations

import json
import re
import sqlite3

from .. import config as config_mod
from ..config import PROJECT_ROOT
from . import weak

PROMPT_DIR = PROJECT_ROOT / "prompts"
PLACEHOLDER = re.compile(r"\{\{([a-z_]+)\}\}")

FILES = {
    "quiz": "quiz_gen.md",
    "cards": "cards_gen.md",
    "readcode": "readcode_gen.md",
    "article": "article_pick.md",
    "code": "code_gen.md",
    "note": "note_gen.md",
}

EXISTING_LIMIT = 25
EMPTY_BANK = "Пусто, нода чистая."


def read(name: str, subdir: str = "") -> str:
    """Промпт жанра. Свой промпт трека перекрывает общий.

    Общие промпты лежат в prompts/ и написаны под Java. У раздела с другим
    предметом (SQL) в prompts/<subdir>/ лежат свои, и берутся они первыми.
    Чего в своей папке нет, то докладывается общим — так контракт ответа
    и мелкие жанры не приходится дублировать.
    """
    if subdir:
        own = PROMPT_DIR / subdir / name
        if own.is_file():
            return own.read_text(encoding="utf-8")
    path = PROMPT_DIR / name
    if not path.is_file():
        raise FileNotFoundError(f"нет файла промпта: {path}")
    return path.read_text(encoding="utf-8")


def fill(template: str, values: dict[str, str]) -> str:
    def swap(match: re.Match) -> str:
        return str(values.get(match.group(1), "")).strip()
    return PLACEHOLDER.sub(swap, template).strip() + "\n"


def _titles(conn: sqlite3.Connection, sql: str, params: tuple, keys: tuple[str, ...]) -> list[str]:
    out = []
    for row in conn.execute(sql, params).fetchall():
        try:
            data = json.loads(row["payload"])
        except (ValueError, TypeError):
            continue
        for key in keys:
            text = data.get(key)
            if text:
                out.append(" ".join(str(text).split())[:110])
                break
    return out


def existing_node(conn: sqlite3.Connection, node_id: int, item_type: str) -> str:
    keys = {"quiz": ("q",), "card": ("front",), "readcode": ("question",),
            "code": ("title",), "article": ("title",)}.get(item_type, ("q",))
    titles = _titles(
        conn,
        "SELECT payload FROM items WHERE node_id = ? AND type = ? AND active = 1 "
        "ORDER BY id DESC LIMIT ?",
        (node_id, item_type, EXISTING_LIMIT), keys,
    )
    return "\n".join(f"- {t}" for t in titles) if titles else EMPTY_BANK


def existing_stage(conn: sqlite3.Connection, stage_id: int, item_type: str) -> str:
    keys = {"article": ("title",), "quiz": ("q",)}[item_type]
    titles = _titles(
        conn,
        "SELECT payload FROM items WHERE stage_id = ? AND type = ? AND active = 1 "
        "ORDER BY id DESC LIMIT ?",
        (stage_id, item_type, EXISTING_LIMIT), keys,
    )
    return "\n".join(f"- {t}" for t in titles) if titles else EMPTY_BANK


def stage_topics(conn: sqlite3.Connection, stage_id: int, limit: int = 25) -> str:
    rows = conn.execute(
        "SELECT title FROM nodes WHERE stage_id = ? ORDER BY seq LIMIT ?", (stage_id, limit)
    ).fetchall()
    return ", ".join(row["title"] for row in rows)


# Конспект целиком в промпт не влезает и не нужен: генератору важны тезисы и разбор,
# а не эталоны ДЗ. Режем по объёму, а не по секциям: формат нод в волте не гарантирован.
NOTE_LIMIT = 9000


def note_text(cfg, node: sqlite3.Row) -> str:
    """Текст конспекта ноды. Именно он, а не название, задаёт границы темы.

    Без него генератор писал вопросы по одному заголовку и уходил куда угодно:
    в ноде «Что такое программа» получались переменные и склейка строк, потому что
    из названия не видно, что переменные будут только в этапе 2.
    """
    if cfg is None or not node["obsidian_path"]:
        return "Конспекта нет, ориентируйся на название и описание ноды."
    path = cfg.vault_root / node["obsidian_path"]
    try:
        text = path.read_text(encoding="utf-8", errors="replace").replace("\x00", "")
    except OSError:
        return "Конспекта нет, ориентируйся на название и описание ноды."
    if len(text) > NOTE_LIMIT:
        text = text[:NOTE_LIMIT] + "\n\n[конспект обрезан]"
    return text


def covered(conn: sqlite3.Connection, node: sqlite3.Row, limit: int = 40) -> str:
    """Что ученик уже прошёл: ноды до этой включительно.

    Это потолок словаря. Всё, чего в списке нет, ещё не объяснено, и спрашивать
    об этом нечестно — правило есть в контракте, но выполнить его без списка нельзя.
    """
    rows = conn.execute(
        "SELECT n.code, n.title FROM nodes n JOIN stages s ON s.id = n.stage_id "
        "WHERE (s.num < (SELECT num FROM stages WHERE id = ?) "
        "       OR (n.stage_id = ? AND n.seq <= ?)) "
        "ORDER BY s.num DESC, n.seq DESC LIMIT ?",
        (node["stage_id"], node["stage_id"], node["seq"], limit),
    ).fetchall()
    if not rows:
        return "Это самая первая нода роадмапа: ученик не знает вообще ничего."
    lines = [f"- {r['code']} {r['title']}" for r in reversed(rows)]
    return "\n".join(lines)


def upcoming(conn: sqlite3.Connection, node: sqlite3.Row, limit: int = 14) -> str:
    """Ноды после этой: список тем, о которых спрашивать ещё рано.

    Одного «пройденного» не хватало. Конспект нет-нет да и обронит слово из будущей
    ноды - в «Точке входа main» это было «код соберётся, компилятор не против», -
    и генератор честно считал это разрешением спрашивать про компиляцию, хотя
    стадий сборки ученик ещё не проходил. Явный запрет надёжнее умолчания.
    """
    rows = conn.execute(
        "SELECT n.code, n.title FROM nodes n JOIN stages s ON s.id = n.stage_id "
        "WHERE (s.num > (SELECT num FROM stages WHERE id = ?) "
        "       OR (n.stage_id = ? AND n.seq > ?)) "
        "ORDER BY s.num, n.seq LIMIT ?",
        (node["stage_id"], node["stage_id"], node["seq"], limit),
    ).fetchall()
    if not rows:
        return "Роадмап на этой ноде заканчивается, запретных тем нет."
    return "\n".join(f"- {r['code']} {r['title']}" for r in rows)


def for_node(conn: sqlite3.Connection, kind: str, node: sqlite3.Row, count: int,
             cfg=None) -> str:
    """Промпт под ноду: конспект, пройденное, слабые места и что уже есть в банке."""
    from .plan import BY_KIND

    from . import notes

    genre = BY_KIND[kind]
    # Промпты берём из папки трека, к которому принадлежит нода.
    subdir = config_mod.track_of_code(node["code"]).prompt_dir
    stage = conn.execute(
        "SELECT num, title FROM stages WHERE id = ?", (node["stage_id"],)
    ).fetchone()
    values = {
        "contract": read("contract.md"),
        "stage_num": str(stage["num"]) if stage else "",
        "stage_title": stage["title"] if stage else "",
        "node_code": node["code"],
        "node_title": node["title"],
        "node_kind": node["kind"],
        "node_descr": node["descr"] or "описания нет, ориентируйся на название",
        "count": str(count),
        "weak": weak.summary(conn, node["stage_id"]),
        "existing": existing_node(conn, node["id"], genre.item_type or "quiz"),
    }
    if kind == "note":
        # Конспекту нужны соседи по этапу: на них он ссылается и на их территорию
        # не лезет. Остальным жанрам этот список ни к чему, промпт и так длинный.
        values["neighbours"] = notes.neighbours_block(conn, node)
    else:
        # Всем остальным жанрам нужен сам конспект и потолок словаря: вопрос
        # и задача пишутся по тексту ноды, а не по её названию.
        values["note_text"] = note_text(cfg, node)
        values["covered"] = covered(conn, node)
        values["upcoming"] = upcoming(conn, node)
    return fill(read(FILES[kind], subdir), values)


def for_stage(conn: sqlite3.Connection, kind: str, stage: sqlite3.Row, count: int) -> str:
    values = {
        "contract": read("contract.md"),
        "stage_num": str(stage["num"]),
        "stage_title": stage["title"],
        "stage_topics": stage_topics(conn, stage["id"]),
        "count": str(count),
        "weak": weak.summary(conn, stage["id"]),
        "existing": existing_stage(conn, stage["id"], "article"),
    }
    return fill(read(FILES[kind]), values)
