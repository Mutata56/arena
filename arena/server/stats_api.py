"""API вкладки «статистика», внешнего подвига и полевого босса.

Отдельным модулем по образцу фаз 5, 6 и 7: в общий app.py уходит одна строка
регистрации. Здесь же две самоотметки, потому что обе живут на этой же кухне:
их результат виден именно в статистике.
"""

from __future__ import annotations

from contextlib import contextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .. import db, field as field_mod, stats as stats_mod
from ..config import Config


class FieldBody(BaseModel):
    place: str = ""
    asked: str = ""
    failed: str = ""
    outcome: str = ""


def register(app: FastAPI, cfg: Config) -> None:
    @contextmanager
    def session():
        conn = db.connect(cfg, create=False)
        try:
            yield conn
        finally:
            conn.close()

    @app.get("/api/stats")
    def api_stats():
        with session() as conn:
            return stats_mod.board(conn)

    @app.get("/api/deed/javarush")
    def api_deed_state():
        with session() as conn:
            return field_mod.deed_state(conn)

    @app.post("/api/deed/javarush")
    def api_deed():
        """Внешний подвиг: 20 XP, не больше трёх в день."""
        with session() as conn:
            try:
                return field_mod.add_deed(conn)
            except PermissionError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/field")
    def api_field_list():
        with session() as conn:
            return {"items": field_mod.history(conn)}

    @app.post("/api/field")
    def api_field_add(body: FieldBody):
        """Анкета после настоящего собеседования."""
        with session() as conn:
            try:
                return field_mod.add_field(conn, body.place, body.asked, body.failed, body.outcome)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
