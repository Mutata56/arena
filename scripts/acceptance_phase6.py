#!/usr/bin/env python3
"""Приёмка фазы 6: боссы, защита и разбор.

    .venv/bin/python scripts/acceptance_phase6.py
    .venv/bin/python scripts/acceptance_phase6.py --no-claude   без живой оценки защиты

Всё гоняется в песочнице: свой стейт, КОПИЯ волта, свой портфель решений.
Боевая база и боевой волт только читаются, в конце сверяется, что они не менялись.

Стейт держим в ~/.cache, а не в /tmp: под /tmp у systemd-run своё пространство имён
(PrivateTmp), и папка прогона код-части там просто не находится. Это ловушка фазы 3,
и наступать на неё второй раз незачем.
"""

from __future__ import annotations

import dataclasses
import json
import os
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

import httpx  # noqa: E402

from arena import boss as boss_mod  # noqa: E402
import prodguard  # noqa: E402
from arena import config as config_mod  # noqa: E402
from arena import db as db_mod  # noqa: E402
from arena import defense as defense_mod  # noqa: E402
from arena import devclock, migrations, progress, xp  # noqa: E402
from arena import taunts as taunts_mod  # noqa: E402
from arena.importers import code_tasks, html_tests, jcards  # noqa: E402
from arena.roadmap import sync as sync_roadmap  # noqa: E402

PORT = 8805
STAND = Path.home() / ".cache" / "arena-phase6"

TOPICS = ["переменные", "типы данных", "операторы", "условия", "циклы", "методы"]
WEAK_TOPICS = ["операторы", "циклы"]
PER_TOPIC = 10

FAILED: list[str] = []
PASSED = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASSED
    if ok:
        PASSED += 1
        print(f"  ок    {name}" + (f" ({detail})" if detail else ""))
    else:
        FAILED.append(name)
        print(f"  ПРОВАЛ {name}" + (f" ({detail})" if detail else ""))


# ---------------------------------------------------------------- стенд

def seed_quizzes(conn: sqlite3.Connection, stage_id: int) -> int:
    """Банк вопросов первого этапа. В боевой базе его нет вообще: исходные
    HTML-тесты не покрывают тему «Старт», а генератор это фаза 4. Для боя
    вопросы нужны, поэтому приёмка сеет свои и только в песочнице."""
    made = 0
    for topic in TOPICS:
        for i in range(PER_TOPIC):
            payload = {
                "q": f"Вопрос {i + 1} по теме «{topic}»: что здесь верно?",
                "opts": [f"вариант {n} про {topic}" for n in range(1, 5)],
                "ans": i % 4,
                "exp": f"Клиент A вариант {i % 4 + 1}: так работает {topic}",
                "topic": topic,
                "lvl": i % 3,
            }
            conn.execute(
                "INSERT INTO items(node_id, stage_id, type, payload, difficulty, source, "
                "source_key, active, created) VALUES (NULL, ?, 'quiz', ?, ?, 'manual', ?, 1, ?)",
                (stage_id, json.dumps(payload, ensure_ascii=False), i % 3,
                 f"acceptance6:{topic}:{i}", db_mod.now()),
            )
            made += 1
    conn.commit()
    return made


def wait_up(client: httpx.Client, tries: int = 80) -> bool:
    for _ in range(tries):
        try:
            client.get("/api/boss", timeout=1.0)
            return True
        except Exception:  # noqa: BLE001
            time.sleep(0.25)
    return False


def start_server(env: dict) -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, "-m", "arena", "serve", "--port", str(PORT)],
        cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )


def stop_server(server: subprocess.Popen | None) -> None:
    if server is None:
        return
    server.send_signal(signal.SIGTERM)
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()


def run_cli(args: list[str], env: dict, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "arena", *args],
        cwd=str(cwd or PROJECT), env=env, capture_output=True, text=True, timeout=600,
    )


def answers_of(db_path: Path, item_ids: list[int]) -> dict[int, dict]:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    marks = ",".join("?" * len(item_ids))
    out = {}
    for row in conn.execute(f"SELECT id, payload FROM items WHERE id IN ({marks})", item_ids):
        data = json.loads(row["payload"])
        out[row["id"]] = data
    conn.close()
    return out


# ---------------------------------------------------------------- ответы защиты

CODE_ANSWER = (
    "Рамку я собрал одним выражением: верхняя и нижняя строки одинаковые, поэтому считаю "
    "их один раз в переменную edge и переиспользую. Длина рамки это длина текста плюс два, "
    "потому что по краям стоят пробелы. Через StringBuilder и цикл делать не стал: "
    "склейка тут одна, цикл только добавил бы шума и лишнюю переменную. Вариант с "
    "String.format тоже смотрел, но дефисы всё равно пришлось бы повторять отдельно, "
    "так что repeat читается честнее."
)

TOPIC_ANSWERS = {
    "переменные": (
        "Переменная это имя для ячейки памяти, у которой есть тип, и тип задаётся при "
        "объявлении. Примитив хранит само значение, ссылка хранит адрес объекта, поэтому "
        "присваивание ссылки копирует адрес, а не объект. Локальную переменную обязательно "
        "инициализировать до чтения, поле класса получает значение по умолчанию само. "
        "Чаще всего ошибаются на области видимости: переменная, объявленная внутри блока, "
        "снаружи уже не существует."
    ),
    "типы данных": (
        "Типов два вида: примитивы и ссылочные. У примитивов фиксированный размер и диапазон, "
        "int это четыре байта, long восемь, и при выходе за границу значение молча "
        "переворачивается, исключения не будет. Расширение типа идёт само, сужение только "
        "явным приведением, и на нём теряются старшие биты. Ошибаются обычно на double: "
        "он двоичный, поэтому сравнивать деньги через равенство нельзя."
    ),
    "операторы": (
        "Операторы делятся на арифметические, сравнения, логические и битовые, и у них есть "
        "приоритет: умножение считается раньше сложения, а присваивание позже всего. "
        "Целочисленное деление отбрасывает дробную часть, остаток сохраняет знак делимого. "
        "Логические операторы в двойной записи ленивые: правая часть не вычисляется, если "
        "левая уже решила исход, и на этом держится проверка на null перед вызовом метода. "
        "Ошибаются на приоритете и на одинарном амперсанде, который считает обе стороны."
    ),
    "условия": (
        "Условие это ветвление по boolean, и в Java туда нельзя подсунуть число, как в C. "
        "Ветки проверяются сверху вниз, первая подошедшая выигрывает, поэтому порядок "
        "важен: узкое условие ставится раньше широкого. Тернарный оператор это то же "
        "ветвление выражением, он удобен для короткого выбора значения. Ошибаются на "
        "забытых фигурных скобках и на сравнении строк через равенство вместо equals."
    ),
    "циклы": (
        "Цикл повторяет тело, пока условие истинно. У for три части: подготовка, условие и "
        "шаг, и он удобен, когда счётчик известен заранее. While проверяет условие до тела, "
        "do while хотя бы раз тело выполнит. Главная ошибка это границы: перепутанные "
        "меньше и меньше либо равно дают либо лишний проход, либо потерянный последний "
        "элемент. Вторая частая беда это забытый шаг и вечный цикл, который в песочнице "
        "просто снимут по таймауту."
    ),
    "методы": (
        "Метод это именованный кусок работы с сигнатурой: имя, список параметров и тип "
        "возврата. Аргументы всегда передаются по значению, для ссылки это значит копию "
        "адреса, поэтому поменять поля объекта изнутри можно, а переприсвоить саму ссылку "
        "снаружи не выйдет. Перегрузка выбирается на этапе компиляции по типам аргументов. "
        "Ошибаются на возврате: если ветка кода не возвращает значение, код просто не "
        "соберётся, и это хорошо."
    ),
}

EDGE_ANSWER = (
    "Пустой вход это первый случай, который я проверяю. В рамке пустая строка даёт "
    "рамку из четырёх дефисов и строку из двух пробелов, и это правильное поведение, оно "
    "прямо описано в постановке. Ноль опасен там, где на него делят: целочисленное деление "
    "на ноль бросает ArithmeticException, а для double получится бесконечность или NaN, и "
    "программа поедет дальше с мусором. Значение за границей диапазона молча переворачивается "
    "через минимум, поэтому в счётчиках я беру long или проверяю границу заранее. Null я "
    "ловлю на входе: без проверки length у null падает с NullPointerException, и по стеку "
    "видно только строку вызова, а не причину."
)


def defense_answers(questions: list[dict]) -> list[str]:
    """Ответы на защиту пишутся честно, по смыслу вопроса. Тема вопроса известна
    только в момент прогона, поэтому ответы разложены по темам заранее."""
    out = []
    for q in questions:
        text = q["q"]
        if "Рамка" in text or "рамк" in text.lower():
            out.append(CODE_ANSWER)
            continue
        if "на вход" in text or "границ" in text:
            out.append(EDGE_ANSWER)
            continue
        picked = next((a for topic, a in TOPIC_ANSWERS.items() if topic in text), None)
        out.append(picked or TOPIC_ANSWERS["методы"])
    return out


# ---------------------------------------------------------------- главное

def main() -> int:  # noqa: C901
    live_claude = "--no-claude" not in sys.argv
    for name in [k for k in os.environ if k.startswith("ARENA_")]:
        del os.environ[name]
    real = config_mod.load(env="prod")
    prod_guard = prodguard.snapshot(real)
    if not real.roadmap_dir.is_dir():
        print(f"нет роадмапа: {real.roadmap_dir}")
        return 2
    prod_mtime = real.db_path.stat().st_mtime_ns if real.db_path.exists() else None

    if STAND.exists():
        shutil.rmtree(STAND, ignore_errors=True)
    STAND.mkdir(parents=True)
    server = None
    try:
        vault = STAND / "vault"
        vault.mkdir()
        shutil.copytree(real.roadmap_dir, vault / config_mod.ROADMAP_SUBDIR)
        env = dict(os.environ)
        env.update({
            "ARENA_ENV": "dev",
            "ARENA_STATE_DIR": str(STAND / "state"),
            "ARENA_VAULT": str(vault),
            "ARENA_ROADMAP_DIR": str(vault / config_mod.ROADMAP_SUBDIR),
            "ARENA_WRITE_VAULT": "0",
            "PYTHONPATH": str(PROJECT),
        })
        for key in ("ARENA_ENV", "ARENA_STATE_DIR", "ARENA_VAULT",
                    "ARENA_ROADMAP_DIR", "ARENA_WRITE_VAULT"):
            os.environ[key] = env[key]
        cfg = config_mod.load(env="dev")

        print("\n0. Стенд: копия волта, свежая база, банк первого этапа")
        conn = db_mod.init(cfg)
        sync_roadmap(conn, cfg)
        html_tests.run(conn, cfg, archive=False)
        jcards.run(conn, cfg)
        code_tasks.run(conn, cfg)
        stage1 = conn.execute("SELECT * FROM stages WHERE num = 1").fetchone()
        seeded = seed_quizzes(conn, stage1["id"])
        check("роадмап на месте", conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0] == 1075)
        check("банк первого этапа засеян", seeded == len(TOPICS) * PER_TOPIC, f"вопросов {seeded}")
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        cols = {r[1] for r in conn.execute("PRAGMA table_info(bosses)")}
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        check("схема свежая и с полями боя",
              version == migrations.TARGET_VERSION
              and {"status", "answers", "code_items", "weak", "quiz_correct"} <= cols
              and {"boss_minisets", "reviews"} <= tables,
              f"версия {version} из {migrations.TARGET_VERSION}")
        code_items = conn.execute(
            "SELECT COUNT(*) FROM items i JOIN nodes n ON n.id = i.node_id "
            "WHERE i.type = 'code' AND n.stage_id = ?", (stage1["id"],)
        ).fetchone()[0]
        check("на первом этапе есть код-задача для код-части боя", code_items >= 1,
              f"задач {code_items}")
        conn.close()

        server = start_server(env)
        client = httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=400.0)
        check("сервер поднялся", wait_up(client))

        print("\n1. Гейт: девяносто процентов нод этапа")
        state = client.get("/api/boss/stage/1").json()
        check("порог считается в нодах через progress.boss_at",
              state["stage"]["need"] == progress.boss_at(state["stage"]["total"])
              and state["stage"]["need"] == 27 and state["stage"]["total"] == 29,
              f"босс на {state['stage']['need']} из {state['stage']['total']}")
        check("до порога босс закрыт", not state["stage"]["ready"] and not state["can_start"])
        denied = client.post("/api/boss/stage/1/start")
        check("войти в бой досрочно нельзя", denied.status_code == 409,
              f"код {denied.status_code}")

        conn = db_mod.connect(cfg, create=False)
        rows = conn.execute(
            "SELECT id, code FROM nodes WHERE stage_id = ? AND code != '1.10' ORDER BY seq LIMIT 27",
            (stage1["id"],),
        ).fetchall()
        for row in rows:
            progress.close_node(conn, cfg, row["id"], closed_by="atoms", reason="приёмка")
        closed = conn.execute(
            "SELECT COUNT(*) FROM nodes WHERE stage_id = ? AND status = 'closed'", (stage1["id"],)
        ).fetchone()[0]
        conn.close()
        check("двадцать семь нод закрыто", closed == 27, str(closed))

        state = client.get("/api/boss/stage/1").json()
        check("на пороге босс открылся", state["stage"]["ready"] and state["can_start"])
        stage2 = client.get("/api/boss/stage/2").json()
        check("босс соседнего этапа остался закрыт",
              not stage2["stage"]["ready"] and not stage2["can_start"],
              f"закрыто {stage2['stage']['closed']} из {stage2['stage']['total']}")
        m = client.get("/api/map/stage/1").json()
        check("карта показывает, что босс ждёт", m["boss"]["ready"] and not m["boss"]["passed"])

        print("\n2. Вариант: вес к темам, где были промахи")
        conn = db_mod.connect(cfg, create=False)
        bank = boss_mod.quiz_bank(conn, stage1["id"])
        weak_before = boss_mod.error_map(conn, stage1["id"])
        check("карта ошибок пока пуста", not weak_before, str(weak_before))
        # Промахи ставим руками по двум темам: это и есть вход для взвешивания.
        seeded_ids: set[int] = set()
        for topic in WEAK_TOPICS:
            ids = [r["id"] for r in bank if boss_mod.topic_of(r["payload"]) == topic][:5]
            seeded_ids.update(ids)
            for item_id in ids:
                conn.execute(
                    "INSERT INTO attempts(item_id, node_id, kind, ts, correct, result, xp) "
                    "VALUES (?, NULL, 'quiz', ?, 0, '{}', 0)", (item_id, db_mod.now()),
                )
        conn.commit()
        weak = boss_mod.error_map(conn, stage1["id"])
        check("карта ошибок собрала обе темы", sorted(weak) == sorted(WEAK_TOPICS), str(weak))

        import random as _random

        def share(with_weights: bool) -> float:
            total = 0
            rng = _random.Random(7)
            for _ in range(30):
                picked = boss_mod.pick_quizzes(bank, boss_mod.QUIZ_COUNT,
                                               weak if with_weights else {}, rng)
                by_id = {r["id"]: boss_mod.topic_of(r["payload"]) for r in bank}
                total += sum(1 for i in picked if by_id[i] in WEAK_TOPICS)
            return total / 30

        hot, plain = share(True), share(False)
        check("вопросы по больным темам перевешивают ровный отбор",
              hot >= 9 and plain <= 8 and hot > plain + 2,
              f"с весами {hot:.1f} из 20, без весов {plain:.1f}")
        check("одна тема не забирает больше четверти варианта",
              hot <= boss_mod.QUIZ_COUNT / 2 + 0.01,
              f"две темы дают {hot:.1f} при потолке {boss_mod.QUIZ_COUNT // 4} на тему")
        conn.close()

        print("\n3. Первый бой: провал не бывает нулевым")
        before = client.get("/api/stats").json()["xp_total"]
        conn = db_mod.connect(cfg, create=False)
        day_before = conn.execute(
            "SELECT quiz_count FROM days WHERE date = ?", (db_mod.today(),)
        ).fetchone()
        quiz_count_before = day_before["quiz_count"] if day_before else 0
        conn.close()

        started = client.post("/api/boss/stage/1/start").json()
        run = started["running"]
        boss_id = run["id"]
        check("бой начался и таймер пошёл",
              run["status"] == "quiz" and run["quiz_total"] == 20
              and 0 < run["left_sec"] <= boss_mod.QUIZ_LIMIT_SEC,
              f"вопросов {run['quiz_total']}, осталось {run['left_sec']} с")
        check("вопрос уходит на клиент без правильного ответа",
              "ans" not in run["question"] and "exp" not in run["question"],
              ", ".join(sorted(run["question"])))

        conn = db_mod.connect(cfg, create=False)
        variant1 = [int(x) for x in json.loads(
            conn.execute("SELECT questions FROM bosses WHERE id = ?", (boss_id,)).fetchone()[0])]
        conn.close()
        payloads = answers_of(cfg.db_path, variant1)
        # Мажем ровно по больным темам: так карта дыр будет предсказуемой.
        wrong_ids = [i for i in variant1 if payloads[i]["topic"] in WEAK_TOPICS]
        state = started
        for i in range(len(variant1)):
            q = state["running"]["question"]
            data = payloads[q["item_id"]]
            right = int(data["ans"])
            choice = right if q["item_id"] not in wrong_ids else (right + 1) % 4
            res = client.post(f"/api/boss/attempt/{boss_id}/answer",
                              json={"item_id": q["item_id"], "choice": choice}).json()
            state = res["state"]
            if state["running"] is None:
                break
        check("после двадцатого ответа квиз-часть закрылась сама",
              state["running"] is not None and state["running"]["status"] == "code",
              str(state["running"] and state["running"]["status"]))

        repeat = client.post(f"/api/boss/attempt/{boss_id}/answer",
                             json={"item_id": variant1[0], "choice": 0})
        check("переигровок на бою нет", repeat.status_code == 409, f"код {repeat.status_code}")

        state = client.post(f"/api/boss/attempt/{boss_id}/finish").json()
        last = state["last"]
        check("ранг C, этап не сдан", last["rank"] == "C" and not last["passed"],
              f"{last['rank']}, вопросы {last['quiz_correct']} из {last['quiz_total']}")
        check("провал платит сто XP разведки боем", last["xp"] == 100, str(last["xp"]))
        after = client.get("/api/stats").json()["xp_total"]
        check("в леджере ровно сто за бой", after - before == 100, f"прирост {after - before}")

        conn = db_mod.connect(cfg, create=False)
        day_after = conn.execute(
            "SELECT quiz_count FROM days WHERE date = ?", (db_mod.today(),)
        ).fetchone()
        quiz_after = day_after["quiz_count"] if day_after else 0
        reasons = {r[0] for r in conn.execute(
            "SELECT DISTINCT reason FROM xp_ledger WHERE date(ts) = ?", (db_mod.today(),))}
        boss_attempts = conn.execute(
            "SELECT COUNT(*) FROM attempts WHERE kind = 'boss'").fetchone()[0]
        conn.close()
        check("экзамен не закрывает дневной контракт вопросами",
              quiz_after == quiz_count_before, f"было {quiz_count_before}, стало {quiz_after}")
        check("за ответы на бою обычный XP не платят",
              xp.QUIZ_FIRST not in reasons and xp.QUIZ_REPEAT not in reasons,
              ", ".join(sorted(reasons)))
        check("ответы боя всё равно записаны в журнал попыток", boss_attempts == 20,
              str(boss_attempts))

        print("\n4. Карта дыр и мини-сет к реваншу")
        topics = [t["topic"] for t in last["weak"]["topics"]]
        check("карта дыр показывает ровно проваленные темы",
              sorted(topics) == sorted(WEAK_TOPICS), str(topics))
        mini = client.get(f"/api/boss/attempt/{boss_id}/miniset").json()
        check("мини-сет собран по этим же темам",
              sorted(mini["topics"]) == sorted(WEAK_TOPICS), str(mini["topics"]))
        check("в мини-сете есть вопросы и карточки",
              mini["quiz_total"] >= len(wrong_ids) and mini["cards"] > 0,
              f"вопросов {mini['quiz_total']}, карточек {mini['cards']}")
        missed = set(wrong_ids)
        in_set = {q["item_id"] for q in mini["quiz"]}
        check("промахи боя попали в мини-сет целиком", missed <= in_set,
              f"не хватает {len(missed - in_set)}")

        # День до реванша не мёртвый: разбор мини-сета платит по обычным ставкам.
        # Вопросы, на которые уже отвечали сегодня, платят ноль (анти-фарм фазы 2а),
        # поэтому берём те, что сегодня не трогали: приёмка сама наставила промахов.
        xp_before_mini = client.get("/api/stats").json()["xp_total"]
        played = 0
        for q in [x for x in mini["quiz"] if x["item_id"] not in seeded_ids][:5]:
            data = payloads.get(q["item_id"]) or answers_of(cfg.db_path, [q["item_id"]])[q["item_id"]]
            client.post("/api/quiz/answer", json={"item_id": q["item_id"], "choice": data["ans"]})
            played += 1
        xp_after_mini = client.get("/api/stats").json()["xp_total"]
        check("разбор мини-сета платит по обычным ставкам",
              played > 0 and xp_after_mini - xp_before_mini >= played * xp.AMOUNTS[xp.QUIZ_FIRST],
              f"прирост {xp_after_mini - xp_before_mini} за {played}")
        mini2 = client.get(f"/api/boss/attempt/{boss_id}/miniset").json()
        check("мини-сет считает разобранное", mini2["quiz_done"] >= played,
              f"{mini2['quiz_done']} из {mini2['quiz_total']}")

        print("\n5. Замок реванша на сутки и dev-часы")
        state = client.get("/api/boss/stage/1").json()
        check("реванш заперт", state["cooldown"]["locked"] and not state["can_start"],
              state["cooldown_text"])
        check("до реванша около суток",
              23 * 3600 <= state["cooldown"]["left_sec"] <= 24 * 3600,
              f"{state['cooldown']['left_sec']} с")
        denied = client.post("/api/boss/stage/1/start")
        check("начать реванш раньше срока нельзя", denied.status_code == 409,
              f"код {denied.status_code}")

        conn = db_mod.connect(cfg, create=False)
        prod_cfg = dataclasses.replace(cfg, env="prod")
        os.environ[devclock.ENV_SHIFT] = "90000"
        os.environ[devclock.ENV_SCALE] = "600"
        check("в боевом профиле сдвиг часов игнорируется",
              devclock.shift_seconds(conn, prod_cfg) == 0
              and devclock.scale(conn, prod_cfg) == 1.0)
        check("в песочнице переменная окружения работает",
              devclock.shift_seconds(conn, cfg) == 90000)
        del os.environ[devclock.ENV_SHIFT]
        del os.environ[devclock.ENV_SCALE]
        prod_refused = False
        try:
            devclock.set_shift(conn, prod_cfg, 3600)
        except PermissionError:
            prod_refused = True
        check("перевести часы в боевом профиле нельзя", prod_refused)
        os.environ[boss_mod.DEV_ANY] = "1"
        check("обход гейта в боевом профиле не работает", not boss_mod.dev_gate_off(prod_cfg))
        check("обход гейта в песочнице работает", boss_mod.dev_gate_off(cfg))
        del os.environ[boss_mod.DEV_ANY]
        conn.close()

        moved = client.post("/api/dev/clock", json={"shift_hours": 25, "relative": True}).json()
        check("dev-ручка перевела часы вперёд", moved["shift_sec"] == 25 * 3600,
              f"сдвиг {moved['shift_sec']} с")
        state = client.get("/api/boss/stage/1").json()
        check("реванш открылся", not state["cooldown"]["locked"] and state["can_start"])

        print("\n6. Реванш: новый вариант и код-часть через runner")
        started = client.post("/api/boss/stage/1/start").json()
        boss2 = started["running"]["id"]
        conn = db_mod.connect(cfg, create=False)
        variant2 = [int(x) for x in json.loads(
            conn.execute("SELECT questions FROM bosses WHERE id = ?", (boss2,)).fetchone()[0])]
        conn.close()
        check("вопросы прошлой попытки не повторяются",
              not (set(variant1) & set(variant2)),
              f"пересечение {len(set(variant1) & set(variant2))}")
        check("вариант снова полный", len(variant2) == 20, str(len(variant2)))

        payloads2 = answers_of(cfg.db_path, variant2)
        state = started
        for _ in range(len(variant2)):
            q = state["running"]["question"]
            data = payloads2[q["item_id"]]
            res = client.post(f"/api/boss/attempt/{boss2}/answer",
                              json={"item_id": q["item_id"], "choice": int(data["ans"])}).json()
            state = res["state"]
            if state["running"] is None or state["running"]["status"] != "quiz":
                break
        check("все двадцать взяты", state["running"]["quiz_correct"] == 20,
              str(state["running"]["quiz_correct"]))
        check("ход перешёл к код-части", state["running"]["status"] == "code")

        issued = run_cli(["task", "--boss", "--port", str(PORT)], env)
        check("arena task --boss выдал код-часть", issued.returncode == 0
              and "код-часть боя" in issued.stdout, issued.stdout[-200:].strip())
        conn = db_mod.connect(cfg, create=False)
        entry = json.loads(conn.execute(
            "SELECT code_items FROM bosses WHERE id = ?", (boss2,)).fetchone()[0])[0]
        item = conn.execute("SELECT * FROM items WHERE id = ?", (entry["item_id"],)).fetchone()
        payload = json.loads(item["payload"])
        conn.close()
        task_root = boss_mod.code_dir(cfg, 1, 2, entry["node_code"])
        check("папка код-части лежит отдельно от портфеля задач",
              task_root.is_dir() and "boss" in str(task_root) and (task_root / ".arena.json").is_file(),
              str(task_root))
        marker = json.loads((task_root / ".arena.json").read_text(encoding="utf-8"))
        check("в маркере записан номер боя", marker.get("boss_id") == boss2, str(marker.get("boss_id")))

        for name, source in payload["reference_solution"].items():
            (task_root / name).write_text(source, encoding="utf-8")
        checked = run_cli(["check", "--port", str(PORT)], env, cwd=task_root)
        check("arena check прогнал эталон код-части",
              checked.returncode == 0 and "код-часть боя" in checked.stdout,
              checked.stdout[-300:].strip())

        state = client.get("/api/boss/stage/1").json()
        last = state["last"]
        check("бой закрылся сам, когда код позеленел",
              last is not None and state["running"] is None and last["id"] == boss2)
        check("ранг S за чистый и быстрый бой", last["rank"] == "S", str(last["rank"]))
        check("ранг S платит восемьсот", last["xp"] == 800, str(last["xp"]))
        check("этап взят", last["passed"] and state["passed"])

        conn = db_mod.connect(cfg, create=False)
        code_row = conn.execute(
            "SELECT * FROM code_tasks WHERE item_id = ?", (entry["item_id"],)).fetchone()
        node_row = conn.execute(
            "SELECT status FROM nodes WHERE code = ?", (entry["node_code"],)).fetchone()
        code_xp = conn.execute(
            "SELECT COUNT(*) FROM xp_ledger WHERE reason = ?", (xp.CODE,)).fetchone()[0]
        events = list(conn.execute(
            "SELECT kind, text FROM bot_events WHERE kind LIKE 'boss%' ORDER BY id"))
        conn.close()
        check("Опус отметил в ленте оба боя",
              {e["kind"] for e in events} == {"boss_win", "boss_loss"},
              ", ".join(e["kind"] for e in events))
        gloat = [e["text"] for e in events if taunts_mod.rejects(e["text"])]
        check("после проигранного боя злорадства нет", not gloat,
              "; ".join(gloat[:1]) or " | ".join(e["text"] for e in events))
        check("код-часть боя не двигает статус учебной задачи",
              code_row is None or code_row["passed_at"] is None,
              "строка есть" if code_row else "строки нет")
        check("нода не закрылась за счёт боя", node_row["status"] != "closed", node_row["status"])
        check("обычный XP за код на бою не платят", code_xp == 0, str(code_xp))
        again = client.post("/api/boss/stage/1/start")
        check("взятый босс не переигрывается", again.status_code == 409, f"код {again.status_code}")

        print("\n7. Защита: живая оценка claude")
        d = last["defense"]
        check("защита заведена сразу после боя",
              d is not None and 2 <= len(d["questions"]) <= 3 and not d["graded"],
              f"вопросов {d and len(d['questions'])}")
        short = client.post(f"/api/defense/{d['id']}/submit", json={"answers": ["ага", "ок", "да"][:len(d["questions"])]})
        check("отписка в защите не принимается", short.status_code == 400, f"код {short.status_code}")

        if live_claude:
            answers = defense_answers(d["questions"])
            xp_before = client.get("/api/stats").json()["xp_total"]
            graded = client.post(f"/api/defense/{d['id']}/submit",
                                 json={"answers": answers}, timeout=400.0).json()
            check("claude оценил защиту и вернул строгий JSON",
                  graded.get("graded") and "grade" in graded,
                  graded.get("error") or graded.get("message") or "")
            if graded.get("graded"):
                g = graded["grade"]
                check("в оценке есть все три признака рубрики",
                      all({"score", "reason", "alternatives", "edges", "comment"} <= set(row)
                          for row in g["grades"]),
                      f"вопросов оценено {len(g['grades'])}")
                check("баллы в рамках рубрики",
                      all(0 <= row["score"] <= 2 for row in g["grades"]),
                      str([row["score"] for row in g["grades"]]))
                check("XP защиты в диапазоне ноль сто",
                      0 <= graded["xp"] <= 100, str(graded["xp"]))
                xp_after = client.get("/api/stats").json()["xp_total"]
                check("XP защиты доехал до леджера",
                      xp_after - xp_before == graded["xp"], f"прирост {xp_after - xp_before}")
                bad = [row["comment"] for row in g["grades"]
                       if defense_mod.DASHES.search(row["comment"])
                       or defense_mod.ARROWS.search(row["comment"])]
                check("в комментариях нет длинных тире и стрелок", not bad, "; ".join(bad[:1]))
                check("комментарий по каждому вопросу непустой",
                      all(row["comment"].strip() for row in g["grades"]))
                print("\n--- живая оценка защиты ---")
                for i, row in enumerate(g["grades"]):
                    print(f"\nвопрос {i + 1}: {row['q']}")
                    print(f"ответ: {answers[i][:220]}...")
                    print(f"балл {row['score']} из 2, причина {row['reason']}, "
                          f"альтернативы {row['alternatives']}, границы {row['edges']}")
                    print(f"комментарий: {row['comment']}")
                print(f"\nитог: {g['summary']}")
                print(f"начислено XP: {graded['xp']}")
                print("--- конец оценки ---\n")
            twice = client.post(f"/api/defense/{d['id']}/submit",
                                json={"answers": answers})
            check("дважды защита не сдаётся", twice.status_code == 409, f"код {twice.status_code}")
        else:
            print("        живая оценка пропущена по флагу --no-claude")

        print("\n8. Разбор с ИИ после сдачи")
        thin = client.post(f"/api/boss/attempt/{boss2}/review", json={"summary": "разобрал"})
        check("пустой разбор не засчитывается", thin.status_code == 400, f"код {thin.status_code}")
        xp_before = client.get("/api/stats").json()["xp_total"]
        note = ("Разобрал с ИИ два места: почему деление целых отбрасывает дробь и как "
                "ленивые логические операторы спасают от NullPointerException.")
        paid = client.post(f"/api/boss/attempt/{boss2}/review", json={"summary": note}).json()
        check("разбор платит тридцать", paid["xp"] == 30, str(paid["xp"]))
        xp_after = client.get("/api/stats").json()["xp_total"]
        check("разбор доехал до леджера", xp_after - xp_before == 30, str(xp_after - xp_before))
        twice = client.post(f"/api/boss/attempt/{boss2}/review", json={"summary": note})
        check("разбор платят один раз на бой", twice.status_code == 409, f"код {twice.status_code}")

        print("\n9. Таймер экзамена: время вышло, бой закрылся сам")
        stop_server(server)
        env2 = dict(env)
        env2[boss_mod.DEV_ANY] = "1"
        server = start_server(env2)
        check("сервер поднялся с обходом гейта", wait_up(client))
        state = client.get("/api/boss/stage/2").json()
        check("гейт обойдён только dev-флагом",
              state["can_start"] and not state["stage"]["ready"],
              f"закрыто {state['stage']['closed']} из {state['stage']['need']}")
        started = client.post("/api/boss/stage/2/start").json()
        boss3 = started["running"]["id"]
        q = started["running"]["question"]
        data = answers_of(cfg.db_path, [q["item_id"]])[q["item_id"]]
        client.post(f"/api/boss/attempt/{boss3}/answer",
                    json={"item_id": q["item_id"], "choice": int(data["ans"])})
        client.post("/api/dev/clock", json={"scale": 4000, "shift_sec": 0, "relative": True})
        # Первый заход закрывает квиз-часть по таймеру, второй добивает код-часть:
        # её отсчёт начинается только в момент закрытия вопросов.
        client.get("/api/boss/stage/2")
        time.sleep(1.5)
        state = client.get("/api/boss/stage/2").json()
        check("просроченный бой закрылся сам, без единого клика",
              state["running"] is None and state["last"] is not None
              and state["last"]["id"] == boss3, str(state["running"]))
        check("неотвеченные вопросы считаются промахом",
              state["last"]["quiz_correct"] == 1 and state["last"]["rank"] == "C",
              f"верных {state['last']['quiz_correct']}, ранг {state['last']['rank']}")
        late = client.post(f"/api/boss/attempt/{boss3}/answer",
                           json={"item_id": q["item_id"], "choice": 0})
        check("после срока ответ не принимается", late.status_code == 409, f"код {late.status_code}")
        client.post("/api/dev/clock", json={"scale": 1, "shift_sec": 0, "relative": True})

        print("\n10. Фронт, тексты и утечки")
        page = client.get("/boss")
        check("страница боя отдаётся", page.status_code == 200 and "arenaBoss" in page.text)
        assets = [client.get("/static/boss.js"), client.get("/static/boss.css")]
        check("статика экрана боя отдаётся", all(a.status_code == 200 for a in assets))
        check("внешних ссылок на странице боя нет",
              "http://" not in page.text and "https://" not in page.text)
        index = client.get("/").text
        check("вкладка босса есть в общем каркасе", 'data-tab="boss"' in index)
        banned = ("отстава", "процент")
        hits = []
        for name in ("boss.js", "boss.css", "boss.html"):
            text = (PROJECT / "static" / name).read_text(encoding="utf-8").lower()
            hits += [f"{name}: {w}" for w in banned if w in text]
            hits += [f"{name}: длинное тире" for ch in ("—", "–", "→", "⇒") if ch in text]
        check("во фронте боя нет запрещённых слов и знаков", not hits, "; ".join(hits[:3]))
        blob = json.dumps(client.get("/api/boss/stage/1").json(), ensure_ascii=False)
        check("состояние боя не отдаёт правильных ответов",
              '"ans"' not in blob and '"exp"' not in blob)

        print("\n11. Боевая база и боевой волт не тронуты")
        if prod_mtime is not None:
            prodguard.verify(prod_guard, check)
            print("        боевой базы нет, проверка пропущена")
        portfolio = Path.home() / "projects" / "java-path" / "boss"
        check("боевой портфель код-частью боя не засорён", not portfolio.exists(),
              str(portfolio))
    finally:
        stop_server(server)
        shutil.rmtree(STAND, ignore_errors=True)

    print(f"\nитого: пройдено {PASSED}, провалено {len(FAILED)}")
    for name in FAILED:
        print(f"  провал: {name}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
