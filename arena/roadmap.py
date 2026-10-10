"""Синк роадмапа из Obsidian в базу.

Правила жёсткие, они описаны в фазе 1 плана:

* ноды берём только из раздела «## Ноды этапа» хаба, до следующего «## »;
* регэксп принимает оба состояния чекбокса, «- [ ]» и «- [x]»;
* файлы «N.MM ....md» дают только obsidian_path, содержимое хаба первично;
* синк ничего не удаляет и не сбрасывает: пропавшая нода это предупреждение в лог;
* чекбокс в хабе это зеркало прогресса на запись, читать из него статус нельзя.
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from .config import DEFAULT_TRACK, Config, NODE_KINDS, TRACK_STAGES, Track

STAGE_DIR_RE = re.compile(r"^Этап\s+(\d+)\s+(.+)$")
NODE_FILE_RE = re.compile(r"^(\d+\.\d+)\s+(.+)\.md$")
NODE_LINE_RE = re.compile(
    r"^\s*-\s*\[[ xX]\]\s*"
    r"\[\[(?P<code>\d+\.\d+)\s+(?P<title>[^\]|]+?)(?:\|(?P<alias>[^\]]+))?\]\]"
    r"\s*:?\s*(?P<rest>.*)$"
)
# Второй роадмап перечисляет ноды таблицей, а не чек-листом: «| [[2.01 …]] | про что |».
# Чекбокса там нет, значит и зеркалить в него нечего — статус живёт только в базе.
TABLE_LINE_RE = re.compile(
    r"^\s*\|\s*"
    r"\[\[(?P<code>\d+\.\d+)\s+(?P<title>[^\]|]+?)(?:\\?\|(?P<alias>[^\]]+))?\]\]"
    r"\s*\|(?P<rest>.*)$"
)
KIND_TAIL_RE = re.compile(r"\(([^()]+)\)\s*$")
TYPE_LINE_RE = re.compile(r"\*\*Тип:\*\*\s*([^|\n]+)")
SECTION_RE = re.compile(r"^##\s+.*Ноды этапа")
H1_RE = re.compile(r"^#\s+Этап\s+\d+\.\s*(.+)$")


@dataclass
class ParsedNode:
    code: str
    title: str
    kind: str
    descr: str
    seq: int


@dataclass
class ParsedStage:
    num: int
    title: str
    hub_path: Path
    dir_path: Path
    nodes: list[ParsedNode] = field(default_factory=list)
    files: dict[str, Path] = field(default_factory=dict)


@dataclass
class SyncReport:
    stages_added: int = 0
    stages_updated: int = 0
    nodes_added: int = 0
    nodes_updated: int = 0
    nodes_unchanged: int = 0
    warnings: list[str] = field(default_factory=list)

    @property
    def changed(self) -> int:
        return self.stages_added + self.stages_updated + self.nodes_added + self.nodes_updated

    def render(self) -> str:
        lines = [
            f"этапы: добавлено {self.stages_added}, обновлено {self.stages_updated}",
            f"ноды: добавлено {self.nodes_added}, обновлено {self.nodes_updated}, "
            f"без изменений {self.nodes_unchanged}",
        ]
        if self.warnings:
            lines.append(f"предупреждений: {len(self.warnings)}")
            lines.extend("  " + w for w in self.warnings[:20])
            if len(self.warnings) > 20:
                lines.append(f"  ... и ещё {len(self.warnings) - 20}")
        else:
            lines.append("предупреждений нет")
        return "\n".join(lines)


def section_bounds(lines: list[str]) -> tuple[int, int] | None:
    """Границы раздела «## Ноды этапа». Вне него ссылки на ноды трогать нельзя:
    в хабе этапа 2 такая же строка живёт в чек-листе критериев закрытия."""
    start = None
    for i, line in enumerate(lines):
        if SECTION_RE.match(line):
            start = i
            break
    if start is None:
        return None
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j].startswith("## "):
            end = j
            break
    return start + 1, end


def parse_hub(hub: Path, warnings: list[str]) -> tuple[str, list[ParsedNode]]:
    """Достать заголовок этапа и его ноды из раздела «Ноды этапа»."""
    lines = hub.read_text(encoding="utf-8").splitlines()

    title = ""
    for line in lines:
        m = H1_RE.match(line)
        if m:
            title = m.group(1).strip()
            break

    bounds = section_bounds(lines)
    if bounds is None:
        warnings.append(f"{hub.name}: нет раздела «## Ноды этапа», этап без нод")
        return title, []
    start, end = bounds

    nodes: list[ParsedNode] = []
    seen: set[str] = set()
    for line in lines[start:end]:
        m = NODE_LINE_RE.match(line) or TABLE_LINE_RE.match(line)
        if not m:
            continue
        code = m.group("code")
        if code in seen:
            warnings.append(f"{hub.name}: код {code} встречается в разделе дважды, взял первый")
            continue
        seen.add(code)
        rest = m.group("rest").strip().rstrip("|").strip()
        km = KIND_TAIL_RE.search(rest)
        if km:
            kind = km.group(1).strip()
            descr = rest[: km.start()].strip()
        else:
            kind = ""
            descr = rest
        if kind and kind not in NODE_KINDS:
            warnings.append(f"{code}: незнакомый тип «{kind}»")
        nodes.append(
            ParsedNode(
                code=code,
                title=m.group("title").strip(),
                kind=kind,
                descr=descr,
                seq=len(nodes) + 1,
            )
        )
    return title, nodes


def scan_stage_files(stage_dir: Path) -> dict[str, Path]:
    """Файлы нод «N.MM Название.md». Всё остальное в папке нас не касается."""
    found: dict[str, Path] = {}
    for path in sorted(stage_dir.glob("*.md")):
        m = NODE_FILE_RE.match(path.name)
        if m:
            found[m.group(1)] = path
    return found


def kind_from_file(path: Path) -> str:
    try:
        head = path.read_text(encoding="utf-8")[:600]
    except OSError:
        return ""
    m = TYPE_LINE_RE.search(head)
    return m.group(1).strip() if m else ""


def parse_roadmap(cfg: Config, warnings: list[str],
                  track: Track = DEFAULT_TRACK) -> list[ParsedStage]:
    root = cfg.track_dir(track)
    if not root.is_dir():
        raise SystemExit(f"не нашёл роадмап: {root}")

    stages: list[ParsedStage] = []
    for stage_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        m = STAGE_DIR_RE.match(stage_dir.name)
        if not m:
            warnings.append(f"{stage_dir.name}: имя папки не похоже на «Этап NN Название», пропускаю")
            continue
        num = int(m.group(1))
        hubs = sorted(stage_dir.glob("_Этап*.md"))
        if not hubs:
            warnings.append(f"{stage_dir.name}: нет хаба _Этап*.md, этап пропущен")
            continue
        # Obsidian при конфликте синхронизации кладёт рядом копию с суффиксом,
        # и по алфавиту она может оказаться первой. Берём точное имя папки.
        exact = stage_dir / f"_{stage_dir.name}.md"
        hub = exact if exact.is_file() else hubs[0]
        if len(hubs) > 1:
            others = ", ".join(h.name for h in hubs if h != hub)
            warnings.append(f"{stage_dir.name}: хабов больше одного, взял {hub.name}, игнорирую {others}")
        title, nodes = parse_hub(hub, warnings)
        stage = ParsedStage(
            num=num,
            title=title or m.group(2).strip(),
            hub_path=hub,
            dir_path=stage_dir,
            nodes=nodes,
            files=scan_stage_files(stage_dir),
        )
        # Нодой владеет тот этап, чей номер стоит в префиксе кода. Строку из чужого
        # хаба (опечатка в ссылке) игнорируем: иначе она угоняет ноду в другой этап.
        kept: list[ParsedNode] = []
        for node in stage.nodes:
            if not node.code.startswith(f"{num}."):
                warnings.append(f"{hub.name}: код {node.code} не из этапа {num}, строку пропустил")
                continue
            if not node.kind:
                fallback = kind_from_file(stage.files[node.code]) if node.code in stage.files else ""
                node.kind = fallback or "тема"
                # Хаб-таблица тип не несёт вовсе, и это нормально: его пишет сама
                # нота. Ругаемся только когда не ответил и файл.
                if not fallback:
                    warnings.append(f"{node.code}: тип не указаны ни в хабе, ни в ноде, взял «{node.kind}»")
            kept.append(node)
        for i, node in enumerate(kept, start=1):
            node.seq = i
        stage.nodes = kept
        if any(s.num == num for s in stages):
            warnings.append(f"{stage_dir.name}: этап {num} уже был, папку пропускаю")
            continue
        stages.append(stage)
    return stages


def vault_relative(cfg: Config, path: Path) -> str:
    try:
        return str(path.relative_to(cfg.vault_root))
    except ValueError:
        return str(path)


def plan_moves(rows, nodes: list[ParsedNode]) -> tuple[dict[str, str], list[tuple[str, str, str]]]:
    """Разобраться, какие ноды просто переехали на другие коды.

    Код это адрес ноды, а не её личность: если в середину этапа вставили ноду,
    весь хвост сдвигается, и прогресс, приклеенный к коду, оказывается на чужом
    содержимом. Личность внутри этапа даёт название, оно уникально.
    Возвращает карту переездов и список отменённых (там, где однозначности нет).
    """
    db_by_code = {r["code"]: r for r in rows}
    db_by_title: dict[str, list] = {}
    for r in rows:
        db_by_title.setdefault(r["title"], []).append(r)
    new_by_title: dict[str, list[ParsedNode]] = {}
    for n in nodes:
        new_by_title.setdefault(n.title, []).append(n)

    moves: dict[str, str] = {}
    cancelled: list[tuple[str, str, str]] = []
    for n in nodes:
        current = db_by_code.get(n.code)
        if current is not None and current["title"] == n.title:
            continue
        candidates = db_by_title.get(n.title, [])
        if len(candidates) != 1:
            continue
        src = candidates[0]
        if src["code"] == n.code or len(new_by_title.get(src["title"], [])) > 1:
            continue
        moves[src["code"]] = n.code

    # Если целевой код занят нодой, которая никуда не едет, гадать нельзя.
    changed = True
    while changed:
        changed = False
        for old, new in list(moves.items()):
            occupant = db_by_code.get(new)
            if occupant is not None and occupant["code"] not in moves:
                cancelled.append((old, new, occupant["title"]))
                del moves[old]
                changed = True
    return moves, cancelled


def reconcile_codes(conn: sqlite3.Connection, stage_id: int, nodes: list[ParsedNode],
                    warnings: list[str]) -> set[str]:
    """Перевесить коды переехавших нод, чтобы прогресс остался на своём содержимом."""
    rows = conn.execute(
        "SELECT id, code, title, status FROM nodes WHERE stage_id = ?", (stage_id,)
    ).fetchall()
    if not rows:
        return set()
    moves, cancelled = plan_moves(rows, nodes)

    frozen: set[str] = set()
    for old, new, title in cancelled:
        frozen.update((old, new))
        warnings.append(
            f"{old}: переезд на {new} отменён, код занят нодой «{title}», разберись руками"
        )
    if moves:
        with_progress = sum(1 for r in rows if r["code"] in moves and r["status"] != "locked")
        warnings.append(
            f"этап переномерован: переехало нод {len(moves)}, из них с прогрессом {with_progress}"
        )
        # Два прохода через временные коды: иначе первый же переезд упрётся
        # в уникальность кода.
        for i, old in enumerate(moves):
            conn.execute("UPDATE nodes SET code = ? WHERE code = ?", (f"~tmp{i}~", old))
        for i, new in enumerate(moves.values()):
            conn.execute("UPDATE nodes SET code = ? WHERE code = ?", (new, f"~tmp{i}~"))
    return frozen


def sync(conn: sqlite3.Connection, cfg: Config, track: Track = DEFAULT_TRACK) -> SyncReport:
    """Синк одного трека. Номер этапа и код ноды кладём в базу со смещением трека:
    таблица нод общая, а «2.03» есть и в Java, и в DBA."""
    report = SyncReport()
    stages = parse_roadmap(cfg, report.warnings, track)

    seen_codes: set[str] = set()
    for stage in stages:
        hub_rel = vault_relative(cfg, stage.hub_path)
        db_num = track.db_num(stage.num)
        in_track = 1 if (track.in_track and stage.num in TRACK_STAGES) else 0
        # Дальше по функции код ноды это уже адрес в базе, а не имя файла в волте.
        # Ключи карты файлов переводим тем же смещением, иначе obsidian_path
        # не найдётся и нода останется без конспекта.
        for node in stage.nodes:
            node.code = track.db_code(node.code)
        stage.files = {track.db_code(k): v for k, v in stage.files.items()}
        row = conn.execute("SELECT * FROM stages WHERE num = ?", (db_num,)).fetchone()
        if row is None:
            cur = conn.execute(
                "INSERT INTO stages(num, title, hub_path, in_track, track) VALUES (?, ?, ?, ?, ?)",
                (db_num, stage.title, hub_rel, in_track, track.key),
            )
            stage_id = cur.lastrowid
            report.stages_added += 1
        else:
            stage_id = row["id"]
            if (row["title"], row["hub_path"], row["in_track"], row["track"]) != (
                    stage.title, hub_rel, in_track, track.key):
                conn.execute(
                    "UPDATE stages SET title = ?, hub_path = ?, in_track = ?, track = ? WHERE id = ?",
                    (stage.title, hub_rel, in_track, track.key, stage_id),
                )
                report.stages_updated += 1

        frozen = reconcile_codes(conn, stage_id, stage.nodes, report.warnings)

        for node in stage.nodes:
            seen_codes.add(node.code)
            file_path = stage.files.get(node.code)
            obsidian_path = vault_relative(cfg, file_path) if file_path else None
            row = conn.execute("SELECT * FROM nodes WHERE code = ?", (node.code,)).fetchone()
            if row is None:
                # Правило 1 раздела «Прогрессия»: всё locked, первый этап открыт.
                # Если этап уже начат, дописанная нода не должна остаться запертой навсегда.
                stage_started = conn.execute(
                    "SELECT COUNT(*) FROM nodes WHERE stage_id = ? AND status != 'locked'",
                    (stage_id,),
                ).fetchone()[0]
                if not track.in_track:
                    # У второго раздела нет ни траектории, ни боссов, открывающих
                    # следующий этап. Запирать в нём ноды означало бы запереть навсегда.
                    status = "available"
                else:
                    status = "available" if (stage.num == 1 or stage_started) else "locked"
                conn.execute(
                    "INSERT INTO nodes(stage_id, code, title, kind, obsidian_path, descr, seq, status) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (stage_id, node.code, node.title, node.kind, obsidian_path,
                     node.descr, node.seq, status),
                )
                report.nodes_added += 1
                continue

            new = (stage_id, node.title, node.kind, obsidian_path, node.descr, node.seq)
            old = (row["stage_id"], row["title"], row["kind"], row["obsidian_path"],
                   row["descr"], row["seq"])
            if new != old:
                # Переезды уже разобраны выше. Если после этого у ноды с прогрессом
                # всё равно сменилось название, это либо честная правка формулировки,
                # либо склейка чужого содержимого с прогрессом. Молчать нельзя.
                if row["status"] != "locked" and row["title"] != node.title:
                    report.warnings.append(
                        f"{node.code}: у ноды со статусом {row['status']} сменилось название "
                        f"«{row['title']}» на «{node.title}», проверь, тот ли это прогресс"
                    )
                if node.code in frozen:
                    report.warnings.append(
                        f"{node.code}: содержимое не обновляю, пока переезд не разобран руками"
                    )
                    report.nodes_unchanged += 1
                    continue
                conn.execute(
                    "UPDATE nodes SET stage_id = ?, title = ?, kind = ?, obsidian_path = ?, "
                    "descr = ?, seq = ? WHERE id = ?",
                    (*new, row["id"]),
                )
                report.nodes_updated += 1
            else:
                report.nodes_unchanged += 1

    # Ничего не удаляем: пропавшая нода это сигнал разобраться руками, а не потеря прогресса.
    # Смотрим только свой трек: синк Java не должен ругаться на ноды DBA.
    for row in conn.execute(
        "SELECT n.code AS code, n.status AS status FROM nodes n "
        "JOIN stages s ON s.id = n.stage_id WHERE s.track = ?", (track.key,)
    ).fetchall():
        if row["code"] not in seen_codes:
            report.warnings.append(
                f"{row['code']}: ноды больше нет в роадмапе, в базе оставлена (статус {row['status']})"
            )

    conn.commit()
    return report


def mark_hub_checkbox(cfg: Config, conn: sqlite3.Connection, code: str, closed: bool) -> bool:
    """Зеркалим статус ноды в чекбокс хаба. Только на запись, читать оттуда нельзя.

    Возвращает True, если файл действительно изменился. В песочнице волт не трогаем.
    """
    if not cfg.write_vault:
        return False
    row = conn.execute(
        "SELECT s.hub_path AS hub FROM nodes n JOIN stages s ON s.id = n.stage_id WHERE n.code = ?",
        (code,),
    ).fetchone()
    if row is None:
        return False
    hub = cfg.vault_root / row["hub"]
    if not hub.is_file():
        return False

    # newline="" сохраняет исходные переводы строк: файл в волте не должен
    # переписываться целиком из-за одной галочки.
    with hub.open("r", encoding="utf-8", newline="") as fh:
        lines = fh.readlines()
    bounds = section_bounds([ln.rstrip("\r\n") for ln in lines])
    if bounds is None:
        return False
    start, end = bounds
    mark = "x" if closed else " "
    changed = False
    for i in range(start, end):
        line = lines[i]
        m = NODE_LINE_RE.match(line)
        if not m or m.group("code") != code:
            continue
        replaced = re.sub(r"^(\s*-\s*)\[[ xX]\]", rf"\g<1>[{mark}]", line, count=1)
        if replaced != line:
            lines[i] = replaced
            changed = True
        break
    if changed:
        with hub.open("w", encoding="utf-8", newline="") as fh:
            fh.write("".join(lines))
    return changed
