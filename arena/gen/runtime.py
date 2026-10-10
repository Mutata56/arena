"""Настройки конвейера: чем звать модель и когда вообще можно звать.

Путь к claude зашит абсолютным намеренно (раздел 2 плана): PATH пользовательского
systemd не содержит ~/.local/bin, поэтому голый вызов `claude` из-под сервиса упал бы,
а из интерактивного шелла работал. Это ровно тот баг, который маскируется при отладке.
"""

from __future__ import annotations

import os
import shlex
from pathlib import Path

from ..config import Config

# Абсолютный путь, а не поиск по PATH. Менять только вместе с разделом 2 плана.
# Домашняя папка берётся у текущего пользователя: путь ~ существует на
# Linux-машине, а на маке дом лежит в ~ и конвейер там молча падал на
# каждом задании. Переопределяется ARENA_CLAUDE_BIN — так же, как в llm.py и taunts.py.
CLAUDE_BIN = os.environ.get("ARENA_CLAUDE_BIN") or str(Path.home() / ".local" / "bin" / "claude")

# Лёгкие жанры (квизы, карточки, чужой код) идут дешёвой моделью. План говорит
# «модель по умолчанию», но на этой машине дефолт CLI разрешается в opus,
# поэтому модель названа явно: иначе каждый вход в ноду жёг бы подписку опусом.
# Расхождение зафиксировано в STATUS-4a по правилу 14.10.
LIGHT_MODEL = "sonnet"
# Тяжёлые жанры это заход 4б, здесь только объявлены.
HEAVY_MODEL = "opus"

MODELS = {
    "quiz": LIGHT_MODEL,
    "cards": LIGHT_MODEL,
    "readcode": LIGHT_MODEL,
    "article": LIGHT_MODEL,
    "code": HEAVY_MODEL,
    "note": HEAVY_MODEL,
}

# Уровень размышлений на вызов. Без него CLI берёт настройку из ~/.claude/settings.json,
# а там xhigh, и мы платили за раздумья там, где их не нужно. Замер на настоящем промпте
# (12 вопросов, sonnet): xhigh 443 секунды и 1.26, medium 238 и 0.59, low от 49 до 109
# секунд и от 0.10 до 0.24 при том же качестве вариантов и объяснений.
#
# Правило простое: где есть объективный фильтр (эталон кода компилируется и проходит тесты,
# вывод сниппета сверяется прогоном), там качество гарантирует не модель, а проверка,
# и размышления можно не покупать сверх нужного. Где фильтра нет (стиль конспекта),
# там уровень выше.
# Уровень зависит и от жанра, и от плотности темы (модуль difficulty).
# Ключ это жанр, значение это уровень для сложности 1-2, 3 и 4-5.
# Замеры, на которых построена таблица (sonnet, настоящие промпты из базы):
#   лёгкая нода 1.01, 12 вопросов: low 49-109 с и 0.10-0.24, medium 238 с и 0.59,
#   xhigh 443 с и 1.26 при неотличимом на глаз качестве вариантов;
#   трудная нода 12.14 (Java Memory Model), 4 карточки: low 60 с и 0.276,
#   medium 134 с и 0.426, обе пачки без единой фактической ошибки.
# Вывод: на плотной теме модель и сама тратит больше, но цена ошибки в карточке
# высокая (её повторяют месяцами), поэтому со сложности 3 поднимаем уровень.
EFFORT = {
    "quiz": ("medium", "medium", "high"),
    "cards": ("low", "medium", "medium"),
    "readcode": ("medium", "medium", "high"),
    "article": ("low", "low", "medium"),
    # Код и конспект всегда наверху: у кода цена провала это красная самопроверка
    # и ретрай, у конспекта нет вообще никакой автоматической проверки, только стиль.
    "code": ("high", "high", "high"),
    "note": ("high", "high", "high"),
}
DEFAULT_EFFORT = "medium"


def _band(difficulty: int) -> int:
    """Полоса сложности: 0 это 1-2, 1 это 3, 2 это 4-5."""
    if difficulty <= 2:
        return 0
    return 1 if difficulty == 3 else 2

# Сколько ждём один вызов. Замеры на живом claude: пачка из шести вопросов
# заняла 3.7 минуты в одном прогоне и 8 минут в другом, пачка из двенадцати 6.7 минуты.
# Разброс больше, чем зависимость от размера пачки, поэтому потолок взят с запасом:
# оборванный по таймауту вызов теряет всю пачку и жжёт лимит впустую.
TIMEOUT = 1200
# Сколько времени ночному проходу разрешено молотить очередь. Окно таймера
# четыре часа, юнит обрывается на трёх, поэтому проход укладывается в два.
NIGHT_BUDGET_SEC = 2 * 3600
# Пауза между опросами очереди, когда работы нет.
POLL_SEC = 5.0


def _flag(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def model_for(kind: str) -> str:
    override = _flag("ARENA_GEN_MODEL")
    if override:
        return override
    return MODELS.get(kind, LIGHT_MODEL)


def effort_for(kind: str, difficulty: int = 3) -> str:
    """Уровень размышлений для жанра на ноде такой сложности.

    ARENA_GEN_EFFORT перекрывает всё разом: пригодится, чтобы разово прижать
    расход или наоборот прогнать важный этап по максимуму.
    """
    override = _flag("ARENA_GEN_EFFORT")
    if override:
        return override
    row = EFFORT.get(kind)
    if row is None:
        return DEFAULT_EFFORT
    return row[_band(int(difficulty or 3))]


def timeout() -> int:
    raw = _flag("ARENA_GEN_TIMEOUT")
    return int(raw) if raw.isdigit() else TIMEOUT


def poll_sec() -> float:
    raw = _flag("ARENA_GEN_POLL")
    try:
        return max(0.2, float(raw))
    except ValueError:
        return POLL_SEC


def mode(cfg: Config) -> tuple[str, list[str], str]:
    """Чем звать модель прямо сейчас.

    Возвращает режим, командную строку и причину, если генерация выключена.

    - live: настоящий claude по абсолютному пути;
    - fake: подставной бинарь из ARENA_GEN_FAKE, только в песочнице;
    - off: в песочнице никто не разрешил ходить наружу.

    Песочница по умолчанию молчит намеренно: приёмки соседних фаз поднимают сервер
    в dev-профиле, и фоновый воркер иначе начал бы жечь подписку и подкладывать
    им вопросы в банк, ломая их же проверки контракта.
    """
    fake = _flag("ARENA_GEN_FAKE")
    if cfg.is_sandbox:
        if fake:
            return "fake", shlex.split(fake), ""
        if _flag("ARENA_GEN_LIVE") == "1":
            return "live", [CLAUDE_BIN], ""
        return "off", [], "песочница без ARENA_GEN_FAKE и без ARENA_GEN_LIVE=1"
    if fake:
        # Тот же принцип, что у dev-флагов раздела 2: в боевом профиле молча игнорируем
        # с предупреждением в лог.
        print("боевой профиль: ARENA_GEN_FAKE игнорируется, зову настоящий claude")
    return "live", [CLAUDE_BIN], ""


def worker_allowed(cfg: Config) -> tuple[bool, str]:
    """Можно ли поднимать фонового воркера внутри сервера."""
    if _flag("ARENA_GEN_WORKER") == "0":
        return False, "выключен переменной ARENA_GEN_WORKER=0"
    kind, _, why = mode(cfg)
    if kind == "off":
        return False, why
    return True, ""
