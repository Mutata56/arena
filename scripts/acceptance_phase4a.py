#!/usr/bin/env python3
"""Приёмка захода 4а: очередь генерации, воркер и лёгкие жанры.

    .venv/bin/python scripts/acceptance_phase4a.py

Всё гоняется в песочнице: своя папка стейта, своя копия волта. Боевая база только
читается, в конце сверяется, что она не изменилась даже по времени модификации.

Массовые прогоны идут на подставном claude (ARENA_GEN_FAKE, работает только
в песочнице). Ровно один вызов настоящей модели делается в разделе 7, и делается
он внутри транзитного юнита systemd с чистым PATH: так одновременно проверяются
живая интеграция и ловушка PATH из раздела 2 плана.

Ключ --skip-live пропускает живой вызов, если сеть или лимиты не дают.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

import httpx  # noqa: E402

import prodguard  # noqa: E402
from arena import config as config_mod  # noqa: E402
from arena import contract, db as db_mod, gen  # noqa: E402
from arena.gen import claude as gen_claude  # noqa: E402
from arena.gen import plan as gen_plan  # noqa: E402
from arena.gen import queue as gen_queue  # noqa: E402
from arena.gen import claude as claude_mod
from arena.gen import runtime as gen_runtime  # noqa: E402
from arena.gen import validate, weak, worker  # noqa: E402
from arena.roadmap import sync as sync_roadmap  # noqa: E402

PORT = 8804
# Нода, которую наполняем через сервер: открыта после синка, в опережение
# из раздела 4 приёмки не попадает, поэтому её банк точно пуст.
FILL_NODE = "1.09"
# Нода живого вызова: тема с настоящей глубиной, по вопросам сразу видно качество.
LIVE_NODE = "2.03"
FAILED: list[str] = []
PASSED = 0
SAMPLES: list[dict] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASSED
    if ok:
        PASSED += 1
        print(f"  ок    {name}" + (f" ({detail})" if detail else ""))
    else:
        FAILED.append(name)
        print(f"  ПРОВАЛ {name}" + (f" ({detail})" if detail else ""))


def envelope(result_text: str, **extra) -> str:
    body = {
        "type": "result", "subtype": "success", "is_error": False,
        "api_error_status": None, "total_cost_usd": 0.01, "duration_ms": 900,
        "result": result_text,
    }
    body.update(extra)
    return json.dumps(body, ensure_ascii=False)


FAKE_GOOD = '''#!/usr/bin/env python3
"""Подставной claude: отдаёт годный контент нужного жанра."""
import json, re, sys

prompt = sys.stdin.read()
mode = "quiz"
if "карточки для интервального повторения" in prompt:
    mode = "cards"
elif "чтение чужого кода" in prompt:
    mode = "readcode"
count = 3
found = re.search(r"Ровно (\\d+)", prompt)
if found:
    count = int(found.group(1))
items = []
for i in range(count):
    if mode == "quiz":
        items.append({
            "q": "Что напечатает System.out.println(1 + %d + \\"!\\") в Java?" % i,
            "opts": ["строку %d!" % (1 + i), "ошибку компиляции", "null", "пустую строку"],
            "ans": 0,
            "exp": "Числа складываются первыми, потом результат склеивается со строкой.",
            "topic": "конкатенация строк",
            "lvl": i % 3,
        })
    elif mode == "cards":
        items.append({
            "front": "Чем javac отличается от java, случай %d" % i,
            "back": "javac собирает исходник в байт-код, java запускает виртуальную машину.",
            "topic": "инструменты JDK",
        })
    else:
        items.append({
            "kind": "output",
            "code": ("public class Snippet {\\n    public static void main(String[] args) {\\n"
                     "        int[] a = {1, 2, %d};\\n        int s = 0;\\n"
                     "        for (int v : a) {\\n            s += v;\\n        }\\n"
                     "        System.out.println(s);\\n    }\\n}") % (i + 3),
            "question": "Что выведет этот код, случай %d?" % i,
            "opts": [str(3 + i + 3), "3", "0", "ошибку компиляции"],
            "ans": 0,
            "exp": "Цикл складывает все элементы массива и печатает сумму.",
            "topic": "массивы",
            "lvl": 1,
        })
print(json.dumps({
    "type": "result", "subtype": "success", "is_error": False, "api_error_status": None,
    "total_cost_usd": 0.02, "result": json.dumps({"items": items}, ensure_ascii=False),
}, ensure_ascii=False))
'''

FAKE_BAD = '''#!/usr/bin/env python3
"""Подставной claude: конверт правильный, а внутри модель заболталась."""
import json, sys
sys.stdin.read()
print(json.dumps({
    "type": "result", "subtype": "success", "is_error": False, "api_error_status": None,
    "total_cost_usd": 0.01,
    "result": "Конечно! Вот двенадцать отличных вопросов:\\n1. Что такое JVM?\\n2. ...",
}, ensure_ascii=False))
'''

FAKE_LIMIT = '''#!/usr/bin/env python3
"""Подставной claude: лимит подписки, окно откроется в известное время."""
import json, sys
sys.stdin.read()
print(json.dumps({
    "type": "result", "subtype": "error_during_execution", "is_error": True,
    "api_error_status": None, "total_cost_usd": 0,
    "result": "Claude AI usage limit reached|1790000000",
}, ensure_ascii=False))
sys.exit(1)
'''

FAKE_DIRTY = '''#!/usr/bin/env python3
"""Подставной claude: половина записей со штампами, которые продукт не пускает."""
import json, sys
sys.stdin.read()
items = [
    {"q": "Java \\u2014 это компилируемый или интерпретируемый язык?",
     "opts": ["и то, и другое", "только компилируемый", "только интерпретируемый", "ни то, ни другое"],
     "ans": 0, "exp": "Исходник \\u2014 это байт-код, который потом исполняет JVM.",
     "topic": "байт-код", "lvl": 1},
    {"q": "Что произойдёт при вызове javac \\u2192 java для класса без main?",
     "opts": ["ошибка запуска", "ничего", "предупреждение", "класс запустится"],
     "ans": 0, "exp": "Точка входа обязательна для запуска.", "topic": "точка входа", "lvl": 1},
    {"q": "Сколько байт занимает int в Java?",
     "opts": ["4", "2", "8", "зависит от платформы"], "ans": 0,
     "exp": "Размеры примитивов в Java фиксированы спецификацией.", "topic": "примитивы", "lvl": 0},
]
print(json.dumps({
    "type": "result", "subtype": "success", "is_error": False, "api_error_status": None,
    "total_cost_usd": 0.01, "result": json.dumps({"items": items}, ensure_ascii=False),
}, ensure_ascii=False))
'''


FAKE_ARTICLE = '''#!/usr/bin/env python3
"""Подставной claude: подбор статьи с квизом по содержанию."""
import json, sys
sys.stdin.read()
quiz = [{
    "q": "Что автор называет главной причиной неточности double, случай %d?" % i,
    "opts": ["двоичное представление дробей", "ошибку компилятора",
             "нехватку памяти", "настройки локали"],
    "ans": 0,
    "exp": "В статье это разобрано на примере сложения 0.1 и 0.2.",
} for i in range(5)]
items = [{
    "url": "https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html",
    "title": "Primitive Types and Values",
    "why_md": "Раздел спецификации про примитивы: там прямо написано, какие диапазоны "
              "у типов и почему дробные считаются с погрешностью.",
    "lang": "en",
    "quiz": quiz,
}]
print(json.dumps({
    "type": "result", "subtype": "success", "is_error": False, "api_error_status": None,
    "total_cost_usd": 0.05, "result": json.dumps({"items": items}, ensure_ascii=False),
}, ensure_ascii=False))
'''


def write_fake(path: Path, body: str) -> str:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)
    return f"{sys.executable} {path}"


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


def section(title: str) -> None:
    print(f"\n{title}")


def _with_env(name: str, value: str, fn):
    """Временно выставить переменную окружения и вернуть результат вызова."""
    old = os.environ.get(name)
    os.environ[name] = value
    try:
        return fn()
    finally:
        if old is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = old


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

    tmp = Path(tempfile.mkdtemp(prefix="arena-4a-"))
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
        })
        cfg = config_mod.load(env="dev")
        conn = db_mod.init(cfg)
        report = sync_roadmap(conn, cfg)
        print(f"песочница поднята: этапов {report.stages_added}, нод {report.nodes_added}")

        fake_good = write_fake(tmp / "fake_good.py", FAKE_GOOD)
        fake_bad = write_fake(tmp / "fake_bad.py", FAKE_BAD)
        fake_limit = write_fake(tmp / "fake_limit.py", FAKE_LIMIT)
        fake_dirty = write_fake(tmp / "fake_dirty.py", FAKE_DIRTY)
        fake_article = write_fake(tmp / "fake_article.py", FAKE_ARTICLE)

        section("1. Разбор конверта CLI: два слоя JSON")
        text = json.dumps({"items": [{"q": "раз"}]}, ensure_ascii=False)
        env_ok, why = gen_claude.parse_envelope(envelope(text))
        check("конверт разбирается", env_ok is not None and env_ok["result"] == text, why)
        broken, why = gen_claude.parse_envelope("{не json")
        check("битый конверт это не контент, а сбой", broken is None and "конверт" in why)
        no_result, why = gen_claude.parse_envelope('{"type": "assistant"}')
        check("конверт без result отвергается", no_result is None, why)
        fenced = gen_claude.strip_fence("```json\n{\"items\": []}\n```")
        check("обёртка ```json снимается", fenced == '{"items": []}', fenced)
        check("лимит подписки опознан", gen_claude.looks_like_limit("Claude AI usage limit reached|1790000000"))
        check("429 опознан", gen_claude.looks_like_limit("API Error: 429 rate_limit_error"))
        check("обычный ответ за лимит не принимается",
              not gen_claude.looks_like_limit('{"items": [{"q": "что такое JVM"}]}'))
        stamp = gen_claude.limit_retry_after("Claude AI usage limit reached|1790000000")
        check("время окна вынуто из ответа", stamp > db_mod.now(), stamp)
        check("лимит без подсказки откладывается на полчаса",
              gen_claude.limit_retry_after("429 rate limit") > db_mod.now())

        section("2. Командная строка вызова")
        argv = gen_claude.build_argv([gen_runtime.CLAUDE_BIN], "sonnet", None)
        check("claude зовётся по абсолютному пути",
              argv[0] == "~/.local/bin/claude", argv[0])
        check("вариадический --tools стоит последним", argv[-2] == "--tools", " ".join(argv[-3:]))
        check("формат ответа это json", "--output-format" in argv and "json" in argv)
        check("лёгкие жанры идут не опусом",
              gen_runtime.model_for("quiz") != "opus", gen_runtime.model_for("quiz"))
        check("тяжёлые жанры зарезервированы за опусом",
              gen_runtime.model_for("code") == "opus")
        check("статьям выдан веб-поиск", "WebSearch" in (worker.TOOLS.get("article") or ""))
        check("таймаут вызова с запасом над живым замером (худший 477 с)",
              gen_runtime.timeout() >= 900, f"{gen_runtime.timeout()} с")

        section("3. Схемная валидация")
        ctx = {"node_title": "Целочисленные типы", "src": "нода 2.02"}
        good = {"q": "Сколько байт занимает int в Java?", "opts": ["4", "2", "8", "16"],
                "ans": 0, "exp": "Размер int в Java фиксирован спецификацией и равен четырём байтам.",
                "topic": "примитивы", "lvl": 1}
        payload = validate.quiz(good, ctx)
        check("годный вопрос проходит", payload["ans"] == 0 and len(payload["opts"]) == 4)
        for name, broken in (
            ("вариантов не четыре", {**good, "opts": ["1", "2", "3"]}),
            ("ans вне диапазона", {**good, "ans": 7}),
            ("пустое объяснение", {**good, "exp": ""}),
            ("повторяющиеся варианты", {**good, "opts": ["4", "4", "8", "16"]}),
            ("пустой вопрос", {**good, "q": ""}),
        ):
            try:
                validate.quiz(broken, ctx)
                check(f"невалид отбит: {name}", False)
            except validate.Bad as exc:
                check(f"невалид отбит: {name}", True, str(exc)[:60])
        dashed = validate.quiz({**good, "exp": "int — это четыре байта, всегда и везде."}, ctx)
        check("длинное тире чинится на дефис",
              "—" not in dashed["exp"] and " - " in dashed["exp"], dashed["exp"])
        try:
            validate.quiz({**good, "q": "Что даст javac → java?"}, ctx)
            check("стрелка в тексте отбивается", False)
        except validate.Bad as exc:
            check("стрелка в тексте отбивается", True, str(exc)[:60])
        lambda_ok = validate.quiz({**good, "code": "list.forEach(x -> System.out.println(x));"}, ctx)
        check("стрелка внутри кода разрешена", "->" in lambda_ok["code"])
        card = validate.card({"front": "Что такое JVM", "back": "Виртуальная машина, исполняет байт-код."}, ctx)
        check("годная карточка проходит", card["front"] and card["back"])
        try:
            validate.card({"front": "ю" * 400, "back": "ответ подлиннее"}, ctx)
            check("карточка-конспект отбивается", False)
        except validate.Bad as exc:
            check("карточка-конспект отбивается", True, str(exc)[:50])
        # Заход 4б: вопрос «что выведет» проверяется запуском, поэтому сниппет
        # обязан быть целой программой. Фрагмент годится только для вопроса про баг.
        rc = {"code": "public class Snippet {\n    public static void main(String[] args) {\n"
                      "        int a = 1;\n        int b = 2;\n"
                      "        System.out.println(a + b);\n    }\n}",
              "question": "Что выведет этот код?", "opts": ["3", "12", "0", "ошибку"],
              "ans": 0, "exp": "Складываются два int, печатается три."}
        check("годный readcode проходит", validate.readcode(rc, ctx)["ans"] == 0)
        try:
            validate.readcode({**rc, "code": "int a = 1;"}, ctx)
            check("сниппет в одну строку отбивается", False)
        except validate.Bad as exc:
            check("сниппет в одну строку отбивается", True, str(exc)[:50])
        parsed, rejected = validate.items("quiz", {"items": [good, {**good, "ans": 9}]}, ctx)
        check("годное берём, кривое считаем", len(parsed) == 1 and len(rejected) == 1)

        section("4. Очередь: триггер входа в ноду и опережение на пять нод")
        node = conn.execute("SELECT * FROM nodes WHERE code = '1.01'").fetchone()
        entry = contract.enter_node(conn, node["id"])
        conn.commit()
        check("первый вход в ноду это «new»", entry == "new", str(entry))
        rows = conn.execute(
            "SELECT g.kind, n.code, g.priority FROM gen_queue g JOIN nodes n ON n.id = g.node_id "
            "ORDER BY g.priority DESC, g.id"
        ).fetchall()
        codes = sorted({row["code"] for row in rows})
        # Заход 4б включил код-задачи, поэтому на каждую ноду этапа 1 приходится
        # четыре задания вместо трёх (конспекты этим нодам не нужны: файлы уже есть).
        per_node = 4
        check("вход наполнил очередь", len(rows) == 6 * per_node, f"заданий {len(rows)}")
        check("опережение ровно на пять нод вперёд",
              codes == ["1.01", "1.02", "1.03", "1.04", "1.05", "1.06"], ", ".join(codes))
        check("жанры на ноду это вопросы, карточки, чужой код и код-задача",
              sorted({row["kind"] for row in rows}) == ["cards", "code", "quiz", "readcode"])
        check("лёгкие жанры первыми внутри ноды, тяжёлые догоняют",
              [r["kind"] for r in rows[:per_node]] == ["quiz", "cards", "readcode", "code"],
              ", ".join(r["kind"] for r in rows[:per_node]))
        check("ближняя нода важнее дальней",
              rows[0]["code"] == "1.01" and rows[per_node]["code"] == "1.02")
        again = gen.trigger(conn, node["id"])
        conn.commit()
        check("повторный триггер не плодит дубли", not again["queued"],
              f"добавлено {len(again['queued'])}")
        check("незакрытых жанров в плане не осталось",
              gen_plan.RESERVED_KINDS == () and not again["reserved"],
              ", ".join(gen_plan.RESERVED_KINDS) or "пусто")
        side = conn.execute(
            "SELECT n.* FROM nodes n JOIN stages s ON s.id = n.stage_id "
            "WHERE s.in_track = 0 ORDER BY s.num, n.seq LIMIT 1"
        ).fetchone()
        ahead_side = gen_plan.trajectory_after(conn, side, 5)
        check("необязательная ветка не тянет за собой опережение",
              ahead_side == [], f"{side['code']}: {len(ahead_side)}")
        ahead = gen_plan.trajectory_after(conn, node, 5)
        check("опережение идёт по возрастанию кодов",
              [r["code"] for r in ahead] == ["1.02", "1.03", "1.04", "1.05", "1.06"])
        claimed = gen_queue.claim(conn, kinds=("code",))
        check("код-задача берётся в работу тем же воркером", claimed is not None,
              claimed["kind"] if claimed is not None else "не взял")
        if claimed is not None:
            conn.execute("UPDATE gen_queue SET status = 'pending' WHERE id = ?", (claimed["id"],))
            conn.commit()

        section("5. Сквозной прогон через сервер: вход в ноду наполняет ноду")
        # Чистим очередь от заданий предыдущего раздела: здесь проверяется, что ноду
        # наполняет именно вход в неё, а не остатки прошлого планирования.
        conn.execute("DELETE FROM gen_queue")
        conn.commit()
        env = dict(os.environ)
        env.update({
            "PYTHONPATH": str(PROJECT),
            "ARENA_GEN_FAKE": fake_good,
            "ARENA_GEN_POLL": "0.2",
        })
        conn.close()
        server = subprocess.Popen(
            [sys.executable, "-m", "arena", "serve", "--port", str(PORT)],
            cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        client = httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=15.0)
        check("сервер поднялся", wait_up(client))
        status = client.get("/api/gen/status").json()
        check("воркер видит подставной бинарь", status["mode"] == "fake", status["mode"])
        entered = client.post(f"/api/node/{FILL_NODE}/enter").json()
        check(f"вход в ноду {FILL_NODE} принят", entered.get("code") == FILL_NODE,
              json.dumps(entered, ensure_ascii=False)[:120])
        check("банк ноды до генерации пуст", not entered.get("atoms"),
              str(len(entered.get("atoms") or [])))
        deadline = time.time() + 120
        bank: dict[str, int] = {}
        while time.time() < deadline:
            probe = db_mod.connect(cfg, create=False)
            bank = node_bank(probe, FILL_NODE)
            probe.close()
            if bank.get("quiz", 0) >= 12 and bank.get("card", 0) >= 4 and bank.get("readcode", 0) >= 2:
                break
            time.sleep(0.5)
        check("нода наполнилась вопросами", bank.get("quiz", 0) >= 12, f"вопросов {bank.get('quiz', 0)}")
        check("нода наполнилась карточками", bank.get("card", 0) >= 4, f"карточек {bank.get('card', 0)}")
        check("нода наполнилась чужим кодом", bank.get("readcode", 0) >= 2,
              f"задач {bank.get('readcode', 0)}")
        view = client.get(f"/api/node/{FILL_NODE}").json()
        check("атомы ноды видно в вебе", len(view["atoms"]) >= 18, str(len(view["atoms"])))
        probe = db_mod.connect(cfg, create=False)
        cards_ready = probe.execute(
            "SELECT COUNT(*) FROM card_state cs JOIN items i ON i.id = cs.item_id "
            "WHERE i.source = 'gen' AND cs.last IS NULL"
        ).fetchone()[0]
        probe.close()
        check("новые карточки встали в очередь SM-2", cards_ready >= 4, str(cards_ready))
        after = client.get("/api/gen/status").json()
        check("очередь разбирается сама", after["queue"].get("done", 0) >= 3,
              json.dumps(after["queue"], ensure_ascii=False))
        # Главное, ради чего всё затевалось: сгенерённое обязано доехать до петли дня,
        # а не просто лечь в таблицу. Экран «Сегодня» берёт вопросы своим запросом,
        # и он не тот же самый, что список атомов ноды.
        snap = client.get("/api/today").json()
        check("сгенерённые вопросы стали целью дня",
              snap["contract"]["quiz_target"] == 10 and snap["contract"]["quiz_source"] == "node",
              json.dumps(snap["contract"], ensure_ascii=False)[:120])
        check("сгенерённые карточки стали целью дня", snap["contract"]["cards_target"] >= 4,
              str(snap["contract"]["cards_target"]))
        served = client.get("/api/quiz/next").json()
        probe = db_mod.connect(cfg, create=False)
        origin = probe.execute(
            "SELECT i.source, n.code FROM items i LEFT JOIN nodes n ON n.id = i.node_id "
            "WHERE i.id = ?", (served["item_id"],)
        ).fetchone()
        probe.close()
        check("плеер дня отдаёт именно сгенерённый вопрос",
              origin["source"] == "gen" and origin["code"] == FILL_NODE,
              f"{origin['source']}, нода {origin['code']}")
        check("вопрос приехал с вариантами и без правильного ответа",
              len(served["opts"]) == 4 and "ans" not in served)
        server.send_signal(signal.SIGTERM)
        server.wait(timeout=20)
        server = None
        conn = db_mod.connect(cfg, create=False)

        section("6. Невалидный ответ модели: failed с сырым логом, конвейер жив")
        os.environ["ARENA_GEN_FAKE"] = fake_bad
        target = conn.execute("SELECT * FROM nodes WHERE code = '2.02'").fetchone()
        gen_queue.enqueue(conn, "quiz", node_id=target["id"], stage_id=target["stage_id"],
                          params={"count": 12}, priority=9000, force=True)
        conn.commit()
        result = worker.drain(cfg, limit=1, kinds=("quiz",))
        check("невалид уходит в провал", result["failed"] == 1, json.dumps(result))
        row = conn.execute(
            "SELECT status, attempts, error FROM gen_queue WHERE node_id = ? AND kind = 'quiz' "
            "ORDER BY id DESC LIMIT 1", (target["id"],)
        ).fetchone()
        check("статус задания failed", row["status"] == "failed", row["status"])
        check("попытка засчитана", row["attempts"] == 1, str(row["attempts"]))
        log = conn.execute(
            "SELECT status, raw, prompt, error FROM gen_log ORDER BY id DESC LIMIT 1"
        ).fetchone()
        check("сырой ответ модели сохранён",
              log["status"] == "invalid" and "Конечно" in (log["raw"] or ""),
              (log["raw"] or "")[:50])
        check("промпт сохранён рядом с ответом", "Ровно 12" in (log["prompt"] or ""))
        os.environ["ARENA_GEN_FAKE"] = fake_good
        alive = worker.drain(cfg, limit=1, kinds=("quiz",))
        check("конвейер после провала жив", alive["ok"] == 1, json.dumps(alive))

        section("7. Ошибка лимита: deferred, попытка не сгорает")
        os.environ["ARENA_GEN_FAKE"] = fake_limit
        third = conn.execute("SELECT * FROM nodes WHERE code = '2.05'").fetchone()
        job_id = gen_queue.enqueue(conn, "quiz", node_id=third["id"], stage_id=third["stage_id"],
                                   params={"count": 12}, priority=9000, force=True)
        conn.commit()
        before = conn.execute("SELECT attempts FROM gen_queue WHERE id = ?", (job_id,)).fetchone()[0]
        limited = worker.drain(cfg, limit=3, kinds=("quiz",))
        row = conn.execute(
            "SELECT status, attempts, retry_after FROM gen_queue WHERE id = ?", (job_id,)
        ).fetchone()
        check("лимит уводит задание в deferred", row["status"] == "deferred", row["status"])
        check("попытка при лимите не сгорает", row["attempts"] == before,
              f"было {before}, стало {row['attempts']}")
        check("время окна взято из ответа модели", (row["retry_after"] or "") > db_mod.now(),
              str(row["retry_after"]))
        check("очередь встаёт на паузу, а не молотит дальше", limited["runs"] == 1,
              f"вызовов {limited['runs']}")
        log = conn.execute("SELECT status FROM gen_log ORDER BY id DESC LIMIT 1").fetchone()
        check("лимит виден в журнале", log["status"] == "limit", log["status"])
        gen_queue.revive(conn)
        conn.commit()
        still = conn.execute("SELECT status FROM gen_queue WHERE id = ?", (job_id,)).fetchone()
        check("до окна задание не возвращается в работу", still["status"] == "deferred",
              still["status"])
        conn.execute("UPDATE gen_queue SET status = 'failed' WHERE id = ?", (job_id,))
        conn.commit()

        section("8. Стиль: штампы не доезжают до банка")
        os.environ["ARENA_GEN_FAKE"] = fake_dirty
        dirty_node = conn.execute("SELECT * FROM nodes WHERE code = '2.06'").fetchone()
        gen_queue.enqueue(conn, "quiz", node_id=dirty_node["id"], stage_id=dirty_node["stage_id"],
                          params={"count": 3}, priority=9000, force=True)
        conn.commit()
        worker.drain(cfg, limit=1, kinds=("quiz",))
        payloads = [json.loads(r["payload"]) for r in conn.execute(
            "SELECT payload FROM items i JOIN nodes n ON n.id = i.node_id "
            "WHERE n.code = '2.06' AND i.source = 'gen'")]
        blob = json.dumps(payloads, ensure_ascii=False)
        check("длинных тире в банке нет", "—" not in blob and "–" not in blob)
        check("стрелок в банке нет", not any(ch in blob for ch in validate.ARROWS))
        check("запись со стрелкой не доехала, остальные доехали", len(payloads) == 2,
              f"записей {len(payloads)}")

        section("8б. Статьи это жанр этапа и в автоматический план не лезут")
        os.environ["ARENA_GEN_FAKE"] = fake_article
        stage2 = conn.execute("SELECT id, num FROM stages WHERE num = 2").fetchone()
        check("статьи не попадают в план ноды",
              not any(g.kind == "article" for g, _ in gen_plan.wanted(
                  conn, conn.execute("SELECT * FROM nodes WHERE code = '2.02'").fetchone())))
        planned = gen_plan.plan_stage_articles(conn, stage2["id"])
        conn.commit()
        check("руками статьи ставятся на этап", planned == ["этап 2 article"], ", ".join(planned))
        art = worker.drain(cfg, limit=1, kinds=("article",))
        check("статья доехала до банка", art["ok"] == 1 and art["added"] == 1, json.dumps(art))
        stored = conn.execute(
            "SELECT payload FROM items WHERE type = 'article' AND stage_id = ?", (stage2["id"],)
        ).fetchone()
        article = json.loads(stored["payload"]) if stored else {}
        check("у статьи ссылка, зачем читать и пять вопросов",
              article.get("url", "").startswith("https://") and len(article.get("quiz", [])) == 5
              and article.get("why_md"), json.dumps(article, ensure_ascii=False)[:80])

        section("9. Свежие ошибки ученика доезжают до промпта соседней ноды")
        os.environ["ARENA_GEN_FAKE"] = fake_good
        victim = conn.execute(
            "SELECT i.id, i.payload FROM items i JOIN nodes n ON n.id = i.node_id "
            "WHERE n.code = ? AND i.type = 'quiz' AND i.source = 'gen' LIMIT 1",
            (FILL_NODE,),
        ).fetchone()
        payload = json.loads(victim["payload"])
        wrong = (payload["ans"] + 1) % 4
        contract.answer_quiz(conn, victim["id"], wrong)
        summary = weak.summary(conn, None)
        check("ошибка попала в сводку слабых мест", payload["topic"] in summary,
              summary.splitlines()[0] if summary else "пусто")
        neighbour = conn.execute("SELECT * FROM nodes WHERE code = '2.07'").fetchone()
        gen_queue.enqueue(conn, "quiz", node_id=neighbour["id"], stage_id=neighbour["stage_id"],
                          params={"count": 12}, priority=9000, force=True)
        conn.commit()
        worker.drain(cfg, limit=1, kinds=("quiz",))
        prompt = conn.execute(
            "SELECT prompt FROM gen_log WHERE node_id = ? ORDER BY id DESC LIMIT 1",
            (neighbour["id"],),
        ).fetchone()["prompt"]
        check("промпт соседней ноды знает про ошибку", payload["topic"] in prompt,
              payload["topic"])
        check("промпт требует целить в слабые места",
              "Не меньше трети вопросов должны бить по слабым местам" in prompt)
        check("в промпте есть контекст ноды",
              neighbour["title"] in prompt and neighbour["descr"][:20] in prompt)
        check("в промпте перечислено, что уже есть в банке",
              "Уже есть в банке этой ноды" in prompt)

        section("10. Промпты на диске")
        for name in ("contract.md", "quiz_gen.md", "cards_gen.md", "readcode_gen.md",
                     "article_pick.md"):
            body = (PROJECT / "prompts" / name).read_text(encoding="utf-8")
            clean = "—" not in body and "–" not in body and not any(
                ch in body for ch in validate.ARROWS)
            check(f"промпт {name} без длинных тире и стрелок", clean)
        contract_md = (PROJECT / "prompts" / "contract.md").read_text(encoding="utf-8")
        check("общий контракт требует русского и одного объекта JSON",
              "Всё на русском" in contract_md and "ОДИН объект JSON" in contract_md)

        section("11. Ловушка PATH: генерация в окружении systemd и живой вызов")
        if skip_live:
            print("        пропущено ключом --skip-live")
        else:
            conn.execute("UPDATE gen_queue SET status = 'failed' WHERE status IN "
                         "('pending', 'deferred', 'running')")
            live_node = conn.execute("SELECT * FROM nodes WHERE code = ?", (LIVE_NODE,)).fetchone()
            gen_queue.enqueue(conn, "quiz", node_id=live_node["id"], stage_id=live_node["stage_id"],
                              params={"count": 6}, priority=9999, force=True)
            conn.commit()
            conn.close()
            cmd = [
                "systemd-run", "--user", "--wait", "--pipe", "--collect",
                "--setenv=PATH=/usr/bin:/bin",
                f"--setenv=PYTHONPATH={PROJECT}",
                "--setenv=ARENA_ENV=dev",
                f"--setenv=ARENA_STATE_DIR={state}",
                f"--setenv=ARENA_VAULT={vault}",
                "--setenv=ARENA_GEN_LIVE=1",
                sys.executable, "-m", "arena", "gen", "--drain", "--kind", "quiz", "--limit", "1",
            ]
            started = time.time()
            live = subprocess.run(cmd, capture_output=True, text=True, timeout=1000)
            spent = time.time() - started
            conn = db_mod.connect(cfg, create=False)
            print((live.stdout or "").strip()[-400:])
            check("транзитный юнит отработал", live.returncode == 0,
                  (live.stderr or "")[-200:])
            log = conn.execute(
                "SELECT status, model, seconds, produced, cost, error FROM gen_log "
                "WHERE node_id = ? ORDER BY id DESC LIMIT 1", (live_node["id"],)
            ).fetchone()
            check("живой вызов дошёл до модели", log is not None and log["status"] == "ok",
                  (log["error"] or log["status"]) if log else "журнал пуст")
            if log is not None and log["status"] == "ok":
                check("вопросы приехали", log["produced"] >= 4, f"записей {log['produced']}")
                print(f"        один живой вызов: {log['seconds']} с "
                      f"(со стартом юнита {spent:.0f} с), модель {log['model']}, "
                      f"стоимость {log['cost']}")
                fresh = [json.loads(r["payload"]) for r in conn.execute(
                    "SELECT payload FROM items i JOIN nodes n ON n.id = i.node_id "
                    "WHERE n.code = ? AND i.source = 'gen' ORDER BY i.id", (LIVE_NODE,))]
                SAMPLES.extend(fresh)
                blob = json.dumps(fresh, ensure_ascii=False)
                check("живой контент на русском",
                      len(re.findall(r"[а-яА-Я]", blob)) > 200, str(len(blob)))
                check("в живом контенте нет длинных тире и стрелок",
                      "—" not in blob and not any(ch in blob for ch in validate.ARROWS))
                check("у каждого вопроса четыре варианта и объяснение",
                      all(len(q["opts"]) == 4 and q["exp"] for q in fresh))
                check("Клиент A ответ не всегда первый",
                      len({q["ans"] for q in fresh}) > 1,
                      ", ".join(str(q["ans"]) for q in fresh))

        section("12. Юниты в deploy/, в систему не поставлены")
        timer = (PROJECT / "deploy" / "arena-gen.timer").read_text(encoding="utf-8")
        service = (PROJECT / "deploy" / "arena-gen.service").read_text(encoding="utf-8")
        check("таймер с Persistent=true", "Persistent=true" in timer)
        check("окно 02:00-06:00", "OnCalendar=*-*-* 02:00:00" in timer
              and "RandomizedDelaySec=4h" in timer)
        check("сервис зовёт ночной проход", "arena gen --nightly" in service)
        check("в юните прописан PATH с ~/.local/bin", "~/.local/bin" in service)
        check("ночной проход обрывается раньше юнита",
              gen_runtime.NIGHT_BUDGET_SEC < 3 * 3600 and "TimeoutStartSec=3h" in service,
              f"проход {gen_runtime.NIGHT_BUDGET_SEC // 3600} ч")
        verify = subprocess.run(
            ["systemd-analyze", "verify", "--user",
             str(PROJECT / "deploy" / "arena-gen.service"),
             str(PROJECT / "deploy" / "arena-gen.timer")],
            capture_output=True, text=True)
        check("systemd-analyze доволен юнитами", verify.returncode == 0,
              (verify.stderr or "")[:120])
        # Раньше тут стоял запрет агенту ставить юнит в систему. demo_user поставил его
        # сам по памятке, поэтому проверяем по смыслу: если юнит установлен, он должен
        # звать этот репозиторий, а не чужую копию.
        print("\n   уровень размышлений по сложности ноды")
        from arena.gen import difficulty as gen_difficulty
        easy = {"code": "1.01", "stage_num": 1, "kind": "тема", "obsidian_path": None}
        hard = {"code": "12.14", "stage_num": 12, "kind": "тема", "obsidian_path": None}
        test_node = {"code": "2.16", "stage_num": 2, "kind": "тест", "obsidian_path": None}
        d_easy = gen_difficulty.for_node(real, easy)
        d_hard = gen_difficulty.for_node(real, hard)
        check("лёгкая нода дешевле трудной", d_easy < d_hard, f"{d_easy} против {d_hard}")
        check("тип «тест» поднимает сложность",
              gen_difficulty.for_node(real, test_node) > gen_difficulty.for_node(
                  real, {**test_node, "kind": "тема"}))
        check("карточки на лёгкой ноде идут дёшево",
              gen_runtime.effort_for("cards", d_easy) == "low",
              gen_runtime.effort_for("cards", d_easy))
        check("карточки на трудной ноде поднимаются до medium",
              gen_runtime.effort_for("cards", d_hard) == "medium",
              gen_runtime.effort_for("cards", d_hard))
        check("вопросы на трудной ноде идут на high",
              gen_runtime.effort_for("quiz", d_hard) == "high",
              gen_runtime.effort_for("quiz", d_hard))
        check("код и конспект всегда наверху",
              gen_runtime.effort_for("code", 1) == "high" and gen_runtime.effort_for("note", 1) == "high")
        check("переменная перекрывает карту",
              _with_env("ARENA_GEN_EFFORT", "low", lambda: gen_runtime.effort_for("code", 5)) == "low")
        check("уровень уходит в командную строку",
              "--effort" in claude_mod.build_argv(["claude"], "sonnet", "", "medium"))

        installed = Path.home() / ".config" / "systemd" / "user" / "arena-gen.timer"
        unit = Path.home() / ".config" / "systemd" / "user" / "arena-gen.service"
        if installed.exists() and unit.exists():
            body = unit.read_text(encoding="utf-8")
            check("установленный юнит смотрит в этот репозиторий", str(PROJECT) in body,
                  "ExecStart ведёт в другое место")
        else:
            check("юнит лежит в deploy и готов к установке",
                  (PROJECT / "deploy" / "arena-gen.timer").exists())

        section("13. Боевая база не тронута (правило 14.4)")
        if prod_mtime is not None:
            check("боевая база не менялась", real.db_path.stat().st_mtime_ns == prod_mtime)
            prod = sqlite3.connect(f"file:{real.db_path}?mode=ro", uri=True)
            dirty = [
                f"{t}={prod.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}"
                for t in ("attempts", "days", "xp_ledger", "bot_events")
                if prod.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            ]
            # Заход 4б засеял банк первых нод этапа 1, и это разрешённая планом запись
            # (раздел 15). Поэтому проверяем не «банк пуст», а то, ради чего правило 14.4
            # написано: в боевой базе нет прогресса, а засев не уехал за пределы этапов 1-2.
            outside = prod.execute(
                "SELECT COUNT(*) FROM items i JOIN nodes n ON n.id = i.node_id "
                "JOIN stages s ON s.id = n.stage_id WHERE i.source = 'gen' AND s.num > 2"
            ).fetchone()[0]
            # Задание в работе это норма: воркер живой и что-то делает прямо сейчас.
            # Плохо, когда оно висит дольше порога подбора брошенных.
            stuck = prod.execute(
                "SELECT COUNT(*) FROM gen_queue WHERE status = 'running' "
                "AND started_at IS NOT NULL "
                "AND (julianday('now', 'localtime') - julianday(started_at)) * 86400 > ?",
                (gen_runtime.timeout() * 2,)).fetchone()[0]
            prod.close()
            prodguard.verify(prod_guard, check)
            check("засев не уехал за пределы первых этапов", outside == 0, str(outside))
            check("в боевой очереди нет намертво зависших заданий", stuck == 0, str(stuck))
        conn.close()
    finally:
        if server is not None:
            server.send_signal(signal.SIGTERM)
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
        shutil.rmtree(tmp, ignore_errors=True)

    if SAMPLES:
        print("\nчто получилось на живом вызове (первые два вопроса целиком):")
        for item in SAMPLES[:2]:
            print(f"\n  вопрос: {item['q']}")
            if item.get("code"):
                for line in item["code"].splitlines():
                    print(f"      {line}")
            for i, opt in enumerate(item["opts"]):
                print(f"    {'>' if i == item['ans'] else ' '} {i + 1}. {opt}")
            print(f"    объяснение: {item['exp']}")
            print(f"    тема: {item['topic']}, уровень {item['lvl']}")

    print(f"\nитого: пройдено {PASSED}, провалено {len(FAILED)}")
    for name in FAILED:
        print(f"  провал: {name}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
