"""Схемная валидация сгенерённого и чистка стиля.

Раздел 11 плана: квизы и карточки проверяются схемой, семантику ловит ученик
кнопкой «вопрос кривой». Здесь же живёт правило 14.2: длинные тире и стрелки
в человеческом тексте запрещены. Длинное тире чинится молча (в текстах продукта
роль тире играет обычный дефис), стрелка в прозе это отказ: чинить её,
не переписав фразу, нельзя.

Внутри кода запрет не действует: лямбда со стрелкой это Java, а не текст.
"""

from __future__ import annotations

import re

LONG_DASHES = {"—": "-", "–": "-", "‒": "-", "―": "-", "−": "-"}
ARROWS = "←→↔⇐⇒⇔⟵⟶↦➜➞➡"
SPACES = {" ": " ", " ": " ", " ": " ", "​": ""}

MIN_Q = 10
MIN_EXP = 15
MIN_CARD_BACK = 8
MAX_FRONT = 220


class Bad(ValueError):
    """Запись не прошла схему. Текст исключения уходит в лог как причина."""


def clean(text: str) -> str:
    """Привести человеческий текст к правилам продукта."""
    out = str(text)
    for bad, good in LONG_DASHES.items():
        out = out.replace(bad, good)
    for bad, good in SPACES.items():
        out = out.replace(bad, good)
    out = re.sub(r"[ \t]{2,}", " ", out)
    return out.strip()


def prose(value, name: str, minimum: int = 1) -> str:
    if not isinstance(value, str):
        raise Bad(f"{name}: ожидалась строка, пришло {type(value).__name__}")
    text = clean(value)
    if len(text) < minimum:
        raise Bad(f"{name}: слишком коротко ({len(text)} символов)")
    hit = [ch for ch in ARROWS if ch in text]
    if hit:
        raise Bad(f"{name}: стрелка {hit[0]!r} в тексте, это запрещено правилами продукта")
    return text


def code_block(value, name: str) -> str:
    """Код чистим только от невидимых пробелов: стрелки и тире внутри кода законны."""
    if not isinstance(value, str):
        raise Bad(f"{name}: ожидалась строка, пришло {type(value).__name__}")
    out = value
    for bad, good in SPACES.items():
        out = out.replace(bad, good)
    return out.strip("\n").rstrip()


FENCE_LINE = re.compile(r"^\s*```")


def markdown(value, name: str, minimum: int = 1) -> str:
    """Текст с блоками кода: правила стиля действуют только вне блоков.

    Внутри тройных кавычек лежит Java, и стрелка там законна (лямбда), а тире
    может быть частью строкового литерала. Снаружи работает правило 14.2.
    """
    if not isinstance(value, str):
        raise Bad(f"{name}: ожидалась строка, пришло {type(value).__name__}")
    out: list[str] = []
    inside = False
    for line in str(value).splitlines():
        if FENCE_LINE.match(line):
            inside = not inside
            out.append(line.rstrip())
            continue
        if inside:
            for bad, good in SPACES.items():
                line = line.replace(bad, good)
            out.append(line.rstrip())
            continue
        hit = [ch for ch in ARROWS if ch in line]
        if hit:
            raise Bad(f"{name}: стрелка {hit[0]!r} в тексте, это запрещено правилами продукта")
        # Отступы не трогаем: в markdown они держат вложенные списки.
        for bad, good in LONG_DASHES.items():
            line = line.replace(bad, good)
        for bad, good in SPACES.items():
            line = line.replace(bad, good)
        out.append(line.rstrip())
    if inside:
        raise Bad(f"{name}: блок кода не закрыт тройными кавычками")
    text = "\n".join(out).strip()
    if len(text) < minimum:
        raise Bad(f"{name}: слишком коротко ({len(text)} символов)")
    return text


def options(raw, name: str = "opts") -> list[str]:
    if not isinstance(raw, list):
        raise Bad(f"{name}: ожидался список")
    if len(raw) != 4:
        raise Bad(f"{name}: вариантов должно быть ровно 4, пришло {len(raw)}")
    out = [prose(v, f"{name}[{i}]", 1) for i, v in enumerate(raw)]
    lowered = {v.casefold() for v in out}
    if len(lowered) != 4:
        raise Bad(f"{name}: варианты повторяются")
    return out


def answer(raw, name: str = "ans") -> int:
    if isinstance(raw, bool):
        raise Bad(f"{name}: ожидался номер варианта")
    if isinstance(raw, str) and raw.strip().isdigit():
        raw = int(raw.strip())
    if not isinstance(raw, int):
        raise Bad(f"{name}: ожидался номер варианта, пришло {type(raw).__name__}")
    if not 0 <= raw <= 3:
        raise Bad(f"{name}: номер {raw} вне диапазона 0..3")
    return raw


def level(raw) -> int:
    if isinstance(raw, str) and raw.strip().isdigit():
        raw = int(raw.strip())
    if not isinstance(raw, int) or isinstance(raw, bool):
        return 1
    return max(0, min(2, raw))


def topic(raw, fallback: str) -> str:
    try:
        return prose(raw, "topic", 2)[:60]
    except Bad:
        return clean(fallback)[:60]


def no_future(ctx: dict, **fields: str) -> None:
    """Проверить поля на слова из непройденных нод (см. gen/lexicon.py).

    Проверяются и неверные варианты тоже: ученик читает все четыре, и незнакомый
    термин в третьем сбивает его ровно так же, как в вопросе.
    """
    from . import lexicon

    ban = ctx.get("ban") or []
    if not ban:
        return
    for name, text in fields.items():
        lexicon.check(text, name, ban)


def quiz(raw: dict, ctx: dict) -> dict:
    if not isinstance(raw, dict):
        raise Bad("запись не объект")
    payload = {
        "q": prose(raw.get("q"), "q", MIN_Q),
        "opts": options(raw.get("opts")),
        "ans": answer(raw.get("ans")),
        "exp": prose(raw.get("exp"), "exp", MIN_EXP),
        "topic": topic(raw.get("topic"), ctx.get("node_title", "")),
        "lvl": level(raw.get("lvl")),
        "src": ctx.get("src", "gen"),
    }
    snippet = raw.get("code")
    if isinstance(snippet, str) and snippet.strip():
        payload["code"] = code_block(snippet, "code")
    no_future(ctx, q=payload["q"], opts=" ".join(payload["opts"]), exp=payload["exp"],
              code=payload.get("code", ""))
    return payload


def card(raw: dict, ctx: dict) -> dict:
    if not isinstance(raw, dict):
        raise Bad("запись не объект")
    front = prose(raw.get("front"), "front", 4)
    if len(front) > MAX_FRONT:
        raise Bad(f"front: лицо карточки на {len(front)} символов, это уже конспект")
    back = prose(raw.get("back"), "back", MIN_CARD_BACK)
    no_future(ctx, front=front, back=back)
    return {
        "front": front,
        "back": back,
        "kind": "gen",
        "src": ctx.get("src", "gen"),
        "ctx": topic(raw.get("topic"), ctx.get("node_title", "")),
    }


OUTPUT_WORDS = ("выведет", "напечатает", "вывод", "печатает", "выводит")


def readcode_kind(raw: dict, question: str) -> str:
    """Тип задачи: «что выведет» или «где баг».

    Тип нужен не для красоты: задачи про вывод проверяются запуском (раздел 11),
    и от типа зависит, гоняем сниппет или верим на слово.
    """
    declared = str(raw.get("kind") or "").strip().lower()
    if declared in ("output", "bug"):
        return declared
    low = question.casefold()
    return "output" if any(word in low for word in OUTPUT_WORDS) else "bug"


def readcode(raw: dict, ctx: dict) -> dict:
    if not isinstance(raw, dict):
        raise Bad("запись не объект")
    snippet = code_block(raw.get("code"), "code")
    lang = ctx.get("lang", "java")
    # Двух строк хватает: осмысленный SELECT с условием читается и так, а вот
    # требовать от него трёх строк значит заставлять генератор разводить воду.
    floor = 3 if lang == "java" else 2
    if len(snippet.splitlines()) < floor:
        raise Bad(f"code: сниппет короче {floor} строк, читать нечего")
    question = prose(raw.get("question"), "question", MIN_Q)
    kind = readcode_kind(raw, question)
    if kind == "output" and lang == "java" and ("class " not in snippet or "main(" not in snippet):
        # Такой сниппет нечем проверить объективно, а раздел 11 требует именно
        # проверки прогоном. Ретрай даст компилируемую программу.
        raise Bad("code: для вопроса про вывод нужна целая программа с public class и main")
    if kind == "output" and lang == "sql" and not re.search(r"\bselect\b", snippet, re.I):
        # У SQL «программа целиком» это выполнимый запрос. Без SELECT спрашивать
        # «что вернёт» не о чем.
        raise Bad("code: для вопроса про результат нужен выполнимый запрос с SELECT")
    opts = options(raw.get("opts"))
    exp = prose(raw.get("exp"), "exp", MIN_EXP)
    no_future(ctx, question=question, opts=" ".join(opts), exp=exp, code=snippet)
    return {
        "kind": kind,
        "code": snippet,
        "question": question,
        "opts": opts,
        "ans": answer(raw.get("ans")),
        "exp": exp,
        "topic": topic(raw.get("topic"), ctx.get("node_title", "")),
        "lvl": level(raw.get("lvl")),
        "src": ctx.get("src", "gen"),
    }


# ------------------------------------------------------------------ код-задача

MIN_STATEMENT = 120
MAX_FILES = 4


def java_files(raw, name: str) -> dict[str, str]:
    if not isinstance(raw, dict) or not raw:
        raise Bad(f"{name}: ожидался непустой объект «имя файла: исходник»")
    if len(raw) > MAX_FILES:
        raise Bad(f"{name}: файлов {len(raw)}, это уже не микрозадача")
    out: dict[str, str] = {}
    for key, value in raw.items():
        filename = str(key).strip()
        if not filename.endswith(".java") or "/" in filename:
            raise Bad(f"{name}: имя файла {filename!r} не похоже на файл в дефолтном пакете")
        source = code_block(value, f"{name}[{filename}]")
        if len(source) < 20:
            raise Bad(f"{name}[{filename}]: исходник пустой")
        if re.search(r"^\s*package\s+", source, re.MULTILINE):
            raise Bad(f"{name}[{filename}]: пакеты не поддерживаются, все классы в дефолтном")
        stem = filename[:-len(".java")]
        if re.search(r"public\s+(?:final\s+|abstract\s+|sealed\s+)*(?:class|interface|enum|record)\s+\w+",
                     source) and not re.search(
                rf"public\s+(?:final\s+|abstract\s+|sealed\s+)*(?:class|interface|enum|record)\s+{re.escape(stem)}\b",
                source):
            raise Bad(f"{name}[{filename}]: имя файла не совпадает с public-классом внутри")
        out[filename] = source
    return out


def java_tests(raw, name: str, display_names: bool = False) -> tuple[str, str]:
    source = code_block(raw, name)
    if "@Test" not in source:
        raise Bad(f"{name}: ни одного @Test, это не тесты")
    if "org.junit.jupiter" not in source:
        raise Bad(f"{name}: нужен JUnit 5 (org.junit.jupiter)")
    if re.search(r"^\s*package\s+", source, re.MULTILINE):
        raise Bad(f"{name}: пакеты не поддерживаются")
    classes = re.findall(
        r"^\s*(?:public\s+|final\s+|abstract\s+)*class\s+(\w+)", source, re.MULTILINE)
    if len(classes) != 1:
        raise Bad(f"{name}: нужен ровно один тестовый класс, нашёл {len(classes)}")
    if not classes[0].endswith(("Test", "Tests")):
        raise Bad(f"{name}: имя класса {classes[0]} должно заканчиваться на Test")
    if display_names:
        tests = source.count("@Test")
        titles = len(re.findall(r"@DisplayName\(", source))
        if titles < tests:
            raise Bad(f"{name}: @DisplayName есть у {titles} случаев из {tests}, "
                      f"а ученик видит только их")
    return source, classes[0]


def code_task(raw: dict, ctx: dict) -> dict:
    """Схема код-задачи из раздела 3 плана. Прогон эталона идёт отдельно, в selfcheck."""
    if not isinstance(raw, dict):
        raise Bad("запись не объект")
    starter = java_files(raw.get("starter_files"), "starter_files")
    reference = java_files(raw.get("reference_solution"), "reference_solution")
    if set(starter) != set(reference):
        raise Bad(f"reference_solution: файлы не совпадают со стартовым набором "
                  f"({sorted(reference)} против {sorted(starter)})")
    visible, visible_cls = java_tests(raw.get("visible_tests"), "visible_tests")
    hidden, hidden_cls = java_tests(raw.get("hidden_tests"), "hidden_tests", display_names=True)
    if visible_cls == hidden_cls:
        raise Bad("hidden_tests: тестовый класс называется так же, как видимый")
    hints = raw.get("checkstyle_hints")
    if not isinstance(hints, list):
        hints = []
    title = prose(raw.get("title"), "title", 4)
    statement = markdown(raw.get("statement_md"), "statement_md", MIN_STATEMENT)
    no_future(ctx, title=title, statement_md=statement)
    return {
        "title": title,
        "statement_md": statement,
        "difficulty": max(0, min(2, level(raw.get("difficulty")))),
        "starter_files": starter,
        "visible_tests": visible,
        "hidden_tests": hidden,
        "reference_solution": reference,
        "checkstyle_hints": [prose(h, "checkstyle_hints", 4) for h in hints[:5]],
        "src": ctx.get("src", "gen"),
    }


# ------------------------------------------------------------------ конспект

MIN_GOAL = 80
MIN_THESIS = 25
MIN_WALK = 120
MIN_THESES = 4
MAX_THESES = 12


def note(raw: dict, ctx: dict) -> dict:
    """Конспект Obsidian. Файл из этих полей собирает gen/notes.py."""
    if not isinstance(raw, dict):
        raise Bad("запись не объект")
    theses_raw = raw.get("theses")
    if not isinstance(theses_raw, list):
        raise Bad("theses: ожидался список тезисов")
    theses = [prose(t, f"theses[{i}]", MIN_THESIS) for i, t in enumerate(theses_raw[:MAX_THESES])]
    if len(theses) < MIN_THESES:
        raise Bad(f"theses: тезисов {len(theses)}, для конспекта мало")
    walk = markdown(raw.get("walkthrough_md"), "walkthrough_md", MIN_WALK)
    if "```" not in walk:
        raise Bad("walkthrough_md: в мини-разборе нет ни одного блока кода")
    links_raw = raw.get("links")
    links = [clean(str(v))[:120] for v in links_raw[:8]] if isinstance(links_raw, list) else []
    stars = raw.get("stars")
    if isinstance(stars, str) and stars.strip().isdigit():
        stars = int(stars.strip())
    if not isinstance(stars, int) or isinstance(stars, bool):
        stars = 3
    return {
        "goal": prose(raw.get("goal"), "goal", MIN_GOAL),
        "theses": theses,
        "walkthrough_md": walk,
        "links": [link for link in links if link],
        "stars": max(1, min(5, stars)),
        "src": ctx.get("src", "gen"),
    }


def article(raw: dict, ctx: dict) -> dict:
    if not isinstance(raw, dict):
        raise Bad("запись не объект")
    url = str(raw.get("url") or "").strip()
    if not url.startswith(("http://", "https://")):
        raise Bad("url: ожидалась ссылка http или https")
    quiz_raw = raw.get("quiz")
    if not isinstance(quiz_raw, list) or len(quiz_raw) != 5:
        raise Bad(f"quiz: по статье нужно ровно 5 вопросов, пришло "
                  f"{len(quiz_raw) if isinstance(quiz_raw, list) else 'не список'}")
    questions = []
    for i, item in enumerate(quiz_raw):
        if not isinstance(item, dict):
            raise Bad(f"quiz[{i}]: запись не объект")
        questions.append({
            "q": prose(item.get("q"), f"quiz[{i}].q", MIN_Q),
            "opts": options(item.get("opts"), f"quiz[{i}].opts"),
            "ans": answer(item.get("ans"), f"quiz[{i}].ans"),
            "exp": clean(str(item.get("exp") or "")),
        })
    return {
        "url": url,
        "title": prose(raw.get("title"), "title", 4),
        "why_md": prose(raw.get("why_md"), "why_md", 20),
        "lang": "ru" if str(raw.get("lang", "")).lower().startswith("ru") else "en",
        "quiz": questions,
        "src": ctx.get("src", "gen"),
    }


VALIDATORS = {
    "quiz": quiz,
    "cards": card,
    "readcode": readcode,
    "article": article,
    "code": code_task,
    "note": note,
}


def items(kind: str, data: dict, ctx: dict) -> tuple[list[dict], list[str]]:
    """Разобрать ответ модели в список записей банка.

    Возвращает готовые payload'ы и список причин, по которым что-то не взяли.
    Пустой список записей при непустом ответе это тоже невалид: разбираться,
    почему модель прислала мусор, будем по сырому логу.
    """
    check = VALIDATORS.get(kind)
    if check is None:
        raise Bad(f"нет валидатора для жанра {kind!r}")
    raw_items = data.get("items")
    if not isinstance(raw_items, list):
        why = str(data.get("why") or "").strip()
        raise Bad("в ответе нет списка items" + (f" (модель написала: {why[:200]})" if why else ""))
    good: list[dict] = []
    bad: list[str] = []
    for i, raw in enumerate(raw_items):
        try:
            good.append(check(raw, ctx))
        except Bad as exc:
            bad.append(f"запись {i}: {exc}")
    return good, bad
