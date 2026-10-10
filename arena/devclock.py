"""Часы босса и ускорение времени для песочницы.

Таймеры экзамена и сутки до реванша живут по этим часам, а не по системным.
Причина простая: проверить, что реванш заперт на сутки, иначе можно только
ожиданием суток, а приёмка обязана гоняться за минуты.

Правило жёсткое: ускорение работает ТОЛЬКО в песочном профиле (раздел 2 плана).
В боевом профиле сдвиг и множитель молча игнорируются, а в лог уходит
предупреждение, чтобы случайно включённая переменная окружения не съела
настоящие сутки кулдауна.

Сдвиг хранится в таблице meta, а не в памяти процесса: команду и сервер
разносит по разным процессам, а часы у них обязаны быть одни.

Дневная бухгалтерия (days, xp_ledger, серия) остаётся на обычных `db.today()`
и `db.now()`. Сдвинутые часы трогают только босса: подменять дату дня значило бы
писать XP в будущий день и ломать серию.
"""

from __future__ import annotations

import datetime as dt
import os
import sqlite3

from .config import Config

META_SHIFT = "dev_clock_shift"
META_SCALE = "dev_clock_scale"
ENV_SHIFT = "ARENA_DEV_TIME_SHIFT"
ENV_SCALE = "ARENA_DEV_TIME_SCALE"

_warned = False


def _warn_once(what: str) -> None:
    global _warned
    if _warned:
        return
    _warned = True
    print(f"боевой профиль: {what} игнорируется, время идёт как обычно")


def _meta(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def _set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO meta(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def _number(raw: str | None, default: float) -> float:
    try:
        return float(raw) if raw not in (None, "") else default
    except (TypeError, ValueError):
        return default


def shift_seconds(conn: sqlite3.Connection, cfg: Config) -> float:
    """На сколько секунд вперёд переведены часы. В боевом профиле всегда ноль."""
    env = os.environ.get(ENV_SHIFT)
    stored = _meta(conn, META_SHIFT)
    if not cfg.is_sandbox:
        if env or stored:
            _warn_once("сдвиг часов")
        return 0.0
    return _number(stored, 0.0) + _number(env, 0.0)


def scale(conn: sqlite3.Connection, cfg: Config) -> float:
    """Во сколько раз быстрее тикают таймеры экзамена."""
    env = os.environ.get(ENV_SCALE)
    stored = _meta(conn, META_SCALE)
    if not cfg.is_sandbox:
        if env or stored:
            _warn_once("ускорение таймеров")
        return 1.0
    value = _number(stored, 0.0) or _number(env, 0.0) or 1.0
    return max(0.001, value)


def now(conn: sqlite3.Connection, cfg: Config) -> dt.datetime:
    return dt.datetime.now() + dt.timedelta(seconds=shift_seconds(conn, cfg))


def now_iso(conn: sqlite3.Connection, cfg: Config) -> str:
    return now(conn, cfg).isoformat(timespec="seconds")


def parse(stamp: str | None) -> dt.datetime | None:
    if not stamp:
        return None
    try:
        return dt.datetime.fromisoformat(stamp)
    except ValueError:
        return None


def since(conn: sqlite3.Connection, cfg: Config, stamp: str | None) -> float:
    """Сколько секунд прошло с отметки по часам профиля. Без ускорения."""
    started = parse(stamp)
    if started is None:
        return 0.0
    return max(0.0, (now(conn, cfg) - started).total_seconds())


def elapsed(conn: sqlite3.Connection, cfg: Config, stamp: str | None) -> float:
    """Сколько секунд таймера сгорело с отметки, уже с учётом ускорения."""
    return since(conn, cfg, stamp) * scale(conn, cfg)


def set_shift(conn: sqlite3.Connection, cfg: Config, seconds: float,
              relative: bool = False) -> float:
    if not cfg.is_sandbox:
        raise PermissionError("часы переводятся только в песочнице")
    base = _number(_meta(conn, META_SHIFT), 0.0) if relative else 0.0
    value = base + float(seconds)
    _set_meta(conn, META_SHIFT, repr(value))
    conn.commit()
    return value


def set_scale(conn: sqlite3.Connection, cfg: Config, value: float) -> float:
    if not cfg.is_sandbox:
        raise PermissionError("таймеры ускоряются только в песочнице")
    value = max(0.001, float(value))
    _set_meta(conn, META_SCALE, repr(value))
    conn.commit()
    return value


def status(conn: sqlite3.Connection, cfg: Config) -> dict:
    return {
        "sandbox": cfg.is_sandbox,
        "shift_sec": shift_seconds(conn, cfg),
        "scale": scale(conn, cfg),
        "now": now_iso(conn, cfg),
    }
