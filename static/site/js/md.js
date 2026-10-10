/* Разбор диалекта Obsidian, на котором написан волт.

   Волт устроен предсказуемо, и парсер написан ровно под него, а не «вообще под
   markdown»: фронтматтера нет, метаданные лежат в первых строках, заголовки
   только H1 и H2, спойлеры это callout-ы вида > [!success]-, карточки это строки
   с разделителем ::, ссылки только вида [[Имя]] и [[Имя|текст]].

   Наружу отдаём не HTML, а блоки. Так статья может встроить между ними вопросы
   и схемы, а не искать место регуляркой по готовой строке. */

const CALLOUT_RE = /^\[!(\w+)\]([+-]?)\s*(.*)$/;
const META_RE = /\*\*(Этап|Тип|Сложность|До|После):\*\*\s*([^|]+)/g;
const WIKI_RE = /\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]/g;
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/** Для значения атрибута мало экранировать угловые скобки: кавычки закроют его раньше. */
export function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------------------------------------------------------------- строки */

/** Инлайновая разметка. Код защищаем плейсхолдером: внутри него ничего не трогаем. */
export function inline(text, opts = {}) {
  const code = [];
  let out = String(text ?? "").replace(/`([^`]+)`/g, (_, body) => {
    code.push(body);
    return `\uE000${code.length - 1}\uE001`;
  });
  out = escapeHtml(out);

  out = out.replace(WIKI_RE, (_, name, alias) => {
    const target = name.trim();
    const label = escapeHtml((alias || target).trim());
    if (opts.plain) return label;
    return `<a class="wl" href="#/wiki/${encodeURIComponent(target)}" data-wiki="${escapeHtml(target)}">${label}</a>`;
  });
  out = out.replace(LINK_RE, (_, label, href) =>
    `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`);

  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(«"'])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  return out.replace(/\uE000(\d+)\uE001/g, (_, i) =>
    opts.plain ? code[Number(i)] : `<code>${escapeHtml(code[Number(i)])}</code>`);
}

/** Тот же текст, но без разметки: для оглавления, поиска и сопоставления с вопросами. */
export function plain(text) {
  return inline(text, { plain: true }).replace(/<[^>]+>/g, "");
}

/* ---------------------------------------------------------------- шапка */

function readHead(lines) {
  const meta = { tags: [], stage: null, stageAlias: "", type: "", difficulty: 0, prev: null, next: null };
  let i = 0;
  while (i < lines.length && i < 8) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (line.startsWith("# ")) break;
    // Строка тегов. Лидирующая обратная кавычка это опечатка автора (есть в 1.04),
    // из-за неё шапка когда-то переставала читаться целиком.
    if (/^`?#[^\s#]/.test(line)) {
      meta.tags = line.replace(/^`/, "").split(/\s+/)
        .filter((t) => t.startsWith("#")).map((t) => t.slice(1));
      i++; continue;
    }
    if (line.includes("**Этап:**") || line.includes("**Тип:**") || line.includes("**До:**")) {
      let m;
      META_RE.lastIndex = 0;
      while ((m = META_RE.exec(line))) {
        const key = m[1];
        const value = m[2].trim();
        const wiki = /\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]/.exec(value);
        if (key === "Этап" && wiki) { meta.stage = wiki[1].trim(); meta.stageAlias = (wiki[2] || "").trim(); }
        if (key === "Тип") meta.type = value.replace(/\*+/g, "").trim();
        if (key === "Сложность") meta.difficulty = (value.match(/★/g) || []).length;
        if (key === "До" && wiki) meta.prev = wiki[1].trim();
        if (key === "После" && wiki) meta.next = wiki[1].trim();
      }
      i++; continue;
    }
    // Незнакомая строка в шапке не должна обрывать разбор: пропускаем и идём дальше.
    i++;
  }
  return { meta, at: i };
}

/* ---------------------------------------------------------------- блоки */

function isTableRow(line) { return /^\s*\|.*\|\s*$/.test(line); }
function isTableRule(line) { return /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes("-"); }

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "")
    // экранированный пайп внутри викилинка в таблицах волта
    .split(/(?<!\\)\|/).map((cell) => cell.trim());
}

/** Разобрать плоский список строк в блоки. Используется и для тела callout-а. */
function parseBlocks(lines, ctx) {
  const blocks = [];
  let i = 0;
  const flushPara = (buf) => {
    if (!buf.length) return;
    blocks.push({ t: "p", text: buf.join("\n") });
    buf.length = 0;
  };
  const para = [];

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const trimmed = line.trim();

    // фенс
    // Язык фенса может быть и demo_user: у нас это ```задача.
    const fence = /^\s*```([^\s`]*)\s*$/.exec(line);
    if (fence) {
      flushPara(para);
      const lang = fence[1] || "";
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { body.push(lines[i]); i++; }
      i++;
      if (lang === "задача") {
        blocks.push(miniTask(body));
      } else if (lang === "перестановка") {
        blocks.push(reorderTask(body));
      } else if (lang === "терминал") {
        blocks.push(terminalTask(body));
      } else if (lang === "запрос") {
        blocks.push(sqlTask(body));
      } else if (lang === "сценарий") {
        blocks.push(sqlScenario(body));
      } else if (lang === "картинка") {
        blocks.push(picture(body));
      } else {
        blocks.push({ t: lang ? "code" : "out", lang, text: body.join("\n") });
      }
      continue;
    }

    if (!trimmed) { flushPara(para); i++; continue; }

    // Якорь расстановки: %%вопросы: подпись, psvm%%. Для Obsidian это комментарий,
    // в волте он не виден, а нам это способ сказать «вопрос про подпись ставь
    // сюда» там, где автоматика по словарю промахивается.
    const anchor = /^%%\s*вопросы:\s*(.+?)\s*%%$/i.exec(trimmed);
    if (anchor) {
      flushPara(para);
      const keys = anchor[1].split(/\s*,\s*/).map((k) => k.trim().toLowerCase()).filter(Boolean);
      if (keys.length) blocks.push({ t: "qanchor", keys });
      i++; continue;
    }

    // Тот же приём для схемы: %%схема: front-back%% ставит её ровно сюда,
    // а не в конец секции. Нужно, когда схема объясняет конкретный абзац.
    const dia = /^%%\s*схема:\s*([\w-]+)\s*%%$/i.exec(trimmed);
    if (dia) {
      flushPara(para);
      blocks.push({ t: "diaganchor", id: dia[1] });
      i++; continue;
    }

    // заголовки
    const head = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (head && head[1].length >= 2) {
      flushPara(para);
      const level = head[1].length;
      ctx.n += 1;
      blocks.push({ t: "h", level, text: head[2].trim(), id: `s${ctx.n}` });
      i++; continue;
    }
    if (head && head[1].length === 1) { flushPara(para); i++; continue; }

    if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) { flushPara(para); blocks.push({ t: "hr" }); i++; continue; }

    // цитата или callout
    if (trimmed.startsWith(">")) {
      flushPara(para);
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      const first = (body[0] || "").trim();
      const co = CALLOUT_RE.exec(first);
      if (co) {
        blocks.push({
          t: "callout",
          kind: co[1].toLowerCase(),
          folded: co[2] === "-",
          title: co[3].trim(),
          blocks: parseBlocks(body.slice(1), ctx),
        });
      } else {
        blocks.push({ t: "quote", blocks: parseBlocks(body, ctx) });
      }
      continue;
    }

    // таблица
    if (isTableRow(line) && isTableRule(lines[i + 1] || "")) {
      flushPara(para);
      const head2 = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      blocks.push({ t: "table", head: head2, rows });
      continue;
    }

    // списки
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara(para);
      const ordered = Boolean(numbered);
      const start = ordered ? Number(numbered[1]) : 1;
      const items = [];
      while (i < lines.length) {
        const cur = lines[i];
        const b = /^\s*[-*+]\s+(.*)$/.exec(cur);
        const n = /^\s*(\d+)\.\s+(.*)$/.exec(cur);
        if (ordered ? !n : !b) {
          // продолжение пункта: строка с отступом и без своего маркера
          if (items.length && /^\s{2,}\S/.test(cur) && cur.trim()) {
            items[items.length - 1].text += `\n${cur.trim()}`;
            i++; continue;
          }
          break;
        }
        const text = ordered ? n[2] : b[1];
        const box = /^\[([ xX])\]\s+(.*)$/.exec(text);
        items.push(box
          ? { text: box[2], check: true, done: box[1].toLowerCase() === "x" }
          : { text });
        i++;
      }
      const checks = items.length > 0 && items.every((it) => it.check);
      blocks.push({ t: "list", ordered, start, checks, items });
      continue;
    }

    // карточки: «вопрос :: ответ» одной строкой
    if (trimmed.includes(" :: ")) {
      flushPara(para);
      const items = [];
      while (i < lines.length && lines[i].includes(" :: ")) {
        const [front, ...rest] = lines[i].split(" :: ");
        items.push({ front: front.trim(), back: rest.join(" :: ").trim() });
        i++;
      }
      blocks.push({ t: "cards", items });
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara(para);
  return blocks;
}


/** Заявка на растровую иллюстрацию.

    ```картинка
    id: 1.031-zapiska
    где: раздел «Зачем», после абзаца про микроволновку
    смысл: что показать читателю
    промпт: описание сцены для ComfyUI, без текста и надписей
    alt: короткая подпись
    ```

    Читателю показывается сама картинка из `img/<id>.png`, а если её ещё не
    нарисовали - аккуратная заглушка с подписью. Промпт и «где» это записка
    художнику: они остаются в волте и на страницу не попадают никогда. */
function picture(body) {
  const pic = { t: "picture", id: "", alt: "", meaning: "" };
  for (const line of body) {
    const kv = /^\s*([^:]+):\s*(.+?)\s*$/.exec(line);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase();
    if (key === "id") pic.id = kv[2];
    else if (key === "alt") pic.alt = kv[2];
    else if (key === "смысл") pic.meaning = kv[2];
  }
  if (!pic.alt) pic.alt = pic.meaning;
  return pic;
}


/** Мини-задача прямо в конспекте: условие, стартовый файл и ожидаемый вывод.

    ```задача
    id: steps
    title: Три шага
    <условие в markdown>
    ---файл Steps.java
    public class Steps { ... }
    ---вывод
    Раз
    Два
    ```
    Проверка простая: собрать, запустить и сравнить напечатанное с ожидаемым.
    JUnit тут не нужен, а на первых нодах и вреден: ученик знает только println. */
/** Блок ```терминал```: настоящая командная строка внутри статьи.

    Нужен ровно там, где важно, что javac и java это ДВА шага, а между ними на
    диске появляется .class. Кнопка «запустить», которая делает всё сразу, эту
    мысль и убивает — здесь человек набирает команды сам и видит, что вышло. */
function terminalTask(lines) {
  const task = { t: "terminal", id: "", title: "терминал", statement: [], files: {},
                 need: [], probe: [] };
  let mode = "head";
  let file = null;
  for (const raw of lines) {
    const trimmed = raw.trim();
    const mFile = /^---\s*файл\s+(\S+)\s*$/.exec(trimmed);
    if (mFile) { mode = "file"; file = mFile[1]; task.files[file] = []; continue; }
    if (/^---\s*нужно\s*$/.test(trimmed)) { mode = "need"; continue; }
    // «попробуй» это команды, которые ОБЯЗАНЫ упасть: смысл задания в том, чтобы
    // прочитать ошибку. Засчитываются по факту запуска, а не по коду возврата.
    if (/^---\s*попробуй\s*$/.test(trimmed)) { mode = "probe"; continue; }
    if (mode === "need") { if (trimmed) task.need.push(trimmed); continue; }
    if (mode === "probe") { if (trimmed) task.probe.push(trimmed); continue; }
    if (mode === "head") {
      const kv = /^(id|title):\s*(.+)$/.exec(trimmed);
      if (kv) { task[kv[1]] = kv[2].trim(); continue; }
      task.statement.push(raw);
    } else if (mode === "file") {
      task.files[file].push(raw);
    }
  }
  Object.keys(task.files).forEach((name) => {
    task.files[name] = task.files[name].join("\n").replace(/^\n+|\n+$/g, "") + "\n";
  });
  task.statement = task.statement.join("\n").trim();
  if (!task.id) task.id = (task.title || "term").replace(/\s+/g, "-").toLowerCase();
  return task;
}

function miniTask(lines) {
  const task = { t: "minitask", id: "", title: "задача", statement: [], files: {},
                 expect: "", args: [], stdin: "", probe: "", wantError: "" };
  let mode = "head";
  let file = null;
  for (const raw of lines) {
    const line = raw;
    const mFile = /^---\s*файл\s+(\S+)\s*$/.exec(line.trim());
    if (mFile) { mode = "file"; file = mFile[1]; task.files[file] = []; continue; }
    if (/^---\s*вывод\s*$/.test(line.trim())) { mode = "expect"; continue; }
    // Проверка без вывода: эти строки Java подставляет в конец main сама, ученик
    // их не пишет и не видит. Так можно спросить «объяви переменную», а не
    // «напечатай переменную» — а проверить всё равно объективно.
    if (/^---\s*проверка\s*$/.test(line.trim())) { mode = "probe"; continue; }
    // Задача, где успех это ошибка компилятора: «сделай так, чтобы он сказал X».
    const mErr = /^---\s*ошибка\s*(.*)$/.exec(line.trim());
    if (mErr) { task.wantError = mErr[1].trim(); mode = "head2"; continue; }
    const mArgs = /^---\s*аргументы\s*(.*)$/.exec(line.trim());
    if (mArgs) {
      // Аргументы командной строки задачи: как в терминале, кавычки склеивают слова.
      task.args = (mArgs[1].match(/"([^"]*)"|'([^']*)'|(\S+)/g) || [])
        .map((a) => a.replace(/^["']|["']$/g, ""));
      mode = "head2";
      continue;
    }
    if (/^---\s*ввод\s*$/.test(line.trim())) { mode = "stdin"; continue; }
    if (mode === "stdin") { task.stdin += (task.stdin ? "\n" : "") + line; continue; }
    if (mode === "probe") { task.probe += (task.probe ? "\n" : "") + line; continue; }
    if (mode === "head2") continue;
    if (mode === "head") {
      const kv = /^(id|title):\s*(.+)$/.exec(line.trim());
      if (kv) { task[kv[1]] = kv[2].trim(); continue; }
      task.statement.push(line);
    } else if (mode === "file") {
      task.files[file].push(line);
    } else {
      task.expect += (task.expect ? "\n" : "") + line;
    }
  }
  Object.keys(task.files).forEach((name) => {
    task.files[name] = task.files[name].join("\n").replace(/^\n+|\n+$/g, "") + "\n";
  });
  task.statement = task.statement.join("\n").trim();
  task.expect = task.expect.trim();
  task.stdin = task.stdin.replace(/^\n+/, "");
  task.probe = task.probe.replace(/^\n+|\n+$/g, "");
  if (!task.id) task.id = (task.title || "task").replace(/\s+/g, "-").toLowerCase();
  return task;
}


/** Задача на порядок: строки даны правильно, показываем их перемешанными.

    ```перестановка
    id: coffee
    title: Наведи порядок
    <условие>
    ---строки
    System.out.println("Сварить кофе");
    ...
    ```
    Проверка это сравнение порядка: ни редактора, ни компилятора тут не нужно,
    человек мышкой раскладывает строки и сразу видит, сошлось или нет. */
function reorderTask(lines) {
  const task = { t: "reorder", id: "", title: "порядок строк", statement: [], lines: [] };
  let mode = "head";
  for (const line of lines) {
    if (/^---\s*строки\s*$/.test(line.trim())) { mode = "lines"; continue; }
    if (mode === "head") {
      const kv = /^(id|title):\s*(.+)$/.exec(line.trim());
      if (kv) { task[kv[1]] = kv[2].trim(); continue; }
      task.statement.push(line);
    } else if (line.trim()) {
      task.lines.push(line.replace(/\s+$/, ""));
    }
  }
  task.statement = task.statement.join("\n").trim();
  if (!task.id) task.id = (task.title || "reorder").replace(/\s+/g, "-").toLowerCase();
  return task;
}

/** Задача на SQL: ученик пишет запрос, движок его выполняет, результат сверяется.

    ```запрос
    id: free-qty
    title: Свободный остаток
    <условие в markdown>
    ---набор wms
    ---старт
    SELECT skuid, loc
    FROM dbo.stock;
    ---ожидание
    skuid | loc
    MILK-1L | A-01-01
    ```
    Первая строка ожидания это имена колонок, дальше строки результата, ячейки
    разделены вертикальной чертой. Сверяются значения, а не картинка: ширина
    колонок и выравнивание к делу не относятся.

    Необязательные пометки:
      ---как угодно   порядок строк не важен (нет ORDER BY — нет и требования)
      ---свободно     песочница без проверки: «посмотри, потрогай»
      ---ошибка 42703 успех это когда движок ответил ровно таким SQLSTATE
      ---сессия       своя база, переживающая COMMIT: темы про транзакции
      ---подсказка    текст, который открывается по кнопке
      ---эталон       решение автора. На экран не идёт: по нему проверяется
                      сам банк задач — эталон гоняется по базе, и его результат
                      обязан совпасть с ожиданием. Иначе задача с выдуманным
                      ответом дожила бы до ученика и он бился бы о неё зря.
*/
function sqlTask(lines) {
  const task = { t: "sqltask", id: "", title: "запрос", statement: [], start: "",
                 dataset: "wms", expectCols: [], expectRows: [], ordered: true,
                 free: false, wantState: "", mode: "rollback", hint: [], solution: [] };
  let mode = "head";
  for (const raw of lines) {
    const trimmed = raw.trim();
    const mSet = /^---\s*набор\s+(\S+)\s*$/.exec(trimmed);
    if (mSet) { task.dataset = mSet[1]; mode = "head2"; continue; }
    if (/^---\s*старт\s*$/.test(trimmed)) { mode = "start"; continue; }
    if (/^---\s*ожидание\s*$/.test(trimmed)) { mode = "expect"; continue; }
    if (/^---\s*подсказка\s*$/.test(trimmed)) { mode = "hint"; continue; }
    if (/^---\s*эталон\s*$/.test(trimmed)) { mode = "solution"; continue; }
    if (/^---\s*как\s+угодно\s*$/.test(trimmed)) { task.ordered = false; mode = "head2"; continue; }
    if (/^---\s*свободно\s*$/.test(trimmed)) { task.free = true; mode = "head2"; continue; }
    if (/^---\s*сессия\s*$/.test(trimmed)) { task.mode = "session"; mode = "head2"; continue; }
    const mErr = /^---\s*ошибка\s*(.*)$/.exec(trimmed);
    if (mErr) { task.wantState = mErr[1].trim(); mode = "head2"; continue; }

    if (mode === "start") { task.start += (task.start ? "\n" : "") + raw; continue; }
    if (mode === "hint") { task.hint.push(raw); continue; }
    // Эталон собираем, но наружу не отдаём: он нужен проверке банка, а не ученику.
    if (mode === "solution") { task.solution.push(raw); continue; }
    if (mode === "expect") {
      if (!trimmed) continue;
      const cells = trimmed.split("|").map((c) => c.trim());
      if (!task.expectCols.length) task.expectCols = cells;
      else task.expectRows.push(cells);
      continue;
    }
    if (mode === "head2") continue;
    const kv = /^(id|title):\s*(.+)$/.exec(trimmed);
    if (kv) { task[kv[1]] = kv[2].trim(); continue; }
    task.statement.push(raw);
  }
  task.statement = task.statement.join("\n").trim();
  task.start = task.start.replace(/^\n+|\n+$/g, "");
  task.hint = task.hint.join("\n").trim();
  task.solution = task.solution.join("\n").trim();
  if (!task.id) task.id = (task.title || "sql").replace(/\s+/g, "-").toLowerCase();
  return task;
}


/** Сценарий на нескольких сессиях: то, ради чего вообще существуют блокировки.

    ```сценарий
    id: lock-wait
    title: Как выглядит ожидание блокировки
    <условие в markdown>
    ---набор wms
    ---A
    BEGIN;
    UPDATE dbo.stock SET qty = 99 WHERE ...;
    ---B ждёт
    UPDATE dbo.stock SET qty = 1 WHERE ...;
    ---A
    COMMIT;
    ---B
    SELECT qty FROM dbo.stock WHERE ...;
    ---ожидание
    qty
    1.000
    ```
    Метка шага это одна заглавная буква: сессия A, сессия B. Приписка «ждёт»
    говорит, что шаг обязан упереться в блокировку — не пометил, а он упёрся,
    и наоборот: это ошибка сценария, а не сюрприз.

    Одним соединением такое не показать: там некому кого-то ждать. Поэтому
    сценарий уходит на сервер целиком, разыгрывается на живых сессиях одной
    одноразовой базы и возвращает ленту шагов с временем ожидания. */
function sqlScenario(lines) {
  const task = { t: "sqlscenario", id: "", title: "сценарий", statement: [], steps: [],
                 dataset: "wms", expectCols: [], expectRows: [], hint: [] };
  let mode = "head";
  let step = null;
  for (const raw of lines) {
    const trimmed = raw.trim();
    const mSet = /^---\s*набор\s+(\S+)\s*$/.exec(trimmed);
    if (mSet) { task.dataset = mSet[1]; mode = "head2"; step = null; continue; }
    if (/^---\s*ожидание\s*$/.test(trimmed)) { mode = "expect"; step = null; continue; }
    if (/^---\s*подсказка\s*$/.test(trimmed)) { mode = "hint"; step = null; continue; }
    // Метка сессии: ровно одна заглавная буква, чтобы не спутать со служебными
    // метками вроде «---набор» и «---ожидание».
    const mStep = /^---\s*([A-ZА-ЯЁ])\s*(жд[её]т)?\s*$/.exec(trimmed);
    if (mStep) {
      step = { slot: mStep[1], sql: [], expectWait: Boolean(mStep[2]) };
      task.steps.push(step);
      mode = "step";
      continue;
    }
    if (mode === "step") { step.sql.push(raw); continue; }
    if (mode === "hint") { task.hint.push(raw); continue; }
    if (mode === "expect") {
      if (!trimmed) continue;
      const cells = trimmed.split("|").map((c) => c.trim());
      if (!task.expectCols.length) task.expectCols = cells;
      else task.expectRows.push(cells);
      continue;
    }
    if (mode === "head2") continue;
    const kv = /^(id|title):\s*(.+)$/.exec(trimmed);
    if (kv) { task[kv[1]] = kv[2].trim(); continue; }
    task.statement.push(raw);
  }
  task.steps.forEach((s) => { s.sql = s.sql.join("\n").replace(/^\n+|\n+$/g, ""); });
  task.steps = task.steps.filter((s) => s.sql.trim());
  task.statement = task.statement.join("\n").trim();
  task.hint = task.hint.join("\n").trim();
  if (!task.id) task.id = (task.title || "scenario").replace(/\s+/g, "-").toLowerCase();
  return task;
}


/** Перемешивание от строки-семени: порядок на экране один и тот же при каждой
    загрузке, иначе задача «прыгала» бы после каждого обновления страницы. */
function shuffleBySeed(items, seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return Math.abs(h) / 2147483647 % 1; };
  const out = items.map((value, index) => ({ value, index }));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  // Если случайно совпало с исходным порядком, сдвигаем — задача должна быть задачей.
  if (out.every((x, i) => x.index === i) && out.length > 1) out.push(out.shift());
  return out;
}

/* ---------------------------------------------------------------- разбор целиком */

export function parseNote(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const { meta, at } = readHead(lines);

  let title = "";
  let start = at;
  for (let k = at; k < Math.min(at + 14, lines.length); k++) {
    const h1 = /^#\s+(.+)$/.exec(lines[k].trim());
    if (h1) { title = h1[1].trim(); start = k + 1; break; }
  }

  const ctx = { n: 0 };
  const blocks = parseBlocks(lines.slice(start), ctx);

  // Футер «**Связи:** …» это не абзац текста, а навигация — вынимаем отдельно.
  let related = [];
  const last = blocks[blocks.length - 1];
  if (last && last.t === "p" && last.text.trim().startsWith("**Связи:**")) {
    const found = [...last.text.matchAll(WIKI_RE)].map((m) => m[1].trim());
    if (found.length) { related = found; blocks.pop(); }
  }

  return { meta, title, blocks, related, sections: sectionsOf(blocks) };
}

/** Разложить блоки по секциям H2: статья вставляет вопросы именно по границам секций. */
export function sectionsOf(blocks) {
  const out = [];
  let cur = { id: "s0", heading: "", level: 2, from: 0, to: 0, blocks: [] };
  blocks.forEach((block, index) => {
    if (block.t === "h" && block.level === 2) {
      cur.to = index;
      if (cur.blocks.length || cur.heading) out.push(cur);
      cur = { id: block.id, heading: block.text, level: 2, from: index, to: index, blocks: [] };
      return;
    }
    cur.blocks.push(block);
  });
  cur.to = blocks.length;
  if (cur.blocks.length || cur.heading) out.push(cur);
  return out;
}

/** Весь текст секции одной строкой: по нему подбираются вопросы и термины. */
export function sectionText(section) {
  const parts = [section.heading];
  const walk = (list) => list.forEach((b) => {
    if (b.t === "p") parts.push(plain(b.text));
    else if (b.t === "h") parts.push(b.text);
    else if (b.t === "list") b.items.forEach((it) => parts.push(plain(it.text)));
    else if (b.t === "table") { parts.push(b.head.join(" ")); b.rows.forEach((r) => parts.push(r.join(" "))); }
    else if (b.t === "code" || b.t === "out") parts.push(b.text);
    else if (b.t === "cards") b.items.forEach((c) => parts.push(`${c.front} ${c.back}`));
    else if (b.blocks) walk(b.blocks);
  });
  walk(section.blocks);
  return parts.join("\n");
}

/* ---------------------------------------------------------------- вывод в HTML */

const CO_ICONS = {
  tip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 9v5M12 17.5v.5M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m4 12.5 5 5L20 6.5"/></svg>',
  question: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9.2"/><path d="M9.5 9.3a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.7-.9 1.3v.6M12 17v.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9.2"/><path d="M12 11v5.5M12 7.6v.4"/></svg>',
  abstract: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h9l5 5v11H5zM14 4v5h5"/></svg>',
};
const CO_TITLES = {
  tip: "подсказка", warning: "внимание", success: "решение", question: "ответы",
  info: "справка", abstract: "кратко", note: "заметка",
};
const KIND_CLASS = {
  tip: "tip", warning: "warning", success: "success", question: "question",
  info: "info", abstract: "info", note: "info", danger: "warning", bug: "warning",
  example: "info", quote: "info", todo: "info", failure: "warning",
};

function parseInline(text) {
  const ctx = { n: 900 };
  return parseBlocks(String(text || "").split("\n"), ctx);
}

export function renderBlocks(blocks) {
  return blocks.map(renderBlock).join("");
}

function renderBlock(b) {
  switch (b.t) {
    case "h":
      return `<h${b.level} id="${b.id}">${inline(b.text)}</h${b.level}>`;
    case "p":
      return `<p>${inline(b.text).replace(/\n/g, "<br>")}</p>`;
    case "hr":
      return "<hr>";
    case "qanchor":
      return "";
    case "diaganchor":
      // Пустое место под схему: SVG подставит статья, парсер о схемах не знает.
      return `<div data-diagram="${escapeAttr(b.id)}"></div>`;
    case "code":
      return codeBlock(b);
    case "out":
      return `<pre class="out"><code>${escapeHtml(b.text)}</code></pre>`;
    case "quote":
      return `<blockquote>${renderBlocks(b.blocks)}</blockquote>`;
    case "callout":
      return callout(b);
    case "table":
      return table(b);
    case "list":
      return list(b);
    case "cards":
      return cards(b);
    case "reorder": {
      const rows = shuffleBySeed(b.lines, b.id).map(({ value, index }) => `
        <li class="ro-row" draggable="true" data-at="${index}">
          <span class="ro-grip" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
              <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
              <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
          </span>
          <code>${escapeHtml(value)}</code>
          <span class="ro-move">
            <button type="button" data-ro-up aria-label="выше">↑</button>
            <button type="button" data-ro-down aria-label="ниже">↓</button>
          </span>
        </li>`).join("");
      return `<div class="minitask reorder" data-reorder="${escapeHtml(b.id)}"
          data-answer="${escapeAttr(JSON.stringify(b.lines))}">
        <div class="mt-top">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
            stroke-width="1.9"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>
          порядок строк<span class="mt-name">${escapeHtml(b.title)}</span>
        </div>
        <div class="mt-folded">
          <span class="chip ok" data-mt-chip data-mt-done="решено">решено</span>
          <button class="btn ghost" data-mt-open type="button">решить заново</button>
        </div>
        <div class="mt-statement">${renderBlocks(parseInline(b.statement))}</div>
        <ul class="ro-list">${rows}</ul>
        <div class="mt-bar">
          <button class="btn primary" data-ro-check type="button">проверить порядок</button>
          <button class="btn ghost" data-ro-reset type="button">перемешать заново</button>
          <button class="btn ghost" data-mt-know type="button">уже умею</button>
          <span class="mt-note"></span>
        </div>
      </div>`;
    }
    case "picture":
      return `<figure class="pic" data-pic="${escapeHtml(b.id)}">
        <img src="img/${escapeAttr(b.id)}.png" alt="${escapeAttr(b.alt)}" loading="lazy"
          onerror="this.closest('.pic').classList.add('pic-missing')">
        <div class="pic-stub">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
            stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 3 3-2 4 4"/></svg>
          <span>картинка ещё не нарисована</span>
        </div>
        <figcaption>${escapeHtml(b.alt)}</figcaption>
      </figure>`;
    case "terminal": {
      const chip = (c, kind) =>
        `<button class="tm-hint ${kind}" type="button" data-tm-cmd="${escapeAttr(c)}">${escapeHtml(c)}</button>`;
      const need = [...(b.need || []).map((c) => chip(c, "must")),
                    ...(b.probe || []).map((c) => chip(c, "probe"))].join("");
      const files = Object.entries(b.files || {}).map(([name, src]) =>
        `<div class="tm-src" data-tm-file="${escapeAttr(name)}"
           data-tm-init="${escapeAttr(src)}"><div class="tm-name">${escapeHtml(name)}</div>
           <div class="tm-editor"></div></div>`).join("");
      return `<div class="minitask terminal" data-terminal="${escapeHtml(b.id)}"
          data-need="${escapeAttr(JSON.stringify(b.need || []))}"
          data-probe="${escapeAttr(JSON.stringify(b.probe || []))}">
        <div class="mt-top">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
            stroke-width="1.9"><rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="m7 10 3 2.5-3 2.5M12.5 15H17"/></svg>
          терминал<span class="mt-name">${escapeHtml(b.title)}</span>
        </div>
        <div class="mt-folded">
          <span class="chip ok" data-mt-chip data-mt-done="сделано">сделано</span>
          <button class="btn ghost" data-mt-open type="button">пройти заново</button>
        </div>
        <div class="mt-statement">${renderBlocks(parseInline(b.statement))}</div>
        ${files}
        <div class="tm-body">
          <div class="tm-files"><div class="tm-lbl">в папке</div><ul data-tm-ls></ul></div>
          <div class="tm-screen">
            <div class="tm-log" data-tm-log></div>
            <div class="tm-line">
              <span class="tm-prompt">$</span>
              <input class="tm-input" data-tm-input type="text" spellcheck="false"
                autocomplete="off" placeholder="набери команду и нажми Enter">
            </div>
          </div>
        </div>
        ${need ? `<div class="tm-need"><span class="tm-lbl">надо выполнить</span>${need}</div>` : ""}
        <div class="mt-bar">
          <button class="btn ghost" data-tm-reset type="button">очистить папку</button>
          <button class="btn ghost" data-mt-know type="button">уже умею</button>
          <span class="mt-note"></span>
        </div>
      </div>`;
    }
    case "minitask":
      return `<div class="minitask" data-mini="${escapeHtml(b.id)}"
        data-payload="${escapeAttr(JSON.stringify({ files: b.files, expect: b.expect, args: b.args,
                                                     stdin: b.stdin, probe: b.probe, wantError: b.wantError }))}">
        <div class="mt-top">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
            stroke-width="1.9"><path d="m9 8-5 4 5 4M15 8l5 4-5 4"/></svg>
          мини-задача<span class="mt-name">${escapeHtml(b.title)}</span>
        </div>
        <div class="mt-folded">
          <span class="chip ok" data-mt-chip data-mt-done="решено">решено</span>
          <button class="btn ghost" data-mt-open type="button">решить заново</button>
        </div>
        <div class="mt-statement">${renderBlocks(parseInline(b.statement))}</div>
        ${b.args?.length || b.stdin ? `<div class="mt-input">
          ${b.args?.length ? `<span>аргументы: <code>${escapeHtml(b.args.join(" "))}</code></span>` : ""}
          ${b.stdin ? `<span>ввод: <code>${escapeHtml(b.stdin.replace(/\n/g, " ⏎ "))}</code></span>` : ""}
        </div>` : ""}
        <div class="mt-editor"></div>
        <div class="mt-bar">
          <button class="btn primary" data-mt-run type="button">запустить и проверить</button>
          <button class="btn ghost" data-mt-reset type="button">сбросить</button>
          <button class="btn ghost" data-mt-know type="button">уже умею</button>
          <span class="mt-note"></span>
        </div>
        <div class="mt-out"></div>
      </div>`;
    case "sqltask": {
      const shape = b.free ? "песочница"
        : b.wantState ? `ждём ошибку ${b.wantState}`
        : `${b.expectRows.length} ${plural(b.expectRows.length, "строка", "строки", "строк")}` +
          (b.ordered ? "" : ", порядок любой");
      return `<div class="sqltask" data-sql="${escapeHtml(b.id)}"
        data-payload="${escapeAttr(JSON.stringify({
          start: b.start, dataset: b.dataset, expectCols: b.expectCols,
          expectRows: b.expectRows, ordered: b.ordered, free: b.free,
          wantState: b.wantState, mode: b.mode }))}">
        <div class="mt-top">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
            stroke-width="1.9"><ellipse cx="12" cy="6" rx="7.5" ry="3"/>
            <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/></svg>
          запрос<span class="mt-name">${escapeHtml(b.title)}</span>
          <span class="sq-shape">${escapeHtml(shape)}</span>
        </div>
        <div class="mt-folded">
          <span class="chip ok" data-mt-chip data-mt-done="решено">решено</span>
          <button class="btn ghost" data-mt-open type="button">решить заново</button>
        </div>
        <div class="mt-statement">${renderBlocks(parseInline(b.statement))}</div>
        <div class="mt-editor"></div>
        <div class="mt-bar">
          <button class="btn primary" data-sq-run type="button">выполнить</button>
          <button class="btn ghost" data-sq-reset type="button">сбросить</button>
          ${b.hint ? '<button class="btn ghost" data-sq-hint type="button">подсказка</button>' : ""}
          <button class="btn ghost" data-mt-know type="button">уже умею</button>
          <span class="mt-note"></span>
        </div>
        ${b.hint ? `<div class="sq-hint" hidden>${renderBlocks(parseInline(b.hint))}</div>` : ""}
        <div class="mt-out"></div>
      </div>`;
    }
    case "sqlscenario": {
      const slots = [...new Set(b.steps.map((s) => s.slot))];
      const steps = b.steps.map((s, i) => `
        <div class="sc-step" data-step="${i}" data-slot="${escapeHtml(s.slot)}">
          <div class="sc-who">сессия ${escapeHtml(s.slot)}${s.expectWait
            ? '<span class="sc-wait-mark">упрётся в блокировку</span>' : ""}</div>
          <pre class="code" data-lang="sql"><code>${escapeHtml(s.sql)}</code></pre>
          <div class="sc-out"></div>
        </div>`).join("");
      return `<div class="sqlscenario" data-scenario="${escapeHtml(b.id)}"
        data-payload="${escapeAttr(JSON.stringify({
          dataset: b.dataset, steps: b.steps,
          expectCols: b.expectCols, expectRows: b.expectRows }))}">
        <div class="mt-top">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
            stroke-width="1.9"><path d="M4 6h7v12H4zM13 6h7v12h-7z"/><path d="M11 12h2"/></svg>
          сценарий<span class="mt-name">${escapeHtml(b.title)}</span>
          <span class="sq-shape">${b.steps.length} ${plural(b.steps.length, "шаг", "шага", "шагов")}
            в ${slots.length} ${plural(slots.length, "сессии", "сессиях", "сессиях")}</span>
        </div>
        <div class="mt-folded">
          <span class="chip ok" data-mt-chip data-mt-done="разобрано">разобрано</span>
          <button class="btn ghost" data-mt-open type="button">пройти заново</button>
        </div>
        <div class="mt-statement">${renderBlocks(parseInline(b.statement))}</div>
        <div class="sc-steps">${steps}</div>
        <div class="mt-bar">
          <button class="btn primary" data-sc-run type="button">разыграть</button>
          ${b.hint ? '<button class="btn ghost" data-sc-hint type="button">подсказка</button>' : ""}
          <button class="btn ghost" data-mt-know type="button">уже умею</button>
          <span class="mt-note"></span>
        </div>
        ${b.hint ? `<div class="sq-hint" hidden>${renderBlocks(parseInline(b.hint))}</div>` : ""}
      </div>`;
    }
    default:
      return "";
  }
}

/** Русское склонение после числа. Нужно ровно в одном месте, поэтому здесь. */
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  if (a > 10 && a < 20) return many;
  const b = a % 10;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

function codeBlock(b) {
  const runnable = b.lang === "java" && /static\s+void\s+main\s*\(/.test(b.text);
  const body = `<pre class="code" data-lang="${escapeHtml(b.lang)}"><code>${escapeHtml(b.text)}</code></pre>`;
  if (!runnable) return body;
  return `<div class="runbox" data-run>${body}
    <div class="runbar">
      <button class="btn ghost" data-run-go>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 4.5v15l12-7.5z"/></svg>
        запустить
      </button>
      <button class="btn ghost" data-run-reset hidden>вернуть как было</button>
      <span data-run-note>код можно менять прямо здесь и запускать</span>
    </div>
  </div>`;
}

function callout(b) {
  const kind = KIND_CLASS[b.kind] || "info";
  const icon = CO_ICONS[kind] || CO_ICONS.info;
  const title = b.title || CO_TITLES[kind] || "";
  const caret = b.folded
    ? '<span class="co-caret"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 5 7 7-7 7"/></svg></span>'
    : "";
  const head = b.folded
    ? `<button class="co-head" type="button"><span class="co-ico">${icon}</span>${escapeHtml(title)}${caret}</button>`
    : `<div class="co-head"><span class="co-ico">${icon}</span>${escapeHtml(title)}</div>`;
  return `<div class="callout ${kind}${b.folded ? " fold" : ""}">${head}
    <div class="co-body">${renderBlocks(b.blocks)}</div></div>`;
}

function table(b) {
  const head = b.head.map((c) => `<th>${inline(c)}</th>`).join("");
  const rows = b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("");
  return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function list(b) {
  if (b.checks) {
    const items = b.items.map((it) => `<li class="${it.done ? "done" : ""}">
      <span class="box">✓</span><span>${inline(it.text)}</span></li>`).join("");
    return `<ul class="checks">${items}</ul>`;
  }
  const items = b.items.map((it) => `<li>${inline(it.text).replace(/\n/g, "<br>")}</li>`).join("");
  if (b.ordered) return `<ol${b.start > 1 ? ` start="${b.start}"` : ""}>${items}</ol>`;
  return `<ul>${items}</ul>`;
}

function cards(b) {
  const items = b.items.map((c) => `<button class="flip" type="button">
      <div class="inner">
        <div class="face">${inline(c.front)}</div>
        <div class="face back">${inline(c.back)}</div>
      </div>
    </button>`).join("");
  return `<div class="flipwrap">${items}</div>`;
}
