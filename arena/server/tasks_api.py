"""Вкладка «Задачи» и приём отчётов от runner'а.

Единственный писатель прогресса это сервер: runner считает результат у себя
(javac и JUnit в песочнице), а сюда присылает вердикт. Так у xp_ledger остаётся
один источник записей и не появляется вторая ветка, в которой можно
начислить XP дважды.

Скрытые тесты по HTTP не ходят вообще: runner берёт их из базы напрямую.
"""

from __future__ import annotations

import json
from typing import Callable

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import tasks, xp
from ..config import Config

STATUS_TITLES = {
    "new": "не выдана",
    "issued": "в работе",
    "passed": "сдана",
}


class IssueBody(BaseModel):
    item_id: int
    node_id: int
    dir_path: str


class CheckBody(BaseModel):
    item_id: int
    verdict: dict


def task_rows(conn) -> list[dict]:
    rows = conn.execute(
        "SELECT i.id, i.difficulty, i.payload, n.code AS node_code, n.title AS node_title, "
        "  n.status AS node_status, s.num AS stage_num, "
        "  ct.dir_path, ct.issued_at, ct.passed_at, ct.checks, ct.last_ts, ct.last_result "
        "FROM items i JOIN nodes n ON n.id = i.node_id JOIN stages s ON s.id = n.stage_id "
        "LEFT JOIN code_tasks ct ON ct.item_id = i.id "
        "WHERE i.type = 'code' AND i.active = 1 "
        "ORDER BY s.num, n.seq, i.difficulty, i.id"
    ).fetchall()
    out = []
    for row in rows:
        payload = json.loads(row["payload"])
        if row["passed_at"]:
            status = "passed"
        elif row["issued_at"]:
            status = "issued"
        else:
            status = "new"
        last = json.loads(row["last_result"]) if row["last_result"] else None
        out.append({
            "item_id": row["id"],
            "title": payload.get("title", "код-задача"),
            "statement_md": payload.get("statement_md", ""),
            "node_code": row["node_code"],
            "node_title": row["node_title"],
            "node_status": row["node_status"],
            "stage_num": row["stage_num"],
            "difficulty": row["difficulty"],
            "xp": xp.code_amount(row["difficulty"]),
            "status": status,
            "status_title": STATUS_TITLES[status],
            "locked": row["node_status"] == "locked",
            "dir_path": row["dir_path"],
            "checks": row["checks"] or 0,
            "last_ts": row["last_ts"],
            "last_message": (last or {}).get("message", ""),
            "hidden": (last or {}).get("hidden", []),
        })
    return out


def register(app: FastAPI, cfg: Config, session: Callable) -> None:
    @app.get("/api/whoami")
    def api_whoami():
        """Кто на проводе. runner сверяется с этим перед тем, как слать отчёт:
        на 127.0.0.1 может висеть сервер другого профиля, и писать XP в чужую базу
        нельзя."""
        return {"env": cfg.env, "db": str(cfg.db_path), "tasks_api": 1}

    @app.get("/api/tasks")
    def api_tasks():
        with session() as conn:
            rows = task_rows(conn)
            return {
                "tasks": rows,
                "tasks_root": str(cfg.tasks_root / "tasks"),
                "env": cfg.env,
            }

    @app.post("/api/task/issue")
    def api_task_issue(body: IssueBody):
        with session() as conn:
            return tasks.record_issue(conn, body.item_id, body.node_id, body.dir_path)

    @app.post("/api/task/check")
    def api_task_check(body: CheckBody):
        with session() as conn:
            try:
                return tasks.record_check(conn, cfg, body.item_id, body.verdict)
            except LookupError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/tasks")
    def tasks_page():
        from .app import STATIC_DIR

        return FileResponse(STATIC_DIR / "tasks.html")
