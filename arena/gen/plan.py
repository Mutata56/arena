"""Что и когда генерить: жанры ноды, траектория, опережение на пять нод.

Раздел 11 плана: конвейер не прегенерит всё, а держит наполненными ближайшие
пять нод по траектории раздела 4. Триггер это вход ученика в ноду плюс ночное окно.

Внутри ноды порядок жёсткий: сперва лёгкие жанры (вопросы, карточки, чужой код),
тяжёлые догоняют фоном. Петля дня никогда не ждёт тяжёлую генерацию.
"""

from __future__ import annotations

import sqlite3

from .. import config as config_mod
from dataclasses import dataclass

from . import queue

LOOKAHEAD = 5


@dataclass(frozen=True)
class Genre:
    """Жанр контента: сколько нужно на ноду и кто это делает.

    ready=False это жанр, объявленный, но ещё не сделанный: планировщик его
    считает и показывает в отчёте, но в очередь не ставит, а воркер такое
    задание не берёт. После захода 4б таких жанров не осталось, флаг живёт
    как место под будущие (например ТЗ фазы 7, если оно захочет в эту очередь).
    """

    kind: str
    item_type: str | None
    goal: int
    count: int
    priority: int
    ready: bool
    node_kinds: tuple[str, ...] = ()
    scope: str = "node"
    title: str = ""


# Статьи это жанр этапа, а не ноды, и подбираются с веб-поиском. В автоматический
# план они не входят намеренно: страница ищется минуты, а нужна пара штук на этап.
# Ставятся руками: arena gen --stage N --kind article.
ARTICLE_GOAL = 2

GENRES: tuple[Genre, ...] = (
    Genre("quiz", "quiz", goal=12, count=12, priority=100, ready=True, title="вопросы"),
    Genre("cards", "card", goal=4, count=4, priority=90, ready=True, title="карточки"),
    Genre("readcode", "readcode", goal=2, count=2, priority=80, ready=True, title="чужой код"),
    Genre("article", "article", goal=ARTICLE_GOAL, count=ARTICLE_GOAL, priority=10, ready=True,
          scope="stage", title="статьи"),
    # Код-задача с самопроверкой эталона прогоном. Приоритет ниже лёгких жанров
    # намеренно: она догоняет фоном, петля дня её не ждёт (раздел 11).
    Genre("code", "code", goal=1, count=1, priority=50, ready=True,
          node_kinds=("практика", "проект", "тема"), title="код-задача"),
    # Конспект Obsidian для нод без своего файла (этапы 4-26).
    Genre("note", None, goal=1, count=1, priority=40, ready=True, title="конспект"),
)

BY_KIND = {genre.kind: genre for genre in GENRES}
# Жанры ноды, которые уже делаются: их ставит планировщик при входе в ноду.
READY_KINDS = tuple(g.kind for g in GENRES if g.ready and g.scope == "node")
# Всё, что воркер вообще умеет выполнять, включая жанры этапа.
WORKABLE_KINDS = tuple(g.kind for g in GENRES if g.ready)
RESERVED_KINDS = tuple(g.kind for g in GENRES if not g.ready)


def have(conn: sqlite3.Connection, node_id: int, item_type: str) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM items WHERE node_id = ? AND type = ? AND active = 1 AND suspended = 0",
        (node_id, item_type),
    ).fetchone()[0]


def stage_articles(conn: sqlite3.Connection, stage_id: int) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM items WHERE stage_id = ? AND type = 'article' AND active = 1",
        (stage_id,),
    ).fetchone()[0]


def wanted(conn: sqlite3.Connection, node: sqlite3.Row) -> list[tuple[Genre, int]]:
    """Чего ноде не хватает. Порядок = порядок генерации."""
    track = config_mod.track_of_code(node["code"])
    out: list[tuple[Genre, int]] = []
    for genre in GENRES:
        if genre.scope != "node":
            continue
        # Трек может делать не все жанры: у SQL нет код-задачи (её место занял
        # фенс ```запрос``` в самом конспекте) и нет генерации конспекта.
        if track.genres and genre.kind not in track.genres:
            continue
        if genre.node_kinds and node["kind"] not in genre.node_kinds:
            continue
        if genre.kind == "note" and node["obsidian_path"]:
            continue
        if genre.item_type is None:
            out.append((genre, 0))
            continue
        got = have(conn, node["id"], genre.item_type)
        if got < genre.goal:
            out.append((genre, got))
    return out


def priority(genre: Genre, distance: int) -> int:
    """Ближняя нода целиком важнее дальней, внутри ноды порядок по жанру."""
    return max(0, (LOOKAHEAD + 1 - distance)) * 1000 + genre.priority


def trajectory_after(conn: sqlite3.Connection, node: sqlite3.Row, count: int) -> list[sqlite3.Row]:
    """Следующие ноды по траектории раздела 4: этапы собесного минимума по возрастанию.

    Необязательные ветки в опережение не попадают (правило 5): контент по ним
    создаётся только триггером входа. Если ученик сам ушёл в такую ветку,
    список пустой, и генерится ровно та нода, в которую он вошёл.
    """
    stage = conn.execute("SELECT num, in_track FROM stages WHERE id = ?", (node["stage_id"],)).fetchone()
    if stage is None or not stage["in_track"]:
        return []
    return conn.execute(
        "SELECT n.*, s.num AS stage_num FROM nodes n JOIN stages s ON s.id = n.stage_id "
        "WHERE s.in_track = 1 AND n.status != 'closed' "
        "AND (s.num > ? OR (s.num = ? AND n.seq > ?)) "
        "ORDER BY s.num, n.seq LIMIT ?",
        (stage["num"], stage["num"], node["seq"], count),
    ).fetchall()


def node_row(conn: sqlite3.Connection, node_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM nodes WHERE id = ?", (node_id,)).fetchone()


def plan_node(conn: sqlite3.Connection, node: sqlite3.Row, distance: int = 0,
              force: bool = False) -> dict:
    """Поставить в очередь всё, чего ноде не хватает.

    Треки, у которых генерация выключена, пропускаются молча. Это не «пока не
    дошли руки»: промпты в prompts/ написаны под Java, и на ноде про SELECT они
    сочинили бы вопросы про классы. У раздела DBA банк лежит в самом конспекте
    фенсами и проверен по живой базе — генерировать там нечего.
    """
    if not config_mod.track_of_code(node["code"]).gen:
        return {"queued": [], "reserved": []}
    queued: list[str] = []
    reserved: list[str] = []
    for genre, _got in wanted(conn, node):
        if not genre.ready:
            reserved.append(f"{node['code']} {genre.kind}")
            continue
        job_id = queue.enqueue(
            conn, genre.kind, node_id=node["id"], stage_id=node["stage_id"],
            params={"count": genre.count, "node_code": node["code"], "distance": distance},
            priority=priority(genre, distance), force=force,
        )
        if job_id is not None:
            queued.append(f"{node['code']} {genre.kind}")
    return {"queued": queued, "reserved": reserved}


def plan_stage_articles(conn: sqlite3.Connection, stage_id: int, force: bool = False) -> list[str]:
    """Статьи этапа. Зовётся только руками из CLI."""
    stage = conn.execute("SELECT num FROM stages WHERE id = ?", (stage_id,)).fetchone()
    if stage is None:
        return []
    got = stage_articles(conn, stage_id)
    if got >= ARTICLE_GOAL and not force:
        return []
    job_id = queue.enqueue(
        conn, "article", node_id=None, stage_id=stage_id,
        params={"count": max(1, ARTICLE_GOAL - got)}, priority=10, force=force,
    )
    return [f"этап {stage['num']} article"] if job_id is not None else []


def on_node_entered(conn: sqlite3.Connection, node_id: int, lookahead: int = LOOKAHEAD,
                    force: bool = False) -> dict:
    """Триггер раздела 11: вход в ноду плюс опережение на пять нод вперёд.

    Коммит остаётся на вызывающем: вход в ноду и постановка заданий должны
    доехать до базы одной транзакцией, иначе очередь может знать про вход,
    которого не было.
    """
    node = node_row(conn, node_id)
    if node is None:
        return {"queued": [], "reserved": [], "nodes": 0}
    result = plan_node(conn, node, distance=0, force=force)
    nodes = 1
    for distance, ahead in enumerate(trajectory_after(conn, node, lookahead), start=1):
        step = plan_node(conn, ahead, distance=distance, force=force)
        result["queued"] += step["queued"]
        result["reserved"] += step["reserved"]
        nodes += 1
    result["nodes"] = nodes
    return result
