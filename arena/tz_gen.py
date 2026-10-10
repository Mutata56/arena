"""Генерация ТЗ и самопроверка эталона.

Раздел 10 плана про содержание, раздел 11 про жёсткое правило: в банк принимается
только та постановка, у которой эталонное решение прогнано через run_java против
скрытых тестов и зелёное. Красный эталон это два ретрая генерации, потом отказ.

Проверок перед прогоном больше, чем кажется нужным, и это осознанно. Модель охотно
пишет красивую постановку, в которой скрытые тесты зовут метод, которого нет
в требованиях, или требует конструкцию, которой в её же эталоне не видно.
Такое ТЗ выглядит нормальным ровно до момента, когда ученик потратит на него вечер.

Модуль не трогает arena/gen: там свой конвейер лёгких жанров (заход 4а) и своя
очередь. ТЗ генерится по требованию, а не по расписанию: их за весь роадмап
столько же, сколько этапов.
"""

from __future__ import annotations

import json
import re
import sqlite3

from . import llm, tz
from .config import Config, PROJECT_ROOT
from .db import now

PROMPT_PATH = PROJECT_ROOT / "content" / "tz_gen.md"
CALL_TIMEOUT = 1500
MODEL = "opus"
MAX_TRIES = 3          # раздел 11: генерация плюс два ретрая
SPEC_SECTIONS = (
    "бизнес-контекст",
    "функциональные требования",
    "ограничения",
    "формат",
    "критерии приёмки",
    "примеры",
)
MIN_POINTS = 5

# Хвосты CoffeeProject: demo_user просил вплести их в первые ТЗ.
# Ключ это номер этапа, значение это требование в постановку и обязательный
# машинный признак из каталога tz.CONSTRUCTS.
STAGE_TAILS = {
    3: {
        "must": ["nested_class"],
        "text": "На этом этапе обязателен вложенный или внутренний класс: у ученика это "
                "незакрытый хвост прошлого проекта, и ТЗ должно поставить его так, чтобы "
                "вложенный класс был здесь естественным решением, а не украшением.",
    },
    15: {
        "must": ["own_tests"],
        "text": "Этап про тестирование, поэтому ТЗ пишется под TDD: в постановке прямо "
                "требуй сначала тест, потом код, красный тест перед зелёным. Критерии приёмки "
                "должны требовать список тестов до реализации и осмысленные имена тестов. "
                "Это тоже незакрытый хвост прошлого проекта ученика.",
    },
}


class GenError(Exception):
    """Генерация не удалась. Текст показывается человеку как есть."""


def dump_raw(cfg: Config, stage_num: int, attempt: int, raw: str) -> None:
    """Сохранить сырой ответ рядом с базой. Раздел 11 требует лога сырого ответа
    у провалов: без него разбирать нечего, а ответ длиной в проект в терминал
    не влезает."""
    if not raw:
        return
    try:
        path = cfg.state_dir / f"tz-gen-fail-{stage_num}-{attempt}.txt"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(raw, encoding="utf-8")
        print(f"сырой ответ модели сохранён: {path}")
    except OSError:
        pass


def stage_context(conn: sqlite3.Connection, stage_id: int) -> dict:
    """Из чего состоит этап: названия нод дают точную карту тем."""
    rows = list(conn.execute(
        "SELECT code, title, kind FROM nodes WHERE stage_id = ? ORDER BY seq", (stage_id,)
    ))
    return {
        "nodes": [f"{r['code']} {r['title']}" for r in rows],
        "kinds": sorted({r["kind"] for r in rows}),
    }


def constructs_block() -> str:
    lines = ["Каталог машинных признаков (в must_use можно класть только эти id):"]
    for key, spec in tz.CONSTRUCTS.items():
        lines.append(f"- {key}: {spec['title']}")
    return "\n".join(lines)


def build_prompt(conn: sqlite3.Connection, stage: sqlite3.Row, retry_note: str = "") -> str:
    ctx = stage_context(conn, stage["id"])
    tail = STAGE_TAILS.get(stage["num"])
    base = PROMPT_PATH.read_text(encoding="utf-8")
    return (base
            .replace("{{STAGE_NUM}}", str(stage["num"]))
            .replace("{{STAGE_TITLE}}", stage["title"])
            .replace("{{NODES}}", "\n".join(f"- {n}" for n in ctx["nodes"]))
            .replace("{{CONSTRUCTS}}", constructs_block())
            .replace("{{TAIL}}", tail["text"] if tail else "Особых требований к этапу нет.")
            .replace("{{RETRY}}", retry_note))


# ---------------------------------------------------------------- разбор ответа

BLOCK_RE = re.compile(r"^===([A-Z]+)(?:[ \t]+(.+?))?[ \t]*===[ \t]*$", re.MULTILINE)
META_KEYS = ("slug", "title", "dir_name", "topics", "must_use")


def envelope_text(raw: str) -> str:
    """Достать текст модели из конверта CLI, не разбирая его как JSON.

    Ответ у нас не JSON, а блоки с маркерами, и это единственный формат,
    в котором модель надёжно отдаёт несколько файлов Java. Живой прогон показал
    ровно это: JSON с исходниками внутри строк рвался на второй же попытке,
    потому что модель ставила в строку живой перенос и неэкранированную кавычку.
    """
    try:
        envelope = json.loads(raw)
    except (TypeError, ValueError):
        return str(raw)
    inner = envelope["result"] if isinstance(envelope, dict) and "result" in envelope else raw
    if isinstance(inner, (dict, list)):
        return json.dumps(inner, ensure_ascii=False)
    return str(inner)


def strip_fence(text: str) -> str:
    body = text.strip()
    if body.startswith("```"):
        body = body.split("\n", 1)[1] if "\n" in body else ""
        if body.rstrip().endswith("```"):
            body = body.rstrip()[:-3]
    return body.strip("\n")


def parse_blocks(text: str) -> dict:
    """Разобрать ответ вида ===META===, ===SPEC===, ===SOLUTION Имя.java===."""
    marks = list(BLOCK_RE.finditer(text))
    if not marks:
        raise GenError("в ответе нет ни одного блока с маркером")
    out: dict = {"starter_files": {}, "reference_solution": {}}
    for i, mark in enumerate(marks):
        kind = mark.group(1)
        name = (mark.group(2) or "").strip()
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        body = text[mark.end():end].strip("\n")
        if kind == "META":
            meta = json.loads(strip_fence(body))
            out.update({k: meta[k] for k in META_KEYS if k in meta})
        elif kind == "SPEC":
            out["spec_md"] = strip_fence(body)
        elif kind == "STARTER":
            out["starter_files"][name or "Main.java"] = strip_fence(body)
        elif kind == "SOLUTION":
            out["reference_solution"][name or "Main.java"] = strip_fence(body)
        elif kind == "HIDDEN":
            out["hidden_tests"] = strip_fence(body)
        elif kind == "TESTS":
            out["reference_tests"] = strip_fence(body)
    return out


def parse_reply(raw: str) -> dict:
    """Блочный формат, а если модель всё же прислала JSON, разобрать и его."""
    text = envelope_text(raw)
    if "===META===" in text or BLOCK_RE.search(text):
        return parse_blocks(text)
    body = strip_fence(text)
    start, end = body.find("{"), body.rfind("}")
    if start >= 0 and end > start:
        body = body[start:end + 1]
    # strict=False разрешает живые переносы внутри строк: именно на них
    # разваливался JSON с исходниками.
    return json.loads(body, strict=False)


def normalize(data: dict, stage_num: int) -> dict:
    if not isinstance(data, dict):
        raise GenError("модель вернула не объект")
    need = ("slug", "title", "spec_md", "starter_files", "hidden_tests",
            "reference_solution", "reference_tests", "topics", "must_use")
    missing = [key for key in need if not data.get(key)]
    if missing:
        raise GenError(f"в ответе нет полей: {', '.join(missing)}")
    if not isinstance(data["starter_files"], dict) or not isinstance(
            data["reference_solution"], dict):
        raise GenError("starter_files и reference_solution должны быть объектами имя файла к коду")

    slug = re.sub(r"[^a-z0-9-]+", "-", str(data["slug"]).strip().lower()).strip("-")
    if not slug:
        raise GenError("slug пустой или не латиницей")
    must_use = []
    for item in data["must_use"]:
        if isinstance(item, str):
            item = {"id": item, "why": ""}
        if not isinstance(item, dict) or item.get("id") not in tz.CONSTRUCTS:
            raise GenError(f"в must_use есть id не из каталога: {item}")
        must_use.append({"id": item["id"], "why": str(item.get("why", ""))})
    if not must_use:
        raise GenError("must_use пустой: без обязательных конструкций ТЗ не привязано к этапу")

    payload = {
        "dir_name": str(data.get("dir_name") or "").strip() or None,
        "topics": [str(t) for t in data["topics"]],
        "must_use": must_use,
        "starter_files": {str(k): str(v) for k, v in data["starter_files"].items()},
        "hidden_tests": str(data["hidden_tests"]),
        "reference_solution": {str(k): str(v) for k, v in data["reference_solution"].items()},
        "reference_tests": str(data["reference_tests"]),
    }
    if not payload["dir_name"]:
        payload["dir_name"] = tz.dir_name_for(stage_num, slug, None)
    return {
        "slug": slug if slug.startswith("etap") else f"etap-{int(stage_num):02d}-{slug}",
        "title": tz.clean(str(data["title"])),
        "spec_md": str(data["spec_md"]).strip(),
        "payload": payload,
    }


def check_spec(spec_md: str, payload: dict, stage_num: int) -> list[str]:
    """Претензии к постановке до всякого прогона. Пустой список это норма."""
    problems: list[str] = []
    low = spec_md.lower()
    for section in SPEC_SECTIONS:
        if section not in low:
            problems.append(f"в постановке нет раздела «{section}»")
    points = tz.spec_points(spec_md)
    if len(points) < MIN_POINTS:
        problems.append(
            f"в разделах ограничений и критериев приёмки всего {len(points)} пунктов списком, "
            f"нужно хотя бы {MIN_POINTS}: по ним ревью объясняет свои замечания"
        )
    from . import tasks as tasks_mod

    try:
        hidden_class = tasks_mod.test_class(payload["hidden_tests"])
    except Exception as exc:  # noqa: BLE001
        problems.append(f"в скрытых тестах не нашёлся тестовый класс: {exc}")
        hidden_class = ""
    if hidden_class and hidden_class.lower() in low:
        problems.append(
            f"класс скрытых тестов {hidden_class} упомянут в постановке: "
            f"скрытые тесты ученику не показываются"
        )
    if "@DisplayName" not in payload["hidden_tests"]:
        problems.append("у скрытых кейсов нет @DisplayName: ученик увидит имена методов")
    tail = STAGE_TAILS.get(stage_num)
    if tail:
        have = {m["id"] for m in payload["must_use"]}
        lost = [m for m in tail["must"] if m not in have]
        if lost:
            problems.append("для этого этапа обязательны признаки: " + ", ".join(lost))
    facts = tz.construct_facts(payload["reference_solution"], payload["must_use"],
                               {"test_files": 1 if payload.get("reference_tests") else 0})
    for fact in facts:
        if not fact["ok"]:
            problems.append(
                f"эталон не выполняет собственное ограничение «{fact['title']}»: "
                f"ученику это требовать нельзя"
            )
    return problems


def self_check(cfg: Config, payload: dict, timeout: int | None = None) -> dict:
    """Прогнать эталон против скрытых тестов и против эталонных тестов ученика.

    Второй прогон не формальность: если постановка требует своих тестов, значит
    по её публичному интерфейсу они должны писаться без выкрутасов.
    """
    from . import tasks as tasks_mod

    sources = payload["reference_solution"]
    own_name = tasks_mod.test_file_name(payload["reference_tests"])
    verdict = tz.run(cfg, cfg.runs_root, payload, sources=sources,
                     tests={own_name: payload["reference_tests"]},
                     timeout=timeout or 120)
    return {
        "ok": bool(verdict.ok and verdict.tests_total and
                   verdict.tests_green == verdict.tests_total),
        "verdict": verdict.to_json(),
        "why": verdict.message if not verdict.ok else (
            "" if verdict.tests_total and verdict.tests_green == verdict.tests_total
            else "эталонные тесты ученика не зелёные"),
    }


def generate(conn: sqlite3.Connection, cfg: Config, stage_num: int, tries: int = MAX_TRIES,
             timeout: int = CALL_TIMEOUT, binary_path: str | None = None,
             model: str | None = MODEL, on_event=None) -> dict:
    """Сгенерировать ТЗ этапа и положить в банк, если эталон зелёный."""
    stage = tz.stage_by_num(conn, stage_num)
    say = on_event or (lambda text: None)
    note = ""
    log: list[str] = []
    for attempt in range(1, max(1, tries) + 1):
        say(f"попытка {attempt}: зову модель, это несколько минут")
        prompt = build_prompt(conn, stage, note)
        raw = ""
        try:
            raw = llm.call(prompt, timeout=timeout, binary_path=binary_path, model=model)
            spec = normalize(parse_reply(raw), stage["num"])
        except Exception as exc:  # noqa: BLE001
            dump_raw(cfg, stage["num"], attempt, raw)
            note = (f"Прошлая попытка не разобралась: {exc}. Держись формата блоков "
                    f"с маркерами ровно так, как он описан, и ничего не пиши между ними.")
            log.append(f"попытка {attempt}: {type(exc).__name__}: {exc}")
            say(log[-1])
            continue

        problems = check_spec(spec["spec_md"], spec["payload"], stage["num"])
        if problems:
            note = ("Прошлая попытка не прошла проверку постановки:\n"
                    + "\n".join(f"- {p}" for p in problems))
            log.append(f"попытка {attempt}: постановка кривая ({problems[0]})")
            say(log[-1])
            continue

        say("постановка на месте, гоню эталон против скрытых тестов")
        checked = self_check(cfg, spec["payload"])
        if not checked["ok"]:
            red = [c["name"] for c in checked["verdict"].get("hidden", []) if not c.get("ok")]
            note = ("Прошлая попытка провалила самопроверку: " + checked["why"]
                    + (". Красные кейсы: " + ", ".join(red[:5]) if red else "")
                    + ". Эталон обязан проходить свои же скрытые тесты.")
            log.append(f"попытка {attempt}: эталон красный ({checked['why']})")
            say(log[-1])
            continue

        spec_id = tz.add_spec(conn, stage["id"], spec["slug"], spec["title"],
                              spec["spec_md"], spec["payload"], source="gen",
                              verified_at=now())
        say(f"эталон зелёный, постановка в банке (id {spec_id})")
        return {
            "ok": True, "spec_id": spec_id, "slug": spec["slug"], "title": spec["title"],
            "spec_md": spec["spec_md"], "attempts": attempt, "log": log,
            "self_check": checked["verdict"],
        }
    raise GenError(
        "постановку сгенерировать не вышло: " + ("; ".join(log[-2:]) or "модель не ответила")
        + ". В банк без зелёного эталона ТЗ не кладу"
    )
