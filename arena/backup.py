"""Бэкап базы и разворачивание бэкапа обратно.

Копировать файл базы под нагрузкой нельзя: в WAL половина свежих страниц лежит
в соседнем state.db-wal, и `cp state.db` даёт копию, которая молча отстала
на несколько транзакций, а то и просто битую. Поэтому копию делает сам SQLite:
`VACUUM INTO` собирает целую базу одним файлом, без -wal рядом, читая её
в транзакции, то есть не мешая петле дня и не ловя полузапись.

Хранится 14 штук (раздел 13 плана), лишнее подчищается тем же вызовом.
Имя с UTC-меткой, поэтому сортировка по имени это сортировка по времени.
"""

from __future__ import annotations

import shutil
import sqlite3
import tempfile
from pathlib import Path

from . import db
from .config import Config

KEEP = 14
PREFIX = "state-"
SUFFIX = ".db"
PATTERN = f"{PREFIX}*{SUFFIX}"
# VACUUM INTO появился в SQLite 3.27. На этой машине давно новее, но запасной
# путь через Connection.backup стоит копейки и снимает вопрос «а если».
HAS_VACUUM_INTO = sqlite3.sqlite_version_info >= (3, 27, 0)


def listing(cfg: Config) -> list[dict]:
    """Что лежит в папке бэкапов, свежее сверху."""
    if not cfg.backup_dir.exists():
        return []
    out = []
    for path in sorted(cfg.backup_dir.glob(PATTERN), reverse=True):
        stat = path.stat()
        out.append({"path": path, "name": path.name, "size": stat.st_size, "mtime": stat.st_mtime})
    return out


def rotate(cfg: Config, keep: int = KEEP, protect: Path | None = None) -> list[Path]:
    """Оставить свежие keep штук. Трогаем только свои файлы: в папке могут
    лежать чужие копии, положенные руками, и стирать их мы не вправе.

    Свежесть определяется именем: метка в нём UTC-шная, поэтому сортировка
    по имени это сортировка по времени. У правила есть щель: два бэкапа в одну
    секунду получают один и тот же префикс, а имя, освобождённое ротацией,
    может быть выдано следующему бэкапу заново. Поэтому только что снятая копия
    приезжает сюда отдельным аргументом и считается самой свежей всегда:
    удалить файл, который сам же и создал секунду назад, нельзя ни при каких
    метках времени.
    """
    files = sorted(cfg.backup_dir.glob(PATTERN), reverse=True)
    if protect is not None:
        files = [protect] + [p for p in files if p != protect]
    removed = []
    for path in files[max(keep, 1):]:
        path.unlink()
        removed.append(path)
    return removed


def _open_source(src: Path) -> sqlite3.Connection:
    """Открыть базу для снятия копии.

    Сначала на чтение: бэкап не должен ничего менять в оригинале. Но у базы
    в WAL после убитого процесса остаётся хвост, который надо накатить, а сделать
    это может только пишущее соединение. Поэтому на отказе открываем обычно:
    восстановление хвоста всё равно случится при первом же запуске сервера.
    """
    try:
        conn = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
        conn.execute("PRAGMA busy_timeout=10000")
        conn.execute("SELECT count(*) FROM sqlite_master")
        return conn
    except sqlite3.DatabaseError:
        conn = sqlite3.connect(src)
        conn.execute("PRAGMA busy_timeout=10000")
        return conn


def _copy_db(src: Path, dst: Path) -> None:
    conn = _open_source(src)
    try:
        if HAS_VACUUM_INTO:
            conn.execute("VACUUM INTO ?", (str(dst),))
        else:
            target = sqlite3.connect(dst)
            try:
                conn.backup(target)
            finally:
                target.close()
    finally:
        conn.close()


def create(cfg: Config, keep: int = KEEP) -> dict:
    """Сделать бэкап и провернуть ротацию."""
    if not cfg.db_path.exists():
        raise SystemExit(f"базы нет ({cfg.db_path}), бэкапить нечего")
    cfg.backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = db.utc_stamp()
    path = cfg.backup_dir / f"{PREFIX}{stamp}{SUFFIX}"
    # Метка с секундами, но два запуска в одну секунду возможны, а VACUUM INTO
    # в существующий файл не пишет и падает. Досчитываем суффикс, и обязательно
    # через подчёркивание с ведущим нулём: сортировка по имени это сортировка
    # по времени, а «-2» встало бы перед «.db», да и «_10» перед «_2».
    n = 1
    while path.exists():
        n += 1
        path = cfg.backup_dir / f"{PREFIX}{stamp}_{n:02d}{SUFFIX}"
    tmp = path.with_suffix(".part")
    tmp.unlink(missing_ok=True)
    try:
        _copy_db(cfg.db_path, tmp)
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)
    removed = rotate(cfg, keep, protect=path)
    return {
        "path": path,
        "size": path.stat().st_size,
        "removed": removed,
        "kept": len(list(cfg.backup_dir.glob(PATTERN))),
    }


def latest(cfg: Config) -> Path | None:
    files = listing(cfg)
    return files[0]["path"] if files else None


def restore(src: Path, dst: Path, force: bool = False) -> Path:
    """Развернуть бэкап в пустое место.

    Молча затирать чужую базу нельзя: восстановление делается руками и обычно
    в тот момент, когда человек и так расстроен. Поэтому существующий файл
    надо снести самому либо сказать force.
    """
    src = Path(src)
    dst = Path(dst)
    if not src.exists():
        raise SystemExit(f"нет такого бэкапа: {src}")
    if dst.exists() and not force:
        raise SystemExit(f"{dst} уже существует. Убери его или добавь --force")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    # Хвосты WAL от прежней базы к новой не относятся: с ними SQLite увидит
    # мешанину из двух баз.
    for tail in ("-wal", "-shm"):
        Path(str(dst) + tail).unlink(missing_ok=True)
    return dst


def verify(path: Path) -> dict:
    """Развернуть бэкап во временную пустую папку и открыть его как настоящую базу.

    Проверка именно разворачиванием, а не чтением на месте: бэкап, который
    не открывается после копирования, это не бэкап. Заодно сверяем версию схемы:
    потерянный user_version означал бы, что при следующем запуске миграции
    поедут по второму разу.
    """
    import dataclasses

    from . import config as config_mod
    from . import migrations

    path = Path(path)
    tmp = Path(tempfile.mkdtemp(prefix="arena-restore-"))
    try:
        base = config_mod.load(env="dev")
        restored = restore(path, tmp / "state.db")
        probe = db.connect(
            dataclasses.replace(base, state_dir=tmp, db_path=restored, backup_dir=tmp / "backups"),
            create=False,
        )
        try:
            bad = probe.execute("PRAGMA integrity_check").fetchone()[0]
            version = migrations.current_version(probe)
            counts = {
                name: db.scalar(probe, f"SELECT COUNT(*) FROM {name}")
                for name in ("stages", "nodes", "items", "xp_ledger", "attempts")
            }
        finally:
            probe.close()
        return {
            "path": path,
            "ok": bad == "ok",
            "integrity": bad,
            "version": version,
            "counts": counts,
        }
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def render(cfg: Config, result: dict) -> str:
    from .feed import plural

    kept = plural(result["kept"], "копия", "копии", "копий")
    lines = [f"бэкап готов: {result['path']}",
             f"размер {result['size'] // 1024} КБ, в папке {kept}"]
    if result["removed"]:
        lines.append("убрал старые: " + ", ".join(p.name for p in result["removed"]))
    return "\n".join(lines)
