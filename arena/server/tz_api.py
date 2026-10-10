"""API ТЗ-цеха, экран ТЗ и страница про публикацию портфеля.

Разделение обязанностей то же, что у код-задач: прогон считает runner (javac
и JUnit живут на машине, а не в сервере), а статусы, XP, ревью и защиту пишет
сервер. Двух писателей в xp_ledger не бывает.

Две ручки здесь честно долгие: генерация постановки и приём сдачи с ревью
ходят в claude и идут минутами. Обе объявлены обычными def, а не async,
поэтому FastAPI уводит их в пул потоков и петля событий не встаёт.
"""

from __future__ import annotations

from contextlib import contextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import db, tz as tz_mod
from ..config import PROJECT_ROOT, Config

STATIC_DIR = PROJECT_ROOT / "static"


class SubmitBody(BaseModel):
    verdict: dict


class NoteBody(BaseModel):
    summary: str = ""


def register(app: FastAPI, cfg: Config) -> None:
    @contextmanager
    def session():
        conn = db.connect(cfg, create=False)
        try:
            yield conn
        finally:
            conn.close()

    def guard(func):
        try:
            return func()
        except tz_mod.TzError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/tz")
    def api_board():
        with session() as conn:
            return tz_mod.board(conn, cfg)

    @app.get("/api/tz/{tz_id}")
    def api_project(tz_id: int):
        with session() as conn:
            return guard(lambda: tz_mod.view(conn, cfg, tz_mod.project_by_id(conn, tz_id)))

    @app.post("/api/tz/stage/{num}/start")
    def api_start(num: int):
        with session() as conn:
            return guard(lambda: tz_mod.start(conn, cfg, num))

    @app.post("/api/tz/stage/{num}/gen")
    def api_gen(num: int):
        """Сгенерировать постановку. Живой вызов модели, минуты."""
        from .. import tz_gen

        with session() as conn:
            def work():
                try:
                    return tz_gen.generate(conn, cfg, num)
                except tz_gen.GenError as exc:
                    raise tz_mod.TzError(str(exc)) from exc

            return guard(work)

    @app.post("/api/tz/{tz_id}/submit")
    def api_submit(tz_id: int, body: SubmitBody):
        with session() as conn:
            return guard(lambda: tz_mod.submit(conn, cfg, tz_id, body.verdict))

    @app.post("/api/tz/{tz_id}/note")
    def api_note(tz_id: int, body: NoteBody):
        with session() as conn:
            return guard(lambda: tz_mod.add_review_note(conn, tz_id, body.summary))

    @app.get("/tz")
    def tz_page():
        return FileResponse(STATIC_DIR / "tz.html")

    @app.get("/github")
    def github_page():
        return FileResponse(STATIC_DIR / "github.html")
