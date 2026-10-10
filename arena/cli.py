"""CLI arena: все команды продукта, от синка роадмапа до бэкапа базы.

Часть команд работает с базой напрямую (sync, import, stats, gen, backup),
часть ходит на сервер по HTTP (task, check, tz, campaign). Разделение
описано в разделе 2 плана.
"""

from __future__ import annotations

import argparse
import sys

from . import backup as backup_mod
from . import config as config_mod
from . import db as db_mod
from . import stats as stats_mod
from .importers import html_tests, jcards
from .roadmap import sync as sync_roadmap


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="arena", description="тренажёр Java: боссы, соперник, реальный код")
    p.add_argument("--sandbox", action="store_true", help="запуск в песочнице (профиль dev)")
    p.add_argument("--env", choices=("prod", "dev"), help="явный профиль, перекрывает ARENA_ENV")
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("init", help="создать базу и схему")
    p_sync = sub.add_parser("sync", help="прочитать роадмап из Obsidian")
    p_sync.add_argument("--track", default="all",
                        choices=["all", *config_mod.TRACK_BY_KEY],
                        help="какой раздел синкать (по умолчанию все)")

    imp = sub.add_parser("import", help="импорт HTML-тестов, карточек jcards, код-задач и ТЗ")
    imp.add_argument("--html", action="store_true", help="только HTML-тесты")
    imp.add_argument("--jcards", action="store_true", help="только карточки jcards")
    imp.add_argument("--code", action="store_true", help="только код-задачи из content/code")
    imp.add_argument("--tz", action="store_true", help="только постановки ТЗ из content/tz")
    imp.add_argument("--verify", action="store_true",
                     help="прогнать эталоны ТЗ перед засевом (медленно, но честно)")
    imp.add_argument("--no-archive", action="store_true", help="не копировать исходники в import/")

    st = sub.add_parser("stats", help="что лежит в базе")
    st.add_argument("--full", action="store_true", help="таблица по этапам")

    srv = sub.add_parser("serve", help="поднять веб-петлю на localhost")
    srv.add_argument("--port", type=int, default=None, help="порт, по умолчанию 8791")
    srv.add_argument("--host", default=None, help="адрес, по умолчанию 127.0.0.1")

    sub.add_parser("today", help="сводка дня в терминале")
    sub.add_parser("season", help="счёт текущего сезона и лента Опуса")

    camp = sub.add_parser("campaign", help="кампания: старт, статус, ветка горизонта")
    camp.add_argument("action", choices=("start", "status", "branch"), nargs="?", default="status")
    camp.add_argument("--months", type=int, choices=(6, 9, 12),
                      help="ветка горизонта для campaign branch")

    tnt = sub.add_parser("taunts", help="пачка реплик Опуса")
    tnt.add_argument("--refresh", action="store_true", help="сгенерировать свежую пачку")
    tnt.add_argument("--force", action="store_true", help="не ждать недельного срока")
    tnt.add_argument("--kind", help="показать только один вид")

    tsk = sub.add_parser("task", help="выдать код-задачу в портфель решений")
    tsk.add_argument("node", nargs="?", help="код ноды, по умолчанию текущая")
    tsk.add_argument("--force", action="store_true",
                     help="перезаписать стартовые файлы (решение будет потеряно)")
    tsk.add_argument("--list", action="store_true", help="показать все код-задачи банка")
    tsk.add_argument("--boss", action="store_true", help="код-часть идущего боя с боссом")
    tsk.add_argument("--port", type=int, default=None, help="порт сервера")

    bs = sub.add_parser("boss", help="босс этапа: доступность, счёт последнего боя")
    bs.add_argument("stage", nargs="?", type=int, help="номер этапа, по умолчанию ближайший")

    tzc = sub.add_parser("tz", help="ТЗ этапа: выдать, сдать, посмотреть постановку")
    tzc.add_argument("action", nargs="?", default="status",
                     choices=("status", "start", "submit", "show", "gen"),
                     help="по умолчанию status")
    tzc.add_argument("dir", nargs="?", help="папка проекта для submit, по умолчанию текущая")
    tzc.add_argument("--stage", type=int, help="номер этапа")
    tzc.add_argument("--port", type=int, default=None, help="порт сервера")
    tzc.add_argument("--timeout", type=int, default=None, help="секунд на этап прогона")
    tzc.add_argument("--sandbox-method", choices=("systemd", "bwrap", "seatbelt", "plain"), default=None,
                     help="чем изолировать прогон, по умолчанию автоопределение")

    chk = sub.add_parser("check", help="собрать и прогнать решение код-задачи")
    chk.add_argument("dir", nargs="?", help="папка задачи, по умолчанию текущая")
    chk.add_argument("--port", type=int, default=None, help="порт сервера")
    chk.add_argument("--timeout", type=int, default=None, help="секунд на этап прогона")
    chk.add_argument("--sandbox-method", choices=("systemd", "bwrap", "seatbelt", "plain"), default=None,
                     help="чем изолировать прогон, по умолчанию автоопределение")

    gen_cmd = sub.add_parser("gen", help="конвейер генерации контента")
    gen_cmd.add_argument("--node", help="код ноды, по умолчанию текущая")
    gen_cmd.add_argument("--stage", type=int, help="номер этапа (для статей)")
    gen_cmd.add_argument(
        "--kind", help="только этот жанр: quiz, cards, readcode, code, note, article")
    gen_cmd.add_argument("--lookahead", type=int, default=None, help="на сколько нод вперёд")
    gen_cmd.add_argument("--limit", type=int, default=20, help="сколько заданий выполнить за раз")
    gen_cmd.add_argument("--plan-only", action="store_true", help="только поставить в очередь")
    gen_cmd.add_argument("--drain", action="store_true", help="только разобрать очередь")
    gen_cmd.add_argument("--nightly", action="store_true", help="ночной проход, его зовёт таймер")
    gen_cmd.add_argument("--status", action="store_true", help="что в очереди и что было в журнале")
    gen_cmd.add_argument("--force", action="store_true", help="ставить задание даже если банк полон")

    bkp = sub.add_parser("backup", help="бэкап базы, ротация и разворачивание обратно")
    bkp.add_argument("--list", action="store_true", help="что лежит в папке бэкапов")
    bkp.add_argument("--check", action="store_true",
                     help="развернуть свежий бэкап в пустую базу и открыть её")
    bkp.add_argument("--restore", metavar="ФАЙЛ", help="развернуть этот бэкап")
    bkp.add_argument("--to", metavar="ПУТЬ", help="куда разворачивать (для --restore)")
    bkp.add_argument("--force", action="store_true", help="разрешить запись поверх существующей базы")
    bkp.add_argument("--keep", type=int, default=None,
                     help=f"сколько бэкапов хранить, по умолчанию {backup_mod.KEEP}")
    return p


def render_season(board: dict) -> str:
    lines = []
    s = board["season"]
    if s:
        lines.append(f"сезон {s['num']}, день {s['day_num']} из 14 (до {s['end']})")
        lines.append(f"  ты   {s['user_xp']} XP, нод закрыто {s['user_nodes']}")
        lines.append(f"  Опус {s['bot_xp']} XP, нод закрыто {s['bot_nodes']}")
        lines.append(f"  впереди: {s['ahead']}")
    else:
        off = board["offseason"] or {}
        lines.append(off.get("text", "сезона сейчас нет"))
        if off.get("next_start"):
            lines.append(f"  следующий сезон начнётся {off['next_start']}")
    if board["rollout"]:
        lines.append(f"раскатка до {board['rollout']['until']}: "
                     f"{board['rollout']['quiz']} вопросов и {board['rollout']['cards']} карточек")
    if board["bot"]["on_vacation"]:
        lines.append(f"Опус в паузе до {board['bot']['vacation_until']}: "
                     f"{board['bot']['vacation_reason'] or ''}")
    lines.append(f"нод всего: у тебя {board['user']['nodes']}, у Опуса {board['bot']['nodes']}")
    if board["history"]:
        lines.append("\nпрошлые сезоны:")
        for h in board["history"][:5]:
            lines.append(f"  {h['num']}: {h['summary']}")
    if board["feed"]:
        lines.append("\nлента:")
        for e in board["feed"][:5]:
            lines.append(f"  {e['ts'][:16].replace('T', ' ')}  {e['text']}")
    return "\n".join(lines)


def render_boss(state: dict) -> str:
    """Босс в терминале. Сам бой идёт в браузере: экзамен с таймером это экран,
    а не поток вопросов в stdout."""
    s = state["stage"]
    lines = [f"этап {s['num']}. {s['title']}",
             f"нод закрыто {s['closed']} из {s['total']}, босс открывается на {s['need']}"]
    if state["passed"]:
        lines.append("босс этапа уже взят")
    elif not s["ready"]:
        lines.append(f"до боя осталось закрыть нод: {s['left']}")
    elif state["cooldown"]["locked"]:
        lines.append(f"реванш откроется через {state['cooldown_text']}")
    else:
        lines.append("босс ждёт. Бой идёт в браузере: вкладка «босс»")
    live = state["running"]
    if live:
        if live["status"] == "quiz":
            lines.append(f"идёт бой: отвечено {live['quiz_answered']} из {live['quiz_total']}, "
                         f"осталось {live['left_sec'] // 60} мин")
        else:
            green = sum(1 for e in live.get("code_items", []) if e.get("ok"))
            lines.append(f"идёт код-часть: зелёных {green} из {len(live.get('code_items', []))}, "
                         f"осталось {live['left_sec'] // 60} мин. Выдать: arena task --boss")
    last = state["last"]
    if last:
        lines.append(f"последний бой: {last['rank_title']}, вопросы "
                     f"{last['quiz_correct']} из {last['quiz_total']}, +{last['xp']} XP")
        weak = (last.get("weak") or {}).get("topics") or []
        if weak:
            lines.append("проваленные темы: " + ", ".join(
                f"{t['topic']} ({t['wrong']} из {t['asked']})" for t in weak[:5]))
        if last.get("miniset"):
            m = last["miniset"]
            lines.append(f"мини-сет к реваншу: вопросов {m['quiz_total']}, "
                         f"разобрано {m['quiz_done']}, карточек {m['cards']}")
        if last.get("defense") and not last["defense"]["graded"]:
            lines.append("защита ждёт ответов на экране босса")
    return "\n".join(lines)


def server_call(cfg, method: str, path: str, payload: dict | None = None) -> dict:
    """Серверные команды ходят по HTTP (раздел 2 плана). Без сервера падаем
    внятно, а не стектрейсом."""
    import httpx

    from .server.app import HOST, PORT

    url = f"http://{HOST}:{PORT}{path}"
    try:
        res = httpx.request(method, url, json=payload, timeout=20.0)
        res.raise_for_status()
        return res.json()
    except httpx.HTTPStatusError as exc:
        detail = ""
        try:
            detail = exc.response.json().get("detail", "")
        except Exception:  # noqa: BLE001
            detail = exc.response.text[:200]
        raise SystemExit(f"сервер ответил {exc.response.status_code}: {detail}") from exc
    except httpx.HTTPError as exc:
        raise SystemExit(
            f"сервер arena не отвечает ({url}).\n"
            f"Подними его: systemctl --user start arena  либо  arena serve"
        ) from exc


def campaign_cmd(cfg, args) -> int:
    from . import campaign as campaign_mod

    if args.action == "start":
        # Профиль передаём явно: порт у сервера один на оба профиля, и без этой
        # сверки команда из песочницы начала бы кампанию в боевой базе.
        data = server_call(cfg, "POST", "/api/campaign/start", {"env": cfg.env})
        if data.get("already"):
            print(f"кампания уже идёт с {data['start_date']}, "
                  f"чекпоинт {data['checkpoint_at']}")
        else:
            print(f"кампания начата {data['start_date']}.\n"
                  f"Чекпоинт с выбором ветки горизонта: {data['checkpoint_at']}.\n"
                  f"Ветку можно будет сменить в этот день, XP и история при этом не трогаются.")
        return 0

    if args.action == "branch":
        if not args.months:
            print("нужна ветка: arena campaign branch --months 6|9|12")
            return 1
        data = server_call(cfg, "POST", "/api/campaign/branch", {"months": args.months})
        print(f"ветка {data['branch_months']} месяцев принята, срок кампании {data['target_days']} дней")
        return 0

    conn = db_mod.connect(cfg, create=False)
    board = campaign_mod.board(conn)
    if not board["started"]:
        print("кампания не начата. Начинается вручную: arena campaign start")
    else:
        print(f"кампания идёт с {board['start_date']}, день {board.get('day_num')}")
        print(f"срок: {board['target_days']} дней, чекпоинт {board['checkpoint_at']}")
        print(f"нод по траектории закрыто {board['nodes_closed']} из {board['nodes_total']}")
    eta = campaign_mod.eta(conn)
    print(eta["text"])
    cp = board["checkpoint"]
    if cp.get("due"):
        print("\nсегодня чекпоинт: открой вкладку Сезон, там выбор ветки")
    conn.close()
def run_gen(cfg, args, gen_mod) -> int:  # noqa: C901
    """Команда `arena gen`: планирование и разбор очереди генерации.

    Работает с базой напрямую, а не через сервер. Причина простая: ночной таймер
    должен уметь генерить, когда сервер погашен, а брать задание из очереди
    всё равно атомарно, поэтому одновременный воркер сервера ничего не задваивает.
    """
    from . import contract as contract_mod
    from . import db as db_local

    if not cfg.db_path.exists():
        print(f"базы ещё нет ({cfg.db_path}). Сначала arena sync")
        return 1
    conn = db_local.connect(cfg, create=False)
    try:
        if args.status:
            counts = gen_mod.queue.counts(conn)
            mode, _argv, why = gen_mod.runtime.mode(cfg)
            print(cfg.describe())
            print("режим генерации: " + mode + (f" ({why})" if why else ""))
            print("очередь: " + (", ".join(f"{k} {v}" for k, v in sorted(counts.items())) or "пусто"))
            until = gen_mod.queue.deferred_until(conn)
            if until:
                print(f"отложено до {until}")
            for row in gen_mod.queue.recent_log(conn, 10):
                print(f"  {row['ts']}  {row['kind']:9} {row['status']:8} "
                      f"{row['node_code'] or '':6} записей {row['produced']}, "
                      f"{row['seconds']} с" + (f", {row['error'][:60]}" if row["error"] else ""))
            return 0

        planned = {"queued": [], "reserved": []}
        if not args.drain:
            if args.stage is not None and (args.kind in (None, "article")):
                stage = conn.execute(
                    "SELECT id, num FROM stages WHERE num = ?", (args.stage,)
                ).fetchone()
                if stage is None:
                    print(f"нет этапа {args.stage}")
                    return 1
                planned["queued"] += gen_mod.plan.plan_stage_articles(
                    conn, stage["id"], force=args.force)
            else:
                if args.node:
                    node = conn.execute(
                        "SELECT * FROM nodes WHERE code = ?", (args.node,)).fetchone()
                    if node is None:
                        print(f"нет ноды {args.node}")
                        return 1
                else:
                    node = contract_mod.current_node(conn)
                    if node is None:
                        print("не понял, для какой ноды генерить: текущей ноды нет")
                        return 1
                lookahead = args.lookahead if args.lookahead is not None else gen_mod.LOOKAHEAD
                if args.kind:
                    genre = gen_mod.plan.BY_KIND.get(args.kind)
                    if genre is None:
                        print(f"нет такого жанра: {args.kind}")
                        return 1
                    if not genre.ready:
                        print(f"жанр {args.kind} появится в заходе 4б")
                        return 1
                    job = gen_mod.queue.enqueue(
                        conn, genre.kind, node_id=node["id"], stage_id=node["stage_id"],
                        params={"count": genre.count, "node_code": node["code"], "distance": 0},
                        priority=gen_mod.plan.priority(genre, 0), force=args.force,
                    )
                    if job is not None:
                        planned["queued"].append(f"{node['code']} {genre.kind}")
                else:
                    step = gen_mod.plan.on_node_entered(
                        conn, node["id"], lookahead=lookahead, force=args.force)
                    planned["queued"] += step["queued"]
                    planned["reserved"] += step["reserved"]
            conn.commit()
            print(f"поставлено заданий: {len(planned['queued'])}"
                  + (f"  ({', '.join(planned['queued'][:6])}"
                     + (", ..." if len(planned["queued"]) > 6 else "") + ")"
                     if planned["queued"] else ""))
            if planned["reserved"]:
                print(f"ждут захода 4б: {len(planned['reserved'])} "
                      f"({', '.join(sorted(set(planned['reserved']))[:4])})")
    finally:
        conn.close()

    if args.plan_only:
        return 0

    kinds = (args.kind,) if args.kind else gen_mod.worker.WORKABLE
    limit = args.limit if not args.nightly else max(args.limit, 60)
    budget = gen_mod.runtime.NIGHT_BUDGET_SEC if args.nightly else 0

    def show(result: dict) -> None:
        if result.get("status") == "ok":
            print(f"  готово: {result['kind']} для {result.get('node') or 'этапа'}, "
                  f"записей {result['added']}, отбраковано {result['rejected']}, "
                  f"{result['seconds']:.0f} с")
        elif result.get("status") == "limit":
            print(f"  лимит подписки, очередь ждёт до {result.get('retry_after')}")
        elif result.get("status") == "off":
            print(f"  генерация выключена: {result.get('error')}")
        else:
            print(f"  {result.get('status')}: {result['kind']}, {result.get('error', '')[:120]}")

    done = gen_mod.worker.drain(cfg, limit=limit, on_event=show, kinds=kinds, budget_sec=budget)
    print(f"итог: выполнено {done['ok']}, записей в банк {done['added']}, "
          f"провалов {done['failed']}, отложено {done['limit']}"
          + (", время вышло, остаток очереди подождёт" if done.get("out_of_time") else ""))
    return 0


def backup_cmd(cfg, args) -> int:
    """Бэкап, ротация и разворачивание. Всё это работает без сервера."""
    from pathlib import Path

    if args.list:
        rows = backup_mod.listing(cfg)
        if not rows:
            print(f"бэкапов ещё нет ({cfg.backup_dir})")
            return 0
        print(f"бэкапы в {cfg.backup_dir}:")
        for row in rows:
            print(f"  {row['name']}  {row['size'] // 1024} КБ")
        return 0

    if args.restore:
        if not args.to:
            print("куда разворачивать: arena backup --restore ФАЙЛ --to ПУТЬ", file=sys.stderr)
            return 1
        dst = backup_mod.restore(Path(args.restore), Path(args.to), force=args.force)
        print(f"развернул в {dst}")
        result = backup_mod.verify(dst)
        print(f"проверка: целостность {result['integrity']}, схема версии {result['version']}, "
              f"нод {result['counts']['nodes']}, записей банка {result['counts']['items']}")
        return 0 if result["ok"] else 1

    if args.check:
        path = backup_mod.latest(cfg)
        if path is None:
            print(f"бэкапов ещё нет ({cfg.backup_dir})")
            return 1
        result = backup_mod.verify(path)
        print(f"развернул {path.name} в пустую базу и открыл её")
        print(f"целостность {result['integrity']}, схема версии {result['version']}, "
              f"нод {result['counts']['nodes']}, записей банка {result['counts']['items']}, "
              f"строк XP {result['counts']['xp_ledger']}")
        return 0 if result["ok"] else 1

    keep = args.keep if args.keep is not None else backup_mod.KEEP
    print(backup_mod.render(cfg, backup_mod.create(cfg, keep=keep)))
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = config_mod.load(env=args.env, sandbox=args.sandbox)

    if args.cmd == "init":
        db_mod.init(cfg)
        print(f"база готова: {cfg.db_path}")
        return 0

    if args.cmd == "sync":
        conn = db_mod.init(cfg)
        picked = (config_mod.TRACKS if args.track == "all"
                  else (config_mod.TRACK_BY_KEY[args.track],))
        for track in picked:
            if not cfg.track_dir(track).is_dir():
                print(f"{track.key}: роадмапа нет ({cfg.track_dir(track)}), пропускаю")
                continue
            if len(picked) > 1:
                print(f"— раздел {track.title} —")
            print(sync_roadmap(conn, cfg, track).render())
        conn.close()
        return 0

    if args.cmd == "import":
        conn = db_mod.init(cfg)
        every = not (args.html or args.jcards or args.code or args.tz)
        if every or args.html:
            print("HTML-тесты:")
            print(html_tests.run(conn, cfg, archive=not args.no_archive).render())
        if every or args.jcards:
            print("\nкарточки jcards:")
            print(jcards.run(conn, cfg).render())
        if every or args.code:
            from .importers import code_tasks

            print("\nкод-задачи:")
            print(code_tasks.run(conn, cfg).render())
        if every or args.tz:
            from .importers import tz_specs

            print("\nпостановки ТЗ:")
            print(tz_specs.run(conn, cfg, verify=args.verify).render())
        conn.close()
        return 0

    if args.cmd == "serve":
        from .server.app import HOST, PORT, serve
        serve(cfg, host=args.host or HOST, port=args.port or PORT)
        return 0

    if args.cmd == "season":
        from . import seasons as seasons_mod
        conn = db_mod.connect(cfg, create=False)
        if seasons_mod.heartbeat(conn, present=True).get("idle"):
            print("гонка ещё не началась: Опус выходит на дорожку с первой закрытой нодой")
        else:
            print(render_season(seasons_mod.board(conn)))
        conn.close()
        return 0

    if args.cmd == "campaign":
        return campaign_cmd(cfg, args)

    if args.cmd == "taunts":
        from . import taunts as taunts_mod
        conn = db_mod.init(cfg)
        if args.refresh:
            report = taunts_mod.refresh(conn, force=args.force)
            print(f"добавлено реплик: {report['added']}, отклонено: {len(report['rejected'])}")
            for kind, line, why in report["rejected"][:10]:
                print(f"  отклонено ({why}) [{kind}]: {line}")
            if report["error"]:
                print(f"генерация не сработала: {report['error']}")
                print("лента живёт на шаблонной пачке, это штатный запасной путь")
        taunts_mod.ensure_pack(conn)
        rows = conn.execute(
            "SELECT kind, text, source FROM taunts"
            + (" WHERE kind = ?" if args.kind else "")
            + " ORDER BY kind, id",
            (args.kind,) if args.kind else (),
        ).fetchall()
        current = None
        for row in rows:
            if row["kind"] != current:
                current = row["kind"]
                print(f"\n{current} ({taunts_mod.KINDS.get(current, '')})")
            print(f"  [{row['source']}] {row['text']}")
        conn.commit()
        conn.close()
        return 0

    if args.cmd == "today":
        from . import contract as contract_mod
        from . import seasons as seasons_mod
        conn = db_mod.connect(cfg, create=False)
        racing = not seasons_mod.heartbeat(conn, present=True).get("idle")
        snapshot = contract_mod.state(conn)
        node = snapshot["node"]
        c = snapshot["contract"]
        print(cfg.describe())
        if node:
            print(f"\nтекущая нода: {node['code']} {node['title']} "
                  f"(этап {node['stage_num']}, {node['kind']})")
        print(f"вопросы:  {c['quiz_done']} из {c['quiz_target']}"
              + (f"  [{c['quiz_source_title']}]" if c["quiz_source_title"] else ""))
        print(f"карточки: {c['cards_done']} из {c['cards_target']}")
        code = c.get("code") or {}
        if code.get("available"):
            print(f"или микрозадачка кода вместо карточек: {code['title']} "
                  f"({code['node_code']}, {code['xp']} XP), выдать её командой arena task")
        elif c.get("code_done"):
            print(f"код-задач сдано сегодня: {c['code_done']}")
        print("контракт дня: " + ("закрыт" if c["done"] else "открыт"))
        print(f"XP сегодня {snapshot['xp']['today']}, всего {snapshot['xp']['total']}")
        if snapshot["streak"] >= 2:
            print(f"дней подряд: {snapshot['streak']}")
        board = seasons_mod.board(conn) if racing else None
        if board is None:
            pass
        elif board["season"]:
            s = board["season"]
            print(f"\nсезон {s['num']}, день {s['day_num']} из 14: "
                  f"ты {s['user_xp']}, Опус {s['bot_xp']}")
        elif board["offseason"] and board["offseason"]["next_start"]:
            print(f"\nмежсезонье, новый сезон {board['offseason']['next_start']}")
        if board and board["feed"]:
            print(f"Опус: {board['feed'][0]['text']}")
        conn.close()
        return 0

    if args.cmd == "boss":
        from . import boss as boss_mod
        conn = db_mod.connect(cfg, create=False)
        try:
            num = args.stage
            if num is None:
                over = boss_mod.overview(conn, cfg)
                num = over["ready"][0] if over["ready"] else (over["next"] or {}).get("num")
            if num is None:
                print("боссов на горизонте нет: закрывай ноды этапа, и босс появится")
                return 0
            print(render_boss(boss_mod.state(conn, cfg, int(num))))
        except LookupError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        finally:
            conn.close()
        return 0

    if args.cmd in ("task", "check", "tz"):
        from . import runner_cli
        from .sandbox import SandboxUnavailable, TIMEOUT
        from .tasks import TaskError
        from .tz import TzError
        from .tz_gen import GenError

        try:
            if args.cmd == "task":
                if args.list:
                    return runner_cli.cmd_tasks_list(cfg)
                if args.boss:
                    return runner_cli.cmd_boss_task(cfg, args.port)
                return runner_cli.cmd_task(cfg, args.node, args.force, args.port)
            if args.cmd == "check":
                return runner_cli.cmd_check(
                    cfg, args.dir, args.port, args.timeout or TIMEOUT, args.sandbox_method
                )
            if args.action == "start":
                return runner_cli.cmd_tz_start(cfg, args.stage, args.port)
            if args.action == "submit":
                return runner_cli.cmd_tz_submit(
                    cfg, args.dir, args.port, args.timeout or TIMEOUT, args.sandbox_method
                )
            if args.action == "show":
                return runner_cli.cmd_tz_show(cfg)
            if args.action == "gen":
                if not args.stage:
                    print("нужен этап: arena tz gen --stage N", file=sys.stderr)
                    return 1
                return runner_cli.cmd_tz_gen(cfg, args.stage)
            return runner_cli.cmd_tz_status(cfg)
        except (TaskError, TzError, GenError, SandboxUnavailable) as exc:
            print(str(exc), file=sys.stderr)
            return 2
    if args.cmd == "gen":
        from . import gen as gen_mod
        return run_gen(cfg, args, gen_mod)

    if args.cmd == "backup":
        return backup_cmd(cfg, args)

    if args.cmd == "stats" or args.cmd is None:
        if not cfg.db_path.exists():
            print(f"базы ещё нет ({cfg.db_path}). Сначала arena sync")
            return 1
        conn = db_mod.connect(cfg, create=False)
        print(stats_mod.render(conn, cfg, full=getattr(args, "full", False)))
        conn.close()
        return 0

    print(f"не знаю команду {args.cmd}", file=sys.stderr)
    return 1
