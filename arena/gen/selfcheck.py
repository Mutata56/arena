"""Проверка сгенерённого прогоном, а не на глаз. Жёсткие правила раздела 11 плана.

Два жанра проверяются по-настоящему:

- код-задача попадает в банк только после того, как ЭТАЛОННОЕ решение прогнали
  против видимых и скрытых тестов через песочницу запуска и получили зелёный.
  Дополнительно смотрим на стартовый набор: он обязан собираться и обязан НЕ
  проходить видимые тесты, иначе задача решена за ученика;
- задача на чтение кода вида «что выведет» запускается, и её вывод сравнивается
  с тем вариантом, который модель пометила Клиент A.

Красный результат это не мусор в банке, а причина ретрая: генерация повторяется
до двух раз, потом задание уходит в failed с логом.
"""

from __future__ import annotations

import re
import secrets
import shutil
from pathlib import Path

from .. import sandbox, tasks
from ..config import Config

# Прогон одной задачи это четыре запуска javac и java. Потолок общий с раннером.
TIMEOUT = sandbox.TIMEOUT
RUN_TIMEOUT = 30

MAIN_RE = re.compile(r"static\s+void\s+main\s*\(")
PUBLIC_TYPE_RE = re.compile(
    r"public\s+(?:final\s+|abstract\s+|sealed\s+|strictfp\s+)*(?:class|record|enum)\s+(\w+)")


def _workdir(cfg: Config, tag: str) -> Path:
    path = cfg.runs_root / f"gen-{tag}-{secrets.token_hex(4)}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def normalize_output(text: str) -> str:
    """Вывод программы и вариант ответа приводим к одному виду.

    println добавляет перевод строки в конце, модель его в вариант не пишет,
    и это не расхождение. А вот сами строки сравниваются точно.
    """
    lines = [line.strip() for line in str(text or "").replace("\r\n", "\n").split("\n")]
    return "\n".join(line for line in lines if line)


def main_class(source: str) -> str | None:
    """Класс, который надо запускать: тот, внутри которого объявлен main."""
    found = MAIN_RE.search(source)
    if found is None:
        return None
    name = None
    for match in tasks.TYPE_RE.finditer(source):
        if match.start() < found.start():
            name = match.group(1)
    return name


def file_name(source: str) -> str | None:
    """Имя файла: javac требует, чтобы оно совпадало с public-классом."""
    public = PUBLIC_TYPE_RE.search(source)
    if public:
        return public.group(1)
    return main_class(source)


def code_task(cfg: Config, payload: dict, method: str | None = None) -> tuple[bool, str]:
    """Эталон против всех тестов. Зелёный это пропуск в банк, красный это ретрай."""
    if not sandbox.junit_ready():
        return False, f"нет джарника JUnit ({sandbox.JUNIT_JAR}), проверять эталон нечем"
    try:
        reference = tasks.check_files(
            cfg, payload, payload["reference_solution"], timeout=TIMEOUT, method=method)
    except tasks.TaskError as exc:
        return False, f"эталон не прогнался: {exc}"
    if not reference.ok:
        where = {"compile": "не компилируется", "visible": "красный на видимых тестах",
                 "hidden": "красный на скрытых тестах"}.get(reference.phase, reference.phase)
        detail = (reference.compile_out or reference.visible_out or "").strip()
        red = [case["name"] for case in reference.hidden if not case["ok"]]
        if red:
            detail = "красные случаи: " + ", ".join(red)
        return False, f"эталон {where}: {detail[:600] or reference.message}"

    try:
        starter = tasks.check_files(
            cfg, payload, payload["starter_files"], timeout=TIMEOUT, method=method)
    except tasks.TaskError as exc:
        return False, f"стартовый набор не прогнался: {exc}"
    if starter.phase == "compile" and not starter.timed_out and not starter.ok:
        return False, ("стартовый набор не компилируется, ученику не с чего начинать: "
                       + (starter.compile_out or "")[:400])
    if starter.visible_ok:
        return False, "стартовый набор уже проходит видимые тесты: задача решена за ученика"
    return True, "эталон зелёный, стартовый набор красный, как и положено"


def readcode_task(cfg: Config, payload: dict, method: str | None = None) -> tuple[bool, str]:
    """Задача «что выведет»: запускаем и сверяем вывод с Клиент A вариантом."""
    if payload.get("kind") != "output":
        return True, "задача про поиск бага, прогон не нужен"
    source = payload["code"]
    name = file_name(source)
    if not name:
        return False, "в сниппете нет класса с main, запустить нечем"

    workdir = _workdir(cfg, "readcode")
    try:
        src = workdir / "src"
        src.mkdir(parents=True, exist_ok=True)
        (workdir / "classes").mkdir(parents=True, exist_ok=True)
        (src / f"{name}.java").write_text(source.rstrip() + "\n", encoding="utf-8")
        built = sandbox.run_javac(
            ["-encoding", "UTF-8", "-nowarn", "-d", "classes", f"src/{name}.java"],
            workdir, timeout=RUN_TIMEOUT, method=method,
        )
        if not built.ok:
            return False, "сниппет не компилируется: " + (built.stderr or built.stdout)[:400]
        run = sandbox.run_java(
            ["-cp", "classes", main_class(source) or name], workdir,
            timeout=RUN_TIMEOUT, method=method,
        )
        if run.timed_out:
            return False, "сниппет не завершился за отведённое время"
        if run.rc != 0:
            return False, "сниппет упал при запуске: " + (run.stderr or "")[:400]
        got = normalize_output(run.stdout)
        want = normalize_output(payload["opts"][payload["ans"]])
        if got != want:
            return False, (f"вывод не сошёлся с ответом. Программа печатает {got!r}, "
                           f"а Клиент A помечен вариант {want!r}")
        twins = [i for i, opt in enumerate(payload["opts"])
                 if i != payload["ans"] and normalize_output(opt) == got]
        if twins:
            return False, f"неверный вариант {twins[0] + 1} совпадает с настоящим выводом"
        return True, f"вывод сошёлся: {got[:120]!r}"
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# Жанры, которые нельзя пускать в банк без прогона.
CHECKS = {
    "code": code_task,
    "readcode": readcode_task,
}


def run(cfg: Config, kind: str, payloads: list[dict],
        method: str | None = None) -> tuple[list[dict], list[str], list[str]]:
    """Отсеять то, что не подтвердилось прогоном.

    Возвращает годные записи, причины отказов и заметки о прошедших проверках:
    заметки уходят в журнал, чтобы зелёный эталон был виден в логе воркера,
    как того требует приёмка фазы 4.
    """
    check = CHECKS.get(kind)
    if check is None:
        return payloads, [], []
    good: list[dict] = []
    bad: list[str] = []
    notes: list[str] = []
    for i, payload in enumerate(payloads):
        try:
            ok, why = check(cfg, payload, method=method)
        except Exception as exc:  # noqa: BLE001
            ok, why = False, f"проверка сорвалась: {exc}"
        if ok:
            good.append(payload)
            notes.append(f"запись {i}: {why}")
        else:
            bad.append(f"запись {i}: {why}")
    return good, bad, notes
