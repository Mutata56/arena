"""Терминальная часть runner'а: команды `arena task` и `arena check`.

Разделение обязанностей такое. Считает результат runner: javac и JUnit гоняются
здесь, в песочнице (раздел 12). Записывает результат сервер: XP, статусы и закрытие
ноды идут через HTTP, чтобы у прогресса был ровно один писатель. Сервер выключен:
честно говорим об этом и ничего не начисляем, повторная проверка ничего не стоит.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from . import contract as contract_mod
from . import db as db_mod
from . import tasks
from .config import Config

SERVER_HINT = (
    "{why} ({url}).\n"
    "Результат прогона выше честный, но XP и статусы пишет сервер: подними его "
    "командой arena serve (или systemctl --user start arena) и повтори arena check, "
    "повторная проверка ничего не стоит и ничего не ломает."
)


def base_url(port: int | None = None, host: str | None = None) -> str:
    from .server.app import HOST, PORT

    return f"http://{host or os.environ.get('ARENA_HOST') or HOST}:" \
           f"{port or int(os.environ.get('ARENA_PORT') or PORT)}"


def server_ready(url: str, cfg: Config) -> str:
    """Пустая строка означает «можно слать отчёт». Иначе внятная причина.

    Сверка базы обязательна: на localhost может слушать сервер другого профиля,
    и начислить XP в чужую базу было бы худшим видом ошибки.
    """
    import httpx

    try:
        res = httpx.get(url + "/api/whoami", timeout=15.0)
    except httpx.HTTPError:
        return "сервер arena не отвечает"
    if res.status_code == 404:
        return "по этому адресу отвечает сервер без вкладки задач, отчёт слать некому"
    if res.status_code >= 400:
        return f"сервер ответил {res.status_code}"
    data = res.json()
    if data.get("db") != str(cfg.db_path):
        return f"по этому адресу другая база ({data.get('db')}), отчёт туда не пойдёт"
    return ""


def post(url: str, path: str, body: dict, timeout: float = 30.0) -> dict | None:
    import httpx

    try:
        res = httpx.post(url + path, json=body, timeout=timeout)
    except httpx.HTTPError:
        return None
    if res.status_code >= 400:
        return None
    return res.json()


def _resolve_node(conn: sqlite3.Connection, code: str | None) -> sqlite3.Row:
    if code:
        return tasks.node_by_code(conn, code)
    node = contract_mod.current_node(conn)
    if node is not None and tasks.code_items(conn, node["id"]):
        return tasks.node_by_code(conn, node["code"])
    nearest = tasks.next_code_node(conn)
    if nearest is None:
        raise tasks.TaskError(
            "несданных код-задач нет ни на одной открытой ноде. Либо всё сдано, "
            "либо банк ещё не наполнен: этим займётся конвейер генерации"
        )
    return nearest


def cmd_task(cfg: Config, code: str | None, force: bool, port: int | None) -> int:
    conn = db_mod.connect(cfg, create=False)
    try:
        node = _resolve_node(conn, code)
        item = tasks.pick_item(conn, node)
        root, written = tasks.materialize(cfg, conn, node, item, force=force)
        data = tasks.payload_of(item)
    finally:
        conn.close()

    url = base_url(port)
    why = server_ready(url, cfg)
    reported = None if why else post(url, "/api/task/issue", {
        "item_id": item["id"], "node_id": node["id"], "dir_path": str(root),
    })

    print(f"{data['title']}")
    print(f"нода {node['code']} {node['title']}, этап {node['stage_num']}, "
          f"сложность {item['difficulty']}")
    print()
    print(data["statement_md"].strip())
    hints = data.get("checkstyle_hints") or []
    if hints:
        print()
        print("на что посмотреть в своём коде:")
        for hint in hints:
            print(f"  {hint}")
    print()
    print(f"папка задачи: {root}")
    print("файлы: " + ", ".join(written))
    print()
    print(f"пиши решение, потом cd {root} и arena check")
    if reported is None:
        print()
        print(f"{why or 'сервер не ответил'}, поэтому статус «в работе» в вебе не появится. "
              f"На саму задачу это не влияет")
    return 0


def cmd_boss_task(cfg: Config, port: int | None) -> int:
    """Код-часть идущего боя: разложить по файлам и рассказать, где она лежит."""
    from . import boss as boss_mod

    conn = db_mod.connect(cfg, create=False)
    try:
        row = conn.execute(
            "SELECT * FROM bosses WHERE kind = 'stage' AND status = 'code' "
            "ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if row is None:
            raise tasks.TaskError(
                "идущей код-части боя нет. Код-часть открывается после того, "
                "как на экране босса сданы двадцать вопросов"
            )
        issued = boss_mod.issue_code(conn, cfg, row["id"])
        left = boss_mod.code_left(conn, cfg, row)
        payloads = {
            item["item_id"]: tasks.payload_of(
                conn.execute("SELECT * FROM items WHERE id = ?", (item["item_id"],)).fetchone()
            )
            for item in issued
        }
    finally:
        conn.close()

    print(f"код-часть боя, попытка {row['attempt_no']}: задач {len(issued)}, "
          f"времени осталось {boss_mod.fmt_left(left)}")
    for item in issued:
        data = payloads[item["item_id"]]
        print()
        print(f"{data['title']}  (нода {item['node_code']})")
        print()
        print(data["statement_md"].strip())
        print()
        print(f"папка: {item['dir']}")
    print()
    print("пиши решение, потом cd в папку задачи и arena check. "
          "Отчёт уйдёт в бой, обычный XP за код на бою не платится")
    return 0


def cmd_check(cfg: Config, where: str | None, port: int | None, timeout: int,
              method: str | None) -> int:
    from . import tz as tz_mod

    start = Path(where).expanduser() if where else Path.cwd()
    root = tasks.find_task_dir(cfg, start)
    if root is None and tz_mod.find_project_dir(cfg, start) is not None:
        raise tasks.TaskError(
            "это папка проекта по ТЗ, а не код-задачи. Сдавать её надо командой arena tz submit: "
            "там кроме скрытых тестов гоняются твои и делается ревью"
        )
    if root is None:
        # Проверять без аргументов надо ПОСЛЕДНЮЮ выданную и ещё не сданную задачу,
        # а не задачу текущей ноды: занятие в браузере уходит вперёд само, и текущая
        # нода к этому моменту обычно уже другая.
        conn = db_mod.connect(cfg, create=False)
        try:
            issued = conn.execute(
                "SELECT ct.dir_path, n.code FROM code_tasks ct "
                "JOIN nodes n ON n.id = ct.node_id "
                "WHERE ct.dir_path IS NOT NULL AND ct.passed_at IS NULL "
                "ORDER BY ct.issued_at DESC"
            ).fetchall()
            node = _resolve_node(conn, None)
            item = tasks.pick_item(conn, node)
            guess = tasks.task_dir(cfg, node)
        finally:
            conn.close()
        for row in issued:
            candidate = Path(row["dir_path"])
            if (candidate / tasks.MARKER).is_file():
                root = candidate
                print(f"проверяю последнюю выданную задачу: нода {row['code']}, {candidate}")
                break
        if root is None and (guess / tasks.MARKER).is_file():
            root = guess
        if root is None:
            raise tasks.TaskError(
                f"выданных задач не нашёл. Ближайшая невыданная это {node['code']} "
                f"«{tasks.payload_of(item)['title']}», выдать её: arena task {node['code']}"
            )

    marker = tasks.read_marker(root)
    if marker.get("env") and marker["env"] != cfg.env:
        raise tasks.TaskError(
            f"задача выдана в профиле {marker['env']}, а проверяешь в {cfg.env}. "
            f"Смешивать боевой профиль с песочницей не буду"
        )

    conn = db_mod.connect(cfg, create=False)
    try:
        item = conn.execute(
            "SELECT * FROM items WHERE id = ? AND type = 'code'", (marker["item_id"],)
        ).fetchone()
        if item is None:
            raise tasks.TaskError(
                f"задачи {marker['item_id']} нет в базе профиля {cfg.env}, проверять нечего"
            )
        data = tasks.payload_of(item)
    finally:
        conn.close()

    print(f"проверяю {marker['node_code']} «{data['title']}»")
    verdict = tasks.run_check(cfg, root, data, timeout=timeout, method=method, marker=marker)
    print(tasks.render(verdict))
    print(f"(песочница {verdict.method}, {verdict.seconds} с)")

    url = base_url(port)
    why = server_ready(url, cfg)
    # Код-часть боя ходит своей ручкой: обычный XP за неё не платят и статус
    # код-задачи она не двигает, иначе зачтённая на бою задача бесплатно
    # закрыла бы ноду.
    boss_id = marker.get("boss_id")
    if boss_id:
        reply = None if why else post(url, "/api/boss/check", {
            "boss_id": boss_id, "item_id": marker["item_id"], "verdict": verdict.to_json(),
        })
        if reply is None:
            print()
            print(SERVER_HINT.format(why=why or "сервер arena не принял отчёт", url=url))
            return 0 if verdict.ok else 1
        print()
        print(f"код-часть боя: зелёных {reply['green']} из {reply['total']}, "
              f"времени осталось {reply['left_sec'] // 60} мин")
        done = reply.get("result")
        if done:
            print(f"бой окончен: {done['rank_title']}, +{done['xp']} XP. "
                  f"Итоги и защита на экране босса")
        return 0 if verdict.ok else 1

    reply = None if why else post(url, "/api/task/check", {
        "item_id": marker["item_id"], "verdict": verdict.to_json(),
    })
    if reply is None:
        print()
        print(SERVER_HINT.format(why=why or "сервер arena не принял отчёт", url=url))
        return 0 if verdict.ok else 1

    if reply.get("xp"):
        print(f"+{reply['xp']} XP за первую зелёную сдачу")
    elif verdict.ok and not reply.get("first_green"):
        print("эта задача уже была зелёной, XP за повтор не платится")
    if reply.get("contract_xp"):
        print(f"+{reply['contract_xp']} XP, контракт дня закрыт")
    closed = reply.get("node_closed")
    if closed and closed.get("closed"):
        print(f"нода {closed['code']} закрыта, +{closed['xp']} XP")
        if closed.get("unlocked"):
            print(f"открылась следующая нода: {closed['unlocked']}")
        if closed.get("stages_opened"):
            nums = ", ".join(str(n) for n in closed["stages_opened"])
            print(f"открылись этапы: {nums}")
    return 0 if verdict.ok else 1


# ---------------------------------------------------------------- ТЗ

def _tz_project(cfg: Config, where: str | None):
    """Найти папку проекта и его маркер. Ищем по текущей папке, потом по базе."""
    from . import tz as tz_mod

    start = Path(where).expanduser() if where else Path.cwd()
    root = tz_mod.find_project_dir(cfg, start)
    if root is None:
        conn = db_mod.connect(cfg, create=False)
        try:
            row = conn.execute(
                "SELECT * FROM tz_projects WHERE status != 'accepted' ORDER BY id DESC LIMIT 1"
            ).fetchone()
        finally:
            conn.close()
        if row is None or not row["dir_path"]:
            raise tz_mod.TzError(
                "не нашёл папку ТЗ. Если проект ещё не выдан, начни с arena tz start"
            )
        root = Path(row["dir_path"])
    marker = tz_mod.read_marker(root)
    if marker.get("env") and marker["env"] != cfg.env:
        raise tz_mod.TzError(
            f"ТЗ выдано в профиле {marker['env']}, а сдаёшь в {cfg.env}. "
            f"Смешивать боевой профиль с песочницей не буду"
        )
    return root, marker


def cmd_tz_status(cfg: Config) -> int:
    from . import tz as tz_mod

    conn = db_mod.connect(cfg, create=False)
    try:
        board = tz_mod.board(conn, cfg)
    finally:
        conn.close()
    if not board["projects"]:
        print("выданных ТЗ нет")
    for project in board["projects"]:
        print(f"этап {project['stage_num']}: {project['title']}")
        print(f"  статус {project['status_title']}, сдач {project['checks']}"
              + (f", {project['xp']} XP" if project["xp"] else ""))
        if project["dir_path"]:
            print(f"  папка {project['dir_path']}")
        review = project["review"]
        if review and review.get("fixes") and project["status"] != "accepted":
            print(f"  на доработку, пунктов {len(review['fixes'])}: arena tz show")
    if board["ready"]:
        for stage in board["ready"]:
            print(f"этап {stage['num']} ждёт ТЗ: arena tz start --stage {stage['num']}"
                  + (" (гейт босса обойдён dev-флагом)" if stage.get("dev") else "")
                  + ("" if stage["bank"] else f", сначала arena tz gen --stage {stage['num']}"))
    elif not board["projects"] and board["next"]:
        nxt = board["next"]
        print(f"ближайшее ТЗ на этапе {nxt['num']}: сперва бой с боссом, "
              f"нод закрыто {nxt['closed']} из {nxt['need']}")
    return 0


def cmd_tz_show(cfg: Config, tz_id: int | None = None) -> int:
    """Постановка целиком и последний разбор ревью."""
    from . import tz as tz_mod

    conn = db_mod.connect(cfg, create=False)
    try:
        row = (tz_mod.project_by_id(conn, tz_id) if tz_id else conn.execute(
            "SELECT * FROM tz_projects ORDER BY id DESC LIMIT 1").fetchone())
        if row is None:
            print("выданных ТЗ нет")
            return 0
        project = tz_mod.view(conn, cfg, row)
    finally:
        conn.close()
    print(project["title"])
    print(f"этап {project['stage_num']}, статус {project['status_title']}")
    print()
    print(project["spec_md"])
    if project["review"]:
        print()
        print(tz_mod.render_review(project["review"], project["status"]))
    return 0


def cmd_tz_start(cfg: Config, stage: int | None, port: int | None) -> int:
    from . import tz as tz_mod

    url = base_url(port)
    why = server_ready(url, cfg)
    if why:
        raise tz_mod.TzError(
            f"{why} ({url}).\nТЗ выдаёт сервер: он же кладёт проект в портфель и пишет статус. "
            f"Подними его командой arena serve (или systemctl --user start arena) и повтори"
        )
    if stage is None:
        conn = db_mod.connect(cfg, create=False)
        try:
            board = tz_mod.board(conn, cfg)
        finally:
            conn.close()
        if board["projects"] and board["projects"][0]["status"] != "accepted":
            stage = board["projects"][0]["stage_num"]
        elif board["ready"]:
            stage = board["ready"][0]["num"]
        else:
            raise tz_mod.TzError(
                "не понял, для какого этапа выдавать ТЗ. Оно выдаётся после взятого босса: "
                "arena tz start --stage N"
            )
    data = post(url, f"/api/tz/stage/{int(stage)}/start", {}, timeout=120.0)
    if data is None:
        raise tz_mod.TzError(f"сервер не выдал ТЗ этапа {stage}. Подробности: {url}/api/tz")
    print(data["title"])
    print(f"этап {data['stage_num']}. {data['stage_title']}")
    print()
    print(data["spec_md"])
    print()
    print(f"папка проекта: {data['dir_path']}")
    print("решение пиши рядом с README.md, свои тесты в подпапку tests")
    print("сдавать: cd в папку проекта и arena tz submit")
    return 0


def cmd_tz_submit(cfg: Config, where: str | None, port: int | None, timeout: int,
                  method: str | None) -> int:
    from . import tz as tz_mod

    root, marker = _tz_project(cfg, where)
    conn = db_mod.connect(cfg, create=False)
    try:
        row = tz_mod.project_by_id(conn, marker["tz_id"])
        payload = tz_mod.payload_of(tz_mod.spec_of(conn, row))
        title = row["title"]
    finally:
        conn.close()

    print(f"проверяю «{title}», папка {root}")
    verdict = tz_mod.run(cfg, root, payload, timeout=timeout, method=method)
    print(tz_mod.render_verdict(verdict))
    print(f"(песочница {verdict.method}, {verdict.seconds} с)")

    url = base_url(port)
    why = server_ready(url, cfg)
    reply = None if why else post(url, f"/api/tz/{marker['tz_id']}/submit",
                                  {"verdict": verdict.to_json()}, timeout=1200.0)
    if reply is None:
        print()
        print(SERVER_HINT.format(why=why or "сервер arena не принял сдачу", url=url))
        return 0 if verdict.ok else 1
    if not reply.get("reviewed"):
        print()
        print(reply.get("message") or reply.get("error") or "ревью не состоялось")
        return 1
    print()
    print("ревью:")
    print(tz_mod.render_review(reply["review"], reply["status"]))
    if reply.get("xp"):
        print()
        print(f"+{reply['xp']} XP за принятый проект"
              + (f" (из них {reply['bonus']} за качество)" if reply.get("bonus") else ""))
        print("дальше защита: вкладка «ТЗ» в браузере, два-три вопроса про твои же решения")
    return 0 if reply["status"] == "accepted" else 1


def cmd_tz_gen(cfg: Config, stage: int) -> int:
    """Сгенерировать постановку. Живой вызов модели, поэтому идёт из терминала
    и говорит вслух, что делает."""
    from . import tz_gen

    conn = db_mod.init(cfg)
    try:
        result = tz_gen.generate(conn, cfg, stage, on_event=lambda text: print(f"  {text}"))
    finally:
        conn.close()
    print()
    print(f"постановка «{result['title']}» готова, попыток {result['attempts']}")
    print(f"выдать её: arena tz start --stage {stage}")
    return 0


def cmd_tasks_list(cfg: Config) -> int:
    """Что вообще есть по код-задачам. Читает базу напрямую, сервер не нужен."""
    conn = db_mod.connect(cfg, create=False)
    try:
        from .server.tasks_api import task_rows

        rows = task_rows(conn)
    finally:
        conn.close()
    if not rows:
        print("код-задач в банке нет")
        return 0
    for row in rows:
        flag = {"passed": "сдана ", "issued": "в работе", "new": "новая "}[row["status"]]
        print(f"{flag}  {row['node_code']:<6} {row['title']}  ({row['xp']} XP)")
    return 0
