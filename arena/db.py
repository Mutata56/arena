"""Подключение к SQLite и инициализация схемы."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from . import migrations
from .config import Config

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def now() -> str:
    """Локальное время в ISO с секундами. Всё время в базе храним строками."""
    return datetime.now().isoformat(timespec="seconds")


def now_ms() -> str:
    """То же время, но с миллисекундами.

    Нужно там, где две записи подряд решают порядок: вход в ноду выбирает текущую
    ноду по entered_at, а два клика по карте укладываются в одну и ту же секунду.
    Сравнение строк остаётся честным: секундная отметка короче и сортируется раньше.
    """
    return datetime.now().isoformat(timespec="milliseconds")


def today() -> str:
    return datetime.now().date().isoformat()


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def connect(cfg: Config, create: bool = True) -> sqlite3.Connection:
    if not cfg.db_path.exists() and not create:
        raise SystemExit(f"базы нет: {cfg.db_path}. Сначала arena sync")
    cfg.state_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(cfg.db_path)
    conn.row_factory = sqlite3.Row
    # busy_timeout ставим первым: перевод в WAL сам может вернуть SQLITE_BUSY,
    # а без таймаута два одновременных запуска на свежей папке роняют друг друга.
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("SELECT count(*) FROM sqlite_master")
    except sqlite3.DatabaseError as exc:
        raise SystemExit(
            f"база повреждена или это не база SQLite: {cfg.db_path} ({exc}).\n"
            f"Свежую копию можно поднять заново: удали файл и прогони arena sync, "
            f"бэкапы лежат в {cfg.backup_dir}"
        ) from exc
    return conn


def init(cfg: Config) -> sqlite3.Connection:
    conn = connect(cfg)
    fresh = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='nodes'"
    ).fetchone()[0] == 0
    if fresh:
        # Пустая база сразу получает актуальную схему, мигрировать нечего.
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        conn.execute(f"PRAGMA user_version = {migrations.TARGET_VERSION}")
        conn.commit()
    else:
        # Сначала миграции, потом схема: в schema.sql уже описан новый вид таблиц,
        # и индекс по колонке, которой в старой базе ещё нет, иначе уронит запуск.
        applied = migrations.apply(conn)
        if applied:
            print(f"схема обновлена до версии {applied[-1]}")
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        conn.commit()
    conn.execute(
        "INSERT INTO meta(key, value) VALUES('schema_version', ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (str(migrations.TARGET_VERSION),),
    )
    conn.execute(
        "INSERT INTO meta(key, value) VALUES('created', ?) ON CONFLICT(key) DO NOTHING",
        (now(),),
    )
    conn.commit()
    return conn


def scalar(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> int:
    row = conn.execute(sql, params).fetchone()
    return row[0] if row and row[0] is not None else 0
