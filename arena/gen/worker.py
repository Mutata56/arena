"""Воркер: берёт задание из очереди, зовёт модель, кладёт результат в банк.

Живёт двумя способами и это одна и та же функция:

- asyncio-задачей внутри сервера (вход в ноду сразу начинает наполнять банк);
- разовым проходом из CLI, его дёргает ночной таймер arena-gen.timer.

Вызов модели блокирующий, поэтому в сервере он уезжает в поток: петля дня не должна
подтормаживать, пока сонет пишет двенадцать вопросов.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sqlite3
import time
import traceback

from .. import db
from .. import config as config_mod
from ..config import Config
from . import (claude, difficulty, lexicon, notes, plan, prompts, queue, runtime,
               selfcheck, validate)

# Через сколько считать running-задание брошенным.
STALE_FACTOR = 2
# Пауза перед повтором после красного прогона. Ждать тут нечего: дело не в сети,
# а в содержании ответа, и следующий вызов всё равно идёт минуты.
RECHECK_DELAY_SEC = 0
# Инструменты модели по жанрам. Лёгким жанрам инструменты не нужны совсем,
# статьям нужен веб: их надо найти и открыть.
TOOLS = {"article": "WebSearch,WebFetch"}


def item_key(scope: str, item_type: str, payload: dict) -> str:
    """Естественный ключ записи: тот же вопрос дважды в банк не ляжет."""
    if item_type == "card":
        body = payload.get("front", "")
    elif item_type == "readcode":
        body = payload.get("question", "") + payload.get("code", "")
    elif item_type == "article":
        body = payload.get("url", "")
    elif item_type == "code":
        # У код-задачи нет ни q, ни opts: без своей ветки две разные задачи
        # на одной ноде получили бы один ключ, и вторая молча пропала бы.
        body = payload.get("title", "") + payload.get("statement_md", "")
    else:
        body = payload.get("q", "") + "".join(payload.get("opts", []))
    digest = hashlib.sha1(" ".join(body.split()).casefold().encode("utf-8")).hexdigest()[:16]
    return f"gen:{scope}:{item_type}:{digest}"


def insert_items(conn: sqlite3.Connection, genre: plan.Genre, payloads: list[dict],
                 node: sqlite3.Row | None, stage_id: int | None, day: str) -> int:
    """Положить готовые записи в банк. Дубли молча пропускаем."""
    item_type = genre.item_type or "quiz"
    scope = node["code"] if node is not None else f"stage{stage_id}"
    stamp = db.now()
    added = 0
    for payload in payloads:
        key = item_key(scope, item_type, payload)
        cur = conn.execute(
            "INSERT OR IGNORE INTO items(node_id, stage_id, type, payload, difficulty, source, "
            "source_key, active, suspended, created) VALUES (?, ?, ?, ?, ?, 'gen', ?, 1, 0, ?)",
            (node["id"] if node is not None else None, stage_id, item_type,
             json.dumps(payload, ensure_ascii=False),
             int(payload.get("difficulty", payload.get("lvl", 0))), key, stamp),
        )
        if cur.rowcount == 0:
            continue
        added += 1
        if item_type == "card":
            # Новая карточка входит в оборот как новая: last пустой, и очередь SM-2
            # берёт её из ветки новых, не считая просроченной.
            conn.execute(
                "INSERT OR IGNORE INTO card_state(item_id, ease, interval, reps, lapses, due, last) "
                "VALUES (?, 2.5, 0, 0, 0, ?, NULL)",
                (cur.lastrowid, day),
            )
    conn.commit()
    return added


def _context(node: sqlite3.Row | None, stage_id: int | None,
             conn: sqlite3.Connection | None = None) -> dict:
    return {
        "node_title": node["title"] if node is not None else "",
        "src": f"нода {node['code']}" if node is not None else f"этап {stage_id}",
        # Чем занят трек: java или sql. Часть проверок предметны — например
        # «программа целиком» имеет смысл для Java и не имеет для запроса.
        "lang": config_mod.track_of_code(node["code"]).lang if node is not None else "java",
        # Словарь будущих нод: валидатор режет записи, где всплыло слово,
        # до которого ученик ещё не дошёл.
        "ban": lexicon.ban_for(conn, node) if conn is not None else [],
    }


def finish_note(conn: sqlite3.Connection, cfg: Config, job: sqlite3.Row,
                node: sqlite3.Row | None, payload: dict, prompt: str, reply,
                model: str, bad: list[str], where: dict) -> dict:
    """Конспект это файл в волте, а не запись банка.

    Поэтому он не идёт через insert_items: у жанра нет типа item, и запись
    конспекта в items уехала бы в банк вопросов.
    """
    kind = "note"
    if node is None:
        queue.fail(conn, job["id"], "конспект без ноды")
        return {"status": "failed", "kind": kind, "error": "нет ноды"}
    try:
        written, path, note = notes.publish(conn, cfg, node, payload)
    except (OSError, PermissionError, LookupError) as exc:
        queue.fail(conn, job["id"], f"конспект не записан: {exc}")
        queue.log(conn, job, kind, "invalid", prompt=prompt, raw=reply.raw,
                  error=f"конспект не записан: {exc}", model=model,
                  seconds=reply.seconds, cost=reply.cost, **where)
        return {"status": "failed", "kind": kind, "error": str(exc)}
    print(f"  волт: конспект для {node['code']}, {note}")
    queue.finish(conn, job["id"], "; ".join(bad[:3]) if bad else "")
    queue.log(conn, job, kind, "ok", prompt=prompt, raw=reply.raw, error=note,
              model=model, seconds=reply.seconds, cost=reply.cost,
              produced=written, rejected=len(bad), **where)
    return {"status": "ok", "kind": kind, "added": written, "rejected": len(bad),
            "seconds": reply.seconds, "node": node["code"], "path": path, "note": note}


def run_job(conn: sqlite3.Connection, cfg: Config, job: sqlite3.Row) -> dict:
    """Выполнить одно задание. Наружу не бросает: любая беда это статус задания."""
    kind = job["kind"]
    genre = plan.BY_KIND.get(kind)
    if genre is None or not genre.ready:
        # Жанр, которого этот код не знает: так бывает после отката ветки или
        # правки руками. Не проваливаем, а оставляем в очереди и говорим вслух:
        # задание может стать выполнимым, когда жанр появится.
        conn.execute("UPDATE gen_queue SET status = 'pending' WHERE id = ?", (job["id"],))
        conn.commit()
        queue.log(conn, job, kind, "skipped", error=f"жанра {kind} этот конвейер не знает")
        return {"status": "skipped", "kind": kind}

    mode, bin_argv, why = runtime.mode(cfg)
    if mode == "off":
        conn.execute("UPDATE gen_queue SET status = 'pending' WHERE id = ?", (job["id"],))
        conn.commit()
        return {"status": "off", "kind": kind, "error": why}

    params = {}
    try:
        params = json.loads(job["params"] or "{}")
    except ValueError:
        params = {}
    count = int(params.get("count") or genre.count)

    node = plan.node_row(conn, job["node_id"]) if job["node_id"] else None
    stage_id = job["stage_id"] or (node["stage_id"] if node is not None else None)
    if kind == "article":
        stage = conn.execute("SELECT * FROM stages WHERE id = ?", (stage_id,)).fetchone()
        if stage is None:
            queue.fail(conn, job["id"], "нет этапа для статьи")
            return {"status": "failed", "kind": kind, "error": "нет этапа"}
        prompt = prompts.for_stage(conn, kind, stage, count)
    else:
        if node is None:
            queue.fail(conn, job["id"], "нет ноды для задания")
            return {"status": "failed", "kind": kind, "error": "нет ноды"}
        prompt = prompts.for_node(conn, kind, node, count, cfg=cfg)

    model = runtime.model_for(kind)
    hardness = difficulty.for_node(cfg, node) if node is not None else difficulty.for_stage(
        conn.execute("SELECT num FROM stages WHERE id = ?", (stage_id,)).fetchone()["num"]
        if stage_id else 0
    )
    effort = runtime.effort_for(kind, hardness)
    reply = claude.ask(
        prompt, bin_argv=bin_argv, model=model, tools=TOOLS.get(kind),
        timeout=runtime.timeout(), cwd=str(cfg.state_dir), effort=effort,
    )
    where = {"node_id": node["id"] if node is not None else None, "stage_id": stage_id}

    if reply.status == "limit":
        # Попытка НЕ сгорает: очередь просто ждёт окна (раздел 11).
        queue.defer(conn, job["id"], reply.retry_after, reply.error)
        queue.log(conn, job, kind, "limit", prompt=prompt, raw=reply.raw, error=reply.error,
                  model=model, seconds=reply.seconds, cost=reply.cost, **where)
        return {"status": "limit", "kind": kind, "retry_after": reply.retry_after,
                "error": reply.error}

    if reply.status == "error":
        outcome = queue.retry_or_fail(conn, job, reply.error)
        queue.log(conn, job, kind, "error", prompt=prompt, raw=reply.raw, error=reply.error,
                  model=model, seconds=reply.seconds, cost=reply.cost, **where)
        return {"status": outcome, "kind": kind, "error": reply.error}

    if reply.status == "invalid":
        queue.fail(conn, job["id"], reply.error)
        queue.log(conn, job, kind, "invalid", prompt=prompt, raw=reply.raw, error=reply.error,
                  model=model, seconds=reply.seconds, cost=reply.cost, **where)
        return {"status": "failed", "kind": kind, "error": reply.error}

    try:
        good, bad = validate.items(kind, reply.data or {}, _context(node, stage_id, conn))
    except validate.Bad as exc:
        queue.fail(conn, job["id"], str(exc))
        queue.log(conn, job, kind, "invalid", prompt=prompt, raw=reply.raw, error=str(exc),
                  model=model, seconds=reply.seconds, cost=reply.cost, **where)
        return {"status": "failed", "kind": kind, "error": str(exc)}

    if not good:
        why = "; ".join(bad[:3]) or "модель прислала пустой список"
        queue.fail(conn, job["id"], f"ни одной годной записи: {why}")
        queue.log(conn, job, kind, "invalid", prompt=prompt, raw=reply.raw,
                  error=f"ни одной годной записи: {why}", model=model,
                  seconds=reply.seconds, cost=reply.cost, rejected=len(bad), **where)
        return {"status": "failed", "kind": kind, "error": why}

    # Жёсткое правило раздела 11: код-задача и «что выведет» идут в банк только
    # после прогона. Красный это не провал задания сразу, а ретрай генерации:
    # модель ошиблась в содержании, и второй заход обычно выходит рабочим.
    checked: list[str] = []
    if kind in selfcheck.CHECKS:
        good, red, checked = selfcheck.run(cfg, kind, good)
        bad += red
        if not good:
            why = "; ".join(red[:2]) or "прогон ничего не подтвердил"
            outcome = queue.retry_or_fail(conn, job, f"прогон не подтвердил: {why}",
                                          delay=RECHECK_DELAY_SEC)
            queue.log(conn, job, kind, "red", prompt=prompt, raw=reply.raw,
                      error=f"прогон не подтвердил: {why}", model=model,
                      seconds=reply.seconds, cost=reply.cost, rejected=len(bad), **where)
            return {"status": outcome, "kind": kind, "error": why,
                    "node": node["code"] if node is not None else None}
        for line in checked:
            print(f"  прогон: {kind} для {node['code'] if node is not None else 'этапа'}, {line}")

    if kind == "note":
        return finish_note(conn, cfg, job, node, good[0], prompt, reply, model, bad, where)

    day = db.today()
    # Новые записи увеличивают запас атомов, а значит и цель дня. Правило захода 2б:
    # всё, что меняет запас, обязано сперва дать дню закрыться по старой цели,
    # иначе выполненный день останется без выплаты.
    from .. import contract
    contract.close_if_ready(conn, day)
    conn.commit()

    added = insert_items(conn, genre, good, node, stage_id, day)
    queue.finish(conn, job["id"], "; ".join(bad[:3]) if bad else "")
    queue.log(conn, job, kind, "ok", prompt=prompt, raw=reply.raw,
              error="; ".join(bad[:5]), model=model, seconds=reply.seconds, cost=reply.cost,
              produced=added, rejected=len(bad), **where)
    return {"status": "ok", "kind": kind, "added": added, "rejected": len(bad),
            "seconds": reply.seconds, "node": node["code"] if node is not None else None,
            "checked": checked}


WORKABLE = plan.WORKABLE_KINDS


def step(cfg: Config, conn: sqlite3.Connection | None = None,
         kinds: tuple[str, ...] = WORKABLE) -> dict | None:
    """Один цикл: подобрать брошенное, вернуть отложенное, выполнить одно задание."""
    own = conn is None
    conn = conn or db.connect(cfg, create=False)
    try:
        queue.reset_stale(conn, runtime.timeout() * STALE_FACTOR)
        queue.revive(conn)
        conn.commit()
        job = queue.claim(conn, kinds=kinds)
        if job is None:
            return None
        return run_job(conn, cfg, job)
    finally:
        if own:
            conn.close()


def drain(cfg: Config, limit: int = 50, on_event=None,
          kinds: tuple[str, ...] = WORKABLE, budget_sec: float = 0) -> dict:
    """Выполнить очередь целиком (или сколько разрешили). Синхронно, для CLI и таймера.

    budget_sec это потолок по времени: один живой вызов идёт минутами, и ночной
    проход обязан закончиться внутри своего окна, а не молотить до утра.
    Недоделанное остаётся в очереди и доедет следующей ночью или при входе в ноду.
    """
    done = {"ok": 0, "failed": 0, "skipped": 0, "limit": 0, "added": 0, "runs": 0}
    until = time.monotonic() + budget_sec if budget_sec else None
    conn = db.connect(cfg, create=False)
    try:
        for _ in range(max(1, limit)):
            if until is not None and time.monotonic() > until:
                done["out_of_time"] = True
                break
            result = step(cfg, conn, kinds=kinds)
            if result is None:
                break
            done["runs"] += 1
            status = result.get("status")
            if status == "ok":
                done["ok"] += 1
                done["added"] += result.get("added", 0)
            elif status == "failed":
                done["failed"] += 1
            elif status in ("skipped", "off"):
                done["skipped"] += 1
            elif status == "limit":
                done["limit"] += 1
            if on_event:
                on_event(result)
            if status in ("limit", "off", "skipped"):
                # Окно лимитов закрыто или жанр не наш: дальше по очереди идти незачем.
                break
    finally:
        conn.close()
    return done


async def loop(cfg: Config, stop: asyncio.Event) -> None:
    """Фоновая задача сервера. Не имеет права умереть от одной ошибки."""
    # Свежий процесс: ничего выполняться не может по определению, значит все
    # задания в статусе running брошены прошлым запуском. Подбираем сразу, а не
    # через сорок минут: перезапуск сервиса иначе замораживает очередь.
    try:
        conn = db.connect(cfg, create=False)
        try:
            revived = queue.reset_stale(conn, 0)
            conn.commit()
        finally:
            conn.close()
        if revived:
            print(f"подобрано брошенных заданий: {revived}")
    except Exception:  # noqa: BLE001
        traceback.print_exc()
    idle = runtime.poll_sec()
    while not stop.is_set():
        pause = idle
        try:
            result = await asyncio.to_thread(step, cfg)
            if result is not None:
                pause = 0.5
                if result.get("status") == "limit":
                    print(f"генерация ждёт окна лимитов до {result.get('retry_after')}")
                elif result.get("status") == "ok":
                    print(f"сгенерено: {result.get('kind')} для {result.get('node')}, "
                          f"записей {result.get('added')}")
                elif result.get("status") == "failed":
                    print(f"генерация не вышла ({result.get('kind')}): {result.get('error')}")
        except Exception:  # noqa: BLE001
            # Упавший воркер не должен утащить за собой сервер и не должен замолчать навсегда.
            print("воркер генерации споткнулся:\n" + traceback.format_exc())
            pause = max(idle, 5.0)
        try:
            await asyncio.wait_for(stop.wait(), timeout=pause)
        except asyncio.TimeoutError:
            pass
