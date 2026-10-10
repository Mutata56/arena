#!/usr/bin/env python3
"""Приёмка захода 2б: карта, лента, самоотметка нод и обвязка.

    .venv/bin/python scripts/acceptance_phase2b.py

Всё гоняется в песочнице: своя папка стейта, своя КОПИЯ волта. Копия нужна,
потому что закрытие ноды зеркалит чекбокс в хабе, и эту запись надо проверить
на реальном файле, не трогая боевой волт. Боевая база только читается.
"""

from __future__ import annotations

import dataclasses
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
from arena import db as db_mod  # noqa: E402
from arena import migrations, pace, progress  # noqa: E402
from arena.importers import html_tests, jcards  # noqa: E402
from arena.roadmap import sync as sync_roadmap  # noqa: E402

PORT = 8801
NOTE = ("Разобрался, чем javac отличается от java: первый компилирует исходник в байт-код, "
        "второй запускает виртуальную машину и отдаёт ей class-файл.")
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


def wait_up(client: httpx.Client, tries: int = 60) -> bool:
    for _ in range(tries):
        try:
            client.get("/api/today", timeout=1.0)
            return True
        except Exception:  # noqa: BLE001
            time.sleep(0.25)
    return False


def main() -> int:  # noqa: C901
    for name in [k for k in os.environ if k.startswith("ARENA_")]:
        del os.environ[name]
    real = config_mod.load(env="prod")
    prod_guard = prodguard.snapshot(real)
    if not real.roadmap_dir.is_dir():
        print(f"нет роадмапа: {real.roadmap_dir}")
        return 2
    prod_mtime = real.db_path.stat().st_mtime_ns if real.db_path.exists() else None

    tmp = Path(tempfile.mkdtemp(prefix="arena-2b-"))
    server = None
    try:
        vault = tmp / "vault"
        vault.mkdir()
        shutil.copytree(real.roadmap_dir, vault / config_mod.ROADMAP_SUBDIR)
        # В боевом волте уже стоят галочки закрытых нод, копия их наследует,
        # и проверка «чекбокс переставился» падала бы на уже отмеченной ноде.
        for hub in (vault / config_mod.ROADMAP_SUBDIR).glob("*/_Этап*.md"):
            body = hub.read_text(encoding="utf-8")
            if "- [x] [[" in body:
                hub.write_text(body.replace("- [x] [[", "- [ ] [["), encoding="utf-8")
        env = dict(os.environ)
        env.update({
            "ARENA_ENV": "dev",
            "ARENA_STATE_DIR": str(tmp / "state"),
            "ARENA_VAULT": str(vault),
            "ARENA_ROADMAP_DIR": str(vault / config_mod.ROADMAP_SUBDIR),
            "ARENA_WRITE_VAULT": "0",
            "PYTHONPATH": str(PROJECT),
        })
        for key in ("ARENA_ENV", "ARENA_STATE_DIR", "ARENA_VAULT",
                    "ARENA_ROADMAP_DIR", "ARENA_WRITE_VAULT"):
            os.environ[key] = env[key]
        cfg = config_mod.load(env="dev")

        print("\n0. Песочница: копия волта, свежая база, импорт банка")
        conn = db_mod.init(cfg)
        sync_roadmap(conn, cfg)
        html_tests.run(conn, cfg, archive=False)
        jcards.run(conn, cfg)
        nodes = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        check("роадмап на месте", nodes == 1075, f"нод {nodes}")
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        cols = {r[1] for r in conn.execute("PRAGMA table_info(nodes)")}
        # Номер версии не прибит гвоздями: следующие фазы двигают схему дальше,
        # а этой приёмке важно другое, что база доехала до актуальной версии
        # и что поля закрытия ноды в ней есть.
        check("схема догнала актуальную версию, поля закрытия на месте",
              version == migrations.TARGET_VERSION >= 4 and {"closed_by", "close_note"} <= cols,
              f"версия {version}")
        hub1 = vault / config_mod.ROADMAP_SUBDIR / "Этап 01 Старт" / "_Этап 01 Старт.md"
        hub_before = hub1.read_text(encoding="utf-8")
        hub_mtime = hub1.stat().st_mtime_ns
        conn.close()

        server = subprocess.Popen(
            [sys.executable, "-m", "arena", "serve", "--port", str(PORT)],
            cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        client = httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=15.0)
        check("сервер поднялся", wait_up(client))

        print("\n1. Карта: 26 этапов, траектория и необязательные ветки")
        m = client.get("/api/map").json()
        by_num = {s["num"]: s for s in m["stages"]}
        check("на карте все 26 этапов", len(m["stages"]) == 26, str(len(m["stages"])))
        track = sorted(s["num"] for s in m["stages"] if s["in_track"])
        check("траектория это собесный минимум",
              track == sorted(config_mod.TRACK_STAGES), str(track))
        check("в траектории 718 нод", m["track"]["total"] == 718, str(m["track"]["total"]))
        branches = [s["num"] for s in m["stages"] if not s["in_track"]]
        check("необязательные ветки видны и заперты",
              branches == [10, 11, 13, 14, 20, 21, 22, 23, 24, 25, 26]
              and all(by_num[n]["locked"] for n in branches), str(branches))
        check("первый этап открыт, второй заперт",
              not by_num[1]["locked"] and by_num[2]["locked"])
        check("порог босса считается в нодах, а не в долях",
              by_num[1]["boss_at"] == 27 and by_num[1]["total"] == 29,
              f"босс на {by_num[1]['boss_at']} из {by_num[1]['total']}")
        check("текущая нода отмечена на карте", m["current"] == "1.01" and by_num[1]["current"],
              str(m["current"]))

        print("\n2. Строка ETA: дата, без процентов и без слова «отставание»")
        check("пока темпа нет, дата не выдумывается",
              not m["eta"]["ready"] and "появится" in m["eta"]["text"], m["eta"]["text"])
        blob = json.dumps(m, ensure_ascii=False)
        check("в ответе карты нет слова «отставание» и процентов",
              "отстава" not in blob and "%" not in blob)
        check("правила открытия веток совпадают с разделом 4",
              progress._stage_targets(1) == [2]
              and progress._stage_targets(9) == [12, 10, 11]
              and progress._stage_targets(12) == [15, 13, 14]
              and progress._stage_targets(19) == list(range(20, 27)),
              str(progress._stage_targets(9)))

        print("\n3. Этап целиком и вход в ноду")
        s1 = client.get("/api/map/stage/1").json()
        check("в первом этапе 29 нод", len(s1["nodes"]) == 29, str(len(s1["nodes"])))
        n101 = client.get("/api/node/1.01").json()
        check("у ноды есть тип, описание и ссылка на конспект",
              n101["kind"] and n101["obsidian_url"].startswith("obsidian://"),
              n101["obsidian_url"][:48])
        check("банк первой ноды пуст, атомов нет", n101["atoms"] == [] and n101["stage_pool"] == 0)
        check("закрытие предложено самоотметкой с конспектом",
              n101["close"]["mode"] == "note_empty" and n101["close"]["needs_note"],
              n101["close"]["mode"])

        conn = db_mod.connect(cfg, create=False)
        modes = {}
        for row in conn.execute(
            "SELECT n.code, n.kind FROM nodes n JOIN stages s ON s.id = n.stage_id "
            "WHERE s.num = 1 ORDER BY n.seq"
        ):
            node = progress.node_by_code(conn, row["code"])
            modes[row["code"]] = progress.close_mode(conn, node)
        check("все 29 нод первого этапа закрываемы, иначе этап не пройти",
              all(v in ("note", "note_empty") for v in modes.values()),
              f"самоотметок {sum(1 for v in modes.values() if v == 'note')}, "
              f"пустых {sum(1 for v in modes.values() if v == 'note_empty')}")
        handwritten = [c for c, v in modes.items() if v == "note"]
        check("рукописные и чтение JDK закрываются самоотметкой по типу",
              len(handwritten) == 2, ", ".join(handwritten))
        conn.close()

        entered = client.post("/api/node/1.03/enter", json={}).json()
        check("вход переводит ноду в работу", entered["status"] == "in_progress", entered["status"])
        check("первый вход помечен как новый, это триггер генерации фазы 4",
              entered["entry"] == "new", str(entered["entry"]))
        check("текущая нода стала 1.03", client.get("/api/today").json()["node"]["code"] == "1.03")
        back = client.post("/api/node/1.01/enter", json={})
        check("возврат в прежнюю ноду делает её текущей",
              back.json()["entry"] == "again"
              and client.get("/api/today").json()["node"]["code"] == "1.01",
              client.get("/api/today").json()["node"]["code"])
        denied = client.post("/api/node/2.01/enter", json={})
        check("в запертую ноду не пускает", denied.status_code == 409, str(denied.status_code))

        print("\n4. Самоотметка: конспект обязателен")
        empty = client.post("/api/node/1.01/close", json={"note": ""})
        short = client.post("/api/node/1.01/close", json={"note": "понял"})
        check("без конспекта не закрывает", empty.status_code == 400, str(empty.status_code))
        check("отписка в два слова не проходит", short.status_code == 400, str(short.status_code))
        check("отказ объясняет, что нужно",
              "конспект" in short.json()["detail"], short.json()["detail"][:60])

        before = client.get("/api/today").json()["xp"]["total"]
        res = client.post("/api/node/1.01/close", json={"note": NOTE}).json()
        check("нода закрыта и заплатила 100 XP", res["xp"] == 100, str(res["xp"]))
        check("закрытие помечено как самоотметка по пустому банку",
              res["closed_by"] == "note_empty", str(res["closed_by"]))
        # Открытие этапа переводит в available сразу все его ноды (так же, как sync
        # открывает первый этап), поэтому правило 3 обычно отрабатывает вхолостую.
        # Проверяем его на запертой ноде: это его настоящая работа.
        check("рядом стоящая нода и так была открыта", res["unlocked_node"] is None,
              str(res["unlocked_node"]))
        after = client.get("/api/today").json()["xp"]["total"]
        check("XP доехал до общего счёта", after == before + 100,
              f"было {before}, стало {after}")
        again = client.post("/api/node/1.01/close", json={"note": NOTE})
        check("повторное закрытие не платит второй раз", again.status_code == 409,
              str(again.status_code))

        conn = db_mod.connect(cfg, create=False)
        paid = conn.execute(
            "SELECT COUNT(*) FROM xp_ledger WHERE reason = 'node_closed'"
        ).fetchone()[0]
        day_row = conn.execute(
            "SELECT nodes_closed FROM days WHERE date = ?", (db_mod.today(),)
        ).fetchone()
        stored = conn.execute(
            "SELECT close_note, closed_by, closed_at FROM nodes WHERE code = '1.01'"
        ).fetchone()
        check("в леджере ровно одна выплата за ноду", paid == 1, str(paid))
        check("счётчик дня не задвоился", day_row["nodes_closed"] == 1,
              str(day_row["nodes_closed"]))
        check("конспект сохранён в базе", stored["close_note"] == NOTE)
        # Открытие этапа переводит в available сразу все его ноды (так же, как sync
        # открывает первый этап), поэтому правило 3 обычно отрабатывает вхолостую.
        # Проверяем его на запертой ноде: это его настоящая работа.
        conn.execute("UPDATE nodes SET status = 'locked' WHERE code = '1.05'")
        conn.commit()
        conn.close()
        rule3 = client.post("/api/node/1.04/close", json={"note": NOTE}).json()
        check("закрытие ноды открывает следующую по коду", rule3["unlocked_node"] == "1.05",
              str(rule3["unlocked_node"]))

        conn = db_mod.connect(cfg, create=False)
        banked = conn.execute(
            "SELECT n.code FROM nodes n JOIN stages s ON s.id = n.stage_id "
            "JOIN items i ON i.node_id = n.id WHERE s.num = 2 AND i.type = 'quiz' "
            "GROUP BY n.id ORDER BY n.seq LIMIT 1"
        ).fetchone()["code"]
        conn.close()
        node2 = client.get(f"/api/node/{banked}").json()
        check("нода со своим материалом самоотметкой не закрывается",
              node2["close"]["mode"] == "atoms" and not node2["close"]["needs_note"],
              f"{banked}: {node2['close']['mode']}, атомов {len(node2['atoms'])}")

        print("\n5. Волт: в песочнице не трогаем, в боевом профиле зеркалим чекбокс")
        check("после закрытий в песочнице хаб не изменился",
              hub1.stat().st_mtime_ns == hub_mtime and hub1.read_text(encoding="utf-8") == hub_before)
        writable = dataclasses.replace(cfg, write_vault=True)
        conn = db_mod.connect(cfg, create=False)
        marked = progress.close(conn, writable, "1.02", NOTE)
        conn.close()
        hub_after = hub1.read_text(encoding="utf-8")
        diff = [
            (a, b) for a, b in zip(hub_before.splitlines(), hub_after.splitlines()) if a != b
        ]
        check("чекбокс в хабе переставлен", marked["hub_marked"] and len(diff) == 1,
              f"изменённых строк {len(diff)}")
        check("переставлена строка именно этой ноды",
              bool(diff) and "1.02" in diff[0][1] and "- [x]" in diff[0][1],
              diff[0][1][:60] if diff else "")

        print("\n6. Порог этапа открывает следующий этап и его ветки")
        conn = db_mod.connect(cfg, create=False)
        codes = [
            r["code"] for r in conn.execute(
                "SELECT n.code FROM nodes n JOIN stages s ON s.id = n.stage_id "
                "WHERE s.num = 1 AND n.status != 'closed' ORDER BY n.seq"
            )
        ]
        # Закрываем первый этап почти целиком мимо API: интересен сам порог.
        for code in codes[:-3]:
            conn.execute(
                "UPDATE nodes SET status = 'closed', closed_at = ?, closed_by = 'note_empty' "
                "WHERE code = ?", (db_mod.now(), code)
            )
        conn.commit()
        conn.close()
        m = client.get("/api/map").json()
        by_num = {s["num"]: s for s in m["stages"]}
        check("на 26 закрытых нодах босс ещё спит и этап 2 заперт",
              not by_num[1]["boss_ready"] and by_num[2]["locked"],
              f"закрыто {by_num[1]['closed']}")
        closed_27 = client.post(f"/api/node/{codes[-3]}/close", json={"note": NOTE}).json()
        check("27-я нода открыла следующий этап", closed_27["opened_stages"] == [2],
              str(closed_27["opened_stages"]))
        m = client.get("/api/map").json()
        by_num = {s["num"]: s for s in m["stages"]}
        check("босс первого этапа доступен", by_num[1]["boss_ready"])
        check("этап 2 открыт, а дальние этапы нет",
              not by_num[2]["locked"] and by_num[3]["locked"] and by_num[10]["locked"])
        s2 = client.get("/api/map/stage/2").json()
        check("ноды второго этапа стали доступны",
              all(n["status"] == "available" for n in s2["nodes"]), s2["nodes"][0]["status"])

        print("\n7. Петля дня после закрытия нод жива")
        state = client.get("/api/today").json()
        check("текущая нода нашлась", state["node"] is not None and state["node"]["code"])
        client.post(f"/api/node/{banked}/enter", json={})
        state = client.get("/api/today").json()
        check("вход в ноду второго этапа подтянул её вопросы",
              state["node"]["code"] == banked and state["contract"]["quiz_target"] > 0,
              f"{state['node']['code']}, вопросов {state['contract']['quiz_target']}")
        forced = client.post(f"/api/node/{banked}/close", json={"note": NOTE})
        check("отказ по ноде с материалом внятный",
              forced.status_code == 409 and "прохождением" in forced.json()["detail"],
              forced.json().get("detail", "")[:64])

        print("\n7б. Смена ноды не оставляет день выполненным, но неоплаченным")
        # Ловушка: цель по вопросам считается от запаса ТЕКУЩЕЙ ноды. Ответили три
        # вопроса на ноде с банком, добили карточки, ушли на ноду с пустым банком:
        # цель ужимается до трёх, день выполнен, а платить его некому. До этой правки
        # контракт закрывался только из ответов, и день оставался неоплаченным навсегда.
        for _ in range(3):
            item = client.get("/api/quiz/next").json()
            client.post("/api/quiz/answer", json={"item_id": item["item_id"], "choice": 0})
        for _ in range(12):
            card = client.get("/api/cards/next").json()
            if not card["item_id"]:
                break
            client.post("/api/cards/answer", json={"item_id": card["item_id"], "grade": "good"})
        state = client.get("/api/today").json()
        check("до перехода день ещё не закрыт",
              state["contract"]["quiz_done"] == 3 and not state["contract"]["closed"],
              f"вопросов {state['contract']['quiz_done']} из {state['contract']['quiz_target']}")
        moved = client.post(f"/api/node/{codes[-2]}/enter", json={}).json()
        state = client.get("/api/today").json()
        check("переход на пустую ноду закрыл и оплатил день",
              moved["contract_xp"] == 50 and state["contract"]["closed"],
              f"выплата {moved['contract_xp']}, закрыт {state['contract']['closed']}")
        conn = db_mod.connect(cfg, create=False)
        paid = conn.execute(
            "SELECT COUNT(*) FROM xp_ledger WHERE reason = 'contract'"
        ).fetchone()[0]
        conn.close()
        check("выплата за контракт ровно одна", paid == 1, str(paid))
        moved_again = client.post(f"/api/node/{codes[-1]}/enter", json={}).json()
        check("следующий переход за тот же день не платит",
              moved_again["contract_xp"] == 0, str(moved_again["contract_xp"]))

        print("\n7в. Снятый вопрос тоже умеет закрыть день")
        # Та же причина, что и в 7б: кнопка «вопрос кривой» уменьшает запас, а значит
        # и цель дня. После снятия отвечать уже не на что, и день без этой правки
        # так и остался бы выполненным, но неоплаченным.
        conn = db_mod.connect(cfg, create=False)
        conn.execute("UPDATE days SET contract_done = 0, xp = xp - 50 WHERE date = ?",
                     (db_mod.today(),))
        conn.execute("DELETE FROM xp_ledger WHERE reason = 'contract'")
        conn.commit()
        conn.close()
        client.post(f"/api/node/{banked}/enter", json={})
        conn = db_mod.connect(cfg, create=False)
        keep = conn.execute(
            "SELECT i.id FROM items i JOIN nodes n ON n.id = i.node_id WHERE n.code = ? "
            "AND i.type = 'quiz' AND i.suspended = 0 "
            "AND i.id NOT IN (SELECT item_id FROM attempts WHERE kind = 'quiz') LIMIT 1",
            (banked,),
        ).fetchone()["id"]
        conn.execute("UPDATE items SET suspended = 1 WHERE type = 'quiz' AND id != ?", (keep,))
        conn.commit()
        conn.close()
        state = client.get("/api/today").json()
        check("остался ровно один вопрос, день ещё открыт",
              state["contract"]["quiz_target"] == 4 and not state["contract"]["closed"],
              f"цель {state['contract']['quiz_target']}, закрыт {state['contract']['closed']}")
        dropped = client.post(f"/api/items/{keep}/suspend", json={}).json()
        state = client.get("/api/today").json()
        check("снятие последнего вопроса закрыло и оплатило день",
              dropped["contract_xp"] == 50 and state["contract"]["closed"],
              f"выплата {dropped['contract_xp']}, закрыт {state['contract']['closed']}")
        conn = db_mod.connect(cfg, create=False)
        paid = conn.execute(
            "SELECT COUNT(*) FROM xp_ledger WHERE reason = 'contract'"
        ).fetchone()[0]
        conn.close()
        check("и снова выплата ровно одна", paid == 1, str(paid))

        print("\n8. ETA появляется, когда есть темп")
        conn = db_mod.connect(cfg, create=False)
        for i, date in enumerate(("2026-07-25", "2026-07-26", "2026-07-27")):
            conn.execute(
                "INSERT INTO days(date, quiz_count, cards_count, nodes_closed, xp, contract_done) "
                "VALUES (?, 10, 10, 2, 200, 1) ON CONFLICT(date) DO NOTHING", (date,)
            )
        conn.commit()
        eta = pace.eta(conn)
        rate = pace.user_rate(conn)
        conn.close()
        check("темп посчитан и не ниже пола", rate >= pace.RATE_FLOOR, f"{rate:.2f} ноды в день")
        check("строка ETA это дата в нужном формате",
              eta["ready"] and re.match(
                  r"^при текущем темпе финиш примерно к [а-я]+ \d{4}$", eta["text"]),
              eta["text"])
        check("в строке ETA нет процентов и слова «отставание»",
              "%" not in eta["text"] and "отстава" not in eta["text"])

        print("\n9. Лента событий")
        feed = client.get("/api/feed").json()
        today_group = next((d for d in feed if d["label"] == "сегодня"), None)
        check("сегодняшний день в ленте есть", today_group is not None)
        kinds = [e["kind"] for e in today_group["events"]]
        texts = " ".join(e["text"] for e in today_group["events"])
        check("закрытие ноды попало в ленту", "node_closed" in kinds, ", ".join(sorted(set(kinds))))
        check("нода названа по коду и имени", "1.01" in texts, texts[:70])
        check("пустые дни в ленту не попадают",
              all(d["xp"] or d["events"] for d in feed), str(len(feed)))
        blob = json.dumps(feed, ensure_ascii=False)
        check("в ленте нет упрёков", not any(
            w in blob for w in ("отстава", "пропустил", "просроч", "не выполнил", "провал")))

        print("\n10. Статистика-заглушка")
        st = client.get("/api/stats").json()
        m = client.get("/api/map").json()
        closed_map = sum(s["closed"] for s in m["stages"])
        check("счётчики сходятся с картой",
              st["nodes_closed"] == closed_map == st["track"]["closed"] and st["xp_total"] > 0,
              f"нод {st['nodes_closed']}, XP {st['xp_total']}")
        check("в статистике нет счётчика долга по карточкам",
              "due" not in json.dumps(st) and "overdue" not in json.dumps(st))

        print("\n11. Фронт: четыре вкладки, ничего наружу")
        page = client.get("/").text
        app_js = client.get("/static/app.js").text
        css = client.get("/static/style.css").text
        check("вкладки на месте",
              all(f'data-tab="{t}"' in page for t in ("today", "map", "feed", "stats")))
        check("внешних ссылок нет", "http://" not in page and "https://" not in page
              and "http://" not in app_js and "https://" not in app_js)
        check("во фронте нет слова «отставание» и разговоров про проценты темпа",
              "отстава" not in app_js and "отстава" not in page and "отстава" not in css)
        check("клавиши не срабатывают при вводе конспекта",
              'el.tagName === "TEXTAREA"' in app_js)

        print("\n12. Перезапуск сервера не теряет прогресс")
        before_xp = client.get("/api/today").json()["xp"]["total"]
        server.send_signal(signal.SIGTERM)
        server.wait(timeout=15)
        server = subprocess.Popen(
            [sys.executable, "-m", "arena", "serve", "--port", str(PORT)],
            cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        check("сервер поднялся снова", wait_up(client))
        after_xp = client.get("/api/today").json()["xp"]["total"]
        check("XP на месте", after_xp == before_xp, f"было {before_xp}, стало {after_xp}")
        m = client.get("/api/map").json()
        check("карта после перезапуска та же",
              [s["num"] for s in m["stages"]] == list(range(1, 27)))

        print("\n13. Боевой стейт и боевой волт не тронуты (правило 14.4)")
        if prod_mtime is not None:
            check("боевая база не менялась", real.db_path.stat().st_mtime_ns == prod_mtime)
            prod = sqlite3.connect(f"file:{real.db_path}?mode=ro", uri=True)
            dirty = [
                f"{t}={prod.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}"
                for t in ("attempts", "days", "xp_ledger", "bot_events")
                if prod.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            ]
            closed_prod = prod.execute(
                "SELECT COUNT(*) FROM nodes WHERE status = 'closed'"
            ).fetchone()[0]
            prod.close()
            prodguard.verify(prod_guard, check)
        else:
            print("        боевой базы нет, проверка пропущена")
    finally:
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
