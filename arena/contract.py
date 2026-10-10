"""Дневной контракт: что именно составляет пол в 15 минут и как он закрывается.

Правила из раздела 6 плана. Главное здесь не арифметика, а тон: цель дня всегда
достижима. Если вопросов в банке меньше десяти, контракт просит столько, сколько есть,
и закрывается честно. Понятия «норма не выполнена» в продукте нет, поэтому и здесь
нет ни одной ветки, где день оказывается провальным.
"""

from __future__ import annotations

import json
import sqlite3

from . import pace, srs, xp
from .config import Config
from .db import now, now_ms, today

def _progress():
    """progress подключается лениво: модули ссылаются друг на друга,
    и импорт на верхнем уровне замкнул бы круг."""
    from . import progress

    return progress


# Отметка «изучил» живёт внутри attempts.result, своей колонки под неё нет.
# Отличать её от честного ответа приходится в двух местах: в счёте первой победы
# и в оплате дня. Нода такую отметку видит как обычный Клиент A ответ — в этом её
# смысл, — а касса не видит вообще.
NOT_KNOWN = "COALESCE(json_extract(result, '$.known'), 0) = 0"

QUIZ_TARGET = 10
CARDS_TARGET = 10
CODE_TARGET = 1
BLOCK_PASS = 0.8

SOURCE_TITLES = {
    "node": "вопросы по текущей ноде",
    "stage": "вопросы по текущему этапу",
    "repeat": "повторение пройденного",
}


def current_node(conn: sqlite3.Connection) -> sqlite3.Row | None:
    """Правило 3 раздела «Прогрессия»: последняя нода, в которую заходили,
    иначе первая незакрытая по траектории."""
    row = conn.execute(
        "SELECT n.*, s.num AS stage_num, s.title AS stage_title FROM nodes n "
        "JOIN stages s ON s.id = n.stage_id WHERE n.status = 'in_progress' "
        "ORDER BY n.entered_at DESC, n.id DESC LIMIT 1"
    ).fetchone()
    if row is not None:
        return row
    return conn.execute(
        "SELECT n.*, s.num AS stage_num, s.title AS stage_title FROM nodes n "
        "JOIN stages s ON s.id = n.stage_id WHERE n.status != 'closed' AND s.in_track = 1 "
        "ORDER BY s.num, n.seq LIMIT 1"
    ).fetchone()


def enter_node(conn: sqlite3.Connection, node_id: int, refresh: bool = True) -> str | None:
    """Перевести ноду в работу.

    Возвращает «new» при первом входе (это триггер генерации для фазы 4),
    «again» при повторном и None, если войти нельзя.

    entered_at обновляется на каждом явном входе: по нему выбирается текущая нода,
    когда открыто несколько. Экран «Сегодня» зовёт с refresh=False, чтобы простое
    открытие вкладки не перетягивало текущую ноду на себя.
    """
    row = conn.execute("SELECT status FROM nodes WHERE id = ?", (node_id,)).fetchone()
    if row is None or row["status"] == "closed":
        return None
    if row["status"] == "in_progress":
        if not refresh:
            return None
        conn.execute("UPDATE nodes SET entered_at = ? WHERE id = ?", (now_ms(), node_id))
        return "again"
    conn.execute(
        "UPDATE nodes SET status = 'in_progress', entered_at = ? WHERE id = ?", (now_ms(), node_id)
    )
    # Первый вход в ноду это триггер конвейера (раздел 11): ставим задания на неё
    # и на пять нод вперёд по траектории. Планировщик только пишет в очередь,
    # модель зовёт воркер, поэтому экран «Сегодня» здесь ничего не ждёт.
    # Импорт ленивый: конвейеру нужен contract, а не наоборот.
    from . import gen

    gen.trigger(conn, node_id)
    return "new"


def _quiz_query(scope: str) -> str:
    scopes = {
        # Вопросы, привязанные к самой ноде.
        "node": "i.node_id = :node_id",
        # Общий пул этапа, но только пройденное. Вопрос, привязанный к ноде,
        # до которой ученик ещё не дошёл, это спойлер: он оказывается на экране
        # раньше самой темы. Берём вопросы без ноды (импортированный пул этапа)
        # и вопросы нод, которые уже закрыты или сейчас в работе.
        "stage": "i.stage_id = :stage_id AND (i.node_id IS NULL OR i.node_id IN "
                 "(SELECT id FROM nodes WHERE status IN ('closed', 'in_progress')))",
        # Повторение: этапы, где что-то уже закрыто, и снова только пройденное.
        # В запертые этапы вперёд не лезем, иначе в нулевой день прилетит HashMap.
        "repeat": "i.stage_id IN (SELECT DISTINCT stage_id FROM nodes WHERE status = 'closed') "
                  "AND (i.node_id IS NULL OR i.node_id IN "
                  "(SELECT id FROM nodes WHERE status IN ('closed', 'in_progress')))",
    }
    return (
        "SELECT i.id, i.payload, i.node_id, i.stage_id, i.difficulty, "
        "  (SELECT COUNT(*) FROM attempts a WHERE a.item_id = i.id) AS tries, "
        "  (SELECT COUNT(*) FROM attempts a WHERE a.item_id = i.id AND a.correct = 1) AS wins "
        "FROM items i "
        "WHERE i.type IN ('quiz', 'readcode') AND i.active = 1 AND i.suspended = 0 "
        f"AND {scopes[scope]} "
        "AND i.id NOT IN (SELECT item_id FROM attempts WHERE kind = 'quiz' AND date(ts) = :day) "
        "ORDER BY wins, tries, i.id "
    )


def quiz_candidates(conn: sqlite3.Connection, node: sqlite3.Row | None, day: str,
                    limit: int = 1) -> tuple[str | None, list[sqlite3.Row]]:
    """Найти источник вопросов на сегодня и вернуть очередь из него."""
    if node is None:
        return None, []
    params = {"node_id": node["id"], "stage_id": node["stage_id"], "day": day}
    for scope in ("node", "stage", "repeat"):
        rows = list(conn.execute(_quiz_query(scope) + f"LIMIT {int(limit)}", params))
        if rows:
            return scope, rows
    return None, []


def quiz_available(conn: sqlite3.Connection, node: sqlite3.Row | None, day: str,
                   limit: int = QUIZ_TARGET) -> tuple[str | None, int]:
    source, rows = quiz_candidates(conn, node, day, limit=limit)
    return source, len(rows)


def code_option(conn: sqlite3.Connection, node: sqlite3.Row | None) -> dict:
    """Микрозадачка кода как альтернатива карточкам (раздел 6 плана).

    Берём несданную задачу текущей ноды, а если её там нет, ближайшую по траектории.
    Запертые этапы не трогаем по тому же правилу, что и вопросы.
    """
    row = conn.execute(
        "SELECT i.id, i.difficulty, i.payload, n.code AS node_code, n.title AS node_title "
        "FROM items i JOIN nodes n ON n.id = i.node_id JOIN stages s ON s.id = n.stage_id "
        "LEFT JOIN code_tasks ct ON ct.item_id = i.id "
        "WHERE i.type = 'code' AND i.active = 1 AND i.suspended = 0 "
        "AND n.status != 'locked' AND ct.passed_at IS NULL "
        "ORDER BY (n.id = :node_id) DESC, n.status = 'in_progress' DESC, s.num, n.seq, "
        "i.difficulty LIMIT 1",
        {"node_id": node["id"] if node is not None else -1},
    ).fetchone()
    if row is None:
        return {"available": False, "item_id": None, "title": "", "node_code": "",
                "difficulty": 0, "xp": 0}
    payload = json.loads(row["payload"])
    return {
        "available": True,
        "item_id": row["id"],
        "title": payload.get("title", "код-задача"),
        "node_code": row["node_code"],
        "node_title": row["node_title"],
        "difficulty": row["difficulty"],
        "xp": xp.code_amount(row["difficulty"]),
    }


def state(conn: sqlite3.Connection, day: str | None = None, mark_entry: bool = False) -> dict:
    """Полное состояние дня для экрана «Сегодня»."""
    day = day or today()
    node = current_node(conn)
    if mark_entry and node is not None and enter_node(conn, node["id"], refresh=False):
        conn.commit()
        node = current_node(conn)

    xp.ensure_day(conn, day)
    row = conn.execute("SELECT * FROM days WHERE date = ?", (day,)).fetchone()
    quiz_done, cards_done, code_done = row["quiz_count"], row["cards_count"], row["code_count"]

    # Потолки контракта обычно QUIZ_TARGET и CARDS_TARGET, но в раскатке после
    # паузы они ниже: вернуться должно быть легко (раздел 6).
    quiz_cap, cards_cap = pace.contract_caps(conn, day)
    source, quiz_left = quiz_available(conn, node, day, limit=quiz_cap)
    cards_left = len(srs.queue(conn, day, limit=cards_cap))
    code = code_option(conn, node)

    # Цель никогда не бывает недостижимой: просим столько, сколько реально есть.
    quiz_target = min(quiz_cap, quiz_done + quiz_left)
    cards_target = min(cards_cap, cards_done + cards_left)
    code_target = CODE_TARGET if (code["available"] or code_done) else 0

    # Вторая половина контракта закрывается карточками ИЛИ микрозадачкой кода:
    # это альтернатива из раздела 6, а не дополнительная обязанность.
    halves: list[bool] = []
    if quiz_target:
        halves.append(quiz_done >= quiz_target)
    if cards_target or code_target:
        halves.append(
            bool(cards_target and cards_done >= cards_target)
            or bool(code_target and code_done >= code_target)
        )
    done = bool(row["contract_done"]) or (bool(halves) and all(halves))

    node_info = None
    if node is not None:
        node_info = {
            "code": node["code"],
            "title": node["title"],
            "kind": node["kind"],
            "descr": node["descr"],
            "status": node["status"],
            "stage_num": node["stage_num"],
            "stage_title": node["stage_title"],
            "obsidian_path": node["obsidian_path"],
        }

    return {
        "date": day,
        "node": node_info,
        "contract": {
            "quiz_target": quiz_target,
            "quiz_done": quiz_done,
            "cards_target": cards_target,
            "cards_done": cards_done,
            "code_target": code_target,
            "code_done": code_done,
            "code": code,
            "done": done or bool(row["contract_done"]),
            "closed": bool(row["contract_done"]),
            "quiz_source": source,
            "quiz_source_title": SOURCE_TITLES.get(source or "", ""),
        },
        "xp": xp.totals(conn, day),
        "streak": xp.streak(conn, day),
    }


def _block_bonus(conn: sqlite3.Connection, day: str) -> int:
    """Бонус за блок из десяти вопросов, если попал в 80 процентов и выше."""
    rows = conn.execute(
        "SELECT correct FROM attempts WHERE kind = 'quiz' AND date(ts) = ? "
        f"AND {NOT_KNOWN} ORDER BY id", (day,)
    ).fetchall()
    # В раскатке блок короче, и бонус за него всё равно платится: урезанный день
    # не должен ещё и лишать награды.
    block = pace.contract_caps(conn, day)[0]
    if len(rows) != block:
        return 0
    rows = rows[:block]
    already = conn.execute(
        "SELECT COUNT(*) FROM xp_ledger WHERE reason = ? AND date(ts) = ?", (xp.QUIZ_BLOCK, day)
    ).fetchone()[0]
    if already:
        return 0
    correct = sum(1 for r in rows if r["correct"])
    if correct / len(rows) < BLOCK_PASS:
        return 0
    return xp.award(conn, xp.AMOUNTS[xp.QUIZ_BLOCK], xp.QUIZ_BLOCK, day=day)


def close_if_ready(conn: sqlite3.Connection, day: str) -> int:
    """Закрыть контракт дня, если он выполнен. Платим один раз."""
    row = conn.execute("SELECT * FROM days WHERE date = ?", (day,)).fetchone()
    if row is None or row["contract_done"]:
        return 0
    snapshot = state(conn, day)
    contract = snapshot["contract"]
    if not contract["done"]:
        return 0
    conn.execute("UPDATE days SET contract_done = 1 WHERE date = ?", (day,))
    return xp.award(conn, xp.AMOUNTS[xp.CONTRACT], xp.CONTRACT, day=day)


def answer_quiz(conn: sqlite3.Connection, item_id: int, choice: int, day: str | None = None,
                cfg: Config | None = None) -> dict:
    day = day or today()
    item = conn.execute(
        "SELECT id, payload, node_id, stage_id, type FROM items WHERE id = ? "
        "AND type IN ('quiz', 'readcode')", (item_id,)
    ).fetchone()
    if item is None:
        raise LookupError("нет такого вопроса")
    payload = json.loads(item["payload"])
    # choice == -1: пользователь нажал «знаю» (клавиша r) — честный self-report для
    # быстрого прогона известных вопросов: засчитываем верно и раскрываем ответ.
    # choice == -2: «изучил» — то же самое, но без оплаты. Это кнопка для материала,
    # который человек знал ещё до нас: нода от неё дозревает, XP не капает и день
    # ею не выполняется. Иначе это была бы кнопка бесплатного XP.
    known = int(choice) == -2
    if int(choice) < 0:
        choice = int(payload["ans"])
        correct = True
    else:
        correct = int(choice) == int(payload["ans"])

    # Ответы на экзамене босса (kind='boss') сюда не считаются: экзамен не должен
    # обесценивать обычную петлю, иначе разобранный на боссе вопрос платил бы потом
    # два XP вместо десяти. Экзамен платит рангом, а петля своими ставками.
    first_win = conn.execute(
        "SELECT COUNT(*) FROM attempts WHERE item_id = ? AND kind = 'quiz' AND correct = 1 "
        f"AND {NOT_KNOWN}",
        (item_id,),
    ).fetchone()[0] == 0
    # Один и тот же вопрос платит один раз в день: иначе повтор превращается
    # в кнопку фарма, которую можно жать бесконечно. Считаем именно оплату, а не
    # попытки: промах утром не должен обнулять честный правильный ответ вечером.
    paid_today = xp.paid_today(conn, "item", item_id, day)

    gained = 0
    if correct and not paid_today and not known:
        reason = xp.QUIZ_FIRST if first_win else xp.QUIZ_REPEAT
        gained = xp.award(conn, xp.AMOUNTS[reason], reason, "item", item_id, day)

    conn.execute(
        "INSERT INTO attempts(item_id, node_id, kind, ts, correct, result, xp) "
        "VALUES (?, ?, 'quiz', ?, ?, ?, ?)",
        (item_id, item["node_id"], now(), 1 if correct else 0,
         json.dumps({"choice": int(choice), "ans": payload["ans"],
                     **({"known": True} if known else {})}, ensure_ascii=False), gained),
    )
    # Отметка «изучил» не двигает цель дня: пятнадцать минут это про сделанную
    # работу, а не про нажатую кнопку.
    if not known:
        xp.bump(conn, day, "quiz_count")

    bonus = _block_bonus(conn, day)
    closed = close_if_ready(conn, day)
    conn.commit()

    # Ответ на вопрос это событие, после которого нода может дозреть до закрытия
    # (раздел 4: квиз-блок на 80 процентов плюс зелёные код-атомы).
    node_closed = None
    if item["node_id"]:
        from .config import load as load_cfg

        node_closed = _progress().check_node(conn, cfg or load_cfg(), item["node_id"], day=day)
    return {
        "correct": correct,
        "ans": payload["ans"],
        "exp": payload.get("exp", ""),
        "xp": gained,
        "bonus": bonus,
        "contract_xp": closed,
        "first_win": first_win,
        "known": known,
        "node_closed": node_closed,
    }


def answer_card(conn: sqlite3.Connection, item_id: int, grade: str, day: str | None = None) -> dict:
    day = day or today()
    allowed = {row["id"] for row in srs.queue(conn, day, limit=srs.NEW_PER_DAY * 3)}
    in_time = item_id in allowed
    result = srs.grade_card(conn, item_id, grade, day)

    gained = xp.award(conn, xp.AMOUNTS[xp.CARD], xp.CARD, "item", item_id, day) if in_time else 0
    conn.execute(
        "INSERT INTO attempts(item_id, node_id, kind, ts, correct, result, xp) "
        "VALUES (?, NULL, 'card', ?, ?, ?, ?)",
        (item_id, now(), 0 if grade == "again" else 1,
         json.dumps({**result, "in_time": in_time}, ensure_ascii=False), gained),
    )
    if in_time:
        xp.bump(conn, day, "cards_count")
    closed = close_if_ready(conn, day)
    conn.commit()
    return {"xp": gained, "contract_xp": closed, **result}
