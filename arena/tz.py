"""ТЗ-цех: банк постановок, выдача проекта, прогон, ревью и статусы.

Раздел 10 плана. Коротко правила, чтобы их не выуживать из кода:

- ТЗ выдаётся после взятого босса этапа (гейт обходится dev-флагом и только
  в песочнице);
- проект материализуется в ~/projects/java-path/projects/, и arena туда никогда
  не коммитит: это репозиторий ученика (правило 14.7);
- скрытые тесты в постановке не показываются, ученик пишет свои;
- приёмка это прогон скрытых тестов плюс ИИ-ревью по рубрике: корректность,
  структура, имена, использование тем этапа, тесты ученика;
- статусы accepted и rework, у rework всегда конкретный список.

Главное решение фазы: вердикт считает код, а прозу пишет модель. Статус
складывается из зелёных скрытых тестов, машинных фактов о коде и баллов рубрики.
Свободного поля «verdict» у модели нет, иначе статус зависел бы от её настроения.

Второе решение: rework может ссылаться только на то, что написано в постановке.
Пункты ограничений и критериев приёмки нумеруются механически, модель обязана
привязать каждое замечание к номеру. Замечание без номера не роняет сдачу,
оно уходит в «на будущее». Иначе ученик получал бы rework за требование,
которого в ТЗ не было, и это ровно та обида, которой продукт не должен приносить.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from . import llm, sandbox, xp
from .config import Config, PROJECT_ROOT
from .db import now, today

MARKER = ".arena-tz.json"
TESTS_DIR = "tests"
PROJECTS_DIR = "projects"
# Гейт «ТЗ после босса» обходится только в песочнице: это нужно приёмке фазы 7.
DEV_ANY = "ARENA_DEV_TZ_ANY"
RUBRIC_PATH = PROJECT_ROOT / "content" / "tz_review.md"
CALL_TIMEOUT = 900
QUALITY_MAX = 300
# Балл рубрики: пять критериев по два, приёмка от семи и при отсутствии нулей.
ACCEPT_MIN = 7
MAX_PER_CRITERION = 2
CRITERIA = (
    ("correct", "корректность"),
    ("structure", "структура"),
    ("naming", "имена"),
    ("topics", "использование тем этапа"),
    ("tests", "тесты ученика"),
)
STATUS_TITLES = {
    "issued": "выдано",
    "submitted": "на проверке",
    "accepted": "принято",
    "rework": "на доработку",
}


class TzError(Exception):
    """Внятный отказ: экран и терминал показывают текст как есть."""


# ---------------------------------------------------------------- разбор исходников

COMMENTS_RE = re.compile(r"/\*.*?\*/|//[^\n]*", re.S)
DECL_RE = re.compile(
    r"^[ \t]*(?:(?:public|private|protected|static|final|abstract|synchronized|native)\s+)*"
    r"[\w\.\[\]<>,\s]+?\s+(\w+)\s*\([^;{]*\)\s*\{",
    re.MULTILINE,
)
TYPE_DECL_RE = re.compile(
    r"^([ \t]*)(?:(?:public|private|protected|static|final|abstract|sealed|non-sealed)\s+)*"
    r"(class|interface|enum|record)\s+(\w+)",
    re.MULTILINE,
)


def strip_comments(source: str) -> str:
    """Убрать комментарии перед машинной проверкой конструкций.

    Иначе слово switch в комментарии «сделай через switch» засчиталось бы
    за использованный switch, а обещание «без double» за его применение.
    """
    return COMMENTS_RE.sub(" ", source or "")


def code_of(sources: dict[str, str]) -> str:
    return "\n".join(strip_comments(text) for text in sources.values())


def method_names(sources: dict[str, str]) -> list[str]:
    names: list[str] = []
    for text in sources.values():
        names += DECL_RE.findall(strip_comments(text))
    return names


def has_nested_type(sources: dict[str, str]) -> bool:
    """Вложенный тип это объявление класса с отступом внутри другого класса."""
    for text in sources.values():
        found = TYPE_DECL_RE.findall(strip_comments(text))
        if len(found) > 1 and any(indent.strip("\n") for indent, _kind, _name in found[1:]):
            return True
    return False


def has_overload(sources: dict[str, str]) -> bool:
    names = method_names(sources)
    return any(names.count(name) > 1 for name in set(names))


# Каталог машинных проверок. Генератор выбирает из него по id, свободных
# регэкспов модель не пишет: это ровно то место, где она ошибалась бы молча.
CONSTRUCTS: dict[str, dict] = {
    "array2d": {
        "title": "двумерный массив",
        "check": lambda src, ctx: bool(re.search(r"\[\s*\]\s*\[\s*\]", code_of(src))),
    },
    "switch": {
        "title": "switch вместо цепочки if else",
        "check": lambda src, ctx: bool(re.search(r"\bswitch\b", code_of(src))),
    },
    "overload": {
        "title": "перегрузка метода",
        "check": lambda src, ctx: has_overload(src),
    },
    "no_double": {
        "title": "целочисленная арифметика без double и Math.ceil",
        "check": lambda src, ctx: not re.search(r"\bdouble\b|Math\s*\.\s*ceil", code_of(src)),
    },
    "own_tests": {
        "title": "свои тесты на JUnit",
        "check": lambda src, ctx: ctx.get("test_files", 0) > 0,
    },
    "nested_class": {
        "title": "вложенный или внутренний класс",
        "check": lambda src, ctx: has_nested_type(src),
    },
    "enum": {
        "title": "enum",
        "check": lambda src, ctx: bool(re.search(r"\benum\s+\w+", code_of(src))),
    },
    "record": {
        "title": "record",
        "check": lambda src, ctx: bool(re.search(r"\brecord\s+\w+\s*\(", code_of(src))),
    },
    "interface": {
        "title": "интерфейс",
        "check": lambda src, ctx: bool(re.search(r"\binterface\s+\w+", code_of(src))),
    },
    "inheritance": {
        "title": "наследование или реализация интерфейса",
        "check": lambda src, ctx: bool(re.search(r"\b(extends|implements)\s+\w+", code_of(src))),
    },
    "exceptions": {
        "title": "проверка входа с исключением",
        "check": lambda src, ctx: bool(re.search(r"\bthrow\s+new\b", code_of(src))),
    },
    "generics": {
        "title": "дженерик-тип",
        "check": lambda src, ctx: bool(re.search(r"<\s*[A-Z]\w*\s*(,\s*[A-Z]\w*\s*)*>", code_of(src))),
    },
    "collections": {
        "title": "коллекции",
        "check": lambda src, ctx: bool(re.search(r"\b(List|Map|Set|ArrayList|HashMap)\b", code_of(src))),
    },
    "lambda": {
        "title": "лямбда или ссылка на метод",
        "check": lambda src, ctx: bool(re.search(r"->|::", code_of(src))),
    },
    "streams": {
        "title": "Stream API",
        "check": lambda src, ctx: bool(re.search(r"\.stream\s*\(|\bStream\b", code_of(src))),
    },
}


def construct_facts(sources: dict[str, str], must_use: list[dict], ctx: dict) -> list[dict]:
    """Что из обязательного реально встретилось в коде. Это факты для промпта
    и одновременно потолок для критерия «использование тем этапа»."""
    out = []
    for rule in must_use or []:
        key = rule.get("id")
        spec = CONSTRUCTS.get(key)
        if spec is None:
            continue
        try:
            ok = bool(spec["check"](sources, ctx))
        except Exception:  # noqa: BLE001
            ok = False
        out.append({
            "id": key,
            "title": spec["title"],
            "why": rule.get("why", ""),
            "ok": ok,
        })
    return out


# ---------------------------------------------------------------- пункты постановки

POINT_SECTIONS = ("ограничения", "критерии приёмки", "критерии приемки")


def spec_points(spec_md: str) -> list[dict]:
    """Пронумеровать пункты, на которые ревью имеет право ссылаться.

    Берутся списки из разделов «Ограничения» и «Критерии приёмки»: ровно то,
    что раздел 10 плана называет открытыми критериями приёмки.
    """
    points: list[dict] = []
    inside = False
    for line in (spec_md or "").splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            title = stripped.lstrip("#").strip().lower()
            inside = any(title.startswith(name) for name in POINT_SECTIONS)
            continue
        if not inside:
            continue
        text = ""
        if stripped.startswith(("- ", "* ")):
            text = stripped[2:].strip()
        elif re.match(r"^\d+\.\s+", stripped):
            text = re.sub(r"^\d+\.\s+", "", stripped).strip()
        elif stripped and points and line.startswith((" ", "\t")):
            # Продолжение пункта на следующей строке: без склейки ревью цитировало бы
            # обрубок, и ученик не понял бы, на что оно ссылается.
            points[-1]["text"] = (points[-1]["text"] + " " + stripped).strip()
            continue
        if text:
            points.append({"id": f"П{len(points) + 1}", "text": text})
    for point in points:
        point["text"] = point["text"].strip().rstrip(";.")
    return points


# ---------------------------------------------------------------- банк постановок

def payload_of(row: sqlite3.Row) -> dict:
    data = json.loads(row["payload"])
    for key in ("hidden_tests", "reference_solution"):
        if not data.get(key):
            raise TzError(f"в постановке {row['slug']} нет поля {key}")
    return data


def dir_name_for(stage_num: int, slug: str, payload: dict | None = None) -> str:
    explicit = (payload or {}).get("dir_name")
    if explicit:
        return explicit
    tail = re.sub(r"^(etap|этап)[-_]?\d+[-_]?", "", slug)
    return f"этап-{int(stage_num):02d}-{tail or slug}"


def add_spec(conn: sqlite3.Connection, stage_id: int, slug: str, title: str, spec_md: str,
             payload: dict, source: str = "gen", verified_at: str | None = None) -> int:
    """Положить постановку в банк. Зовётся только после зелёной самопроверки."""
    body = json.dumps(payload, ensure_ascii=False)
    row = conn.execute("SELECT id FROM tz_specs WHERE slug = ?", (slug,)).fetchone()
    if row is None:
        cur = conn.execute(
            "INSERT INTO tz_specs(stage_id, slug, title, spec_md, payload, source, "
            "verified_at, active, created) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)",
            (stage_id, slug, title, spec_md, body, source, verified_at or now(), now()),
        )
        conn.commit()
        return cur.lastrowid
    conn.execute(
        "UPDATE tz_specs SET stage_id = ?, title = ?, spec_md = ?, payload = ?, source = ?, "
        "verified_at = ? WHERE id = ?",
        (stage_id, title, spec_md, body, source, verified_at or now(), row["id"]),
    )
    conn.commit()
    return row["id"]


def specs_for_stage(conn: sqlite3.Connection, stage_id: int) -> list[sqlite3.Row]:
    return list(conn.execute(
        "SELECT * FROM tz_specs WHERE stage_id = ? AND active = 1 ORDER BY id", (stage_id,)
    ))


# ---------------------------------------------------------------- гейт и выдача

def dev_gate_off(cfg: Config) -> bool:
    """Обход гейта босса. В боевом профиле переменная не работает, и точка."""
    if not os.environ.get(DEV_ANY):
        return False
    if not cfg.is_sandbox:
        print("боевой профиль: обход гейта ТЗ игнорируется")
        return False
    return True


def stage_by_num(conn: sqlite3.Connection, num: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM stages WHERE num = ?", (int(num),)).fetchone()
    if row is None:
        raise LookupError(f"нет этапа {num}")
    return row


def gate(conn: sqlite3.Connection, cfg: Config, stage_id: int) -> dict:
    from . import boss as boss_mod

    passed = boss_mod.passed_stage(conn, stage_id)
    bypass = dev_gate_off(cfg)
    return {"boss_passed": passed, "ready": passed or bypass, "dev_bypass": bypass and not passed}


def project_by_id(conn: sqlite3.Connection, tz_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM tz_projects WHERE id = ?", (int(tz_id),)).fetchone()
    if row is None:
        raise LookupError(f"нет ТЗ {tz_id}")
    return row


def live_project(conn: sqlite3.Connection, stage_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM tz_projects WHERE stage_id = ? ORDER BY id DESC LIMIT 1", (stage_id,)
    ).fetchone()


def start(conn: sqlite3.Connection, cfg: Config, stage_num: int) -> dict:
    """Выдать ТЗ этапа. Повторная выдача возвращает тот же проект."""
    stage = stage_by_num(conn, stage_num)
    live = live_project(conn, stage["id"])
    if live is not None:
        materialize(cfg, conn, live)
        return view(conn, cfg, project_by_id(conn, live["id"]))

    g = gate(conn, cfg, stage["id"])
    if not g["ready"]:
        raise TzError(
            f"ТЗ этапа {stage['num']} выдаётся после того, как взят босс этапа. "
            f"Босс ещё не взят, так что сначала бой"
        )
    bank = specs_for_stage(conn, stage["id"])
    if not bank:
        raise TzError(
            f"постановки для этапа {stage['num']} в банке нет. Сгенерировать её: "
            f"arena tz gen --stage {stage['num']} (это живой вызов модели, пара минут)"
        )
    spec = bank[0]
    payload = payload_of(spec)
    cur = conn.execute(
        "INSERT INTO tz_projects(stage_id, spec_id, title, spec_md, status, ts) "
        "VALUES (?, ?, ?, ?, 'issued', ?)",
        (stage["id"], spec["id"], spec["title"], spec["spec_md"], now()),
    )
    conn.commit()
    row = project_by_id(conn, cur.lastrowid)
    root = materialize(cfg, conn, row)
    conn.execute("UPDATE tz_projects SET dir_path = ? WHERE id = ?", (str(root), row["id"]))
    conn.commit()
    return view(conn, cfg, project_by_id(conn, row["id"]))


# ---------------------------------------------------------------- материализация

def spec_of(conn: sqlite3.Connection, row: sqlite3.Row) -> sqlite3.Row:
    spec = conn.execute("SELECT * FROM tz_specs WHERE id = ?", (row["spec_id"],)).fetchone()
    if spec is None:
        raise TzError("постановка этого ТЗ пропала из банка")
    return spec


def project_dir(cfg: Config, stage_num: int, slug: str, payload: dict) -> Path:
    return cfg.tasks_root / PROJECTS_DIR / dir_name_for(stage_num, slug, payload)


def readme(row: sqlite3.Row, spec_md: str) -> str:
    return "\n".join([
        f"# {row['title']}",
        "",
        spec_md.strip(),
        "",
        "## Как сдавать",
        "",
        "```",
        "arena tz submit",
        "```",
        "",
        "Команда собирает решение, прогоняет твои тесты из папки tests, потом скрытые, "
        "и отправляет всё на ревью. Ответ приходит в терминал и на вкладку «ТЗ».",
        "Скрытые тесты ты видишь только по именам кейсов, без ожидаемых значений.",
        "",
        "Решение пиши в .java рядом с этим файлом, свои тесты складывай в tests. "
        "Коммитит этот репозиторий только ученик: arena сюда не коммитит никогда.",
        "",
    ])


def materialize(cfg: Config, conn: sqlite3.Connection, row: sqlite3.Row,
                force: bool = False) -> Path:
    """Разложить проект по файлам. Написанное учеником не перетираем никогда."""
    from . import tasks as tasks_mod

    spec = spec_of(conn, row)
    payload = payload_of(spec)
    stage = conn.execute("SELECT num FROM stages WHERE id = ?", (row["stage_id"],)).fetchone()
    tasks_mod.ensure_portfolio(cfg)
    root = Path(row["dir_path"]) if row["dir_path"] else project_dir(
        cfg, stage["num"], spec["slug"], payload)
    (root / TESTS_DIR).mkdir(parents=True, exist_ok=True)

    for name, source in (payload.get("starter_files") or {}).items():
        path = root / Path(name).name
        if path.exists() and not force:
            continue
        path.write_text(source.rstrip() + "\n", encoding="utf-8")

    (root / "README.md").write_text(readme(row, spec["spec_md"]), encoding="utf-8")
    hint = root / TESTS_DIR / "README.md"
    if not hint.exists():
        hint.write_text(
            "Сюда кладутся твои тесты на JUnit 5, по одному классу в файл.\n"
            "Их гоняет arena tz submit до скрытых, и результат идёт в ревью.\n",
            encoding="utf-8",
        )
    (root / MARKER).write_text(json.dumps({
        "tz_id": row["id"],
        "stage_num": stage["num"],
        "slug": spec["slug"],
        "title": row["title"],
        "env": cfg.env,
        "issued": row["ts"],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return root


def read_marker(path: Path) -> dict:
    marker = Path(path) / MARKER
    if not marker.is_file():
        raise TzError(
            f"в папке {path} нет файла {MARKER}. Получить ТЗ: arena tz start"
        )
    return json.loads(marker.read_text(encoding="utf-8"))


def find_project_dir(cfg: Config, start_at: Path) -> Path | None:
    current = Path(start_at).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / MARKER).is_file():
            return candidate
        if candidate == cfg.tasks_root or candidate == Path(candidate.root):
            break
    return None


def solution_sources(root: Path) -> dict[str, str]:
    return {p.name: p.read_text(encoding="utf-8") for p in sorted(Path(root).glob("*.java"))}


def test_sources(root: Path) -> dict[str, str]:
    tests = Path(root) / TESTS_DIR
    if not tests.is_dir():
        return {}
    return {p.name: p.read_text(encoding="utf-8") for p in sorted(tests.glob("*.java"))}


# ---------------------------------------------------------------- прогон

@dataclass
class Verdict:
    ok: bool = False
    phase: str = "compile"
    compile_out: str = ""
    tests_total: int = 0
    tests_green: int = 0
    tests_files: int = 0
    tests_out: str = ""
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
            "tests_total": self.tests_total,
            "tests_green": self.tests_green,
            "tests_files": self.tests_files,
            "tests_out": self.tests_out,
            "hidden": self.hidden,
            "hidden_ok": self.hidden_ok,
            "timed_out": self.timed_out,
            "method": self.method,
            "seconds": self.seconds,
            "message": self.message,
        }


def _write(src: Path, sources: dict[str, str]) -> None:
    src.mkdir(parents=True, exist_ok=True)
    for name, text in sources.items():
        (src / Path(name).name).write_text(text.rstrip() + "\n", encoding="utf-8")


def _javac(run_dir: Path, phase: str, timeout: int, method: str | None) -> sandbox.RunResult:
    src = run_dir / phase / "src"
    (run_dir / phase / "classes").mkdir(parents=True, exist_ok=True)
    files = sorted(str(p.relative_to(run_dir)) for p in src.glob("*.java"))
    return sandbox.run_javac(
        ["-encoding", "UTF-8", "-nowarn", "-cp", str(sandbox.JUNIT_JAR),
         "-d", f"{phase}/classes", *files],
        run_dir, timeout=timeout, method=method,
    )


def _junit(run_dir: Path, phase: str, classes: list[str], timeout: int, method: str | None,
           details: str) -> sandbox.RunResult:
    argv = ["-jar", str(sandbox.JUNIT_JAR), "execute", "--class-path", f"{phase}/classes"]
    for name in classes:
        argv += ["--select-class", name]
    argv += [f"--details={details}", "--disable-ansi-colors", "--disable-banner",
             "--reports-dir", f"{phase}/reports"]
    return sandbox.run_java(argv, run_dir, timeout=timeout, method=method)


def run(cfg: Config, root: Path, payload: dict, timeout: int = sandbox.TIMEOUT,
        method: str | None = None, sources: dict[str, str] | None = None,
        tests: dict[str, str] | None = None) -> Verdict:
    """Собрать и прогнать проект.

    Три отдельные папки компиляции: решение, решение с тестами ученика, решение
    со скрытыми тестами. Разделение обязательно: если свалить тесты ученика
    и скрытые в одну кучу, совпадение имени классов даст «скрытые тесты
    не собрались» без права объяснить, чем именно они не собрались.
    """
    from . import tasks as tasks_mod

    if not sandbox.junit_ready():
        raise TzError(f"нет джарника JUnit ({sandbox.JUNIT_JAR}), проверять нечем")
    sources = sources if sources is not None else solution_sources(root)
    tests = tests if tests is not None else test_sources(root)
    if not sources:
        raise TzError(
            f"в папке {root} нет ни одного .java. Решение пишется рядом с README.md, "
            f"свои тесты в подпапке {TESTS_DIR}"
        )

    tasks_mod.sweep_runs(cfg)
    stamp = now().replace(":", "-")
    run_dir = cfg.runs_root / f"tz-{stamp}"
    if run_dir.exists():
        shutil.rmtree(run_dir, ignore_errors=True)
    run_dir.mkdir(parents=True, exist_ok=True)

    verdict = Verdict(tests_files=len(tests))
    try:
        _write(run_dir / "solo" / "src", sources)
        res = _javac(run_dir, "solo", timeout, method)
        verdict.method = res.method
        verdict.seconds += res.seconds
        verdict.compile_out = tasks_mod.trim_junit(res.stdout + res.stderr)
        if res.timed_out:
            verdict.timed_out = True
            verdict.message = f"компиляция не уложилась в {timeout} секунд"
            return verdict
        if res.rc != 0:
            verdict.message = "решение не компилируется"
            return verdict

        if tests:
            verdict.phase = "tests"
            _write(run_dir / "own" / "src", {**sources, **tests})
            res = _javac(run_dir, "own", timeout, method)
            verdict.seconds += res.seconds
            if res.rc != 0 or res.timed_out:
                verdict.tests_out = tasks_mod.trim_junit(res.stdout + res.stderr)
                verdict.message = "твои тесты не компилируются"
                return verdict
            classes = [tasks_mod.test_class(text) for text in tests.values()]
            res = _junit(run_dir, "own", classes, timeout, method, "tree")
            verdict.seconds += res.seconds
            verdict.tests_out = tasks_mod.trim_junit(res.stdout + res.stderr)
            cases = tasks_mod._parse_reports(run_dir / "own" / "reports")
            verdict.tests_total = len(cases)
            verdict.tests_green = sum(1 for c in cases if c["ok"])

        verdict.phase = "hidden"
        hidden = payload["hidden_tests"]
        _write(run_dir / "hidden" / "src", {**sources, tasks_mod.test_file_name(hidden): hidden})
        res = _javac(run_dir, "hidden", timeout, method)
        verdict.seconds += res.seconds
        if res.timed_out:
            verdict.timed_out = True
            verdict.message = f"скрытая часть не уложилась в {timeout} секунд"
            return verdict
        if res.rc != 0:
            # Вывод javac не показываем: в тексте ошибок видны сигнатуры скрытых тестов.
            verdict.message = (
                "скрытые тесты не собрались с твоим решением. Похоже, публичный "
                "интерфейс разошёлся с постановкой: проверь имена классов, методов "
                "и типы параметров"
            )
            return verdict
        res = _junit(run_dir, "hidden", [tasks_mod.test_class(hidden)], timeout, method, "none")
        verdict.seconds += res.seconds
        if res.timed_out:
            verdict.timed_out = True
            verdict.message = f"скрытые тесты не уложились в {timeout} секунд"
            return verdict
        verdict.hidden = tasks_mod._parse_reports(
            run_dir / "hidden" / "reports", tasks_mod.display_names(hidden))
        if not verdict.hidden:
            verdict.message = "скрытые тесты не отчитались, прогон сорвался"
            return verdict
        verdict.hidden_ok = all(case["ok"] for case in verdict.hidden)
        verdict.ok = verdict.hidden_ok
        verdict.phase = "done"
        verdict.message = "скрытые тесты зелёные" if verdict.ok else "скрытые тесты красные"
        return verdict
    finally:
        if os.environ.get("ARENA_KEEP_RUNS") == "1":
            print(f"папка прогона осталась: {run_dir}")
        else:
            shutil.rmtree(run_dir, ignore_errors=True)


def render_verdict(verdict: Verdict) -> str:
    lines: list[str] = []
    if verdict.compile_out and verdict.phase == "compile":
        lines += ["", "javac ругается:", verdict.compile_out]
    if verdict.tests_files:
        lines.append("")
        lines.append(f"твои тесты: {verdict.tests_green} из {verdict.tests_total} зелёных "
                     f"({verdict.tests_files} файлов)")
        if verdict.tests_green < verdict.tests_total and verdict.tests_out:
            lines.append(verdict.tests_out)
    else:
        lines.append("")
        lines.append("твоих тестов в папке tests нет, а они входят в приёмку")
    if verdict.hidden:
        good = sum(1 for c in verdict.hidden if c["ok"])
        lines.append("")
        lines.append(f"скрытые тесты: {good} из {len(verdict.hidden)}")
        for case in verdict.hidden:
            lines.append(f"  {'зелёный' if case['ok'] else 'КРАСНЫЙ'} {case['name']}")
    lines.append("")
    lines.append(verdict.message)
    return "\n".join(lines)


# ---------------------------------------------------------------- ревью

FALLBACK_RUBRIC = (
    "Оцени работу по пяти критериям (correct, structure, naming, topics, tests), "
    "каждый от 0 до 2, и верни строго JSON вида "
    '{"criteria": [{"key": "correct", "score": 2, "comment": "..."}], '
    '"fixes": [{"ref": "П1", "what": "...", "fix": "..."}], "advice": [], "summary": "..."}\n\n'
    "{{FACTS}}\n\n{{POINTS}}\n\n{{CODE}}"
)


def facts_block(verdict: dict, facts: list[dict]) -> str:
    lines = ["Машинные факты о сдаче (посчитаны прогоном, спорить с ними не надо):"]
    hidden = verdict.get("hidden") or []
    green = sum(1 for c in hidden if c.get("ok"))
    lines.append(f"- скрытые тесты: {green} из {len(hidden)} зелёных")
    red = [c["name"] for c in hidden if not c.get("ok")]
    if red:
        lines.append("- красные скрытые случаи: " + "; ".join(red))
    if verdict.get("tests_files"):
        lines.append(f"- тесты ученика: {verdict.get('tests_files')} файлов, "
                     f"{verdict.get('tests_green', 0)} из {verdict.get('tests_total', 0)} зелёных")
    else:
        lines.append("- тестов ученика нет ни одного")
    for fact in facts:
        lines.append(f"- {fact['title']}: " + ("есть в коде" if fact["ok"] else "в коде не найдено"))
    return "\n".join(lines)


def points_block(points: list[dict]) -> str:
    lines = ["Пункты постановки, на которые можно ссылаться (только на них):"]
    for point in points:
        lines.append(f"{point['id']}. {point['text']}")
    return "\n".join(lines)


def code_block(sources: dict[str, str], tests: dict[str, str]) -> str:
    parts = ["Файлы решения:"]
    for name, text in sources.items():
        parts.append(f"\n### {name}\n```java\n{text.strip()}\n```")
    if tests:
        parts.append("\nТесты ученика:")
        for name, text in tests.items():
            parts.append(f"\n### tests/{name}\n```java\n{text.strip()}\n```")
    return "\n".join(parts)


def build_prompt(spec_md: str, verdict: dict, facts: list[dict], points: list[dict],
                 sources: dict[str, str], tests: dict[str, str]) -> str:
    base = RUBRIC_PATH.read_text(encoding="utf-8") if RUBRIC_PATH.exists() else FALLBACK_RUBRIC
    return (base
            .replace("{{SPEC}}", spec_md.strip())
            .replace("{{FACTS}}", facts_block(verdict, facts))
            .replace("{{POINTS}}", points_block(points))
            .replace("{{CODE}}", code_block(sources, tests)))


DASHES = re.compile(r"[—–]")
ARROWS = re.compile(r"\s*(?:->|=>|<-|→|←|⇒)\s*")


def clean(text: str) -> str:
    """Причесать прозу модели под раздел 14.2. Только прозу: в код это пускать
    нельзя, там стрелка это лямбда и новый switch."""
    out = DASHES.sub("-", str(text or ""))
    out = ARROWS.sub(" ", out)
    return out.strip()


def normalize(data: dict, points: list[dict]) -> dict:
    """Привести ответ модели к рубрике. Баллы режем по границам, ссылки на пункты
    сверяем со списком: выдуманный пункт в rework не пойдёт."""
    if not isinstance(data, dict):
        raise ValueError("модель вернула не объект")
    raw = {}
    for item in data.get("criteria") or []:
        if isinstance(item, dict) and item.get("key") in dict(CRITERIA):
            raw[item["key"]] = item
    if not raw:
        raise ValueError("в ответе модели нет ни одного критерия рубрики")

    criteria = []
    for key, title in CRITERIA:
        item = raw.get(key, {})
        try:
            score = int(round(float(item.get("score", 0))))
        except (TypeError, ValueError):
            score = 0
        criteria.append({
            "key": key,
            "title": title,
            "score": max(0, min(MAX_PER_CRITERION, score)),
            "comment": clean(item.get("comment", "")),
        })

    known = {p["id"].lower(): p for p in points}
    fixes, advice = [], []
    for item in data.get("fixes") or []:
        if not isinstance(item, dict):
            continue
        what = clean(item.get("what", ""))
        if not what:
            continue
        ref = str(item.get("ref", "")).strip()
        point = known.get(ref.lower())
        entry = {
            "ref": point["id"] if point else "",
            "point": point["text"] if point else "",
            "what": what,
            "fix": clean(item.get("fix", "")),
        }
        (fixes if point else advice).append(entry)
    for item in data.get("advice") or []:
        text = clean(item if isinstance(item, str) else item.get("what", ""))
        if text:
            advice.append({"ref": "", "point": "", "what": text, "fix": ""})
    return {
        "criteria": criteria,
        "fixes": fixes,
        "advice": advice,
        "summary": clean(data.get("summary", "")),
        "praise": clean(data.get("praise", "")),
    }


def cap_by_facts(review: dict, verdict: dict, facts: list[dict]) -> dict:
    """Машинные факты сильнее мнения модели.

    Нет тестов, значит критерий тестов ноль, что бы модель ни написала.
    Не использована обязательная конструкция, значит ноль за темы этапа.
    Красные скрытые тесты, значит ноль за корректность.
    """
    scores = {c["key"]: c for c in review["criteria"]}
    notes: list[str] = []
    if not verdict.get("hidden_ok"):
        scores["correct"]["score"] = 0
        notes.append("скрытые тесты красные")
    if not verdict.get("tests_files"):
        scores["tests"]["score"] = 0
        notes.append("своих тестов нет")
    elif verdict.get("tests_green", 0) < verdict.get("tests_total", 0):
        scores["tests"]["score"] = min(scores["tests"]["score"], 1)
        notes.append("часть твоих тестов красная")
    missing = [f for f in facts if not f["ok"]]
    if missing:
        scores["topics"]["score"] = 0
        notes.append("обязательное из постановки не использовано: "
                     + ", ".join(f["title"] for f in missing))
    review["caps"] = notes
    return review


def total_score(review: dict) -> int:
    return sum(c["score"] for c in review["criteria"])


def decide(review: dict, verdict: dict) -> str:
    """Статус считает код, а не модель."""
    if not verdict.get("hidden_ok"):
        return "rework"
    if any(c["score"] == 0 for c in review["criteria"]):
        return "rework"
    return "accepted" if total_score(review) >= ACCEPT_MIN else "rework"


# По каким словам видно, что модель уже написала про этот факт сама. Список
# нужен ровно для одного: не печатать одно и то же дважды своими словами
# и словами модели. Промахнётся в сторону лишней строки, а не потерянной.
FACT_WORDS = {
    "array2d": ("массив", "матриц"),
    "switch": ("switch",),
    "overload": ("перегруз",),
    "no_double": ("double", "ceil"),
    "own_tests": ("тест",),
    "nested_class": ("вложен", "внутренн"),
    "enum": ("enum", "перечислен"),
    "record": ("record",),
    "interface": ("интерфейс",),
    "inheritance": ("наслед", "extends", "implements"),
    "exceptions": ("исключен", "exception"),
    "generics": ("дженерик", "обобщ"),
    "collections": ("коллекц", "list", "map"),
    "lambda": ("лямбд",),
    "streams": ("stream", "поток"),
}


def mentioned(text: str, words: tuple[str, ...]) -> bool:
    low = text.lower()
    return any(word in low for word in words)


def machine_fixes(verdict: dict, facts: list[dict], points: list[dict],
                  said: list[dict] | None = None) -> list[dict]:
    """Замечания, которые видны без модели.

    Это подстраховка, а не второй голос. Модель почти всегда говорит про факты
    сама и говорит лучше, поэтому её формулировку не дублируем: сюда попадает
    только то, о чём в её списке нет ни слова. Исключение это красные скрытые
    случаи: их имена знает только прогон.
    """
    said_text = " ".join(f"{f.get('what', '')} {f.get('fix', '')}" for f in (said or []))
    out: list[dict] = []
    if not verdict.get("hidden_ok"):
        red = [c["name"] for c in verdict.get("hidden") or [] if not c.get("ok")]
        out.append({
            "ref": "", "point": "",
            "what": "скрытые тесты красные: "
                    + (", ".join(red[:6]) if red else verdict.get("message", "")),
            "fix": "разбери эти случаи. Ожидаемые значения не покажу, в этом и смысл "
                   "скрытой части: подумай, чего ты не разобрал",
        })
    if not verdict.get("tests_files") and not mentioned(said_text, ("тест",)):
        out.append({
            "ref": "", "point": "",
            "what": "своих тестов в папке tests нет ни одного",
            "fix": "напиши тесты на JUnit 5: счастливый путь, границы и хотя бы одно исключение",
        })
    elif (verdict.get("tests_files") and verdict.get("tests_green", 0) < verdict.get("tests_total", 0)
            and not mentioned(said_text, ("тест",))):
        out.append({
            "ref": "", "point": "",
            "what": f"твои тесты красные: зелёных {verdict.get('tests_green')} "
                    f"из {verdict.get('tests_total')}",
            "fix": "почини их до сдачи, красный собственный тест это незакрытая работа",
        })
    for fact in facts:
        if fact["ok"] or mentioned(said_text, FACT_WORDS.get(fact["id"], (fact["title"],))):
            continue
        out.append({
            "ref": "", "point": "",
            "what": f"в коде не найдено обязательное из постановки: {fact['title']}",
            "fix": (f"верни это в решение: {fact['why']}" if fact.get("why")
                    else "верни это в решение, ограничение стоит в постановке"),
        })
    # Привязываем к пунктам постановки там, где они очевидно совпадают по словам.
    for entry in out:
        entry.update(match_point(entry["what"], points))
    return out


def match_point(text: str, points: list[dict]) -> dict:
    words = {w for w in re.findall(r"\w{5,}", text.lower())}
    best, score = None, 0
    for point in points:
        hits = len(words & {w for w in re.findall(r"\w{5,}", point["text"].lower())})
        if hits > score:
            best, score = point, hits
    if best is None or score < 2:
        return {}
    return {"ref": best["id"], "point": best["text"]}


def review_call(spec_md: str, verdict: dict, facts: list[dict], points: list[dict],
                sources: dict[str, str], tests: dict[str, str],
                timeout: int = CALL_TIMEOUT, binary_path: str | None = None,
                model: str | None = "opus") -> dict:
    prompt = build_prompt(spec_md, verdict, facts, points, sources, tests)
    raw = llm.call(prompt, timeout=timeout, binary_path=binary_path, model=model)
    return normalize(llm.parse_envelope(raw), points)


def render_review(review: dict, status: str) -> str:
    lines = [f"статус: {STATUS_TITLES.get(status, status)}"]
    lines.append("оценка: " + ", ".join(
        f"{c['title']} {c['score']} из 2" for c in review["criteria"]))
    if review.get("summary"):
        lines += ["", review["summary"]]
    if review.get("fixes"):
        lines += ["", "что поправить:"]
        for i, fix in enumerate(review["fixes"], 1):
            head = f"{i}. {fix['what']}"
            if fix.get("ref"):
                head += f"  (пункт {fix['ref']}: {fix['point']})"
            lines.append(head)
            if fix.get("fix"):
                lines.append(f"   как: {fix['fix']}")
    if review.get("advice"):
        lines += ["", "на будущее, это не мешает приёмке:"]
        for note in review["advice"]:
            lines.append(f"  {note['what']}")
    return "\n".join(lines)


# ---------------------------------------------------------------- приёмка сдачи

def quality_bonus(review: dict) -> int:
    """До трёхсот сверх тысячи за качество (раздел 5 плана)."""
    total = total_score(review)
    maximum = MAX_PER_CRITERION * len(CRITERIA)
    if total <= ACCEPT_MIN:
        return 0
    return int(round(QUALITY_MAX * (total - ACCEPT_MIN) / (maximum - ACCEPT_MIN)))


def submit(conn: sqlite3.Connection, cfg: Config, tz_id: int, verdict: dict,
           day: str | None = None, timeout: int = CALL_TIMEOUT,
           binary_path: str | None = None, sources: dict[str, str] | None = None,
           tests: dict[str, str] | None = None) -> dict:
    """Принять сдачу: посчитать факты, позвать ревью, поставить статус и заплатить.

    Единственный писатель, как и у код-задач: runner считает прогон, а XP,
    статусы и защиту пишет сервер.
    """
    row = project_by_id(conn, tz_id)
    if row["status"] == "accepted":
        raise TzError("это ТЗ уже принято, переигрывать нечего")
    spec = spec_of(conn, row)
    payload = payload_of(spec)
    root = Path(row["dir_path"] or "")
    if sources is None:
        sources = solution_sources(root)
    if tests is None:
        tests = test_sources(root)
    if not sources:
        raise TzError(f"в папке {root} нет исходников, ревьюить нечего")

    day = day or today()
    points = spec_points(spec["spec_md"])
    facts = construct_facts(sources, payload.get("must_use") or [], {
        "test_files": verdict.get("tests_files", len(tests)),
    })
    conn.execute(
        "UPDATE tz_projects SET status = 'submitted', submitted_at = ?, checks = checks + 1, "
        "last_result = ? WHERE id = ?",
        (now(), json.dumps(verdict, ensure_ascii=False), row["id"]),
    )
    conn.commit()

    try:
        review = review_call(spec["spec_md"], verdict, facts, points, sources, tests,
                             timeout=timeout, binary_path=binary_path)
    except Exception as exc:  # noqa: BLE001
        return {
            "reviewed": False,
            "status": "submitted",
            "error": f"{type(exc).__name__}: {exc}",
            "message": ("прогон записан, а ревью не состоялось: claude мог упереться "
                        "в лимит подписки. Повтори arena tz submit, прогон дешёвый"),
            "verdict": verdict,
        }

    review = cap_by_facts(review, verdict, facts)
    review["fixes"] = machine_fixes(verdict, facts, points, review["fixes"]) + review["fixes"]
    review["facts"] = facts
    review["points"] = points
    review["total"] = total_score(review)
    status = decide(review, verdict)
    if status == "rework" and not review["fixes"]:
        # Пустой rework это отписка. Такого не бывает: если списка нет, значит
        # ревью не удалось, и честнее сказать это вслух.
        review["fixes"] = [{
            "ref": "", "point": "",
            "what": "ревью не назвало ни одного конкретного пункта",
            "fix": "повтори сдачу, а если повторится, крути content/tz_review.md",
        }]

    gained = 0
    bonus = 0
    if status == "accepted":
        bonus = quality_bonus(review)
        if not xp.already_paid(conn, xp.TZ, "tz", row["id"]):
            gained = xp.award(conn, xp.AMOUNTS[xp.TZ] + bonus, xp.TZ, "tz", row["id"], day)
    review["xp"] = gained
    review["bonus"] = bonus
    conn.execute(
        "UPDATE tz_projects SET status = ?, review = ?, xp = xp + ?, accepted_at = ? "
        "WHERE id = ?",
        (status, json.dumps(review, ensure_ascii=False), gained,
         now() if status == "accepted" else None, row["id"]),
    )
    conn.commit()

    defense_id = None
    if status == "accepted":
        from . import defense as defense_mod

        defense_id = defense_mod.ensure(conn, "tz", row["id"], defense_questions(
            conn, project_by_id(conn, row["id"]), payload))
        conn.commit()
    return {
        "reviewed": True,
        "status": status,
        "review": review,
        "xp": gained,
        "bonus": bonus,
        "defense_id": defense_id,
        "verdict": verdict,
    }


# ---------------------------------------------------------------- защита

def defense_questions(conn: sqlite3.Connection, row: sqlite3.Row, payload: dict) -> list[dict]:
    """Вопросы защиты по ТЗ. Собираются шаблонами по содержанию постановки,
    как и у босса: защита обязана открываться сразу, а не ждать модель."""
    topics = payload.get("topics") or []
    must = [CONSTRUCTS[m["id"]]["title"] for m in (payload.get("must_use") or [])
            if m.get("id") in CONSTRUCTS]
    first = must[0] if must else (topics[0] if topics else "выбранная структура")
    return [
        {
            "n": 1,
            "q": f"Проект «{row['title']}»: почему ты разложил его на методы и файлы именно так? "
                 f"Назови причину и скажи, какое разбиение отбросил и чем оно тебе не понравилось.",
            "hint": "разбери своё решение, а не задачу вообще",
        },
        {
            "n": 2,
            "q": f"В постановке требовалось использовать «{first}». Объясни своими словами, "
                 f"почему это здесь уместно и в каком случае ты бы этого делать не стал.",
            "hint": "своими словами, без цитат из конспекта",
        },
        {
            "n": 3,
            "q": "Что сломается, если на вход подать пустые данные, ноль или значение "
                 "за границей диапазона? Возьми конкретный метод своего решения, разбери, "
                 "что произойдёт, и скажи, каким тестом ты это поймал бы.",
            "hint": "граничные случаи это половина собеседования",
        },
    ]


# ---------------------------------------------------------------- витрина

def review_note(conn: sqlite3.Connection, tz_id: int) -> dict | None:
    row = conn.execute(
        "SELECT * FROM reviews WHERE ref_type = 'tz' AND ref_id = ?", (tz_id,)
    ).fetchone()
    if row is None:
        return None
    return {"summary": row["summary"], "xp": row["xp"], "ts": row["ts"]}


REVIEW_MIN = 60


def add_review_note(conn: sqlite3.Connection, tz_id: int, summary: str,
                    day: str | None = None) -> dict:
    """Кнопка «разобрал с ИИ»: тридцать XP один раз на сдачу (раздел 5)."""
    row = project_by_id(conn, tz_id)
    if row["status"] != "accepted":
        raise TzError("разбор пишут после приёмки, а ТЗ ещё не принято")
    summary = (summary or "").strip()
    if len(summary) < REVIEW_MIN:
        raise ValueError(f"напиши хотя бы {REVIEW_MIN} символов: что именно разобрал и что понял")
    if review_note(conn, tz_id) is not None:
        raise TzError("разбор по этому ТЗ уже засчитан")
    day = day or today()
    gained = 0
    if not xp.already_paid(conn, xp.REVIEW, "tz", tz_id):
        gained = xp.award(conn, xp.AMOUNTS[xp.REVIEW], xp.REVIEW, "tz", tz_id, day)
    conn.execute(
        "INSERT INTO reviews(ref_type, ref_id, summary, xp, ts) VALUES ('tz', ?, ?, ?, ?)",
        (tz_id, summary, gained, now()),
    )
    conn.commit()
    return {"xp": gained, "summary": summary}


def view(conn: sqlite3.Connection, cfg: Config, row: sqlite3.Row) -> dict:
    from . import defense as defense_mod

    stage = conn.execute("SELECT num, title FROM stages WHERE id = ?", (row["stage_id"],)).fetchone()
    review = json.loads(row["review"]) if row["review"] else None
    last = json.loads(row["last_result"]) if row["last_result"] else None
    return {
        "id": row["id"],
        "stage_num": stage["num"],
        "stage_title": stage["title"],
        "title": row["title"],
        "spec_md": row["spec_md"],
        "dir_path": row["dir_path"],
        "status": row["status"],
        "status_title": STATUS_TITLES.get(row["status"], row["status"]),
        "checks": row["checks"],
        "xp": row["xp"],
        "ts": row["ts"],
        "submitted_at": row["submitted_at"],
        "accepted_at": row["accepted_at"],
        "review": review,
        "last_result": last,
        "defense": defense_mod.view(conn, "tz", row["id"]),
        "note": review_note(conn, row["id"]),
    }


def board(conn: sqlite3.Connection, cfg: Config) -> dict:
    """Что показать на вкладке ТЗ: выданные проекты и ближайший этап, где ТЗ ждёт."""
    from . import boss as boss_mod

    projects = [view(conn, cfg, row) for row in conn.execute(
        "SELECT * FROM tz_projects ORDER BY id DESC")]
    bypass = dev_gate_off(cfg)
    ready, next_up, free = [], None, None
    for stage in conn.execute("SELECT * FROM stages ORDER BY num"):
        has_project = any(p["stage_num"] == stage["num"] for p in projects)
        if has_project:
            continue
        if free is None:
            free = stage
        if boss_mod.passed_stage(conn, stage["id"]):
            ready.append({"num": stage["num"], "title": stage["title"], "dev": False,
                          "bank": len(specs_for_stage(conn, stage["id"]))})
        elif next_up is None:
            g = boss_mod.gate(conn, stage["id"])
            if g["total"] and g["closed"]:
                next_up = {"num": stage["num"], "title": stage["title"], **g}
    if bypass and free is not None and not any(s["num"] == free["num"] for s in ready):
        # Гейт обойдён dev-флагом, и экрану надо что-то предложить: ближайший этап
        # без проекта. Честно взятые боссы при этом остаются впереди списка.
        ready.append({"num": free["num"], "title": free["title"], "dev": True,
                      "bank": len(specs_for_stage(conn, free["id"]))})
    return {
        "projects": projects,
        "ready": ready,
        "next": next_up,
        "dev_bypass": dev_gate_off(cfg),
        "projects_root": str(cfg.tasks_root / PROJECTS_DIR),
        "env": cfg.env,
    }
