// editor.js — минималистичный редактор кода с подсветкой Java.
// Ноль зависимостей: техника «прозрачная textarea поверх подсвеченного <pre>».
// Публичный контракт: createEditor(host, opts), highlightJava(source)
// и highlightSql(source). Язык редактора выбирается opts.lang.

const STYLE_ID = "arena-editor-style";
let stylesInjected = false;

/** Инжектит стили редактора в <head> один раз (флаг + проверка по id на случай нескольких копий модуля). */
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS_TEXT;
  document.head.appendChild(style);
}

const CSS_TEXT = `
.arena-editor {
  --ed-ff: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
  --ed-fs: 13.5px;
  --ed-lh: 1.6;
  --ed-pad-y: 10px;
  --ed-pad-x: 12px;
  position: relative;
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--line, #e3e7ec);
  border-radius: 10px;
  overflow: hidden;
  background: var(--code-bg, #0f172a);
}
.arena-editor, .arena-editor * { box-sizing: border-box; }
.arena-editor:focus-within { outline: 2px solid var(--accent, #3b6fed); outline-offset: 1px; }

.arena-editor .ed-gutter {
  flex: 0 0 auto;
  overflow: hidden;
  user-select: none;
  padding: var(--ed-pad-y) 0;
  text-align: right;
  background: color-mix(in srgb, var(--code-bg, #0f172a) 88%, black);
  border-right: 1px solid color-mix(in srgb, var(--line, #e3e7ec) 22%, transparent);
}
.arena-editor .ed-gline {
  position: relative;
  padding: 0 10px;
  font-family: var(--ed-ff);
  font-size: var(--ed-fs);
  line-height: var(--ed-lh);
  color: color-mix(in srgb, var(--code-ink, #e6edf3) 38%, transparent);
  white-space: pre;
}
.arena-editor .ed-gline--err {
  color: var(--bad, #c33636);
  background: color-mix(in srgb, var(--bad, #c33636) 16%, transparent);
}
.arena-editor .ed-gline--err::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 50%;
  width: 5px;
  height: 5px;
  margin-top: -2px;
  border-radius: 50%;
  background: var(--bad, #c33636);
}

.arena-editor .ed-body {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.arena-editor .ed-errlayer,
.arena-editor .ed-hl,
.arena-editor .ed-input {
  position: absolute;
  inset: 0;
  margin: 0;
  border: 0;
  padding: var(--ed-pad-y) var(--ed-pad-x);
  font-family: var(--ed-ff);
  font-size: var(--ed-fs);
  line-height: var(--ed-lh);
  tab-size: 4;
  -moz-tab-size: 4;
  white-space: pre;
  word-break: normal;
  overflow-wrap: normal;
  letter-spacing: normal;
}

.arena-editor .ed-errlayer { overflow: hidden; pointer-events: none; z-index: 1; }
.arena-editor .ed-eline { height: calc(var(--ed-fs) * var(--ed-lh)); }
.arena-editor .ed-eline--err { background: color-mix(in srgb, var(--bad, #c33636) 14%, transparent); }

.arena-editor .ed-hl {
  overflow: hidden;
  pointer-events: none;
  z-index: 2;
  color: var(--code-ink, #e6edf3);
  background: transparent;
}
.arena-editor .ed-hl code { font: inherit; color: inherit; background: none; padding: 0; }

.arena-editor .ed-input {
  z-index: 3;
  overflow: auto;
  resize: none;
  outline: none;
  background: transparent;
  color: transparent;
  caret-color: var(--code-ink, #e6edf3);
  -webkit-text-fill-color: transparent;
}
.arena-editor .ed-input::selection {
  background: color-mix(in srgb, var(--accent, #3b6fed) 40%, transparent);
  color: transparent;
}
.arena-editor.is-readonly .ed-input { cursor: default; }

.tok-comment { color: var(--muted, #5c6773); font-style: italic; }
.tok-string { color: var(--ok, #1a7f4b); }
.tok-key { color: var(--accent, #3b6fed); font-weight: 600; }
.tok-lit { color: var(--gold, #a9631a); }
.tok-type { color: color-mix(in srgb, var(--code-ink, #e6edf3) 85%, white); }
.tok-annot { color: var(--muted, #5c6773); }
.tok-fn { color: var(--code-ink, #e6edf3); font-weight: 500; }
.tok-punct { color: color-mix(in srgb, var(--code-ink, #e6edf3) 65%, transparent); }
`;

// ---------------------------------------------------------------------------
// Подсветка Java
// ---------------------------------------------------------------------------

const KEYWORDS = [
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "instanceof", "int", "interface", "long", "native", "new",
  "package", "permits", "private", "protected", "public", "record", "return",
  "sealed", "short", "static", "strictfp", "super", "switch", "synchronized",
  "this", "throw", "throws", "transient", "try", "var", "void", "volatile",
  "while", "yield",
];

// Один общий проход: комментарии и строки идут первыми по альтернативе,
// поэтому текст внутри них никогда не попадёт под ключевые слова/типы —
// весь их диапазон поглощается одним совпадением и не пересканируется.
const TOKEN_RE = new RegExp(
  String.raw`(?<comment>//[^\n]*|/\*[\s\S]*?(?:\*/|$))` +
    String.raw`|(?<string>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')` +
    String.raw`|(?<annot>@[A-Za-z_$][A-Za-z0-9_$]*)` +
    "|(?<key>\\b(?:" + KEYWORDS.join("|") + ")\\b)" +
    String.raw`|(?<lit>\b(?:true|false|null)\b|\b0[xX][0-9a-fA-F_]+[lL]?\b|\b0[bB][01_]+[lL]?\b|\b\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?[lLfFdD]?\b)` +
    String.raw`|(?<fn>\b[a-z_$][A-Za-z0-9_$]*(?=\s*\())` +
    String.raw`|(?<type>\b[A-Z][A-Za-z0-9_]*\b)` +
    String.raw`|(?<punct>\{|\}|\(|\)|\[|\]|;|,|\.|[+\-*/%=&|^~!<>?:]+)`,
  "g"
);

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TOKEN_CLASS_BY_GROUP = {
  comment: "tok-comment",
  string: "tok-string",
  annot: "tok-annot",
  key: "tok-key",
  lit: "tok-lit",
  fn: "tok-fn",
  type: "tok-type",
  punct: "tok-punct",
};

/**
 * Подсвечивает Java-исходник и возвращает HTML-строку с <span class="tok-*">.
 * Без побочных эффектов, годится и для статичных фрагментов кода вне редактора.
 */
export function highlightJava(source) {
  if (source == null) return "";
  const src = String(source).replace(/\r\n?/g, "\n");
  if (src === "") return "";

  TOKEN_RE.lastIndex = 0;
  let out = "";
  let last = 0;
  let m;
  while ((m = TOKEN_RE.exec(src))) {
    if (m.index > last) out += escapeHtml(src.slice(last, m.index));
    let cls = null;
    for (const key in m.groups) {
      if (m.groups[key] !== undefined) { cls = TOKEN_CLASS_BY_GROUP[key]; break; }
    }
    const text = m[0];
    out += cls ? '<span class="' + cls + '">' + escapeHtml(text) + "</span>" : escapeHtml(text);
    last = m.index + text.length;
    if (text.length === 0) TOKEN_RE.lastIndex++; // защита от зависания на нулевом совпадении
  }
  if (last < src.length) out += escapeHtml(src.slice(last));
  return out;
}

// ---------------------------------------------------------------------------
// Вспомогательные функции работы со строками текста
// ---------------------------------------------------------------------------

function lineStartOf(val, pos) {
  return val.lastIndexOf("\n", pos - 1) + 1;
}
function lineEndOf(val, pos) {
  const i = val.indexOf("\n", pos);
  return i === -1 ? val.length : i;
}

const OPEN_TO_CLOSE = { "(": ")", "[": "]", "{": "}" };
const CLOSE_CHARS = new Set([")", "]", "}"]);

// ---------------------------------------------------------------------------
// Редактор
// ---------------------------------------------------------------------------

/**
 * Строит редактор внутри host и возвращает EditorHandle.
 * @param {HTMLElement} host пустой контейнер, разметку строит сам модуль
 * @param {object} opts { value, readOnly, onChange, onSave, onRun }
 */
// ---------------------------------------------------------------------------
// Подсветка SQL
// ---------------------------------------------------------------------------

// Слов в SQL много, и почти все они «ключевые». Списком берём то, что реально
// встречается в курсе: и общий стандарт, и то, чем расходятся T-SQL с PostgreSQL, —
// ученик должен видеть чужое слово подсвеченным ровно так же, как своё.
const SQL_KEYWORDS = [
  "add", "all", "alter", "analyze", "and", "any", "as", "asc", "begin", "between",
  "by", "cascade", "case", "cast", "check", "collate", "column", "commit", "concurrently",
  "constraint", "create", "cross", "cube", "current_date", "current_timestamp", "cursor",
  "database", "declare", "default", "deferrable", "delete", "desc", "distinct", "do",
  "drop", "else", "end", "escape", "except", "exclude", "execute", "exists", "explain",
  "fetch", "filter", "first", "following", "for", "foreign", "from", "full", "function",
  "grant", "group", "grouping", "having", "identity", "if", "ilike", "in", "index",
  "inner", "insert", "intersect", "into", "is", "isolation", "join", "key", "last",
  "lateral", "left", "like", "limit", "lock", "materialized", "merge", "natural", "next",
  "not", "nothing", "null", "nulls", "of", "offset", "on", "only", "or", "order", "outer",
  "over", "partition", "preceding", "primary", "procedure", "range", "read", "recursive",
  "references", "refresh", "reindex", "rename", "repeatable", "replace", "restrict",
  "returning", "returns", "revoke", "right", "role", "rollback", "rollup", "row", "rows",
  "savepoint", "schema", "select", "sequence", "serializable", "session", "set", "sets",
  "share", "show", "some", "table", "temp", "temporary", "then", "ties", "to", "top",
  "transaction", "trigger", "truncate", "unbounded", "union", "unique", "unlogged",
  "update", "usage", "using", "vacuum", "values", "view", "when", "where", "window",
  "with", "within", "work", "write",
];

const SQL_TYPES = [
  "bigint", "bit", "boolean", "bytea", "char", "character", "date", "datetime2",
  "decimal", "double", "float", "int", "integer", "interval", "json", "jsonb",
  "money", "numeric", "nvarchar", "precision", "real", "serial", "smallint", "text",
  "time", "timestamp", "timestamptz", "tsvector", "uuid", "varbinary", "varchar", "xml",
];

const SQL_FUNCS = [
  "abs", "avg", "coalesce", "concat", "count", "dateadd", "datediff", "datepart",
  "date_trunc", "dense_rank", "extract", "first_value", "format", "generate_series",
  "getdate", "greatest", "iif", "isnull", "lag", "last_value", "lead", "least", "left",
  "len", "length", "lower", "lpad", "max", "min", "now", "ntile", "nullif", "percentile_cont",
  "position", "rank", "regexp_replace", "replace", "right", "round", "row_number", "rtrim",
  "string_agg", "substring", "sum", "to_char", "to_date", "trim", "try_cast", "upper",
];

// Порядок альтернатив важен: комментарии и строки идут первыми и поглощают
// свой диапазон целиком, поэтому слово SELECT внутри кавычек ключевым не станет.
const SQL_TOKEN_RE = new RegExp(
  String.raw`(?<comment>--[^\n]*|/\*[\s\S]*?(?:\*/|$))` +
    String.raw`|(?<string>'(?:''|[^'])*'|\$\$[\s\S]*?\$\$)` +
    String.raw`|(?<ident>"(?:""|[^"])*"|\[[^\]\n]*\])` +
    String.raw`|(?<var>@[A-Za-z_][A-Za-z0-9_]*|:[A-Za-z_][A-Za-z0-9_]*)` +
    "|(?<key>\\b(?:" + SQL_KEYWORDS.join("|") + ")\\b)" +
    "|(?<type>\\b(?:" + SQL_TYPES.join("|") + ")\\b)" +
    "|(?<fn>\\b(?:" + SQL_FUNCS.join("|") + ")\\b(?=\\s*\\())" +
    String.raw`|(?<lit>\b(?:true|false)\b|\b\d+(?:\.\d+)?\b)` +
    String.raw`|(?<punct>\(|\)|,|;|\.|\*|[+\-/%=<>!|]+)`,
  "gi"
);

/**
 * Подсвечивает SQL и возвращает HTML со <span class="tok-*">.
 * Классы те же, что у Java: тема оформления одна на весь сайт.
 */
export function highlightSql(source) {
  if (source == null) return "";
  const src = String(source).replace(/\r\n?/g, "\n");
  if (src === "") return "";

  SQL_TOKEN_RE.lastIndex = 0;
  let out = "";
  let last = 0;
  let m;
  while ((m = SQL_TOKEN_RE.exec(src))) {
    if (m.index > last) out += escapeHtml(src.slice(last, m.index));
    let cls = null;
    for (const key in m.groups) {
      if (m.groups[key] !== undefined) { cls = SQL_TOKEN_CLASS[key]; break; }
    }
    const text = escapeHtml(m[0]);
    out += cls ? `<span class="${cls}">${text}</span>` : text;
    last = m.index + m[0].length;
    if (m[0].length === 0) SQL_TOKEN_RE.lastIndex++;
  }
  if (last < src.length) out += escapeHtml(src.slice(last));
  return out;
}

const SQL_TOKEN_CLASS = {
  comment: "tok-comment",
  string: "tok-string",
  ident: "tok-string",
  var: "tok-annot",
  key: "tok-key",
  type: "tok-type",
  fn: "tok-fn",
  lit: "tok-lit",
  punct: "tok-punct",
};

export function createEditor(host, opts) {
  if (!host) throw new Error("createEditor: host обязателен");
  injectStyles();

  const o = opts || {};
  const readOnly = !!o.readOnly;
  const onChange = typeof o.onChange === "function" ? o.onChange : null;
  const onSave = typeof o.onSave === "function" ? o.onSave : null;
  const onRun = typeof o.onRun === "function" ? o.onRun : null;
  // Язык подсветки. По умолчанию Java: так было и так остаётся для всех
  // редакторов, которые про язык не спрашивали.
  const paint = o.lang === "sql" ? highlightSql : highlightJava;

  host.innerHTML = "";

  const root = document.createElement("div");
  root.className = "arena-editor" + (readOnly ? " is-readonly" : "");

  const gutter = document.createElement("div");
  gutter.className = "ed-gutter";
  gutter.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "ed-body";

  const errLayer = document.createElement("div");
  errLayer.className = "ed-errlayer";
  errLayer.setAttribute("aria-hidden", "true");

  const pre = document.createElement("pre");
  pre.className = "ed-hl";
  const code = document.createElement("code");
  pre.appendChild(code);

  const textarea = document.createElement("textarea");
  textarea.className = "ed-input";
  textarea.spellcheck = false;
  textarea.autocomplete = "off";
  textarea.autocapitalize = "off";
  textarea.setAttribute("autocorrect", "off");
  textarea.setAttribute("wrap", "off");
  textarea.setAttribute("aria-label", "Редактор кода Java");
  textarea.readOnly = readOnly;

  body.appendChild(errLayer);
  body.appendChild(pre);
  body.appendChild(textarea);
  root.appendChild(gutter);
  root.appendChild(body);
  host.appendChild(root);

  textarea.value = o.value == null ? "" : String(o.value);

  let destroyed = false;
  let errors = [];
  let changeTimer = null;

  function buildErrMap() {
    const map = new Map();
    for (const e of errors) {
      if (!e || typeof e.line !== "number") continue;
      const arr = map.get(e.line) || [];
      arr.push(String(e.message == null ? "" : e.message));
      map.set(e.line, arr);
    }
    return map;
  }

  function renderGutter(lineCount, errMap) {
    let html = "";
    for (let i = 1; i <= lineCount; i++) {
      const msgs = errMap.get(i);
      html += msgs
        ? '<div class="ed-gline ed-gline--err" title="' + escapeHtml(msgs.join("\n")) + '">' + i + "</div>"
        : '<div class="ed-gline">' + i + "</div>";
    }
    gutter.innerHTML = html;
    gutter.style.width = "calc(" + String(lineCount).length + "ch + 20px)";
  }

  function renderErrLayer(lineCount, errMap) {
    let html = "";
    for (let i = 1; i <= lineCount; i++) {
      html += errMap.has(i) ? '<div class="ed-eline ed-eline--err"></div>' : '<div class="ed-eline"></div>';
    }
    errLayer.innerHTML = html;
  }

  function renderAll() {
    const val = textarea.value;
    const lineCount = val.split("\n").length;
    // хвостовой \n нужен только подсвеченному слою: у <pre> высота отстаёт
    // от textarea на пустой последней строке без этого дополнительного перевода.
    code.innerHTML = paint(val + "\n");
    const errMap = buildErrMap();
    renderGutter(lineCount, errMap);
    renderErrLayer(lineCount, errMap);
    syncScroll();
  }

  function syncScroll() {
    const st = textarea.scrollTop;
    const sl = textarea.scrollLeft;
    pre.scrollTop = st;
    pre.scrollLeft = sl;
    errLayer.scrollTop = st;
    gutter.scrollTop = st;
  }

  function setCaret(pos) {
    textarea.selectionStart = textarea.selectionEnd = pos;
  }

  /** Заменяет [start,end) на text через execCommand (живой undo), с фолбэком на прямую подстановку. */
  function replaceRange(start, end, text) {
    textarea.focus();
    textarea.selectionStart = start;
    textarea.selectionEnd = end;
    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch (_e) { ok = false; }
    if (!ok) {
      const val = textarea.value;
      textarea.value = val.slice(0, start) + text + val.slice(end);
      const pos = start + text.length;
      textarea.selectionStart = textarea.selectionEnd = pos;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // --- живые шаблоны ---------------------------------------------------

  /* Короткое слово плюс Tab разворачивается в целую конструкцию — ровно как
     в IDEA. Ученику это экономит не столько нажатия, сколько внимание: пока
     `System.out.println` набирается руками, половина головы занята буквами,
     а не задачей. Курсор ставится туда, где сразу продолжают писать. */
  const SNIPPETS = {
    sout: { text: 'System.out.println();', caret: -2 },
    souf: { text: 'System.out.print();', caret: -2 },
    psvm: { text: 'public static void main(String[] args) {\n\n}', caret: -2 },
    fori: { text: 'for (int i = 0; i < ; i++) {\n\n}', caret: -8 },
  };

  /** Слово прямо перед курсором. Нужно, чтобы понять, разворачивать ли шаблон. */
  function wordBefore(val, pos) {
    let i = pos;
    while (i > 0 && /[A-Za-z]/.test(val[i - 1])) i -= 1;
    return { word: val.slice(i, pos), at: i };
  }

  /** Развернуть шаблон, если слово перед курсором это его имя. */
  function expandSnippet() {
    const start = textarea.selectionStart;
    if (start !== textarea.selectionEnd) return false;
    const val = textarea.value;
    const { word, at } = wordBefore(val, start);
    const snip = SNIPPETS[word];
    if (!snip) return false;
    // Отступ строки сохраняем: шаблон в несколько строк должен встать по месту.
    const lineStart = lineStartOf(val, at);
    const indent = (val.slice(lineStart, at).match(/^\s*/) || [""])[0];
    const body = snip.text.split("\n").map((line, i) => (i ? indent + line : line)).join("\n");
    replaceRange(at, start, body);
    const pos = at + body.length + snip.caret;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  // --- Tab / Shift+Tab -------------------------------------------------

  function handleTab(shift) {
    const val = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end && !shift) {
      replaceRange(start, start, "    ");
      return;
    }

    const blockStart = lineStartOf(val, start);
    const atCol0 = end > blockStart && val[end - 1] === "\n";
    const blockEnd = atCol0 && end > start ? end : lineEndOf(val, end);

    const block = val.slice(blockStart, Math.max(blockStart, blockEnd));
    const lines = block.split("\n");
    const outLines = lines.map((line) => {
      if (!shift) return "    " + line;
      if (line.slice(0, 4) === "    ") return line.slice(4);
      if (line[0] === "\t") return line.slice(1);
      const m = line.match(/^ +/);
      if (m) return line.slice(Math.min(4, m[0].length));
      return line;
    });
    const newBlock = outLines.join("\n");
    replaceRange(blockStart, blockEnd, newBlock);
    textarea.selectionStart = blockStart;
    textarea.selectionEnd = blockStart + newBlock.length;
  }

  // --- Enter: автоотступ -------------------------------------------------

  function handleEnter() {
    const val = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const lineStart = lineStartOf(val, start);
    const beforeCaret = val.slice(lineStart, start);
    const curIndent = (beforeCaret.match(/^[ \t]*/) || [""])[0];
    const endsWithOpenBrace = beforeCaret.replace(/[ \t]+$/, "").endsWith("{");

    let j = end;
    while (j < val.length && (val[j] === " " || val[j] === "\t")) j++;
    const nextIsCloseBrace = val[j] === "}";

    if (endsWithOpenBrace && nextIsCloseBrace) {
      const innerIndent = curIndent + "    ";
      const ins = "\n" + innerIndent + "\n" + curIndent;
      replaceRange(start, j, ins);
      setCaret(start + 1 + innerIndent.length);
      return;
    }

    const ins = endsWithOpenBrace ? "\n" + curIndent + "    " : "\n" + curIndent;
    replaceRange(start, end, ins);
    setCaret(start + ins.length);
  }

  // --- Backspace: удаление пустой пары -----------------------------------

  function handleBackspace() {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end || start === 0) return false;
    const val = textarea.value;
    const before = val[start - 1];
    const after = val[start];
    const isPair =
      (before === "(" && after === ")") ||
      (before === "[" && after === "]") ||
      (before === "{" && after === "}") ||
      (before === '"' && after === '"');
    if (!isPair) return false;
    replaceRange(start - 1, start + 1, "");
    setCaret(start - 1);
    return true;
  }

  // --- Автопарность --------------------------------------------------

  function handleOpenBracket(ch) {
    const close = OPEN_TO_CLOSE[ch];
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end) {
      const selText = textarea.value.slice(start, end);
      replaceRange(start, end, ch + selText + close);
      textarea.selectionStart = start + 1;
      textarea.selectionEnd = start + 1 + selText.length;
      return true;
    }
    replaceRange(start, start, ch + close);
    setCaret(start + 1);
    return true;
  }

  function handleClosePair(ch) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end) return false;
    if (textarea.value[start] !== ch) return false;
    setCaret(start + 1); // перескочить через уже стоящую закрывающую скобку
    return true;
  }

  function handleQuote() {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    if (start !== end) {
      const selText = val.slice(start, end);
      replaceRange(start, end, '"' + selText + '"');
      textarea.selectionStart = start + 1;
      textarea.selectionEnd = start + 1 + selText.length;
      return true;
    }
    if (val[start] === '"') {
      setCaret(start + 1);
      return true;
    }
    replaceRange(start, start, '""');
    setCaret(start + 1);
    return true;
  }

  // --- Обработчики событий -------------------------------------------

  function onInput() {
    renderAll();
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      changeTimer = null;
      if (onChange) onChange(textarea.value);
    }, 150);
  }

  function onKeyDown(e) {
    if (e.isComposing || e.keyCode === 229) return;

    const mod = e.metaKey || e.ctrlKey;

    if (mod && !e.altKey && !e.shiftKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      if (onSave) onSave();
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      if (onRun) onRun();
      return;
    }

    if (readOnly) return;

    if (e.key === "Tab") {
      e.preventDefault();
      // Сначала пробуем развернуть шаблон, и только если не вышло — обычный отступ.
      if (!e.shiftKey && expandSnippet()) return;
      handleTab(e.shiftKey);
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); handleEnter(); return; }
    if (e.key === "Backspace") { if (handleBackspace()) e.preventDefault(); return; }

    if (!mod && !e.altKey) {
      if (e.key === '"') { if (handleQuote()) e.preventDefault(); return; }
      if (OPEN_TO_CLOSE[e.key]) { if (handleOpenBracket(e.key)) e.preventDefault(); return; }
      if (CLOSE_CHARS.has(e.key)) { if (handleClosePair(e.key)) e.preventDefault(); return; }
    }
  }

  textarea.addEventListener("input", onInput);
  textarea.addEventListener("keydown", onKeyDown);
  textarea.addEventListener("scroll", syncScroll);

  renderAll();

  // --- Публичный EditorHandle -----------------------------------------

  return {
    getValue() {
      return textarea.value;
    },
    setValue(text) {
      textarea.value = text == null ? "" : String(text);
      renderAll();
    },
    focus() {
      textarea.focus();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (changeTimer) { clearTimeout(changeTimer); changeTimer = null; }
      textarea.removeEventListener("input", onInput);
      textarea.removeEventListener("keydown", onKeyDown);
      textarea.removeEventListener("scroll", syncScroll);
      host.innerHTML = "";
    },
    markErrors(list) {
      errors = Array.isArray(list) ? list.slice() : [];
      renderAll();
    },
    clearErrors() {
      errors = [];
      renderAll();
    },
    revealLine(n) {
      const val = textarea.value;
      const total = val.split("\n").length;
      const line = Math.min(Math.max(1, n | 0), total);
      const cs = getComputedStyle(textarea);
      const lh = parseFloat(cs.lineHeight) || 20;
      const padTop = parseFloat(cs.paddingTop) || 0;
      const targetTop = padTop + (line - 1) * lh;
      const viewH = textarea.clientHeight;
      const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
      let newTop = targetTop - viewH / 2 + lh / 2;
      newTop = Math.max(0, Math.min(maxScroll, newTop));
      textarea.scrollTop = newTop;
      syncScroll();
    },
  };
}
