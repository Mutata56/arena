"""Разбор JS-литерала из HTML-тестов.

Вопросы в тестах лежат массивом `const DATA = [{n:1,lvl:0,topic:"...",q:"...",...}]`.
Это не JSON: ключи без кавычек, в строках попадаются экранированные переводы строк
и код. Поэтому сканер, а не регулярка с json.loads.
"""

from __future__ import annotations

import re

NUMBER_RE = re.compile(r"-?\d+(\.\d+)?([eE][+-]?\d+)?")
IDENT_RE = re.compile(r"[A-Za-z_$][\w$]*")
ESCAPES = {
    "n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f",
    '"': '"', "'": "'", "\\": "\\", "/": "/", "\n": "",
}


class JSLiteralError(ValueError):
    pass


class Scanner:
    def __init__(self, text: str, pos: int = 0):
        self.text = text
        self.pos = pos

    def skip_space(self) -> None:
        while self.pos < len(self.text) and self.text[self.pos] in " \t\r\n":
            self.pos += 1

    def value(self):
        self.skip_space()
        if self.pos >= len(self.text):
            raise JSLiteralError("литерал оборвался")
        ch = self.text[self.pos]
        if ch == "{":
            return self.obj()
        if ch == "[":
            return self.array()
        if ch in "\"'":
            return self.string()
        if ch == "`":
            return self.template()
        m = NUMBER_RE.match(self.text, self.pos)
        if m:
            self.pos = m.end()
            raw = m.group(0)
            return float(raw) if ("." in raw or "e" in raw.lower()) else int(raw)
        for lit, val in (("true", True), ("false", False), ("null", None), ("undefined", None)):
            if self.text.startswith(lit, self.pos):
                self.pos += len(lit)
                return val
        raise JSLiteralError(f"непонятный символ {ch!r} на позиции {self.pos}")

    def obj(self) -> dict:
        self.pos += 1
        out: dict = {}
        while True:
            self.skip_space()
            ch = self.text[self.pos]
            if ch == "}":
                self.pos += 1
                return out
            if ch == ",":
                self.pos += 1
                continue
            if ch in "\"'":
                key = self.string()
            else:
                m = IDENT_RE.match(self.text, self.pos)
                if not m:
                    raise JSLiteralError(f"ждал ключ на позиции {self.pos}")
                key = m.group(0)
                self.pos = m.end()
            self.skip_space()
            if self.text[self.pos] != ":":
                raise JSLiteralError(f"ждал двоеточие на позиции {self.pos}")
            self.pos += 1
            out[key] = self.value()

    def array(self) -> list:
        self.pos += 1
        out: list = []
        while True:
            self.skip_space()
            ch = self.text[self.pos]
            if ch == "]":
                self.pos += 1
                return out
            if ch == ",":
                self.pos += 1
                continue
            out.append(self.value())

    def string(self) -> str:
        quote = self.text[self.pos]
        self.pos += 1
        buf: list[str] = []
        while True:
            ch = self.text[self.pos]
            if ch == "\\":
                nxt = self.text[self.pos + 1]
                if nxt == "u":
                    code = int(self.text[self.pos + 2 : self.pos + 6], 16)
                    self.pos += 6
                    # Эмодзи в JS это пара суррогатов. Одиночный суррогат не кодируется
                    # в utf-8 и уронил бы весь импорт, поэтому склеиваем пару, а хвост
                    # без пары заменяем на вопросительный знак.
                    if 0xD800 <= code <= 0xDBFF and self.text.startswith("\\u", self.pos):
                        low = int(self.text[self.pos + 2 : self.pos + 6], 16)
                        if 0xDC00 <= low <= 0xDFFF:
                            self.pos += 6
                            code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
                    buf.append("?" if 0xD800 <= code <= 0xDFFF else chr(code))
                else:
                    buf.append(ESCAPES.get(nxt, nxt))
                    self.pos += 2
                continue
            if ch == quote:
                self.pos += 1
                return "".join(buf)
            buf.append(ch)
            self.pos += 1

    def template(self) -> str:
        self.pos += 1
        buf: list[str] = []
        while True:
            ch = self.text[self.pos]
            if ch == "\\":
                buf.append(ESCAPES.get(self.text[self.pos + 1], self.text[self.pos + 1]))
                self.pos += 2
                continue
            if ch == "`":
                self.pos += 1
                return "".join(buf)
            buf.append(ch)
            self.pos += 1


def parse_array(text: str, name: str = "DATA") -> list:
    """Найти `const <name> = [...]` и разобрать массив."""
    m = re.search(rf"(?:const|let|var)\s+{re.escape(name)}\s*=\s*\[", text)
    if not m:
        raise JSLiteralError(f"не нашёл массив {name}")
    return Scanner(text, m.end() - 1).array()


def parse_objects(text: str, name: str = "DATA") -> tuple[list, int]:
    """Аварийный разбор: собрать столько объектов, сколько получится.

    Нужен, если файл побился или в массив попало что-то незнакомое: терять из-за
    одного кривого вопроса весь файл на сотню вопросов не хочется.
    Возвращает список объектов и число пропущенных мест.
    """
    m = re.search(rf"(?:const|let|var)\s+{re.escape(name)}\s*=\s*\[", text)
    if not m:
        raise JSLiteralError(f"не нашёл массив {name}")
    out: list = []
    skipped = 0
    pos = m.end()
    while True:
        start = text.find("{", pos)
        if start == -1:
            return out, skipped
        scanner = Scanner(text, start)
        try:
            out.append(scanner.obj())
            pos = scanner.pos
        except Exception:  # noqa: BLE001
            skipped += 1
            pos = start + 1
        # Дальше конца массива не идём: закрывающая скобка верхнего уровня.
        tail = text[pos : pos + 40].lstrip()
        if tail.startswith("]"):
            return out, skipped
