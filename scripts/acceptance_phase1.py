#!/usr/bin/env python3
"""Приёмка фазы 1. Гоняется одной командой, ничего не трогает в боевом стейте.

    .venv/bin/python scripts/acceptance_phase1.py

Работает на временной копии роадмапа и на временной базе, поэтому негативные
тесты (чекбокс закрытия, пропавшая нода) можно ставить прямо в файлы копии.
"""

from __future__ import annotations

import dataclasses
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

import prodguard  # noqa: E402
from arena import config as config_mod  # noqa: E402
from arena import db as db_mod  # noqa: E402
from arena import migrations  # noqa: E402
from arena.importers import jsliteral  # noqa: E402
from arena.importers import html_tests, jcards  # noqa: E402
from arena.roadmap import mark_hub_checkbox, sync as sync_roadmap  # noqa: E402

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


def schema_shape(conn: sqlite3.Connection) -> dict:
    """Форма схемы: таблицы, колонки и индексы. Порядок колонок игнорируем,
    ALTER TABLE дописывает их в конец, и позиционное сравнение врало бы."""
    shape: dict = {}
    tables = [
        r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    ]
    for table in sorted(tables):
        shape[table] = {
            r[1]: (r[2].upper(), r[3], r[4], r[5])
            for r in conn.execute(f"PRAGMA table_info({table})")
        }
    shape["#индексы"] = sorted(
        r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
        )
    )
    return shape


def shape_diff(fresh: dict, other: dict) -> list[str]:
    problems = []
    for table in sorted(set(fresh) | set(other)):
        if table == "#индексы":
            missing = set(fresh[table]) - set(other[table])
            extra = set(other[table]) - set(fresh[table])
            if missing:
                problems.append(f"нет индексов: {', '.join(sorted(missing))}")
            if extra:
                problems.append(f"лишние индексы: {', '.join(sorted(extra))}")
            continue
        if table not in other:
            problems.append(f"нет таблицы {table}")
            continue
        if table not in fresh:
            problems.append(f"лишняя таблица {table}")
            continue
        for col in sorted(set(fresh[table]) | set(other[table])):
            a, b = fresh[table].get(col), other[table].get(col)
            if a != b:
                problems.append(f"{table}.{col}: в схеме {a}, в базе {b}")
    return problems


def sandbox_config(state_dir: Path, vault: Path) -> config_mod.Config:
    os.environ["ARENA_STATE_DIR"] = str(state_dir)
    os.environ["ARENA_VAULT"] = str(vault)
    os.environ["ARENA_ROADMAP_DIR"] = str(vault / config_mod.ROADMAP_SUBDIR)
    os.environ["ARENA_WRITE_VAULT"] = "0"
    return config_mod.load(env="dev")


def main() -> int:
    # Боевые пути считаем до того, как выставим переменные песочницы, и без
    # влияния того, что уже висит в окружении.
    for name in [k for k in os.environ if k.startswith("ARENA_")]:
        del os.environ[name]
    real = config_mod.load(env="prod")
    prod_guard = prodguard.snapshot(real)
    if not real.roadmap_dir.is_dir():
        print(f"нет роадмапа: {real.roadmap_dir}")
        return 2

    tmp = Path(tempfile.mkdtemp(prefix="arena-acceptance-"))
    try:
        vault = tmp / "vault"
        (vault).mkdir()
        shutil.copytree(real.roadmap_dir, vault / config_mod.ROADMAP_SUBDIR)
        cfg = sandbox_config(tmp / "state", vault)
        conn = db_mod.init(cfg)

        print("\n1. Первый sync")
        r1 = sync_roadmap(conn, cfg)
        stages = conn.execute("SELECT COUNT(*) FROM stages").fetchone()[0]
        nodes = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        check("этапов 26", stages == 26, str(stages))
        check("нод 1075", nodes == 1075, str(nodes))
        check("предупреждений нет", not r1.warnings, "; ".join(r1.warnings[:3]))
        no_kind = conn.execute("SELECT COUNT(*) FROM nodes WHERE kind IS NULL OR kind = ''").fetchone()[0]
        check("у всех нод есть тип", no_kind == 0, f"без типа {no_kind}")
        with_path = conn.execute("SELECT COUNT(*) FROM nodes WHERE obsidian_path IS NOT NULL").fetchone()[0]
        check("конспекты у этапов 1-3: 157", with_path == 157, str(with_path))
        avail = conn.execute(
            "SELECT COUNT(*) FROM nodes n JOIN stages s ON s.id=n.stage_id "
            "WHERE n.status='available' AND s.num=1"
        ).fetchone()[0]
        locked_first = conn.execute(
            "SELECT COUNT(*) FROM nodes n JOIN stages s ON s.id=n.stage_id "
            "WHERE n.status!='locked' AND s.num!=1"
        ).fetchone()[0]
        check("этап 1 открыт, остальное закрыто", avail == 29 and locked_first == 0,
              f"available в этапе 1: {avail}, не-locked вне этапа 1: {locked_first}")
        track = conn.execute(
            "SELECT COUNT(*) FROM nodes n JOIN stages s ON s.id=n.stage_id WHERE s.in_track=1"
        ).fetchone()[0]
        check("в траектории 718 нод", track == 718, str(track))

        print("\n2. Повторный sync идемпотентен")
        r2 = sync_roadmap(conn, cfg)
        check("ничего не добавлено и не обновлено", r2.changed == 0,
              f"added {r2.nodes_added}, updated {r2.nodes_updated}")
        check("все ноды без изменений", r2.nodes_unchanged == 1075, str(r2.nodes_unchanged))

        print("\n3. Негативный тест: закрытая нода с чекбоксом [x]")
        conn.execute("UPDATE nodes SET status='closed', closed_at='2026-07-29' WHERE code='1.05'")
        conn.commit()
        hub = vault / config_mod.ROADMAP_SUBDIR / "Этап 01 Старт" / "_Этап 01 Старт.md"
        text = hub.read_text(encoding="utf-8")
        marked = text.replace("- [ ] [[1.05", "- [x] [[1.05", 1)
        check("чекбокс в копии хаба переставлен", marked != text)
        hub.write_text(marked, encoding="utf-8")
        r3 = sync_roadmap(conn, cfg)
        row = conn.execute("SELECT status FROM nodes WHERE code='1.05'").fetchone()
        total = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        check("нода 1.05 на месте", row is not None)
        check("статус closed не сброшен", row and row["status"] == "closed", row["status"] if row else "нет ноды")
        check("нод по-прежнему 1075", total == 1075, str(total))
        check("sync не увидел изменений", r3.changed == 0, f"changed {r3.changed}")

        print("\n4. Негативный тест: нода пропала из хаба")
        text = hub.read_text(encoding="utf-8")
        lines = [ln for ln in text.splitlines(keepends=True) if "[[1.07" not in ln]
        hub.write_text("".join(lines), encoding="utf-8")
        r4 = sync_roadmap(conn, cfg)
        row = conn.execute("SELECT status FROM nodes WHERE code='1.07'").fetchone()
        check("пропавшая нода не удалена", row is not None)
        check("про пропажу есть предупреждение", any("1.07" in w for w in r4.warnings),
              "; ".join(r4.warnings[:2]))
        hub.write_text(text, encoding="utf-8")
        sync_roadmap(conn, cfg)

        print("\n4б. Негативный тест: чужой код в хабе не угоняет ноду")
        text = hub.read_text(encoding="utf-8")
        stolen = text.replace(
            "- [ ] [[1.07", "- [ ] [[3.05 Подделка]] : чужая строка (тема)\n- [ ] [[1.07", 1
        )
        hub.write_text(stolen, encoding="utf-8")
        r5 = sync_roadmap(conn, cfg)
        row = conn.execute(
            "SELECT n.title, s.num FROM nodes n JOIN stages s ON s.id = n.stage_id WHERE n.code = '3.05'"
        ).fetchone()
        check("нода 3.05 осталась в своём этапе", row is not None and row["num"] == 3,
              f"этап {row['num'] if row else '-'}, название {row['title'] if row else '-'}")
        check("название чужой строкой не затёрто", row and row["title"] != "Подделка", row["title"] if row else "-")
        check("про чужой код есть предупреждение", any("3.05" in w for w in r5.warnings),
              "; ".join(r5.warnings[:2]))
        hub.write_text(text, encoding="utf-8")
        sync_roadmap(conn, cfg)

        print("\n4в. Переномерация этапа: прогресс едет за содержимым, не за кодом")
        conn.execute("UPDATE nodes SET status='closed', closed_at='2026-07-29' "
                     "WHERE code IN ('5.04','5.05','5.06')")
        conn.commit()
        before_titles = {
            r["code"]: r["title"]
            for r in conn.execute("SELECT code, title FROM nodes WHERE code LIKE '5.%'")
        }
        hub5 = vault / config_mod.ROADMAP_SUBDIR / "Этап 05 Исключения" / "_Этап 05 Исключения.md"
        hub5_text = hub5.read_text(encoding="utf-8")

        def shifted(line: str) -> str:
            m = re.match(r"^\s*-\s*\[[ xX]\]\s*\[\[5\.(\d+)\s", line)
            if not m or int(m.group(1)) < 4:
                return line
            return re.sub(r"\[\[5\.\d+ ", f"[[5.{int(m.group(1)) + 1:02d} ", line, count=1)

        moved_lines = [shifted(ln) for ln in hub5_text.splitlines(keepends=True)]
        for i, ln in enumerate(moved_lines):
            if "[[5.05 " in ln:
                moved_lines.insert(i, "- [ ] [[5.04 Свежая вставленная нода]] : новая тема (тема)\n")
                break
        hub5.write_text("".join(moved_lines), encoding="utf-8")
        r6 = sync_roadmap(conn, cfg)
        after = {
            r["code"]: (r["title"], r["status"])
            for r in conn.execute("SELECT code, title, status FROM nodes WHERE code LIKE '5.%'")
        }
        tail_ok = all(
            after.get(f"5.{int(code.split('.')[1]) + 1:02d}", ("", ""))[0] == title
            for code, title in before_titles.items() if int(code.split(".")[1]) >= 4
        )
        closed_now = {t for t, s in after.values() if s == "closed"}
        expected_closed = {before_titles[c] for c in ("5.04", "5.05", "5.06")}
        inserted = after.get("5.04")
        check("хвост этапа переехал на новые коды", tail_ok)
        check("закрытые ноды остались закрытыми по содержимому", closed_now == expected_closed,
              f"стало закрыто: {len(closed_now)}")
        check("вставленная нода не унаследовала чужой прогресс",
              inserted is not None and inserted[0] == "Свежая вставленная нода"
              and inserted[1] != "closed", str(inserted))
        check("про переномерацию сказано вслух", any("переномерован" in w for w in r6.warnings),
              next((w for w in r6.warnings if "переномерован" in w), "нет"))
        r7 = sync_roadmap(conn, cfg)
        check("после переезда sync снова идемпотентен", r7.changed == 0, f"changed {r7.changed}")
        hub5.write_text(hub5_text, encoding="utf-8")
        sync_roadmap(conn, cfg)
        conn.execute("UPDATE nodes SET status='locked', closed_at=NULL WHERE code LIKE '5.%'")
        conn.commit()

        print("\n5. Зеркало чекбокса пишет только в раздел нод")
        writable = dataclasses.replace(cfg, write_vault=True)
        hub2 = vault / config_mod.ROADMAP_SUBDIR / "Этап 02 Синтаксис" / "_Этап 02 Синтаксис.md"
        before = hub2.read_text(encoding="utf-8").splitlines()
        # 2.69 встречается дважды: в разделе нод и в чек-листе критериев ниже.
        twice = [i for i, ln in enumerate(before) if "[[2.69" in ln]
        wrote = mark_hub_checkbox(writable, conn, "2.69", True)
        after = hub2.read_text(encoding="utf-8").splitlines()
        touched = [i for i in range(len(before)) if before[i] != after[i]]
        check("ловушка на месте: строка 2.69 в файле дважды", len(twice) == 2, str(twice))
        check("чекбокс переставлен", wrote)
        check("изменена ровно одна строка", len(touched) == 1, str(touched))
        check("изменена строка из раздела нод", touched and touched[0] == min(twice),
              f"тронута {touched[0] if touched else '-'}, раздел нод {min(twice)}")
        check("повторная отметка ничего не пишет", mark_hub_checkbox(writable, conn, "2.69", False) is True
              and mark_hub_checkbox(writable, conn, "2.69", False) is False)
        check("в песочнице волт не трогается", mark_hub_checkbox(cfg, conn, "2.69", True) is False)
        check("файл вернулся в исходное состояние",
              hub2.read_text(encoding="utf-8").splitlines() == before)

        print("\n6. Импорт HTML-тестов и карточек")
        rep = html_tests.run(conn, cfg, archive=False)
        quizzes = conn.execute("SELECT COUNT(*) FROM items WHERE type='quiz'").fetchone()[0]
        check("вопросов больше 1300", quizzes >= 1300, str(quizzes))
        check("все 14 файлов разобраны", rep.files == 14, str(rep.files))
        bad = conn.execute(
            "SELECT COUNT(*) FROM items WHERE type='quiz' AND ("
            "json_extract(payload,'$.q') IS NULL OR json_extract(payload,'$.ans') IS NULL "
            "OR json_array_length(json_extract(payload,'$.opts')) < 2)"
        ).fetchone()[0]
        check("payload всех вопросов валиден", bad == 0, f"битых {bad}")
        src_cards = 0
        if real.jcards_db.exists():
            src = sqlite3.connect(f"file:{real.jcards_db}?mode=ro", uri=True)
            src_cards = src.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
            src.close()
        crep = jcards.run(conn, cfg)
        cards = conn.execute("SELECT COUNT(*) FROM items WHERE type='card'").fetchone()[0]
        states = conn.execute("SELECT COUNT(*) FROM card_state").fetchone()[0]
        check("карточки перенесены все до одной", cards == src_cards,
              f"в jcards {src_cards}, в arena {cards}")
        check("у каждой карточки есть SM-2 состояние", states == cards, f"{states} из {cards}")
        ease_ok = conn.execute("SELECT COUNT(*) FROM card_state WHERE ease IS NULL OR due IS NULL").fetchone()[0]
        check("SM-2 поля перенесены", ease_ok == 0, f"пустых {ease_ok}")
        check("миграция прочитала весь jcards", crep.read == src_cards, str(crep.read))

        print("\n7. Повторный импорт не плодит дублей")
        html_tests.run(conn, cfg, archive=False)
        jcards.run(conn, cfg)
        quizzes2 = conn.execute("SELECT COUNT(*) FROM items WHERE type='quiz'").fetchone()[0]
        cards2 = conn.execute("SELECT COUNT(*) FROM items WHERE type='card'").fetchone()[0]
        states2 = conn.execute("SELECT COUNT(*) FROM card_state").fetchone()[0]
        check("вопросов столько же", quizzes2 == quizzes, f"было {quizzes}, стало {quizzes2}")
        check("карточек столько же", cards2 == cards, f"было {cards}, стало {cards2}")
        check("состояний столько же", states2 == states, f"было {states}, стало {states2}")

        print("\n8. Связность банка")
        orphan = conn.execute(
            "SELECT COUNT(*) FROM items i LEFT JOIN nodes n ON n.id = i.node_id "
            "WHERE i.node_id IS NOT NULL AND n.id IS NULL"
        ).fetchone()[0]
        check("нет вопросов на несуществующих нодах", orphan == 0, str(orphan))
        mismatch = conn.execute(
            "SELECT COUNT(*) FROM items i JOIN nodes n ON n.id = i.node_id "
            "WHERE i.stage_id IS NOT NULL AND i.stage_id != n.stage_id"
        ).fetchone()[0]
        check("этап вопроса совпадает с этапом ноды", mismatch == 0, str(mismatch))
        blocks = conn.execute(
            "SELECT COUNT(*) FROM (SELECT node_id FROM items WHERE type='quiz' AND node_id IS NOT NULL "
            "GROUP BY node_id HAVING COUNT(*) >= 10)"
        ).fetchone()[0]
        check("есть ноды с готовым блоком из 10 вопросов", blocks >= 10, f"нод с блоком: {blocks}")

        print("\n9. Разбор JS выдерживает битый файл и суррогаты")
        sample = next(iter(sorted(real.downloads_dir.glob("Тест Java - *.html"))), None)
        if sample is None:
            print("        файлов тестов нет, проверка пропущена")
        else:
            raw = sample.read_text(encoding="utf-8", errors="replace")
            whole = jsliteral.parse_array(raw)
            # Ломаем один объект в середине массива: остальные обязаны уцелеть.
            marker = raw.index("{n:40,") if "{n:40," in raw else raw.index("{n:")
            broken = raw[:marker] + "{n:40,lvl:@@@}," + raw[marker:]
            failed = False
            try:
                jsliteral.parse_array(broken)
            except Exception:  # noqa: BLE001
                failed = True
            salvaged, lost = jsliteral.parse_objects(broken)
            check("строгий разбор падает на битом объекте", failed)
            check("аварийный разбор спасает почти всё",
                  len(salvaged) >= len(whole) - 2 and lost >= 1,
                  f"было {len(whole)}, спасено {len(salvaged)}, пропущено {lost}")
            pair = jsliteral.Scanner('"\\ud83d\\ude00 и хвост \\udc00"').string()
            check("суррогатная пара склеивается, одиночка не роняет импорт",
                  pair.startswith("\U0001F600") and pair.endswith("?"), repr(pair))

        print("\n10. Версия схемы и миграции")
        ver = conn.execute("PRAGMA user_version").fetchone()[0]
        check("свежая база сразу на целевой версии", ver == migrations.TARGET_VERSION,
              f"{ver} из {migrations.TARGET_VERSION}")
        check("повторная миграция ничего не делает", migrations.apply(conn) == [])
        cols = {r[1] for r in conn.execute("PRAGMA table_info(nodes)")}
        check("в nodes есть entered_at для правила текущей ноды", "entered_at" in cols)
        acols = {r[1] for r in conn.execute("PRAGMA table_info(attempts)")}
        check("в attempts есть node_id и kind", {"node_id", "kind"} <= acols)
        conn.execute(
            "INSERT INTO gen_queue(node_id, stage_id, kind, status, created) "
            "VALUES (1, NULL, 'quiz', 'pending', '2026-07-29')"
        )
        try:
            conn.execute(
                "INSERT INTO gen_queue(node_id, stage_id, kind, status, created) "
                "VALUES (1, NULL, 'quiz', 'pending', '2026-07-29')"
            )
            dup_blocked = False
        except sqlite3.IntegrityError:
            dup_blocked = True
        conn.execute("DELETE FROM gen_queue")
        conn.commit()
        check("очередь генерации не принимает дубль живого задания", dup_blocked)

        # База старого вида с данными обязана мигрировать, а не упасть на индексе
        # по колонке, которой в ней ещё нет.
        old_dir = tmp / "old-state"
        old_dir.mkdir()
        old = sqlite3.connect(old_dir / "state.db")
        old.executescript(
            "CREATE TABLE stages (id INTEGER PRIMARY KEY, num INTEGER NOT NULL UNIQUE,"
            " title TEXT NOT NULL, hub_path TEXT NOT NULL, in_track INTEGER NOT NULL DEFAULT 0);"
            "CREATE TABLE nodes (id INTEGER PRIMARY KEY, stage_id INTEGER NOT NULL REFERENCES stages(id),"
            " code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, kind TEXT NOT NULL, obsidian_path TEXT,"
            " descr TEXT, seq INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'locked', closed_at TEXT);"
            "CREATE TABLE attempts (id INTEGER PRIMARY KEY, item_id INTEGER, ts TEXT NOT NULL,"
            " correct INTEGER, result TEXT, xp INTEGER NOT NULL DEFAULT 0);"
            "CREATE TABLE xp_ledger (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, amount INTEGER NOT NULL,"
            " reason TEXT NOT NULL, ref_type TEXT, ref_id INTEGER);"
            "CREATE TABLE gen_queue (id INTEGER PRIMARY KEY, node_id INTEGER, stage_id INTEGER,"
            " kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,"
            " retry_after TEXT, created TEXT NOT NULL, done_at TEXT, error TEXT);"
            "CREATE TABLE bosses (id INTEGER PRIMARY KEY, stage_id INTEGER NOT NULL REFERENCES stages(id),"
            " attempt_no INTEGER NOT NULL, ts TEXT NOT NULL, questions TEXT, score REAL, time_sec INTEGER,"
            " rank TEXT, passed INTEGER NOT NULL DEFAULT 0);"
            "CREATE TABLE defenses (id INTEGER PRIMARY KEY,"
            " ref_type TEXT NOT NULL CHECK (ref_type IN ('boss', 'tz')), ref_id INTEGER NOT NULL,"
            " questions TEXT, answers TEXT, grade TEXT, xp INTEGER NOT NULL DEFAULT 0, ts TEXT NOT NULL);"
            "INSERT INTO stages(num, title, hub_path) VALUES (1, 'Старт', 'x.md');"
            "INSERT INTO nodes(stage_id, code, title, kind, seq, status)"
            " VALUES (1, '1.01', 'Старая нода', 'тема', 1, 'closed');"
            "INSERT INTO defenses(ref_type, ref_id, ts) VALUES ('boss', 1, '2026-07-01');"
        )
        old.commit()
        old.close()
        old_cfg = dataclasses.replace(cfg, state_dir=old_dir, db_path=old_dir / "state.db")
        migrated = db_mod.init(old_cfg)
        ver_old = migrated.execute("PRAGMA user_version").fetchone()[0]
        kept_node = migrated.execute("SELECT status FROM nodes WHERE code='1.01'").fetchone()
        kept_def = migrated.execute("SELECT COUNT(*) FROM defenses").fetchone()[0]
        field_ok = True
        try:
            migrated.execute(
                "INSERT INTO defenses(ref_type, ref_id, ts) VALUES ('field', 1, '2026-07-29')"
            )
        except sqlite3.IntegrityError:
            field_ok = False
        # Общая защита от дрейфа: если фаза допишет колонку в schema.sql и забудет шаг
        # миграции, свежая база и мигрированная разъедутся, и это видно здесь.
        fresh_dir = tmp / "fresh-state"
        fresh_dir.mkdir()
        fresh_conn = db_mod.init(dataclasses.replace(
            cfg, state_dir=fresh_dir, db_path=fresh_dir / "state.db"))
        fresh_shape = schema_shape(fresh_conn)
        fresh_conn.close()
        drift = shape_diff(fresh_shape, schema_shape(migrated))
        check("мигрированная база совпадает по форме со свежей", not drift, "; ".join(drift[:3]))
        if real.db_path.exists():
            prod_copy_dir = tmp / "prod-copy"
            prod_copy_dir.mkdir()
            shutil.copy2(real.db_path, prod_copy_dir / "state.db")
            prod_conn = db_mod.init(dataclasses.replace(
                cfg, state_dir=prod_copy_dir, db_path=prod_copy_dir / "state.db"))
            prod_drift = shape_diff(fresh_shape, schema_shape(prod_conn))
            prod_rows = prod_conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
            prod_conn.close()
            check("копия боевой базы совпадает по форме со свежей",
                  not prod_drift, "; ".join(prod_drift[:3]))
            check("данные в копии боевой базы целы после init", prod_rows == 1075, str(prod_rows))

        check("база старого вида мигрирует", ver_old == migrations.TARGET_VERSION, str(ver_old))
        check("данные при миграции целы",
              kept_node is not None and kept_node[0] == "closed" and kept_def == 1)
        check("после миграции защита полевого босса разрешена", field_ok)
        migrated.close()

        conn.close()

        print("\n11. Боевой стейт чист (правило 14.4)")
        if real.db_path.exists():
            before_mtime = real.db_path.stat().st_mtime_ns
            clean_env = {k: v for k, v in os.environ.items() if not k.startswith("ARENA_")}
            clean_env["ARENA_ENV"] = "dev"
            clean_env["PYTHONPATH"] = str(PROJECT)
            run = subprocess.run(
                [sys.executable, "-m", "arena", "sync"],
                cwd=PROJECT, env=clean_env, capture_output=True, text=True,
            )
            dev_db = config_mod.HOME / ".local" / "state" / "arena-dev" / "state.db"
            after_mtime = real.db_path.stat().st_mtime_ns
            check("sync в песочнице пишет в свою базу",
                  run.returncode == 0 and dev_db.exists(),
                  f"код {run.returncode}, {run.stdout.strip().splitlines()[-1] if run.stdout else run.stderr[:80]}")
            check("боевая база при этом не тронута", before_mtime == after_mtime)
            prod = sqlite3.connect(f"file:{real.db_path}?mode=ro", uri=True)
            dirty = []
            for table in ("attempts", "days", "xp_ledger", "bot_events", "bosses", "defenses", "seasons"):
                n = prod.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                if n:
                    dirty.append(f"{table}={n}")
            prod_items = prod.execute("SELECT COUNT(*) FROM items").fetchone()[0]
            prod_nodes = prod.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
            prod.close()
            prodguard.verify(prod_guard, check)
        else:
            print("        боевой базы пока нет, проверка пропущена")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\nитого: пройдено {PASSED}, провалено {len(FAILED)}")
    if FAILED:
        for name in FAILED:
            print(f"  провал: {name}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
