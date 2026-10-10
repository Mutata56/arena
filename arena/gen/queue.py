"""Очередь генерации: постановка заданий, выдача в работу, журнал вызовов.

Статусы из раздела 3 плана: pending, running, done, failed, deferred.

Два правила, которые здесь важнее остальных:

1. Лимит подписки и 429 это deferred с retry_after, и попытка при этом НЕ сгорает
   (раздел 11). Иначе ночь с закрытым окном лимитов съела бы все попытки очереди
   и наутро ученик получил бы пустую ноду и три failed.
2. Живое задание на одну и ту же работу может быть только одно: за этим следит
   частичный уникальный индекс из схемы. Производителей у очереди два (вход в ноду
   и ночной таймер), без индекса дубли гарантированы, а каждый дубль это сожжённый вызов.
"""

from __future__ import annotations

import datetime as dt
import json
import sqlite3

from ..db import now

LIVE = ("pending", "running", "deferred")
MAX_ATTEMPTS = 3
# Через сколько повторять задание, упавшее по технической причине.
RETRY_SEC = 90
# Как долго не переставлять задание, которое уже провалилось. Без паузы каждый
# вход в ноду ставил бы его заново и жёг подписку по кругу.
FAIL_COOLDOWN_HOURS = 6


def _stamp(delta_sec: float) -> str:
    return (dt.datetime.now() + dt.timedelta(seconds=delta_sec)).isoformat(timespec="seconds")


def enqueue(conn: sqlite3.Connection, kind: str, node_id: int | None = None,
            stage_id: int | None = None, params: dict | None = None,
            priority: int = 0, force: bool = False) -> int | None:
    """Поставить задание. Возвращает id или None, если ставить не нужно."""
    live = conn.execute(
        "SELECT id FROM gen_queue WHERE kind = ? AND COALESCE(node_id, -1) = ? "
        "AND COALESCE(stage_id, -1) = ? AND status IN ('pending', 'running', 'deferred')",
        (kind, node_id if node_id is not None else -1, stage_id if stage_id is not None else -1),
    ).fetchone()
    if live is not None:
        return None
    if not force:
        recent = conn.execute(
            "SELECT done_at FROM gen_queue WHERE kind = ? AND COALESCE(node_id, -1) = ? "
            "AND COALESCE(stage_id, -1) = ? AND status = 'failed' "
            "ORDER BY id DESC LIMIT 1",
            (kind, node_id if node_id is not None else -1, stage_id if stage_id is not None else -1),
        ).fetchone()
        if recent is not None and (recent["done_at"] or "") >= _stamp(-FAIL_COOLDOWN_HOURS * 3600):
            return None
    try:
        cur = conn.execute(
            "INSERT INTO gen_queue(node_id, stage_id, kind, params, priority, status, attempts, "
            "created) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)",
            (node_id, stage_id, kind, json.dumps(params or {}, ensure_ascii=False), priority, now()),
        )
    except sqlite3.IntegrityError:
        # Гонка двух производителей: пока мы смотрели, живое задание успели поставить.
        # Индекс на этот случай и заведён, а нам достаточно молча уступить.
        return None
    return cur.lastrowid


def revive(conn: sqlite3.Connection) -> int:
    """Вернуть в работу отложенные задания, у которых окно уже открылось."""
    cur = conn.execute(
        "UPDATE gen_queue SET status = 'pending' WHERE status = 'deferred' "
        "AND (retry_after IS NULL OR retry_after <= ?)",
        (now(),),
    )
    return cur.rowcount


def reset_stale(conn: sqlite3.Connection, older_than_sec: float) -> int:
    """Подобрать задания, брошенные упавшим процессом.

    Сбрасывать все running подряд нельзя: рядом может работать второй процесс
    (сервер и ночной таймер живут отдельно), и у него прямо сейчас открыт вызов.
    Поэтому только те, что висят дольше двух таймаутов вызова.
    """
    cur = conn.execute(
        "UPDATE gen_queue SET status = 'pending' WHERE status = 'running' "
        "AND (started_at IS NULL OR started_at < ?)",
        (_stamp(-older_than_sec),),
    )
    return cur.rowcount


def claim(conn: sqlite3.Connection, kinds: tuple[str, ...] | None = None) -> sqlite3.Row | None:
    """Взять одно задание в работу. Атомарно: два процесса не возьмут одно и то же."""
    marks = ""
    params: list = [now()]
    if kinds:
        marks = " AND kind IN (" + ", ".join("?" for _ in kinds) + ")"
        params += list(kinds)
    row = conn.execute(
        "SELECT * FROM gen_queue WHERE status = 'pending' "
        "AND (retry_after IS NULL OR retry_after <= ?)" + marks +
        " ORDER BY priority DESC, id LIMIT 1",
        params,
    ).fetchone()
    if row is None:
        return None
    cur = conn.execute(
        "UPDATE gen_queue SET status = 'running', started_at = ? WHERE id = ? AND status = 'pending'",
        (now(), row["id"]),
    )
    conn.commit()
    if cur.rowcount == 0:
        return None
    return conn.execute("SELECT * FROM gen_queue WHERE id = ?", (row["id"],)).fetchone()


def finish(conn: sqlite3.Connection, job_id: int, error: str = "") -> None:
    conn.execute(
        "UPDATE gen_queue SET status = 'done', attempts = attempts + 1, done_at = ?, error = ? "
        "WHERE id = ?",
        (now(), error or None, job_id),
    )
    conn.commit()


def fail(conn: sqlite3.Connection, job_id: int, error: str) -> None:
    conn.execute(
        "UPDATE gen_queue SET status = 'failed', attempts = attempts + 1, done_at = ?, error = ? "
        "WHERE id = ?",
        (now(), error[:2000], job_id),
    )
    conn.commit()


def retry_or_fail(conn: sqlite3.Connection, job: sqlite3.Row, error: str,
                  delay: float = RETRY_SEC) -> str:
    """Беда, которую есть смысл повторить: пробуем ещё, но не бесконечно.

    Пауза нужна сбоям транспорта (сеть отдышится), а красному прогону эталона
    она ни к чему: дело в содержании ответа, и повторный вызов сам идёт минуты.
    Поэтому delay задаётся вызывающим.
    """
    if job["attempts"] + 1 >= MAX_ATTEMPTS:
        fail(conn, job["id"], error)
        return "failed"
    conn.execute(
        "UPDATE gen_queue SET status = 'pending', attempts = attempts + 1, retry_after = ?, "
        "error = ? WHERE id = ?",
        (_stamp(delay), error[:2000], job["id"]),
    )
    conn.commit()
    return "pending"


def defer(conn: sqlite3.Connection, job_id: int, retry_after: str | None, error: str) -> None:
    """Лимит подписки или 429. Попытка НЕ сгорает: очередь просто ждёт окна."""
    conn.execute(
        "UPDATE gen_queue SET status = 'deferred', retry_after = ?, error = ? WHERE id = ?",
        (retry_after or _stamp(1800), error[:2000], job_id),
    )
    conn.commit()


def deferred_until(conn: sqlite3.Connection) -> str | None:
    row = conn.execute(
        "SELECT MIN(retry_after) AS until FROM gen_queue WHERE status = 'deferred'"
    ).fetchone()
    return row["until"] if row else None


def counts(conn: sqlite3.Connection) -> dict[str, int]:
    rows = conn.execute("SELECT status, COUNT(*) AS n FROM gen_queue GROUP BY status").fetchall()
    return {row["status"]: row["n"] for row in rows}


def log(conn: sqlite3.Connection, job: sqlite3.Row | None, kind: str, status: str,
        prompt: str = "", raw: str = "", error: str = "", model: str = "",
        seconds: float = 0.0, cost: float | None = None,
        produced: int = 0, rejected: int = 0,
        node_id: int | None = None, stage_id: int | None = None) -> int:
    """Записать вызов в журнал. Сырой ответ обязателен для невалида (раздел 11)."""
    cur = conn.execute(
        "INSERT INTO gen_log(queue_id, node_id, stage_id, kind, ts, status, model, seconds, cost, "
        "produced, rejected, prompt, raw, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (job["id"] if job is not None else None,
         node_id if node_id is not None else (job["node_id"] if job is not None else None),
         stage_id if stage_id is not None else (job["stage_id"] if job is not None else None),
         kind, now(), status, model, round(seconds, 2), cost, produced, rejected,
         prompt[:20000] or None, raw[:20000] or None, error[:2000] or None),
    )
    conn.commit()
    return cur.lastrowid


def recent_log(conn: sqlite3.Connection, limit: int = 10) -> list[dict]:
    rows = conn.execute(
        "SELECT g.id, g.ts, g.kind, g.status, g.model, g.seconds, g.produced, g.rejected, "
        "g.error, n.code AS node_code FROM gen_log g LEFT JOIN nodes n ON n.id = g.node_id "
        "ORDER BY g.id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(row) for row in rows]
