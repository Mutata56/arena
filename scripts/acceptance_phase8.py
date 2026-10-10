#!/usr/bin/env python3
"""Приёмка фазы 8: бэкапы, статистика, внешний подвиг и полевой босс.

    .venv/bin/python scripts/acceptance_phase8.py

Всё гоняется в песочнице: своя state-директория во временной папке, свой сервер
на порту 8808. Боевая база только читается, волт не трогается вообще (синк
читает его на чтение, как и приёмки фаз 1 и 2а).

Живых вызовов модели здесь нет: фаза 8 наружу не ходит.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

import httpx  # noqa: E402

from arena import backup as backup_mod  # noqa: E402
from arena import boss as boss_mod  # noqa: E402
import prodguard  # noqa: E402
from arena import config as config_mod  # noqa: E402
from arena import db as db_mod  # noqa: E402
from arena import field as field_mod  # noqa: E402
from arena import migrations  # noqa: E402
from arena import stats as stats_mod  # noqa: E402
from arena import xp as xp_mod  # noqa: E402
from arena.gen import weak as weak_mod  # noqa: E402
from arena.importers import html_tests  # noqa: E402
from arena.roadmap import sync as sync_roadmap  # noqa: E402

PORT = 8808
FAILED: list[str] = []
PASSED = 0

# Слова, которых в статистике быть не может: счётчик просроченного, счётчик долга
# и любые упоминания отставания это ровно то, что запрещают разделы 6 и 9 плана.
# «Долг» ловим только существительным: описание ноды в роадмапе честно говорит
# про «долгий системный путь», и это не счётчик вины, а обещание дороги.
BANNED = (r"отстава", r"просроч", r"\bдолг(?:а|у|ом|е|и|ов|ам|ами|ах)?\b",
          r"пропустил", r"пропущен", r"не выполн", r"провалил день")
# Таблицы, в которых боевой базе на конец сборки быть нечего: это прогресс.
WATCHED = ("attempts", "days", "xp_ledger", "bot_events", "bosses", "defenses",
           "reviews", "code_tasks", "tz_projects", "boss_minisets", "seasons")


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASSED
    if ok:
        PASSED += 1
        print(f"  ок    {name}" + (f" ({detail})" if detail else ""))
    else:
        FAILED.append(name)
        print(f"  ПРОВАЛ {name}" + (f" ({detail})" if detail else ""))


def banned_hits(text: str) -> list[str]:
    low = text.lower()
    return [pat for pat in BANNED if re.search(pat, low)]


def visible_text(name: str, text: str) -> str:
    """Комментарии разработчика не в счёт: запрет из плана это запрет на то,
    что читает ученик. Правило то же, что в приёмке фазы 5."""
    if name.endswith(".js"):
        text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
        text = re.sub(r"(?m)^\s*//.*$", " ", text)
    elif name.endswith(".html"):
        text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    elif name.endswith(".css"):
        text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    return text


def wait_up(client: httpx.Client, db_path: Path, tries: int = 80) -> tuple[bool, str]:
    """Дождаться своего сервера и убедиться, что это именно свой.

    На 127.0.0.1 может уже слушать чужой процесс (боевой сервер, забытая приёмка
    соседней фазы). Тогда наш просто не займёт порт, а проверки начнут говорить
    с чужой базой и врать как угодно. Поэтому сверяем путь к базе через whoami.
    """
    for _ in range(tries):
        try:
            res = client.get("/api/whoami", timeout=1.0)
            if res.status_code == 200:
                seen = res.json().get("db", "")
                return seen == str(db_path), seen
        except Exception:  # noqa: BLE001
            time.sleep(0.25)
    return False, "сервер не отозвался"


def prod_fingerprint(db_path: Path) -> dict:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    have = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    out = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
           for t in WATCHED if t in have}
    out["#закрытых нод"] = conn.execute(
        "SELECT COUNT(*) FROM nodes WHERE status = 'closed'").fetchone()[0]
    out["#банк"] = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
    conn.close()
    return out


def prod_server_live(db_path: Path) -> bool:
    """Если боевой сервер поднят, время модификации базы двигает он, а не приёмка."""
    try:
        res = httpx.get("http://127.0.0.1:8791/api/whoami", timeout=2.0)
        return res.status_code == 200 and res.json().get("db") == str(db_path)
    except Exception:  # noqa: BLE001
        return False


def seed_history(conn: sqlite3.Connection, today: str) -> dict:
    """Синтетическая история занятий: дни, ответы, сезон и бой.

    Числа выбраны так, чтобы каждую проверку можно было сверить руками:
    ровный ряд дней с известным XP, известная тема с известной точностью.
    """
    last = dt.date.fromisoformat(today)
    days = []
    for i in range(0, 40, 2):  # занятия через день: половина дней пустая
        date = (last - dt.timedelta(days=i)).isoformat()
        conn.execute(
            "INSERT INTO days(date, contract_done, quiz_count, cards_count, code_count, "
            "nodes_closed, xp) VALUES (?, 1, 10, 10, 0, 0, ?) "
            "ON CONFLICT(date) DO UPDATE SET quiz_count = 10, cards_count = 10, xp = excluded.xp",
            (date, 150 + i),
        )
        days.append(date)

    # Две темы с запасом вопросов: по одной отвечаем в обычной петле, по другой
    # только на бою. Так видно, что экзамен не подмешивается в точность учёбы.
    fat = conn.execute(
        "SELECT json_extract(payload, '$.topic') AS topic, COUNT(*) AS c FROM items "
        "WHERE type = 'quiz' GROUP BY topic HAVING topic IS NOT NULL AND topic <> '' "
        "AND c >= 6 ORDER BY c DESC, topic LIMIT 2"
    ).fetchall()
    topic_quiz, topic_boss = fat[0]["topic"], fat[1]["topic"]
    picked = {}
    for topic in (topic_quiz, topic_boss):
        picked[topic] = conn.execute(
            "SELECT id FROM items WHERE type = 'quiz' "
            "AND json_extract(payload, '$.topic') = ? ORDER BY id LIMIT 6", (topic,)
        ).fetchall()
    same = picked[topic_quiz]
    boss_only = picked[topic_boss]
    rows = same + boss_only

    for n, row in enumerate(same):
        conn.execute(
            "INSERT INTO attempts(item_id, ts, correct, result, xp, kind) "
            "VALUES (?, ?, ?, '{}', 0, 'quiz')",
            (row["id"], db_mod.now(), 1 if n < 4 else 0),
        )
    for row in boss_only:
        conn.execute(
            "INSERT INTO attempts(item_id, ts, correct, result, xp, kind) "
            "VALUES (?, ?, 0, '{}', 0, 'boss')", (row["id"], db_mod.now()))
    for row in rows:
        conn.execute(
            "INSERT INTO attempts(item_id, ts, correct, result, xp, kind) "
            "VALUES (?, ?, 1, '{}', 0, 'card')", (row["id"], db_mod.now()))

    stage = conn.execute("SELECT id FROM stages WHERE num = 2").fetchone()["id"]
    conn.execute(
        "INSERT INTO bosses(stage_id, kind, attempt_no, ts, rank, passed, status, "
        "quiz_correct, quiz_total, xp) VALUES (?, 'stage', 1, ?, 'B', 1, 'done', 15, 20, 300)",
        (stage, db_mod.now()),
    )
    conn.execute(
        'INSERT INTO seasons(num, start, "end", outcome, user_xp, bot_xp, user_nodes, bot_nodes) '
        "VALUES (1, ?, ?, 'win', 4200, 3900, 12, 11)",
        ((last - dt.timedelta(days=20)).isoformat(), (last - dt.timedelta(days=6)).isoformat()),
    )
    conn.commit()
    empty_stage = conn.execute("SELECT id FROM stages WHERE num = 1").fetchone()["id"]
    return {"days": days, "topic_quiz": topic_quiz, "topic_boss": topic_boss,
            "quiz_right": 4, "quiz_total": len(same), "stage_id": stage,
            "stage_without_boss": empty_stage}


def main() -> int:  # noqa: C901
    for name in [k for k in os.environ if k.startswith("ARENA_")]:
        del os.environ[name]
    real = config_mod.load(env="prod")
    prod_guard = prodguard.snapshot(real)
    prod_mtime = real.db_path.stat().st_mtime_ns if real.db_path.exists() else None
    prod_shot = prod_fingerprint(real.db_path) if prod_mtime is not None else {}
    prod_live = prod_server_live(real.db_path) if prod_mtime is not None else False

    tmp = Path(tempfile.mkdtemp(prefix="arena-8-"))
    server = None
    client = None
    try:
        env = dict(os.environ)
        env.update({"ARENA_ENV": "dev", "ARENA_STATE_DIR": str(tmp / "state"),
                    "PYTHONPATH": str(PROJECT)})
        os.environ["ARENA_ENV"] = "dev"
        os.environ["ARENA_STATE_DIR"] = str(tmp / "state")
        cfg = config_mod.load(env="dev")
        today = db_mod.today()

        print("\n0. Стенд: свежая песочница с роадмапом, банком и историей занятий")
        conn = db_mod.init(cfg)
        sync_roadmap(conn, cfg)
        html_tests.run(conn, cfg, archive=False)
        seed = seed_history(conn, today)
        version = migrations.current_version(conn)
        nodes = db_mod.scalar(conn, "SELECT COUNT(*) FROM nodes")
        items = db_mod.scalar(conn, "SELECT COUNT(*) FROM items")
        check("свежая база на актуальной версии схемы", version == migrations.TARGET_VERSION,
              f"версия {version} из {migrations.TARGET_VERSION}")
        check("роадмап и банк на месте", nodes > 1000 and items > 1000,
              f"нод {nodes}, записей банка {items}")
        conn.close()

        print("\n1. Бэкап: копия делает сам SQLite, а не cp")
        result = backup_mod.create(cfg)
        path = result["path"]
        check("файл бэкапа появился", path.is_file() and result["size"] > 0,
              f"{path.name}, {result['size'] // 1024} КБ")
        check("рядом нет хвостов WAL",
              not Path(str(path) + "-wal").exists() and not Path(str(path) + "-shm").exists())
        check("бэкап лежит в backup_dir профиля", path.parent == cfg.backup_dir, str(path.parent))

        print("\n2. Бэкап разворачивается в пустую базу и открывается")
        fresh = tmp / "restored" / "state.db"
        restored = backup_mod.restore(path, fresh)
        check("копия развернулась в пустую папку", restored.is_file() and restored == fresh)
        probe = sqlite3.connect(f"file:{restored}?mode=ro", uri=True)
        probe_version = probe.execute("PRAGMA user_version").fetchone()[0]
        probe_nodes = probe.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        probe_days = probe.execute("SELECT COUNT(*) FROM days").fetchone()[0]
        integrity = probe.execute("PRAGMA integrity_check").fetchone()[0]
        probe.close()
        check("развёрнутая база целая", integrity == "ok", integrity)
        check("версия схемы пережила копирование", probe_version == migrations.TARGET_VERSION,
              f"версия {probe_version} из {migrations.TARGET_VERSION}")
        check("данные на месте", probe_nodes == nodes and probe_days == len(seed["days"]),
              f"нод {probe_nodes}, дней {probe_days}")
        verified = backup_mod.verify(path)
        check("проверка разворачиванием проходит целиком",
              verified["ok"] and verified["counts"]["nodes"] == nodes
              and verified["version"] == migrations.TARGET_VERSION,
              f"целостность {verified['integrity']}, нод {verified['counts']['nodes']}")
        try:
            backup_mod.restore(path, fresh)
            over = False
        except SystemExit:
            over = True
        check("поверх существующей базы бэкап молча не разворачивается", over)

        print("\n3. Ротация держит 14 штук и трогает только свои файлы")
        alien = cfg.backup_dir / "чужая-копия.db"
        alien.write_text("не наше", encoding="utf-8")
        # Часы подменяем на время проверки: таймер снимает копию раз в сутки,
        # и ротацию честнее гонять на такой истории, а не на пачке копий за секунду.
        real_stamp = backup_mod.db.utc_stamp
        made = [path.name]
        try:
            backup_mod.db.utc_stamp = lambda: path.stem[len(backup_mod.PREFIX):]
            twin = backup_mod.create(cfg)["path"]
            made.append(twin.name)
            check("два бэкапа в одну секунду не дерутся за имя",
                  twin.is_file() and twin != path and path.is_file(),
                  f"{path.name} и {twin.name}")
            day = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=backup_mod.KEEP + 2)
            for i in range(backup_mod.KEEP + 2):
                when = (day + dt.timedelta(days=i)).strftime("%Y%m%d-%H%M%S")
                backup_mod.db.utc_stamp = lambda when=when: when
                made.append(backup_mod.create(cfg)["path"].name)
        finally:
            backup_mod.db.utc_stamp = real_stamp
        kept = sorted(p.name for p in cfg.backup_dir.glob(backup_mod.PATTERN))
        check(f"из {len(made)} бэкапов осталось ровно {backup_mod.KEEP}",
              len(kept) == backup_mod.KEEP, f"{len(kept)} штук")
        check("остались самые свежие", kept == sorted(made)[-backup_mod.KEEP:],
              f"первый оставшийся {kept[0]}, всего делали {len(made)}")
        check("ротация не сносит копию, которую только что сняла",
              backup_mod.create(cfg)["path"].is_file())
        check("чужой файл в папке цел", alien.is_file())
        listed = backup_mod.listing(cfg)
        newest = max(p.name for p in cfg.backup_dir.glob(backup_mod.PATTERN))
        check("список отдаёт свежее сверху и не видит чужого",
              listed[0]["name"] == newest and all(r["name"] != alien.name for r in listed),
              listed[0]["name"])

        print("\n4. Бэкап под нагрузкой: сервер в это время отвечает и пишет")
        server = subprocess.Popen(
            [sys.executable, "-m", "arena", "serve", "--port", str(PORT)],
            cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        client = httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=20.0)
        mine, seen = wait_up(client, cfg.db_path)
        check(f"на порту {PORT} поднялся наш сервер, а не чужой", mine, seen)
        if not mine:
            raise SystemExit(
                f"на порту {PORT} чужой сервер ({seen}). Погаси его и повтори: "
                f"ss -ltnp | grep {PORT}"
            )
        stop = threading.Event()
        wrote: list[int] = []
        errors: list[str] = []
        # Нагрузка это вход в ноду: каждый запрос переписывает отметку времени
        # в базе, и по ней видно, что сервер писал ровно тогда, когда снималась копия.
        node_code = client.get("/api/today").json()["node"]["code"]

        def hammer() -> None:
            beat = httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=20.0)
            try:
                while not stop.is_set():
                    try:
                        res = beat.post(f"/api/node/{node_code}/enter")
                        if res.status_code == 200:
                            wrote.append(1)
                    except Exception as exc:  # noqa: BLE001
                        errors.append(f"{type(exc).__name__}: {exc}")
            finally:
                beat.close()

        def stamp() -> str:
            probe = db_mod.connect(cfg, create=False)
            try:
                return probe.execute(
                    "SELECT entered_at FROM nodes WHERE code = ?", (node_code,)).fetchone()[0]
            finally:
                probe.close()

        worker = threading.Thread(target=hammer, daemon=True)
        worker.start()
        for _ in range(200):  # ждём, пока нагрузка реально пойдёт
            if wrote:
                break
            time.sleep(0.05)
        before_stamp = stamp()
        loaded = backup_mod.create(cfg)
        after_stamp = stamp()
        stop.set()
        worker.join(timeout=30)
        check("нагрузочный поток остановлен", not worker.is_alive())
        under_load = backup_mod.verify(loaded["path"])
        check("бэкап под нагрузкой сделался и открывается", under_load["ok"],
              under_load["integrity"])
        check("во время бэкапа сервер писал в ту же базу", after_stamp != before_stamp,
              f"отметка {before_stamp} стала {after_stamp}, запросов {len(wrote)}"
              + (f", сбоев {len(errors)}: {errors[0][:60]}" if errors else ""))

        print("\n5. Внешний подвиг: 20 XP и не больше трёх в день")
        # Нагрузка выше отмечала подвиги, счётчик дня надо обнулить: проверяем
        # потолок с чистого листа.
        conn = db_mod.connect(cfg, create=False)
        conn.execute("DELETE FROM xp_ledger WHERE reason = ?", (xp_mod.JAVARUSH,))
        conn.commit()
        conn.close()
        limit = field_mod.JAVARUSH_LIMIT
        rate = xp_mod.AMOUNTS[xp_mod.JAVARUSH]
        state = client.get("/api/deed/javarush").json()
        check("до отметки счётчик пуст", state["done"] == 0 and state["left"] == limit,
              json.dumps(state, ensure_ascii=False))
        gains = [client.post("/api/deed/javarush").json() for _ in range(limit)]
        extra = client.post("/api/deed/javarush")
        check(f"подвиги заплатили по {rate}",
              [g["gained"] for g in gains] == [rate] * limit,
              str([g["gained"] for g in gains]))
        check("сверх дневного потолка отметка вежливо отбита", extra.status_code == 409,
              f"код {extra.status_code}: {extra.json().get('detail', '')[:60]}")
        check("в отказе нет упрёка", not banned_hits(extra.json().get("detail", "")))
        conn = db_mod.connect(cfg, create=False)
        paid = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM xp_ledger WHERE reason = ?",
            (xp_mod.JAVARUSH,)).fetchone()
        check("в леджере ровно столько записей, сколько разрешено",
              tuple(paid) == (limit, limit * rate), str(tuple(paid)))
        conn.close()

        print("\n6. Полевой босс: анкета, 500 XP и слабые места в конвейер")
        before = client.get("/api/stats").json()["xp_total"]
        bad = client.post("/api/field", json={"place": "", "asked": ""})
        check("пустая анкета не принимается", bad.status_code == 400,
              f"код {bad.status_code}")
        check("отказ объясняет, чего не хватает", "где был" in bad.json().get("detail", ""),
              bad.json().get("detail", "")[:60])
        walk = client.post("/api/field", json={
            "place": "Тензор",
            "asked": "HashMap изнутри, equals и hashCode, стримы",
            "failed": "устройство HashMap\nequals и hashCode",
            "outcome": "позвали на второй тур",
        }).json()
        check("полевой босс заплатил 500 независимо от исхода",
              walk["xp"] == xp_mod.AMOUNTS[xp_mod.FIELD_BOSS], str(walk["xp"]))
        check("темы провалов разобраны по строкам",
              walk["topics"] == ["устройство HashMap", "equals и hashCode"], str(walk["topics"]))
        after = client.get("/api/stats").json()
        check("XP доехал до общего счёта", after["xp_total"] == before + 500,
              f"было {before}, стало {after['xp_total']}")

        conn = db_mod.connect(cfg, create=False)
        row = conn.execute("SELECT * FROM bosses WHERE kind = 'field'").fetchone()
        survey = json.loads(row["survey"])
        check("анкета легла в bosses с kind='field' и survey",
              row["stage_id"] is None and survey["place"] == "Тензор"
              and survey["failed"] == walk["topics"])
        summary = weak_mod.summary(conn)
        check("темы провалов дошли до сводки слабых мест конвейера",
              all(t in summary for t in walk["topics"]), summary.replace("\n", " | ")[:120])
        check("защита с ref_type='field' схемой разрешена",
              "field" in conn.execute(
                  "SELECT sql FROM sqlite_master WHERE name = 'defenses'").fetchone()[0])
        # Форма живёт во фронте, и приёмка её не нажимает. Самая дешёвая мина здесь
        # это опечатка в id: браузер молча пришлёт пустые поля, а сервер честно
        # ответит 400, и ни одна проверка выше этого не заметит.
        boss_js = (PROJECT / "static" / "boss.js").read_text(encoding="utf-8")
        reads = set(re.findall(r'getElementById\("(field-[\w-]+)"\)', boss_js))
        drawn = set(re.findall(r'id="(field-[\w-]+)"', boss_js))
        check("форма собеседования читает ровно те поля, которые рисует",
              reads and reads <= drawn, ", ".join(sorted(reads - drawn)) or f"полей {len(reads)}")

        stage_boss = boss_mod.state(conn, cfg, 2)
        check("собеседование не попало в историю боёв этапа",
              len(stage_boss["history"]) == 1 and stage_boss["history"][0]["rank"] == "B",
              f"боёв в истории {len(stage_boss['history'])}")
        check("собеседование не открывает этап, у которого босса не было",
              not boss_mod.passed_stage(conn, seed["stage_without_boss"]))
        conn.close()

        print("\n7. Статистика: график, теплокарта, точность по темам, история")
        board = client.get("/api/stats").json()
        chart = board["chart"]
        check("график это ряд дней подряд, последний это сегодня",
              len(chart) == stats_mod.CHART_DAYS and chart[-1]["date"] == today,
              f"дней {len(chart)}, хвост {chart[-1]['date']}")
        empty = [d for d in chart if d["xp"] == 0]
        check("день без занятий отдаётся нулём и не помечен ничем особенным",
              empty and set(empty[0].keys()) == {"date", "xp", "green"},
              f"пустых дней {len(empty)}")
        heat = board["heat"]
        check("теплокарта это семнадцать недель по семь дней",
              len(heat["weeks"]) == stats_mod.HEAT_WEEKS
              and all(len(w) == 7 for w in heat["weeks"]), str(len(heat["weeks"])))
        cells = [c for w in heat["weeks"] for c in w if c]
        blank = [c for c in cells if c["atoms"] == 0]
        busy = [c for c in cells if c["atoms"] > 0]
        check("пустой день это нулевая ступень и ничего больше",
              blank and all(c["level"] == 0 and c["xp"] == 0 for c in blank),
              f"пустых клеток {len(blank)}")
        check("день с занятиями подсвечен ступенью",
              busy and all(c["level"] >= 1 for c in busy), f"занятых клеток {len(busy)}")
        check("счётчик занятых дней сходится с клетками",
              heat["busy_days"] == len(busy), f"{heat['busy_days']} и {len(busy)}")
        check("в теплокарте нет ни одного счётчика пропущенного",
              not any(k in cells[0] for k in ("missed", "debt", "overdue", "DEMO_PROJECT")),
              ", ".join(sorted(cells[0].keys())))

        topics = {t["topic"]: t for t in board["topics"]}
        check("точность по темам считается в штуках",
              seed["topic_quiz"] in topics
              and topics[seed["topic_quiz"]]["right"] == seed["quiz_right"]
              and topics[seed["topic_quiz"]]["total"] == seed["quiz_total"],
              json.dumps(topics.get(seed["topic_quiz"], {}), ensure_ascii=False))
        check("ответы с боя в точность учёбы не попали",
              seed["topic_boss"] not in topics, seed["topic_boss"])
        check("история сезонов на месте",
              board["seasons"] and board["seasons"][0]["outcome"] == "win",
              str(len(board["seasons"])))
        check("история боссов на месте",
              board["bosses"] and board["bosses"][0]["rank"] == "B",
              str(len(board["bosses"])))
        check("история собеседований на месте",
              board["field"] and board["field"][0]["place"] == "Тензор",
              str(len(board["field"])))
        check("счётчики дня и серии считаются в штуках",
              isinstance(board["green_days"], int) and isinstance(board["streak"], int))

        print("\n8. Тон: ни счётчиков вины, ни ИИ-штампов, ни длинных тире")
        blobs = {}
        for path_api in ("/api/stats", "/api/deed/javarush", "/api/field", "/api/today",
                         "/api/ledger", "/api/feed"):
            blobs[path_api] = json.dumps(client.get(path_api).json(), ensure_ascii=False)
        hits = [f"{p}: {w}" for p, blob in blobs.items() for w in banned_hits(blob)]
        check("в ответах API нет счётчиков долга и слов про отставание", not hits,
              "; ".join(hits[:3]))
        check("процентов в статистике нет", "%" not in blobs["/api/stats"])
        front_hits = []
        dash_hits = []
        for f in sorted((PROJECT / "static").glob("*")):
            if f.suffix not in (".html", ".js", ".css"):
                continue
            text = visible_text(f.name, f.read_text(encoding="utf-8"))
            front_hits += [f"{f.name}: {w}" for w in banned_hits(text)]
            if re.search(r"[—–→⇒←↔]", text):
                dash_hits.append(f.name)
        for folder in ("prompts", "content"):
            for f in sorted((PROJECT / folder).rglob("*.md")):
                text = f.read_text(encoding="utf-8")
                if re.search(r"[—–→⇒←↔]", text):
                    dash_hits.append(f"{folder}/{f.name}")
        check("во фронте нет счётчиков долга и слов про отставание", not front_hits,
              "; ".join(front_hits[:3]))
        check("длинных тире и стрелок нет ни во фронте, ни в промптах", not dash_hits,
              ", ".join(dash_hits[:4]))
        app_js = (PROJECT / "static" / "app.js").read_text(encoding="utf-8")
        check("заглушка статистики убрана, вкладка настоящая",
              "приедут сюда" not in app_js and "arenaStatsHeat" not in app_js
              and "heatmap(" in app_js)
        page = client.get("/")
        check("страница отдаётся без внешних ссылок", page.status_code == 200
              and "http://" not in page.text and "https://" not in page.text)

        print("\n9. Команда arena backup работает так же, как её дёрнет таймер")
        cli_env = {k: v for k, v in env.items() if not k.startswith("ARENA_")}
        cli_env.update({"ARENA_ENV": "dev", "ARENA_STATE_DIR": str(tmp / "state"),
                        "PYTHONPATH": str(PROJECT), "PATH": "/usr/bin:/bin"})
        made = subprocess.run([sys.executable, "-m", "arena", "backup"], cwd=PROJECT,
                              env=cli_env, capture_output=True, text=True)
        check("arena backup отработала без сервера и без PATH пользователя",
              made.returncode == 0 and "бэкап готов" in made.stdout,
              (made.stdout or made.stderr).strip().splitlines()[0][:90] if (made.stdout or made.stderr) else "")
        shown = subprocess.run([sys.executable, "-m", "arena", "backup", "--list"], cwd=PROJECT,
                               env=cli_env, capture_output=True, text=True)
        check("arena backup --list показывает папку",
              shown.returncode == 0 and shown.stdout.count("state-") == backup_mod.KEEP,
              f"строк {shown.stdout.count('state-')}")
        checked = subprocess.run([sys.executable, "-m", "arena", "backup", "--check"], cwd=PROJECT,
                                 env=cli_env, capture_output=True, text=True)
        check("arena backup --check разворачивает свежий бэкап",
              checked.returncode == 0 and "целостность ok" in checked.stdout,
              checked.stdout.strip().splitlines()[-1][:90] if checked.stdout else checked.stderr[:90])

        print("\n10. Юниты и памятка установки")
        deploy = PROJECT / "deploy"
        unit = (deploy / "arena-backup.service").read_text(encoding="utf-8")
        timer = (deploy / "arena-backup.timer").read_text(encoding="utf-8")
        readme = (deploy / "README.md").read_text(encoding="utf-8")
        check("юнит бэкапа зовёт arena backup боевым профилем",
              "-m arena backup" in unit and "ARENA_ENV=prod" in unit)
        check("таймер бэкапа ежедневный и с Persistent",
              "OnCalendar=" in timer and "Persistent=true" in timer
              and "Unit=arena-backup.service" in timer)
        verify_units = shutil.which("systemd-analyze")
        if verify_units:
            res = subprocess.run(
                [verify_units, "verify", "--user", str(deploy / "arena-backup.service"),
                 str(deploy / "arena-backup.timer"), str(deploy / "arena.service"),
                 str(deploy / "arena-gen.service"), str(deploy / "arena-gen.timer")],
                capture_output=True, text=True)
            check("systemd-analyze verify не ругается на юниты",
                  res.returncode == 0 and not res.stderr.strip(), res.stderr.strip()[:120])
        else:
            print("        systemd-analyze не найден, проверка юнитов пропущена")
        for needed in ("arena.service", "arena-gen.timer", "arena-backup.timer",
                       "ARENA_GEN_WORKER", "hypr-user.conf", "submap"):
            check(f"в памятке есть {needed}", needed in readme)
        check("памятка ставит бинд Hyprland тем же способом, что и журнал захода 2б",
              "bind = Super, J, exec" in readme and "chrome-here" in readme)
        check("в памятке нет длинных тире и стрелок", not re.search(r"[—–→⇒←↔]", readme))

        print("\n11. Боевая база: только синк, импорты и засев")
        if prod_mtime is None:
            print("        боевой базы нет, проверка пропущена")
        else:
            after_shot = prod_fingerprint(real.db_path)
            check("боевая база по содержимому не изменилась", after_shot == prod_shot,
                  ", ".join(f"{k}: было {v}, стало {after_shot.get(k)}"
                            for k, v in prod_shot.items() if after_shot.get(k) != v))
            if prod_live:
                print("        боевой сервер поднят и пишет базу сам: "
                      "занятия, реплики Опуса, такт гонки")
            prod = sqlite3.connect(f"file:{real.db_path}?mode=ro", uri=True)
            have = {r[0] for r in prod.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")}
            dirty = [f"{t}={prod.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}"
                     for t in WATCHED if t in have
                     and prod.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]]
            prodguard.verify(prod_guard, check)
            sources = dict(prod.execute("SELECT source, COUNT(*) FROM items GROUP BY source"))
            # import это HTML-тесты, jcards это карточки, manual это рукописные
            # демо-задачи из content/, gen это разрешённый планом засев первых нод.
            check("банк собран только синком, импортами и засевом",
                  set(sources) <= {"import", "jcards", "manual", "gen"}, str(sources))
            gen_stages = [r[0] for r in prod.execute(
                "SELECT DISTINCT s.num FROM items i JOIN stages s ON s.id = i.stage_id "
                "WHERE i.source = 'gen' ORDER BY s.num")]
            check("засев не выходит за первые этапы", set(gen_stages) <= {1, 2},
                  f"этапы {gen_stages}")
            seeded = prod.execute(
                "SELECT COUNT(*) FROM items WHERE source = 'gen'").fetchone()[0]
            print(f"        засев на месте: записей gen {seeded}, "
                  f"банк целиком {after_shot['#банк']}")
            prod.close()
    finally:
        if client is not None:
            client.close()
        if server is not None:
            server.send_signal(signal.SIGTERM)
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\nитого: пройдено {PASSED}, провалено {len(FAILED)}")
    for name in FAILED:
        print(f"  провал: {name}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
