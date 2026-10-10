"""HTTP-сервер ежедневной петли.

Слушает только 127.0.0.1. Соединение с базой открывается на каждый запрос:
SQLite не любит переезды между потоками, а файл лежит рядом и открывается мгновенно.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import urllib.parse
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import season_api
from .site_api import drill_count as site_drill_count
from .. import config, contract, db, feed, gen, pace, progress, review, srs, xp
from ..config import Config, PROJECT_ROOT, load

STATIC_DIR = PROJECT_ROOT / "static"
HOST = "127.0.0.1"
PORT = 8791


class QuizAnswer(BaseModel):
    item_id: int
    choice: int


class CardAnswer(BaseModel):
    item_id: int
    grade: str


class NodeClose(BaseModel):
    note: str = ""


class NodesKnow(BaseModel):
    codes: list[str] = []


def obsidian_url(cfg: Config, path: str | None) -> str | None:
    if not path:
        return None
    vault = urllib.parse.quote(cfg.vault_root.name)
    file = urllib.parse.quote(path[:-3] if path.endswith(".md") else path)
    return f"obsidian://open?vault={vault}&file={file}"


def create_app(cfg: Config | None = None) -> FastAPI:
    cfg = cfg or load()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        """Фоновый воркер генерации живёт ровно столько, сколько сервер."""
        allowed, why = gen.runtime.worker_allowed(cfg)
        stop = asyncio.Event()
        task = None
        if allowed:
            task = asyncio.create_task(gen.worker.loop(cfg, stop))
            print("конвейер генерации запущен")
        else:
            print(f"конвейер генерации не запущен: {why}")
        try:
            yield
        finally:
            stop.set()
            if task is not None:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    app = FastAPI(title="arena", docs_url=None, redoc_url=None, lifespan=lifespan)

    @contextmanager
    def session():
        conn = db.connect(cfg, create=False)
        try:
            yield conn
        finally:
            conn.close()

    def quiz_payload(row: sqlite3.Row) -> dict:
        data = json.loads(row["payload"])
        # У «чужого кода» вопрос лежит в поле question, а сам сниппет обязателен.
        return {
            "item_id": row["id"],
            "q": data.get("q") or data.get("question", ""),
            "code": data.get("code"),
            "opts": data["opts"],
            "topic": data.get("topic", ""),
            "lvl": data.get("lvl", 0),
        }

    @app.get("/api/today")
    def api_today():
        # Такт гонки: ученик перед экраном, значит это в том числе «вернулся».
        season_api.touch(cfg, present=True)
        with session() as conn:
            snapshot = contract.state(conn, mark_entry=True)
            if snapshot["node"]:
                snapshot["node"]["obsidian_url"] = obsidian_url(cfg, snapshot["node"]["obsidian_path"])
                node_row = progress.node_by_code(conn, snapshot["node"]["code"])
                if node_row is not None:
                    snapshot["node_progress"] = progress.evaluate(conn, node_row["id"])
                    nxt = conn.execute(
                        "SELECT n.code, n.title FROM nodes n WHERE n.stage_id = ? AND n.seq > ? "
                        "AND n.status != 'closed' ORDER BY n.seq LIMIT 1",
                        (node_row["stage_id"], node_row["seq"]),
                    ).fetchone()
                    snapshot["next_node"] = ({"code": nxt["code"], "title": nxt["title"]}
                                             if nxt is not None else None)
            snapshot["env"] = cfg.env
            return snapshot

    @app.get("/api/quiz/next")
    def api_quiz_next():
        with session() as conn:
            day = db.today()
            node = contract.current_node(conn)
            source, rows = contract.quiz_candidates(conn, node, day, limit=1)
            if not rows:
                return {"item_id": None, "source": None}
            out = quiz_payload(rows[0])
            out["source"] = source
            out["source_title"] = contract.SOURCE_TITLES.get(source or "", "")
            return out

    @app.get("/api/next")
    def api_next():
        """Следующее задание. Занятие идёт потоком и само переходит на новую ноду.

        Порядок: материал текущей ноды, потом пул этапа и повторение пройденного,
        а карточки вклиниваются каждым пятым атомом. Если у текущей ноды на сегодня
        всё, берём в работу следующую ноду по траектории и продолжаем с неё.
        """
        with session() as conn:
            day = db.today()
            node = contract.current_node(conn)
            state = contract.state(conn, day)
            done = state["contract"]["quiz_done"] + state["contract"]["cards_done"]
            cards = srs.queue(conn, day, limit=1)

            def card_out(row):
                data = json.loads(row["payload"])
                return {"item_id": row["id"], "kind": "card", "front": data["front"],
                        "back": data["back"], "src": data.get("src", ""),
                        "is_new": row["reps"] == 0,
                        "node_code": node["code"] if node is not None else None}

            def quiz_out(row, source, code):
                out = quiz_payload(row)
                out["kind"] = "quiz"
                out["source"] = source
                out["source_title"] = contract.SOURCE_TITLES.get(source or "", "")
                out["node_code"] = code
                return out

            if cards and done % 5 == 4:
                return card_out(cards[0])

            source, rows = contract.quiz_candidates(conn, node, day, limit=1)
            if rows:
                return quiz_out(rows[0], source, node["code"] if node is not None else None)

            # У текущей ноды на сегодня пусто. Идём вперёд по траектории и берём
            # первую ноду, у которой есть чем заняться. Вход в неё это ещё и триггер
            # генерации, так что следующая за ней начнёт наполняться заранее.
            if node is not None:
                upcoming = conn.execute(
                    "SELECT n.*, s.num AS stage_num, s.title AS stage_title FROM nodes n "
                    "JOIN stages s ON s.id = n.stage_id "
                    "WHERE n.status != 'closed' AND n.id != ? "
                    "AND (s.num > ? OR (s.num = ? AND n.seq > ?)) "
                    "AND s.in_track = 1 ORDER BY s.num, n.seq LIMIT 8",
                    (node["id"], node["stage_num"], node["stage_num"], node["seq"]),
                ).fetchall()
                for cand in upcoming:
                    _, cand_rows = contract.quiz_candidates(conn, cand, day, limit=1)
                    if not cand_rows:
                        continue
                    contract.enter_node(conn, cand["id"])
                    conn.commit()
                    return quiz_out(cand_rows[0], "node", cand["code"])

            if cards:
                return card_out(cards[0])
            return {"item_id": None, "kind": None}

    @app.post("/api/quiz/answer")
    def api_quiz_answer(body: QuizAnswer):
        with session() as conn:
            try:
                result = contract.answer_quiz(conn, body.item_id, body.choice, cfg=cfg)
            except LookupError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            result["state"] = contract.state(conn)
            return result

    @app.get("/api/cards/next")
    def api_cards_next():
        with session() as conn:
            day = db.today()
            rows = srs.queue(conn, day, limit=1)
            if not rows:
                return {"item_id": None}
            data = json.loads(rows[0]["payload"])
            return {
                "item_id": rows[0]["id"],
                "front": data["front"],
                "back": data["back"],
                "src": data.get("src", ""),
                "is_new": rows[0]["reps"] == 0,
            }

    @app.post("/api/cards/answer")
    def api_cards_answer(body: CardAnswer):
        with session() as conn:
            try:
                result = contract.answer_card(conn, body.item_id, body.grade)
            except (LookupError, ValueError) as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            result["state"] = contract.state(conn)
            return result

    @app.post("/api/items/{item_id}/suspend")
    def api_suspend(item_id: int):
        with session() as conn:
            cur = conn.execute("UPDATE items SET suspended = 1 WHERE id = ?", (item_id,))
            if cur.rowcount == 0:
                conn.commit()
                raise HTTPException(status_code=404, detail="нет такой записи")
            # Снятый вопрос уменьшает запас, а значит и цель дня. Тот же случай,
            # что и смена ноды: день может оказаться выполненным прямо сейчас,
            # и заплатить за него больше некому, отвечать уже не на что.
            contract_xp = contract.close_if_ready(conn, db.today())
            conn.commit()
            return {"ok": True, "contract_xp": contract_xp}

    @app.get("/api/item/{item_id}")
    def api_item(item_id: int):
        """Один конкретный атом, чтобы его можно было взять в работу с экрана ноды."""
        with session() as conn:
            row = conn.execute(
                "SELECT i.id, i.type, i.payload, n.code AS node_code FROM items i "
                "LEFT JOIN nodes n ON n.id = i.node_id WHERE i.id = ? AND i.active = 1",
                (item_id,),
            ).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="нет такой записи")
            data = json.loads(row["payload"])
            if row["type"] in ("quiz", "readcode"):
                out = quiz_payload(row)
                out["kind"] = row["type"]
                out["node_code"] = row["node_code"]
                out["source_title"] = ("чужой код" if row["type"] == "readcode"
                                       else "вопрос по ноде")
                return out
            if row["type"] == "card":
                return {"item_id": row["id"], "kind": "card", "front": data["front"],
                        "back": data["back"], "src": data.get("src", ""),
                        "node_code": row["node_code"], "is_new": True}
            if row["type"] == "code":
                return {"item_id": row["id"], "kind": "code",
                        "title": data.get("title", "код-задача"),
                        "node_code": row["node_code"],
                        "statement_md": data.get("statement_md", ""),
                        "command": f"arena task {data.get('node_code', '')}".strip()}
            raise HTTPException(status_code=400, detail="этот атом пока не играется")

    @app.get("/api/gen/now")
    def api_gen_now():
        """Что делает конвейер прямо сейчас: строка в шапке, чтобы фон не был
        чёрным ящиком. Подробности и журнал отдаёт /api/gen/status."""
        with session() as conn:
            row = conn.execute(
                "SELECT q.kind, q.status, q.started_at, n.code FROM gen_queue q "
                "LEFT JOIN nodes n ON n.id = q.node_id WHERE q.status = 'running' "
                "ORDER BY q.started_at LIMIT 1"
            ).fetchone()
            waiting = conn.execute(
                "SELECT COUNT(*) FROM gen_queue WHERE status IN ('pending', 'deferred')"
            ).fetchone()[0]
            today_log = conn.execute(
                "SELECT COUNT(*) n, COALESCE(SUM(produced), 0) items, "
                "COALESCE(ROUND(SUM(seconds) / 60), 0) minutes "
                "FROM gen_log WHERE date(ts) = date('now', 'localtime') AND status = 'ok'"
            ).fetchone()
            titles = {"quiz": "вопросы", "cards": "карточки", "readcode": "чужой код",
                      "code": "код-задача", "note": "конспект", "article": "статьи"}
            return {
                "running": ({"kind": row["kind"], "title": titles.get(row["kind"], row["kind"]),
                             "node": row["code"], "started_at": row["started_at"]}
                            if row is not None else None),
                "waiting": waiting,
                "today": {"jobs": today_log["n"], "items": today_log["items"],
                          "minutes": today_log["minutes"]},
                "worker": gen.runtime.worker_allowed(cfg)[0],
            }

    @app.get("/api/review/plan")
    def api_review_plan():
        """Расписание повторения: когда придёт и сколько его."""
        with session() as conn:
            return review.plan(conn)

    @app.get("/api/review/queue")
    def api_review_queue(limit: int = review.SESSION, kind: str | None = None):
        """Очередь сессии повторения. kind=weak|cards|stale — только одна категория
        (клик по счётчику), иначе смешанная (промахи → карточки → давнее)."""
        only = kind if kind in ("weak", "cards", "stale") else None
        with session() as conn:
            items = review.queue(conn, limit=max(1, min(limit, 60)), only=only)
            # Правильные ответы наружу не отдаём даже здесь.
            for it in items:
                it.pop("ans", None)
                it.pop("exp", None)
            return {"items": items}

    @app.get("/api/ledger")
    def api_ledger(limit: int = 20):
        with session() as conn:
            rows = conn.execute(
                "SELECT ts, amount, reason FROM xp_ledger ORDER BY id DESC LIMIT ?",
                (max(1, min(limit, 200)),),
            ).fetchall()
            titles = {
                xp.QUIZ_FIRST: "Клиент A ответ",
                xp.QUIZ_REPEAT: "повтор вопроса",
                xp.QUIZ_BLOCK: "блок вопросов без промахов",
                xp.CARD: "карточка повторена",
                xp.CONTRACT: "контракт дня закрыт",
                xp.NODE_CLOSED: "нода закрыта",
                xp.CODE: "код-задача сдана",
                xp.BOSS: "босс этапа",
                xp.DEFENSE: "защита решения",
                xp.TZ: "ТЗ этапа принято",
                xp.REVIEW: "разбор с ИИ после сдачи",
                xp.ARTICLE: "статья прочитана",
                xp.JAVARUSH: "внешний подвиг",
                xp.FIELD_BOSS: "полевой босс: собеседование",
            }
            return [
                {"ts": r["ts"], "amount": r["amount"], "reason": r["reason"],
                 "title": titles.get(r["reason"], r["reason"])}
                for r in rows
            ]

    @app.get("/api/tracks")
    def api_tracks():
        """Разделы сайта. Фронт по ним рисует переключатель и знает,
        каким движком гонять задачник."""
        with session() as conn:
            counts = {
                r["track"]: (r["stages"], r["nodes"], r["closed"])
                for r in conn.execute(
                    "SELECT s.track AS track, COUNT(DISTINCT s.id) AS stages, "
                    "  COUNT(n.id) AS nodes, "
                    "  SUM(CASE WHEN n.status = 'closed' THEN 1 ELSE 0 END) AS closed "
                    "FROM stages s LEFT JOIN nodes n ON n.stage_id = s.id GROUP BY s.track"
                )
            }
        out = []
        for t in config.TRACKS:
            stages, nodes, closed = counts.get(t.key, (0, 0, 0))
            if not stages:
                continue
            out.append({"key": t.key, "title": t.title, "subtitle": t.subtitle,
                        "lang": t.lang, "prefix": t.code_prefix, "offset": t.stage_offset,
                        "stages": stages, "nodes": nodes, "closed": closed or 0})
        return {"tracks": out, "default": config.DEFAULT_TRACK.key}

    @app.get("/api/map")
    def api_map(track: str = config.DEFAULT_TRACK.key):
        picked = config.TRACK_BY_KEY.get(track) or config.DEFAULT_TRACK
        with session() as conn:
            current = contract.current_node(conn)
            # Побеждённые боссы: без этого карта писала «босс ждёт» и после того,
            # как бой сдан на ранг S. Флаг считался только по числу закрытых нод.
            beaten = {}
            for row in conn.execute(
                "SELECT s.num AS num, b.rank AS rank FROM bosses b "
                "JOIN stages s ON s.id = b.stage_id "
                "WHERE b.kind = 'stage' AND b.passed = 1"
            ):
                beaten[row["num"]] = row["rank"]
            stages = []
            for r in progress.stage_rows(conn, picked.key):
                need = progress.boss_at(r["total"])
                stages.append({
                    "num": r["num"],
                    # Номер, под которым этап живёт в волте: в базе он смещён,
                    # а человеку показывать надо «этап 2», а не «этап 102».
                    "shown": picked.vault_num(r["num"]),
                    "title": r["title"],
                    "in_track": bool(r["in_track"]),
                    "total": r["total"],
                    "closed": r["closed"],
                    "working": r["working"],
                    "locked": r["total"] > 0 and r["locked"] == r["total"],
                    "done": r["total"] > 0 and r["closed"] == r["total"],
                    "boss_at": need,
                    "boss_ready": (r["total"] > 0 and r["closed"] >= need
                                   and r["num"] not in beaten),
                    "boss_passed": r["num"] in beaten,
                    "boss_rank": beaten.get(r["num"]),
                    "current": bool(current is not None and current["stage_num"] == r["num"]),
                })
            if picked.in_track:
                closed, total = pace.track_left(conn)
                eta = pace.eta(conn)
                head = current["code"] if current is not None else None
            else:
                # У второго раздела нет ни траектории, ни ETA: он идётся свободно.
                closed = sum(s["closed"] for s in stages)
                total = sum(s["total"] for s in stages)
                eta = None
                head = current["code"] if (
                    current is not None and picked.owns_stage(current["stage_num"])) else None
            return {
                "stages": stages,
                "trackKey": picked.key,
                "trackTitle": picked.title,
                "inTrack": picked.in_track,
                "track": {"closed": closed, "total": total},
                "eta": eta,
                "current": head,
            }

    @app.get("/api/map/stage/{num}")
    def api_map_stage(num: int):
        with session() as conn:
            stage = conn.execute("SELECT * FROM stages WHERE num = ?", (num,)).fetchone()
            if stage is None:
                raise HTTPException(status_code=404, detail="нет такого этапа")
            rows = conn.execute(
                "SELECT n.*, "
                "  (SELECT COUNT(*) FROM items i WHERE i.node_id = n.id AND i.active = 1 "
                "   AND i.suspended = 0 AND i.type IN ('quiz', 'code', 'readcode')) AS bank "
                "FROM nodes n WHERE n.stage_id = ? ORDER BY n.seq",
                (stage["id"],),
            ).fetchall()
            # Что конвейер делает с нодами этого этапа прямо сейчас.
            gen_state = {
                r["code"]: r["state"]
                for r in conn.execute(
                    "SELECT n.code AS code, "
                    "  CASE WHEN SUM(q.status = 'running') > 0 THEN 'running' "
                    "       WHEN SUM(q.status = 'deferred') > 0 THEN 'deferred' "
                    "       ELSE 'pending' END AS state "
                    "FROM gen_queue q JOIN nodes n ON n.id = q.node_id "
                    "WHERE n.stage_id = ? AND q.status IN ('pending', 'running', 'deferred') "
                    "GROUP BY n.code",
                    (stage["id"],),
                )
            }
            closed = sum(1 for r in rows if r["status"] == "closed")
            need = progress.boss_at(len(rows))
            beaten = conn.execute(
                "SELECT COUNT(*) FROM bosses WHERE stage_id = ? AND kind = 'stage' AND passed = 1",
                (stage["id"],),
            ).fetchone()[0] > 0
            picked = config.track_of_stage(stage["num"])
            return {
                "num": stage["num"],
                "shown": picked.vault_num(stage["num"]),
                "trackKey": picked.key,
                "lang": picked.lang,
                "title": stage["title"],
                "in_track": bool(stage["in_track"]),
                "boss": {
                    "need": need,
                    "closed": closed,
                    "ready": bool(rows) and closed >= need,
                    "passed": beaten,
                },
                "nodes": [
                    {"code": r["code"], "title": r["title"], "kind": r["kind"],
                     "status": r["status"], "bank": r["bank"], "closed_by": r["closed_by"],
                     "has_note": bool(r["obsidian_path"]),
                     # Задачник открывается и на банке из БД, и на заданиях прямо
                     # в конспекте. Считаем оба: иначе нода с двадцатью задачами
                     # в тексте выглядит в списке пустой. Задания конспекта отдаём
                     # ещё и отдельным числом: только по нему карта может понять,
                     # всё ли решено, — их прогресс живёт в браузере, а не в БД.
                     "note_tasks": site_drill_count(cfg, r["obsidian_path"]),
                     "drill": r["bank"] + site_drill_count(cfg, r["obsidian_path"]),
                     "gen": gen_state.get(r["code"])}
                    for r in rows
                ],
            }

    @app.get("/api/node/{code}")
    def api_node(code: str):
        with session() as conn:
            node = progress.node_by_code(conn, code)
            if node is None:
                raise HTTPException(status_code=404, detail="нет такой ноды")
            view = progress.node_view(conn, node)
            view["obsidian_url"] = obsidian_url(cfg, view["obsidian_path"])
            return view

    @app.post("/api/node/{code}/enter")
    def api_node_enter(code: str):
        with session() as conn:
            try:
                view = progress.enter(conn, code)
            except LookupError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            except PermissionError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            view["obsidian_url"] = obsidian_url(cfg, view["obsidian_path"])
            view["state"] = contract.state(conn)
            return view

    @app.post("/api/node/{code}/close")
    def api_node_close(code: str, body: NodeClose):
        with session() as conn:
            try:
                result = progress.close(conn, cfg, code, body.note)
            except LookupError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            except PermissionError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            result["state"] = contract.state(conn)
            return result

    @app.post("/api/node/{code}/know")
    def api_node_know(code: str):
        """Закрыть ноду отметкой «знаю»: без XP, без цели дня, но по-настоящему."""
        with session() as conn:
            try:
                result = progress.know(conn, cfg, code)
            except LookupError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            except PermissionError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            result["state"] = contract.state(conn)
            return result

    @app.post("/api/nodes/know")
    def api_nodes_know(body: NodesKnow):
        """Отметить «знаю» на пачке нод: выделение на карте этапа.

        Отдаёт разбор по каждой ноде, а не одно «готово»: часть могла не
        закрыться (заперта, уже закрыта), и человек должен видеть, какая именно.
        """
        if len(body.codes) > 200:
            raise HTTPException(status_code=400, detail="слишком много нод за раз")
        with session() as conn:
            results = progress.know_many(conn, cfg, body.codes)
            return {"results": results, "state": contract.state(conn)}

    @app.get("/api/feed")
    def api_feed(days: int = 21):
        with session() as conn:
            return feed.build(conn, db.today(), days_limit=max(1, min(days, 90)))

    @app.get("/api/gen/status")
    def api_gen_status(limit: int = 10):
        with session() as conn:
            mode, _argv, why = gen.runtime.mode(cfg)
            return {
                "mode": mode,
                "why": why,
                "queue": gen.queue.counts(conn),
                "deferred_until": gen.queue.deferred_until(conn),
                "log": gen.queue.recent_log(conn, max(1, min(limit, 100))),
            }

    @app.post("/api/gen/kick")
    def api_gen_kick(code: str | None = None):
        """Пнуть конвейер руками: поставить задания на ноду и на пять вперёд."""
        with session() as conn:
            node = progress.node_by_code(conn, code) if code else contract.current_node(conn)
            if node is None:
                raise HTTPException(status_code=404, detail="не нашёл, для какой ноды генерить")
            result = gen.trigger(conn, node["id"])
            conn.commit()
            result["node"] = node["code"]
            result["queue"] = gen.queue.counts(conn)
            return result

    @app.get("/")
    def index():
        """Главная это учебный сайт: страница открывается там, где ты остановился."""
        return FileResponse(STATIC_DIR / "site" / "index.html")

    @app.get("/classic")
    def classic():
        """Прежний дашборд-петля. Никуда не делся, живёт по своему адресу."""
        return FileResponse(STATIC_DIR / "index.html")

    @app.exception_handler(sqlite3.Error)
    def sqlite_error(_request, exc: sqlite3.Error):
        return JSONResponse(status_code=500, content={"detail": f"база ответила ошибкой: {exc}"})

    from .boss_api import register as register_boss
    from .site_api import register as register_site
    from .stats_api import register as register_stats
    from .tasks_api import register as register_tasks
    from .tz_api import register as register_tz

    register_tasks(app, cfg, session)
    register_site(app, cfg, session)
    season_api.register(app, cfg)
    register_boss(app, cfg)
    register_tz(app, cfg)
    register_stats(app, cfg)


    # Локальный инструмент: статику не кешируем, чтобы правки app.js/css/html
    # подхватывались сразу, без ручного сброса кеша браузера.
    @app.middleware("http")
    async def _no_cache_static(request, call_next):
        resp = await call_next(request)
        if request.url.path.startswith("/static/") or request.url.path in ("/", "/classic"):
            resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return resp

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    return app


def serve(cfg: Config | None = None, host: str = HOST, port: int = PORT) -> None:
    import uvicorn

    cfg = cfg or load()
    if not cfg.db_path.exists():
        raise SystemExit(f"базы нет ({cfg.db_path}). Сначала arena sync")
    print(f"arena слушает http://{host}:{port} ({cfg.describe()})")
    uvicorn.run(create_app(cfg), host=host, port=port, log_level="warning")
