"""API босса, защиты и разбора плюс отдельная страница боя.

Отдельным модулем по образцу фазы 5: в общий app.py уходит одна строка регистрации.

Что здесь важно по механике. Экзамен не показывает, верно ли ответил ученик:
подсветка и объяснение это инструмент ежедневной петли, а на бою итог сообщается
один раз и целиком. Правильный ответ, как и везде в продукте, сервер наружу
не отдаёт совсем.
"""

from __future__ import annotations

from contextlib import contextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import boss as boss_mod
from .. import db, defense as defense_mod, devclock
from ..config import PROJECT_ROOT, Config

STATIC_DIR = PROJECT_ROOT / "static"


class AnswerBody(BaseModel):
    item_id: int
    choice: int


class ReviewBody(BaseModel):
    summary: str = ""


class DefenseBody(BaseModel):
    answers: list[str] = []


class CodeReport(BaseModel):
    boss_id: int
    item_id: int
    verdict: dict


class ClockBody(BaseModel):
    shift_sec: float | None = None
    shift_hours: float | None = None
    scale: float | None = None
    relative: bool = True


def register(app: FastAPI, cfg: Config) -> None:
    @contextmanager
    def session():
        conn = db.connect(cfg, create=False)
        try:
            yield conn
        finally:
            conn.close()

    def guard(func):
        """Ошибки босса это разговор с человеком, а не стектрейс."""
        try:
            return func()
        except boss_mod.BossError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/boss")
    def api_overview():
        with session() as conn:
            return boss_mod.overview(conn, cfg)

    @app.get("/api/boss/stage/{num}")
    def api_stage(num: int):
        with session() as conn:
            return guard(lambda: boss_mod.state(conn, cfg, num))

    @app.post("/api/boss/stage/{num}/start")
    def api_start(num: int):
        with session() as conn:
            return guard(lambda: boss_mod.start(conn, cfg, num))

    @app.post("/api/boss/attempt/{boss_id}/answer")
    def api_answer(boss_id: int, body: AnswerBody):
        with session() as conn:
            out = guard(lambda: boss_mod.answer(conn, cfg, boss_id, body.item_id, body.choice))
            row = boss_mod.row_by_id(conn, boss_id)
            out["state"] = boss_mod.state(conn, cfg, stage_num(conn, row))
            return out

    @app.post("/api/boss/attempt/{boss_id}/finish")
    def api_finish(boss_id: int):
        """Сдать досрочно: закрыть квиз-часть или весь бой, не дожидаясь таймера."""
        with session() as conn:
            def work():
                row = boss_mod.row_by_id(conn, boss_id)
                if row["status"] == "quiz":
                    boss_mod.finish_quiz(conn, cfg, row)
                elif row["status"] == "code":
                    boss_mod.finalize(conn, cfg, row)
                return boss_mod.state(conn, cfg, stage_num(conn, boss_mod.row_by_id(conn, boss_id)))

            return guard(work)

    @app.get("/api/boss/attempt/{boss_id}/miniset")
    def api_miniset(boss_id: int):
        with session() as conn:
            data = boss_mod.miniset_view(conn, boss_id)
            if data is None:
                raise HTTPException(status_code=404, detail="мини-сета по этому бою нет")
            return data

    @app.post("/api/boss/attempt/{boss_id}/review")
    def api_review(boss_id: int, body: ReviewBody):
        with session() as conn:
            out = guard(lambda: boss_mod.add_review(conn, boss_id, body.summary))
            row = boss_mod.row_by_id(conn, boss_id)
            out["state"] = boss_mod.state(conn, cfg, stage_num(conn, row))
            return out

    @app.post("/api/boss/check")
    def api_code_report(body: CodeReport):
        """Отчёт runner'а по код-части боя. Обычный XP кода здесь не платится."""
        with session() as conn:
            return guard(lambda: boss_mod.record_code(
                conn, cfg, body.boss_id, body.item_id, body.verdict
            ))

    @app.get("/api/defense/{defense_id}")
    def api_defense(defense_id: int):
        with session() as conn:
            row = conn.execute(
                "SELECT ref_type, ref_id FROM defenses WHERE id = ?", (defense_id,)
            ).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="нет такой защиты")
            return defense_mod.view(conn, row["ref_type"], row["ref_id"])

    @app.post("/api/defense/{defense_id}/submit")
    def api_defense_submit(defense_id: int, body: DefenseBody):
        with session() as conn:
            return guard(lambda: defense_mod.submit(conn, defense_id, body.answers))

    @app.post("/api/dev/clock")
    def api_clock(body: ClockBody):
        """Перевод часов для приёмок. В боевом профиле ручка отвечает отказом:
        сутки до реванша обязаны быть настоящими сутками."""
        if not cfg.is_sandbox:
            raise HTTPException(
                status_code=403,
                detail="часы переводятся только в песочнице, в боевом профиле время настоящее",
            )
        with session() as conn:
            shift = body.shift_sec
            if shift is None and body.shift_hours is not None:
                shift = body.shift_hours * 3600
            if shift is not None:
                devclock.set_shift(conn, cfg, shift, relative=body.relative)
            if body.scale is not None:
                devclock.set_scale(conn, cfg, body.scale)
            return devclock.status(conn, cfg)

    @app.get("/api/dev/clock")
    def api_clock_status():
        with session() as conn:
            return devclock.status(conn, cfg)

    @app.get("/boss")
    def boss_page():
        return FileResponse(STATIC_DIR / "boss.html")


def stage_num(conn, row) -> int:
    stage = conn.execute("SELECT num FROM stages WHERE id = ?", (row["stage_id"],)).fetchone()
    return stage["num"] if stage else 0
