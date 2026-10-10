"""Код-задачи: материализация, прогон, вердикт.

Раздел 12 плана. Порядок работы такой:

1. `arena task` кладёт постановку, стартовые файлы и видимые тесты в портфель ученика
   (~/projects/java-path/tasks/этап-NN/код-ноды, в песочнице внутрь стейта).
2. Ученик пишет решение.
3. `arena check` копирует решение в отдельную папку прогона, добавляет туда тесты,
   компилирует и гоняет: сначала видимые, потом скрытые.

Скрытые тесты живут в SQLite и материализуются только в папку прогона: в портфель
они не попадают, и их вывод наружу не показывается. Из скрытой части ученик видит
ровно имена кейсов и то, какие из них красные, без ожидаемого и полученного.
Технически это сделано так: стандартный вывод скрытого прогона выбрасывается целиком,
а имена берутся из XML-отчёта JUnit. Фильтровать текст было бы дырой: JUnit печатает
сообщение упавшего ассерта даже при --details=none.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from . import progress, sandbox, xp
from .config import Config
from .db import now, today

MARKER = ".arena.json"
TESTS_DIR = "tests"
# Мусор в выводе JUnit: кадры стека самого движка и таблица счётчиков.
# Строки ученика вида «FrameTest.shortWord(FrameTest.java:11)» под шаблон не попадают
# и остаются: по ним он и находит своё место в тесте.
NOISE_RE = re.compile(r"^\s+(org\.(junit|opentest4j)|java\.|jdk\.|sun\.|app//)")
# В XML-отчёте JUnit имя кейса это имя метода, а человеческое название лежит
# в аннотации. Достаём его из исходника: ученику показывать «скрытый случай»
# понятнее, чем hiddenCase.
DISPLAY_RE = re.compile(r'@DisplayName\(\s*"([^"]*)"\s*\).{0,300}?\bvoid\s+(\w+)\s*\(', re.DOTALL)
COUNTER_RE = re.compile(r"^\[\s*\d+\s+\w+[\w ]*\]\s*$")
TYPE_RE = re.compile(
    r"^\s*(?:public\s+|final\s+|abstract\s+|sealed\s+|non-sealed\s+|strictfp\s+)*"
    r"(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)",
    re.MULTILINE,
)


class TaskError(Exception):
    """Внятная ошибка для терминала."""


@dataclass
class Verdict:
    ok: bool = False
    phase: str = "compile"
    compile_out: str = ""
    visible_out: str = ""
    visible_ok: bool = False
    # Видимые кейсы по именам, как и скрытые. Раньше по видимой части наружу шёл
    # только текст дерева JUnit: в терминале читается, а на экране новичку нет.
    visible: list[dict] = field(default_factory=list)
    hidden: list[dict] = field(default_factory=list)
    hidden_ok: bool = False
    timed_out: bool = False
    method: str = ""
    seconds: float = 0.0
    message: str = ""

    def to_json(self) -> dict:
        return {
            "ok": self.ok,
            "phase": self.phase,
            "visible_ok": self.visible_ok,
            "visible": self.visible,
            "hidden_ok": self.hidden_ok,
            "hidden": self.hidden,
            "timed_out": self.timed_out,
            "method": self.method,
            "seconds": self.seconds,
            "message": self.message,
        }


# ---------------------------------------------------------------- разбор payload

def type_names(source: str) -> list[str]:
    return TYPE_RE.findall(source or "")


def test_class(source: str) -> str:
    names = type_names(source)
    if not names:
        raise TaskError("в тестах не нашёл ни одного класса, задача битая")
    for name in names:
        if name.endswith(("Test", "Tests")):
            return name
    return names[0]


def test_file_name(source: str) -> str:
    return f"{test_class(source)}.java"


def trim_junit(text: str) -> str:
    """Убрать из вывода JUnit кадры собственного стека и таблицу счётчиков."""
    kept = [
        line for line in (text or "").splitlines()
        if not NOISE_RE.match(line) and not COUNTER_RE.match(line)
    ]
    while kept and not kept[-1].strip():
        kept.pop()
    return "\n".join(kept).strip()


def payload_of(item: sqlite3.Row) -> dict:
    data = json.loads(item["payload"])
    for key in ("title", "statement_md", "starter_files", "visible_tests", "hidden_tests"):
        if key not in data:
            raise TaskError(f"в задаче {item['id']} нет поля {key}, такой payload я не приму")
    return data


# ---------------------------------------------------------------- поиск задачи

def node_by_code(conn: sqlite3.Connection, code: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT n.*, s.num AS stage_num FROM nodes n JOIN stages s ON s.id = n.stage_id "
        "WHERE n.code = ?", (code,)
    ).fetchone()
    if row is None:
        raise TaskError(f"ноды {code} нет в роадмапе")
    return row


def code_items(conn: sqlite3.Connection, node_id: int) -> list[sqlite3.Row]:
    return list(conn.execute(
        "SELECT i.*, ct.passed_at, ct.dir_path FROM items i "
        "LEFT JOIN code_tasks ct ON ct.item_id = i.id "
        "WHERE i.type = 'code' AND i.active = 1 AND i.node_id = ? ORDER BY i.difficulty, i.id",
        (node_id,),
    ))


def pick_item(conn: sqlite3.Connection, node: sqlite3.Row) -> sqlite3.Row:
    items = code_items(conn, node["id"])
    if not items:
        raise TaskError(
            f"у ноды {node['code']} пока нет код-задачи. Их пишет конвейер генерации, "
            f"а руками засеяны только демо-задачи первых этапов.\n"
            f"Наполнить эту ноду: arena gen --node {node['code']} --kind code"
        )
    for item in items:
        if not item["passed_at"]:
            return item
    return items[-1]


def next_code_node(conn: sqlite3.Connection) -> sqlite3.Row | None:
    """Ближайшая нода траектории, у которой есть несданная код-задача."""
    return conn.execute(
        "SELECT n.*, s.num AS stage_num FROM nodes n "
        "JOIN stages s ON s.id = n.stage_id "
        "JOIN items i ON i.node_id = n.id AND i.type = 'code' AND i.active = 1 "
        "LEFT JOIN code_tasks ct ON ct.item_id = i.id "
        "WHERE n.status != 'locked' AND ct.passed_at IS NULL "
        "ORDER BY n.status = 'in_progress' DESC, s.num, n.seq LIMIT 1"
    ).fetchone()


# ---------------------------------------------------------------- материализация

def task_dir(cfg: Config, node: sqlite3.Row) -> Path:
    return cfg.tasks_root / "tasks" / f"этап-{int(node['stage_num']):02d}" / node["code"]


def readme(node: sqlite3.Row, data: dict, item: sqlite3.Row, banner: str = "") -> str:
    hints = data.get("checkstyle_hints") or []
    lines = [
        f"# {data['title']}",
        "",
        f"Нода {node['code']} {node['title']}, этап {node['stage_num']}.",
        "",
    ]
    if banner:
        lines += [banner.strip(), ""]
    lines += [
        data["statement_md"].strip(),
        "",
        "## Как сдавать",
        "",
        "```",
        "arena check",
        "```",
        "",
        "Команда собирает решение и гоняет тесты в песочнице: сначала те, что лежат "
        "рядом в папке tests, потом скрытые. Скрытые ты увидишь по именам кейсов, "
        "без ожидаемых значений: это и есть проверка, а не подгонка под ответ.",
        "",
        "Файлы из tests трогать не нужно, при следующей выдаче задачи они перезапишутся.",
    ]
    if hints:
        lines += ["", "## На что посмотреть в своём коде", ""]
        lines += [f"- {hint}" for hint in hints]
    lines += ["", f"Сложность {item['difficulty']}, награда {xp.code_amount(item['difficulty'])} XP "
              f"за первую зелёную сдачу."]
    return "\n".join(lines) + "\n"


def ensure_portfolio(cfg: Config) -> None:
    """Портфель решений это git-репозиторий ученика. Создаём каркас и README,
    коммитить туда нельзя никогда: история там его, а не наша."""
    root = cfg.tasks_root
    (root / "tasks").mkdir(parents=True, exist_ok=True)
    (root / "projects").mkdir(parents=True, exist_ok=True)
    readme = root / "README.md"
    if not readme.exists():
        template = Path(__file__).resolve().parent.parent / "content" / "java_path_README.md"
        if template.is_file():
            readme.write_text(template.read_text(encoding="utf-8"), encoding="utf-8")
    if not (root / ".git").exists() and shutil.which("git"):
        subprocess.run(["git", "init", "--quiet", str(root)], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)


def materialize(cfg: Config, conn: sqlite3.Connection, node: sqlite3.Row, item: sqlite3.Row,
                force: bool = False, root: Path | None = None, extra: dict | None = None,
                banner: str = "") -> tuple[Path, list[str]]:
    """Разложить задачу по файлам. Решение ученика не перетираем никогда.

    root и extra нужны код-части босса: она живёт в своей папке и кладёт в маркер
    номер боя, чтобы `arena check` отправил отчёт на бой, а не в обычный прогресс.
    """
    data = payload_of(item)
    ensure_portfolio(cfg)
    root = root or task_dir(cfg, node)
    (root / TESTS_DIR).mkdir(parents=True, exist_ok=True)

    written: list[str] = []
    for name, source in data["starter_files"].items():
        path = root / name
        if path.exists() and not force:
            continue
        path.write_text(source.rstrip() + "\n", encoding="utf-8")
        written.append(name)

    tests_name = test_file_name(data["visible_tests"])
    (root / TESTS_DIR / tests_name).write_text(
        data["visible_tests"].rstrip() + "\n", encoding="utf-8")
    written.append(f"{TESTS_DIR}/{tests_name}")

    (root / "README.md").write_text(readme(node, data, item, banner=banner), encoding="utf-8")
    written.append("README.md")

    (root / MARKER).write_text(json.dumps({
        "item_id": item["id"],
        "node_id": node["id"],
        "node_code": node["code"],
        "title": data["title"],
        "difficulty": item["difficulty"],
        "solution_files": sorted(data["starter_files"]),
        "tests_file": tests_name,
        "env": cfg.env,
        "issued": now(),
        **(extra or {}),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return root, written


def read_marker(path: Path) -> dict:
    marker = Path(path) / MARKER
    if not marker.is_file():
        raise TaskError(
            f"в папке {path} нет файла {MARKER}. Запусти arena task, чтобы получить задачу"
        )
    return json.loads(marker.read_text(encoding="utf-8"))


def find_task_dir(cfg: Config, start: Path) -> Path | None:
    """Папка задачи это текущая папка или ближайшая вверх, где лежит маркер."""
    current = Path(start).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / MARKER).is_file():
            return candidate
        if candidate == cfg.tasks_root or candidate == Path(candidate.root):
            break
    return None


# ---------------------------------------------------------------- прогон

def display_names(source: str) -> dict[str, str]:
    return {method: title for title, method in DISPLAY_RE.findall(source or "")}


# JUnit пишет расхождение одной строкой вида «expected: <A> but was: <B>».
EXPECTED_RE = re.compile(r"expected:\s*<(?P<want>.*?)>\s*but\s*was:\s*<(?P<got>.*?)>", re.DOTALL)


def _parse_reports(reports: Path, titles: dict[str, str] | None = None,
                   details: bool = False) -> list[dict]:
    """Имена кейсов. Расхождения берём только там, где это разрешено явно.

    details=False это скрытая часть: наружу уходят одни имена, иначе скрытые
    тесты перестают быть скрытыми. details=True это видимая часть: там ожидаемое
    и полученное показывать не только можно, но и нужно — иначе «красный тест»
    ничего не объясняет.
    """
    titles = titles or {}
    cases: list[dict] = []
    for xml in sorted(reports.glob("TEST-*.xml")):
        try:
            root = ET.parse(xml).getroot()
        except ET.ParseError:
            continue
        for case in root.iter("testcase"):
            problems = [child for child in case if child.tag in ("failure", "error")]
            if any(child.tag == "skipped" for child in case):
                continue
            name = (case.get("name") or "").removesuffix("()")
            row = {"name": titles.get(name, name), "ok": not problems}
            if details and problems:
                message = (problems[0].get("message") or "").strip()
                found = EXPECTED_RE.search(message)
                if found:
                    row["want"] = found.group("want")
                    row["got"] = found.group("got")
                elif message:
                    row["why"] = " ".join(message.split())[:300]
            cases.append(row)
    return cases


def _prepare(run_dir: Path, phase: str, solution: dict[str, str], tests: str) -> tuple[Path, str]:
    src = run_dir / phase / "src"
    src.mkdir(parents=True, exist_ok=True)
    (run_dir / phase / "classes").mkdir(parents=True, exist_ok=True)
    for name, source in solution.items():
        (src / Path(name).name).write_text(source, encoding="utf-8")
    name = test_file_name(tests)
    (src / name).write_text(tests.rstrip() + "\n", encoding="utf-8")
    return src, test_class(tests)


def _javac(run_dir: Path, phase: str, timeout: int, method: str | None) -> sandbox.RunResult:
    src = run_dir / phase / "src"
    files = sorted(str(p.relative_to(run_dir)) for p in src.glob("*.java"))
    return sandbox.run_javac(
        ["-encoding", "UTF-8", "-nowarn", "-cp", str(sandbox.JUNIT_JAR),
         "-d", f"{phase}/classes", *files],
        run_dir, timeout=timeout, method=method,
    )


def _junit(run_dir: Path, phase: str, cls: str, timeout: int, method: str | None,
           details: str) -> sandbox.RunResult:
    return sandbox.run_java(
        ["-jar", str(sandbox.JUNIT_JAR), "execute",
         "--class-path", f"{phase}/classes",
         "--select-class", cls,
         f"--details={details}",
         "--disable-ansi-colors", "--disable-banner",
         "--reports-dir", f"{phase}/reports"],
        run_dir, timeout=timeout, method=method,
    )


def solution_files(task_root: Path, marker: dict) -> dict[str, str]:
    files: dict[str, str] = {}
    for path in sorted(task_root.glob("*.java")):
        files[path.name] = path.read_text(encoding="utf-8")
    if not files:
        raise TaskError(
            f"в папке {task_root} нет ни одного .java. Решение пишется в файлы "
            + ", ".join(marker.get("solution_files") or ["из стартового набора"])
        )
    return files


def sweep_runs(cfg: Config, older_than_sec: int = 3600) -> None:
    """Подмести старые папки прогонов. В них лежат скрытые тесты, и если прошлый
    запуск убили сигналом, они не должны валяться на диске неделями."""
    root = cfg.runs_root
    if not root.is_dir():
        return
    now_ts = time.time()
    for path in root.iterdir():
        try:
            if path.is_dir() and now_ts - path.stat().st_mtime > older_than_sec:
                shutil.rmtree(path, ignore_errors=True)
        except OSError:
            continue


def run_check(cfg: Config, task_root: Path, data: dict, timeout: int = sandbox.TIMEOUT,
              method: str | None = None, marker: dict | None = None) -> Verdict:
    """Собрать и прогнать решение. Наружу отдаём вердикт, а не сырой вывод скрытых тестов."""
    if not sandbox.junit_ready():
        raise TaskError(
            f"нет джарника JUnit ({sandbox.JUNIT_JAR}). Скачай его в vendor/, "
            f"без него проверять нечем"
        )
    marker = marker or {}
    solution = solution_files(task_root, marker)

    sweep_runs(cfg)
    stamp = now().replace(":", "-")
    run_dir = cfg.runs_root / f"{marker.get('node_code', 'task')}-{stamp}"
    if run_dir.exists():
        shutil.rmtree(run_dir, ignore_errors=True)
    run_dir.mkdir(parents=True, exist_ok=True)

    verdict = Verdict()
    try:
        _, visible_cls = _prepare(run_dir, "visible", solution, data["visible_tests"])
        res = _javac(run_dir, "visible", timeout, method)
        verdict.method = res.method
        verdict.seconds += res.seconds
        verdict.compile_out = (res.stdout + res.stderr).strip()
        if res.timed_out:
            verdict.timed_out = True
            verdict.message = f"компиляция не уложилась в {timeout} секунд и была прервана"
            return verdict
        if res.rc != 0:
            verdict.message = "решение не компилируется"
            return verdict

        verdict.phase = "visible"
        res = _junit(run_dir, "visible", visible_cls, timeout, method, "tree")
        verdict.seconds += res.seconds
        verdict.visible_out = trim_junit(res.stdout + res.stderr)
        if res.timed_out:
            verdict.timed_out = True
            verdict.message = (
                f"видимые тесты не уложились в {timeout} секунд. Обычно это вечный цикл: "
                f"проверь условие выхода"
            )
            return verdict
        verdict.visible_ok = res.rc == 0
        # Имена видимых кейсов достаём всегда, и на зелёном тоже: экран задачи
        # показывает их списком, а не деревом JUnit.
        verdict.visible = _parse_reports(
            run_dir / "visible" / "reports", display_names(data["visible_tests"]),
            details=True,
        )
        if not verdict.visible_ok:
            verdict.message = "видимые тесты красные"
            return verdict

        verdict.phase = "hidden"
        _, hidden_cls = _prepare(run_dir, "hidden", solution, data["hidden_tests"])
        res = _javac(run_dir, "hidden", timeout, method)
        verdict.seconds += res.seconds
        if res.timed_out:
            verdict.timed_out = True
            verdict.message = f"скрытая часть не уложилась в {timeout} секунд"
            return verdict
        if res.rc != 0:
            # Вывод javac здесь не показываем: в тексте ошибки видны имена методов
            # и сигнатуры из скрытых тестов.
            verdict.message = (
                "скрытые тесты не собрались с твоим решением. Похоже, публичный "
                "интерфейс отличается от того, что просили в постановке: проверь имена "
                "и сигнатуры методов"
            )
            return verdict

        res = _junit(run_dir, "hidden", hidden_cls, timeout, method, "none")
        verdict.seconds += res.seconds
        if res.timed_out:
            verdict.timed_out = True
            verdict.message = (
                f"скрытые тесты не уложились в {timeout} секунд. Обычно это вечный цикл "
                f"на данных, которых не было в видимых тестах"
            )
            return verdict
        # Стандартный вывод скрытого прогона выбрасываем целиком: JUnit печатает
        # в него сообщения ассертов, а это ровно то, что показывать нельзя.
        verdict.hidden = _parse_reports(
            run_dir / "hidden" / "reports", display_names(data["hidden_tests"])
        )
        if not verdict.hidden:
            verdict.message = "скрытые тесты не отчитались, прогон сорвался"
            return verdict
        verdict.hidden_ok = all(case["ok"] for case in verdict.hidden)
        verdict.ok = verdict.hidden_ok
        verdict.phase = "done"
        verdict.message = "всё зелёное" if verdict.ok else "скрытые тесты красные"
        return verdict
    finally:
        if os.environ.get("ARENA_KEEP_RUNS") == "1":
            print(f"папка прогона осталась: {run_dir}")
        else:
            shutil.rmtree(run_dir, ignore_errors=True)


def check_files(cfg: Config, data: dict, files: dict[str, str],
                timeout: int = sandbox.TIMEOUT, method: str | None = None) -> Verdict:
    """Прогнать произвольный набор исходников против тестов задачи.

    Нужно конвейеру генерации: он проверяет эталон и стартовый набор ещё до того,
    как задача попала в банк и хоть кто-то её увидел. Ученику эта дверь не нужна:
    у него решение лежит на диске, и его гоняет run_check.
    """
    root = cfg.runs_root / f"verify-{now().replace(':', '-')}-{secrets.token_hex(3)}"
    root.mkdir(parents=True, exist_ok=True)
    try:
        for name, source in files.items():
            (root / Path(name).name).write_text(source.rstrip() + "\n", encoding="utf-8")
        return run_check(cfg, root, data, timeout=timeout, method=method,
                         marker={"node_code": "verify"})
    finally:
        shutil.rmtree(root, ignore_errors=True)


def render(verdict: Verdict, title: str = "") -> str:
    """Вывод в терминал. Скрытые кейсы только по именам."""
    lines: list[str] = []
    if title:
        lines.append(title)
    if verdict.phase == "compile" and not verdict.timed_out and verdict.compile_out:
        lines.append("")
        lines.append("javac ругается:")
        lines.append(verdict.compile_out)
    if verdict.visible_out:
        lines.append("")
        lines.append("видимые тесты:")
        lines.append(verdict.visible_out.strip())
    if verdict.hidden:
        lines.append("")
        good = sum(1 for c in verdict.hidden if c["ok"])
        lines.append(f"скрытые тесты: {good} из {len(verdict.hidden)}")
        for case in verdict.hidden:
            lines.append(f"  {'зелёный' if case['ok'] else 'КРАСНЫЙ'} {case['name']}")
        if not verdict.hidden_ok:
            lines.append("")
            lines.append("Что именно подали на вход, не покажу: в этом и смысл скрытой части. "
                         "Подумай, какие случаи ты не разобрал.")
    lines.append("")
    lines.append(("готово: " if verdict.ok else "не сдано: ") + verdict.message)
    return "\n".join(lines)


# ---------------------------------------------------------------- запись в базу

def record_issue(conn: sqlite3.Connection, item_id: int, node_id: int, dir_path: str) -> dict:
    row = conn.execute("SELECT * FROM code_tasks WHERE item_id = ?", (item_id,)).fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO code_tasks(item_id, node_id, dir_path, issued_at) VALUES (?, ?, ?, ?)",
            (item_id, node_id, dir_path, now()),
        )
    else:
        conn.execute("UPDATE code_tasks SET dir_path = ?, node_id = ? WHERE item_id = ?",
                     (dir_path, node_id, item_id))
    conn.commit()
    return {"ok": True}


def record_check(conn: sqlite3.Connection, cfg: Config, item_id: int, verdict: dict,
                 day: str | None = None) -> dict:
    """Единственный писатель результата: XP, счётчик дня, попытка, закрытие ноды."""
    day = day or today()
    item = conn.execute(
        "SELECT id, node_id, difficulty FROM items WHERE id = ? AND type = 'code'", (item_id,)
    ).fetchone()
    if item is None:
        raise LookupError(f"нет код-задачи {item_id}")

    ok = bool(verdict.get("ok"))
    row = conn.execute("SELECT * FROM code_tasks WHERE item_id = ?", (item_id,)).fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO code_tasks(item_id, node_id, issued_at) VALUES (?, ?, ?)",
            (item_id, item["node_id"], now()),
        )
        row = conn.execute("SELECT * FROM code_tasks WHERE item_id = ?", (item_id,)).fetchone()

    first_green = ok and not row["passed_at"]
    conn.execute(
        "UPDATE code_tasks SET checks = checks + 1, last_ts = ?, last_result = ?, "
        "passed_at = COALESCE(passed_at, ?) WHERE item_id = ?",
        (now(), json.dumps(verdict, ensure_ascii=False), now() if ok else None, item_id),
    )

    gained = 0
    if first_green and not xp.already_paid(conn, xp.CODE, "item", item_id):
        gained = xp.award(conn, xp.code_amount(item["difficulty"]), xp.CODE, "item", item_id, day)
    if first_green:
        xp.bump(conn, day, "code_count")

    conn.execute(
        "INSERT INTO attempts(item_id, node_id, kind, ts, correct, result, xp) "
        "VALUES (?, ?, 'code', ?, ?, ?, ?)",
        (item_id, item["node_id"], now(), 1 if ok else 0,
         json.dumps(verdict, ensure_ascii=False), gained),
    )
    conn.commit()

    closed = progress.check_node(conn, cfg, item["node_id"], day=day) if ok else None
    from . import contract as contract_mod

    contract_xp = contract_mod.close_if_ready(conn, day)
    conn.commit()
    return {
        "xp": gained,
        "first_green": first_green,
        "contract_xp": contract_xp,
        "node_closed": closed,
    }
