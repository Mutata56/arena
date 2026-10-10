#!/usr/bin/env python3
"""Приёмка фазы 7: ТЗ-цех.

    .venv/bin/python scripts/acceptance_phase7.py
    .venv/bin/python scripts/acceptance_phase7.py --no-gen      без живой генерации ТЗ
    .venv/bin/python scripts/acceptance_phase7.py --no-claude   вообще без живых вызовов

Всё в песочнице: свой стейт, КОПИЯ волта, свой портфель решений. Боевая база,
боевой портфель и боевой волт только читаются, в конце сверяется, что они целы.

Стенд держим в ~/.cache, а не в /tmp: под /tmp у systemd-run своё пространство
имён (PrivateTmp), и папка прогона там не находится. Ловушка фаз 3 и 6.

Живых вызовов модели три: ревью ослабленного решения, ревью эталона, оценка
защиты, плюс генерация постановки, если она не отключена флагом. Полный прогон
идёт минут двадцать, из них большая часть это ожидание модели.
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
from arena import migrations, progress, tz as tz_mod, tz_gen, xp  # noqa: E402
from arena.importers import code_tasks, html_tests, jcards, tz_specs  # noqa: E402
from arena.roadmap import sync as sync_roadmap  # noqa: E402

PORT = 8807
STAND = Path.home() / ".cache" / "arena-phase7"
SEED = "etap-02-volna"

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

def wait_up(client: httpx.Client, tries: int = 80) -> bool:
    for _ in range(tries):
        try:
            client.get("/api/tz", timeout=1.0)
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


def run_cli(args: list[str], env: dict, cwd: Path | None = None,
            timeout: int = 1500) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "arena", *args],
        cwd=str(cwd or PROJECT), env=env, capture_output=True, text=True, timeout=timeout,
    )


WATCHED = ("attempts", "days", "xp_ledger", "bosses", "defenses", "reviews",
           "code_tasks", "tz_projects", "tz_specs")


def prod_fingerprint(db_path: Path) -> dict:
    """Слепок боевой базы по таблицам, которых фаза 7 касаться не имеет права.
    Таблиц фазы 7 в боевой базе может ещё не быть, и это нормально."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    have = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    out = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
           for t in WATCHED if t in have}
    out["#закрытых нод"] = conn.execute(
        "SELECT COUNT(*) FROM nodes WHERE status = 'closed'").fetchone()[0]
    conn.close()
    return out


def prod_server_live(db_path: Path) -> bool:
    """Работает ли прямо сейчас боевой сервер. Если да, время модификации базы
    двигает он, а не приёмка, и сверять по нему нечестно: сверяем содержимое."""
    try:
        res = httpx.get("http://127.0.0.1:8791/api/whoami", timeout=2.0)
        return res.status_code == 200 and res.json().get("db") == str(db_path)
    except Exception:  # noqa: BLE001
        return False


def git_commits(root: Path) -> int:
    """Сколько коммитов в портфеле. Их не должно быть ни одного: коммитит ученик."""
    if not (root / ".git").exists():
        return 0
    out = subprocess.run(["git", "-C", str(root), "rev-list", "--count", "HEAD"],
                         capture_output=True, text=True)
    if out.returncode != 0:
        return 0
    return int((out.stdout or "0").strip() or 0)


# ---------------------------------------------------------------- ослабленное решение

# Работает и проходит все скрытые тесты, но нарушает четыре пункта постановки:
# switch подменён цепочкой if else, волны считаются через double и Math.ceil,
# склейка маршрута скопирована в три места, имена из одной буквы. Своих тестов нет.
WEAK_SOLUTION = """
public class Wave {

    static final int DEFAULT_CAPACITY = 10;

    static int totalStock(int[][] s) {
        if (s == null) {
            throw new IllegalArgumentException("null");
        }
        int r = 0;
        for (int i = 0; i < s.length; i++) {
            for (int j = 0; j < s[i].length; j++) {
                if (s[i][j] < 0) {
                    throw new IllegalArgumentException("bad");
                }
                r += s[i][j];
            }
        }
        return r;
    }

    static int[][] pick(int[][] s, int n) {
        if (s == null) {
            throw new IllegalArgumentException("null");
        }
        if (n < 0) {
            throw new IllegalArgumentException("bad");
        }
        int c = 0;
        for (int i = 0; i < s.length; i++) {
            c += s[i].length;
        }
        int[][] p = new int[c][3];
        int k = 0;
        int left = n;
        for (int i = 0; i < s.length; i++) {
            for (int j = 0; j < s[i].length; j++) {
                if (left <= 0) {
                    break;
                }
                int x = i % 2 == 0 ? j : s[i].length - 1 - j;
                int t = s[i][x] < left ? s[i][x] : left;
                if (t <= 0) {
                    continue;
                }
                p[k][0] = i;
                p[k][1] = x;
                p[k][2] = t;
                k++;
                left -= t;
            }
        }
        int[][] r = new int[k][3];
        for (int i = 0; i < k; i++) {
            r[i] = p[i];
        }
        return r;
    }

    static int waves(int p, int c) {
        if (p < 0) {
            throw new IllegalArgumentException("bad");
        }
        if (c < 1) {
            throw new IllegalArgumentException("bad");
        }
        return (int) Math.ceil((double) p / (double) c);
    }

    static String route(int[][] p) {
        if (p == null) {
            throw new IllegalArgumentException("null");
        }
        String s = "";
        for (int i = 0; i < p.length; i++) {
            if (i > 0) {
                s = s + ";";
            }
            s = s + (p[i][0] + 1) + "." + (p[i][1] + 1) + "x" + p[i][2];
        }
        return s;
    }

    static String verdict(int n, int p) {
        if (n < 0 || p < 0) {
            throw new IllegalArgumentException("bad");
        }
        if (p >= n) {
            return "OK";
        }
        if (p == 0) {
            return "NOSTOCK";
        }
        return "PARTIAL";
    }

    static String statusText(String c) {
        if (c == null) {
            throw new IllegalArgumentException("bad");
        }
        if (c.equals("OK")) {
            return "собрано";
        } else if (c.equals("PARTIAL")) {
            return "собрано частично";
        } else if (c.equals("NOSTOCK")) {
            return "нет остатка";
        } else {
            throw new IllegalArgumentException("bad");
        }
    }

    static String message(String o, int[][] p, int c) {
        if (o == null || o.trim().isEmpty()) {
            throw new IllegalArgumentException("bad");
        }
        if (p == null) {
            throw new IllegalArgumentException("null");
        }
        int q = 0;
        String s = "";
        for (int i = 0; i < p.length; i++) {
            q += p[i][2];
            if (i > 0) {
                s = s + ";";
            }
            s = s + (p[i][0] + 1) + "." + (p[i][1] + 1) + "x" + p[i][2];
        }
        return "ORDER=" + o + ";LINES=" + p.length + ";QTY=" + q + ";WAVES=" + waves(q, c)
                + ";ROUTE=" + s;
    }

    static String message(String o, int[][] p) {
        if (o == null || o.trim().isEmpty()) {
            throw new IllegalArgumentException("bad");
        }
        if (p == null) {
            throw new IllegalArgumentException("null");
        }
        int q = 0;
        String s = "";
        for (int i = 0; i < p.length; i++) {
            q += p[i][2];
            if (i > 0) {
                s = s + ";";
            }
            s = s + (p[i][0] + 1) + "." + (p[i][1] + 1) + "x" + p[i][2];
        }
        return "ORDER=" + o + ";LINES=" + p.length + ";QTY=" + q + ";WAVES="
                + waves(q, DEFAULT_CAPACITY) + ";ROUTE=" + s;
    }
}
"""

DEFENSE_ANSWERS = [
    "Разложил по одному методу на шаг потока: totalStock считает остаток, pick строит план "
    "змейкой, route печатает уже готовый план, message склеивает сообщение из плана и волн. "
    "Причина простая: обход склада это единственное сложное место, и он должен быть написан "
    "один раз. Думал сделать наоборот, одним методом plan, который сразу возвращает строку "
    "сообщения, но тогда ни маршрут, ни количество волн отдельно не проверишь тестом, "
    "и любой новый формат сообщения ломал бы обход.",
    "Двумерный массив здесь уместен, потому что склад так и устроен: проход и номер ячейки "
    "в проходе, и обход змейкой по нему пишется двумя вложенными циклами без единой лишней "
    "структуры. Индекс прохода при этом сам подсказывает направление: чётный слева направо, "
    "нечётный справа налево. Не стал бы я его брать там, где проходы разной природы или "
    "где ячейки надо искать по коду, а не по координате: там нужен поиск по ключу, "
    "а массив заставит бегать по всей матрице.",
    "Пустой склад даёт пустой план и route возвращает пустую строку, это я проверяю тестом. "
    "Ноль опасен в waves: при вместимости ноль целочисленное деление упало бы с "
    "ArithmeticException, поэтому вместимость меньше единицы я отбиваю исключением в начале "
    "метода, до всякой арифметики. Значение за границей диапазона ловится тем же способом: "
    "отрицательный остаток и отрицательная потребность это IllegalArgumentException, а не "
    "тихий ноль, иначе ошибка уехала бы в сообщение для ERP и всплыла на складе. "
    "Поймал бы я это тестом с assertThrows на waves(5, 0) и на pick со складом из минусов.",
]

NOTE_TEXT = ("Разобрал с ИИ две вещи: почему целочисленное округление вверх пишется как "
             "(a + b - 1) / b и чем это лучше Math.ceil на больших числах, и зачем "
             "проверки входа стоят до арифметики, а не после.")

# Постановка, у которой эталон заведомо красный: генерация обязана её отбить.
FAKE_SPEC = {
    "slug": "krivoe-tz",
    "title": "Кривое ТЗ с красным эталоном",
    "topics": ["массивы"],
    "must_use": [{"id": "own_tests", "why": "тесты"}],
    "dir_name": "этап-02-кривое",
    "spec_md": (
        "## Бизнес-контекст\n\nСклад считает остатки.\n\n"
        "## Функциональные требования\n\n1. `static int sum(int[] cells)` сумма остатков.\n\n"
        "## Ограничения\n\n- одномерный массив\n- свои тесты на JUnit\n- без коллекций\n\n"
        "## Формат ввода и вывода\n\nЧисло на выходе.\n\n"
        "## Критерии приёмки\n\n- скрытые тесты зелёные\n- свои тесты есть\n- имена говорящие\n\n"
        "## Примеры\n\nsum({1,2}) даёт 3.\n"
    ),
    "starter_files": {"Stock.java": "public class Stock {\n    static int sum(int[] cells) {\n"
                                    "        return 0;\n    }\n}\n"},
    "hidden_tests": (
        "import static org.junit.jupiter.api.Assertions.assertEquals;\n"
        "import org.junit.jupiter.api.DisplayName;\nimport org.junit.jupiter.api.Test;\n\n"
        "class StockHiddenTest {\n    @Test\n    @DisplayName(\"сумма остатков\")\n"
        "    void sum() {\n        assertEquals(3, Stock.sum(new int[] {1, 2}));\n    }\n}\n"
    ),
    # Эталон возвращает ноль: прогон обязан покраснеть.
    "reference_solution": {"Stock.java": "public class Stock {\n    static int sum(int[] cells) {\n"
                                         "        return 0;\n    }\n}\n"},
    "reference_tests": (
        "import static org.junit.jupiter.api.Assertions.assertEquals;\n"
        "import org.junit.jupiter.api.Test;\n\nclass StockTest {\n    @Test\n"
        "    void sumWorks() {\n        assertEquals(3, Stock.sum(new int[] {1, 2}));\n    }\n}\n"
    ),
}


def write_fake_claude(path: Path, payload: dict) -> str:
    """Подставной claude: отдаёт конверт CLI с заданным телом."""
    envelope = path.with_suffix(".json")
    envelope.write_text(json.dumps({
        "type": "result", "subtype": "success", "is_error": False,
        "result": json.dumps(payload, ensure_ascii=False),
    }, ensure_ascii=False), encoding="utf-8")
    path.write_text(f"#!/bin/sh\ncat {envelope}\n", encoding="utf-8")
    path.chmod(0o755)
    return str(path)


# ---------------------------------------------------------------- главное

def main() -> int:  # noqa: C901
    live = "--no-claude" not in sys.argv
    live_gen = live and "--no-gen" not in sys.argv
    for name in [k for k in os.environ if k.startswith("ARENA_")]:
        del os.environ[name]
    real = config_mod.load(env="prod")
    prod_guard = prodguard.snapshot(real)
    if not real.roadmap_dir.is_dir():
        print(f"нет роадмапа: {real.roadmap_dir}")
        return 2
    prod_mtime = real.db_path.stat().st_mtime_ns if real.db_path.exists() else None
    prod_live = prod_server_live(real.db_path) if prod_mtime is not None else False
    prod_shot = prod_fingerprint(real.db_path) if prod_mtime is not None else {}
    prod_projects = real.tasks_root / "projects"
    prod_before = sorted(p.name for p in prod_projects.iterdir()) if prod_projects.is_dir() else []

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

        print("\n0. Стенд: копия волта, свежая база, банк ТЗ")
        conn = db_mod.init(cfg)
        sync_roadmap(conn, cfg)
        html_tests.run(conn, cfg, archive=False)
        jcards.run(conn, cfg)
        code_tasks.run(conn, cfg)
        report = tz_specs.run(conn, cfg)
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        cols = {r[1] for r in conn.execute("PRAGMA table_info(tz_projects)")}
        check("схема свежая и с таблицами ТЗ",
              version == migrations.TARGET_VERSION and "tz_specs" in tables
              and {"spec_id", "submitted_at", "accepted_at", "checks", "xp", "last_result"} <= cols,
              f"версия {version} из {migrations.TARGET_VERSION}")
        check("эталонная постановка засеяна", report.added == 1 and not report.warnings,
              report.render().replace("\n", "; "))
        spec = conn.execute("SELECT * FROM tz_specs WHERE slug = ?", (SEED,)).fetchone()
        payload = tz_mod.payload_of(spec)
        points = tz_mod.spec_points(spec["spec_md"])
        check("в постановке есть все разделы и пункты для ревью",
              not tz_gen.check_spec(spec["spec_md"], payload, 2) and len(points) >= 8,
              f"пунктов {len(points)}")
        stage2 = conn.execute("SELECT * FROM stages WHERE num = 2").fetchone()
        stage3 = conn.execute("SELECT * FROM stages WHERE num = 3").fetchone()
        conn.close()

        print("\n1. Гейт: ТЗ выдаётся после взятого босса")
        server = start_server(env)
        client = httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=1500.0)
        check("сервер поднялся", wait_up(client))
        denied = client.post("/api/tz/stage/2/start")
        check("без взятого босса ТЗ не выдаётся", denied.status_code == 409,
              f"код {denied.status_code}: {denied.json().get('detail', '')[:60]}")
        board = client.get("/api/tz").json()
        check("экран честно говорит, чего ждать", not board["projects"] and not board["ready"]
              and not board["dev_bypass"])

        conn = db_mod.connect(cfg, create=False)
        prod_cfg = dataclasses.replace(cfg, env="prod")
        os.environ[tz_mod.DEV_ANY] = "1"
        check("обход гейта в боевом профиле не работает", not tz_mod.dev_gate_off(prod_cfg))
        check("обход гейта в песочнице работает", tz_mod.dev_gate_off(cfg))
        del os.environ[tz_mod.DEV_ANY]
        check("без флага гейт закрыт", not tz_mod.gate(conn, cfg, stage2["id"])["ready"])
        # Честный путь: взятый босс открывает ТЗ без всяких флагов.
        conn.execute(
            "INSERT INTO bosses(stage_id, kind, attempt_no, ts, rank, passed, status) "
            "VALUES (?, 'stage', 1, ?, 'B', 1, 'done')", (stage3["id"], db_mod.now()))
        conn.commit()
        g3 = tz_mod.gate(conn, cfg, stage3["id"])
        check("взятый босс открывает ТЗ этапа без флагов",
              g3["ready"] and g3["boss_passed"] and not g3["dev_bypass"])
        conn.close()

        stop_server(server)
        env2 = dict(env)
        env2[tz_mod.DEV_ANY] = "1"
        server = start_server(env2)
        check("сервер поднялся с обходом гейта", wait_up(client))
        board = client.get("/api/tz").json()
        # Экран обязан увидеть обход, а не только API выдачи: этап 3 сюда попал бы
        # и без флага (босс взят руками выше), поэтому ищем этап без взятого босса.
        conn = db_mod.connect(cfg, create=False)
        dev_only = [s for s in board["ready"]
                    if not boss_mod.passed_stage(conn, conn.execute(
                        "SELECT id FROM stages WHERE num = ?", (s["num"],)).fetchone()["id"])]
        conn.close()
        check("с флагом экран предлагает взять ТЗ", board["dev_bypass"] and dev_only
              and all(s["dev"] for s in dev_only),
              ", ".join(f"этап {s['num']}" for s in board["ready"]))

        print("\n2. Выдача проекта в портфель")
        issued = client.post("/api/tz/stage/2/start").json()
        root = Path(issued["dir_path"])
        check("проект материализован в песочный портфель",
              root.is_dir() and str(root).startswith(str(cfg.tasks_root))
              and (root / "README.md").is_file() and (root / tz_mod.MARKER).is_file(),
              str(root))
        check("папка лежит в projects, а не в tasks", root.parent.name == "projects")
        starter = sorted(p.name for p in root.glob("*.java"))
        check("стартовый каркас на месте", starter == sorted(payload["starter_files"]),
              ", ".join(starter))
        check("папка под свои тесты заведена", (root / "tz_tests_marker").exists() is False
              and (root / tz_mod.TESTS_DIR).is_dir())
        blob = "\n".join(p.read_text(encoding="utf-8") for p in root.rglob("*") if p.is_file())
        hidden_class = "WaveHiddenTest"
        check("скрытых тестов в портфеле нет",
              hidden_class not in blob and "assertArrayEquals" not in blob)
        readme = (root / "README.md").read_text(encoding="utf-8")
        check("README это постановка целиком",
              "Бизнес-контекст" in readme and "Критерии приёмки" in readme
              and "arena tz submit" in readme)
        again = client.post("/api/tz/stage/2/start").json()
        check("повторная выдача не плодит проекты", again["id"] == issued["id"])
        api_blob = json.dumps(client.get(f"/api/tz/{issued['id']}").json(), ensure_ascii=False)
        check("API не отдаёт скрытые тесты", hidden_class not in api_blob
              and "assertArrayEquals" not in api_blob)

        print("\n3. Ослабленное решение: rework с конкретным списком")
        (root / "Wave.java").write_text(WEAK_SOLUTION.strip() + "\n", encoding="utf-8")
        xp_before = client.get("/api/stats").json()["xp_total"]
        if live:
            done = run_cli(["tz", "submit", "--port", str(PORT)], env2, cwd=root)
            check("arena tz submit отработал и вернул доработку", done.returncode == 1,
                  (done.stdout or done.stderr)[-200:].strip())
            project = client.get(f"/api/tz/{issued['id']}").json()
            review = project["review"] or {}
            check("статус rework", project["status"] == "rework", project["status"])
            check("XP за ослабленное решение не платят",
                  client.get("/api/stats").json()["xp_total"] == xp_before)
            check("скрытые тесты при этом зелёные (сдача завалена не ими)",
                  (project["last_result"] or {}).get("hidden_ok") is True)
            fixes = review.get("fixes") or []
            check("список замечаний непустой и конкретный",
                  len(fixes) >= 3 and all(len(f["what"]) > 30 for f in fixes),
                  f"пунктов {len(fixes)}")
            known = {p["id"] for p in points}
            refs = [f["ref"] for f in fixes if f["ref"]]
            check("замечания привязаны к пунктам постановки",
                  len(refs) >= 3 and set(refs) <= known, ", ".join(sorted(set(refs))))
            about = " ".join(f"{f['what']} {f['fix']}" for f in fixes).lower()
            check("нарушенные ограничения названы поимённо",
                  all(word in about for word in ("switch", "double", "тест")),
                  "switch, double, тесты")
            marks = {c["key"]: c["score"] for c in review["criteria"]}
            check("машинные факты обнулили темы этапа и тесты",
                  marks["topics"] == 0 and marks["tests"] == 0, str(marks))
            check("ревью не придумывает требований сверх постановки",
                  all(f["ref"] or f["what"] for f in fixes)
                  and all(isinstance(a.get("what"), str) for a in review.get("advice", [])))
            check("защиту до приёмки не заводят", project["defense"] is None)
            dup = [f for f in fixes if f["what"].startswith("в коде не найдено")]
            check("машинные пункты не дублируют слова модели", len(dup) <= 1,
                  f"дублей {len(dup)}")
            print("\n--- ревью ослабленного решения ---")
            print(tz_mod.render_review(review, project["status"]))
            print("--- конец ревью ---\n")
        else:
            print("        живое ревью пропущено по флагу")

        print("\n4. Доработка до эталона: приёмка")
        for name, source in payload["reference_solution"].items():
            (root / name).write_text(source, encoding="utf-8")
        from arena import tasks as tasks_mod

        (root / tz_mod.TESTS_DIR / tasks_mod.test_file_name(payload["reference_tests"])).write_text(
            payload["reference_tests"], encoding="utf-8")
        if live:
            xp_before = client.get("/api/stats").json()["xp_total"]
            done = run_cli(["tz", "submit", "--port", str(PORT)], env2, cwd=root)
            project = client.get(f"/api/tz/{issued['id']}").json()
            check("arena tz submit принял работу",
                  done.returncode == 0 and project["status"] == "accepted",
                  f"код {done.returncode}, статус {project['status']}")
            review = project["review"] or {}
            # Принято не значит «идеально»: пара замечаний по мелочи допустима,
            # список из десяти пунктов у принятой работы означал бы, что статус врёт.
            check("у принятой работы замечаний почти нет", len(review.get("fixes") or []) <= 2,
                  f"пунктов {len(review.get('fixes') or [])}")
            check("баллы рубрики без нулей",
                  all(c["score"] > 0 for c in review["criteria"]),
                  str({c["key"]: c["score"] for c in review["criteria"]}))
            gained = client.get("/api/stats").json()["xp_total"] - xp_before
            check("XP за принятое ТЗ это тысяча плюс качество",
                  gained == project["xp"] and xp.AMOUNTS[xp.TZ] <= gained
                  <= xp.AMOUNTS[xp.TZ] + tz_mod.QUALITY_MAX,
                  f"{gained} XP, из них за качество {review.get('bonus')}")
            check("прогон посчитал и свои тесты, и скрытые",
                  (project["last_result"] or {}).get("tests_green", 0) >= 6
                  and (project["last_result"] or {}).get("hidden_ok") is True,
                  f"своих зелёных {(project['last_result'] or {}).get('tests_green')}")
            twice = client.post(f"/api/tz/{issued['id']}/submit",
                                json={"verdict": project["last_result"]})
            check("принятое ТЗ повторно не сдаётся", twice.status_code == 409,
                  f"код {twice.status_code}")
            print("\n--- итог ревью эталона ---")
            print(tz_mod.render_review(review, project["status"]))
            print("--- конец ревью ---\n")

            print("\n5. Защита по ТЗ и разбор с ИИ")
            d = project["defense"]
            check("защита заведена после приёмки",
                  d is not None and len(d["questions"]) == 3 and not d["graded"])
            short = client.post(f"/api/defense/{d['id']}/submit",
                                json={"answers": ["да", "ок", "ага"]})
            check("отписка в защите не принимается", short.status_code == 400,
                  f"код {short.status_code}")
            xp_before = client.get("/api/stats").json()["xp_total"]
            graded = client.post(f"/api/defense/{d['id']}/submit",
                                 json={"answers": DEFENSE_ANSWERS}).json()
            check("claude оценил защиту по ТЗ", graded.get("graded"),
                  graded.get("error") or graded.get("message") or "")
            if graded.get("graded"):
                check("XP защиты в диапазоне ноль сто и доехал до леджера",
                      0 <= graded["xp"] <= 100
                      and client.get("/api/stats").json()["xp_total"] - xp_before == graded["xp"],
                      str(graded["xp"]))
                print("\n--- защита по ТЗ ---")
                for row in graded["grade"]["grades"]:
                    print(f"балл {row['score']} из 2: {row['comment']}")
                print(f"итог: {graded['grade']['summary']}")
                print("--- конец защиты ---\n")
            thin = client.post(f"/api/tz/{issued['id']}/note", json={"summary": "разобрал"})
            check("пустой разбор не засчитывается", thin.status_code == 400,
                  f"код {thin.status_code}")
            xp_before = client.get("/api/stats").json()["xp_total"]
            paid = client.post(f"/api/tz/{issued['id']}/note", json={"summary": NOTE_TEXT}).json()
            check("разбор с ИИ платит тридцать один раз",
                  paid["xp"] == 30
                  and client.get("/api/stats").json()["xp_total"] - xp_before == 30
                  and client.post(f"/api/tz/{issued['id']}/note",
                                  json={"summary": NOTE_TEXT}).status_code == 409,
                  str(paid["xp"]))
        else:
            print("        приёмка эталона пропущена по флагу")

        print("\n6. Генерация постановки с самопроверкой эталона")
        conn = db_mod.connect(cfg, create=False)
        prompt15 = tz_gen.build_prompt(conn, conn.execute(
            "SELECT * FROM stages WHERE num = 15").fetchone())
        check("хвост TDD доезжает до промпта этапа 15",
              "TDD" in prompt15 and "красный тест" in prompt15
              and "15.23 TDD и цикл red green refactor" in prompt15)
        prompt3 = tz_gen.build_prompt(conn, stage3)
        check("хвост вложенных классов доезжает до промпта этапа 3",
              "вложенный или внутренний класс" in prompt3
              and "3.48 Статические вложенные классы" in prompt3)
        check("каталог машинных признаков уходит в промпт",
              all(f"- {key}:" in prompt3 for key in ("switch", "own_tests", "nested_class")))

        fake = write_fake_claude(STAND / "fake-claude", FAKE_SPEC)
        broken = None
        try:
            tz_gen.generate(conn, cfg, 2, tries=1, binary_path=fake, model=None)
        except tz_gen.GenError as exc:
            broken = str(exc)
        check("постановка с красным эталоном в банк не попадает", broken is not None
              and "эталон" in broken.lower(),
              (broken or "прошла, а не должна была")[:110])
        check("в банке по-прежнему только проверенное",
              conn.execute("SELECT COUNT(*) FROM tz_specs WHERE slug = 'krivoe-tz'").fetchone()[0] == 0)
        conn.close()

        if live_gen:
            conn = db_mod.init(cfg)
            started = time.time()
            try:
                result = tz_gen.generate(conn, cfg, 3, tries=2,
                                         on_event=lambda text: print(f"        {text}"))
            except tz_gen.GenError as exc:
                result = None
                check("постановка этапа 3 сгенерирована", False, str(exc)[:200])
            if result:
                spec3 = conn.execute("SELECT * FROM tz_specs WHERE id = ?",
                                     (result["spec_id"],)).fetchone()
                pay3 = tz_mod.payload_of(spec3)
                check("постановка этапа 3 сгенерирована и проверена прогоном",
                      result["ok"] and spec3["verified_at"],
                      f"попыток {result['attempts']}, {round(time.time() - started)} с")
                ids = {m["id"] for m in pay3["must_use"]}
                check("хвост вложенных классов вшит в требования", "nested_class" in ids,
                      ", ".join(sorted(ids)))
                check("самопроверка была настоящей: эталон зелёный",
                      result["self_check"]["hidden_ok"]
                      and result["self_check"]["tests_green"] == result["self_check"]["tests_total"],
                      f"скрытых {len(result['self_check']['hidden'])}, "
                      f"своих {result['self_check']['tests_green']}")
                check("пунктов постановки хватает для ревью",
                      len(tz_mod.spec_points(spec3["spec_md"])) >= tz_gen.MIN_POINTS)
                check("скрытые тесты в постановке не упомянуты",
                      tasks_mod.test_class(pay3["hidden_tests"]).lower()
                      not in spec3["spec_md"].lower())
                check("в постановке нет длинных тире и стрелок",
                      not tz_mod.DASHES.search(spec3["spec_md"])
                      and "→" not in spec3["spec_md"])
                print("\n--- сгенерированное ТЗ этапа 3 ---")
                print(spec3["spec_md"])
                print("--- конец постановки ---\n")
            conn.close()
        else:
            print("        живая генерация пропущена по флагу")

        print("\n7. Фронт и тексты")
        page = client.get("/tz")
        check("страница ТЗ отдаётся", page.status_code == 200 and "arenaTz" in page.text)
        howto = client.get("/github")
        check("страница про публикацию портфеля отдаётся",
              howto.status_code == 200 and "git push" in howto.text
              and "arena туда не коммитит" in howto.text)
        check("в инструкции нет автоматизации за ученика",
              "git commit -m" in howto.text and "выполнит за тебя" not in howto.text)
        assets = [client.get("/static/tz.js"), client.get("/static/tz.css")]
        check("статика экрана ТЗ отдаётся", all(a.status_code == 200 for a in assets))
        index = client.get("/").text
        check("вкладка ТЗ есть в общем каркасе", 'data-tab="tz"' in index)
        banned = ("отстава", "процент")
        hits = []
        for name in ("tz.js", "tz.css", "tz.html", "github.html"):
            text = (PROJECT / "static" / name).read_text(encoding="utf-8").lower()
            hits += [f"{name}: {word}" for word in banned if word in text]
            hits += [f"{name}: {ch}" for ch in ("—", "–", "→", "⇒") if ch in text]
        check("во фронте ТЗ нет запрещённых слов и знаков", not hits, "; ".join(hits[:3]))
        spec_text = (PROJECT / "content" / "tz" / SEED / "spec.md").read_text(encoding="utf-8")
        check("в эталонной постановке нет длинных тире и стрелок",
              not tz_mod.DASHES.search(spec_text) and "→" not in spec_text)

        print("\n8. Соседние механики не сломаны")
        wrong = run_cli(["check", "--port", str(PORT)], env2, cwd=root)
        check("arena check в папке ТЗ подсказывает про tz submit",
              wrong.returncode == 2 and "arena tz submit" in wrong.stderr,
              (wrong.stderr or wrong.stdout)[-120:].strip())
        status = run_cli(["tz", "--port", str(PORT)], env2)
        check("arena tz показывает статус", status.returncode == 0
              and "этап 2" in status.stdout, status.stdout[:120].strip())
        conn = db_mod.connect(cfg, create=False)
        check("защита боя и защита ТЗ живут в одной таблице",
              conn.execute("SELECT COUNT(*) FROM defenses WHERE ref_type = 'tz'").fetchone()[0]
              == (1 if live else 0))
        check("ТЗ не попало в нодовый XP сезона", xp.TZ not in xp.NODE_REASONS)
        conn.close()

        print("\n9. Портфель ученика и боевой стейт")
        check("arena не сделала ни одного коммита в портфель",
              git_commits(cfg.tasks_root) == 0, f"коммитов {git_commits(cfg.tasks_root)}")
        after = sorted(p.name for p in prod_projects.iterdir()) if prod_projects.is_dir() else []
        check("боевой портфель проектами приёмки не засорён", after == prod_before,
              ", ".join(sorted(set(after) - set(prod_before))))
        if prod_mtime is not None:
            after_shot = prod_fingerprint(real.db_path)
            check("боевая база по содержимому не изменилась", after_shot == prod_shot,
                  ", ".join(f"{k}: было {v}, стало {after_shot.get(k)}"
                            for k, v in prod_shot.items() if after_shot.get(k) != v))
            if prod_live:
                print("        боевой сервер поднят и пишет базу сам "
                      "(занятия, реплики Опуса, такт гонки)")
            prodguard.verify(prod_guard, check)
    finally:
        stop_server(server)
        shutil.rmtree(STAND, ignore_errors=True)

    print(f"\nитого: пройдено {PASSED}, провалено {len(FAILED)}")
    for name in FAILED:
        print(f"  провал: {name}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
