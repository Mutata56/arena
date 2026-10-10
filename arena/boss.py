"""Босс этапа: вариант, экзамен, ранг, реванш и мини-сет к нему.

Раздел 7 плана. Коротко правила, чтобы их не приходилось выуживать из кода:

- босс открывается, когда закрыто 90 процентов нод этапа (порог считает
  `progress.boss_at`, отдельной арифметики здесь нет);
- вариант это 20 вопросов из банка этапа плюс одна или две код-задачи;
  вопросы взвешены к темам, где ученик промахивался;
- таймер квиз-части 30 минут у экрана, код-часть отдельно и до 40 минут;
- ранги: S это 95 процентов и укладывание в 70 процентов таймера, A это 85,
  B это 70 и он проходной, ниже семидесяти это C и этап не сдан;
- ранг C платит 100 XP разведки боем и оставляет точную карту проваленных тем,
  из которой собирается мини-сет на день до реванша;
- реванш через сутки, вопросы прошлых попыток в новый вариант не попадают.

Что экзамен НЕ делает: не платит обычный XP за вопросы и код, не двигает
счётчики дня и не закрывает ноды. Иначе двадцать вопросов босса закрывали бы
дневной контракт бесплатно, а зачтённая код-задача дарила бы закрытие ноды.
Ответы всё равно пишутся в attempts с пометкой kind='boss': по ним считается
карта ошибок, и статистика видит экзамен, но денег он не приносит.
"""

from __future__ import annotations

import json
import os
import random
import sqlite3

from . import devclock, progress, xp
from .config import Config
from .db import now, today

QUIZ_COUNT = 20
QUIZ_LIMIT_SEC = 30 * 60
CODE_LIMIT_SEC = 40 * 60
CODE_MAX = 2
# Сколько вопросов «весит» одна код-задача в общем счёте варианта.
CODE_WEIGHT = 5
# Ранг S требует уложиться в эту долю таймера.
S_TIME_SHARE = 0.7
THRESHOLDS = (("S", 0.95), ("A", 0.85), ("B", 0.70))
PASS_RANKS = ("S", "A", "B")
REVENGE_HOURS = 24
# Потолок на одну тему в варианте: экзамен по двум темам это уже не экзамен этапа.
TOPIC_CAP_DIV = 4
# Вес темы, где были промахи: 1 + 3 за каждый промах, но не больше трёх промахов.
WEAK_WEIGHT = 3.0
WEAK_CAP = 3
MINISET_QUIZ = 12
MINISET_CARDS = 8
# Гейт босса можно обойти только в песочнице: это нужно приёмкам фаз 6 и 7.
DEV_ANY = "ARENA_DEV_BOSS_ANY"

RANK_TITLES = {
    "S": "ранг S",
    "A": "ранг A",
    "B": "ранг B",
    "C": "ранг C",
}


class BossError(Exception):
    """Внятный отказ: экран показывает текст как есть."""


# ---------------------------------------------------------------- доступность

def stage_by_num(conn: sqlite3.Connection, num: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM stages WHERE num = ?", (int(num),)).fetchone()
    if row is None:
        raise LookupError(f"нет этапа {num}")
    return row


def gate(conn: sqlite3.Connection, stage_id: int) -> dict:
    """Открыт ли босс. Считаем в нодах, доли наружу не отдаём (раздел 6)."""
    row = conn.execute(
        "SELECT COUNT(*) AS total, "
        "  COALESCE(SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END), 0) AS closed "
        "FROM nodes WHERE stage_id = ?",
        (stage_id,),
    ).fetchone()
    total, closed = row["total"], row["closed"]
    need = progress.boss_at(total)
    return {
        "total": total,
        "closed": closed,
        "need": need,
        "left": max(0, need - closed),
        "ready": total > 0 and closed >= need,
    }


def dev_gate_off(cfg: Config) -> bool:
    """Обход гейта. В боевом профиле переменная не работает и это не обсуждается."""
    if not os.environ.get(DEV_ANY):
        return False
    if not cfg.is_sandbox:
        print("боевой профиль: обход гейта босса игнорируется")
        return False
    return True


# ---------------------------------------------------------------- банк этапа

STAGE_SCOPE = ("(i.stage_id = :stage_id OR i.node_id IN "
               "(SELECT id FROM nodes WHERE stage_id = :stage_id))")


def topic_of(payload: str) -> str:
    try:
        data = json.loads(payload)
    except (TypeError, ValueError):
        return ""
    return (data.get("topic") or "").strip().lower()


def error_map(conn: sqlite3.Connection, stage_id: int) -> dict[str, int]:
    """Сколько промахов ученик сделал по каждой теме этапа.

    Считаются и обычные ответы, и ответы прошлых боссов: экзамен как раз и есть
    самый честный источник карты дыр.
    """
    rows = conn.execute(
        "SELECT i.payload, a.correct FROM attempts a JOIN items i ON i.id = a.item_id "
        f"WHERE i.type = 'quiz' AND a.kind IN ('quiz', 'boss') AND {STAGE_SCOPE}",
        {"stage_id": stage_id},
    ).fetchall()
    weak: dict[str, int] = {}
    for row in rows:
        if row["correct"]:
            continue
        topic = topic_of(row["payload"])
        if topic:
            weak[topic] = weak.get(topic, 0) + 1
    return weak


def quiz_bank(conn: sqlite3.Connection, stage_id: int) -> list[sqlite3.Row]:
    return list(conn.execute(
        "SELECT i.id, i.payload, i.difficulty, "
        "  (SELECT MAX(a.id) FROM attempts a WHERE a.item_id = i.id AND a.kind = 'boss') AS last_boss "
        "FROM items i "
        f"WHERE i.type = 'quiz' AND i.active = 1 AND i.suspended = 0 AND {STAGE_SCOPE} "
        "ORDER BY i.id",
        {"stage_id": stage_id},
    ))


def used_before(conn: sqlite3.Connection, stage_id: int) -> set[int]:
    """Вопросы, которые уже были на боссах этого этапа."""
    used: set[int] = set()
    for row in conn.execute(
        "SELECT questions FROM bosses WHERE stage_id = ? AND kind = 'stage'", (stage_id,)
    ):
        try:
            used.update(int(x) for x in json.loads(row["questions"] or "[]"))
        except (TypeError, ValueError):
            continue
    return used


def pick_quizzes(rows: list[sqlite3.Row], want: int, weak: dict[str, int],
                 rng: random.Random) -> list[int]:
    """Взвешенная выборка без повторов.

    Тема, где ученик мазал, весит больше, но одна тема не может занять больше
    четверти варианта: босс проверяет этап, а не два больных места.
    """
    pool = list(rows)
    cap = max(3, want // TOPIC_CAP_DIV)
    weights = {
        r["id"]: 1.0 + WEAK_WEIGHT * min(weak.get(topic_of(r["payload"]), 0), WEAK_CAP)
        for r in pool
    }
    topics = {r["id"]: topic_of(r["payload"]) for r in pool}
    taken: dict[str, int] = {}
    chosen: list[int] = []

    while pool and len(chosen) < want:
        allowed = [r for r in pool if taken.get(topics[r["id"]], 0) < cap or not topics[r["id"]]]
        if not allowed:
            # Потолок мешает набрать вариант целиком: снимаем его, недобор хуже.
            allowed = pool
        total = sum(weights[r["id"]] for r in allowed)
        dart = rng.random() * total
        pick = allowed[-1]
        for r in allowed:
            dart -= weights[r["id"]]
            if dart <= 0:
                pick = r
                break
        chosen.append(pick["id"])
        taken[topics[pick["id"]]] = taken.get(topics[pick["id"]], 0) + 1
        pool = [r for r in pool if r["id"] != pick["id"]]
    return chosen


def build_variant(conn: sqlite3.Connection, stage_id: int, want: int = QUIZ_COUNT,
                  rng: random.Random | None = None) -> tuple[list[int], dict[str, int]]:
    """Собрать вопросы варианта. Возвращает список id и карту ошибок, по которой взвешивали."""
    rng = rng or random.Random()
    bank = quiz_bank(conn, stage_id)
    if not bank:
        raise BossError(
            "вариант не собрать: в банке этапа нет ни одного вопроса. "
            "Наполни этап, и босс появится"
        )
    weak = error_map(conn, stage_id)
    used = used_before(conn, stage_id)
    fresh = [r for r in bank if r["id"] not in used]
    if len(fresh) >= want:
        return pick_quizzes(fresh, want, weak, rng), weak
    # Свежих не хватает: добираем самыми давними из уже задававшихся.
    chosen = pick_quizzes(fresh, len(fresh), weak, rng)
    stale = sorted((r for r in bank if r["id"] in used),
                   key=lambda r: (r["last_boss"] or 0))
    for row in stale:
        if len(chosen) >= want:
            break
        chosen.append(row["id"])
    return chosen, weak


def code_bank(conn: sqlite3.Connection, stage_id: int) -> list[sqlite3.Row]:
    return list(conn.execute(
        "SELECT i.id, i.difficulty, i.payload, n.code AS node_code, n.title AS node_title, "
        "       n.id AS node_id, s.num AS stage_num "
        "FROM items i JOIN nodes n ON n.id = i.node_id JOIN stages s ON s.id = n.stage_id "
        "WHERE i.type = 'code' AND i.active = 1 AND i.suspended = 0 AND n.stage_id = :stage_id "
        "ORDER BY i.difficulty DESC, i.id",
        {"stage_id": stage_id},
    ))


def used_code_before(conn: sqlite3.Connection, stage_id: int) -> set[int]:
    used: set[int] = set()
    for row in conn.execute(
        "SELECT code_items FROM bosses WHERE stage_id = ? AND kind = 'stage'", (stage_id,)
    ):
        try:
            used.update(int(x["item_id"]) for x in json.loads(row["code_items"] or "[]"))
        except (TypeError, ValueError, KeyError):
            continue
    return used


def pick_code(conn: sqlite3.Connection, stage_id: int, want: int = CODE_MAX) -> list[dict]:
    """Код-часть варианта. Задач в банке может не быть вообще, и это не беда:
    тогда босс состоит из одних вопросов, а счёт считается от них."""
    bank = code_bank(conn, stage_id)
    if not bank:
        return []
    used = used_code_before(conn, stage_id)
    fresh = [r for r in bank if r["id"] not in used] or bank
    picked = fresh[:want]
    return [
        {
            "item_id": r["id"],
            "node_code": r["node_code"],
            "node_title": r["node_title"],
            "difficulty": r["difficulty"],
            "title": json.loads(r["payload"]).get("title", "код-задача"),
            "ok": False,
            "checks": 0,
        }
        for r in picked
    ]


# ---------------------------------------------------------------- попытки

def row_by_id(conn: sqlite3.Connection, boss_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM bosses WHERE id = ?", (int(boss_id),)).fetchone()
    if row is None:
        raise LookupError(f"нет попытки {boss_id}")
    return row


def running(conn: sqlite3.Connection, stage_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM bosses WHERE stage_id = ? AND kind = 'stage' "
        "AND status IN ('quiz', 'code') ORDER BY id DESC LIMIT 1",
        (stage_id,),
    ).fetchone()


def finished(conn: sqlite3.Connection, stage_id: int) -> list[sqlite3.Row]:
    return list(conn.execute(
        "SELECT * FROM bosses WHERE stage_id = ? AND kind = 'stage' AND status = 'done' "
        "ORDER BY id DESC",
        (stage_id,),
    ))


def passed_stage(conn: sqlite3.Connection, stage_id: int) -> bool:
    return conn.execute(
        "SELECT COUNT(*) FROM bosses WHERE stage_id = ? AND kind = 'stage' AND passed = 1",
        (stage_id,),
    ).fetchone()[0] > 0


def cooldown(conn: sqlite3.Connection, cfg: Config, stage_id: int) -> dict:
    """Сколько ждать до реванша. Считается по часам профиля, поэтому в песочнице
    сутки проматываются dev-сдвигом, а в боевом это настоящие сутки."""
    last = finished(conn, stage_id)
    if not last or last[0]["passed"]:
        return {"locked": False, "left_sec": 0, "since": None}
    row = last[0]
    gone = devclock.since(conn, cfg, row["finished_at"])
    left = REVENGE_HOURS * 3600 - gone
    return {
        "locked": left > 0,
        "left_sec": int(max(0, left)),
        "since": row["finished_at"],
        "hours": REVENGE_HOURS,
    }


def quiz_left(conn: sqlite3.Connection, cfg: Config, row: sqlite3.Row) -> float:
    return QUIZ_LIMIT_SEC - devclock.elapsed(conn, cfg, row["started_at"])


def code_left(conn: sqlite3.Connection, cfg: Config, row: sqlite3.Row) -> float:
    return CODE_LIMIT_SEC - devclock.elapsed(conn, cfg, row["quiz_done_at"])


def start(conn: sqlite3.Connection, cfg: Config, stage_num: int,
          rng: random.Random | None = None) -> dict:
    """Начать бой. Уже идущая попытка не перезапускается: экзамен один."""
    stage = stage_by_num(conn, stage_num)
    live = running(conn, stage["id"])
    if live is not None:
        return state(conn, cfg, stage_num)

    if passed_stage(conn, stage["id"]):
        raise BossError(
            f"босс этапа {stage['num']} уже взят. Переигрывать взятый бой незачем: "
            f"ранг остаётся в истории, а XP платят за первую победу"
        )
    g = gate(conn, stage["id"])
    if not g["ready"] and not dev_gate_off(cfg):
        raise BossError(
            f"босс этапа {stage['num']} ещё закрыт: нод закрыто {g['closed']}, "
            f"нужно {g['need']}"
        )
    cd = cooldown(conn, cfg, stage["id"])
    if cd["locked"]:
        raise BossError(
            f"реванш откроется через {fmt_left(cd['left_sec'])}. "
            f"День до него не пустой: разбери мини-сет по проваленным темам"
        )

    questions, weak = build_variant(conn, stage["id"], rng=rng)
    code_items = pick_code(conn, stage["id"])
    attempt_no = conn.execute(
        "SELECT COALESCE(MAX(attempt_no), 0) + 1 FROM bosses WHERE stage_id = ? AND kind = 'stage'",
        (stage["id"],),
    ).fetchone()[0]
    stamp = devclock.now_iso(conn, cfg)
    cur = conn.execute(
        "INSERT INTO bosses(stage_id, kind, attempt_no, ts, questions, passed, status, "
        " started_at, answers, code_items, weak, quiz_total, code_total) "
        "VALUES (?, 'stage', ?, ?, ?, 0, 'quiz', ?, '{}', ?, ?, ?, ?)",
        (stage["id"], attempt_no, now(), json.dumps(questions),
         stamp, json.dumps(code_items, ensure_ascii=False),
         json.dumps(weak, ensure_ascii=False), len(questions), len(code_items)),
    )
    conn.commit()
    return state(conn, cfg, stage_num, boss_id=cur.lastrowid)


def question_view(conn: sqlite3.Connection, item_id: int, number: int, total: int) -> dict:
    row = conn.execute("SELECT id, payload FROM items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        return {}
    data = json.loads(row["payload"])
    # Ни ans, ни exp на клиент не уходят: это экзамен, а правильный ответ
    # вообще никогда не покидает сервер (решение захода 2а).
    return {
        "item_id": row["id"],
        "number": number,
        "total": total,
        "q": data["q"],
        "code": data.get("code"),
        "opts": data["opts"],
        "topic": data.get("topic", ""),
        "lvl": data.get("lvl", 0),
    }


def answer(conn: sqlite3.Connection, cfg: Config, boss_id: int, item_id: int,
           choice: int) -> dict:
    row = row_by_id(conn, boss_id)
    if row["status"] != "quiz":
        raise BossError("квиз-часть уже закрыта")
    if quiz_left(conn, cfg, row) <= 0:
        finish_quiz(conn, cfg, row)
        raise BossError("время квиз-части вышло, вариант сдан как есть")

    questions = [int(x) for x in json.loads(row["questions"] or "[]")]
    if int(item_id) not in questions:
        raise LookupError("этого вопроса в варианте нет")
    answers = json.loads(row["answers"] or "{}")
    if str(item_id) in answers:
        raise BossError("на этот вопрос ты уже ответил, экзамен переигровок не знает")

    item = conn.execute("SELECT payload, node_id FROM items WHERE id = ?", (item_id,)).fetchone()
    payload = json.loads(item["payload"])
    correct = int(choice) == int(payload["ans"])
    answers[str(item_id)] = {"choice": int(choice), "correct": 1 if correct else 0}
    conn.execute("UPDATE bosses SET answers = ? WHERE id = ?",
                 (json.dumps(answers, ensure_ascii=False), row["id"]))
    # XP ноль и счётчик дня не трогаем: экзамен платит рангом.
    conn.execute(
        "INSERT INTO attempts(item_id, node_id, kind, ts, correct, result, xp) "
        "VALUES (?, ?, 'boss', ?, ?, ?, 0)",
        (item_id, item["node_id"], now(), 1 if correct else 0,
         json.dumps({"boss_id": row["id"], "choice": int(choice)}, ensure_ascii=False)),
    )
    conn.commit()

    row = row_by_id(conn, boss_id)
    done = len(answers) >= len(questions)
    if done:
        finish_quiz(conn, cfg, row)
    return {
        "answered": len(answers),
        "total": len(questions),
        "quiz_done": done,
        "left_sec": int(max(0, quiz_left(conn, cfg, row))),
    }


def finish_quiz(conn: sqlite3.Connection, cfg: Config, row: sqlite3.Row) -> None:
    """Закрыть квиз-часть: посчитать верные и передать ход код-части."""
    if row["status"] != "quiz":
        return
    answers = json.loads(row["answers"] or "{}")
    correct = sum(1 for a in answers.values() if a.get("correct"))
    spent = int(min(QUIZ_LIMIT_SEC, max(0, devclock.elapsed(conn, cfg, row["started_at"]))))
    code_items = json.loads(row["code_items"] or "[]")
    conn.execute(
        "UPDATE bosses SET quiz_correct = ?, quiz_sec = ?, quiz_done_at = ?, status = ? "
        "WHERE id = ?",
        (correct, spent, devclock.now_iso(conn, cfg), "code" if code_items else "quiz",
         row["id"]),
    )
    conn.commit()
    if not code_items:
        finalize(conn, cfg, row_by_id(conn, row["id"]))


def record_code(conn: sqlite3.Connection, cfg: Config, boss_id: int, item_id: int,
                verdict: dict) -> dict:
    """Отчёт runner'а по код-части. Обычный XP кода не платится и code_tasks
    не трогается: иначе зачтённая на боссе задача бесплатно закрыла бы ноду."""
    row = row_by_id(conn, boss_id)
    if row["status"] != "code":
        raise BossError("код-часть этого боя уже закрыта")
    if code_left(conn, cfg, row) <= 0:
        finalize(conn, cfg, row)
        raise BossError("время код-части вышло, бой сдан как есть")

    items = json.loads(row["code_items"] or "[]")
    found = False
    for entry in items:
        if int(entry["item_id"]) == int(item_id):
            entry["checks"] = int(entry.get("checks", 0)) + 1
            entry["ok"] = bool(entry.get("ok")) or bool(verdict.get("ok"))
            entry["last"] = verdict.get("message", "")
            found = True
    if not found:
        raise LookupError("этой задачи в код-части боя нет")
    conn.execute("UPDATE bosses SET code_items = ? WHERE id = ?",
                 (json.dumps(items, ensure_ascii=False), row["id"]))
    conn.execute(
        "INSERT INTO attempts(item_id, node_id, kind, ts, correct, result, xp) "
        "VALUES (?, NULL, 'boss_code', ?, ?, ?, 0)",
        (item_id, now(), 1 if verdict.get("ok") else 0,
         json.dumps({"boss_id": row["id"], "message": verdict.get("message", "")},
                    ensure_ascii=False)),
    )
    conn.commit()

    row = row_by_id(conn, boss_id)
    result = None
    if all(entry.get("ok") for entry in items):
        result = finalize(conn, cfg, row)
    return {
        "ok": bool(verdict.get("ok")),
        "green": sum(1 for e in items if e.get("ok")),
        "total": len(items),
        "left_sec": int(max(0, code_left(conn, cfg, row))),
        "result": result,
    }


def rank_of(score: float, in_time: bool) -> str:
    for name, need in THRESHOLDS:
        if score + 1e-9 >= need:
            if name == "S" and not in_time:
                return "A"
            return name
    return "C"


def finalize(conn: sqlite3.Connection, cfg: Config, row: sqlite3.Row,
             day: str | None = None) -> dict:
    """Посчитать ранг, заплатить, собрать карту дыр и мини-сет к реваншу."""
    if row["status"] == "done":
        return result_view(conn, cfg, row_by_id(conn, row["id"]))
    day = day or today()
    answers = json.loads(row["answers"] or "{}")
    questions = [int(x) for x in json.loads(row["questions"] or "[]")]
    items = json.loads(row["code_items"] or "[]")

    quiz_correct = sum(1 for a in answers.values() if a.get("correct"))
    quiz_total = len(questions)
    code_green = sum(1 for e in items if e.get("ok"))
    code_total = len(items)

    points = quiz_correct + CODE_WEIGHT * code_green
    maximum = quiz_total + CODE_WEIGHT * code_total
    score = (points / maximum) if maximum else 0.0

    quiz_sec = row["quiz_sec"] or int(min(QUIZ_LIMIT_SEC,
                                          devclock.elapsed(conn, cfg, row["started_at"])))
    code_sec = 0
    if code_total and row["quiz_done_at"]:
        code_sec = int(min(CODE_LIMIT_SEC, max(0, devclock.elapsed(conn, cfg, row["quiz_done_at"]))))
    in_time = quiz_sec <= QUIZ_LIMIT_SEC * S_TIME_SHARE and (
        not code_total or code_sec <= CODE_LIMIT_SEC * S_TIME_SHARE
    )
    rank = rank_of(score, in_time)
    passed = rank in PASS_RANKS
    weak = weak_map(conn, questions, answers, items)

    conn.execute(
        "UPDATE bosses SET status = 'done', finished_at = ?, score = ?, rank = ?, passed = ?, "
        " quiz_correct = ?, quiz_total = ?, code_green = ?, code_total = ?, "
        " quiz_sec = ?, code_sec = ?, time_sec = ?, weak = ? WHERE id = ?",
        (devclock.now_iso(conn, cfg), round(score, 4), rank, 1 if passed else 0,
         quiz_correct, quiz_total, code_green, code_total, quiz_sec, code_sec,
         quiz_sec + code_sec, json.dumps(weak, ensure_ascii=False), row["id"]),
    )
    gained = 0
    if not xp.already_paid(conn, xp.BOSS, "boss", row["id"]):
        gained = xp.award(conn, xp.BOSS_RANK_XP[rank], xp.BOSS, "boss", row["id"], day)
    conn.execute("UPDATE bosses SET xp = ? WHERE id = ?", (gained, row["id"]))
    # Опус реагирует на бой как соперник. После проигранного боя злорадства
    # не бывает, это запрет раздела 9, и он зашит в саму пачку реплик.
    try:
        from . import bot as bot_mod
        from . import taunts as taunts_mod

        kind = "boss_win" if passed else "boss_loss"
        bot_mod.event(conn, kind, taunts_mod.pick(conn, kind))
    except Exception as exc:  # noqa: BLE001
        print(f"реплику Опуса про бой записать не вышло: {exc}")
    conn.commit()

    if not passed:
        build_miniset(conn, row["id"], row["stage_id"], weak)
    from . import defense as defense_mod

    defense_mod.prepare(conn, row_by_id(conn, row["id"]))
    conn.commit()
    return result_view(conn, cfg, row_by_id(conn, row["id"]))


def weak_map(conn: sqlite3.Connection, questions: list[int], answers: dict,
             items: list[dict]) -> dict:
    """Точная карта: по какой теме сколько промахов и что осталось красным в коде."""
    by_topic: dict[str, dict] = {}
    rows = conn.execute(
        "SELECT id, payload FROM items WHERE id IN (%s)" % ",".join("?" * len(questions)),
        questions,
    ).fetchall() if questions else []
    payloads = {r["id"]: r["payload"] for r in rows}
    for item_id in questions:
        topic = topic_of(payloads.get(item_id, "")) or "без темы"
        slot = by_topic.setdefault(topic, {"topic": topic, "asked": 0, "wrong": 0})
        slot["asked"] += 1
        given = answers.get(str(item_id))
        if not given or not given.get("correct"):
            slot["wrong"] += 1
    topics = [t for t in by_topic.values() if t["wrong"]]
    topics.sort(key=lambda t: (-t["wrong"], t["topic"]))
    return {
        "topics": topics,
        "code_red": [e["title"] for e in items if not e.get("ok")],
        "clean": [t["topic"] for t in by_topic.values() if not t["wrong"]],
    }


# ---------------------------------------------------------------- код-часть на диске

def code_dir(cfg: Config, stage_num: int, attempt_no: int, node_code: str):
    """Папка код-части боя. Она нарочно не в tasks/: это не учебная задача,
    и мешать её с портфелем решений не надо."""
    return cfg.tasks_root / "boss" / f"этап-{int(stage_num):02d}" / \
        f"попытка-{int(attempt_no)}" / node_code


def issue_code(conn: sqlite3.Connection, cfg: Config, boss_id: int) -> list[dict]:
    """Разложить код-часть боя по файлам и вернуть, куда именно."""
    from . import tasks as tasks_mod

    row = row_by_id(conn, boss_id)
    if row["status"] != "code":
        raise BossError("код-часть открывается после того, как сданы вопросы")
    stage = conn.execute("SELECT num FROM stages WHERE id = ?", (row["stage_id"],)).fetchone()
    out = []
    for entry in json.loads(row["code_items"] or "[]"):
        item = conn.execute("SELECT * FROM items WHERE id = ?", (entry["item_id"],)).fetchone()
        node = conn.execute(
            "SELECT n.*, s.num AS stage_num FROM nodes n JOIN stages s ON s.id = n.stage_id "
            "WHERE n.id = ?", (item["node_id"],)
        ).fetchone()
        root = code_dir(cfg, stage["num"], row["attempt_no"], node["code"])
        banner = (
            f"Это код-часть боя с боссом этапа {stage['num']}, попытка {row['attempt_no']}. "
            f"Проверяется как обычно, командой arena check. Отдельного XP за неё нет: "
            f"она идёт в счёт боя, и таймер у неё {CODE_LIMIT_SEC // 60} минут."
        )
        path, _ = tasks_mod.materialize(
            cfg, conn, node, item, root=root, banner=banner,
            extra={"boss_id": row["id"], "attempt_no": row["attempt_no"]},
        )
        out.append({
            "item_id": item["id"],
            "node_code": node["code"],
            "title": entry.get("title", ""),
            "dir": str(path),
        })
    return out


# ---------------------------------------------------------------- мини-сет

def build_miniset(conn: sqlite3.Connection, boss_id: int, stage_id: int, weak: dict) -> int | None:
    """Собрать целевой набор по проваленным темам: сами промахи, добор вопросов
    по тем же темам и карточки этапа. День до реванша не должен быть пустым."""
    topics = [t["topic"] for t in weak.get("topics", []) if t["topic"] != "без темы"]
    row = conn.execute("SELECT * FROM bosses WHERE id = ?", (boss_id,)).fetchone()
    answers = json.loads(row["answers"] or "{}")
    questions = [int(x) for x in json.loads(row["questions"] or "[]")]
    missed = [q for q in questions
              if not (answers.get(str(q)) or {}).get("correct")]

    quiz_ids = list(missed)
    if topics:
        bank = quiz_bank(conn, stage_id)
        extra = [r["id"] for r in bank
                 if r["id"] not in quiz_ids and topic_of(r["payload"]) in topics]
        quiz_ids += extra[:max(0, MINISET_QUIZ - len(quiz_ids))]
    quiz_ids = quiz_ids[:max(MINISET_QUIZ, len(missed))]

    card_ids = pick_cards(conn, stage_id, topics)
    cur = conn.execute(
        "INSERT INTO boss_minisets(boss_id, stage_id, topics, quiz_ids, card_ids, created) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (boss_id, stage_id, json.dumps(topics, ensure_ascii=False),
         json.dumps(quiz_ids), json.dumps(card_ids), now()),
    )
    conn.commit()
    return cur.lastrowid


def pick_cards(conn: sqlite3.Connection, stage_id: int, topics: list[str]) -> list[int]:
    """Карточки этапа под проваленные темы. Тем у карточек нет, поэтому ищем
    по тексту, а если не нашли, берём просто карточки этапа."""
    rows = list(conn.execute(
        "SELECT i.id, i.payload FROM items i "
        f"WHERE i.type = 'card' AND i.active = 1 AND i.suspended = 0 AND {STAGE_SCOPE} "
        "ORDER BY i.id",
        {"stage_id": stage_id},
    ))
    hits: list[int] = []
    for row in rows:
        text = row["payload"].lower()
        if any(word and word in text for topic in topics for word in [topic]):
            hits.append(row["id"])
    if not hits:
        hits = [r["id"] for r in rows]
    return hits[:MINISET_CARDS]


def miniset_view(conn: sqlite3.Connection, boss_id: int) -> dict | None:
    row = conn.execute(
        "SELECT * FROM boss_minisets WHERE boss_id = ? ORDER BY id DESC LIMIT 1", (boss_id,)
    ).fetchone()
    if row is None:
        return None
    quiz_ids = [int(x) for x in json.loads(row["quiz_ids"] or "[]")]
    card_ids = [int(x) for x in json.loads(row["card_ids"] or "[]")]
    done = 0
    if quiz_ids:
        marks = ",".join("?" * len(quiz_ids))
        done = conn.execute(
            f"SELECT COUNT(DISTINCT item_id) FROM attempts WHERE kind = 'quiz' AND correct = 1 "
            f"AND ts >= ? AND item_id IN ({marks})",
            (row["created"], *quiz_ids),
        ).fetchone()[0]
    items = []
    if quiz_ids:
        marks = ",".join("?" * len(quiz_ids))
        for q in conn.execute(
            f"SELECT id, payload FROM items WHERE id IN ({marks})", quiz_ids
        ):
            data = json.loads(q["payload"])
            items.append({
                "item_id": q["id"],
                "q": data["q"],
                "code": data.get("code"),
                "opts": data["opts"],
                "topic": data.get("topic", ""),
            })
    return {
        "id": row["id"],
        "boss_id": boss_id,
        "topics": json.loads(row["topics"] or "[]"),
        "quiz": items,
        "quiz_total": len(quiz_ids),
        "quiz_done": done,
        "cards": len(card_ids),
        "created": row["created"],
    }


# ---------------------------------------------------------------- витрина

def fmt_left(seconds: float) -> str:
    seconds = int(max(0, seconds))
    hours, rest = divmod(seconds, 3600)
    minutes = rest // 60
    if hours and minutes:
        return f"{hours} ч {minutes} мин"
    if hours:
        return f"{hours} ч"
    if minutes:
        return f"{minutes} мин"
    return f"{seconds} с"


def result_view(conn: sqlite3.Connection, cfg: Config, row: sqlite3.Row) -> dict:
    from . import defense as defense_mod

    items = json.loads(row["code_items"] or "[]")
    return {
        "id": row["id"],
        "attempt_no": row["attempt_no"],
        "status": row["status"],
        "rank": row["rank"],
        "rank_title": RANK_TITLES.get(row["rank"] or "", ""),
        "passed": bool(row["passed"]),
        "quiz_correct": row["quiz_correct"],
        "quiz_total": row["quiz_total"],
        "code_green": row["code_green"],
        "code_total": row["code_total"],
        "code_items": items,
        "quiz_sec": row["quiz_sec"],
        "code_sec": row["code_sec"],
        "xp": row["xp"],
        "weak": json.loads(row["weak"] or "{}"),
        "finished_at": row["finished_at"],
        "defense": defense_mod.view(conn, "boss", row["id"]),
        "review": review_view(conn, row["id"]),
        "miniset": miniset_view(conn, row["id"]),
    }


def review_view(conn: sqlite3.Connection, boss_id: int) -> dict | None:
    row = conn.execute(
        "SELECT * FROM reviews WHERE ref_type = 'boss' AND ref_id = ?", (boss_id,)
    ).fetchone()
    if row is None:
        return None
    return {"summary": row["summary"], "xp": row["xp"], "ts": row["ts"]}


REVIEW_MIN = 60


def add_review(conn: sqlite3.Connection, boss_id: int, summary: str,
               day: str | None = None) -> dict:
    """Кнопка «разобрал с ИИ»: короткое резюме и 30 XP один раз на сдачу."""
    row = row_by_id(conn, boss_id)
    if row["status"] != "done":
        raise BossError("разбор пишут после боя, а он ещё идёт")
    summary = (summary or "").strip()
    if len(summary) < REVIEW_MIN:
        raise ValueError(
            f"напиши хотя бы {REVIEW_MIN} символов: что именно разобрал и что понял"
        )
    if review_view(conn, boss_id) is not None:
        raise BossError("разбор по этому бою уже засчитан")
    day = day or today()
    gained = 0
    if not xp.already_paid(conn, xp.REVIEW, "boss", boss_id):
        gained = xp.award(conn, xp.AMOUNTS[xp.REVIEW], xp.REVIEW, "boss", boss_id, day)
    conn.execute(
        "INSERT INTO reviews(ref_type, ref_id, summary, xp, ts) VALUES ('boss', ?, ?, ?, ?)",
        (boss_id, summary, gained, now()),
    )
    conn.commit()
    return {"xp": gained, "summary": summary}


def running_view(conn: sqlite3.Connection, cfg: Config, row: sqlite3.Row) -> dict:
    questions = [int(x) for x in json.loads(row["questions"] or "[]")]
    answers = json.loads(row["answers"] or "{}")
    left = [q for q in questions if str(q) not in answers]
    out = {
        "id": row["id"],
        "attempt_no": row["attempt_no"],
        "status": row["status"],
        "quiz_total": len(questions),
        "quiz_answered": len(answers),
        "scale": devclock.scale(conn, cfg),
    }
    if row["status"] == "quiz":
        out["left_sec"] = int(max(0, quiz_left(conn, cfg, row)))
        out["limit_sec"] = QUIZ_LIMIT_SEC
        out["question"] = question_view(
            conn, left[0], len(answers) + 1, len(questions)
        ) if left else {}
    else:
        out["left_sec"] = int(max(0, code_left(conn, cfg, row)))
        out["limit_sec"] = CODE_LIMIT_SEC
        out["code_items"] = json.loads(row["code_items"] or "[]")
        out["quiz_correct"] = row["quiz_correct"]
    return out


def sweep(conn: sqlite3.Connection, cfg: Config, stage_id: int) -> None:
    """Прибрать за просроченным таймером. Экзамен обязан закрываться сам:
    ученик может просто закрыть вкладку, и без этого попытка висела бы вечно."""
    row = running(conn, stage_id)
    if row is None:
        return
    if row["status"] == "quiz" and quiz_left(conn, cfg, row) <= 0:
        finish_quiz(conn, cfg, row)
        row = row_by_id(conn, row["id"])
    if row["status"] == "code" and code_left(conn, cfg, row) <= 0:
        finalize(conn, cfg, row)


def state(conn: sqlite3.Connection, cfg: Config, stage_num: int,
          boss_id: int | None = None) -> dict:
    stage = stage_by_num(conn, stage_num)
    sweep(conn, cfg, stage["id"])
    g = gate(conn, stage["id"])
    live = running(conn, stage["id"])
    done = finished(conn, stage["id"])
    last = None
    if boss_id is not None:
        row = row_by_id(conn, boss_id)
        last = result_view(conn, cfg, row) if row["status"] == "done" else None
    if last is None and done:
        last = result_view(conn, cfg, done[0])
    cd = cooldown(conn, cfg, stage["id"])
    return {
        "stage": {
            "num": stage["num"],
            "title": stage["title"],
            "in_track": bool(stage["in_track"]),
            **g,
        },
        "attempts": len(done) + (1 if live is not None else 0),
        "passed": passed_stage(conn, stage["id"]),
        "cooldown": cd,
        "cooldown_text": fmt_left(cd["left_sec"]) if cd["locked"] else "",
        "running": running_view(conn, cfg, live) if live is not None else None,
        "last": last,
        "history": [
            {"attempt_no": r["attempt_no"], "rank": r["rank"], "passed": bool(r["passed"]),
             "quiz_correct": r["quiz_correct"], "quiz_total": r["quiz_total"],
             "xp": r["xp"], "finished_at": r["finished_at"]}
            for r in done
        ],
        # Взятый босс не переигрывается: иначе повторный бой стал бы кнопкой
        # выдачи восьмисот XP, а ранг всё равно уже записан в историю.
        "can_start": (
            (g["ready"] or dev_gate_off(cfg)) and live is None and not cd["locked"]
            and not passed_stage(conn, stage["id"])
        ),
        "quiz_count": QUIZ_COUNT,
        "quiz_limit_sec": QUIZ_LIMIT_SEC,
        "code_limit_sec": CODE_LIMIT_SEC,
        "bank": len(quiz_bank(conn, stage["id"])),
    }


def overview(conn: sqlite3.Connection, cfg: Config) -> dict:
    """Что показать во вкладке, когда этап не выбран: ближайший босс."""
    rows = progress.stage_rows(conn)
    ready, next_up = [], None
    for r in rows:
        need = progress.boss_at(r["total"])
        if r["total"] and r["closed"] >= need and not passed_stage(conn, r["id"]):
            ready.append(r["num"])
        if next_up is None and r["total"] and r["closed"] < need and r["closed"] > 0:
            next_up = {"num": r["num"], "title": r["title"], "closed": r["closed"], "need": need}
    return {"ready": ready, "next": next_up}
