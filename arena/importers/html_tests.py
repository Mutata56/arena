"""Импорт 14 HTML-тестов из папки Загрузки в банк квизов.

Каждый вопрос становится items.type='quiz'. Естественный ключ это хеш содержимого,
поэтому повторный импорт и переименованные копии файлов не плодят дублей.

Привязка к нодам консервативная: если по названию ноды не видно уверенного
попадания, вопрос остаётся на уровне этапа (node_id NULL) и работает как общий пул
для блоков повторения и боссов.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from ..config import Config
from ..db import now
from .jsliteral import parse_array, parse_objects

# Порядок важен: «перегрузка методов» должна поймать «перегрузк» раньше «метод».
FILE_RULES: list[tuple[str, int, tuple[int, ...]]] = [
    (r"hashmap|хеш-таблиц", 7, (7,)),
    (r"arraylist|linkedlist|коллекц", 7, (7,)),
    (r"дженерик|generic", 6, (6,)),
    (r"вложенн", 3, (3,)),
    (r"перегрузк", 2, (2, 3)),
    (r"строк", 4, (4, 2)),
    (r"switch", 2, (2, 3)),
    (r"массив", 2, (2,)),
    (r"услови|цикл", 2, (2,)),
    (r"метод", 2, (2,)),
    (r"оператор", 2, (2,)),
    (r"переменн", 2, (2,)),
]

# Ноды, которым квиз не нужен: закрываются самоотметкой или кодом.
NON_QUIZ_KINDS = ("рукописная", "чтение JDK", "проект", "повторение")

STOPWORDS = {
    "для", "как", "что", "это", "его", "или", "под", "над", "при", "без", "два", "три",
    "она", "они", "все", "как-то", "чем", "они", "тип", "типы", "java", "работы", "работа",
    "зачем", "нужны", "нужен", "основы", "изнутри", "практика", "тест", "сессия",
    "рукописная", "повторение", "проект", "итоговый", "этапа", "своими", "руками",
}

TOKEN_RE = re.compile(r"[a-zA-Zа-яА-ЯёЁ0-9_]+")

# Порог уверенности: ниже него вопрос остаётся на уровне этапа.
MIN_SCORE = 2.2
LEAD_RATIO = 1.25
# Больше блока вопросов на ноду не нужно: излишек уходит в общий пул этапа.
NODE_CAP = 14

# Хвосты русских слов режем, чтобы «типы» и «типов» считались одним словом.
SUFFIXES = (
    "ами", "ями", "ого", "ему", "ыми", "ими", "ов", "ев", "ий", "ый", "ая", "ое",
    "ые", "ых", "ам", "ям", "ах", "ях", "ом", "ем", "ей", "ой", "ую", "юю", "ия",
    "а", "о", "е", "у", "ю", "я", "ы", "и", "ь",
)


@dataclass
class ImportReport:
    files: int = 0
    parsed: int = 0
    added: int = 0
    existing: int = 0
    duplicates: int = 0
    bound_to_node: int = 0
    stage_only: int = 0
    skipped: list[str] = field(default_factory=list)
    per_file: list[tuple[str, int, int, int]] = field(default_factory=list)

    def render(self) -> str:
        lines = [
            f"файлов: {self.files}, вопросов разобрано: {self.parsed}",
            f"добавлено: {self.added}, уже было: {self.existing}, дублей внутри импорта: {self.duplicates}",
            f"привязано к нодам: {self.bound_to_node}, на уровне этапа: {self.stage_only}",
        ]
        for name, total, bound, added in self.per_file:
            lines.append(f"  {name[:58]:60s} вопросов {total:4d}, к нодам {bound:4d}, новых {added:4d}")
        if self.skipped:
            lines.append("пропущено:")
            lines.extend("  " + s for s in self.skipped)
        return "\n".join(lines)


def stem(token: str) -> str:
    if token.isascii():
        return token
    for suffix in SUFFIXES:
        if len(token) - len(suffix) >= 4 and token.endswith(suffix):
            token = token[: -len(suffix)]
            break
    return token[:6]


def normalize(text: str) -> list[str]:
    text = text.lower().replace("ё", "е")
    out = []
    for token in TOKEN_RE.findall(text):
        if len(token) < 3 or token in STOPWORDS:
            continue
        out.append(stem(token))
    return out


def stage_for_file(name: str) -> tuple[int, tuple[int, ...]] | None:
    low = name.lower().replace("ё", "е")
    for pattern, primary, candidates in FILE_RULES:
        if re.search(pattern, low):
            return primary, candidates
    return None


class NodeMatcher:
    """Скоринг по названиям нод: редкое слово весит больше частого."""

    def __init__(self, conn: sqlite3.Connection, stage_nums: tuple[int, ...]):
        rows = conn.execute(
            "SELECT n.id, n.code, n.title, n.kind, s.num AS stage_num "
            "FROM nodes n JOIN stages s ON s.id = n.stage_id "
            f"WHERE s.num IN ({','.join('?' * len(stage_nums))}) "
            f"AND n.kind NOT IN ({','.join('?' * len(NON_QUIZ_KINDS))}) "
            "ORDER BY n.code",
            (*stage_nums, *NON_QUIZ_KINDS),
        ).fetchall()
        self.nodes = [
            {"id": r["id"], "code": r["code"], "title": r["title"], "tokens": set(normalize(r["title"]))}
            for r in rows
        ]
        # Сколько вопросов уже лежит на ноде: лимит считаем от всего банка, не от прогона.
        self.taken: dict[int, int] = {
            r["node_id"]: r["c"]
            for r in conn.execute(
                "SELECT node_id, COUNT(*) c FROM items WHERE type = 'quiz' AND node_id IS NOT NULL "
                "GROUP BY node_id"
            ).fetchall()
        }
        total = max(len(self.nodes), 1)
        freq: dict[str, int] = {}
        for node in self.nodes:
            for token in node["tokens"]:
                freq[token] = freq.get(token, 0) + 1
        self.idf = {t: math.log(total / c) + 0.4 for t, c in freq.items()}

    def match(self, topic: str, question: str) -> tuple[int | None, str | None]:
        """Тема вопроса решает, тело вопроса только усиливает.

        Если ни одно слово темы не встретилось в названии ноды, привязки нет:
        иначе вопрос про массивы уезжает в ноду «Стиль кода» из-за слова «кода».
        """
        if not self.nodes:
            return None, None
        topic_tokens = set(normalize(topic))
        if not topic_tokens:
            return None, None
        weights: dict[str, float] = {}
        for token in topic_tokens:
            weights[token] = weights.get(token, 0) + 2.0
        for token in normalize(question):
            weights[token] = weights.get(token, 0) + 1.0

        scored = []
        for node in self.nodes:
            if not (node["tokens"] & topic_tokens):
                continue
            score = sum(weights.get(t, 0) * self.idf.get(t, 1.0) for t in node["tokens"])
            if score > 0:
                scored.append((score, node))
        if not scored:
            return None, None
        scored.sort(key=lambda x: (-x[0], x[1]["code"]))
        best_score, best = scored[0]
        if best_score < MIN_SCORE:
            return None, None
        if len(scored) > 1 and scored[1][0] * LEAD_RATIO > best_score:
            return None, None
        if self.taken.get(best["id"], 0) >= NODE_CAP:
            return None, None
        self.taken[best["id"]] = self.taken.get(best["id"], 0) + 1
        return best["id"], best["code"]


def content_key(item: dict) -> str:
    raw = json.dumps(
        [item.get("q", ""), item.get("opts", []), item.get("ans"), item.get("code", "")],
        ensure_ascii=False, sort_keys=True,
    )
    return "html:" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def valid(item: dict) -> bool:
    opts = item.get("opts")
    ans = item.get("ans")
    return (
        isinstance(item.get("q"), str) and item["q"].strip() != ""
        and isinstance(opts, list) and len(opts) >= 2
        and all(isinstance(o, str) for o in opts)
        and isinstance(ans, int) and 0 <= ans < len(opts)
        and isinstance(item.get("exp", ""), str)
    )


def run(conn: sqlite3.Connection, cfg: Config, archive: bool = True) -> ImportReport:
    report = ImportReport()
    files = sorted(cfg.downloads_dir.glob("Тест Java - *.html"))
    if not files:
        report.skipped.append(f"в {cfg.downloads_dir} нет файлов «Тест Java - *.html»")
        return report

    stage_ids = {r["num"]: r["id"] for r in conn.execute("SELECT num, id FROM stages")}
    if not stage_ids:
        raise SystemExit("сначала arena sync: в базе нет этапов")

    matchers: dict[tuple[int, ...], NodeMatcher] = {}
    seen_keys: set[str] = set()
    stamp = now()

    for path in files:
        rule = stage_for_file(path.name)
        if rule is None:
            report.skipped.append(f"{path.name}: не понял, к какому этапу отнести")
            continue
        primary, candidates = rule
        text = path.read_text(encoding="utf-8", errors="replace")
        try:
            data = parse_array(text)
        except Exception as exc:  # noqa: BLE001
            # Файл побился: спасаем то, что читается, вместо потери всей сотни вопросов.
            try:
                data, lost = parse_objects(text)
            except Exception as exc2:  # noqa: BLE001
                report.skipped.append(f"{path.name}: не разобрал ({exc2})")
                continue
            report.skipped.append(
                f"{path.name}: массив читается частично ({exc}), спасено вопросов {len(data)}, "
                f"пропущено мест {lost}"
            )

        if candidates not in matchers:
            matchers[candidates] = NodeMatcher(conn, candidates)
        matcher = matchers[candidates]

        file_total = file_bound = file_added = 0
        report.files += 1

        for raw in data:
            if not isinstance(raw, dict) or not valid(raw):
                continue
            report.parsed += 1
            file_total += 1
            key = content_key(raw)
            node_id, node_code = matcher.match(str(raw.get("topic", "")), str(raw.get("q", "")))
            stage_id = stage_ids[primary]
            if node_id is not None:
                row = conn.execute(
                    "SELECT s.id AS sid FROM nodes n JOIN stages s ON s.id = n.stage_id WHERE n.id = ?",
                    (node_id,),
                ).fetchone()
                stage_id = row["sid"]

            payload = {
                "q": raw["q"],
                "opts": raw["opts"],
                "ans": raw["ans"],
                "exp": raw.get("exp", ""),
                "topic": raw.get("topic", ""),
                "lvl": int(raw.get("lvl", 0)),
                "src": path.stem,
            }
            if raw.get("code"):
                payload["code"] = raw["code"]

            if key in seen_keys:
                # Один и тот же вопрос встречается в двух файлах: это дубль импорта,
                # а не «уже было в базе».
                report.duplicates += 1
                continue
            seen_keys.add(key)
            exists = conn.execute("SELECT id FROM items WHERE source_key = ?", (key,)).fetchone()
            if exists:
                report.existing += 1
                continue
            try:
                conn.execute(
                    "INSERT INTO items(node_id, stage_id, type, payload, difficulty, source, "
                    "source_key, active, created) VALUES (?, ?, 'quiz', ?, ?, 'import', ?, 1, ?)",
                    (node_id, stage_id, json.dumps(payload, ensure_ascii=False),
                     int(raw.get("lvl", 0)), key, stamp),
                )
            except sqlite3.IntegrityError:
                report.existing += 1
                continue
            report.added += 1
            file_added += 1
            if node_id is not None:
                report.bound_to_node += 1
                file_bound += 1
            else:
                report.stage_only += 1
        report.per_file.append((path.name, file_total, file_bound, file_added))

        if archive:
            cfg.import_archive.mkdir(parents=True, exist_ok=True)
            target = cfg.import_archive / path.name
            if not target.exists() or target.stat().st_size != path.stat().st_size:
                shutil.copy2(path, target)

    conn.commit()
    return report
