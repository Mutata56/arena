"""Запуск чужого кода в песочнице.

SecurityManager из JDK 26 выпилен, поэтому изоляция только внешняя (раздел 12 плана).
Через эту функцию идут ВСЕ запуски javac и java: и `arena check`, и будущая
самопроверка эталонов конвейером.

Три способа, в порядке предпочтения:

1. systemd-run --user: ProtectHome=read-only, PrivateTmp, PrivateNetwork, MemoryMax,
   TasksMax и ReadWritePaths ровно на рабочую папку прогона.
2. bwrap --unshare-net: то же самое руками, если systemd-run из этого контекста недоступен.
3. sandbox-exec (Seatbelt): единственный вариант на macOS, где нет ни cgroups,
   ни namespaces, а значит и первых двух. Профиль даёт ту же картину: читать можно
   всё, писать — только в папку прогона, сети нет.

Плюс страховка поверх всех трёх: start_new_session и убийство всей группы процессов
по таймауту, потому что тестируемый код может наплодить детей через ProcessBuilder.

Ловушка, проверенная на этой машине: PrivateTmp=yes подсовывает юниту свежий /tmp,
и если рабочая папка лежит внутри /tmp, systemd не может собрать пространство имён
(код выхода 226). Поэтому папки прогонов живут вне /tmp, см. runs_root в config.

Чем Seatbelt слабее первых двух и почему это терпимо:
  * нет аналога MemoryMax и TasksMax. Потолок памяти просим у самой JVM (-Xmx),
    от форк-бомбы спасает только таймаут с убийством группы процессов.
  * нет приватного /tmp. Вместо него JVM получает -service5.example.invalid.tmpdir внутрь папки
    прогона, а её всё равно подметает sweep_runs.
  * sandbox-exec помечен deprecated с 10.14, но живее всех живых: на нём держится
    песочница половины системных сервисов. Замены в пользовательском доступе нет.
"""

from __future__ import annotations

import os
import secrets
import shutil
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from .config import PROJECT_ROOT

JUNIT_JAR = PROJECT_ROOT / "vendor" / "junit-platform-console-standalone.jar"

TIMEOUT = 60          # раздел 12 плана: минута на прогон и хватит
MEMORY_MAX = "512M"
TASKS_MAX = "64"

SYSTEMD = "systemd"
BWRAP = "bwrap"
SEATBELT = "seatbelt"
PLAIN = "plain"       # только для отладки, через ARENA_SANDBOX=plain

METHODS = (SYSTEMD, BWRAP, SEATBELT)
_METHOD_BINARY = {SYSTEMD: "systemd-run", BWRAP: "bwrap", SEATBELT: "sandbox-exec"}

MACOS = sys.platform == "darwin"

# Чем проверяем живость песочницы. На линуксе это /bin/true, на macOS такого пути
# нет вовсе — там /usr/bin/true, и проба падала бы с «No such file or directory».
TRUE_BIN = shutil.which("true") or ("/usr/bin/true" if MACOS else "/bin/true")

# Личный /tmp прогона: замена PrivateTmp и --tmpfs /tmp, которых у Seatbelt нет.
# Лежит внутри папки прогона, поэтому уезжает вместе с ней в sweep_runs.
RUN_TMP = ".arena-tmp"

# Профиль Seatbelt (SBPL). Читать разрешаем всё — ровно как --ro-bind / / у bwrap
# и ProtectHome=read-only у systemd. Запрещаем то, что и там: запись куда угодно,
# кроме папки прогона, и сеть.
SEATBELT_PROFILE = """(version 1)
(deny default)
(allow process-fork)
(allow process-exec)
(allow file-read*)
(allow file-write* (subpath (param "WORKDIR")))
(allow file-write-data
    (literal "/dev/null") (literal "/dev/zero") (literal "/dev/random")
    (literal "/dev/urandom") (literal "/dev/dtracehelper") (literal "/dev/tty"))
(allow sysctl-read)
(allow mach-lookup)
(allow signal (target self))
(deny network*)
"""

_probed: str | None = None
_java_home_cache: Path | None = None


@dataclass
class RunResult:
    rc: int
    stdout: str
    stderr: str
    timed_out: bool
    method: str
    seconds: float

    @property
    def ok(self) -> bool:
        return self.rc == 0 and not self.timed_out


class SandboxUnavailable(RuntimeError):
    """Ни systemd-run, ни bwrap не работают: запускать чужой код небезопасно."""


def forced_method() -> str | None:
    value = (os.environ.get("ARENA_SANDBOX") or "").strip().lower()
    return value or None


def _systemd_argv(cmd: list[str], workdir: Path, timeout: int, unit: str) -> list[str]:
    argv = [
        "systemd-run", "--user", "--pipe", "--collect", "--quiet",
        f"--unit={unit}",
        "--property=ProtectHome=read-only",
        "--property=PrivateTmp=yes",
        "--property=PrivateNetwork=yes",
        "--property=NoNewPrivileges=yes",
        f"--property=MemoryMax={MEMORY_MAX}",
        f"--property=TasksMax={TASKS_MAX}",
        f"--property=ReadWritePaths={workdir}",
        # Подстраховка на случай, если arena убьют сигналом и питоновский таймер
        # не успеет: юнит всё равно не переживёт этот запас.
        f"--property=RuntimeMaxSec={timeout + 15}",
        f"--working-directory={workdir}",
    ]
    for name in ("LANG", "LC_ALL", "TERM"):
        value = os.environ.get(name)
        if value:
            argv.append(f"--setenv={name}={value}")
    argv.append("--")
    argv.extend(cmd)
    return argv


def _bwrap_argv(cmd: list[str], workdir: Path) -> list[str]:
    return [
        "bwrap",
        "--ro-bind", "/", "/",
        "--dev", "/dev",
        "--proc", "/proc",
        # Свой /tmp и своя рабочая папка поверх слепка корня. Порядок важен:
        # bind рабочей папки идёт после tmpfs, поэтому папка внутри /tmp тоже выживет.
        "--tmpfs", "/tmp",
        "--bind", str(workdir), str(workdir),
        "--unshare-net", "--unshare-pid", "--unshare-ipc", "--unshare-uts",
        "--die-with-parent", "--new-session",
        "--chdir", str(workdir),
        "--", *cmd,
    ]


def _seatbelt_argv(cmd: list[str], workdir: Path) -> list[str]:
    # Профиль передаём строкой, путь — параметром через -D, а не подстановкой в текст:
    # так путь с кавычкой или обратным слешем не сломает разбор SBPL.
    return ["sandbox-exec", "-p", SEATBELT_PROFILE, "-D", f"WORKDIR={workdir}", *cmd]


def _seatbelt_env(workdir: Path) -> dict[str, str]:
    """Окружение прогона. Собираем с нуля по тому же списку, что и systemd-вариант:
    тестируемому коду незачем видеть ARENA_*, токены и прочее из нашего окружения."""
    env = {
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
        "HOME": str(Path.home()),      # только на чтение, как ProtectHome=read-only
        "TMPDIR": str(workdir / RUN_TMP),
    }
    for name in ("LANG", "LC_ALL", "TERM"):
        value = os.environ.get(name)
        if value:
            env[name] = value
    return env


def _java_home() -> Path | None:
    """Настоящий JDK. На macOS /usr/bin/java — это заглушка Apple, которая при запуске
    сама разыскивает JDK; под Seatbelt она этого не может и падает с «Unable to locate
    a Java Runtime». Поэтому зовём бинари JDK по абсолютному пути."""
    global _java_home_cache
    if _java_home_cache is not None:
        return _java_home_cache
    candidates: list[Path] = []
    env_home = os.environ.get("JAVA_HOME")
    if env_home:
        candidates.append(Path(env_home))
    try:
        res = subprocess.run(
            ["/usr/libexec/java_home"], capture_output=True, text=True, timeout=20, check=False,
        )
        if res.returncode == 0 and res.stdout.strip():
            candidates.append(Path(res.stdout.strip()))
    except (OSError, subprocess.SubprocessError):
        pass
    for home in candidates:
        if (home / "bin" / "java").is_file():
            _java_home_cache = home
            return home
    return None


def _tool(name: str) -> str:
    """Путь до java или javac. Вне macOS всё как было — абсолютный /usr/bin."""
    if MACOS:
        home = _java_home()
        if home:
            return str(home / "bin" / name)
    return f"/usr/bin/{name}"


def _jvm_limits(workdir: Path, method: str, prefix: str = "") -> list[str]:
    """То, что systemd и bwrap дают снаружи, а Seatbelt не умеет: потолок памяти
    вместо MemoryMax и личный /tmp вместо PrivateTmp. Флаги идут первыми, поэтому
    задача при желании может переопределить их своими."""
    if method != SEATBELT:
        return []
    return [
        f"{prefix}-Xmx{MEMORY_MAX}",
        f"{prefix}-service5.example.invalid.tmpdir={workdir / RUN_TMP}",
    ]


def _stop_unit(unit: str) -> None:
    subprocess.run(
        ["systemctl", "--user", "stop", f"{unit}.service"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15, check=False,
    )


def _spawn(argv: list[str], timeout: int, unit: str | None,
           cwd: Path | None = None, env: dict[str, str] | None = None,
           stdin: str | None = None) -> tuple[int, str, str, bool]:
    """Запустить и дождаться, убив всю группу процессов по таймауту.

    cwd и env нужны Seatbelt-варианту: у sandbox-exec нет ни --working-directory,
    ни --setenv, всё это задаётся при запуске процесса."""
    proc = subprocess.Popen(
        argv, cwd=cwd, env=env, stdin=subprocess.PIPE if stdin is not None else None,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace", start_new_session=True,
    )
    try:
        out, err = proc.communicate(input=stdin, timeout=timeout)
        return proc.returncode, out, err, False
    except subprocess.TimeoutExpired:
        pass

    # Транзиентный юнит переживает смерть клиента systemd-run, поэтому сначала
    # гасим юнит, потом добиваем группу процессов.
    if unit:
        try:
            _stop_unit(unit)
        except subprocess.SubprocessError:
            pass
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(os.getpgid(proc.pid), sig)
        except (ProcessLookupError, PermissionError):
            break
        try:
            proc.wait(timeout=3)
            break
        except subprocess.TimeoutExpired:
            continue
    try:
        out, err = proc.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        out, err = "", ""
    return proc.returncode if proc.returncode is not None else -9, out, err, True


def probe(force: str | None = None) -> str:
    """Каким способом изолируем прогоны. Проверяем один раз за процесс."""
    global _probed
    chosen = force or forced_method()
    if chosen:
        if chosen not in (*METHODS, PLAIN):
            raise SandboxUnavailable(
                f"ARENA_SANDBOX={chosen!r}: знаю только "
                + ", ".join((*METHODS, PLAIN))
            )
        return chosen
    if _probed:
        return _probed

    workdir = Path.home() / ".cache" / "arena" / "probe"
    workdir.mkdir(parents=True, exist_ok=True)
    for method in METHODS:
        if shutil.which(_METHOD_BINARY[method]) is None:
            continue
        res = run([TRUE_BIN], workdir, timeout=20, method=method, check_probe=False)
        if res.rc == 0:
            _probed = method
            return method
    raise SandboxUnavailable(
        "ни systemd-run --user, ни bwrap, ни sandbox-exec не запускаются в этом окружении.\n"
        "Без песочницы чужой код не запускаю: это прямая дыра в домашнюю папку."
    )


def run(cmd: list[str], workdir: Path, timeout: int = TIMEOUT,
        method: str | None = None, check_probe: bool = True,
        stdin: str | None = None) -> RunResult:
    """Выполнить команду внутри рабочей папки прогона. Наружу писать нельзя.

    stdin это то, что программа прочитает с клавиатуры: Scanner и BufferedReader
    берут данные оттуда, и без этого задачи «прочитай число и ответь» не проверить.
    """
    workdir = Path(workdir).resolve()
    # ReadWritePaths на несуществующую папку тоже роняет сборку пространства имён.
    workdir.mkdir(parents=True, exist_ok=True)
    method = method or (probe() if check_probe else PLAIN)

    unit = None
    cwd: Path | None = None
    env: dict[str, str] | None = None
    if method == SYSTEMD:
        unit = f"arena-run-{os.getpid()}-{secrets.token_hex(4)}"
        argv = _systemd_argv(cmd, workdir, timeout, unit)
    elif method == BWRAP:
        argv = _bwrap_argv(cmd, workdir)
    elif method == SEATBELT:
        # Личный /tmp должен существовать до запуска: JVM с -service5.example.invalid.tmpdir на
        # несуществующую папку не создаёт её, а роняет любую работу с временными файлами.
        (workdir / RUN_TMP).mkdir(exist_ok=True)
        argv = _seatbelt_argv(cmd, workdir)
        cwd = workdir
        env = _seatbelt_env(workdir)
    else:
        argv = list(cmd)

    started = time.monotonic()
    if method == PLAIN:
        rc, out, err, timed_out = _run_plain(argv, workdir, timeout, stdin=stdin)
    else:
        rc, out, err, timed_out = _spawn(argv, timeout, unit, cwd=cwd, env=env, stdin=stdin)
    return RunResult(
        rc=rc, stdout=out, stderr=err, timed_out=timed_out,
        method=method, seconds=round(time.monotonic() - started, 2),
    )


def _run_plain(argv: list[str], workdir: Path, timeout: int,
               stdin: str | None = None) -> tuple[int, str, str, bool]:
    proc = subprocess.Popen(
        argv, cwd=workdir, stdin=subprocess.PIPE if stdin is not None else None,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace", start_new_session=True,
    )
    try:
        out, err = proc.communicate(input=stdin, timeout=timeout)
        return proc.returncode, out, err, False
    except subprocess.TimeoutExpired:
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.killpg(os.getpgid(proc.pid), sig)
            except (ProcessLookupError, PermissionError):
                break
            try:
                proc.wait(timeout=3)
                break
            except subprocess.TimeoutExpired:
                continue
        out, err = proc.communicate(timeout=5)
        return proc.returncode if proc.returncode is not None else -9, out, err, True


def run_java(args: list[str], workdir: Path, timeout: int = TIMEOUT,
             method: str | None = None, stdin: str | None = None) -> RunResult:
    """java с нашим jar в classpath. Аргументы уже готовые, путь к java абсолютный."""
    workdir = Path(workdir).resolve()
    method = method or probe()
    return run([_tool("java"), *_jvm_limits(workdir, method), *args],
               workdir, timeout=timeout, method=method, stdin=stdin)


def run_javac(args: list[str], workdir: Path, timeout: int = TIMEOUT,
              method: str | None = None) -> RunResult:
    workdir = Path(workdir).resolve()
    method = method or probe()
    # javac сам себе JVM, но свои флаги принимает только через -J.
    return run([_tool("javac"), *_jvm_limits(workdir, method, prefix="-J"), *args],
               workdir, timeout=timeout, method=method)


def junit_ready() -> bool:
    return JUNIT_JAR.is_file() and JUNIT_JAR.stat().st_size > 100_000
