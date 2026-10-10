"""API соперника, сезонов и кампании плюс отдельная страница «Сезон».

Отдельным модулем нарочно: фаза 5 шла параллельно с картой и runner'ом,
и общий app.py трогать было нельзя. Регистрация одной строкой из create_app.

Что здесь важно по тону (раздел 9 плана): математика горизонта отдаётся ровно
двумя ручками, /api/campaign/eta для строки на карте и чекпоинт в /api/campaign.
На экране «Сезон» сроков нет вообще. Слова «отставание» и процентов от нужного
темпа в ответах не бывает, это проверяется приёмкой фазы.
"""

from __future__ import annotations

import datetime as dt
import sqlite3
import threading
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import campaign as campaign_mod
from .. import db, seasons, taunts
from ..config import PROJECT_ROOT, Config

STATIC_DIR = PROJECT_ROOT / "static"
_refresh_lock = threading.Lock()
_refreshing = False


class BranchChoice(BaseModel):
    months: int


class CampaignStart(BaseModel):
    # Профиль вызывающего. Порт у сервера один на оба профиля, поэтому команда
    # из песочницы иначе спокойно достучалась бы до боевого сервера и начала
    # кампанию в боевой базе. Один раз это уже чуть не случилось на приёмке.
    env: str | None = None


def refresh_taunts_async(cfg: Config) -> None:
    """Недельная пачка реплик. Крутится в отдельном потоке: вызов claude идёт
    минуты, а экран «Сегодня» ждать не должен. Пока пачки нет, работают шаблоны."""
    global _refreshing
    with _refresh_lock:
        if _refreshing:
            return
        _refreshing = True

    def work() -> None:
        global _refreshing
        try:
            conn = db.connect(cfg, create=False)
            try:
                if taunts.due(conn):
                    report = taunts.refresh(conn)
                    print(f"пачка реплик Опуса: добавлено {report['added']}, "
                          f"отклонено {len(report['rejected'])}"
                          + (f", беда: {report['error']}" if report["error"] else ""))
            finally:
                conn.close()
        except Exception as exc:  # noqa: BLE001
            print(f"пачку реплик обновить не вышло: {exc}")
        finally:
            _refreshing = False

    threading.Thread(target=work, daemon=True, name="arena-taunts").start()


def register(app: FastAPI, cfg: Config) -> None:
    @contextmanager
    def session():
        conn = db.connect(cfg, create=False)
        try:
            yield conn
        finally:
            conn.close()

    def beat(conn: sqlite3.Connection, present: bool = False) -> None:
        seasons.heartbeat(conn, present=present)

    @app.get("/api/season")
    def api_season():
        with session() as conn:
            beat(conn)
            return seasons.board(conn)

    @app.get("/api/bot/feed")
    def api_feed(limit: int = 20):
        with session() as conn:
            return seasons.feed(conn, limit=limit)

    @app.get("/api/campaign")
    def api_campaign():
        with session() as conn:
            beat(conn)
            return campaign_mod.board(conn)

    @app.get("/api/campaign/checkpoint")
    def api_checkpoint():
        with session() as conn:
            beat(conn)
            return campaign_mod.checkpoint(conn, mark=True)

    @app.get("/api/campaign/eta")
    def api_eta():
        """Строка для вкладки Карта. Отдаём отдельным полем, чтобы карта
        просто печатала текст и не считала сроки сама."""
        with session() as conn:
            data = campaign_mod.eta(conn)
            return {"eta_text": data["text"], **data}

    @app.post("/api/campaign/start")
    def api_campaign_start(body: CampaignStart | None = None):
        """Ручку зовёт только `arena campaign start`. Кнопки в интерфейсе нет
        и не будет: кампания начинается решением человека, а не случайным кликом."""
        want = (body.env if body else None) or cfg.env
        if want != cfg.env:
            raise HTTPException(
                status_code=409,
                detail=(f"команда идёт из профиля {want}, а сервер поднят в {cfg.env}. "
                        f"Кампанию стартуют там же, где живёт база."),
            )
        with session() as conn:
            was = campaign_mod.started(conn)
            row = campaign_mod.start(conn)
            return {
                "already": was,
                "start_date": row["start_date"],
                "checkpoint_at": row["checkpoint_at"],
                "target_days": row["target_days"],
            }

    @app.post("/api/campaign/branch")
    def api_branch(body: BranchChoice):
        with session() as conn:
            try:
                return campaign_mod.choose(conn, body.months)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            except LookupError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/bot/beat")
    def api_beat(present: bool = True):
        """Такт гонки. Экран «Сегодня» дёргает его с present=1: раскатка после
        паузы включается только когда человек действительно вернулся."""
        with session() as conn:
            seasons.heartbeat(conn, present=present)
            refresh_taunts_async(cfg)
            return seasons.board(conn)

    @app.get("/season")
    def season_page():
        return FileResponse(STATIC_DIR / "season.html")

    @app.get("/api/taunts")
    def api_taunts(kind: str | None = None, limit: int = 200):
        """Пачка реплик целиком: её положено читать глазами перед выпуском."""
        with session() as conn:
            taunts.ensure_pack(conn)
            conn.commit()
            sql = "SELECT kind, text, source, used_count FROM taunts"
            args: tuple = ()
            if kind:
                sql += " WHERE kind = ?"
                args = (kind,)
            sql += " ORDER BY kind, id LIMIT ?"
            rows = conn.execute(sql, (*args, max(1, min(limit, 1000)))).fetchall()
            return {
                "kinds": taunts.KINDS,
                "stats": taunts.pack_stats(conn),
                "last_refresh": taunts.last_refresh(conn),
                "items": [dict(r) for r in rows],
            }


def touch(cfg: Config, present: bool = True, at: dt.datetime | None = None) -> None:
    """Такт из чужого обработчика (экран «Сегодня»). Молчит при любой беде:
    гонка это украшение петли, а не её несущая стена."""
    try:
        conn = db.connect(cfg, create=False)
        try:
            seasons.heartbeat(conn, at=at, present=present)
        finally:
            conn.close()
        refresh_taunts_async(cfg)
    except Exception as exc:  # noqa: BLE001
        print(f"такт гонки пропущен: {exc}")
