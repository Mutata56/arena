#!/usr/bin/env python3
"""Проверка конспектов DBA по живой базе.

Что делает:

  check <файл.md> ...   прогнать каждый пример ```sql``` и сверить с выводом,
                        который стоит под ним; прогнать эталон каждой ```запрос```
                        и сверить с её ожиданием
  fix <файл.md> ...     то же, но несовпавшие блоки вывода переписать настоящим
                        результатом (только для примеров теории, не для задач)
  render "<sql>"        напечатать канонический вид результата

Соглашение конспектов:

* ```sql```  — PostgreSQL, выполняется. Если сразу за ним идёт голый фенс ```,
  это его вывод, и он обязан совпасть.
* Исключение: пример, который САМ УЧИТ тому, что вывод не гарантирован (порядок
  строк без ORDER BY, порядок внутри склейки). Такой блок помечается комментарием
  со словом «нестабил» прямо в коде — тогда запрос всё равно выполняется, но
  вывод не сверяется. Помечать так обычные примеры нельзя: это отключение
  проверки, а не способ замять расхождение.
* ```tsql``` — код для SQL Server. Не выполняется никогда: движка нет, и врать
  про его вывод нельзя. Вывод под таким блоком проверке не подлежит.
* ```запрос``` — задача. Её ---эталон выполняется, результат обязан совпасть
  с ---ожидание. Так задача с выдуманным ответом не доживёт до ученика.
* ```сценарий``` — разыгрывается на живых сессиях одной одноразовой базы.
  Проверяется двумя способами: итог обязан совпасть с ---ожидание, а каждый
  шаг, помеченный «ждёт», обязан действительно упереться в блокировку (и
  наоборот — непомеченный не должен ждать). Сценарий, обещающий блокировку
  там, где её нет, врёт ученику про самое главное в теме.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from arena import sqlrun  # noqa: E402

FENCE = re.compile(r"^\s*```([^\s`]*)\s*$")


def blocks(text: str):
    """Разложить файл на куски: (вид, язык, строки, номер первой строки)."""
    lines = text.split("\n")
    out, i = [], 0
    while i < len(lines):
        m = FENCE.match(lines[i])
        if not m:
            out.append(("text", "", [lines[i]], i))
            i += 1
            continue
        lang, start, body = m.group(1), i, []
        i += 1
        while i < len(lines) and not FENCE.match(lines[i]):
            body.append(lines[i])
            i += 1
        i += 1
        out.append(("fence", lang, body, start))
    return out


def canon(res: dict) -> str:
    """Канонический вид результата: шапка и строки, ячейки через палку,
    колонки выровнены. Читается как таблица и разбирается как таблица."""
    sets = [s for s in res.get("sets") or [] if s.get("cols")]
    if not sets:
        statuses = [s.get("status", "") for s in res.get("sets") or []]
        return "\n".join(x for x in statuses if x)
    s = sets[-1]
    rows = [list(s["cols"])] + [["NULL" if c is None else str(c) for c in r] for r in s["rows"]]
    width = [max(len(r[i]) for r in rows) for i in range(len(rows[0]))]
    return "\n".join(" | ".join(c.ljust(width[i]) for i, c in enumerate(r)).rstrip()
                     for r in rows)


def cells(text: str) -> list[list[str]]:
    return [[c.strip() for c in ln.split("|")]
            for ln in text.strip().split("\n") if ln.strip()]


def same(a: str, b: str, ordered: bool = True) -> bool:
    ca, cb = cells(a), cells(b)
    if ordered:
        return ca == cb
    # «как угодно» в задаче значит «порядок строк не проверяем»: шапка на месте,
    # тело сравниваем как множество.
    if not ca or not cb or ca[0] != cb[0]:
        return False
    return sorted(ca[1:]) == sorted(cb[1:])


def run(sql: str) -> dict:
    return sqlrun.run(sql)


def check_note(path: Path, fix: bool = False) -> tuple[int, int, list[str]]:
    text = path.read_text(encoding="utf-8")
    bs = blocks(text)
    problems: list[str] = []
    ok = bad = 0
    replace: list[tuple[int, list[str]]] = []  # индекс блока -> новые строки

    for n, (kind, lang, body, ln) in enumerate(bs):
        # --- пример теории -------------------------------------------------
        if kind == "fence" and lang == "sql":
            nxt = None
            for k in range(n + 1, min(n + 3, len(bs))):
                if bs[k][0] == "fence":
                    nxt = k
                    break
                if bs[k][0] == "text" and "".join(bs[k][2]).strip():
                    break
            sql = "\n".join(body)
            # Пример, который учит нестабильности вывода, сверять нечем: он и
            # должен приезжать по-разному. Запускаем, но не сравниваем.
            unstable = "нестабил" in sql.lower()
            res = run(sql)
            if not res["ok"]:
                bad += 1
                problems.append(f"  строка {ln + 1}: пример упал — "
                                f"{res['error']['message']}")
                continue
            if nxt is None or bs[nxt][1] != "" or unstable:
                ok += 1
                continue
            want = "\n".join(bs[nxt][2])
            got = canon(res)
            if same(want, got):
                ok += 1
            else:
                bad += 1
                problems.append(f"  строка {bs[nxt][3] + 1}: вывод примера не сошёлся")
                if fix:
                    replace.append((nxt, got.split("\n")))

        # --- сценарий ------------------------------------------------------
        if kind == "fence" and lang == "сценарий":
            sc = parse_scenario(body)
            sid = sc.get("id") or f"строка {ln + 1}"
            if not sc["steps"]:
                bad += 1
                problems.append(f"  сценарий {sid}: нет ни одного шага")
                continue
            res = sqlrun.run_scenario(sc["steps"])
            trouble = []
            for k, st in enumerate(res["steps"], start=1):
                if st["expect_wait"] and not st["waited"]:
                    trouble.append(f"шаг {k} ({st['slot']}): обещана блокировка, а её не было")
                if not st["expect_wait"] and st["waited"]:
                    trouble.append(f"шаг {k} ({st['slot']}): блокировка там, где её не ждали")
                if st["error"] and not sc.get("allow_error"):
                    trouble.append(f"шаг {k} ({st['slot']}): {st['error']['message']}")
            if sc["expect"]:
                last = None
                for st in res["steps"]:
                    for one in st["sets"]:
                        if one.get("cols"):
                            last = one
                if last is None:
                    trouble.append("итог не с чем сверить: ни один шаг ничего не выбрал")
                elif not same("\n".join(sc["expect"]), canon({"sets": [last]})):
                    trouble.append("итог сценария не совпал с ожиданием:\n" +
                                   "\n".join("      " + x for x in
                                             canon({"sets": [last]}).split("\n")[:10]))
            if trouble:
                bad += 1
                problems.append(f"  сценарий {sid}:")
                problems.extend("    " + t for t in trouble)
            else:
                ok += 1

        # --- задача --------------------------------------------------------
        if kind == "fence" and lang == "запрос":
            task = parse_task(body)
            tid = task.get("id") or f"строка {ln + 1}"
            if task.get("free"):
                ok += 1
                continue
            if not task.get("solution"):
                bad += 1
                problems.append(f"  задача {tid}: нет ---эталон, проверить нечем")
                continue
            res = run(task["solution"])
            if task.get("wantState"):
                got = (res.get("error") or {}).get("sqlstate")
                if not res["ok"] and got == task["wantState"]:
                    ok += 1
                else:
                    bad += 1
                    problems.append(f"  задача {tid}: ждали SQLSTATE {task['wantState']}, "
                                    f"получили {got or 'успех'}")
                continue
            if not res["ok"]:
                bad += 1
                problems.append(f"  задача {tid}: эталон упал — {res['error']['message']}")
                continue
            got = canon(res)
            want = "\n".join(task["expect"])
            if same(want, got, task.get("ordered", True)):
                ok += 1
            else:
                bad += 1
                problems.append(f"  задача {tid}: ожидание не совпало с эталоном")
                problems.append("    эталон даёт:\n" +
                                "\n".join("      " + x for x in got.split("\n")[:12]))
                problems.append("    в задаче:\n" +
                                "\n".join("      " + x for x in want.split("\n")[:12]))

    if fix and replace:
        lines = text.split("\n")
        for idx, new in sorted(replace, key=lambda x: -bs[x[0]][3]):
            start = bs[idx][3]
            end = start + 1 + len(bs[idx][2]) + 1
            lines[start:end] = ["```"] + new + ["```"]
        path.write_text("\n".join(lines), encoding="utf-8")

    return ok, bad, problems


def parse_scenario(body: list[str]) -> dict:
    """Разбор ```сценарий``` — те же правила, что у md.js."""
    sc = {"id": "", "steps": [], "expect": [], "allow_error": False}
    mode = "head"
    step = None
    for raw in body:
        t = raw.strip()
        if re.match(r"^---\s*набор\s+\S+\s*$", t): mode = "skip"; step = None; continue
        if re.match(r"^---\s*ожидание\s*$", t): mode = "expect"; step = None; continue
        if re.match(r"^---\s*подсказка\s*$", t): mode = "skip"; step = None; continue
        # Сценарий про ошибку (взаимоблокировка, таймаут) — ошибка шага это
        # предмет разговора, а не поломка.
        if re.match(r"^---\s*ошибка\s*$", t): sc["allow_error"] = True; mode = "skip"; step = None; continue
        m = re.match(r"^---\s*([A-ZА-ЯЁ])\s*(жд[её]т)?\s*$", t)
        if m:
            step = {"slot": m.group(1), "sql": [], "expect_wait": bool(m.group(2))}
            sc["steps"].append(step)
            mode = "step"
            continue
        if mode == "step": step["sql"].append(raw); continue
        if mode == "expect":
            if t: sc["expect"].append(t)
            continue
        if mode == "head":
            kv = re.match(r"^(id|title):\s*(.+)$", t)
            if kv and kv.group(1) == "id": sc["id"] = kv.group(2).strip()
    for st in sc["steps"]:
        st["sql"] = "\n".join(st["sql"]).strip()
    sc["steps"] = [st for st in sc["steps"] if st["sql"]]
    return sc


def parse_task(body: list[str]) -> dict:
    """Разбор ```запрос``` — те же правила, что у md.js."""
    task = {"id": "", "expect": [], "solution": "", "free": False, "wantState": "",
            "ordered": True}
    mode = "head"
    sol: list[str] = []
    for raw in body:
        t = raw.strip()
        if re.match(r"^---\s*набор\s+\S+\s*$", t): mode = "skip"; continue
        if re.match(r"^---\s*старт\s*$", t): mode = "skip"; continue
        if re.match(r"^---\s*ожидание\s*$", t): mode = "expect"; continue
        if re.match(r"^---\s*подсказка\s*$", t): mode = "skip"; continue
        if re.match(r"^---\s*эталон\s*$", t): mode = "sol"; continue
        if re.match(r"^---\s*как\s+угодно\s*$", t): task["ordered"] = False; mode = "skip"; continue
        if re.match(r"^---\s*свободно\s*$", t): task["free"] = True; mode = "skip"; continue
        if re.match(r"^---\s*сессия\s*$", t): mode = "skip"; continue
        m = re.match(r"^---\s*ошибка\s*(.*)$", t)
        if m: task["wantState"] = m.group(1).strip(); mode = "skip"; continue
        if mode == "expect":
            if t: task["expect"].append(t)
            continue
        if mode == "sol": sol.append(raw); continue
        if mode == "head":
            kv = re.match(r"^(id|title):\s*(.+)$", t)
            if kv and kv.group(1) == "id": task["id"] = kv.group(2).strip()
    task["solution"] = "\n".join(sol).strip()
    return task


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    cmd = sys.argv[1]
    if cmd == "render":
        print(canon(run(sys.argv[2])))
        return 0
    if cmd in ("check", "fix"):
        total_ok = total_bad = 0
        for arg in sys.argv[2:]:
            path = Path(arg)
            ok, bad, problems = check_note(path, fix=(cmd == "fix"))
            total_ok += ok
            total_bad += bad
            mark = "ok " if not bad else "БЕДА"
            print(f"{mark} {path.name}: сошлось {ok}, разошлось {bad}")
            for p in problems:
                print(p)
        print(f"\nитого: сошлось {total_ok}, разошлось {total_bad}")
        return 1 if total_bad else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
