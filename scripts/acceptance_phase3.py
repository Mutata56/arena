#!/usr/bin/env python3
"""Приёмка фазы 3: runner, код-задачи, изоляция прогонов.

    .venv/bin/python scripts/acceptance_phase3.py

Всё гоняется в песочнице: свой стейт, свой портфель решений, сервер на порту 8802.
Стейт кладём в ~/.cache, а не в /tmp, специально: PrivateTmp=yes подменяет юниту
каталог /tmp, и рабочая папка прогона внутри него перестала бы существовать.
Отдельной проверкой убеждаемся, что для стейта в /tmp папки прогонов сами уезжают
в ~/.cache и песочница продолжает работать.

Приёмка занимает пару минут: один из тестов честно ждёт минуту, пока вечный цикл
не будет убит по таймауту.
"""

from __future__ import annotations

import json
import os
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
from arena import db as db_mod  # noqa: E402
from arena import migrations  # noqa: E402
from arena import progress, sandbox, tasks  # noqa: E402
from arena.importers import code_tasks, html_tests, jcards  # noqa: E402
from arena.roadmap import sync as sync_roadmap  # noqa: E402

PORT = 8802
FAILED: list[str] = []
PASSED = 0
HOSTILE_PROBE = Path.home() / "arena-hostile-probe.txt"
SECRET = "СЕКРЕТ_СКРЫТОГО_ТЕСТА_2026"


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASSED
    if ok:
        PASSED += 1
        print(f"  ок    {name}" + (f" ({detail})" if detail else ""))
    else:
        FAILED.append(name)
        print(f"  ПРОВАЛ {name}" + (f" ({detail})" if detail else ""))


def wait_up(client: httpx.Client, tries: int = 80) -> bool:
    for _ in range(tries):
        try:
            client.get("/api/whoami", timeout=1.0)
            return True
        except Exception:  # noqa: BLE001
            time.sleep(0.25)
    return False


def arena(env: dict, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "arena", *args],
        cwd=PROJECT, env=env, capture_output=True, text=True, timeout=600,
    )


def seed_item(conn: sqlite3.Connection, node_code: str, payload: dict, difficulty: int = 0,
              key: str = "") -> int:
    node = conn.execute("SELECT id, stage_id FROM nodes WHERE code = ?", (node_code,)).fetchone()
    cur = conn.execute(
        "INSERT INTO items(node_id, stage_id, type, payload, difficulty, source, source_key, created) "
        "VALUES (?, ?, 'code', ?, ?, 'manual', ?, datetime('now'))",
        (node["id"], node["stage_id"], json.dumps(payload, ensure_ascii=False), difficulty,
         key or f"test:{node_code}:{payload['title']}"),
    )
    conn.commit()
    return cur.lastrowid


def write_solution(task_root: Path, name: str, source: str) -> None:
    (task_root / name).write_text(source, encoding="utf-8")


# ------------------------------------------------------------------ фикстуры задач

LOOP_TASK = {
    "title": "Задача с вечным циклом",
    "statement_md": "Фикстура приёмки: решение зависает, прогон обязан убить его по таймауту.",
    "starter_files": {"Loop.java": "public class Loop { public static int go() { return 0; } }"},
    "visible_tests": (
        "import org.junit.jupiter.api.Test;\n"
        "import static org.junit.jupiter.api.Assertions.assertEquals;\n"
        "class LoopTest {\n"
        "    @Test void runs() { assertEquals(1, Loop.go()); }\n"
        "}\n"
    ),
    "hidden_tests": (
        "import org.junit.jupiter.api.Test;\n"
        "import static org.junit.jupiter.api.Assertions.assertEquals;\n"
        "class LoopHiddenTest {\n"
        "    @Test void runsAgain() { assertEquals(1, Loop.go()); }\n"
        "}\n"
    ),
    "reference_solution": {"Loop.java": "public class Loop { public static int go() { return 1; } }"},
    "checkstyle_hints": [],
}

HOSTILE_TASK = {
    "title": "Враждебная задача для проверки песочницы",
    "statement_md": "Фикстура приёмки: скрытые тесты лезут за пределы рабочей папки и в сеть.",
    "starter_files": {"Hostile.java": "public class Hostile { public static int answer() { return 0; } }"},
    "visible_tests": (
        "import org.junit.jupiter.api.Test;\n"
        "import static org.junit.jupiter.api.Assertions.assertEquals;\n"
        "class HostileTest {\n"
        "    @Test void answers() { assertEquals(42, Hostile.answer()); }\n"
        "}\n"
    ),
    # Каждый кейс зелёный ТОЛЬКО если песочница дырявая.
    "hidden_tests": (
        "import java.io.File;\n"
        "import java.net.InetAddress;\n"
        "import java.net.InetSocketAddress;\n"
        "import java.net.Socket;\n"
        "import java.nio.file.Files;\n"
        "import java.nio.file.Path;\n"
        "import org.junit.jupiter.api.Test;\n"
        "import static org.junit.jupiter.api.Assertions.assertTrue;\n"
        "class HostileHiddenTest {\n"
        "    @Test void writesIntoHome() throws Exception {\n"
        "        Path p = Path.of(System.getProperty(\"user.home\"), \"arena-hostile-probe.txt\");\n"
        "        Files.writeString(p, \"pwned\");\n"
        "        assertTrue(Files.exists(p));\n"
        "    }\n"
        "    @Test void opensSocket() throws Exception {\n"
        "        try (Socket s = new Socket()) {\n"
        "            s.connect(new InetSocketAddress(\"192.0.2.2\", 80), 4000);\n"
        "            assertTrue(s.isConnected());\n"
        "        }\n"
        "    }\n"
        "    @Test void resolvesDns() throws Exception {\n"
        "        assertTrue(InetAddress.getByName(\"service4.example.invalid\").getHostAddress().length() > 0);\n"
        "    }\n"
        "}\n"
    ),
    "reference_solution": {"Hostile.java": "public class Hostile { public static int answer() { return 42; } }"},
    "checkstyle_hints": [],
}

SECRET_TASK = {
    "title": "Задача со скрытым ожиданием",
    "statement_md": "Фикстура приёмки: в скрытом тесте лежит метка, её нельзя показывать ученику.",
    "starter_files": {"Secret.java": "public class Secret { public static String value() { return \"\"; } }"},
    "visible_tests": (
        "import org.junit.jupiter.api.Test;\n"
        "import static org.junit.jupiter.api.Assertions.assertEquals;\n"
        "class SecretTest {\n"
        "    @Test void visibleCase() { assertEquals(\"видимое\", Secret.value()); }\n"
        "}\n"
    ),
    "hidden_tests": (
        "import org.junit.jupiter.api.DisplayName;\n"
        "import org.junit.jupiter.api.Test;\n"
        "import static org.junit.jupiter.api.Assertions.assertEquals;\n"
        "class SecretHiddenTest {\n"
        "    @Test @DisplayName(\"скрытый случай\")\n"
        f"    void hiddenCase() {{ assertEquals(\"{SECRET}\", Secret.value()); }}\n"
        "}\n"
    ),
    "reference_solution": {"Secret.java": "public class Secret { public static String value() { return \"видимое\"; } }"},
    "checkstyle_hints": [],
}


def main() -> int:  # noqa: C901
    for name in [k for k in os.environ if k.startswith("ARENA_")]:
        del os.environ[name]
    real = config_mod.load(env="prod")
    prod_guard = prodguard.snapshot(real)
    prod_mtime = real.db_path.stat().st_mtime_ns if real.db_path.exists() else None
    portfolio = Path.home() / "projects" / "java-path"
    portfolio_before = sorted(p.name for p in portfolio.rglob("*")) if portfolio.exists() else None
    vausupporttime = real.roadmap_dir.stat().st_mtime_ns if real.roadmap_dir.exists() else None
    hub2 = real.roadmap_dir / "Этап 02 Базовый синтаксис" / "_Этап 02 Базовый синтаксис.md"
    hub2_mtime = hub2.stat().st_mtime_ns if hub2.exists() else None
    if HOSTILE_PROBE.exists():
        HOSTILE_PROBE.unlink()

    cache = Path.home() / ".cache"
    cache.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="arena-3-", dir=cache))
    server = None
    try:
        env = dict(os.environ)
        env.update({
            "ARENA_ENV": "dev",
            "ARENA_STATE_DIR": str(tmp / "state"),
            "PYTHONPATH": str(PROJECT),
        })
        os.environ["ARENA_ENV"] = "dev"
        os.environ["ARENA_STATE_DIR"] = str(tmp / "state")
        cfg = config_mod.load(env="dev")

        print("\n0. Инструменты на месте")
        check("джарник JUnit скачан", sandbox.junit_ready(),
              f"{sandbox.JUNIT_JAR.stat().st_size // 1024} КБ" if sandbox.JUNIT_JAR.exists() else "нет файла")
        method = sandbox.probe()
        check("песочница поднимается", method in (sandbox.SYSTEMD, sandbox.BWRAP), method)
        check("папка прогонов лежит вне /tmp", not str(cfg.runs_root).startswith("/tmp"),
              str(cfg.runs_root))
        relocated = config_mod.runs_root(Path("/tmp/arena-fake-state"), "dev")
        check("стейт в /tmp уводит прогоны в ~/.cache", not str(relocated).startswith("/tmp"),
              str(relocated))

        print("\n1. Песочница держит границы (обе программы)")
        for name in (sandbox.SYSTEMD, sandbox.BWRAP):
            probe_dir = tmp / f"probe-{name}"
            probe_dir.mkdir(parents=True, exist_ok=True)
            res = sandbox.run(
                ["/bin/sh", "-c",
                 f"echo ok > inside.txt; echo x > {HOSTILE_PROBE}; echo rc=$?"],
                probe_dir, timeout=30, method=name,
            )
            check(f"{name}: в рабочую папку писать можно", (probe_dir / "inside.txt").is_file())
            check(f"{name}: в домашнюю папку писать нельзя", not HOSTILE_PROBE.exists(),
                  res.stdout.strip()[:60])
            if HOSTILE_PROBE.exists():
                HOSTILE_PROBE.unlink()

        print("\n2. Готовим песочницу с роадмапом и демо-задачами")
        conn = db_mod.init(cfg)
        sync_roadmap(conn, cfg)
        html_tests.run(conn, cfg, archive=False)
        jcards.run(conn, cfg)
        report = code_tasks.run(conn, cfg)
        check("демо-задачи импортированы", report.added == 3, report.render().splitlines()[0])
        again = code_tasks.run(conn, cfg)
        check("повторный импорт идемпотентен", again.added == 0 and again.updated == 0,
              f"добавлено {again.added}, обновлено {again.updated}")
        banked = conn.execute("SELECT COUNT(*) FROM items WHERE type = 'code'").fetchone()[0]
        check("в банке ровно три код-задачи", banked == 3, str(banked))
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        # Номер не зашиваем: соседние фазы двигают TARGET_VERSION вверх.
        check("схема свежая и с таблицей код-задач",
              version == migrations.TARGET_VERSION and version >= 5,
              f"версия {version} из {migrations.TARGET_VERSION}")
        conn.close()

        server = subprocess.Popen(
            [sys.executable, "-m", "arena", "serve", "--port", str(PORT)],
            cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        client = httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=30.0)
        check("сервер поднялся", wait_up(client))
        who = client.get("/api/whoami").json()
        check("сервер отвечает про свою базу", who["db"] == str(cfg.db_path), who["db"])

        print("\n3. Задача выдана в портфель")
        out = arena(env, "task", "1.10", "--port", str(PORT))
        check("arena task отработал", out.returncode == 0, out.stderr.strip()[:200])
        task_root = cfg.tasks_root / "tasks" / "этап-01" / "1.10"
        check("папка задачи создана", task_root.is_dir(), str(task_root))
        check("стартовый файл на месте", (task_root / "Frame.java").is_file())
        check("видимые тесты на месте", (task_root / "tests" / "FrameTest.java").is_file())
        check("постановка на месте", (task_root / "README.md").is_file())
        check("портфель получил README", (cfg.tasks_root / "README.md").is_file())
        check("портфель это git-репозиторий", (cfg.tasks_root / ".git").exists())
        laid = list(task_root.rglob("*"))
        check("скрытые тесты в портфель не попали",
              not any("Hidden" in p.name for p in laid), ", ".join(p.name for p in laid))
        web = client.get("/api/tasks").json()["tasks"]
        issued = [t for t in web if t["node_code"] == "1.10"][0]
        check("в вебе статус «в работе»", issued["status"] == "issued", issued["status_title"])

        print("\n4. Ломаное решение даёт внятный красный")
        write_solution(task_root, "Frame.java", (
            "public class Frame {\n"
            "    public static String box(String text) {\n"
            "        if (text.isEmpty()) { return \"+-+\\n| |\\n+-+\"; }\n"
            "        String edge = \"+\" + \"-\".repeat(text.length() + 2) + \"+\";\n"
            "        return edge + \"\\n| \" + text + \" |\\n\" + edge;\n"
            "    }\n"
            "}\n"
        ))
        out = arena(env, "check", str(task_root), "--port", str(PORT))
        body = out.stdout + out.stderr
        check("ломаное решение не сдано", out.returncode == 1, f"код возврата {out.returncode}")
        check("названы имена упавших скрытых кейсов",
              "КРАСНЫЙ" in body and "пустой текст тоже попадает в рамку" in body)
        check("зелёные скрытые кейсы тоже названы", "зелёный" in body)
        check("ожидаемое значение скрытого кейса не показан",
              "+--+" not in body and "expected" not in body.split("скрытые тесты")[-1])
        state = client.get("/api/today").json()
        check("XP за красную сдачу не начислен", state["xp"]["total"] == 0, str(state["xp"]["total"]))

        print("\n5. Скрытое ожидание не утекает в вывод")
        conn = db_mod.connect(cfg, create=False)
        secret_id = seed_item(conn, "1.17", SECRET_TASK)
        conn.close()
        out = arena(env, "task", "1.17", "--port", str(PORT))
        secret_root = cfg.tasks_root / "tasks" / "этап-01" / "1.17"
        write_solution(secret_root, "Secret.java",
                       "public class Secret { public static String value() { return \"видимое\"; } }")
        out = arena(env, "check", str(secret_root), "--port", str(PORT))
        body = out.stdout + out.stderr
        check("метка из скрытого теста не попала в вывод", SECRET not in body)
        check("скрытый кейс назван по имени", "скрытый случай" in body)
        check("прогон закончился красным", out.returncode == 1, str(out.returncode))

        print("\n6. Эталон зелёный, XP капнул, нода закрылась")
        shutil.copy(PROJECT / "content" / "code" / "1.10-ramka" / "solution" / "Frame.java",
                    task_root / "Frame.java")
        started = time.monotonic()
        out = arena(env, "check", str(task_root), "--port", str(PORT))
        body = out.stdout + out.stderr
        check("эталон сдан", out.returncode == 0, body.strip().splitlines()[-1][:120])
        check("начислено 60 XP за задачу", "+60 XP" in body)
        check("нода закрыта в выводе runner'а", "нода 1.10 закрыта" in body)
        check("прогон уложился в разумное время", time.monotonic() - started < 40,
              f"{round(time.monotonic() - started, 1)} с")

        conn = db_mod.connect(cfg, create=False)
        node = conn.execute("SELECT * FROM nodes WHERE code = '1.10'").fetchone()
        check("статус ноды в базе closed", node["status"] == "closed", node["status"])
        ledger = {r["reason"]: r["amount"] for r in conn.execute(
            "SELECT reason, SUM(amount) AS amount FROM xp_ledger GROUP BY reason")}
        check("в леджере есть выплата за код", ledger.get("code") == 60, str(ledger.get("code")))
        check("в леджере есть выплата за ноду", ledger.get("node_closed") == 100,
              str(ledger.get("node_closed")))
        check("контракт дня закрылся микрозадачкой", ledger.get("contract") == 50,
              str(ledger.get("contract")))
        day = conn.execute("SELECT * FROM days WHERE date = ?", (db_mod.today(),)).fetchone()
        check("счётчик кода за день вырос", day["code_count"] == 1, str(day["code_count"]))
        opened = conn.execute("SELECT status FROM nodes WHERE code = '1.11'").fetchone()["status"]
        check("следующая нода этапа не заперта", opened == "available", opened)
        conn.close()

        web = client.get("/api/tasks").json()["tasks"]
        done = [t for t in web if t["node_code"] == "1.10"][0]
        check("в вебе статус «сдана»", done["status"] == "passed", done["status_title"])
        check("в вебе видны имена скрытых кейсов", len(done["hidden"]) == 5, str(len(done["hidden"])))
        check("в вебе нет текста ожиданий скрытых тестов",
              "expected" not in json.dumps(done, ensure_ascii=False))
        today_state = client.get("/api/today").json()
        contract = today_state["contract"]
        check("контракт дня закрыт", contract["closed"])
        check("в контракте появилась код-опция", "code" in contract)
        check("карточная половина осталась нетронутой",
              contract["cards_target"] == 10 and contract["cards_done"] == 0,
              f"{contract['cards_done']} из {contract['cards_target']}")
        check("контракт закрыт именно микрозадачкой", contract["code_done"] == 1,
              str(contract["code_done"]))
        check("счётчиков долга по карточкам в ответе нет",
              "due_total" not in json.dumps(today_state) and "overdue" not in json.dumps(today_state))

        print("\n7. Повторная сдача не платит второй раз")
        out = arena(env, "check", str(task_root), "--port", str(PORT))
        check("повтор зелёный", out.returncode == 0)
        check("повтор не платит", "XP за повтор не платится" in out.stdout)
        conn = db_mod.connect(cfg, create=False)
        paid = conn.execute(
            "SELECT COUNT(*) FROM xp_ledger WHERE reason = 'code'").fetchone()[0]
        check("выплата за код ровно одна", paid == 1, str(paid))
        conn.close()

        print("\n8. Сервер выключен: результат честный, XP не начисляется")
        conn = db_mod.connect(cfg, create=False)
        seed_item(conn, "1.22", LOOP_TASK)
        conn.close()
        arena(env, "task", "1.22", "--port", str(PORT))
        loop_root = cfg.tasks_root / "tasks" / "этап-01" / "1.22"
        write_solution(loop_root, "Loop.java",
                       "public class Loop { public static int go() { return 1; } }")
        out = arena(env, "check", str(loop_root), "--port", "8899")
        check("прогон при выключенном сервере зелёный", out.returncode == 0)
        check("runner честно говорит про сервер", "сервер arena не отвечает" in out.stdout)
        conn = db_mod.connect(cfg, create=False)
        loop_paid = conn.execute(
            "SELECT COUNT(*) FROM xp_ledger WHERE reason = 'code' AND ref_id != ?",
            (conn.execute("SELECT item_id FROM code_tasks WHERE passed_at IS NOT NULL "
                          "ORDER BY item_id LIMIT 1").fetchone()[0],)
        ).fetchone()[0]
        check("без сервера XP не начислен", loop_paid == 0, str(loop_paid))
        conn.close()

        print("\n9. Вечный цикл убивается по таймауту (это займёт минуту)")
        write_solution(loop_root, "Loop.java",
                       "public class Loop { public static int go() { while (true) { } } }")
        started = time.monotonic()
        out = arena(env, "check", str(loop_root), "--port", str(PORT))
        spent = time.monotonic() - started
        body = out.stdout + out.stderr
        check("прогон убит примерно за минуту", 55 <= spent <= 100, f"{round(spent, 1)} с")
        check("сообщение про таймаут человеческое", "не уложились в 60 секунд" in body)
        check("подсказка про вечный цикл на месте", "вечный цикл" in body)
        check("трейсбека питона в выводе нет", "Traceback" not in body)
        leftovers = subprocess.run(
            ["pgrep", "-f", "junit-platform-console-standalone"],
            capture_output=True, text=True, check=False,
        )
        check("живых java-процессов после убийства не осталось",
              leftovers.returncode != 0, leftovers.stdout.strip()[:60])

        print("\n10. Враждебная задача обязана упасть по запрету песочницы")
        conn = db_mod.connect(cfg, create=False)
        hostile_id = seed_item(conn, "1.06", HOSTILE_TASK)
        conn.close()
        issued_out = arena(env, "task", "1.06", "--port", str(PORT))
        check("враждебная задача выдана", issued_out.returncode == 0,
              (issued_out.stdout + issued_out.stderr).strip()[-200:])
        hostile_root = cfg.tasks_root / "tasks" / "этап-01" / "1.06"
        write_solution(hostile_root, "Hostile.java",
                       "public class Hostile { public static int answer() { return 42; } }")
        for name in (sandbox.SYSTEMD, sandbox.BWRAP):
            out = arena(env, "check", str(hostile_root), "--port", str(PORT),
                        "--sandbox-method", name)
            body = out.stdout + out.stderr
            conn = db_mod.connect(cfg, create=False)
            row = conn.execute(
                "SELECT last_result FROM code_tasks WHERE item_id = ?", (hostile_id,)
            ).fetchone()
            conn.close()
            if row is None or not row["last_result"]:
                # Отчёта нет: либо runner не смог достучаться до сервера, либо check
                # упал сам. Код возврата различает эти два случая (2 это TaskError).
                check(f"{name}: враждебная задача прогналась", False,
                      f"код возврата {out.returncode}, хвост вывода: {body.strip()[-400:]}")
                continue
            last = json.loads(row["last_result"])
            cases = {c["name"]: c["ok"] for c in last["hidden"]}
            check(f"{name}: враждебная задача не сдана", out.returncode == 1 and not last["ok"])
            check(f"{name}: запись за пределы рабочей папки запрещена",
                  cases.get("writesIntoHome") is False, json.dumps(cases, ensure_ascii=False))
            check(f"{name}: сокет наружу не открылся", cases.get("opensSocket") is False)
            check(f"{name}: имена в DNS не разрешаются", cases.get("resolvesDns") is False)
            check(f"{name}: файл в домашней папке не появился", not HOSTILE_PROBE.exists())

        print("\n11. Зелёная сдача под bwrap считается так же")
        out = arena(env, "check", str(task_root), "--port", str(PORT), "--sandbox-method", "bwrap")
        check("bwrap гоняет тесты и даёт зелёный", out.returncode == 0,
              (out.stdout + out.stderr).strip().splitlines()[-1][:120])

        print("\n12. Закрытие ноды по типам (раздел 4)")
        conn = db_mod.connect(cfg, create=False)
        stage2 = conn.execute("SELECT id FROM stages WHERE num = 2").fetchone()["id"]
        conn.execute("UPDATE nodes SET status = 'available' WHERE stage_id = ?", (stage2,))
        node214 = conn.execute("SELECT * FROM nodes WHERE code = '2.14'").fetchone()
        verdict = progress.evaluate(conn, node214["id"])
        check("практика без зелёного кода не закрывается", not verdict["ready"], verdict["why"])
        quiz_node = conn.execute(
            "SELECT n.* FROM nodes n JOIN items i ON i.node_id = n.id "
            "WHERE i.type = 'quiz' AND n.kind = 'тема' GROUP BY n.id HAVING COUNT(*) >= 10 LIMIT 1"
        ).fetchone()
        conn.close()

        if quiz_node is None:
            print("        вопросов на нодах нет, часть проверки пропущена")
        else:
            conn = db_mod.connect(cfg, create=False)
            conn.execute("UPDATE nodes SET status = 'in_progress', entered_at = ? WHERE id = ?",
                         (db_mod.now(), quiz_node["id"]))
            conn.commit()
            rows = list(conn.execute(
                "SELECT id, payload FROM items WHERE node_id = ? AND type = 'quiz' LIMIT 10",
                (quiz_node["id"],)))
            conn.close()
            # Восемь верных из десяти это ровно порог 80 процентов.
            for i, row in enumerate(rows):
                ans = json.loads(row["payload"])["ans"]
                choice = ans if i < 8 else (ans + 1) % 4
                client.post("/api/quiz/answer", json={"item_id": row["id"], "choice": choice})
            conn = db_mod.connect(cfg, create=False)
            status = conn.execute("SELECT status FROM nodes WHERE id = ?",
                                  (quiz_node["id"],)).fetchone()["status"]
            block = progress.quiz_block(
                conn, conn.execute("SELECT * FROM nodes WHERE id = ?", (quiz_node["id"],)).fetchone())
            conn.close()
            check("тема закрылась по квиз-блоку на 80 процентов", status == "closed",
                  f"{quiz_node['code']}: {block['correct']} из {block['answered']}, статус {status}")

        print("\n13. Боевой стейт и портфель не тронуты (правило 14.4)")
        if True:
            prodguard.verify(prod_guard, check)
            after = sorted(p.name for p in portfolio.rglob("*"))
            added = sorted(set(after) - set(portfolio_before))
            # demo_user мог выдать себе задачу прямо во время прогона: его папки
            # приёмке не принадлежат. Ругаемся только на следы стенда.
            ours = [name for name in added if name.startswith(("arena-3-", "stand", "tmp"))]
            check("боевой портфель приёмкой не замусорен", not ours, ", ".join(ours))
            if added and not ours:
                print(f"        в портфеле появилось своё: {', '.join(added[:3])}")

        if hub2_mtime is not None:
            check("хаб этапа 2 не переписан", hub2.stat().st_mtime_ns == hub2_mtime)
        check("папки прогонов за собой убраны",
              not cfg.runs_root.exists() or not any(cfg.runs_root.iterdir()),
              str(cfg.runs_root))
    finally:
        if server is not None:
            server.send_signal(signal.SIGTERM)
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
        shutil.rmtree(tmp, ignore_errors=True)
        if HOSTILE_PROBE.exists():
            HOSTILE_PROBE.unlink()

    print(f"\nитого: пройдено {PASSED}, провалено {len(FAILED)}")
    for name in FAILED:
        print(f"  провал: {name}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
