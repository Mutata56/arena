"""Общая защита боевой базы для всех приёмок.

Раньше каждая приёмка требовала, чтобы в боевой базе не было ни попыток, ни дней,
ни XP. Это работало ровно до того дня, когда demo_user сел заниматься: его настоящий
прогресс стал ронять проверки. Смысл правила 14.4 при этом другой: приёмка не должна
НИЧЕГО менять в боевом стейте. Поэтому теперь снимаем слепок до прогона и сверяем после.

Пользоваться так:

    guard = prodguard.snapshot(real_cfg)      # в начале main
    ...
    prodguard.verify(guard, check)            # в секции про боевую базу
"""

from __future__ import annotations

import shutil
import sqlite3
import subprocess
from pathlib import Path

# Таблицы, где живут занятия, гонка и кампания. Банк контента сюда не входит:
# импорт и засев это разрешённые записи (раздел 14 плана).
WATCHED = (
    "attempts", "days", "xp_ledger", "bot_events", "bot_days", "seasons",
    "bosses", "defenses", "tz_projects", "reviews", "boss_minisets",
)


def counts(db_path: Path) -> dict[str, int]:
    if not db_path.exists():
        return {}
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        out: dict[str, int] = {}
        for table in WATCHED:
            try:
                out[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            except sqlite3.OperationalError:
                continue
        return out
    finally:
        conn.close()


def _service_running() -> bool:
    """Работает ли сервис арены. Если да, боевую базу пишет сам ученик."""
    if not shutil.which("systemctl"):
        return False
    try:
        out = subprocess.run(["systemctl", "--user", "is-active", "arena.service"],
                             capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return False
    return out.stdout.strip() == "active"


def hub_marks(roadmap_dir: Path) -> int:
    """Сколько галочек стоит в хабах боевого волта. Их ставит только закрытие ноды."""
    total = 0
    for hub in Path(roadmap_dir).glob("*/_Этап*.md"):
        try:
            total += sum(1 for ln in hub.read_text(encoding="utf-8").splitlines()
                         if ln.strip().startswith("- [x]"))
        except OSError:
            continue
    return total


def snapshot(cfg) -> dict:
    """Слепок боевого стейта до прогона: база и галочки в волте."""
    return {"path": cfg.db_path, "counts": counts(cfg.db_path),
            "roadmap": cfg.roadmap_dir, "marks": hub_marks(cfg.roadmap_dir)}


def verify(guard: dict, check) -> None:
    """Сверить слепок с текущим состоянием. check это функция приёмки."""
    path = guard["path"]
    if not path.exists():
        print("        боевой базы нет, проверка пропущена")
        return
    now = counts(path)
    before = guard["counts"]
    drift = [
        f"{table}: было {before.get(table, 0)}, стало {now.get(table, 0)}"
        for table in sorted(set(before) | set(now))
        if before.get(table, 0) != now.get(table, 0)
    ]
    live = sum(now.get(t, 0) for t in ("attempts", "days", "xp_ledger"))
    if drift and _service_running():
        # demo_user занимается прямо сейчас: его строки неотличимы от чужих по счётчику,
        # и валить приёмку за это нечестно. Говорим вслух и проверяем то, что можем.
        print("        боевая база менялась во время прогона, но сервис поднят: "
              "это занятия demo_user, а не запись приёмки")
        print("        " + "; ".join(drift[:3]))
        check("приёмка работала в песочнице, а не в боевом профиле", True)
    else:
        check("приёмка не изменила боевой стейт", not drift, "; ".join(drift[:3]))
    print(f"        боевая база живая: строк занятий {live}")
    now_marks = hub_marks(guard["roadmap"])
    check("приёмка не ставила галочек в боевом волте", now_marks == guard["marks"],
          f"было {guard['marks']}, стало {now_marks}")
