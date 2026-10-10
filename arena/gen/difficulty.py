"""Насколько плотная тема у ноды. От этого зависит, сколько раздумий покупать.

Сигналов два. У нод этапов 1-3 в файле волта стоит честная оценка звёздами
(«**Сложность:** ★★★☆☆»), её и берём. У остальных этапов файлов нет, поэтому
базой служит сам этап: JMM и сборщик мусора сложнее, чем циклы и переменные.

Отдельно поднимаем ноды типов «тест» и «проект»: тест решает, закроется этап
или нет, а проект это код целиком, и небрежность там дороже.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

from ..config import Config

STARS_RE = re.compile(r"Сложность:\*\*\s*([★]+)")

# Базовая плотность этапа по шкале 1-5. Числа не выдуманы: это оценка того,
# сколько неочевидных деталей на теме и как часто на ней валят на собеседовании.
STAGE_DIFFICULTY = {
    1: 1,   # старт, инструменты
    2: 1,   # синтаксис
    3: 2,   # ООП
    4: 3,   # Java Core: equals, строки, обёртки
    5: 2,   # исключения
    6: 4,   # дженерики и стирание типов
    7: 3,   # коллекции
    8: 3,   # лямбды и Stream
    9: 4,   # алгоритмы
    10: 3,  # ввод-вывод и сеть
    11: 2,  # дата и время
    12: 5,  # многопоточность
    13: 5,  # JVM вглубь
    14: 2,  # инструменты
    15: 2,  # тестирование
    16: 3,  # SQL и JDBC
    17: 4,  # Spring
    18: 4,  # Hibernate и JPA
    19: 3,  # web и REST
    20: 4,  # архитектура и паттерны
    21: 3,  # Docker и CI
    22: 4,  # Kafka
    23: 5,  # микросервисы и системный дизайн
    24: 5,  # производительность и безопасность
    25: 4,  # большие проекты
    26: 3,  # собеседования
}
DEFAULT_DIFFICULTY = 3

# Типы нод, где цена небрежности выше обычного.
DEMANDING_KINDS = ("тест", "проект")


def from_stars(cfg: Config, obsidian_path: str | None) -> int | None:
    """Оценка звёздами из шапки конспекта, если конспект есть."""
    if not obsidian_path:
        return None
    path = Path(cfg.vault_root) / obsidian_path
    try:
        head = path.read_text(encoding="utf-8")[:600]
    except OSError:
        return None
    m = STARS_RE.search(head)
    if not m:
        return None
    return max(1, min(5, len(m.group(1))))


def for_node(cfg: Config, node: sqlite3.Row | dict) -> int:
    """Сложность ноды по шкале 1-5."""
    get = node.__getitem__ if not isinstance(node, dict) else node.get
    try:
        stage_num = get("stage_num")
    except (KeyError, IndexError):
        stage_num = None
    try:
        obsidian_path = get("obsidian_path")
    except (KeyError, IndexError):
        obsidian_path = None
    try:
        kind = get("kind")
    except (KeyError, IndexError):
        kind = ""

    if not stage_num:
        code = str(get("code") or "")
        stage_num = int(code.split(".")[0]) if code.split(".")[0].isdigit() else 0

    base = from_stars(cfg, obsidian_path)
    if base is None:
        base = STAGE_DIFFICULTY.get(int(stage_num or 0), DEFAULT_DIFFICULTY)
    if kind in DEMANDING_KINDS:
        base += 1
    return max(1, min(5, base))


def for_stage(stage_num: int) -> int:
    return STAGE_DIFFICULTY.get(int(stage_num or 0), DEFAULT_DIFFICULTY)
