"""Карта роадмапа, вход в ноду и её закрытие.

Здесь живут правила прогрессии из раздела 4 плана:

1. после синка всё заперто, ноды первого этапа открыты (это делает sync);
2. вход в ноду переводит её в работу, это же триггер генерации для фазы 4;
3. закрытие ноды открывает следующую по коду внутри этапа;
4. этап траектории открывается, когда у предыдущего закрыто 90 процентов нод;
5. этапы вне собесного минимума это необязательные ветки, открываются тем же
   правилом от соседнего этапа траектории.

Открытие этапа переводит в available ВСЕ его запертые ноды, а не по одной:
именно так синк открывает первый этап (правило 1), и правило 3 остаётся
страховкой на случай, когда нода дописана в уже начатый этап.
"""

from __future__ import annotations

import json
import math
import sqlite3

from . import roadmap, xp
from . import config as config_mod
from .config import Config, TRACK_STAGES
from .contract import close_if_ready, enter_node
from .db import now, today

# Типы нод, которые по разделу 4 закрываются самоотметкой с конспектом.
SELF_KINDS = ("рукописная", "чтение JDK")
# Атомы, из которых состоит проверяемая часть ноды. Карточки сюда не входят:
# они общие на этап и повторяются по расписанию, а не «проходятся».
BANK_TYPES = ("quiz", "code", "readcode")
# Конспект своими словами. Короче этого не текст, а отписка.
NOTE_MIN = 60
BOSS_THRESHOLD = 0.9
# Пороги квиз-блока для закрытия ноды (раздел 4). Блок в 15 вопросов у типа «тест».
BLOCK_PASS = 0.8
BLOCK_SIZE = 10
TEST_BLOCK_SIZE = 15
# Синоним для читаемости в блоке оценки.
SELF_MARK_KINDS = SELF_KINDS

CLOSE_HINTS = {
    "note": "напиши своими словами, что понял. Это условие закрытия для этого типа ноды",
    "note_empty": "материала по ноде в банке пока нет. Закрой её самоотметкой с конспектом: "
                  "вопросы по этой теме придут позже, когда конвейер наполнит этап",
    "atoms": "нода закрывается прохождением своего материала: блок вопросов "
             "и зелёные код-задачи, если они у неё есть",
}


def _stage_targets(num: int) -> list[int]:
    """Какие этапы открываются, когда этап num дошёл до порога босса.

    Следующий этап траектории плюс необязательные ветки, лежащие между ними
    (правила 4 и 5 раздела 4). У последнего этапа траектории ветки это весь хвост.
    """
    track = sorted(TRACK_STAGES)
    if num not in track:
        return []
    later = [s for s in track if s > num]
    nxt = later[0] if later else None
    if nxt is None:
        return [num + i for i in range(1, 27) if num + i <= 26]
    return [nxt] + [s for s in range(num + 1, nxt) if s not in track]


def stage_rows(conn: sqlite3.Connection, track: str | None = None) -> list[sqlite3.Row]:
    """Этапы со счётчиками. Без track это все разделы разом — так считают
    открытие этапов и боссы, которым чужой раздел просто не встретится
    (там in_track = 0). Карта же спрашивает свой раздел явно."""
    if track is not None:
        return conn.execute(
            """
            SELECT s.id, s.num, s.title, s.in_track, s.track,
                   (SELECT COUNT(*) FROM nodes n WHERE n.stage_id = s.id) AS total,
                   (SELECT COUNT(*) FROM nodes n WHERE n.stage_id = s.id AND n.status = 'closed') AS closed,
                   (SELECT COUNT(*) FROM nodes n WHERE n.stage_id = s.id AND n.status = 'locked') AS locked,
                   (SELECT COUNT(*) FROM nodes n WHERE n.stage_id = s.id AND n.status = 'in_progress') AS working
            FROM stages s WHERE s.track = ? ORDER BY s.num
            """,
            (track,),
        ).fetchall()
    return conn.execute(
        """
        SELECT s.id, s.num, s.title, s.in_track, s.track,
               (SELECT COUNT(*) FROM nodes n WHERE n.stage_id = s.id) AS total,
               (SELECT COUNT(*) FROM nodes n WHERE n.stage_id = s.id AND n.status = 'closed') AS closed,
               (SELECT COUNT(*) FROM nodes n WHERE n.stage_id = s.id AND n.status = 'locked') AS locked,
               (SELECT COUNT(*) FROM nodes n WHERE n.stage_id = s.id AND n.status = 'in_progress') AS working
        FROM stages s ORDER BY s.num
        """
    ).fetchall()


def boss_at(total: int) -> int:
    """Сколько нод надо закрыть, чтобы открылся босс этапа. Считаем в нодах,
    а не в процентах: проценты в интерфейсе продукта не показываются."""
    if total == 0:
        return 0
    need = int(total * BOSS_THRESHOLD)
    while need / total < BOSS_THRESHOLD:
        need += 1
    return min(need, total)


def unlock_stages(conn: sqlite3.Connection) -> list[int]:
    """Открыть этапы, до которых дотянулся порог. Возвращает номера открытых."""
    opened: list[int] = []
    by_num = {r["num"]: r for r in stage_rows(conn)}
    for num, row in by_num.items():
        if not row["in_track"] or row["total"] == 0:
            continue
        if row["closed"] < boss_at(row["total"]):
            continue
        for target in _stage_targets(num):
            tgt = by_num.get(target)
            if tgt is None or tgt["locked"] == 0:
                continue
            conn.execute(
                "UPDATE nodes SET status = 'available' WHERE stage_id = ? AND status = 'locked'",
                (tgt["id"],),
            )
            opened.append(target)
    return sorted(set(opened))


def bank_size(conn: sqlite3.Connection, node_id: int) -> int:
    """Сколько живого материала висит на самой ноде."""
    marks = ", ".join("?" for _ in BANK_TYPES)
    return conn.execute(
        f"SELECT COUNT(*) FROM items WHERE node_id = ? AND active = 1 AND suspended = 0 "
        f"AND type IN ({marks})",
        (node_id, *BANK_TYPES),
    ).fetchone()[0]


def close_mode(conn: sqlite3.Connection, node: sqlite3.Row) -> str:
    """Как эту ноду закрывать прямо сейчас.

    Рукописные и чтение JDK всегда закрываются самоотметкой (раздел 4).
    Остальные типы с пустым банком тоже, но помечаются отдельно: иначе первый этап,
    где вопросов нет вообще, не закрыть в принципе. Всё остальное ждёт runner.
    """
    if node["kind"] in SELF_KINDS:
        return "note"
    return "note_empty" if bank_size(conn, node["id"]) == 0 else "atoms"


def node_by_code(conn: sqlite3.Connection, code: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT n.*, s.num AS stage_num, s.title AS stage_title FROM nodes n "
        "JOIN stages s ON s.id = n.stage_id WHERE n.code = ?",
        (code,),
    ).fetchone()


def _atom_title(type_: str, payload: str) -> str:
    try:
        data = json.loads(payload)
    except (ValueError, TypeError):
        return "запись банка"
    if type_ == "quiz":
        return data.get("q", "вопрос")
    if type_ == "card":
        return data.get("front", "карточка")
    if type_ == "readcode":
        return data.get("question", "чужой код")
    if type_ == "code":
        return data.get("title", "код-задача")
    return data.get("title", "запись банка")


ATOM_TITLES = {
    "quiz": "вопрос",
    "card": "карточка",
    "code": "код-задача",
    "readcode": "чужой код",
    "article": "статья",
}


def atoms(conn: sqlite3.Connection, node_id: int, limit: int = 60) -> list[dict]:
    """Список атомов ноды: из чего она состоит и что уже сделано."""
    rows = conn.execute(
        "SELECT i.id, i.type, i.payload, i.difficulty, i.suspended, "
        "  (SELECT COUNT(*) FROM attempts a WHERE a.item_id = i.id AND a.correct = 1) AS wins, "
        "  (SELECT reps FROM card_state cs WHERE cs.item_id = i.id) AS reps "
        "FROM items i WHERE i.node_id = ? AND i.active = 1 "
        "ORDER BY i.type, i.id LIMIT ?",
        (node_id, limit),
    ).fetchall()
    out = []
    for r in rows:
        done = bool(r["wins"]) if r["type"] != "card" else bool(r["reps"])
        out.append({
            "id": r["id"],
            "type": r["type"],
            "type_title": ATOM_TITLES.get(r["type"], r["type"]),
            "title": _atom_title(r["type"], r["payload"]),
            "difficulty": r["difficulty"],
            "done": done,
            "suspended": bool(r["suspended"]),
        })
    return out


def node_view(conn: sqlite3.Connection, node: sqlite3.Row) -> dict:
    """Всё, что нужно экрану ноды."""
    mode = close_mode(conn, node) if node["status"] != "closed" else (node["closed_by"] or "atoms")
    stage_pool = conn.execute(
        "SELECT COUNT(*) FROM items WHERE stage_id = ? AND node_id IS NULL "
        "AND type = 'quiz' AND active = 1 AND suspended = 0",
        (node["stage_id"],),
    ).fetchone()[0]
    return {
        "code": node["code"],
        "title": node["title"],
        "kind": node["kind"],
        "descr": node["descr"],
        "status": node["status"],
        "stage_num": node["stage_num"],
        # Номер, под которым этап живёт в волте: в базе он смещён на трек,
        # а в крошках надо показывать «этап 2», а не «этап 102».
        "stage_shown": config_mod.track_of_stage(node["stage_num"]).vault_num(node["stage_num"]),
        "track": config_mod.track_of_stage(node["stage_num"]).key,
        "lang": config_mod.track_of_stage(node["stage_num"]).lang,
        "stage_title": node["stage_title"],
        "obsidian_path": node["obsidian_path"],
        "closed_at": node["closed_at"],
        "closed_by": node["closed_by"],
        "close_note": node["close_note"],
        "atoms": atoms(conn, node["id"]),
        "stage_pool": stage_pool,
        "close": {
            "mode": mode,
            "needs_note": mode in ("note", "note_empty"),
            "note_min": NOTE_MIN,
            "hint": CLOSE_HINTS.get(mode, ""),
        },
    }


def enter(conn: sqlite3.Connection, code: str, day: str | None = None) -> dict:
    """Явный вход в ноду с карты."""
    day = day or today()
    node = node_by_code(conn, code)
    if node is None:
        raise LookupError(f"нет ноды {code}")
    if node["status"] == "closed":
        raise PermissionError("нода уже закрыта, войти в неё нельзя")
    if node["status"] == "locked":
        raise PermissionError("нода ещё заперта: сначала предыдущие ноды этапа")
    entry = enter_node(conn, node["id"])
    # Смена текущей ноды меняет цель дня: у новой ноды свой запас вопросов.
    # Без этой проверки день мог оказаться выполненным, но неоплаченным,
    # потому что контракт закрывается только из ответов на вопросы и карточки.
    contract_xp = close_if_ready(conn, day)
    conn.commit()
    node = node_by_code(conn, code)
    view = node_view(conn, node)
    view["entry"] = entry
    view["contract_xp"] = contract_xp
    return view


def _quiz_rows(conn: sqlite3.Connection, node: sqlite3.Row, scope: str,
               since: str | None) -> list[sqlite3.Row]:
    where = "i.node_id = :node_id" if scope == "node" else "i.stage_id = :stage_id"
    tail = " AND a.ts >= :since" if since else ""
    sql = (
        "SELECT i.id AS item_id, "
        f" (SELECT a.correct FROM attempts a WHERE a.item_id = i.id AND a.kind = 'quiz'{tail} "
        "  ORDER BY a.id DESC LIMIT 1) AS last_correct, "
        f" (SELECT MAX(a.id) FROM attempts a WHERE a.item_id = i.id AND a.kind = 'quiz'{tail}) AS last_id "
        "FROM items i "
        f"WHERE i.type = 'quiz' AND i.active = 1 AND {where}"
    )
    params = {"node_id": node["id"], "stage_id": node["stage_id"]}
    if since:
        params["since"] = since
    return list(conn.execute(sql, params))


def quiz_block(conn: sqlite3.Connection, node: sqlite3.Row) -> dict:
    """Состояние квиз-блока ноды: сколько нужно, сколько отвечено, какая доля верных."""
    kind = node["kind"]
    size = TEST_BLOCK_SIZE if kind == "тест" else BLOCK_SIZE
    scope = "stage" if kind == "повторение" else "node"
    since = node["entered_at"] if kind == "повторение" else None

    rows = _quiz_rows(conn, node, scope, since)
    answered = sorted((r for r in rows if r["last_id"]), key=lambda r: r["last_id"], reverse=True)
    need = min(size, len(rows))
    block = answered[:need]
    correct = sum(1 for r in block if r["last_correct"])
    ratio = (correct / len(block)) if block else 1.0
    return {
        "need": need,
        "answered": len(block),
        "correct": correct,
        "ratio": round(ratio, 2),
        "ok": need == 0 or (len(block) >= need and ratio >= BLOCK_PASS),
        "bank": len(rows),
    }


def code_atoms(conn: sqlite3.Connection, node_id: int) -> list[sqlite3.Row]:
    return list(conn.execute(
        "SELECT i.id, i.difficulty, ct.passed_at, i.payload "
        "FROM items i LEFT JOIN code_tasks ct ON ct.item_id = i.id "
        "WHERE i.type = 'code' AND i.active = 1 AND i.node_id = ?"
        " ORDER BY i.id",
        (node_id,),
    ))


def evaluate(conn: sqlite3.Connection, node_id: int) -> dict:
    """Готова ли нода к закрытию и почему."""
    node = conn.execute("SELECT * FROM nodes WHERE id = ?", (node_id,)).fetchone()
    if node is None:
        raise LookupError(f"нет ноды {node_id}")
    kind = node["kind"]
    out = {
        "node_id": node_id,
        "code": node["code"],
        "kind": kind,
        "status": node["status"],
        "self_mark": kind in SELF_MARK_KINDS,
        "ready": False,
        "why": "",
    }
    if node["status"] == "closed":
        out["why"] = "нода уже закрыта"
        return out
    if kind in SELF_MARK_KINDS:
        out["why"] = "этот тип закрывается самоотметкой с конспектом"
        return out

    atoms = code_atoms(conn, node_id)
    green = [a for a in atoms if a["passed_at"]]
    out["code_total"] = len(atoms)
    out["code_green"] = len(green)

    if kind == "проект":
        out["quiz"] = None
        out["ready"] = bool(atoms) and len(green) == len(atoms)
        out["why"] = (
            "код-задача этапа ещё не выдана" if not atoms
            else ("всё зелёное" if out["ready"] else "код-задача ещё не сдана")
        )
        return out

    block = quiz_block(conn, node)
    out["quiz"] = block
    code_ok = len(green) == len(atoms)
    if kind == "тест":
        code_ok = True
    out["ready"] = block["ok"] and code_ok
    if out["ready"]:
        out["why"] = "всё зелёное"
    elif not block["ok"]:
        # Считаем в штуках: доли внутри, наружу выходят только числа ответов.
        want = math.ceil(block["need"] * BLOCK_PASS)
        out["why"] = (
            f"вопросы: {block['correct']} верных из {block['answered']}, "
            f"для закрытия нужно {want} из {block['need']}"
        )
    else:
        out["why"] = f"код-задачи: зелёных {len(green)} из {len(atoms)}"
    return out


def _unlock_next_node(conn: sqlite3.Connection, node: sqlite3.Row) -> str | None:
    row = conn.execute(
        "SELECT id, code FROM nodes WHERE stage_id = ? AND seq > ? AND status = 'locked' "
        "ORDER BY seq LIMIT 1",
        (node["stage_id"], node["seq"]),
    ).fetchone()
    if row is None:
        return None
    conn.execute("UPDATE nodes SET status = 'available' WHERE id = ?", (row["id"],))
    return row["code"]


def close_node(conn: sqlite3.Connection, cfg: Config, node_id: int, day: str | None = None,
               reason: str = "", closed_by: str = "atoms", note: str | None = None,
               pay: bool = True) -> dict:
    """Единственный путь закрытия ноды: и автоматический, и самоотметкой.

    Платит 100 XP один раз, ведёт счётчик дня, открывает следующую ноду и дошедшие
    до порога этапы, зеркалит чекбокс в хабе и пересчитывает контракт дня.

    pay=False это отметка «я это и так знаю»: нода закрывается по-настоящему,
    но денег за неё не платят и день ею не выполняется. Правило то же, что у
    кнопки «изучил» на вопросе: XP только за сделанную работу, а не за нажатую
    кнопку. Разблокировка следующей ноды, этапы и галочка в хабе при этом идут
    как обычно, иначе отметка не давала бы пойти дальше и была бы бесполезна.
    """
    day = day or today()
    node = conn.execute("SELECT * FROM nodes WHERE id = ?", (node_id,)).fetchone()
    if node is None:
        raise LookupError(f"нет ноды {node_id}")
    if node["status"] == "closed":
        return {"closed": False, "code": node["code"], "xp": 0, "unlocked": None,
                "stages_opened": [], "hub_marked": False, "contract_xp": 0}

    conn.execute(
        "UPDATE nodes SET status = 'closed', closed_at = ?, closed_by = ?, close_note = ? "
        "WHERE id = ?",
        (now(), closed_by, note, node_id),
    )
    gained = 0
    if pay:
        if not xp.already_paid(conn, xp.NODE_CLOSED, "node", node_id):
            gained = xp.award(conn, xp.AMOUNTS[xp.NODE_CLOSED], xp.NODE_CLOSED, "node", node_id, day)
        xp.bump(conn, day, "nodes_closed")

    unlocked = _unlock_next_node(conn, node)
    opened = unlock_stages(conn)

    # Соперник обязан заметить, что ученик закрыл ноду. Функция для этого была
    # написана фазой 5, но при слиянии веток её никто не звал, и лента молчала.
    # Отметка «знаю» в ленту не идёт: соперник комментирует работу, а не то,
    # что человек пролистал знакомую тему.
    if pay:
        try:
            import random

            from . import seasons

            seasons.note_user_node(conn, day, random.Random())
        except Exception as exc:  # noqa: BLE001
            print(f"лента соперника промолчала ({exc}), нода всё равно закрыта")
    # Закрытая нода уступает место следующей, а у той свой запас вопросов:
    # цель дня могла ужаться ровно до того, что уже сделано.
    contract_xp = close_if_ready(conn, day)
    conn.commit()

    # Волт живёт своей жизнью: он может быть на сетевом диске, открыт в Obsidian,
    # быть только для чтения. Упавшая галочка не должна отменять закрытую ноду.
    try:
        hub_marked = roadmap.mark_hub_checkbox(cfg, conn, node["code"], True)
    except OSError as exc:
        print(f"галочку в хабе поставить не вышло ({exc}), нода закрыта, поправь руками")
        hub_marked = False
    return {
        "closed": True,
        "code": node["code"],
        "title": node["title"],
        "kind": node["kind"],
        "xp": gained,
        "reason": reason,
        "closed_by": closed_by,
        "unlocked": unlocked,
        "stages_opened": opened,
        "hub_marked": hub_marked,
        "contract_xp": contract_xp,
    }


def close(conn: sqlite3.Connection, cfg: Config, code: str, note: str,
          day: str | None = None) -> dict:
    """Закрыть ноду самоотметкой с конспектом. Это путь с экрана ноды на карте."""
    day = day or today()
    node = node_by_code(conn, code)
    if node is None:
        raise LookupError(f"нет ноды {code}")
    if node["status"] == "closed":
        raise PermissionError("нода уже закрыта")
    if node["status"] == "locked":
        raise PermissionError("нода ещё заперта")

    mode = close_mode(conn, node)
    if mode == "atoms":
        raise PermissionError(CLOSE_HINTS["atoms"])
    note = (note or "").strip()
    if len(note) < NOTE_MIN:
        raise ValueError(
            f"конспект обязателен: своими словами, что понял, хотя бы {NOTE_MIN} символов"
        )

    res = close_node(conn, cfg, node["id"], day=day, reason="самоотметка",
                     closed_by=mode, note=note)
    return {
        "code": code,
        "xp": res["xp"],
        "closed_by": mode,
        "unlocked_node": res["unlocked"],
        "opened_stages": res["stages_opened"],
        "hub_marked": res["hub_marked"],
        "contract_xp": res["contract_xp"],
    }


def know(conn: sqlite3.Connection, cfg: Config, code: str, day: str | None = None) -> dict:
    """Закрыть ноду отметкой «я это и так знаю». Без XP и без цели дня.

    Кнопка для материала, который человек знал до нас: перебирать три десятка
    вопросов по теме, которую он уже держит в голове, — это не учёба, а налог.
    Работает так же, как «изучил» на одном вопросе, только сразу на всю ноду:
    неотвеченные вопросы получают отметку known (и перестают всплывать в
    задачнике и повторениях), нода закрывается, следующая открывается.

    Чего эта кнопка не делает: не платит 100 XP за закрытие, не двигает счётчик
    закрытых нод за день и не сдаёт код-задачи. Код-задача так и остаётся
    несданной — соврать про написанный код нельзя, можно только про знание темы.
    """
    day = day or today()
    node = node_by_code(conn, code)
    if node is None:
        raise LookupError(f"нет ноды {code}")
    if node["status"] == "closed":
        raise PermissionError("нода уже закрыта")
    if node["status"] == "locked":
        raise PermissionError("нода ещё заперта, до неё нужно дойти")

    # Отмечаем только те вопросы, на которые человек ещё не ответил верно сам:
    # чужую честную победу переписывать в «знаю» незачем, она уже оплачена.
    rows = conn.execute(
        "SELECT id, payload FROM items WHERE node_id = ? AND active = 1 AND suspended = 0 "
        "AND type IN ('quiz', 'readcode') "
        "AND id NOT IN (SELECT item_id FROM attempts WHERE correct = 1)",
        (node["id"],),
    ).fetchall()
    for row in rows:
        payload = json.loads(row["payload"])
        ans = payload.get("ans", 0)
        conn.execute(
            "INSERT INTO attempts(item_id, node_id, kind, ts, correct, result, xp) "
            "VALUES (?, ?, 'quiz', ?, 1, ?, 0)",
            (row["id"], node["id"], now(),
             json.dumps({"choice": int(ans), "ans": ans, "known": True}, ensure_ascii=False)),
        )

    atoms_left = [a for a in code_atoms(conn, node["id"]) if not a["passed_at"]]
    cards_left = conn.execute(
        "SELECT COUNT(*) FROM items WHERE node_id = ? AND type = 'card' "
        "AND active = 1 AND suspended = 0",
        (node["id"],),
    ).fetchone()[0]

    res = close_node(conn, cfg, node["id"], day=day, reason="отмечено как знакомое",
                     closed_by="known", pay=False)
    return {
        "code": code,
        "title": node["title"],
        "xp": 0,
        "marked": len(rows),
        "tasks_left": len(atoms_left),
        "cards_left": cards_left,
        "unlocked_node": res["unlocked"],
        "opened_stages": res["stages_opened"],
        "hub_marked": res["hub_marked"],
        "contract_xp": res["contract_xp"],
    }


def know_many(conn: sqlite3.Connection, cfg: Config, codes: list[str],
              day: str | None = None) -> list[dict]:
    """Отметить «знаю» сразу на пачке нод. Возвращает разбор по каждой.

    Порядок обязателен: идём по seq, снизу вверх по этапу. Закрытая нода
    открывает следующую, и если человек выделил подряд идущие ноды, отметка
    сверху вниз наткнулась бы на «нода ещё заперта» ровно там, где она уже
    вот-вот открылась бы сама.

    Ошибка на одной ноде не отменяет остальные: пачка это не транзакция, а
    список независимых отметок. Что не прошло — вернём с причиной, экран
    покажет её человеку, а не проглотит.
    """
    day = day or today()
    wanted = list(dict.fromkeys(c.strip() for c in codes if c and c.strip()))
    if not wanted:
        return []
    order = {
        row["code"]: row["seq"]
        for row in conn.execute(
            "SELECT code, stage_id * 100000 + seq AS seq FROM nodes WHERE code IN "
            f"({','.join('?' * len(wanted))})", wanted)
    }
    out = []
    for code in sorted(wanted, key=lambda c: order.get(c, 1 << 30)):
        try:
            res = know(conn, cfg, code, day=day)
        except (LookupError, PermissionError) as exc:
            out.append({"code": code, "ok": False, "error": str(exc)})
        else:
            out.append({**res, "ok": True, "error": ""})
    return out


def check_node(conn: sqlite3.Connection, cfg: Config, node_id: int | None,
               day: str | None = None) -> dict | None:
    """Посмотреть, не пора ли закрыть ноду, и закрыть, если пора."""
    if not node_id:
        return None
    verdict = evaluate(conn, node_id)
    if not verdict["ready"]:
        return None
    return close_node(conn, cfg, node_id, day=day, reason=verdict["why"])
