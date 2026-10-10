#!/usr/bin/env python3
"""Приёмка захода 2а. Поднимает настоящий сервер в песочнице и проходит день по API.

    .venv/bin/python scripts/acceptance_phase2a.py

Ничего не трогает ни в боевой базе, ни в волте: своя временная папка стейта,
копия роадмапа не нужна, читаем волт только на чтение при sync.
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
from arena import db as db_mod  # noqa: E402
from arena import srs  # noqa: E402
from arena.importers import html_tests, jcards  # noqa: E402
from arena.roadmap import sync as sync_roadmap  # noqa: E402

PORT = 8797
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


def main() -> int:
    for name in [k for k in os.environ if k.startswith("ARENA_")]:
        del os.environ[name]
    real = config_mod.load(env="prod")
    prod_guard = prodguard.snapshot(real)
    prod_mtime = real.db_path.stat().st_mtime_ns if real.db_path.exists() else None

    tmp = Path(tempfile.mkdtemp(prefix="arena-2a-"))
    server = None
    try:
        env = dict(os.environ)
        env.update({
            "ARENA_ENV": "dev",
            "ARENA_STATE_DIR": str(tmp / "state"),
            "PYTHONPATH": str(PROJECT),
        })
        os.environ["ARENA_STATE_DIR"] = str(tmp / "state")
        os.environ["ARENA_ENV"] = "dev"
        cfg = config_mod.load(env="dev")

        print("\n0. Готовим песочницу")
        conn = db_mod.init(cfg)
        sync_roadmap(conn, cfg)
        html_tests.run(conn, cfg, archive=False)
        jcards.run(conn, cfg)
        nodes = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        cards = conn.execute("SELECT COUNT(*) FROM card_state").fetchone()[0]
        quizzes = conn.execute("SELECT COUNT(*) FROM items WHERE type='quiz'").fetchone()[0]
        check("роадмап и банк на месте", nodes == 1075 and cards > 100 and quizzes > 1300,
              f"нод {nodes}, карточек {cards}, вопросов {quizzes}")
        conn.close()

        server = subprocess.Popen(
            [sys.executable, "-m", "arena", "serve", "--port", str(PORT)],
            cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        client = httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=10.0)
        check("сервер поднялся", wait_up(client))

        print("\n1. День ноль на первом этапе: контракт карточный")
        today = client.get("/api/today").json()
        check("текущая нода это 1.01", today["node"]["code"] == "1.01", today["node"]["code"])
        check("нода переведена в работу", today["node"]["status"] == "in_progress",
              today["node"]["status"])
        check("вопросов на этап 1 нет, цель по ним ноль", today["contract"]["quiz_target"] == 0,
              str(today["contract"]["quiz_target"]))
        check("карточная половина контракта живая", today["contract"]["cards_target"] == 10,
              str(today["contract"]["cards_target"]))
        check("в ответе нет счётчика долга по карточкам",
              "due_total" not in json.dumps(today) and "overdue" not in json.dumps(today))

        print("\n2. Проходим карточную половину")
        gained = 0
        contract_xp = 0
        for i in range(10):
            card = client.get("/api/cards/next").json()
            if not card["item_id"]:
                break
            res = client.post("/api/cards/answer",
                              json={"item_id": card["item_id"], "grade": "good"}).json()
            gained += res["xp"]
            contract_xp += res.get("contract_xp", 0)
        state = client.get("/api/today").json()
        check("десять карточек засчитаны", state["contract"]["cards_done"] == 10,
              str(state["contract"]["cards_done"]))
        check("за карточки начислено 50 XP", gained == 50, str(gained))
        check("контракт закрылся и заплатил 50", contract_xp == 50, str(contract_xp))
        check("день зелёный", state["contract"]["done"] and state["contract"]["closed"])
        check("XP за день сошёлся", state["xp"]["today"] == 100, str(state["xp"]["today"]))

        print("\n3. Контракт платит один раз")
        card = client.get("/api/cards/next").json()
        if card["item_id"]:
            res = client.post("/api/cards/answer",
                              json={"item_id": card["item_id"], "grade": "good"}).json()
            check("повторное закрытие не платит", res.get("contract_xp", 0) == 0,
                  str(res.get("contract_xp")))
        conn = db_mod.connect(cfg, create=False)
        paid = conn.execute("SELECT COUNT(*) FROM xp_ledger WHERE reason = 'contract'").fetchone()[0]
        check("в леджере ровно одна выплата за контракт", paid == 1, str(paid))

        print("\n4. Проверяем SM-2 против формул jcards")
        row = conn.execute(
            "SELECT cs.* FROM card_state cs JOIN attempts a ON a.item_id = cs.item_id LIMIT 1"
        ).fetchone()
        check("после «хорошо» у новой карточки интервал 1 день", row["interval"] == 1 and row["reps"] == 1,
              f"interval={row['interval']}, reps={row['reps']}")
        fresh = conn.execute(
            "SELECT item_id FROM card_state WHERE last IS NULL LIMIT 1"
        ).fetchone()["item_id"]
        before = conn.execute("SELECT ease FROM card_state WHERE item_id = ?", (fresh,)).fetchone()["ease"]
        conn.close()
        res = client.post("/api/cards/answer", json={"item_id": fresh, "grade": "again"}).json()
        conn = db_mod.connect(cfg, create=False)
        after = conn.execute("SELECT * FROM card_state WHERE item_id = ?", (fresh,)).fetchone()
        check("«снова» роняет ease на 0.20 и считает промах",
              abs(after["ease"] - (before - 0.20)) < 1e-9 and after["lapses"] == 1,
              f"ease {before} -> {after['ease']}, промахов {after['lapses']}")
        check("«снова» возвращает карточку на сегодня", after["due"] == db_mod.today(), after["due"])

        print("\n5. Вопросы: переходим на этап с банком")
        stage2 = conn.execute(
            "SELECT n.id, n.code FROM nodes n JOIN stages s ON s.id = n.stage_id "
            "JOIN items i ON i.node_id = n.id WHERE s.num = 2 AND i.type = 'quiz' "
            "GROUP BY n.id HAVING COUNT(*) >= 10 ORDER BY n.seq LIMIT 1"
        ).fetchone()
        conn.execute("UPDATE nodes SET status = 'closed', closed_at = ? WHERE code = '1.01'",
                     (db_mod.today(),))
        conn.execute("UPDATE nodes SET status = 'in_progress', entered_at = ? WHERE id = ?",
                     (db_mod.now(), stage2["id"]))
        conn.commit()
        answers = {
            r["id"]: json.loads(r["payload"])["ans"]
            for r in conn.execute("SELECT id, payload FROM items WHERE type = 'quiz'")
        }
        conn.close()

        today = client.get("/api/today").json()
        check("текущая нода сменилась", today["node"]["code"] == stage2["code"], today["node"]["code"])
        check("цель по вопросам стала 10", today["contract"]["quiz_target"] == 10,
              str(today["contract"]["quiz_target"]))
        check("источник вопросов назван", today["contract"]["quiz_source"] in ("node", "stage"),
              str(today["contract"]["quiz_source"]))

        print("\n6. Блок из десяти вопросов")
        first_item = None
        earned = 0
        bonus = 0
        for i in range(10):
            item = client.get("/api/quiz/next").json()
            if not item["item_id"]:
                break
            if first_item is None:
                first_item = item["item_id"]
            res = client.post("/api/quiz/answer",
                              json={"item_id": item["item_id"], "choice": answers[item["item_id"]]}).json()
            earned += res["xp"]
            bonus += res.get("bonus", 0)
            if i == 0:
                check("Клиент A ответ подсвечен и объяснён",
                      res["correct"] and res["ans"] == answers[item["item_id"]] and res["exp"])
        check("десять верных ответов дали 100 XP", earned == 100, str(earned))
        check("бонус за чистый блок начислен один раз", bonus == 30, str(bonus))
        state = client.get("/api/today").json()
        check("счётчик вопросов дошёл до цели", state["contract"]["quiz_done"] == 10,
              str(state["contract"]["quiz_done"]))

        print("\n7. Анти-фарм и снятие кривого вопроса")
        again = client.post("/api/quiz/answer",
                            json={"item_id": first_item, "choice": answers[first_item]}).json()
        check("повтор того же вопроса за день не платит", again["xp"] == 0, str(again["xp"]))
        # Промах ничего не платит, поэтому он не имеет права закрывать оплату:
        # ученик разобрался и ответил верно, значит день ему это должен зачесть.
        miss = client.get("/api/quiz/next").json()
        wrong = (answers[miss["item_id"]] + 1) % 4
        first = client.post("/api/quiz/answer",
                            json={"item_id": miss["item_id"], "choice": wrong}).json()
        fixed = client.post("/api/quiz/answer",
                            json={"item_id": miss["item_id"], "choice": answers[miss["item_id"]]}).json()
        check("Клиент A ответ после промаха в тот же день платит",
              first["xp"] == 0 and fixed["xp"] == 10, f"{first['xp']} и {fixed['xp']}")
        third = client.post("/api/quiz/answer",
                            json={"item_id": miss["item_id"], "choice": answers[miss["item_id"]]}).json()
        check("третий заход по тому же вопросу уже не платит", third["xp"] == 0, str(third["xp"]))
        nxt = client.get("/api/quiz/next").json()
        client.post(f"/api/items/{nxt['item_id']}/suspend", json={})
        following = [client.get("/api/quiz/next").json()["item_id"] for _ in range(3)]
        check("снятый вопрос больше не выдаётся", nxt["item_id"] not in following, str(nxt["item_id"]))

        print("\n8. Ответ сервера не раскрывает правильный вариант заранее")
        item = client.get("/api/quiz/next").json()
        check("в выдаче вопроса нет поля ответа", "ans" not in item and "exp" not in item,
              ", ".join(item.keys()))

        print("\n9. Перезапуск сервера не теряет прогресс")
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

        print("\n9а. Повторение пройденного: расписание и осмысленная очередь")
        plan = client.get("/api/review/plan").json()
        check("расписание отдаётся", "cards_due" in plan and "forecast" in plan)
        check("прогноз считает только будущее",
              all(f["date"] > plan.get("today", "0000-00-00") for f in plan["forecast"])
              or not plan["forecast"])
        rq = client.get("/api/review/queue?limit=8").json()["items"]
        check("очередь повторения не пуста", bool(rq), str(len(rq)))
        check("у каждого задания сказано, почему оно тут",
              all(it.get("why") for it in rq))
        check("промахи идут первыми",
              rq[0]["why"] == "тут был промах" or all(
                  it["why"] != "тут был промах" for it in rq),
              rq[0]["why"])
        check("правильные ответы в очереди повторения не светятся",
              all("ans" not in it and "exp" not in it for it in rq))
        seen_ids = [it["item_id"] for it in rq]
        check("повторы в одной сессии не дублируются", len(seen_ids) == len(set(seen_ids)))

        print("\n9б. Обработчики не передают событие как флаг")
        # Классическая мина: addEventListener("click", fn) отдаёт в fn объект события.
        # Если у функции есть параметр, он молча станет истинным флагом. Именно так
        # петля дня однажды застряла на вопросах и не доходила до карточек.
        app_js = (PROJECT / "static" / "app.js").read_text(encoding="utf-8")
        bound = set(re.findall(r'addEventListener\(\s*["\'][a-z]+["\']\s*,\s*([A-Za-z_$][\w$]*)\s*\)', app_js))
        risky = []
        for name in sorted(bound):
            m = re.search(rf'function\s+{name}\s*\(([^)]*)\)', app_js)
            if m and m.group(1).strip():
                risky.append(f"{name}({m.group(1).strip()})")
        check("функции с параметрами не подписаны на события напрямую", not risky,
              ", ".join(risky))
        # Флага force больше нет: очередь целиком решает сервер, а nextAtom
        # просто показывает то, что пришло. Проверяем, что состояние не вернулось.
        check("петля дня не хранит режимов на клиенте",
              "let mode" not in app_js and "async function nextAtom()" in app_js)
        # Вопросы «что выведет код» отличаются только переносами строк. Если
        # варианты рисовать обычным div, все четыре станут одинаковыми, и вопрос
        # превращается в лотерею. Проверяем оба места, где рисуются варианты.
        boss_js = (PROJECT / "static" / "boss.js").read_text(encoding="utf-8")
        css = (PROJECT / "static" / "style.css").read_text(encoding="utf-8")
        # Колонка «осталось по ноде» живёт на данных /api/node/{code} и на коде
        # ноды из /api/item, поэтому проверяем оба источника, а не разметку.
        # Банк нод в песочнице пуст (его наполняет генератор), поэтому кладём в ноду
        # свой вопрос и смотрим, как он проходит путь от остатка до отвеченного.
        cur = client.get("/api/today").json()["node"]["code"]
        probe = json.dumps({"q": "вопрос для проверки остатка", "opts": ["а", "б", "в", "г"],
                            "ans": 1, "exp": "проверочный"}, ensure_ascii=False)
        side = db_mod.connect(cfg)
        node_row = side.execute("SELECT id, stage_id FROM nodes WHERE code = ?", (cur,)).fetchone()
        cur_id = side.execute(
            "INSERT INTO items(node_id, stage_id, type, payload, difficulty, source, active, "
            "suspended, created) VALUES (?, ?, 'quiz', ?, 1, 'manual', 1, 0, datetime('now'))",
            (node_row["id"], node_row["stage_id"], probe),
        ).lastrowid
        side.commit()
        side.close()

        view = client.get(f"/api/node/{cur}").json()
        mine = [a for a in view["atoms"] if a["id"] == cur_id]
        left = [a for a in view["atoms"] if not a["done"] and not a["suspended"]]
        check("свежий вопрос ноды виден в остатке и не отмечен сделанным",
              len(mine) == 1 and not mine[0]["done"] and mine[0]["id"] in [a["id"] for a in left])
        check("у каждого остатка есть тип и название",
              all(a["type"] and a["type_title"] and a["title"] for a in left))
        one = client.get(f"/api/item/{cur_id}").json()
        check("атом знает свою ноду, иначе колонка отстаёт при переходах",
              one.get("node_code") == cur, str(one.get("node_code")))
        client.post("/api/quiz/answer", json={"item_id": cur_id, "choice": 1})
        after_left = [a for a in client.get(f"/api/node/{cur}").json()["atoms"]
                      if not a["done"] and not a["suspended"]]
        check("отвеченный вопрос уходит из остатка",
              cur_id not in [a["id"] for a in after_left])
        closed = client.get("/api/node/1.01").json()
        done_left = [a for a in closed["atoms"] if not a["done"] and not a["suspended"]]
        check("на ноде без остатка список пуст, экран скажет «нету неотвеченных»",
              all(a["id"] == cur_id for a in done_left) or done_left == [],
              str(len(done_left)))
        check("варианты с переносами строк рисуются с сохранением пробелов",
              "optClass(" in app_js and "optClass(" in boss_js
              and re.search(r"\.opt \.out\s*\{[^}]*white-space:\s*pre-wrap", css) is not None)
        check("колонка остатка рисуется по ноде текущего атома, а не по шапке",
              "async function paintLeft()" in app_js
              and "current && current.node_code" in app_js
              and "нету неотвеченных" in app_js)

        print("\n10. Фронт отдаётся целиком")
        page = client.get("/")
        assets = [client.get("/static/app.js"), client.get("/static/style.css")]
        check("страница отдаётся", page.status_code == 200 and "arena" in page.text)
        check("статика отдаётся", all(a.status_code == 200 for a in assets))
        check("внешних ссылок на CDN нет",
              "http://" not in page.text and "https://" not in page.text)

        print("\n11. Боевой стейт не тронут (правило 14.4)")
        prodguard.verify(prod_guard, check)
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
