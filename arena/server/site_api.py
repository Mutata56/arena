"""Сайт: конспект в браузере, задача в браузере, прогон кода.

Прослойка намеренно тонкая и ничего не решает сама.

- Конспект она читает с диска: путь уже лежит в `nodes.obsidian_path`, разметку
  разбирает фронт. Сервер не рендерит markdown принципиально: оформление это
  дело фронта, а ядро от смены оформления меняться не должно.
- Задачу отдаёт из `items.payload` — постановку, стартовые файлы и ВИДИМЫЕ тесты.
  Скрытые тесты наружу не уходят: на них держится вся проверка.
- Прогон отдаёт в `tasks.check_files`, вердикт записывает тем же
  `tasks.record_check`, которым пишет терминальный runner. Правило «единственный
  писатель прогресса это сервер» не нарушено: писатель по-прежнему один, просто
  вердикт считается тут же, а не в соседнем процессе.

Заметки, выделения и настройки чтения сюда не ходят вообще: они живут
в localStorage браузера. Хранилище пользователя это уже бекенд, а его тут нет.
"""

from __future__ import annotations

import json
import re
import secrets
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .. import progress, sandbox, sqlrun, tasks, xp
from ..config import Config
from ..gen import selfcheck

# Сколько ждём javac и java при запуске примера из статьи. Тесты гоняются дольше
# (sandbox.TIMEOUT = 60), но пример из учебника, который думает больше двадцати
# секунд, это вечный цикл, а не долгий алгоритм.
RUN_TIMEOUT = 20
# Потолок на размер того, что присылает браузер. Защита от опечатки в цикле,
# который печатает исходник сам в себя, а не от злоумышленника: сервер локальный.
MAX_SOURCE = 200_000
# Кеш индекса волта: имя файла без расширения -> путь относительно корня волта.
_VAULT_INDEX: dict[str, object] = {"built_at": 0.0, "map": {}}
VAULT_INDEX_TTL = 60.0

SAFE_NAME = re.compile(r"^[\w .()+\-\[\]#,'«»№]+$", re.UNICODE)


class RunBody(BaseModel):
    files: dict[str, str]
    main: str | None = None
    # Аргументы командной строки (те самые args у main) и то, что программа
    # прочитает с клавиатуры. Без них половину задач не проверить.
    args: list[str] = []
    stdin: str = ""


class CheckBody(BaseModel):
    files: dict[str, str]


class SqlBody(BaseModel):
    """Один запуск SQL из конспекта или задачника."""
    sql: str
    dataset: str = sqlrun.DEFAULT_DATASET
    # rollback это откат после каждого запуска; session — своя база, переживающая
    # COMMIT. Второй нужен ровно там, где предмет разговора и есть COMMIT.
    mode: str = "rollback"
    sid: str | None = None


class SqlStep(BaseModel):
    slot: str = "A"
    sql: str
    expect_wait: bool = False


class SqlScenarioBody(BaseModel):
    """Сценарий на нескольких сессиях: блокировки и взаимоблокировки."""
    steps: list[SqlStep]
    dataset: str = sqlrun.DEFAULT_DATASET


class SqlResetBody(BaseModel):
    sid: str
    dataset: str = sqlrun.DEFAULT_DATASET


class TermBody(BaseModel):
    """Одна команда, набранная в терминале внутри статьи."""
    sid: str
    files: dict[str, str] = {}
    cmd: str = ""


# ---------------------------------------------------------------- волт

def vault_index(cfg: Config) -> dict[str, str]:
    """Имя заметки -> путь относительно волта. Викилинки в волте короткие,
    без папок, поэтому резолвить приходится по имени файла."""
    now = time.monotonic()
    if now - float(_VAULT_INDEX["built_at"]) < VAULT_INDEX_TTL and _VAULT_INDEX["map"]:
        return _VAULT_INDEX["map"]  # type: ignore[return-value]
    found: dict[str, str] = {}
    root = cfg.vault_root
    if root.is_dir():
        for path in root.rglob("*.md"):
            if any(part.startswith(".") for part in path.relative_to(root).parts):
                continue
            found.setdefault(path.stem, str(path.relative_to(root)))
    _VAULT_INDEX["map"] = found
    _VAULT_INDEX["built_at"] = now
    return found


# Сколько проверяемых заданий лежит в самом конспекте. Кеш по mtime, а не по
# времени: заметки правятся редко, но правку надо увидеть сразу, а не через
# минуту. Ключ — путь, значение — (mtime, сколько нашли).
_DRILL_COUNTS: dict[str, tuple[float, int]] = {}
# Те же фенсы, что разбирает md.js: задача, перестановка, терминал, запрос, сценарий.
DRILL_FENCE = re.compile(r"^\s*```(задача|перестановка|терминал|запрос|сценарий)\s*$", re.MULTILINE)


def drill_count(cfg: Config, rel_path: str | None) -> int:
    """Сколько заданий в конспекте ноды.

    Нужно карте: строку «задачник» рисовать по тому, есть ли там что решать, а
    банк вопросов в БД — только половина ответа. После перехода на новый формат
    лекций основная часть заданий живёт прямо в тексте фенсами, и нода с двадцатью
    задачами выглядела в списке пустой."""
    if not rel_path:
        return 0
    root = cfg.vault_root.resolve()
    try:
        target = (root / rel_path).resolve()
        target.relative_to(root)
        mtime = target.stat().st_mtime
    except (ValueError, OSError):
        return 0
    hit = _DRILL_COUNTS.get(rel_path)
    if hit and hit[0] == mtime:
        return hit[1]
    try:
        text = target.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return 0
    found = len(DRILL_FENCE.findall(text))
    _DRILL_COUNTS[rel_path] = (mtime, found)
    return found


def read_note(cfg: Config, rel_path: str | None) -> str | None:
    """Прочитать заметку волта по относительному пути, не выходя за его корень."""
    if not rel_path:
        return None
    root = cfg.vault_root.resolve()
    try:
        target = (root / rel_path).resolve()
        target.relative_to(root)
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail="путь ведёт за пределы волта")
    if not target.is_file():
        return None
    # В трёх заметках волта живой NUL-байт внутри текста про char. JSON его не
    # переживёт, поэтому меняем на видимую запись.
    return target.read_text(encoding="utf-8", errors="replace").replace("\x00", "\\u0000")


# ---------------------------------------------------------------- прогон кода

def _sanitize_files(files: dict[str, str]) -> dict[str, str]:
    if not files:
        raise HTTPException(status_code=400, detail="нечего запускать: файлов не прислали")
    out: dict[str, str] = {}
    total = 0
    for name, source in files.items():
        clean = Path(str(name)).name
        if not clean.endswith(".java") or not SAFE_NAME.match(clean):
            raise HTTPException(status_code=400, detail=f"неподходящее имя файла: {name}")
        source = str(source or "")
        total += len(source)
        if total > MAX_SOURCE:
            raise HTTPException(status_code=400, detail="слишком много кода за один раз")
        out[clean] = source
    return out


# ------------------------------------------------------------------ терминал в статье

# Нода «Первая программа из терминала» держится на том, что javac и java это два
# РАЗНЫХ шага, между которыми на диске появляется .class. Кнопка «запустить», где
# оба шага слиты в один, эту мысль как раз убивает. Поэтому здесь всё честно:
# у блока своя папка, javac кладёт в неё .class, ls его показывает, rm удаляет,
# и java после этого честно падает.
TERM_SID = re.compile(r"^[a-z0-9]{4,32}$")
TERM_ARG = re.compile(r"^[\w.-]{1,64}$")
TERM_TTL = 6 * 3600
TERM_HELP = "здесь работают: javac, java, ls, cat, rm, pwd"


def _term_dir(cfg: Config, sid: str) -> Path:
    if not TERM_SID.match(sid or ""):
        raise HTTPException(status_code=400, detail="кривой номер сессии")
    work = cfg.runs_root / f"term-{sid}"
    work.mkdir(parents=True, exist_ok=True)
    return work


def _term_sweep(cfg: Config) -> None:
    """Старые папки терминала убираем: это кеш, а не хранилище."""
    root = cfg.runs_root
    if not root.is_dir():
        return
    edge = time.time() - TERM_TTL
    for path in root.glob("term-*"):
        try:
            if path.stat().st_mtime < edge:
                shutil.rmtree(path, ignore_errors=True)
        except OSError:
            continue


def term_run(cfg: Config, sid: str, files: dict[str, str], cmd: str) -> dict:
    """Выполнить одну команду в папке блока. Наружу уходит настоящий вывод."""
    _term_sweep(cfg)
    work = _term_dir(cfg, sid)
    # Исходники всегда переписываем с фронта: студент правит их в редакторе рядом.
    for name, source in _sanitize_files(files).items():
        (work / name).write_text(str(source).rstrip() + "\n", encoding="utf-8")

    parts = str(cmd or "").split()
    if not parts:
        return {"out": "", "rc": 0, "files": _term_ls(work)}
    head, rest = parts[0], parts[1:]
    for arg in rest:
        if not TERM_ARG.match(arg):
            return {"out": f"нельзя такое имя: {arg}", "rc": 1, "files": _term_ls(work)}

    if head == "reset":
        # Кнопка «очистить папку»: сносим всё, что наделали, и кладём исходники заново.
        for path in work.iterdir():
            if path.is_file():
                path.unlink()
        for name, source in _sanitize_files(files).items():
            (work / name).write_text(str(source).rstrip() + "\n", encoding="utf-8")
        return {"out": "папка очищена, остались только исходники", "rc": 0, "files": _term_ls(work)}
    if head == "ls":
        return {"out": "\n".join(_term_ls(work)), "rc": 0, "files": _term_ls(work)}
    if head == "pwd":
        return {"out": "~/java", "rc": 0, "files": _term_ls(work)}
    if head == "cat":
        if not rest:
            return {"out": "cat: скажи, какой файл читать", "rc": 1, "files": _term_ls(work)}
        target = work / Path(rest[0]).name
        if not target.is_file():
            return {"out": f"cat: {rest[0]}: нет такого файла", "rc": 1, "files": _term_ls(work)}
        if target.suffix == ".class":
            return {"out": "(двоичный файл, человеку не читается)", "rc": 0, "files": _term_ls(work)}
        return {"out": target.read_text(encoding="utf-8", errors="replace"), "rc": 0,
                "files": _term_ls(work)}
    if head == "rm":
        if not rest:
            return {"out": "rm: скажи, что удалять", "rc": 1, "files": _term_ls(work)}
        target = work / Path(rest[0]).name
        if not target.is_file():
            return {"out": f"rm: {rest[0]}: нет такого файла", "rc": 1, "files": _term_ls(work)}
        target.unlink()
        return {"out": "", "rc": 0, "files": _term_ls(work)}
    if head == "javac":
        if not rest:
            return {"out": "javac: скажи, какой файл собирать", "rc": 1, "files": _term_ls(work)}
        res = sandbox.run_javac(["-encoding", "UTF-8", *[Path(a).name for a in rest]],
                                work, timeout=RUN_TIMEOUT)
        out = (res.stdout + res.stderr).strip()
        return {"out": out, "rc": res.rc, "files": _term_ls(work)}
    if head == "java":
        if not rest:
            return {"out": "java: скажи, какой класс запускать", "rc": 1, "files": _term_ls(work)}
        res = sandbox.run_java(["-cp", ".", *[Path(a).name for a in rest]],
                               work, timeout=RUN_TIMEOUT)
        out = (res.stdout + res.stderr).rstrip()
        return {"out": out, "rc": res.rc, "files": _term_ls(work)}
    return {"out": f"{head}: такой команды тут нет, {TERM_HELP}", "rc": 127,
            "files": _term_ls(work)}


def _term_ls(work: Path) -> list[str]:
    return sorted(p.name for p in work.iterdir() if p.is_file())


# Больше двадцати аргументов и килобайта ввода в учебной задаче не бывает.
MAX_ARGS = 20
MAX_STDIN = 4000


def run_main(cfg: Config, files: dict[str, str], main: str | None = None,
             args: list[str] | None = None, stdin: str = "") -> dict:
    """Собрать набор файлов и запустить у него main. Ровно то, что делает ученик
    в терминале через javac и java, только руками этого делать не надо."""
    files = _sanitize_files(files)
    entry = main
    if not entry:
        for source in files.values():
            found = selfcheck.main_class(source)
            if found:
                entry = found
                break
    if not entry:
        return {
            "ok": False, "phase": "compile", "compile_out": "", "stdout": "", "stderr": "",
            "seconds": 0.0, "timed_out": False, "main": None,
            "message": "не нашёл метод main: запускать нечего",
        }

    work = cfg.runs_root / f"site-{int(time.time())}-{secrets.token_hex(4)}"
    src = work / "src"
    src.mkdir(parents=True, exist_ok=True)
    (work / "classes").mkdir(parents=True, exist_ok=True)
    try:
        for name, source in files.items():
            (src / name).write_text(source.rstrip() + "\n", encoding="utf-8")
        names = sorted(str(p.relative_to(work)) for p in src.glob("*.java"))
        built = sandbox.run_javac(
            ["-encoding", "UTF-8", "-nowarn", "-d", "classes", *names],
            work, timeout=RUN_TIMEOUT,
        )
        if built.timed_out:
            return {"ok": False, "phase": "compile", "compile_out": "", "stdout": "", "stderr": "",
                    "seconds": built.seconds, "timed_out": True, "main": entry,
                    "message": f"компиляция не уложилась в {RUN_TIMEOUT} секунд"}
        if built.rc != 0:
            return {"ok": False, "phase": "compile",
                    "compile_out": (built.stdout + built.stderr).strip(),
                    "stdout": "", "stderr": "", "seconds": built.seconds, "timed_out": False,
                    "main": entry, "message": "не компилируется"}

        argv = [str(a) for a in (args or [])][:MAX_ARGS]
        ran = sandbox.run_java(["-cp", "classes", entry, *argv], work, timeout=RUN_TIMEOUT,
                               stdin=(stdin[:MAX_STDIN] if stdin else None))
        if ran.timed_out:
            return {"ok": False, "phase": "run", "compile_out": "",
                    "stdout": ran.stdout, "stderr": "", "seconds": ran.seconds,
                    "timed_out": True, "main": entry,
                    "message": f"программа не уложилась в {RUN_TIMEOUT} секунд. "
                               f"Обычно это вечный цикл: проверь условие выхода"}
        return {
            "ok": ran.rc == 0, "phase": "run", "compile_out": "", "args": argv,
            "stdout": ran.stdout, "stderr": ran.stderr.strip(),
            "seconds": round(built.seconds + ran.seconds, 2), "timed_out": False, "main": entry,
            "message": "готово" if ran.rc == 0 else "программа упала во время выполнения",
        }
    except sandbox.SandboxUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"песочница недоступна: {exc}") from exc
    finally:
        shutil.rmtree(work, ignore_errors=True)


# ---------------------------------------------------------------- задача

def task_row(conn: sqlite3.Connection, item_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT i.id, i.payload, i.difficulty, i.node_id, n.code AS node_code, "
        "  n.title AS node_title, s.num AS stage_num, "
        "  ct.dir_path, ct.issued_at, ct.passed_at, ct.checks, ct.last_result "
        "FROM items i JOIN nodes n ON n.id = i.node_id JOIN stages s ON s.id = n.stage_id "
        "LEFT JOIN code_tasks ct ON ct.item_id = i.id "
        "WHERE i.id = ? AND i.type = 'code' AND i.active = 1", (item_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"код-задачи {item_id} нет")
    return row


def task_view(row: sqlite3.Row) -> dict:
    """Всё, что задаче нужно на экране. Скрытых тестов тут нет и быть не может."""
    data = json.loads(row["payload"])
    last = json.loads(row["last_result"]) if row["last_result"] else None
    status = "passed" if row["passed_at"] else ("issued" if row["issued_at"] else "new")
    tests_name = tasks.test_file_name(data["visible_tests"])
    # Человеческие названия проверок из @DisplayName. Экран задачи показывает
    # именно их: ученик, который не знает JUnit, не должен читать код теста.
    titles = tasks.display_names(data["visible_tests"])
    visible_cases = [{"method": method, "name": name} for method, name in titles.items()]
    return {
        "visible_cases": visible_cases,
        "item_id": row["id"],
        "title": data.get("title", "код-задача"),
        "statement_md": data.get("statement_md", ""),
        "hints": data.get("checkstyle_hints") or [],
        "starter_files": data.get("starter_files", {}),
        "tests_file": tests_name,
        "visible_tests": data["visible_tests"],
        "node_code": row["node_code"],
        "node_title": row["node_title"],
        "stage_num": row["stage_num"],
        "difficulty": row["difficulty"],
        "xp": xp.code_amount(row["difficulty"]),
        "status": status,
        "checks": row["checks"] or 0,
        "dir_path": row["dir_path"],
        "last": last,
    }


# ---------------------------------------------------------------- регистрация

def register(app: FastAPI, cfg: Config, session: Callable) -> None:

    @app.get("/api/site/note/{code}")
    def api_site_note(code: str):
        """Конспект ноды как есть, markdown-ом. Разметку разбирает фронт."""
        with session() as conn:
            node = progress.node_by_code(conn, code)
            if node is None:
                raise HTTPException(status_code=404, detail=f"ноды {code} нет")
            view = progress.node_view(conn, node)
            # Тот же вердикт, по которому ядро само закрывает ноду. Считает его
            # ядро, сайт только показывает: иначе человек видит на карте точку
            # вместо галочки и не понимает, чего от него ещё хотят.
            view["ready"] = progress.evaluate(conn, node["id"])
        text = read_note(cfg, node["obsidian_path"])
        return {
            "code": node["code"],
            "title": node["title"],
            "path": node["obsidian_path"],
            "markdown": text,
            "exists": text is not None,
            "node": view,
        }

    @app.get("/api/site/wiki")
    def api_site_wiki(name: str):
        """Разрешить викилинк [[Имя заметки]]: вернуть текст и, если это нода
        роадмапа, её код — тогда фронт откроет полноценную страницу ноды."""
        name = (name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="пустое имя заметки")
        rel = vault_index(cfg).get(name)
        code = None
        if rel:
            with session() as conn:
                row = conn.execute(
                    "SELECT code FROM nodes WHERE obsidian_path = ?", (rel,)).fetchone()
                if row is None:
                    # Ноды роадмапа названы «1.03 Заголовок»: код это первое слово.
                    head = name.split(" ", 1)[0]
                    row = conn.execute(
                        "SELECT code FROM nodes WHERE code = ?", (head,)).fetchone()
                code = row["code"] if row else None
        return {
            "name": name,
            "path": rel,
            "code": code,
            "exists": bool(rel),
            "markdown": read_note(cfg, rel) if rel else None,
        }

    @app.get("/api/site/node/{code}/items")
    def api_site_items(code: str):
        """Весь играбельный материал ноды одним запросом.

        Верные ответы (`ans`) и объяснения (`exp`) не отдаются: их по-прежнему
        показывает только POST /api/quiz/answer. Это правило ядра, не оформления.
        """
        with session() as conn:
            node = progress.node_by_code(conn, code)
            if node is None:
                raise HTTPException(status_code=404, detail=f"ноды {code} нет")
            rows = conn.execute(
                "SELECT i.id, i.type, i.payload, i.difficulty, i.suspended, "
                "  ct.passed_at, ct.checks, "
                "  (SELECT COUNT(*) FROM attempts a WHERE a.item_id = i.id AND a.correct = 1) AS wins, "
                "  (SELECT COUNT(*) FROM attempts a WHERE a.item_id = i.id) AS tries, "
                "  (SELECT COUNT(*) FROM attempts a WHERE a.item_id = i.id AND a.kind = 'quiz' "
                "     AND COALESCE(json_extract(a.result, '$.known'), 0) = 1) AS knowns "
                "FROM items i LEFT JOIN code_tasks ct ON ct.item_id = i.id "
                "WHERE i.node_id = ? AND i.active = 1 ORDER BY i.type, i.difficulty, i.id",
                (node["id"],)
            ).fetchall()

        quizzes, cards, codes = [], [], []
        for row in rows:
            data = json.loads(row["payload"])
            # done это «ответил верно», tried это «отвечал вообще». Разница важна:
            # ядро считает вопрос отвеченным по факту попытки, и без второго флага
            # страница после перезагрузки показывала промах как нетронутый вопрос.
            # known это «отмечено как изученное»: Клиент A ответа человек не давал,
            # он сказал, что тему знает. Для ноды это Клиент A ответ, для экрана —
            # другая подпись, иначе карточка врёт «ответ засчитан».
            base = {"item_id": row["id"], "done": bool(row["wins"]),
                    "tried": bool(row["tries"]), "tries": row["tries"],
                    "known": bool(row["knowns"]),
                    "suspended": bool(row["suspended"])}
            if row["type"] in ("quiz", "readcode"):
                quizzes.append({**base, "kind": row["type"],
                                "q": data.get("q") or data.get("question", ""),
                                "code": data.get("code"), "opts": data.get("opts", []),
                                "topic": data.get("topic", ""), "lvl": data.get("lvl", 0)})
            elif row["type"] == "card":
                cards.append({**base, "front": data.get("front", ""), "back": data.get("back", ""),
                              "src": data.get("src", "")})
            elif row["type"] == "code":
                codes.append({**base, "title": data.get("title", "код-задача"),
                              "statement_md": data.get("statement_md", ""),
                              "difficulty": row["difficulty"],
                              "xp": xp.code_amount(row["difficulty"]),
                              "passed": bool(row["passed_at"]), "checks": row["checks"] or 0})
        return {"code": code, "quiz": quizzes, "cards": cards, "tasks": codes}

    @app.get("/api/site/task/{item_id}")
    def api_site_task(item_id: int):
        with session() as conn:
            return task_view(task_row(conn, item_id))

    def _run_tests(item_id: int, files: dict[str, str]):
        """Собрать решение и прогнать тесты. Ничего не записывает."""
        with session() as conn:
            row = task_row(conn, item_id)
            data = json.loads(row["payload"])
        files = _sanitize_files(files)
        # Файл с тестами ученик мог открыть на чтение — обратно его не принимаем,
        # иначе решение «поправил тест» станет рабочей стратегией.
        files.pop(tasks.test_file_name(data["visible_tests"]), None)
        if not files:
            raise HTTPException(status_code=400, detail="в решении нет ни одного своего файла")
        try:
            return data, tasks.check_files(cfg, data, files)
        except tasks.TaskError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except sandbox.SandboxUnavailable as exc:
            raise HTTPException(status_code=503, detail=f"песочница недоступна: {exc}") from exc

    @app.post("/api/site/task/{item_id}/try")
    def api_site_task_try(item_id: int, body: CheckBody):
        """Прогон тестов без записи: кнопка «запустить».

        Отличается от сдачи ровно одним: результат никуда не пишется. Ученик
        гоняет тесты сколько хочет, счётчик попыток при этом не растёт.
        """
        _, verdict = _run_tests(item_id, body.files)
        return {"verdict": verdict.to_json(), "compile_out": verdict.compile_out,
                "visible_out": verdict.visible_out, "recorded": False}

    @app.post("/api/site/task/{item_id}/check")
    def api_site_task_check(item_id: int, body: CheckBody):
        """Сдать решение из браузера. Считает та же функция, что и `arena check`."""
        with session() as conn:
            node_id = task_row(conn, item_id)["node_id"]
        _, verdict = _run_tests(item_id, body.files)
        with session() as conn:
            conn.execute(
                "INSERT INTO code_tasks(item_id, node_id, issued_at) VALUES (?, ?, datetime('now')) "
                "ON CONFLICT(item_id) DO NOTHING", (item_id, node_id))
            result = tasks.record_check(conn, cfg, item_id, verdict.to_json())
            state = task_view(task_row(conn, item_id))
        return {"verdict": verdict.to_json(), "compile_out": verdict.compile_out,
                "visible_out": verdict.visible_out, "result": result, "task": state}

    @app.post("/api/site/run")
    def api_site_run(body: RunBody):
        """Запустить произвольный набор файлов: кнопка «запустить» в статье и в IDE."""
        return run_main(cfg, body.files, body.main, body.args, body.stdin)

    @app.get("/api/site/sql/status")
    def api_site_sql_status():
        """Жив ли движок задачника. Фронт спрашивает, чтобы сказать человеку
        «подними Postgres», а не показывать красное «ошибка» на каждой задаче."""
        up = sqlrun.available()
        return {"up": up, "datasets": sorted(sqlrun.DATASETS),
                "hint": "" if up else "brew services start postgresql@17"}

    @app.post("/api/site/sql")
    def api_site_sql(body: SqlBody):
        try:
            return sqlrun.run(body.sql, dataset=body.dataset, mode=body.mode, sid=body.sid)
        except sqlrun.SqlUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/api/site/sql/scenario")
    def api_site_sql_scenario(body: SqlScenarioBody):
        if len(body.steps) > 24:
            raise HTTPException(status_code=400, detail="в сценарии больше двух десятков шагов")
        try:
            return sqlrun.run_scenario(
                [{"slot": s.slot, "sql": s.sql, "expect_wait": s.expect_wait} for s in body.steps],
                dataset=body.dataset)
        except sqlrun.SqlUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/api/site/sql/reset")
    def api_site_sql_reset(body: SqlResetBody):
        try:
            sqlrun.session_reset(body.sid, body.dataset)
        except sqlrun.SqlUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {"ok": True}

    @app.post("/api/site/term")
    def api_site_term(body: TermBody):
        """Одна команда в терминале статьи: javac и java по отдельности, как в жизни."""
        return term_run(cfg, body.sid, body.files, body.cmd)
