"""Защита решения: два-три вопроса «почему ты выбрал такое решение» и оценка ИИ.

Раздел 8 плана. Вопросы задаются после боя и после ТЗ, ответ пишется текстом
в веб-форме, оценивает headless claude по рубрике, ответ строго JSON.
XP это сумма баллов, нормированная к сотне.

Вопросы собираются по содержанию самой попытки: какая код-задача была в бою,
какая тема провалилась, что прошло чисто. Генерация вопросов через claude тут
сознательно не используется: защита должна открываться сразу после боя и не
зависеть от лимитов подписки, а вот оценка без модели невозможна и потому
честно ходит в claude.

Оценка щадящая по тону и честная по сути: комментарий всегда говорит,
что улучшить. Длинные тире и стрелки из ответа модели вычищаются: раздел 14.2
запрещает их во всех текстах продукта, а модель про это правило не знает.
"""

from __future__ import annotations

import json
import re
import sqlite3

from . import llm, xp
from .config import PROJECT_ROOT
from .db import now, today

RUBRIC_PATH = PROJECT_ROOT / "content" / "defense_rubric.md"
CALL_TIMEOUT = 300
ANSWER_MIN = 40
MAX_SCORE = 2

# Раздел 14.2: длинных тире и стрелок в текстах продукта не бывает.
DASHES = re.compile(r"[—–]")
ARROWS = re.compile(r"\s*(?:->|=>|<-|→|←|⇒)\s*")


def clean(text: str) -> str:
    """Причесать текст модели под правила продукта."""
    out = DASHES.sub("-", str(text or ""))
    out = ARROWS.sub(" ", out)
    return out.strip()


# ---------------------------------------------------------------- вопросы

def _topic_line(weak: dict) -> tuple[str, str]:
    """Тема для второго вопроса и подводка к ней."""
    topics = weak.get("topics") or []
    if topics:
        top = topics[0]
        return top["topic"], (
            f"на бою эта тема далась хуже других: промахов {top['wrong']} "
            f"из {top['asked']} вопросов"
        )
    clean_topics = weak.get("clean") or []
    if clean_topics:
        return clean_topics[0], "на бою эта тема прошла без единого промаха"
    return "", ""


def build_questions(conn: sqlite3.Connection, boss: sqlite3.Row) -> list[dict]:
    weak = json.loads(boss["weak"] or "{}")
    code_items = json.loads(boss["code_items"] or "[]")
    topic, lead = _topic_line(weak)
    questions: list[dict] = []

    if code_items:
        task = code_items[0]
        questions.append({
            "n": 1,
            "q": f"Задача «{task['title']}»: почему ты решил её именно так? "
                 f"Назови причину выбора и скажи, какой ещё путь видел и чем он тебе не подошёл.",
            "hint": "разбери своё решение, а не задачу вообще",
        })
    elif topic:
        questions.append({
            "n": 1,
            "q": f"Возьми любой вопрос по теме «{topic}» из этого боя. Почему Клиент A ответ "
                 f"Клиент A, а соседний вариант нет? Объясни механику, а не правило наизусть.",
            "hint": "объясняй так, как объяснил бы человеку рядом",
        })
    else:
        questions.append({
            "n": 1,
            "q": "Какое решение на этом бою далось тебе тяжелее всего и почему ты выбрал "
                 "именно такой путь? Назови альтернативу, которую отбросил.",
            "hint": "разбери конкретный случай, а не общее ощущение",
        })

    if topic:
        questions.append({
            "n": len(questions) + 1,
            "q": f"Тема «{topic}»: {lead}. Расскажи своими словами, как это работает "
                 f"на самом деле и где здесь обычно ошибаются.",
            "hint": "своими словами, без цитат из конспекта",
        })

    # Вопрос про границы раньше был один на все случаи жизни: «пустое значение,
    # ноль или число за границей диапазона». Для темы вроде «блочный комментарий
    # съедает код» это бессмыслица - там нет ни входа, ни чисел, и отвечать не на что.
    # Поэтому для код-задачи спрашиваем про вход, а для темы языка - про случай,
    # когда правило перестаёт работать.
    if code_items:
        about = f"в задаче «{code_items[0]['title']}»"
        questions.append({
            "n": len(questions) + 1,
            "q": f"Что будет, если на вход {about} подать пустое значение, null или ноль "
                 f"элементов? Разбери конкретный случай: что сломается и как ты это поймёшь.",
            "hint": "граничные случаи это половина собеседования",
        })
    elif topic:
        questions.append({
            "n": len(questions) + 1,
            "q": f"Тема «{topic}»: приведи случай, когда правило срабатывает не так, "
                 f"как ждёшь. Что именно происходит и как это заметить?",
            "hint": "граничный случай это половина собеседования",
        })
    else:
        questions.append({
            "n": len(questions) + 1,
            "q": "Возьми любое своё решение с этого боя и разбери его граничный случай: "
                 "пустой вход, ноль элементов, null. Что сломается и как ты это поймёшь?",
            "hint": "граничные случаи это половина собеседования",
        })
    return questions[:3]


def ensure(conn: sqlite3.Connection, ref_type: str, ref_id: int,
           questions: list[dict]) -> int:
    """Завести защиту для чего угодно из раздела 8. Идемпотентна: второй раз
    ничего не создаёт. Сборщик вопросов у каждого свой (у боя по содержанию боя,
    у ТЗ по постановке), а хранение и оценка общие."""
    row = conn.execute(
        "SELECT id FROM defenses WHERE ref_type = ? AND ref_id = ?", (ref_type, int(ref_id))
    ).fetchone()
    if row is not None:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO defenses(ref_type, ref_id, questions, answers, grade, xp, ts) "
        "VALUES (?, ?, ?, NULL, NULL, 0, ?)",
        (ref_type, int(ref_id), json.dumps(questions, ensure_ascii=False), now()),
    )
    return cur.lastrowid


def prepare(conn: sqlite3.Connection, boss: sqlite3.Row) -> int:
    """Защита после боя: вопросы собираются по содержанию попытки."""
    return ensure(conn, "boss", boss["id"], build_questions(conn, boss))


def view(conn: sqlite3.Connection, ref_type: str, ref_id: int) -> dict | None:
    row = conn.execute(
        "SELECT * FROM defenses WHERE ref_type = ? AND ref_id = ?", (ref_type, ref_id)
    ).fetchone()
    if row is None:
        return None
    grade = json.loads(row["grade"]) if row["grade"] else None
    return {
        "id": row["id"],
        "ref_type": row["ref_type"],
        "ref_id": row["ref_id"],
        "questions": json.loads(row["questions"] or "[]"),
        "answers": json.loads(row["answers"]) if row["answers"] else None,
        "grade": grade,
        "xp": row["xp"],
        "graded": bool(grade),
        "answer_min": ANSWER_MIN,
        "ts": row["ts"],
    }


# ---------------------------------------------------------------- оценка

FALLBACK_RUBRIC = (
    "Оцени защиту решения по рубрике: score от 0 до 2 за ответ, признаки reason, "
    "alternatives и edges булевыми, комментарий на русском. Верни строго JSON вида "
    '{"grades": [{"n": 1, "score": 2, "reason": true, "alternatives": false, '
    '"edges": true, "comment": "..."}], "summary": "..."} и ничего больше.\n\n{{QA}}'
)


def build_prompt(questions: list[dict], answers: list[str]) -> str:
    base = RUBRIC_PATH.read_text(encoding="utf-8") if RUBRIC_PATH.exists() else FALLBACK_RUBRIC
    blocks = []
    for i, q in enumerate(questions):
        given = (answers[i] if i < len(answers) else "") or ""
        blocks.append(f"### Вопрос {i + 1}\n{q['q']}\n\n**Ответ ученика:**\n{given.strip()}")
    return base.replace("{{QA}}", "\n\n".join(blocks))


def _flag(value):
    """Признак защиты: да, нет или «не спрашивали»."""
    if value is None:
        return None
    if isinstance(value, str):
        low = value.strip().lower()
        if low in ("null", "none", "n/a", "не спрашивали", ""):
            return None
        return low in ("true", "да", "yes", "1")
    return bool(value)


def normalize(data: dict, questions: list[dict]) -> dict:
    """Привести ответ модели к рубрике. Кривой JSON лучше отбить, чем поверить."""
    if not isinstance(data, dict):
        raise ValueError("модель вернула не объект")
    raw = data.get("grades")
    if not isinstance(raw, list) or not raw:
        raise ValueError("в ответе модели нет списка grades")
    grades = []
    for i, q in enumerate(questions):
        item = raw[i] if i < len(raw) else {}
        if not isinstance(item, dict):
            item = {}
        try:
            score = int(round(float(item.get("score", 0))))
        except (TypeError, ValueError):
            score = 0
        score = max(0, min(MAX_SCORE, score))
        grades.append({
            "n": i + 1,
            "q": q["q"],
            "score": score,
            # null это «вопрос об этом не спрашивал». Раньше он схлопывался
            # в false, и человек видел «альтернатив не видно» под вопросом,
            # который альтернатив и не просил.
            "reason": _flag(item.get("reason")),
            "alternatives": _flag(item.get("alternatives")),
            "edges": _flag(item.get("edges")),
            "comment": clean(item.get("comment", "")),
        })
    total = sum(g["score"] for g in grades)
    maximum = MAX_SCORE * len(grades)
    return {
        "grades": grades,
        "score": total,
        "max": maximum,
        "share": round(total / maximum, 3) if maximum else 0.0,
        "summary": clean(data.get("summary", "")),
    }


def grade_answers(questions: list[dict], answers: list[str], timeout: int = CALL_TIMEOUT,
                  binary_path: str | None = None) -> dict:
    raw = llm.call(build_prompt(questions, answers), timeout=timeout, binary_path=binary_path)
    return normalize(llm.parse_envelope(raw), questions)


def submit(conn: sqlite3.Connection, defense_id: int, answers: list[str],
           day: str | None = None, timeout: int = CALL_TIMEOUT,
           binary_path: str | None = None) -> dict:
    """Принять ответы и оценить их. Ответы сохраняются до вызова модели:
    упавший claude не должен стирать написанное человеком."""
    row = conn.execute("SELECT * FROM defenses WHERE id = ?", (int(defense_id),)).fetchone()
    if row is None:
        raise LookupError(f"нет защиты {defense_id}")
    if row["grade"]:
        raise PermissionError("эта защита уже оценена")
    questions = json.loads(row["questions"] or "[]")
    answers = [str(a or "").strip() for a in answers]
    if len(answers) != len(questions):
        raise ValueError(f"ответов должно быть {len(questions)}, а пришло {len(answers)}")
    short = [i + 1 for i, a in enumerate(answers) if len(a) < ANSWER_MIN]
    if short:
        raise ValueError(
            f"ответ на вопрос {', '.join(str(n) for n in short)} слишком короткий: "
            f"нужно хотя бы {ANSWER_MIN} символов. Это защита, тут словами"
        )

    conn.execute("UPDATE defenses SET answers = ? WHERE id = ?",
                 (json.dumps(answers, ensure_ascii=False), row["id"]))
    conn.commit()

    try:
        grade = grade_answers(questions, answers, timeout=timeout, binary_path=binary_path)
    except Exception as exc:  # noqa: BLE001
        return {
            "graded": False,
            "xp": 0,
            "error": f"{type(exc).__name__}: {exc}",
            "message": ("оценить не вышло, ответы сохранены. Попробуй ещё раз: "
                        "claude мог упереться в лимит подписки"),
        }

    day = day or today()
    amount = int(round(xp.DEFENSE_MAX * grade["share"]))
    gained = 0
    if not xp.already_paid(conn, xp.DEFENSE, row["ref_type"], row["ref_id"]):
        gained = xp.award(conn, amount, xp.DEFENSE, row["ref_type"], row["ref_id"], day)
    conn.execute("UPDATE defenses SET grade = ?, xp = ?, ts = ? WHERE id = ?",
                 (json.dumps(grade, ensure_ascii=False), gained, now(), row["id"]))
    conn.commit()
    return {"graded": True, "xp": gained, "grade": grade}
