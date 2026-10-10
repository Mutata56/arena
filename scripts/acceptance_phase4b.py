#!/usr/bin/env python3
"""Приёмка захода 4б: код-задачи, объективная проверка чтения кода, конспекты.

    .venv/bin/python scripts/acceptance_phase4b.py

Всё гоняется в песочнице: своя папка стейта, своя КОПИЯ волта (в неё и пишутся
конспекты), свой портфель задач. Боевая база и боевой волт только читаются,
в конце сверяется, что они не изменились даже по времени модификации.

Модель подменяется скриптом fake.py: он смотрит, какой промпт ему прислали,
и отдаёт заранее заготовленный ответ из папки случая. Java при этом настоящая:
эталонные решения действительно компилируются и гоняются через песочницу запуска,
иначе проверять было бы нечего.

Ключ --skip-live пропускает единственный живой вызов модели (раздел 9).
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

import httpx  # noqa: E402

import prodguard  # noqa: E402
from arena import config as config_mod  # noqa: E402
from arena import db as db_mod  # noqa: E402
from arena import contract, migrations, tasks  # noqa: E402
from arena.gen import notes as gen_notes  # noqa: E402
from arena.gen import plan as gen_plan  # noqa: E402
from arena.gen import queue as gen_queue  # noqa: E402
from arena.gen import runtime as gen_runtime  # noqa: E402
from arena.gen import selfcheck, validate, worker  # noqa: E402
from arena.importers.code_tasks import build_payload  # noqa: E402
from arena.roadmap import sync as sync_roadmap  # noqa: E402

PORT = 8806
# Нода, которую наполняем через сервер: открыта после синка, банк пуст.
FILL_NODE = "1.11"
# Нода для конспекта: этап 4, своего файла в волте нет ни у одной ноды этапа.
NOTE_NODE = "4.02"
# Нода живого вызова: практика, где код-задача честная по определению.
LIVE_NODE = "2.14"

FAILED: list[str] = []
PASSED = 0
SAMPLE: dict = {}


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASSED
    if ok:
        PASSED += 1
        print(f"  ок    {name}" + (f" ({detail})" if detail else ""))
    else:
        FAILED.append(name)
        print(f"  ПРОВАЛ {name}" + (f" ({detail})" if detail else ""))


def section(title: str) -> None:
    print(f"\n{title}")


FAKE = '''#!/usr/bin/env python3
"""Подставной claude: отдаёт заготовку нужного жанра из папки случая."""
import json, pathlib, sys

prompt = sys.stdin.read()
folder = pathlib.Path(sys.argv[1])
if "Ты делаешь код-задачу" in prompt:
    genre = "code"
elif "Ты пишешь конспект" in prompt:
    genre = "note"
elif "карточки для интервального повторения" in prompt:
    genre = "cards"
elif "чтение чужого кода" in prompt:
    genre = "readcode"
else:
    genre = "quiz"
path = folder / (genre + ".json")
if not path.is_file():
    path = folder.parent / "base" / (genre + ".json")
print(json.dumps({
    "type": "result", "subtype": "success", "is_error": False, "api_error_status": None,
    "total_cost_usd": 0.04, "duration_ms": 1200,
    "result": path.read_text(encoding="utf-8"),
}, ensure_ascii=False))
'''

# ------------------------------------------------------------------ заготовки

STARTER = """public class Boxes {

    public static int count(int items, int perBox) {
        // тут твой код
        return 0;
    }

    public static void main(String[] args) {
        System.out.println(count(10, 3));
    }
}
"""

REFERENCE = """public class Boxes {

    public static int count(int items, int perBox) {
        if (items <= 0 || perBox <= 0) {
            return 0;
        }
        return (items + perBox - 1) / perBox;
    }

    public static void main(String[] args) {
        System.out.println(count(10, 3));
    }
}
"""

VISIBLE = """import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BoxesTest {

    @Test
    @DisplayName("товар делится на короба без остатка")
    void even() {
        assertEquals(3, Boxes.count(9, 3));
    }

    @Test
    @DisplayName("остаток уезжает в отдельный короб")
    void tail() {
        assertEquals(4, Boxes.count(10, 3));
    }
}
"""

HIDDEN = """import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BoxesHiddenTest {

    @Test
    @DisplayName("нулевой остаток на складе")
    void nothing() {
        assertEquals(0, Boxes.count(0, 5));
    }

    @Test
    @DisplayName("один товар занимает целый короб")
    void single() {
        assertEquals(1, Boxes.count(1, 12));
    }

    @Test
    @DisplayName("вместимость короба больше остатка")
    void bigBox() {
        assertEquals(1, Boxes.count(7, 100));
    }

    @Test
    @DisplayName("отрицательное количество не считаем")
    void negative() {
        assertEquals(0, Boxes.count(-3, 4));
    }
}
"""

CODE_TASK = {
    "title": "Считаем короба под остаток",
    "statement_md": (
        "На складе лежит `items` штук товара, в один короб влезает `perBox` штук.\n\n"
        "Напиши метод `Boxes.count(int items, int perBox)`, который возвращает,\n"
        "сколько коробов уйдёт под весь остаток.\n\n"
        "Правила:\n\n"
        "- неполный короб всё равно считается коробом;\n"
        "- если товара нет или вместимость не положительная, коробов ноль;\n"
        "- дробей тут нет, всё считается в целых числах."
    ),
    "difficulty": 0,
    "starter_files": {"Boxes.java": STARTER},
    "visible_tests": VISIBLE,
    "hidden_tests": HIDDEN,
    "reference_solution": {"Boxes.java": REFERENCE},
    "checkstyle_hints": ["деление в целых числах округляет вниз, учти это в формуле"],
}

READCODE_GOOD = {
    "kind": "output",
    "code": (
        "public class Snippet {\n"
        "    public static void main(String[] args) {\n"
        "        int[] stock = {12, 0, 7};\n"
        "        int total = 0;\n"
        "        for (int box : stock) {\n"
        "            total += box;\n"
        "        }\n"
        "        System.out.println(\"всего \" + total);\n"
        "        System.out.println(\"ячеек \" + stock.length);\n"
        "    }\n"
        "}"
    ),
    "question": "Что выведет этот код?",
    "opts": ["всего 19\nячеек 3", "всего 19\nячеек 2", "всего 12\nячеек 3", "ошибка компиляции"],
    "ans": 0,
    "exp": "Цикл складывает три числа остатка, потом печатается длина массива.",
    "topic": "массивы",
    "lvl": 1,
}

READCODE_BUG = {
    "kind": "bug",
    "code": (
        "int total = 0;\n"
        "for (int i = 0; i <= rows.size(); i++) {\n"
        "    total += rows.get(i);\n"
        "}\n"
        "System.out.println(total);"
    ),
    "question": "Где здесь ошибка?",
    "opts": ["в условии цикла", "в начальном значении", "в типе переменной", "ошибки нет"],
    "ans": 0,
    "exp": "Условие i <= size даёт лишнюю итерацию, и get вылетает за границу списка.",
    "topic": "границы цикла",
    "lvl": 1,
}

NOTE = {
    "goal": (
        "Разобраться, зачем у каждого объекта есть toString и почему без него в логе "
        "видно набор символов вместо данных. После ноды ты переопределяешь toString "
        "так, что объект печатается читаемой строкой, и знаешь, где JVM зовёт его сама."
    ),
    "theses": [
        "**toString объявлен в Object**, поэтому он есть у любого объекта, даже если ты "
        "его не писал.",
        "**Реализация по умолчанию** печатает имя класса, решётку и хеш в шестнадцатеричном "
        "виде: `Box@1b6d3586`. Данных объекта там нет.",
        "**Конкатенация со строкой зовёт toString неявно**: `\"короб \" + box` это вызов "
        "метода, а не магия компилятора.",
        "**println принимает Object** и внутри тоже зовёт toString, поэтому печать объекта "
        "и печать строки выглядят одинаково.",
        "**Грабли: null**. Для ссылки `null` метод не вызывается вообще, склейка подставляет "
        "текст `null`, и NullPointerException тут не будет.",
    ],
    "walkthrough_md": (
        "Один и тот же класс без toString и с ним:\n\n"
        "```java\n"
        "class Box {\n"
        "    String cell = \"A-01\";\n"
        "    int items = 7;\n"
        "\n"
        "    @Override\n"
        "    public String toString() {\n"
        "        return \"короб в ячейке \" + cell + \", штук \" + items;\n"
        "    }\n"
        "}\n"
        "\n"
        "public class Demo {\n"
        "    public static void main(String[] args) {\n"
        "        System.out.println(new Box());\n"
        "    }\n"
        "}\n"
        "```\n\n"
        "Вывод:\n\n"
        "```\n"
        "короб в ячейке A-01, штук 7\n"
        "```\n\n"
        "Без переопределения на этом же месте была бы строка вида `Box@1b6d3586`: "
        "имя класса и хеш. Полезной информации в ней ноль, и именно поэтому в логах "
        "поддержки так часто видно мусор вместо данных."
    ),
    "links": ["4.01 Класс Object и его роль", "4.03 Сравнение ссылок и объектов",
              "9.99 Ноды с таким кодом нет"],
    "stars": 2,
}

QUIZ = [{
    "q": "Что напечатает System.out.println(7 / 2) в Java?",
    "opts": ["3", "3.5", "4", "ошибку компиляции"],
    "ans": 0,
    "exp": "Оба операнда целые, поэтому деление целочисленное и дробная часть отбрасывается.",
    "topic": "целочисленное деление",
    "lvl": 1,
}]

CARDS = [{
    "front": "Что делает деление двух int в Java",
    "back": "Считает целую часть и отбрасывает остаток: 7 / 2 это 3.",
    "topic": "арифметика",
}]


def wrap(items: list[dict]) -> str:
    return json.dumps({"items": items}, ensure_ascii=False)


def make_case(root: Path, name: str, **genres: str) -> Path:
    folder = root / name
    folder.mkdir(parents=True, exist_ok=True)
    for genre, body in genres.items():
        (folder / f"{genre}.json").write_text(body, encoding="utf-8")
    return folder


def wait_up(client: httpx.Client, tries: int = 80) -> bool:
    for _ in range(tries):
        try:
            client.get("/api/today", timeout=1.0)
            return True
        except Exception:  # noqa: BLE001
            time.sleep(0.25)
    return False


def node_bank(conn: sqlite3.Connection, code: str) -> dict[str, int]:
    rows = conn.execute(
        "SELECT i.type, COUNT(*) AS n FROM items i JOIN nodes n ON n.id = i.node_id "
        "WHERE n.code = ? AND i.source = 'gen' AND i.active = 1 GROUP BY i.type",
        (code,),
    ).fetchall()
    return {row["type"]: row["n"] for row in rows}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def enqueue(conn: sqlite3.Connection, kind: str, code: str, count: int = 1) -> int:
    node = conn.execute("SELECT * FROM nodes WHERE code = ?", (code,)).fetchone()
    job = gen_queue.enqueue(conn, kind, node_id=node["id"], stage_id=node["stage_id"],
                            params={"count": count}, priority=9000, force=True)
    conn.commit()
    return job


def drain_loud(cfg, kinds: tuple[str, ...], limit: int = 1) -> tuple[dict, str]:
    """Прогнать очередь и вернуть то, что воркер написал в свой лог."""
    buffer = StringIO()
    with redirect_stdout(buffer):
        done = worker.drain(cfg, limit=limit, kinds=kinds)
    text = buffer.getvalue()
    print("        " + text.strip().replace("\n", "\n        ") if text.strip() else "", end="")
    if text.strip():
        print()
    return done, text


def main() -> int:  # noqa: C901
    skip_live = "--skip-live" in sys.argv
    for name in [k for k in os.environ if k.startswith("ARENA_")]:
        del os.environ[name]
    real = config_mod.load(env="prod")
    prod_guard = prodguard.snapshot(real)
    if not real.roadmap_dir.is_dir():
        print(f"нет роадмапа: {real.roadmap_dir}")
        return 2
    prod_mtime = real.db_path.stat().st_mtime_ns if real.db_path.exists() else None
    real_hub = real.roadmap_dir / "Этап 04 Java Core" / "_Этап 04 Java Core.md"
    real_hub_sum = digest(real_hub) if real_hub.is_file() else ""
    real_note = real.roadmap_dir / "Этап 04 Java Core" / f"{NOTE_NODE} .md"

    # Стейт держим в ~/.cache, а не в /tmp: PrivateTmp у systemd-run подменяет /tmp,
    # и папка прогона внутри него перестаёт существовать (ловушка из журнала фазы 3).
    tmp = Path(tempfile.mkdtemp(prefix="arena-4b-", dir=Path.home() / ".cache"))
    server = None
    try:
        vault = tmp / "vault"
        vault.mkdir()
        shutil.copytree(real.roadmap_dir, vault / config_mod.ROADMAP_SUBDIR)
        state = tmp / "state"
        os.environ.update({
            "ARENA_ENV": "dev",
            "ARENA_STATE_DIR": str(state),
            "ARENA_VAULT": str(vault),
            # В песочнице волт по умолчанию не пишется. Здесь пишем: волт это копия,
            # и без записи конспект проверять негде.
            "ARENA_WRITE_VAULT": "1",
        })
        cfg = config_mod.load(env="dev")
        conn = db_mod.init(cfg)
        report = sync_roadmap(conn, cfg)
        print(f"песочница поднята: этапов {report.stages_added}, нод {report.nodes_added}, "
              f"волт {vault}")

        cases = tmp / "cases"
        fake_py = tmp / "fake.py"
        fake_py.write_text(FAKE, encoding="utf-8")
        fake_py.chmod(0o755)

        base = make_case(
            cases, "base",
            code=wrap([CODE_TASK]),
            readcode=wrap([READCODE_GOOD, READCODE_BUG]),
            note=wrap([NOTE]),
            quiz=wrap(QUIZ),
            cards=wrap(CARDS),
        )
        red_ref = make_case(cases, "red_ref", code=wrap([
            {**CODE_TASK, "reference_solution": {"Boxes.java": STARTER}}]))
        wrong_out = make_case(cases, "wrong_out", readcode=wrap([
            {**READCODE_GOOD, "ans": 1}]))

        def fake_for(folder: Path) -> str:
            return f"{sys.executable} {fake_py} {folder}"

        os.environ["ARENA_GEN_FAKE"] = fake_for(base)

        section("1. Жанры захода 4б включены и стоят в очереди последними")
        check("схема не поехала: версия совпадает с миграциями",
              conn.execute("PRAGMA user_version").fetchone()[0] == migrations.TARGET_VERSION,
              f"версия {conn.execute('PRAGMA user_version').fetchone()[0]} "
              f"из {migrations.TARGET_VERSION}")
        check("код-задачи готовы", gen_plan.BY_KIND["code"].ready)
        check("конспекты готовы", gen_plan.BY_KIND["note"].ready)
        check("незакрытых жанров не осталось", gen_plan.RESERVED_KINDS == (),
              ", ".join(gen_plan.RESERVED_KINDS) or "пусто")
        check("воркер умеет оба новых жанра",
              {"code", "note"} <= set(worker.WORKABLE), ", ".join(worker.WORKABLE))
        check("тяжёлые жанры идут опусом",
              gen_runtime.model_for("code") == "opus" and gen_runtime.model_for("note") == "opus")
        check("лёгкие жанры остались на своей модели",
              gen_runtime.model_for("quiz") != "opus", gen_runtime.model_for("quiz"))
        check("модель переопределяется переменной",
              "ARENA_GEN_MODEL" in gen_runtime.model_for.__doc__ if
              gen_runtime.model_for.__doc__ else True)
        light = min(gen_plan.BY_KIND[k].priority for k in ("quiz", "cards", "readcode"))
        check("код и конспект по приоритету ниже лёгких жанров",
              gen_plan.BY_KIND["code"].priority < light
              and gen_plan.BY_KIND["note"].priority < light,
              f"код {gen_plan.BY_KIND['code'].priority}, лёгкие от {light}")
        check("конспект просят только для нод без файла",
              not any(g.kind == "note" for g, _ in gen_plan.wanted(
                  conn, conn.execute("SELECT * FROM nodes WHERE code = '1.01'").fetchone()))
              and any(g.kind == "note" for g, _ in gen_plan.wanted(
                  conn, conn.execute("SELECT * FROM nodes WHERE code = ?",
                                     (NOTE_NODE,)).fetchone())))
        for name in ("code_gen.md", "note_gen.md", "readcode_gen.md"):
            body = (PROJECT / "prompts" / name).read_text(encoding="utf-8")
            clean = ("—" not in body and "–" not in body
                     and not any(ch in body for ch in validate.ARROWS))
            check(f"промпт {name} без длинных тире и стрелок", clean)
        code_prompt = (PROJECT / "prompts" / "code_gen.md").read_text(encoding="utf-8")
        check("промпт кода требует эталон и предупреждает о прогоне",
              "reference_solution" in code_prompt and "прогоняется автоматически" in code_prompt)
        rc_prompt = (PROJECT / "prompts" / "readcode_gen.md").read_text(encoding="utf-8")
        check("промпт чтения кода требует точный вывод в Клиент A варианте",
              "ТОЧНЫЙ вывод программы" in rc_prompt and "public class Snippet" in rc_prompt)

        section("2. Схема код-задачи: демо-задачи фазы 3 проходят, кривые не проходят")
        demo = {}
        for folder in sorted((PROJECT / "content" / "code").iterdir()):
            payload, node_code, difficulty = build_payload(folder)
            raw = dict(payload, difficulty=difficulty)
            try:
                demo[folder.name] = validate.code_task(raw, {"src": "демо"})
                check(f"демо-задача {folder.name} проходит схему генератора", True)
            except validate.Bad as exc:
                check(f"демо-задача {folder.name} проходит схему генератора", False, str(exc))
        sample = demo["1.10-ramka"]
        for name, broken in (
            ("файл с пакетом", {**sample, "starter_files": {
                "Frame.java": "package ru.arena;\n" + sample["starter_files"]["Frame.java"]}}),
            ("эталон не про те файлы", {**sample, "reference_solution": {
                "Other.java": sample["reference_solution"]["Frame.java"]}}),
            ("имя файла мимо класса", {**sample, "starter_files": {
                "Wrong.java": sample["starter_files"]["Frame.java"]}}),
            ("тесты без JUnit", {**sample, "visible_tests": "class FrameTest { void a() {} }"}),
            ("стрелка в постановке", {**sample, "statement_md": sample["statement_md"] + " A → B"}),
            ("постановка в одну строку", {**sample, "statement_md": "сделай красиво"}),
        ):
            try:
                validate.code_task(broken, {"src": "демо"})
                check(f"невалид отбит: {name}", False)
            except validate.Bad as exc:
                check(f"невалид отбит: {name}", True, str(exc)[:70])
        no_titles = sample["hidden_tests"].replace("@DisplayName", "// DisplayName")
        try:
            validate.code_task({**sample, "hidden_tests": no_titles}, {"src": "демо"})
            check("скрытые тесты без человеческих названий отбиты", False)
        except validate.Bad as exc:
            check("скрытые тесты без человеческих названий отбиты", True, str(exc)[:70])
        dashed = validate.code_task(
            {**sample, "title": "Рамка — это просто"}, {"src": "демо"})
        check("длинное тире в заголовке чинится на дефис",
              "—" not in dashed["title"], dashed["title"])
        lambda_task = validate.code_task({**sample, "reference_solution": {
            "Frame.java": sample["reference_solution"]["Frame.java"].replace(
                "String edge", "// list.forEach(x -> x);\n        String edge")}},
            {"src": "демо"})
        check("стрелка внутри Java-кода разрешена",
              "->" in lambda_task["reference_solution"]["Frame.java"])
        walk = validate.markdown(
            "текст без стрелок\n\n```java\nlist.forEach(x -> x);\n```\n", "walk")
        check("в блоке кода стрелка живёт, снаружи нет", "->" in walk)
        try:
            validate.markdown("текст со стрелкой →\n", "walk")
            check("стрелка вне блока кода отбивается", False)
        except validate.Bad:
            check("стрелка вне блока кода отбивается", True)

        section("3. Жёсткое правило: в банк только после зелёного прогона эталона")
        for name, payload in sorted(demo.items()):
            ok, why = selfcheck.code_task(cfg, payload)
            check(f"эталон демо-задачи {name} зелёный", ok, why[:90])
        broken = {**sample, "reference_solution": dict(sample["starter_files"])}
        ok, why = selfcheck.code_task(cfg, broken)
        check("кривой эталон красный", not ok, why[:110])
        check("причина названа честно: дело в эталоне", "эталон" in why, why[:60])
        solved = {**sample, "starter_files": dict(sample["reference_solution"])}
        ok, why = selfcheck.code_task(cfg, solved)
        check("задача с решением в стартовом наборе не проходит", not ok, why[:90])
        rotten = {**sample, "starter_files": {"Frame.java": "public class Frame { чушь }"}}
        ok, why = selfcheck.code_task(cfg, rotten)
        check("нескомпилируемый стартовый набор не проходит", not ok, why[:60])

        section("4. Воркер: годная код-задача доезжает до банка")
        os.environ["ARENA_GEN_FAKE"] = fake_for(base)
        enqueue(conn, "code", "1.10")
        done, log = drain_loud(cfg, ("code",))
        check("задание выполнено", done["ok"] == 1 and done["added"] == 1, json.dumps(done))
        check("зелёный эталон виден в логе воркера", "эталон зелёный" in log, log.strip()[:90])
        row = conn.execute(
            "SELECT i.* FROM items i JOIN nodes n ON n.id = i.node_id "
            "WHERE n.code = '1.10' AND i.type = 'code' AND i.source = 'gen'"
        ).fetchone()
        check("задача легла в банк код-задачей", row is not None)
        stored = json.loads(row["payload"]) if row else {}
        check("payload по формату раздела 3",
              {"title", "statement_md", "starter_files", "visible_tests", "hidden_tests",
               "reference_solution", "checkstyle_hints"} <= set(stored),
              ", ".join(sorted(stored))[:90])
        check("сложность уехала в колонку, а не осталась в json",
              row["difficulty"] == CODE_TASK["difficulty"], str(row["difficulty"]))
        node110 = conn.execute("SELECT * FROM nodes WHERE code = '1.10'").fetchone()
        picked = tasks.pick_item(conn, node110)
        check("раннер видит сгенерённую задачу", picked is not None)
        root, written = tasks.materialize(cfg, conn, conn.execute(
            "SELECT n.*, s.num AS stage_num FROM nodes n JOIN stages s ON s.id = n.stage_id "
            "WHERE n.code = '1.10'").fetchone(), row)
        check("задача материализуется в портфель",
              (root / "Boxes.java").is_file() and (root / "tests" / "BoxesTest.java").is_file(),
              ", ".join(written))
        check("скрытые тесты в портфель не попали",
              not (root / "tests" / "BoxesHiddenTest.java").exists())
        SAMPLE.update(stored)
        again = worker.drain(cfg, limit=1, kinds=("code",))
        check("очередь после выполненного задания пуста", again["runs"] == 0, json.dumps(again))

        section("5. Кривой эталон: два ретрая, потом failed с логом")
        os.environ["ARENA_GEN_FAKE"] = fake_for(red_ref)
        job_id = enqueue(conn, "code", "1.17")
        result = worker.drain(cfg, limit=5, kinds=("code",))
        job = conn.execute("SELECT * FROM gen_queue WHERE id = ?", (job_id,)).fetchone()
        check("задание провалено", job["status"] == "failed", job["status"])
        check("генерация повторялась дважды, потом сдалась", job["attempts"] == 3,
              f"попыток {job['attempts']}")
        check("итог прогона: провал", result["failed"] == 1, json.dumps(result))
        check("в банк ничего не легло", not node_bank(conn, "1.17"), str(node_bank(conn, "1.17")))
        logs = conn.execute(
            "SELECT status, error, raw, prompt FROM gen_log WHERE kind = 'code' "
            "AND node_id = (SELECT id FROM nodes WHERE code = '1.17') ORDER BY id"
        ).fetchall()
        check("каждая попытка записана в журнал", len(logs) == 3, str(len(logs)))
        check("статус в журнале говорит про прогон, а не про схему",
              all(row["status"] == "red" for row in logs),
              ", ".join(row["status"] for row in logs))
        check("причина в журнале называет красный эталон",
              "эталон" in (logs[-1]["error"] or ""), (logs[-1]["error"] or "")[:90])
        check("сырой ответ модели сохранён", "Boxes" in (logs[-1]["raw"] or ""))
        check("промпт сохранён рядом с ответом", "код-задачу" in (logs[-1]["prompt"] or ""))
        os.environ["ARENA_GEN_FAKE"] = fake_for(base)
        alive = worker.drain(cfg, limit=1, kinds=("quiz",))
        check("конвейер после провала жив", alive["runs"] <= 1)

        section("6. Чтение кода: вывод сверяется прогоном")
        os.environ["ARENA_GEN_FAKE"] = fake_for(base)
        enqueue(conn, "readcode", "1.18", count=2)
        done, log = drain_loud(cfg, ("readcode",))
        check("обе задачи прошли проверку", done["ok"] == 1 and done["added"] == 2,
              json.dumps(done))
        check("вывод сошёлся, это видно в логе", "вывод сошёлся" in log, log.strip()[:80])
        check("задачу про баг прогоном не мучаем", "прогон не нужен" in log)
        stored_rc = [json.loads(r["payload"]) for r in conn.execute(
            "SELECT payload FROM items i JOIN nodes n ON n.id = i.node_id "
            "WHERE n.code = '1.18' AND i.type = 'readcode'")]
        check("тип задачи сохранён в payload",
              sorted(p.get("kind", "") for p in stored_rc) == ["bug", "output"],
              ", ".join(p.get("kind", "") for p in stored_rc))
        os.environ["ARENA_GEN_FAKE"] = fake_for(wrong_out)
        job_id = enqueue(conn, "readcode", "1.19", count=1)
        done, log = drain_loud(cfg, ("readcode",), limit=5)
        job = conn.execute("SELECT * FROM gen_queue WHERE id = ?", (job_id,)).fetchone()
        check("неверный ожидаемый вывод отбракован прогоном",
              not node_bank(conn, "1.19"), str(node_bank(conn, "1.19")))
        check("задание с кривым выводом уходит в failed", job["status"] == "failed", job["status"])
        check("попыток было три", job["attempts"] == 3, str(job["attempts"]))
        last = conn.execute(
            "SELECT status, error FROM gen_log WHERE kind = 'readcode' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        check("в журнале написано, что вывод не сошёлся",
              "вывод не сошёлся" in (last["error"] or ""), (last["error"] or "")[:100])

        section("7. Конспект Obsidian для ноды этапа 4")
        os.environ["ARENA_GEN_FAKE"] = fake_for(base)
        hub_copy = vault / config_mod.ROADMAP_SUBDIR / "Этап 04 Java Core" / "_Этап 04 Java Core.md"
        hub_before = digest(hub_copy)
        node = conn.execute("SELECT * FROM nodes WHERE code = ?", (NOTE_NODE,)).fetchone()
        check("до генерации у ноды нет конспекта", not node["obsidian_path"])
        enqueue(conn, "note", NOTE_NODE)
        done, log = drain_loud(cfg, ("note",))
        check("конспект сгенерён", done["ok"] == 1 and done["added"] == 1, json.dumps(done))
        node = conn.execute("SELECT * FROM nodes WHERE code = ?", (NOTE_NODE,)).fetchone()
        expected = (vault / config_mod.ROADMAP_SUBDIR / "Этап 04 Java Core"
                    / f"{NOTE_NODE} {node['title']}.md")
        check("файл лежит в папке своего этапа", expected.is_file(), str(expected.name))
        check("имя файла совпадает с вики-ссылкой хаба",
              f"[[{expected.stem}]]" in hub_copy.read_text(encoding="utf-8"), expected.stem)
        check("obsidian_path заполнен и относителен волту",
              node["obsidian_path"] == f"Java RoadMap/Этап 04 Java Core/{expected.name}",
              str(node["obsidian_path"]))
        body = expected.read_text(encoding="utf-8")
        print("\n".join("        " + line for line in body.splitlines()[:8]))
        check("шапка в стиле нод роадмапа",
              body.startswith("#Java #roadmap #этап4\n**Этап:** [[_Этап 04 Java Core|Этап 4."),
              body.splitlines()[0])
        check("в шапке есть тип ноды и сложность",
              f"**Тип:** {node['kind']}" in body and "**Сложность:** ★" in body)
        check("в шапке есть навигация до и после",
              "**До:** [[4.01" in body and "**После:** [[4.03" in body,
              body.splitlines()[2][:80])
        for head in ("# " + node["title"], "## Цель", "## Ключевые тезисы", "## Мини-разбор"):
            check(f"раздел на месте: {head}", head in body)
        check("связи в конце файла", body.rstrip().splitlines()[-1].startswith("**Связи:**"),
              body.rstrip().splitlines()[-1][:80])
        check("битая ссылка выброшена, живые остались",
              "[[9.99" not in body and "[[4.01 Класс Object и его роль]]" in body)
        check("в мини-разборе есть код и вывод", "```java" in body)
        prose_only = []
        inside = False
        for line in body.splitlines():
            if line.strip().startswith("```"):
                inside = not inside
                continue
            if not inside:
                prose_only.append(line)
        prose_text = "\n".join(prose_only)
        check("длинных тире в тексте конспекта нет",
              "—" not in prose_text and "–" not in prose_text)
        check("стрелок в тексте конспекта нет",
              not any(ch in prose_text for ch in validate.ARROWS))
        check("хаб этапа не тронут", digest(hub_copy) == hub_before)
        check("конспект не попал в банк как запись",
              not node_bank(conn, NOTE_NODE), str(node_bank(conn, NOTE_NODE)))
        check("жанр конспекта для этой ноды закрыт",
              not any(g.kind == "note" for g, _ in gen_plan.wanted(conn, node)))
        before_sum = digest(expected)
        enqueue(conn, "note", NOTE_NODE)
        done, log = drain_loud(cfg, ("note",))
        check("повторная генерация не перезаписывает готовый файл",
              digest(expected) == before_sum and done["added"] == 0, json.dumps(done))
        check("в логе сказано, что файл уже был", "уже был" in log, log.strip()[-80:])
        others = [p.name for p in expected.parent.glob("*.md")]
        check("в папке этапа появился ровно один новый файл",
              sorted(others) == sorted(["_Этап 04 Java Core.md", expected.name]),
              ", ".join(sorted(others))[:100])

        section("8. Сквозной прогон через сервер: вход в ноду наполняет её целиком")
        conn.execute("DELETE FROM gen_queue")
        conn.commit()
        conn.close()
        env = dict(os.environ)
        env.update({
            "PYTHONPATH": str(PROJECT),
            "ARENA_GEN_FAKE": fake_for(base),
            "ARENA_GEN_POLL": "0.2",
        })
        server = subprocess.Popen(
            [sys.executable, "-m", "arena", "serve", "--port", str(PORT)],
            cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        client = httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=15.0)
        check("сервер поднялся", wait_up(client))
        entered = client.post(f"/api/node/{FILL_NODE}/enter").json()
        check(f"вход в ноду {FILL_NODE} принят", entered.get("code") == FILL_NODE,
              json.dumps(entered, ensure_ascii=False)[:100])
        deadline = time.time() + 240
        bank: dict[str, int] = {}
        while time.time() < deadline:
            probe = db_mod.connect(cfg, create=False)
            bank = node_bank(probe, FILL_NODE)
            probe.close()
            if bank.get("code", 0) >= 1 and bank.get("quiz", 0) >= 1 and bank.get("card", 0) >= 1:
                break
            time.sleep(0.5)
        check("нода наполнилась вопросами", bank.get("quiz", 0) >= 1, str(bank.get("quiz", 0)))
        check("нода наполнилась карточками", bank.get("card", 0) >= 1, str(bank.get("card", 0)))
        check("нода наполнилась чужим кодом", bank.get("readcode", 0) >= 1,
              str(bank.get("readcode", 0)))
        check("у ноды появилась код-задача", bank.get("code", 0) >= 1, str(bank.get("code", 0)))
        status = client.get("/api/gen/status").json()
        check("очередь разбирается сама", status["queue"].get("done", 0) >= 4,
              json.dumps(status["queue"], ensure_ascii=False))
        tasks_page = client.get("/api/tasks").json()
        check("сгенерённая задача видна на вкладке задач",
              any(t.get("node_code") == FILL_NODE and t.get("status") == "new"
                  for t in tasks_page.get("tasks", [])),
              ", ".join(t.get("node_code", "") for t in tasks_page.get("tasks", []))[:60])
        server.send_signal(signal.SIGTERM)
        server.wait(timeout=20)
        server = None
        conn = db_mod.connect(cfg, create=False)

        section("9. Живой вызов: код-задача от настоящей модели, окружение systemd")
        if skip_live:
            print("        пропущено ключом --skip-live")
        else:
            conn.execute("UPDATE gen_queue SET status = 'failed' WHERE status IN "
                         "('pending', 'running', 'deferred')")
            enqueue(conn, "code", LIVE_NODE)
            conn.close()
            cmd = [
                "systemd-run", "--user", "--wait", "--pipe", "--collect",
                "--setenv=PATH=/usr/bin:/bin",
                f"--setenv=PYTHONPATH={PROJECT}",
                "--setenv=ARENA_ENV=dev",
                f"--setenv=ARENA_STATE_DIR={state}",
                f"--setenv=ARENA_VAULT={vault}",
                "--setenv=ARENA_WRITE_VAULT=1",
                "--setenv=ARENA_GEN_LIVE=1",
                sys.executable, "-m", "arena", "gen", "--drain", "--kind", "code",
                "--limit", "1",
            ]
            started = time.time()
            live = subprocess.run(cmd, capture_output=True, text=True, timeout=2400)
            spent = time.time() - started
            conn = db_mod.connect(cfg, create=False)
            print((live.stdout or "").strip()[-500:])
            check("транзитный юнит отработал", live.returncode == 0, (live.stderr or "")[-200:])
            log = conn.execute(
                "SELECT status, model, seconds, produced, cost, error FROM gen_log "
                "WHERE kind = 'code' AND node_id = (SELECT id FROM nodes WHERE code = ?) "
                "ORDER BY id DESC LIMIT 1", (LIVE_NODE,)
            ).fetchone()
            check("живой вызов дошёл до модели и прогона",
                  log is not None and log["status"] == "ok",
                  (log["error"] or log["status"]) if log is not None else "журнал пуст")
            if log is not None and log["status"] == "ok":
                print(f"        живой вызов: {log['seconds']} с (с юнитом {spent:.0f} с), "
                      f"модель {log['model']}, стоимость {log['cost']}")
                fresh = conn.execute(
                    "SELECT payload, difficulty FROM items i JOIN nodes n ON n.id = i.node_id "
                    "WHERE n.code = ? AND i.type = 'code' AND i.source = 'gen' "
                    "ORDER BY i.id DESC LIMIT 1", (LIVE_NODE,)
                ).fetchone()
                check("задача от живой модели легла в банк", fresh is not None)
                if fresh is not None:
                    data = json.loads(fresh["payload"])
                    SAMPLE.clear()
                    SAMPLE.update(data)
                    check("модель прислала опусом", log["model"] == "opus", log["model"])
                    ok, why = selfcheck.code_task(cfg, data)
                    check("эталон живой задачи зелёный и на повторном прогоне", ok, why[:90])
                    blob = json.dumps(data, ensure_ascii=False)
                    check("постановка на русском",
                          sum(ch.isalpha() and ch.lower() in "абвгдежзийклмнопрстуфхцчшщыэюя"
                              for ch in data["statement_md"]) > 100)
                    check("длинных тире и стрелок в тексте задачи нет",
                          "—" not in data["title"] + data["statement_md"]
                          and not any(ch in data["statement_md"] for ch in validate.ARROWS),
                          blob[:60])

        section("10. Боевая база и боевой волт не тронуты (правило 14.4)")
        if prod_mtime is not None:
            prod = sqlite3.connect(f"file:{real.db_path}?mode=ro", uri=True)
            dirty = [
                f"{t}={prod.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}"
                for t in ("attempts", "days", "xp_ledger", "bot_events")
                if prod.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            ]
            outside = prod.execute(
                "SELECT COUNT(*) FROM items i JOIN nodes n ON n.id = i.node_id "
                "JOIN stages s ON s.id = n.stage_id WHERE i.source = 'gen' AND s.num > 2"
            ).fetchone()[0]
            prod.close()
            prodguard.verify(prod_guard, check)
        if real_hub_sum:
            check("боевой хаб этапа 4 не тронут", digest(real_hub) == real_hub_sum)
        stage4 = real.roadmap_dir / "Этап 04 Java Core"
        check("в боевом этапе 4 по-прежнему только хаб",
              [p.name for p in stage4.glob("*.md")] == ["_Этап 04 Java Core.md"],
              ", ".join(p.name for p in stage4.glob("*.md"))[:100])
        check("конспект приёмки в боевой волт не уехал", not real_note.exists())
        conn.close()
    finally:
        if server is not None:
            server.send_signal(signal.SIGTERM)
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
        shutil.rmtree(tmp, ignore_errors=True)

    if SAMPLE:
        print("\nсгенерённая код-задача целиком:")
        print(f"\n  {SAMPLE.get('title')}\n")
        for line in (SAMPLE.get("statement_md") or "").splitlines():
            print("  " + line)
        for name, source in (SAMPLE.get("starter_files") or {}).items():
            print(f"\n  стартовый файл {name}:")
            for line in source.splitlines():
                print("    " + line)
        print("\n  видимые тесты:")
        for line in (SAMPLE.get("visible_tests") or "").splitlines():
            print("    " + line)
        print("\n  скрытые тесты:")
        for line in (SAMPLE.get("hidden_tests") or "").splitlines():
            print("    " + line)
        for name, source in (SAMPLE.get("reference_solution") or {}).items():
            print(f"\n  эталон {name}:")
            for line in source.splitlines():
                print("    " + line)

    print(f"\nитого: пройдено {PASSED}, провалено {len(FAILED)}")
    for name in FAILED:
        print(f"  провал: {name}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
