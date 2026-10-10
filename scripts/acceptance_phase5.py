#!/usr/bin/env python3
"""Приёмка фазы 5: Опус, сезоны, кампания.

    .venv/bin/python scripts/acceptance_phase5.py
    .venv/bin/python scripts/acceptance_phase5.py --claude   # плюс живая генерация реплик

Всё гоняется в песочнице: своя временная state-директория, синтетический стенд
роадмапа, боевая база только читается. Волт Obsidian не открывается вообще.

Сид-симуляция детерминирована: сиды зафиксированы, поэтому доля побед и худший
счёт воспроизводятся от прогона к прогону.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import math
import os
import random
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

import prodguard  # noqa: E402
from arena import bot, campaign as campaign_mod, config as config_mod  # noqa: E402
from arena import db as db_mod, pace, seasons, taunts  # noqa: E402

PORT = 8803
FAILED: list[str] = []
PASSED = 0

# Стенд: столько же нод, сколько в собесном минимуме роадмапа (раздел 4 плана).
TRACK_NODES = 718

# Модель дохода ученика. Берём ровно те источники, которые в продукте уже есть
# на конец фазы 5: боссов, ТЗ и разборов ещё нет, приписывать их себе нечестно.
NODE_XP = {"quiz_first": 120, "readcode": 80, "code": 100, "node_closed": 100}
BLOCK_XP = 30       # бонус за чистый блок, нодовая причина, платится раз в день
CONTRACT_XP = 50    # фора ученика
CARDS_XP = 50       # фора ученика, десять карточек по пять

EVEN_RATE = 2.0     # «ровный темп» приёмки: ветка 12 месяцев из раздела 1 плана
WIN_LO, WIN_HI = 0.55, 0.65
ROUT = 1.5          # хуже этого счёта проигрыш считается разгромом


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASSED
    if ok:
        PASSED += 1
        print(f"  ок    {name}" + (f" ({detail})" if detail else ""))
    else:
        FAILED.append(name)
        print(f"  ПРОВАЛ {name}" + (f" ({detail})" if detail else ""))


# --- стенд ----------------------------------------------------------------

def stand(tmp: Path, nodes: int = TRACK_NODES) -> tuple:
    cfg = dataclasses.replace(
        config_mod.load(env="dev"), state_dir=tmp, db_path=tmp / "state.db")
    conn = db_mod.init(cfg)
    conn.execute("INSERT INTO stages(num, title, hub_path, in_track) VALUES (1, 'Стенд', 'x.md', 1)")
    conn.executemany(
        "INSERT INTO nodes(stage_id, code, title, kind, seq, status) "
        "VALUES (1, ?, ?, 'тема', ?, 'available')",
        [(f"1.{i:04d}", f"Нода {i}", i) for i in range(1, nodes + 1)],
    )
    conn.commit()
    return cfg, conn


def live_day(conn: sqlite3.Connection, day: str, nodes: int) -> None:
    """Прожить день ученика: закрыть ноды, записать XP и дневные счётчики."""
    rows = conn.execute(
        "SELECT id FROM nodes WHERE status != 'closed' ORDER BY seq LIMIT ?", (nodes,)
    ).fetchall()
    for r in rows:
        conn.execute("UPDATE nodes SET status = 'closed', closed_at = ? WHERE id = ?",
                     (f"{day}T20:00:00", r["id"]))
        for reason, amount in NODE_XP.items():
            conn.execute("INSERT INTO xp_ledger(ts, amount, reason) VALUES (?, ?, ?)",
                         (f"{day}T20:00:00", amount, reason))
    for amount, reason, at in ((BLOCK_XP, "quiz_block", "19:00:00"),
                               (CARDS_XP, "card", "19:10:00"),
                               (CONTRACT_XP, "contract", "19:20:00")):
        conn.execute("INSERT INTO xp_ledger(ts, amount, reason) VALUES (?, ?, ?)",
                     (f"{day}T{at}", amount, reason))
    conn.execute(
        "INSERT INTO days(date, contract_done, quiz_count, cards_count, nodes_closed, xp) "
        "VALUES (?, 1, 10, 10, ?, ?) ON CONFLICT(date) DO UPDATE SET contract_done = 1, "
        "quiz_count = 10, cards_count = 10, nodes_closed = excluded.nodes_closed",
        (day, len(rows), len(rows) * sum(NODE_XP.values()) + BLOCK_XP + CARDS_XP + CONTRACT_XP),
    )
    conn.commit()


def poisson(rng: random.Random, mean: float) -> int:
    """Пуассон на коленке: дневной темп это счётный процесс, а не константа."""
    if mean <= 0:
        return 0
    limit, k, prod = math.exp(-mean), 0, rng.random()
    while prod > limit and k < 40:
        k += 1
        prod *= rng.random()
    return k


def simulate(seed: int, days: int, profile, nodes: int = TRACK_NODES, start=dt.date(2026, 8, 1)):
    """Прогон одного профиля. Возвращает открытое соединение и сводку."""
    tmp = Path(tempfile.mkdtemp(prefix="arena-5sim-"))
    cfg, conn = stand(tmp, nodes)
    rng = random.Random(seed)
    leads = []
    for i in range(days):
        day = (start + dt.timedelta(days=i)).isoformat()
        count, touched = profile(i, rng)
        # Утренний такт: экран «Сегодня» дёргает heartbeat до первого ответа,
        # значит возвращение после паузы ловится ещё «пустым» днём.
        seasons.heartbeat(conn, at=dt.datetime.fromisoformat(f"{day}T08:00:00"),
                          present=touched, rng=rng)
        if touched:
            live_day(conn, day, count)
        seasons.heartbeat(conn, at=dt.datetime.fromisoformat(f"{day}T23:30:00"),
                          present=touched, rng=rng)
        leads.append(bot.lead(conn, day))
    summary = {
        "history": seasons.history(conn, limit=200),
        "max_lead": max(leads) if leads else 0,
        "last_day": (start + dt.timedelta(days=days - 1)).isoformat(),
        "tmp": tmp,
        "cfg": cfg,
    }
    return conn, summary


def even(rate: float):
    def profile(i, rng):
        return poisson(rng, rate), True
    return profile


def weak_week(base: float, weak: float, since: int, length: int):
    def profile(i, rng):
        rate = weak if since <= i < since + length else base
        return poisson(rng, rate), True
    return profile


def spurt(base: float, high: float, since: int, length: int):
    def profile(i, rng):
        rate = high if since <= i < since + length else base
        return poisson(rng, rate), True
    return profile


def with_pause(base: float, since: int, length: int):
    def profile(i, rng):
        if since <= i < since + length:
            return 0, False
        return poisson(rng, base), True
    return profile


def worst_loss(history: list[dict]) -> tuple[float, dict | None]:
    bad, who = 0.0, None
    for h in history:
        if h["outcome"] != "loss":
            continue
        ratio = h["bot_xp"] / max(1, h["user_xp"])
        if ratio > bad:
            bad, who = ratio, h
    return bad, who


# --- разделы приёмки ------------------------------------------------------

def section_balance() -> int:
    print("\n1. Сид-симуляция: ровный темп")
    wins = losses = 0
    worst, worst_of = 0.0, None
    max_lead = 0
    seeds = range(40)
    for seed in seeds:
        conn, res = simulate(seed, 200, even(EVEN_RATE))
        conn.close()
        shutil.rmtree(res["tmp"], ignore_errors=True)
        max_lead = max(max_lead, res["max_lead"])
        for h in res["history"]:
            if h["outcome"] == "win":
                wins += 1
            elif h["outcome"] == "loss":
                losses += 1
        bad, who = worst_loss(res["history"])
        if bad > worst:
            worst, worst_of = bad, who
    total = wins + losses
    share = wins / total if total else 0
    check(f"ученик на ровном темпе ({EVEN_RATE} ноды в день) берёт 55-65 процентов сезонов",
          WIN_LO <= share <= WIN_HI,
          f"{wins} из {total}, доля {share:.3f}, сидов {len(list(seeds))}")
    check("на ровном темпе разгромов нет", worst <= ROUT,
          f"худший счёт 1:{worst:.2f}" + (f", сезон {worst_of['num']}" if worst_of else ""))
    check("разрыв в нодах не превышает потолок", max_lead <= bot.LEAD_CAP,
          f"максимум {max_lead} при потолке {bot.LEAD_CAP}")
    return max_lead


def section_weak(global_lead: int) -> int:
    print("\n2. Сид-симуляция: слабая неделя 0.5-0.9 ноды в день")
    worst, worst_of, max_lead = 0.0, None, 0
    for seed in range(24):
        rate = 0.5 + (seed % 5) * 0.1  # 0.5 ... 0.9
        conn, res = simulate(seed, 80, weak_week(EVEN_RATE, rate, 21, 7))
        conn.close()
        shutil.rmtree(res["tmp"], ignore_errors=True)
        max_lead = max(max_lead, res["max_lead"])
        bad, who = worst_loss(res["history"])
        if bad > worst:
            worst, worst_of = bad, who
    check("слабая неделя не превращается в разгром", worst <= ROUT,
          f"худший счёт 1:{worst:.2f}"
          + (f" (ты {worst_of['user_xp']}, Опус {worst_of['bot_xp']})" if worst_of else ""))
    check("на слабой неделе разрыв тоже под потолком", max_lead <= bot.LEAD_CAP, str(max_lead))

    print("\n   слабый темп держится две недели подряд")
    worst2 = 0.0
    for seed in range(24):
        rate = 0.5 + (seed % 5) * 0.1
        conn, res = simulate(seed, 80, weak_week(EVEN_RATE, rate, 21, 14))
        conn.close()
        shutil.rmtree(res["tmp"], ignore_errors=True)
        max_lead = max(max_lead, res["max_lead"])
        worst2 = max(worst2, worst_loss(res["history"])[0])
    check("две слабые недели подряд тоже не разгром", worst2 <= ROUT, f"худший счёт 1:{worst2:.2f}")
    return max(global_lead, max_lead)


def section_spurt(global_lead: int) -> int:
    print("\n3. Сид-симуляция: рывок")
    max_lead = 0
    caught = 0
    for seed in range(12):
        conn, res = simulate(seed, 80, spurt(1.0, 5.0, 24, 10))
        max_lead = max(max_lead, res["max_lead"])
        # После рывка ученик обязан оказаться впереди по нодам.
        if bot.lead(conn, res["last_day"]) < 0:
            caught += 1
        conn.close()
        shutil.rmtree(res["tmp"], ignore_errors=True)
    check("рывок выводит ученика вперёд по нодам", caught >= 10, f"{caught} прогонов из 12")
    check("рывок не ломает потолок разрыва", max_lead <= bot.LEAD_CAP, str(max_lead))
    return max(global_lead, max_lead)


def section_pause(global_lead: int) -> int:
    print("\n4. Сид-симуляция: пауза пять дней")
    ok_abort = ok_rollout = ok_contract = ok_reset = 0
    max_lead = 0
    for seed in range(12):
        conn, res = simulate(seed, 70, with_pause(EVEN_RATE, 30, 5))
        max_lead = max(max_lead, res["max_lead"])
        aborted = [h for h in res["history"] if h["outcome"] == "aborted"]
        row = pace.rollout_row(conn)
        back = (dt.date(2026, 8, 1) + dt.timedelta(days=35)).isoformat()
        if aborted:
            ok_abort += 1
        if row is not None and row["since"] == back and row["gap_days"] >= pace.PAUSE_DAYS:
            ok_rollout += 1
        if pace.contract_caps(conn, back) == (pace.ROLLOUT_QUIZ, pace.ROLLOUT_CARDS):
            ok_contract += 1
        # Темп бота после возвращения обязан быть ниже того, каким шёл до паузы.
        # Смотрим не на поле состояния, а на дневные планы: это то, что реально
        # превращается в закрытые ноды.
        def plans(since: int, until: int) -> float:
            rows = [
                r["plan"] for r in conn.execute(
                    "SELECT plan FROM bot_days WHERE date BETWEEN ? AND ?",
                    ((dt.date(2026, 8, 1) + dt.timedelta(days=since)).isoformat(),
                     (dt.date(2026, 8, 1) + dt.timedelta(days=until)).isoformat()),
                )
            ]
            return sum(rows) / len(rows) if rows else 0.0

        if plans(36, 40) < plans(25, 29):
            ok_reset += 1
        conn.close()
        shutil.rmtree(res["tmp"], ignore_errors=True)
    check("пауза сворачивает сезон в aborted", ok_abort == 12, f"{ok_abort} из 12")
    check("возвращение включает раскатку", ok_rollout == 12, f"{ok_rollout} из 12")
    check("в раскатке контракт это пять вопросов и пять карточек", ok_contract == 12,
          f"{ok_contract} из 12")
    check("темп бота после паузы сброшен", ok_reset == 12, f"{ok_reset} из 12")
    check("во время паузы разрыв тоже под потолком", max_lead <= bot.LEAD_CAP, str(max_lead))
    return max(global_lead, max_lead)


def section_losses() -> None:
    print("\n5. Правило двух поражений подряд")
    after_two: list[float] = []
    normal: list[float] = []
    for seed in range(40):
        conn, res = simulate(seed, 200, even(EVEN_RATE))
        conn.close()
        shutil.rmtree(res["tmp"], ignore_errors=True)
        scored = [h for h in sorted(res["history"], key=lambda h: h["num"])
                  if h["outcome"] in ("win", "loss")]
        for i in range(2, len(scored)):
            two = scored[i - 1]["outcome"] == "loss" and scored[i - 2]["outcome"] == "loss"
            (after_two if two else normal).append(scored[i]["mult"])
    # Диапазоны перекрываются в узкой полосе, поэтому одиночный множитель ничего
    # не доказывает: смотрим и на потолок, и на среднее по всем таким сезонам.
    check("после двух поражений множитель не выходит за опущенный диапазон",
          after_two and max(after_two) <= seasons.MULT_HI_DOWN,
          f"случаев {len(after_two)}, максимум {max(after_two):.3f}" if after_two else "случаев 0")
    mean_two = sum(after_two) / len(after_two) if after_two else 0
    mean_norm = sum(normal) / len(normal) if normal else 0
    check("средний план после двух поражений садится к базе 0.85",
          0.78 <= mean_two <= 0.92 and mean_two < mean_norm,
          f"среднее {mean_two:.3f} против обычного {mean_norm:.3f}")

    # Отдельная точная проверка на стенде, без надежды на случай.
    tmp = Path(tempfile.mkdtemp(prefix="arena-5loss-"))
    try:
        cfg, conn = stand(tmp, 60)
        bot.set_state(conn, user_rate=2.0, losses=0)
        rng = random.Random(1)
        normal = [seasons.start(conn, "2026-08-01", rng)["bot_plan_rate"] for _ in range(1)]
        conn.execute("UPDATE seasons SET outcome = 'loss'")
        bot.set_state(conn, losses=2)
        low = seasons.start(conn, "2026-09-01", rng)["bot_plan_rate"]
        check("план после двух поражений считается от базы 0.85",
              low < normal[0] and low <= 2.0 * seasons.MULT_HI_DOWN,
              f"было {normal[0]}, стало {low}")
        conn.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def section_taunts(with_claude: bool) -> None:
    print("\n6. Пачка реплик Опуса")
    tmp = Path(tempfile.mkdtemp(prefix="arena-5taunt-"))
    try:
        cfg, conn = stand(tmp, 30)
        added = taunts.ensure_pack(conn)
        check("шаблонная пачка ставится при пустой базе", added > 0, f"реплик {added}")
        bad = [(k, line, taunts.rejects(line))
               for k, lines in taunts.TEMPLATES.items() for line in lines
               if taunts.rejects(line)]
        check("шаблоны проходят собственный фильтр", not bad, "; ".join(f"{b[1]}: {b[2]}" for b in bad[:3]))
        kinds = {r["kind"] for r in conn.execute("SELECT DISTINCT kind FROM taunts")}
        check("пачка покрывает все виды событий", kinds == set(taunts.KINDS),
              ", ".join(sorted(set(taunts.KINDS) - kinds)) or "все на месте")

        print("   фильтр запретов")
        planted = [
            ("bot_node", "Ты просто тупишь, вот и всё.", "оценка способностей"),
            ("season_loss", "Лузер, так тебе и надо.", "токсичность или злорадство"),
            ("bot_node", "Тебе нужно 4 ноды в день, иначе не успеешь.", "математика горизонта"),
            ("season_start", "У тебя отставание, догоняй.", "математика горизонта"),
            ("bot_node", "Я закрыл ноду, а ты нет — печаль.", "длинное тире или стрелка"),
            ("bot_node", "Мозгов не хватило на эту тему?", "оценка способностей"),
        ]
        wrong = [(line, taunts.rejects(line), why) for _, line, why in planted
                 if taunts.rejects(line) != why]
        check("подсунутые запрещённые реплики отбиты с Клиент A причиной", not wrong,
              "; ".join(f"{w[0]}: {w[1]}" for w in wrong[:2]))
        stored = [add for kind, line, _ in planted if (add := taunts.add(conn, kind, line, "gen"))]
        check("запрещённая реплика не попадает в базу", not stored, str(len(stored)))

        print("   разбор конверта claude")
        fake = tmp / "fake-claude"
        payload = {
            "bot_node": ["Я закрыл ещё одну, пока ты собирался.", "Ты просто тупой."],
            "season_start": ["Новый сезон, новые счёты. Погнали."],
        }
        # Ответ CLI это конверт, а внутри строка, которую модель любит завернуть
        # в кодовый блок. Стенд повторяет обе обёртки.
        envelope = tmp / "envelope.json"
        envelope.write_text(json.dumps(
            {"type": "result", "subtype": "success", "is_error": False, "num_turns": 1,
             "result": "```json\n" + json.dumps(payload, ensure_ascii=False) + "\n```"},
            ensure_ascii=False), encoding="utf-8")
        fake.write_text(f"#!/bin/sh\ncat {envelope}\n", encoding="utf-8")
        fake.chmod(0o755)
        taunts.CLAUDE_BIN = str(fake)
        report = taunts.refresh(conn, force=True)
        check("двухслойный конверт разобран, годные реплики приняты", report["added"] == 2,
              f"добавлено {report['added']}, отклонено {len(report['rejected'])}")
        check("негодная реплика из ответа модели отклонена",
              any(r[2] == "оценка способностей" for r in report["rejected"]),
              str(report["rejected"][:1]))
        check("отметка о недельной генерации проставлена", taunts.last_refresh(conn) is not None)
        check("сразу после генерации пачка считается свежей", not taunts.due(conn))

        print("   claude недоступен")
        taunts.CLAUDE_BIN = str(tmp / "нет-такого-файла")
        conn.execute("DELETE FROM meta WHERE key = 'taunts_refreshed'")
        broken = taunts.refresh(conn, force=True)
        check("недоступный claude не роняет конвейер", broken["error"] is not None,
              str(broken["error"])[:60])
        check("после неудачи попытка откладывается на сутки", not taunts.due(conn),
              "иначе claude форкается на каждое открытие экрана")
        check("через сутки попытка повторяется",
              taunts.due(conn, (dt.date.today() + dt.timedelta(days=2)).isoformat()))
        line = taunts.pick(conn, "bot_node", random.Random(3))
        check("реплика всё равно выдаётся из шаблонов", bool(line), line)

        if with_claude:
            print("   живая генерация через headless claude")
            taunts.CLAUDE_BIN = "~/.local/bin/claude"
            conn.execute("DELETE FROM meta WHERE key = 'taunts_refreshed'")
            live = taunts.refresh(conn, force=True, timeout=600)
            check("живая пачка сгенерилась", live["added"] > 0,
                  f"добавлено {live['added']}, отклонено {len(live['rejected'])}, "
                  f"беда: {live['error']}")
            asked = live["asked"] or 1
            check("фильтр не выел пачку целиком", live["added"] >= asked * 0.4,
                  f"{live['added']} из {asked} запрошенных")
            for row in conn.execute(
                "SELECT kind, text FROM taunts WHERE source = 'gen' ORDER BY id LIMIT 8"
            ):
                print(f"        [{row['kind']}] {row['text']}")
        conn.commit()
        conn.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def section_campaign() -> None:
    print("\n7. Кампания и чекпоинт 60-го дня")
    conn, res = simulate(101, 70, even(EVEN_RATE))
    try:
        start_day = dt.date(2026, 8, 1)
        check("до старта кампании чекпоинт не тикает",
              campaign_mod.checkpoint(conn, res["last_day"])["due"] is False,
              campaign_mod.checkpoint(conn, res["last_day"]).get("reason", ""))
        campaign_mod.start(conn, start_day.isoformat())
        row = campaign_mod.state(conn)
        check("кампания стартовала с чекпоинтом на 60-й день",
              row["checkpoint_at"] == (start_day + dt.timedelta(days=60)).isoformat(),
              row["checkpoint_at"])
        early = campaign_mod.checkpoint(conn, (start_day + dt.timedelta(days=40)).isoformat())
        check("на сороковой день чекпоинта ещё нет", not early["due"], early.get("reason", ""))

        day60 = (start_day + dt.timedelta(days=60)).isoformat()
        cp = campaign_mod.checkpoint(conn, day60)
        check("на шестидесятый день чекпоинт открыт", cp["due"], str(cp.get("reason", "")))
        check("сначала итог построенного, потом ветки", cp["sections"] == ["built", "branches"],
              str(cp["sections"]))
        check("итог построенного не пустой",
              cp["built"]["nodes_closed"] > 0 and cp["built"]["xp_total"] > 0,
              f"нод {cp['built']['nodes_closed']}, XP {cp['built']['xp_total']}")
        check("веток ровно три и все равноправные",
              [b["months"] for b in cp["branches"]] == [6, 9, 12],
              str([b["months"] for b in cp["branches"]]))
        check("у каждой ветки назван требуемый темп в нодах",
              all(b["need_rate"] > 0 for b in cp["branches"]))
        chosen = [b for b in cp["branches"] if b["selected"]]
        check("предвыбрана ровно одна ветка", len(chosen) == 1,
              str([b["months"] for b in chosen]))
        check("предвыбор соответствует фактическому темпу",
              chosen[0]["months"] == campaign_mod.preselect(cp["rate"]),
              f"темп {cp['rate']}, ветка {chosen[0]['months']}")
        check("во фрейме нет ни упрёка, ни процентов",
              "отстава" not in cp["frame"].lower() and "процент" not in cp["frame"].lower()
              and "%" not in cp["frame"], cp["frame"])

        eta = campaign_mod.eta(conn, day60)
        check("строка ETA это дата, а не проценты",
              eta["known"] and re.search(r"финиш примерно к [а-яё]+ \d{4}$", eta["text"]),
              eta["text"])

        xp_before = conn.execute("SELECT COALESCE(SUM(amount), 0) FROM xp_ledger").fetchone()[0]
        seasons_before = conn.execute("SELECT COUNT(*) FROM seasons").fetchone()[0]
        campaign_mod.choose(conn, 9, day60)
        row = campaign_mod.state(conn)
        xp_after = conn.execute("SELECT COALESCE(SUM(amount), 0) FROM xp_ledger").fetchone()[0]
        check("выбор ветки двигает срок кампании",
              row["target_days"] == 270 and row["branch_months"] == 9,
              f"{row['target_days']} дней, ветка {row['branch_months']}")
        check("выбор ветки не трогает XP и историю",
              xp_after == xp_before
              and conn.execute("SELECT COUNT(*) FROM seasons").fetchone()[0] == seasons_before)
        check("после выбора чекпоинт закрыт",
              not campaign_mod.checkpoint(conn, day60)["due"])
    finally:
        conn.close()
        shutil.rmtree(res["tmp"], ignore_errors=True)


BANNED = ("отстава", "процент")


def section_server() -> None:
    print("\n8. Сервер, экран Сезон и запреты в текстах")
    conn, res = simulate(202, 70, even(EVEN_RATE))
    cfg = res["cfg"]
    campaign_mod.start(conn, dt.date(2026, 8, 1).isoformat())
    conn.close()

    env = dict(os.environ)
    env.update({"ARENA_ENV": "dev", "ARENA_STATE_DIR": str(cfg.state_dir),
                "PYTHONPATH": str(PROJECT)})
    server = subprocess.Popen(
        [sys.executable, "-m", "arena", "serve", "--port", str(PORT)],
        cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    client = httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=20.0)
    try:
        up = False
        for _ in range(80):
            try:
                client.get("/api/season", timeout=1.0)
                up = True
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.25)
        check("сервер поднялся", up)

        board = client.get("/api/season").json()
        check("экран Сезон получает счёт и ленту",
              "season" in board and "feed" in board and "history" in board,
              ", ".join(sorted(board.keys()))[:80])
        check("в ответе есть обе стороны счёта",
              board["user"]["nodes"] >= 0 and board["bot"]["nodes"] >= 0,
              f"ты {board['user']['nodes']}, Опус {board['bot']['nodes']}")

        camp = client.get("/api/campaign").json()
        check("кампания отдаётся с чекпоинтом", "checkpoint" in camp and camp["started"])
        eta = client.get("/api/campaign/eta").json()
        check("ETA отдаётся отдельным полем для карты", "eta_text" in eta and eta["eta_text"],
              eta["eta_text"])
        check("на экране Сезон ETA не появляется",
              "финиш примерно" not in json.dumps(board, ensure_ascii=False))

        print("   кампания стартует только из своего профиля")
        cross = client.post("/api/campaign/start", json={"env": "prod"})
        check("команда из чужого профиля кампанию не начинает", cross.status_code == 409,
              f"код {cross.status_code}")
        own = client.post("/api/campaign/start", json={"env": "dev"})
        check("своя команда проходит", own.status_code == 200, str(own.status_code))
        check("в интерфейсе кнопки старта кампании нет",
              "campaign/start" not in (PROJECT / "static" / "season.js").read_text(encoding="utf-8"))

        feed = client.get("/api/bot/feed?limit=5").json()
        check("лента Опуса отдаётся", isinstance(feed, list) and len(feed) > 0, str(len(feed)))

        page = client.get("/season")
        check("страница Сезон отдаётся", page.status_code == 200 and "arenaSeason" in page.text)
        assets = [client.get("/static/season.js"), client.get("/static/season.css")]
        check("статика экрана Сезон отдаётся", all(a.status_code == 200 for a in assets))
        check("внешних ссылок на странице Сезон нет",
              "http://" not in page.text and "https://" not in page.text)

        print("   запретные слова в ответах API")
        blobs = {}
        for path in ("/api/season", "/api/campaign", "/api/campaign/eta",
                     "/api/campaign/checkpoint", "/api/bot/feed", "/api/today", "/api/taunts"):
            blobs[path] = json.dumps(client.get(path).json(), ensure_ascii=False).lower()
        hits = [f"{p}: {w}" for p, blob in blobs.items() for w in BANNED if w in blob]
        check("слова «отставание» и «процент» в API нет", not hits, "; ".join(hits[:3]))
        pct = [p for p, blob in blobs.items() if "%" in blob]
        check("знака процента в ответах API нет", not pct, ", ".join(pct))

        print("   запретные слова во фронте")
        front_hits = []
        pct_hits = []
        for name in sorted(p.name for p in (PROJECT / "static").glob("*")
                           if p.suffix in (".html", ".js", ".css")):
            text = visible_text(name, (PROJECT / "static" / name).read_text(encoding="utf-8"))
            front_hits += [f"{name}: {w}" for w in BANNED if w in text.lower()]
            # Знак доли ищем в разметке и скриптах экрана гонки: там он мог бы
            # означать только проценты от нужного темпа, а это запрещено разделом 9.
            # Стили не смотрим: там проценты это единица длины, а не текст.
            if name.startswith("season.") and name.endswith((".js", ".html")) and "%" in text:
                pct_hits.append(name)
        check("во фронте слов «отставание» и «процент» нет", not front_hits,
              "; ".join(front_hits[:3]))
        check("на экране Сезон нет знака доли", not pct_hits, ", ".join(pct_hits))
    finally:
        server.send_signal(signal.SIGTERM)
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
        client.close()
        shutil.rmtree(res["tmp"], ignore_errors=True)


def race_fixture(tmp: Path, back: int = 3):
    """Стенд под гонку тактов: история до сегодня, но такт докручен только
    до позавчера. Любой следующий такт обязан прокрутить несколько полных дней."""
    cfg, conn = stand(tmp, 200)
    today = dt.date.today()
    # Число нод в день обязано скакать. При ровных двух нодах EMA стоит
    # в неподвижной точке (0.2*2 + 0.8*2 = 2), и двойная прокрутка дня
    # ничего не меняет: проверка молча перестала бы что-либо проверять.
    for i in range(12, -1, -1):
        day = (today - dt.timedelta(days=i)).isoformat()
        live_day(conn, day, 1 + (i * 3) % 5)
    seasons.heartbeat(
        conn, at=dt.datetime.combine(today - dt.timedelta(days=back), dt.time(23, 30)),
        present=True, rng=random.Random(5))
    conn.commit()
    return cfg, conn


def section_race() -> None:
    """Такт гонки зовут сразу из нескольких мест, и экран Сезон тянет две ручки
    разом. Последовательная приёмка такую драку структурно не увидит."""
    print("\n9. Два такта одновременно не портят счёт")
    solo_tmp = Path(tempfile.mkdtemp(prefix="arena-5solo-"))
    try:
        _, solo = race_fixture(solo_tmp)
        seasons.heartbeat(solo, present=True, rng=random.Random(5))
        want_rate = float(bot.peek(solo)["user_rate"])
        want_days = solo.execute("SELECT COUNT(*) FROM bot_days").fetchone()[0]
        solo.close()
    finally:
        shutil.rmtree(solo_tmp, ignore_errors=True)

    # Сначала лобовая драка: четыре такта стартуют по барьеру, чтобы наложение
    # было гарантированным, а не «как повезёт с таймингом» через HTTP.
    head_tmp = Path(tempfile.mkdtemp(prefix="arena-5head-"))
    try:
        cfg, prep = race_fixture(head_tmp)
        prep.close()
        gate = threading.Barrier(4)
        errors: list[str] = []

        def beat_now() -> None:
            conn = db_mod.connect(cfg, create=False)
            try:
                gate.wait(timeout=15)
                seasons.heartbeat(conn, present=True, rng=random.Random(5))
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{type(exc).__name__}: {exc}")
            finally:
                conn.close()

        crowd = [threading.Thread(target=beat_now) for _ in range(4)]
        for t in crowd:
            t.start()
        for t in crowd:
            t.join()
        after = db_mod.connect(cfg, create=False)
        head_rate = float(bot.peek(after)["user_rate"])
        after.close()
        check("четыре такта по барьеру не спорят за базу", not errors, "; ".join(errors[:2]))
        check("темп ученика после лобовой драки такой же, как в одиночку",
              abs(head_rate - want_rate) < 1e-9,
              f"поодиночке {want_rate}, вчетвером {head_rate}")
    finally:
        shutil.rmtree(head_tmp, ignore_errors=True)

    tmp = Path(tempfile.mkdtemp(prefix="arena-5race-"))
    server = None
    try:
        cfg, conn = race_fixture(tmp)
        conn.close()
        env = dict(os.environ)
        env.update({"ARENA_ENV": "dev", "ARENA_STATE_DIR": str(cfg.state_dir),
                    "PYTHONPATH": str(PROJECT)})
        server = subprocess.Popen(
            [sys.executable, "-m", "arena", "serve", "--port", str(PORT)],
            cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        client = httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=30.0)
        for _ in range(80):
            try:
                client.get("/api/campaign", timeout=1.0)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.25)

        codes: list[int] = []
        lock = threading.Lock()

        def hit(path: str) -> None:
            try:
                res = client.get(path)
                code = res.status_code
            except Exception:  # noqa: BLE001
                code = -1
            with lock:
                codes.append(code)

        # Ровно то, что делает экран Сезон при загрузке, плюс экран Сегодня.
        threads = [threading.Thread(target=hit, args=(p,))
                   for p in ("/api/season", "/api/campaign", "/api/today",
                             "/api/season", "/api/campaign", "/api/today")]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        check("одновременные такты не роняют сервер", all(c == 200 for c in codes), str(codes))

        after = db_mod.connect(cfg, create=False)
        got_rate = float(bot.peek(after)["user_rate"])
        got_days = after.execute("SELECT COUNT(*) FROM bot_days").fetchone()[0]
        dup_days = after.execute(
            "SELECT COUNT(*) FROM (SELECT date FROM bot_days GROUP BY date HAVING COUNT(*) > 1)"
        ).fetchone()[0]
        dup_seasons = after.execute(
            "SELECT COUNT(*) FROM (SELECT num FROM seasons GROUP BY num HAVING COUNT(*) > 1)"
        ).fetchone()[0]
        after.close()
        check("EMA прокручена ровно по одному разу на день", abs(got_rate - want_rate) < 1e-9,
              f"поодиночке {want_rate}, наперегонки {got_rate}")
        check("дней у бота столько же, сколько при одиночном такте", got_days == want_days,
              f"{got_days} против {want_days}")
        check("дубля дня и дубля сезона не появилось", dup_days == 0 and dup_seasons == 0,
              f"дней {dup_days}, сезонов {dup_seasons}")
        client.close()
    finally:
        if server is not None:
            server.send_signal(signal.SIGTERM)
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
        shutil.rmtree(tmp, ignore_errors=True)


def section_prod() -> None:
    print("\n10. Боевая база не тронута (правило 14.4)")
    real = config_mod.load(env="prod")
    prod_guard = prodguard.snapshot(real)
    if not real.db_path.exists():
        print("        боевой базы нет, проверка пропущена")
        return
    prod = sqlite3.connect(f"file:{real.db_path}?mode=ro", uri=True)
    dirty = []
    # taunts тут нет намеренно: пачка реплик это контент, как импортированный банк
    # вопросов, а не прогресс ученика и не состояние гонки. Она засевается шаблонами
    # при первом обращении к экрану Сезон и ничего про занятия не рассказывает.
    for table in ("attempts", "days", "xp_ledger", "bot_events", "seasons", "bot_days"):
        try:
            n = prod.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        except sqlite3.OperationalError:
            continue
        if n:
            dirty.append(f"{table}={n}")
    started = prod.execute("SELECT COUNT(*) FROM campaign WHERE start_date IS NOT NULL").fetchone()[0]
    prod.close()
    prodguard.verify(prod_guard, check)

def visible_text(name: str, text: str) -> str:
    """Убрать комментарии: запрет раздела 9 про слова это запрет на то, что видит
    ученик, а не на то, чем разработчик объясняет себе код."""
    if name.endswith(".js"):
        text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
        text = re.sub(r"(?m)^\s*//.*$", " ", text)
    elif name.endswith(".html"):
        text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description="приёмка фазы 5")
    parser.add_argument("--claude", action="store_true",
                        help="дополнительно сгенерировать живую пачку реплик через claude")
    args = parser.parse_args()

    for name in [k for k in os.environ if k.startswith("ARENA_")]:
        del os.environ[name]
    os.environ["ARENA_ENV"] = "dev"
    real = config_mod.load(env="prod")
    prod_mtime = real.db_path.stat().st_mtime_ns if real.db_path.exists() else None

    started = time.time()
    lead = section_balance()
    lead = section_weak(lead)
    lead = section_spurt(lead)
    lead = section_pause(lead)
    print("\n   сводно по всем профилям")
    check("разрыв в нодах нигде не больше 15", lead <= 15, f"максимум {lead}")
    section_losses()
    section_taunts(args.claude)
    section_campaign()
    section_server()
    for attempt in range(3):
        # Гонка тактов зависит от таймингов, поэтому повторяем.
        section_race()
    section_prod()
    if prod_mtime is not None:
        check("боевая база не менялась по времени",
              real.db_path.stat().st_mtime_ns == prod_mtime)

    print(f"\nитого: пройдено {PASSED}, провалено {len(FAILED)}, "
          f"время {time.time() - started:.0f} секунд")
    for name in FAILED:
        print(f"  провал: {name}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
