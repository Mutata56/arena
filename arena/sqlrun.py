"""Движок задачника SQL: выполнить запрос ученика и вернуть то, что увидел бы он сам.

Почему PostgreSQL, если половина курса написана на T-SQL. Потому что задачник должен
ЗАПУСКАТЬ, а не делать вид. SQL Server на macOS arm64 не поднимается без Docker с
эмуляцией amd64, и на этой машине его нет. Postgres же есть и он настоящий: живые
планы, живые блокировки, живые тексты ошибок. Разницу диалектов курс проговаривает
словами в конспектах — это и есть знание DBA, а не досадная помеха.

Режима два.

* `rollback` — по умолчанию. Запрос идёт в транзакцию, которая ВСЕГДА откатывается.
  В Postgres транзакционен и DDL, поэтому так безопасно гонять и CREATE TABLE, и
  DELETE без WHERE: следующий ученик увидит нетронутую базу. Быстро и без уборки.
* `session` — для тех тем, где откат и есть предмет разговора: транзакции, уровни
  изоляции, блокировки. Там ученику нужна своя база, которая переживает COMMIT
  и помнит, что он делал в прошлом шаге. Такая база заводится из шаблона по sid
  и убирается по таймауту.

Прав у роли задачника ровно столько, сколько нужно: своя схема, свои таблицы,
чтения файлов и суперпользовательских рычагов нет. База локальная и personal,
но «локальная» это не повод пускать SELECT pg_read_file() в учебный редактор.
"""

from __future__ import annotations

import hashlib
import os
import re
import secrets
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASET_DIR = PROJECT_ROOT / "content" / "datasets"

# Роль, под которой ходит ученик. Не суперпользователь и не владелец кластера.
LEARN_ROLE = "arena_learn"
LEARN_PASSWORD = "arena"

# Потолки. Пять секунд это уже вечный цикл в рекурсивном CTE, а не долгий запрос
# к тринадцати строкам остатков.
TIMEOUT_S = 5
MAX_ROWS = 200
MAX_SQL = 100_000
# Сколько живёт персональная база сессии, если в неё перестали ходить.
SESSION_TTL = 3600


@dataclass(frozen=True)
class Dataset:
    key: str
    title: str
    # Рабочая база для режима rollback и шаблон, из которого штампуются сессии.
    db: str
    template: str
    script: Path


DATASETS: dict[str, Dataset] = {
    "wms": Dataset("wms", "Склад wms_demo", "arena_wms", "arena_wms_tpl",
                   DATASET_DIR / "wms.sql"),
}
DEFAULT_DATASET = "wms"

_LOCK = threading.Lock()
_READY: set[str] = set()
_SESSIONS: dict[str, float] = {}

SID_RE = re.compile(r"^[\w-]{1,64}$")

# Команды, которые закрывают транзакцию. В режиме отката они опасны: коммит
# завершает нашу транзакцию, и всё, что сделано после него, останется в учебной
# базе навсегда. Запрещать их нельзя — половина этапов про транзакции и есть,
# поэтому такой прогон уезжает в одноразовую базу (см. run).
# ROLLBACK TO SAVEPOINT сюда не попадает намеренно: он безопасен и полезен.
TXN_RE = re.compile(
    r"(?<![\w.])(?:"
    r"commit|end\s+transaction|end\s*;|start\s+transaction|"
    r"begin\s*(?:;|work|transaction|isolation|read|deferrable|not)|"
    r"rollback\s*(?!to\b)(?:;|work|transaction|and\b|$)"
    r")",
    re.IGNORECASE,
)
# Комментарии и строковые литералы выкусываем перед проверкой: слово COMMIT
# в тексте примера — это не команда.
STRIP_RE = re.compile(r"--[^\n]*|/\*.*?\*/|'(?:''|[^'])*'|\$\$.*?\$\$", re.DOTALL)


def controls_transaction(sql: str) -> bool:
    return bool(TXN_RE.search(STRIP_RE.sub(" ", sql or "")))


class SqlUnavailable(RuntimeError):
    """Постгреса нет или он не отвечает. Отдельный тип, чтобы сайт сказал
    человеку «подними сервер», а не «внутренняя ошибка»."""


# ---------------------------------------------------------------- окружение

def _pg_bin() -> str | None:
    """Где лежат psql и createdb. Homebrew не кладёт postgresql@17 в PATH сам."""
    if shutil.which("psql"):
        return str(Path(shutil.which("psql")).parent)
    for guess in ("/opt/homebrew/opt/postgresql@17/bin", "/opt/homebrew/bin",
                  "/usr/local/opt/postgresql@17/bin", "/usr/lib/postgresql/17/bin"):
        if Path(guess, "psql").is_file():
            return guess
    return None


def _env() -> dict[str, str]:
    env = dict(os.environ)
    binpath = _pg_bin()
    if binpath:
        env["PATH"] = binpath + os.pathsep + env.get("PATH", "")
    return env


def _psql(db: str, sql: str, *, quiet: bool = True) -> subprocess.CompletedProcess:
    args = ["psql", "-d", db, "-v", "ON_ERROR_STOP=1", "-c", sql]
    if quiet:
        args.insert(1, "-q")
    return subprocess.run(args, capture_output=True, text=True, env=_env(), timeout=120)


def available() -> bool:
    try:
        r = subprocess.run(["pg_isready"], capture_output=True, text=True,
                           env=_env(), timeout=5)
        return r.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


# ---------------------------------------------------------------- подготовка

def _db_exists(name: str) -> bool:
    r = subprocess.run(["psql", "-d", "postgres", "-tAc",
                        f"SELECT 1 FROM pg_database WHERE datname = '{name}'"],
                       capture_output=True, text=True, env=_env(), timeout=30)
    return r.stdout.strip() == "1"


def _ensure_role() -> None:
    _psql("postgres", f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{LEARN_ROLE}') THEN
                CREATE ROLE {LEARN_ROLE} LOGIN PASSWORD '{LEARN_PASSWORD}';
            END IF;
        END $$;
    """)


def _grant(db: str) -> None:
    """Права ученика внутри учебной базы: читать и менять данные, заводить свои
    объекты. Всё это откатывается, но пусть разрешение будет явным."""
    _psql(db, f"""
        GRANT CONNECT ON DATABASE {db} TO {LEARN_ROLE};
        GRANT USAGE, CREATE ON SCHEMA dbo TO {LEARN_ROLE};
        GRANT USAGE, CREATE ON SCHEMA public TO {LEARN_ROLE};
        GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
            ON ALL TABLES IN SCHEMA dbo TO {LEARN_ROLE};
        GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA dbo TO {LEARN_ROLE};
        ALTER DEFAULT PRIVILEGES IN SCHEMA dbo
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {LEARN_ROLE};
    """)


def ensure(dataset: str = DEFAULT_DATASET, *, rebuild: bool = False) -> Dataset:
    """Довести базы набора до рабочего состояния. Идемпотентно и под замком:
    два одновременных запроса не должны одновременно создавать одну базу."""
    spec = DATASETS.get(dataset)
    if spec is None:
        raise SqlUnavailable(f"нет такого набора данных: {dataset}")
    if spec.key in _READY and not rebuild:
        return spec
    with _LOCK:
        if spec.key in _READY and not rebuild:
            return spec
        if not available():
            raise SqlUnavailable(
                "PostgreSQL не отвечает. Подними его: brew services start postgresql@17")
        _ensure_role()
        for name in (spec.db, spec.template):
            if rebuild and _db_exists(name):
                _psql("postgres", f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
            if not _db_exists(name):
                subprocess.run(["createdb", name], check=True, capture_output=True,
                               text=True, env=_env(), timeout=60)
                r = subprocess.run(
                    ["psql", "-q", "-d", name, "-v", "ON_ERROR_STOP=1", "-f", str(spec.script)],
                    capture_output=True, text=True, env=_env(), timeout=180)
                if r.returncode != 0:
                    raise SqlUnavailable(f"набор {spec.key} не залился: {r.stderr.strip()[:500]}")
            _grant(name)
        # Шаблон должен быть шаблоном: из базы, к которой кто-то подключён,
        # CREATE DATABASE ... TEMPLATE не сработает. В arena_wms_tpl не ходит никто.
        _psql("postgres", f'ALTER DATABASE "{spec.template}" IS_TEMPLATE = true')
        # Одноразовые базы сносит сам прогон, но если процесс умер посередине,
        # мусор останется. Подметаем на старте, а не копим до ручной уборки.
        _sweep_throwaways()
        _READY.add(spec.key)
    return spec


# ---------------------------------------------------------------- сессии

def _session_db(sid: str) -> str:
    digest = hashlib.sha1(sid.encode("utf-8")).hexdigest()[:16]
    return f"arena_s_{digest}"


def _sweep_sessions() -> None:
    """Убрать базы, в которые давно не ходили. Иначе кластер обрастает
    свалкой arena_s_* после каждого захода в тему про транзакции."""
    now = time.time()
    stale = [sid for sid, seen in _SESSIONS.items() if now - seen > SESSION_TTL]
    for sid in stale:
        _SESSIONS.pop(sid, None)
        _psql("postgres", f'DROP DATABASE IF EXISTS "{_session_db(sid)}" WITH (FORCE)')


def session_reset(sid: str, dataset: str = DEFAULT_DATASET) -> None:
    """Вернуть персональную базу в исходное состояние. Кнопка «начать заново»."""
    if not SID_RE.match(sid or ""):
        raise SqlUnavailable("плохой идентификатор сессии")
    _SESSIONS.pop(sid, None)
    _psql("postgres", f'DROP DATABASE IF EXISTS "{_session_db(sid)}" WITH (FORCE)')


# Сколько лет должна быть база, чтобы её признали брошенной. Нужно из-за щели
# между CREATE DATABASE и первым соединением: там к базе ещё никто не подключён,
# и сосед, подметающий в этот самый миг, снёс бы её у живого прогона из-под ног.
THROWAWAY_GRACE_S = 120


def _sweep_throwaways() -> None:
    """Подмести одноразовые базы, оставшиеся от умерших процессов.

    Только БРОШЕННЫЕ. Раньше здесь сносилось всё, что подошло по имени, и это
    ломало соседа: пока один процесс разыгрывает сценарий на своей arena_x_*,
    второй стартует, подметает её вместе со всеми и рвёт живые соединения —
    сценарий падает с «the connection is closed» на ровном месте.

    Брошенная это та, в которую никто не подключён И которая старше щели:
    время рождения зашито в имя, потому что общаться процессам больше негде —
    у каждого свой список, а база одна на всех."""
    r = subprocess.run(["psql", "-d", "postgres", "-tAc",
                        "SELECT d.datname FROM pg_database d "
                        "WHERE d.datname LIKE 'arena\\_x\\_%' "
                        "  AND NOT EXISTS (SELECT 1 FROM pg_stat_activity a "
                        "                   WHERE a.datid = d.oid)"],
                       capture_output=True, text=True, env=_env(), timeout=30)
    now = time.time()
    for name in filter(None, (x.strip() for x in r.stdout.splitlines())):
        born = _throwaway_born(name)
        if born is not None and now - born < THROWAWAY_GRACE_S:
            continue
        _psql("postgres", f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


def _throwaway_born(name: str) -> float | None:
    """Время рождения из имени. None это база старого образца — такую сносим."""
    parts = name.split("_")
    if len(parts) != 4 or not parts[2].isdigit():
        return None
    return float(parts[2])


def _throwaway(spec: Dataset) -> str:
    """Штампануть базу из шаблона под один прогон. Дороже отката, зато переживает
    COMMIT: что бы ученик там ни зафиксировал, база всё равно будет снесена."""
    name = f"arena_x_{int(time.time()):010d}_{secrets.token_hex(5)}"
    r = subprocess.run(
        ["psql", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
         f'CREATE DATABASE "{name}" TEMPLATE "{spec.template}"'],
        capture_output=True, text=True, env=_env(), timeout=120)
    if r.returncode != 0:
        raise SqlUnavailable(f"не смог завести одноразовую базу: {r.stderr.strip()[:300]}")
    _grant(name)
    return name


def _drop_db(name: str) -> None:
    _psql("postgres", f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


def _ensure_session(sid: str, spec: Dataset) -> str:
    if not SID_RE.match(sid or ""):
        raise SqlUnavailable("плохой идентификатор сессии")
    name = _session_db(sid)
    with _LOCK:
        if not _db_exists(name):
            r = subprocess.run(
                ["psql", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
                 f'CREATE DATABASE "{name}" TEMPLATE "{spec.template}"'],
                capture_output=True, text=True, env=_env(), timeout=120)
            if r.returncode != 0:
                raise SqlUnavailable(f"не смог завести базу сессии: {r.stderr.strip()[:300]}")
            _grant(name)
        _SESSIONS[sid] = time.time()
    if len(_SESSIONS) > 8:
        _sweep_sessions()
    return name


# ---------------------------------------------------------------- показ значений

def cell(value) -> str | None:
    """Значение в том виде, в каком его показывает таблица результата.

    NULL остаётся None и рисуется отдельно: пустая строка и NULL это разные вещи,
    и первая же тема про трёхзначную логику развалится, если их склеить.
    """
    import datetime
    import decimal
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, datetime.datetime):
        # Доли секунды и смещение пояса дописываем, только если они есть. Иначе
        # обычный timestamp(0) оброс бы нулями, а теме про точность и пояса
        # пришлось бы городить ::text, чтобы вообще показать предмет разговора.
        out = value.strftime("%Y-%m-%d %H:%M:%S")
        if value.microsecond:
            out += f".{value.microsecond:06d}".rstrip("0")
        if value.tzinfo is not None:
            off = value.strftime("%z")            # вида +0300
            out += off[:3] + (":" + off[3:] if off[3:] != "00" else "")
        return out
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray, memoryview)):
        return "\\x" + bytes(value).hex()
    if isinstance(value, (list, tuple)):
        return "{" + ",".join("" if v is None else str(v) for v in value) + "}"
    return str(value)


# ---------------------------------------------------------------- прогон

def run(sql: str, *, dataset: str = DEFAULT_DATASET, mode: str = "rollback",
        sid: str | None = None, timeout: int = TIMEOUT_S) -> dict:
    """Выполнить SQL ученика и вернуть то, что он увидел бы в psql.

    Наборов результатов может быть несколько: в одном окне разрешено набрать
    несколько команд через точку с запятой, и это не поблажка, а требование тем
    про DDL и DML, где смысл в связке «сделал — посмотрел».
    """
    import psycopg

    sql = (sql or "").strip()
    if not sql:
        return {"ok": True, "sets": [], "error": None, "elapsed_ms": 0, "mode": mode}
    if len(sql) > MAX_SQL:
        return {"ok": False, "sets": [], "elapsed_ms": 0, "mode": mode,
                "error": {"message": "запрос длиннее ста тысяч символов, это опечатка",
                          "sqlstate": None}}

    spec = ensure(dataset)
    throwaway = None
    if mode == "session":
        db = _ensure_session(sid or "", spec)
    elif controls_transaction(sql):
        # Прогон сам распоряжается транзакцией. Откат его не удержит, поэтому
        # даём ему собственную базу и сносим её после. Так темы про COMMIT
        # показываются честно, а учебная база остаётся нетронутой.
        mode = "throwaway"
        db = throwaway = _throwaway(spec)
    else:
        mode = "rollback"
        db = spec.db

    dsn = f"dbname={db} user={LEARN_ROLE} password={LEARN_PASSWORD} host=127.0.0.1"
    started = time.monotonic()
    notices: list[str] = []
    sets: list[dict] = []
    error = None

    try:
        conn = psycopg.connect(dsn, autocommit=(mode in ("session", "throwaway")),
                               connect_timeout=10)
    except psycopg.Error as exc:
        if throwaway:
            _drop_db(throwaway)
        raise SqlUnavailable(f"не подключиться к учебной базе: {exc}") from exc

    # json и jsonb отдаём такими, какими их написал сервер. По умолчанию psycopg
    # разбирает их в объекты Python, и тогда ученик видит в ответе `{'a': 'x'}`
    # с одинарными кавычками — питонье представление, а не JSON. Хуже того,
    # пропадает разница между `->` и `->>`: оба дают строку. Здесь она нужна.
    psycopg.types.json.set_json_loads(
        lambda data: data.decode("utf-8") if isinstance(data, (bytes, bytearray))
        else str(data), context=conn)

    try:
        conn.add_notice_handler(lambda d: notices.append(
            f"{d.severity}: {d.message_primary}"))
        with conn.cursor() as cur:
            # statement_timeout ставим отдельной командой, а не в общей строке:
            # в режиме session общей транзакции нет, и SET LOCAL там бесполезен.
            cur.execute(f"SET statement_timeout = '{int(timeout)}s'")
            try:
                cur.execute(sql)
                while True:
                    if cur.description:
                        cols = [d.name for d in cur.description]
                        rows = cur.fetchmany(MAX_ROWS + 1)
                        more = len(rows) > MAX_ROWS
                        sets.append({
                            "cols": cols,
                            "rows": [[cell(v) for v in r] for r in rows[:MAX_ROWS]],
                            "status": cur.statusmessage or "",
                            "truncated": more,
                        })
                    else:
                        sets.append({"cols": [], "rows": [],
                                     "status": cur.statusmessage or "", "truncated": False})
                    if not cur.nextset():
                        break
            except psycopg.Error as exc:
                d = getattr(exc, "diag", None)
                error = {
                    "message": getattr(d, "message_primary", None) or str(exc).strip(),
                    "detail": getattr(d, "message_detail", None),
                    "hint": getattr(d, "message_hint", None),
                    "sqlstate": exc.sqlstate,
                    "position": getattr(d, "statement_position", None),
                    "context": getattr(d, "context", None),
                    # Текст целиком — ровно то, что напечатал бы psql, вместе
                    # со стрелочкой под ошибочным местом. Читать ошибки учим по нему.
                    "raw": str(exc).strip(),
                }
    finally:
        try:
            if mode == "rollback":
                conn.rollback()
        finally:
            conn.close()
            if throwaway:
                _drop_db(throwaway)

    return {
        "ok": error is None,
        "sets": sets,
        "notices": notices,
        "error": error,
        "elapsed_ms": int((time.monotonic() - started) * 1000),
        "mode": mode,
        "dataset": spec.key,
    }

# ---------------------------------------------------------------- сценарии

# Сколько ждём, прежде чем признать шаг заблокированным и пойти дальше. Ожидание
# блокировки в жизни бывает и минутным, но для показа хватает мгновения: важно
# не сколько ждали, а что ждали вообще.
BLOCK_MARK_S = 0.4
# Потолок на весь сценарий. Если после всех шагов кто-то всё ещё висит, значит
# сценарий составлен неверно: блокировку никто не отпустил.
SCENARIO_TIMEOUT_S = 20


def _step_result(cur, sql, started):
    """Один шаг: наборы результатов и статусы, как их видит psql."""
    import psycopg

    sets = []
    error = None
    try:
        cur.execute(sql)
        while True:
            if cur.description:
                cols = [d.name for d in cur.description]
                rows = cur.fetchmany(MAX_ROWS + 1)
                sets.append({
                    "cols": cols,
                    "rows": [[cell(v) for v in r] for r in rows[:MAX_ROWS]],
                    "status": cur.statusmessage or "",
                    "truncated": len(rows) > MAX_ROWS,
                })
            else:
                sets.append({"cols": [], "rows": [],
                             "status": cur.statusmessage or "", "truncated": False})
            if not cur.nextset():
                break
    except psycopg.Error as exc:
        d = getattr(exc, "diag", None)
        error = {
            "message": getattr(d, "message_primary", None) or str(exc).strip(),
            "detail": getattr(d, "message_detail", None),
            "hint": getattr(d, "message_hint", None),
            "sqlstate": exc.sqlstate,
            "raw": str(exc).strip(),
        }
    return {"sets": sets, "error": error, "ms": int((time.monotonic() - started) * 1000)}


def run_scenario(steps: list[dict], *, dataset: str = DEFAULT_DATASET,
                 timeout: int = TIMEOUT_S) -> dict:
    """Разыграть сценарий из шагов на нескольких сессиях одной базы.

    Ради этого и написано: блокировку, взаимоблокировку и грязное чтение нельзя
    показать одним соединением — там просто некому кого-то ждать. Здесь у каждой
    метки («A», «B») своё живое соединение к одной и той же базе, и шаги идут
    в том порядке, в каком их записал автор.

    Шаг, который не уложился в мгновение, признаётся ждущим: сценарий идёт
    дальше, а результат этого шага забирается позже, когда его отпустят. Так и
    выглядит настоящая блокировка — второй ждёт, первый работает.

    База одноразовая: сценарий распоряжается транзакциями сам, и удержать его
    откатом нельзя. После прогона она сносится.
    """
    import concurrent.futures
    import psycopg

    steps = [s for s in (steps or []) if (s.get("sql") or "").strip()]
    if not steps:
        return {"ok": True, "steps": [], "elapsed_ms": 0, "dataset": dataset}

    spec = ensure(dataset)
    db = _throwaway(spec)
    dsn = f"dbname={db} user={LEARN_ROLE} password={LEARN_PASSWORD} host=127.0.0.1"
    slots = []
    for s in steps:
        if s.get("slot") not in slots:
            slots.append(s.get("slot"))

    conns = {}
    started_all = time.monotonic()
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=max(2, len(slots)))
    out = [None] * len(steps)
    pending = []

    try:
        for slot in slots:
            # autocommit=True намеренно: пусть BEGIN и COMMIT в тексте шага значат
            # ровно то же, что значили бы в psql. Иначе драйвер открыл бы свою
            # транзакцию, и разговор про транзакции начался бы с подлога.
            conn = psycopg.connect(dsn, autocommit=True, connect_timeout=10)
            conn.execute(f"SET statement_timeout = '{int(timeout)}s'")
            conns[slot] = conn

        for i, step in enumerate(steps):
            conn = conns[step.get("slot")]
            cur = conn.cursor()
            began = time.monotonic()
            fut = pool.submit(_step_result, cur, step["sql"], began)
            try:
                res = fut.result(timeout=BLOCK_MARK_S)
                res["waited"] = False
            except concurrent.futures.TimeoutError:
                # Шаг во что-то упёрся. Не ждём его тут: следующий шаг другой
                # сессии как раз и должен его отпустить.
                pending.append((i, fut, began))
                out[i] = {"waiting": True}
                continue
            out[i] = res

        deadline = started_all + SCENARIO_TIMEOUT_S
        for i, fut, began in pending:
            left = max(0.5, deadline - time.monotonic())
            try:
                res = fut.result(timeout=left)
            except concurrent.futures.TimeoutError:
                res = {"sets": [], "error": {
                    "message": "шаг так и не дождался: блокировку никто не отпустил",
                    "sqlstate": None, "raw": "шаг не завершился за отведённое время"},
                    "ms": int((time.monotonic() - began) * 1000)}
            res["waited"] = True
            out[i] = res
    finally:
        pool.shutdown(wait=False)
        for conn in conns.values():
            try:
                conn.close()
            except Exception:
                pass
        _drop_db(db)

    result_steps = []
    ok = True
    for step, res in zip(steps, out):
        res = res or {"sets": [], "error": None, "ms": 0, "waited": False}
        if res.get("error"):
            ok = False
        result_steps.append({
            "slot": step.get("slot"),
            "sql": step["sql"],
            "sets": res.get("sets", []),
            "error": res.get("error"),
            "ms": res.get("ms", 0),
            "waited": bool(res.get("waited")),
            "expect_wait": bool(step.get("expect_wait")),
        })

    return {
        "ok": ok,
        "steps": result_steps,
        "elapsed_ms": int((time.monotonic() - started_all) * 1000),
        "dataset": spec.key,
        "mode": "scenario",
    }

# ---------------------------------------------------------------- сверка с эталоном

def normalize(rows: list[list[str | None]]) -> list[tuple]:
    out = []
    for row in rows:
        out.append(tuple("NULL" if c is None else " ".join(str(c).split()) for c in row))
    return out


def compare(got: dict, expect_rows: list[list[str]], *, ordered: bool = True,
            with_header: bool = True, expect_cols: list[str] | None = None) -> dict:
    """Сошёлся ли результат с эталоном из конспекта.

    Сравниваем значения, а не картинку: ширина колонок и выравнивание к делу
    не относятся. Имена колонок сверяем, только если автор задачи их написал —
    иначе придирка к алиасу выдаёт «не сошлось» на Клиент A запросе.
    """
    last = None
    for s in got.get("sets") or []:
        if s.get("cols"):
            last = s
    if last is None:
        return {"match": False, "why": "запрос ничего не выбрал: результата с колонками нет"}

    if with_header and expect_cols:
        got_cols = [c.strip().lower() for c in last["cols"]]
        want_cols = [c.strip().lower() for c in expect_cols]
        if got_cols != want_cols:
            return {"match": False,
                    "why": f"колонки другие: ждали {', '.join(want_cols)}, "
                           f"пришли {', '.join(got_cols)}"}

    a = normalize(last["rows"])
    b = normalize([[c for c in row] for row in expect_rows])
    if not ordered:
        a, b = sorted(a), sorted(b)
    if len(a) != len(b):
        return {"match": False, "why": f"строк {len(a)}, а ждали {len(b)}"}
    for i, (ga, gb) in enumerate(zip(a, b), start=1):
        if ga != gb:
            return {"match": False,
                    "why": f"строка {i}: пришло «{' | '.join(ga)}», ждали «{' | '.join(gb)}»"}
    return {"match": True, "why": ""}
