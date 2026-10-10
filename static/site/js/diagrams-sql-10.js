// diagrams-sql-10.js
// Схемы этапа 10: цена ACID, автокоммит против явной транзакции, упреждающая
// запись и контрольная точка, потерянное обновление и MVCC, очередь блокировок
// и гранулярность заявки.
//
// Оснастка общая (diagrams-sql-kit.js), правила те же: самодостаточный модуль,
// цвета только через CSS-переменные страницы, никакого JS внутри SVG.
// Образец стиля — diagrams-sql-02.js.

import { arrowDefs, checkIcon, crossIcon, svgWrap } from "./diagrams-sql-kit.js";

/* ---------------------------------------------------------------- d10.01 */

// Один и тот же конфликт, разыгранный дважды: сверху B честно ждёт чужого
// COMMIT и пересчитывает по свежему, снизу — не ждёт и считает по старому.
// Схема существует ради того, чтобы стало видно, что ожидание не поломка,
// а цена изоляции: именно оно и не даёт списанию A испариться.
function buildAcidWaitLine() {
  const S = "acid-wait-line";

  // Один ярус из трёх коробок: три строки текста в каждой.
  const lane = (y, boxes) => boxes.map(([x, w, cls, l1, l2, l3], i) => {
    const cx = x + w / 2;
    const arrow = i === boxes.length - 1 ? ""
      : `<line class="flow" x1="${x + w + 4}" y1="${y + 27}" x2="${x + w + 20}" y2="${y + 27}" marker-end="url(#${S}-arrow)"/>`;
    return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="54" rx="9"/>
<text class="cap ${l1[1] || ""}" x="${cx}" y="${y + 18}" font-size="9.5" text-anchor="middle">${l1[0]}</text>
<text class="mono ${l2[1] || ""}" x="${cx}" y="${y + 34}" font-size="10.5" text-anchor="middle">${l2[0]}</text>
<text class="cap ${l3[1] || ""}" x="${cx}" y="${y + 48}" font-size="9.5" text-anchor="middle">${l3[0]}</text>
${arrow}`;
  }).join("\n");

  return svgWrap("0 0 700 370", S, "Чем платят за четыре обещания", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .live { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .stall { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 5 3; }
.dg-${S} .done { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .warn { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; stroke-dasharray: 5 3; }
.dg-${S} .wrong { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.5; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Цена четырёх обещаний — ожидание, и вот что оно покупает</text>
<text class="cap" x="26" y="48" font-size="10.5">A снимает 8, B снимает 5 с одной строки MILK-1L / A-01-01 / L0001, было 48.000</text>

<text x="26" y="76" font-size="11" font-weight="600">как есть: B ждёт чужого COMMIT</text>
${lane(86, [
  [34, 176, "live", ["A заняла строку"], ["48 − 8 → 40", "t-accent"], ["и сказала COMMIT"]],
  [234, 176, "stall", ["B стоит в очереди", "t-bad"], ["wait_event_type = Lock"], ["pg_blocking_pids → A"]],
  [434, 176, "done", ["перечитала свежее"], ["40 − 5 → 35", "t-ok"], ["и зафиксировала"]],
])}
${checkIcon(34, 149, 14)}
<text class="cap" x="58" y="161" font-size="10.5">итог 35.000 = 48 − 8 − 5: ни одно движение не потерялось</text>

<text x="26" y="190" font-size="11" font-weight="600">если бы B не ждал, а посчитал сразу</text>
${lane(200, [
  [34, 176, "live", ["A заняла строку"], ["48 − 8 → 40", "t-accent"], ["и записала 40"]],
  [234, 176, "warn", ["B не стала ждать", "t-gold"], ["48 − 5 → 43"], ["считала по старым 48"]],
  [434, 176, "wrong", ["в строке остаётся"], ["43", "t-bad"], ["а должно быть 35", "t-bad"]],
])}
${crossIcon(34, 264, 13)}
<text class="cap" x="58" y="275" font-size="10.5">итог 43.000: восемь бутылок, снятых A, испарились вместе с записью B</text>

<line x1="26" y1="296" x2="674" y2="296" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="318" font-size="11">Ожидание — не поломка и не признак кривой базы: это цена изоляции, выставленная тебе в миллисекундах.</text>
<text class="cap" x="26" y="338" font-size="11">ACID — обещание, за которое база платит скоростью, а не галочка в настройках.</text>
<text class="cap" x="26" y="358" font-size="11">Полная изоляция стоит дорого, поэтому её продают уровнями: чем строже, тем больше ожидания.</text>
`);
}

/* ---------------------------------------------------------------- d10.02 */

// Два режима одной и той же команды: сверху транзакцию открывает и закрывает
// сервер, снизу — ты сам. Схема существует ради мысли, что команд «вне
// транзакции» не бывает: меняется не наличие транзакции, а то, кто решает,
// когда она кончится, — и отсюда растёт разница между idle и idle in transaction.
function buildAcTwoModes() {
  const S = "ac-two-modes";

  // Коробка «что видит сосед»: три строки, средняя — само значение.
  // Высота 56 — ровно как у рамки транзакции рядом, иначе низ коробок разъезжается.
  const seen = (x, y, w, cls, l1, l2, tone, l3) => `
<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="56" rx="9"/>
<text class="cap" x="${x + w / 2}" y="${y + 20}" font-size="9.5" text-anchor="middle">${l1}</text>
<text class="mono ${tone}" x="${x + w / 2}" y="${y + 36}" font-size="10.5" text-anchor="middle">${l2}</text>
<text class="mono cap" x="${x + w / 2}" y="${y + 50}" font-size="10" text-anchor="middle">${l3}</text>`;

  return svgWrap("0 0 700 402", S, "Кто закрывает транзакцию: сервер или ты", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .txn { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 6 4; }
.dg-${S} .cmd { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .seenok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .seenold { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .lead { stroke: var(--line); stroke-width: 1.1; stroke-dasharray: 3 3; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Транзакция есть всегда — вопрос лишь в том, кто её закрывает</text>
<text class="cap" x="26" y="48" font-size="10.5">один и тот же UPDATE и один и тот же зонд из соседней сессии</text>

<text x="26" y="112" font-size="11" font-weight="600">автокоммит</text>
<text class="cap" x="26" y="128" font-size="10">решает сервер</text>
<text class="cap t-accent" x="176" y="84" font-size="9.5">транзакцию открыл и закрыл сервер</text>
<rect class="txn" x="176" y="90" width="168" height="56" rx="10"/>
<rect class="cmd" x="190" y="104" width="140" height="32" rx="7"/>
<text class="mono" x="260" y="124" font-size="10" text-anchor="middle">UPDATE ... = 20</text>
${seen(370, 90, 304, "seenok", "команда кончилась — сосед сразу видит новое", "qtyallocated = 20.000", "t-ok", "state = idle")}

<text x="26" y="198" font-size="11" font-weight="600">явная</text>
<text x="26" y="213" font-size="11" font-weight="600">транзакция</text>
<text class="cap" x="26" y="230" font-size="10">решаешь ты</text>
<text class="cap t-accent" x="176" y="176" font-size="9.5">транзакцию открыл и закрыл ты</text>
<rect class="txn" x="176" y="182" width="424" height="56" rx="10"/>
<rect class="cmd" x="190" y="196" width="72" height="32" rx="7"/>
<text class="mono" x="226" y="216" font-size="10" text-anchor="middle">BEGIN</text>
<rect class="cmd" x="276" y="196" width="180" height="32" rx="7"/>
<text class="mono" x="366" y="216" font-size="10" text-anchor="middle">UPDATE ... = 30</text>
<rect class="cmd" x="470" y="196" width="116" height="32" rx="7"/>
<text class="mono" x="528" y="216" font-size="10" text-anchor="middle">COMMIT</text>
<line class="lead" x1="366" y1="238" x2="366" y2="250" marker-end="url(#${S}-arrow)"/>
<line class="lead" x1="528" y1="238" x2="528" y2="250" marker-end="url(#${S}-arrow)"/>
${seen(176, 252, 280, "seenold", "пока она открыта, сосед видит старое", "20.000, а в базе уже 30.000", "t-gold", "state = idle in transaction")}
${seen(470, 252, 204, "seenok", "после COMMIT — новое", "qtyallocated = 30.000", "t-ok", "state = idle")}

<line x1="26" y1="326" x2="674" y2="326" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="348" font-size="11">Команд «вне транзакции» не бывает: в автокоммите сервер открывает её сам и сам закрывает сразу после.</text>
<text class="cap" x="26" y="368" font-size="11">Разница между режимами не «была транзакция или нет», а «кто решает, когда она кончится».</text>
<text class="cap" x="26" y="388" font-size="11">idle in transaction — сессия ничего не делает, но транзакция открыта. Половина этапа 10 про последствия.</text>
`);
}

/* ---------------------------------------------------------------- d10.03 */

// Три дорожки (память, журнал, файл данных) и три момента времени: UPDATE,
// COMMIT и то, что сразу после него. Схема существует ради двух мыслей:
// в журнал пишут в момент изменения, а не в момент фиксации, и COMMIT ждёт
// подтверждения журнала, а не того, что страницы легли в файл данных.
function buildWalOrder() {
  const S = "wal-order";
  const CX = [236, 412, 588];      // центры трёх колонок-моментов
  const CL = [152, 328, 504];      // левые края тех же колонок
  const CW = 168;

  // Одна ячейка дорожки: рамка нужного тона и до трёх строк подписи.
  // Строка задаётся как [текст, доп. класс, размер].
  const cell = (col, y, h, cls, lines) => {
    const t = lines.map((s, i) =>
      `<text class="cap${s[1] ? " " + s[1] : ""}" x="${CX[col]}" y="${y + 22 + i * 17}" font-size="${s[2] || 10.5}" text-anchor="middle">${s[0]}</text>`
    ).join("\n");
    return `<rect class="${cls}" x="${CL[col]}" y="${y}" width="${CW}" height="${h}" rx="8"/>\n${t}`;
  };

  return svgWrap("0 0 700 398", S, "Куда уходит правка и в каком порядке", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-ink { fill: var(--ink); }
.dg-${S} .quiet { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1.1; }
.dg-${S} .warm { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .live { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .colline { stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 4 4; }
.dg-${S} .ruleline { stroke: var(--accent); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Один UPDATE и один COMMIT: кто куда пишет и в каком порядке</text>
<text class="cap" x="26" y="48" font-size="10.5">строка MILK-1L / A-01-01 / L0001: было 48.000, стало 43.000</text>

<line class="colline" x1="324" y1="80" x2="324" y2="306"/>
<line class="colline" x1="500" y1="80" x2="500" y2="306"/>
<text class="mono t-ink" x="236" y="72" font-size="12" font-weight="700" text-anchor="middle">UPDATE</text>
<text class="mono t-ink" x="412" y="72" font-size="12" font-weight="700" text-anchor="middle">COMMIT</text>
<text class="cap" x="588" y="72" font-size="11" text-anchor="middle">сразу после COMMIT</text>

<text class="t-ink" x="26" y="110" font-size="11" font-weight="600">буферный пул</text>
<text class="cap" x="26" y="126" font-size="10">страницы в памяти</text>
${cell(0, 88, 52, "warm", [["правка сделана в памяти"], ["страница стала грязной", "t-gold"]])}
${cell(1, 88, 52, "warm", [["страница всё ещё грязная"], ["на диск не поехала", "t-gold"]])}
${cell(2, 88, 52, "warm", [["уедет в файл данных"], ["на контрольной точке", "t-gold"]])}

<text class="t-ink" x="26" y="180" font-size="11" font-weight="600">журнал WAL</text>
<text class="cap" x="26" y="196" font-size="10">лента на диске,</text>
<text class="cap" x="26" y="210" font-size="10">пишется только в конец</text>
${cell(0, 150, 72, "live", [["запись об изменении страницы"], ["48.000 → 43.000", "mono t-accent", 12], ["LSN сдвинулся"]])}
${cell(1, 150, 72, "live", [["запись «зафиксирована»"], ["fsync — диск подтвердил", "t-accent", 11], ["и только теперь ответ клиенту", "", 10]])}
${cell(2, 150, 72, "live", [["в журнале уже всё, чтобы"], ["повторить правку"], ["после сбоя"]])}

<line class="ruleline" x1="152" y1="238" x2="256" y2="238"/>
<line class="ruleline" x1="568" y1="238" x2="672" y2="238"/>
<text class="cap t-accent" x="412" y="242" font-size="10.5" text-anchor="middle">запись журнала ложится на диск раньше страницы данных</text>

<text class="t-ink" x="26" y="270" font-size="11" font-weight="600">файл данных</text>
<text class="cap" x="26" y="286" font-size="10">то, что лежит на диске</text>
${cell(0, 248, 52, "quiet", [["не изменился"]])}
${cell(1, 248, 52, "quiet", [["не изменился"]])}
${cell(2, 248, 52, "quiet", [["по-прежнему не изменился"]])}

<line x1="26" y1="322" x2="674" y2="322" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="344" font-size="11">В журнал пишут в момент изменения, а не в момент фиксации: LSN сдвинулся ещё до COMMIT.</text>
<text class="cap" x="26" y="364" font-size="11">COMMIT ждёт журнала, а не данных: один короткий кусок в конец одного файла — оттого он и быстр.</text>
<text class="cap" x="26" y="384" font-size="11">Запись журнала обязана лечь на диск раньше страницы данных — это и есть упреждающая запись.</text>
`);
}

// Лента журнала, разрезанная отметкой контрольной точки: слева сегменты уже
// не нужны и пойдут в переиспользование, справа лежит всё, чего может не быть
// в файлах данных. Схема существует ради мысли, что до файла данных изменения
// доводит контрольная точка, а не COMMIT, и что именно от её отметки читают
// журнал при восстановлении после сбоя.
function buildWalCheckpoint() {
  const S = "wal-checkpoint";
  const X0 = 40, SEG = 77.5, MARK = X0 + 4 * SEG;   // отметка ровно на границе сегментов, x = 350
  const names = ["…008A", "…008B", "…008C", "…008D", "…008E", "…008F", "…0090", "…0091"];

  const tape = names.map((n, i) => {
    const x = X0 + i * SEG;
    return `<rect class="${i < 4 ? "cold" : "warm"}" x="${x}" y="96" width="${SEG}" height="44" rx="4"/>
<text class="mono ${i < 4 ? "cap" : "t-accent"}" x="${x + SEG / 2}" y="${123}" font-size="10" text-anchor="middle">${n}</text>`;
  }).join("\n");

  // Четыре шага восстановления: ширина коробки задана вручную под текст.
  const steps = [["сбой", 78], ["последняя отметка", 156], ["redo вперёд", 132], ["база открыта", 140]];
  let sx = 64;
  const chain = steps.map(([label, w], i) => {
    const x = sx; sx += w + 22;
    const arrow = i === steps.length - 1 ? ""
      : `<line class="flow" x1="${x + w}" y1="245" x2="${x + w + 18}" y2="245" marker-end="url(#${S}-arrow)"/>`;
    return `<rect class="${i === 2 ? "live" : "stepbox"}" x="${x}" y="228" width="${w}" height="34" rx="8"/>
<text class="${i === 2 ? "t-accent" : ""}" x="${x + w / 2}" y="249" font-size="11" text-anchor="middle">${label}</text>
${arrow}`;
  }).join("\n");

  return svgWrap("0 0 700 378", S, "Контрольная точка режет журнал надвое", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .cold { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1.1; }
.dg-${S} .warm { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .live { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .stepbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pin { stroke: var(--accent); stroke-width: 2.2; }
.dg-${S} .brace { stroke: var(--muted); stroke-width: 1.1; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .lead { stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 3 3; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Контрольная точка режет журнал на «уже не нужен» и «нужен при восстановлении»</text>
<text class="cap" x="26" y="48" font-size="10.5">журнал — лента, которая пишется только в конец; позиция на ней и есть LSN</text>

<text class="t-accent" x="${MARK}" y="80" font-size="11" font-weight="700" text-anchor="middle">контрольная точка</text>
<text class="cap" x="621" y="82" font-size="10" text-anchor="middle">сюда пишут сейчас</text>
${tape}
<line class="pin" x1="${MARK}" y1="86" x2="${MARK}" y2="150"/>

<line class="brace" x1="${X0}" y1="152" x2="${MARK - 4}" y2="152"/>
<line class="brace" x1="40" y1="152" x2="40" y2="146"/>
<line class="brace" x1="${MARK - 4}" y1="152" x2="${MARK - 4}" y2="146"/>
<line class="brace" x1="${MARK + 4}" y1="152" x2="660" y2="152"/>
<line class="brace" x1="${MARK + 4}" y1="152" x2="${MARK + 4}" y2="146"/>
<line class="brace" x1="660" y1="152" x2="660" y2="146"/>
<text x="193" y="170" font-size="11" font-weight="600" text-anchor="middle">переиспользуется</text>
<text class="cap" x="193" y="187" font-size="10.5" text-anchor="middle">данные и журнал здесь сошлись</text>
<text class="t-accent" x="507" y="170" font-size="11" font-weight="600" text-anchor="middle">нужен при восстановлении</text>
<text class="cap" x="507" y="187" font-size="10.5" text-anchor="middle">redo читают отсюда и вперёд</text>

<text class="cap" x="26" y="216" font-size="11">восстановление после сбоя не читает журнал с начала жизни базы:</text>
${chain}
<line class="lead" x1="408" y1="262" x2="408" y2="272"/>
<text class="cap" x="408" y="284" font-size="10.5" text-anchor="middle">применяется всё, что не доехало до страниц</text>

<line x1="26" y1="304" x2="674" y2="304" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="326" font-size="11">Именно контрольная точка, а не COMMIT, доводит изменения до файла данных.</text>
<text class="cap" x="26" y="346" font-size="11">Случается по таймеру (checkpoint_timeout = 5min) или по объёму (max_wal_size = 1GB).</text>
<text class="cap" x="26" y="366" font-size="11">Всё, что раньше отметки, для восстановления после сбоя не нужно — сегменты переиспользуются.</text>
`);
}

// Та же лента журнала, но с закладкой: пока кто-то держит закладку, всё правее
// неё переиспользовать нельзя, и журнал растёт до конца диска. Схема существует
// ради того, чтобы поиск виновника стал коротким списком претендентов с
// пометкой, у какой СУБД какой из них бывает.
function buildWalHolders() {
  const S = "wal-holders";
  // держатель, СУБД, тон значка, чем ловят (две строки)
  const rows = [
    ["незавершённая транзакция", "SQL Server", "ms",
      "log_reuse_wait_desc = ACTIVE_TRANSACTION", "DBCC OPENTRAN покажет, кто именно"],
    ["слот репликации без читателя", "PostgreSQL", "pg",
      "pg_replication_slots: active = false", "и wal_held в десятки гигабайт"],
    ["архивация, которая падает", "PostgreSQL", "pg",
      "archive_mode = on", "а archive_command валится — сегменты копятся"],
    ["FULL без бэкапа журнала", "SQL Server", "ms",
      "log_reuse_wait_desc = LOG_BACKUP", "усекать нечем — .ldf растёт до ошибки 9002"],
  ];

  const body = rows.map(([who, db, tone, how1, how2], i) => {
    const top = 146 + i * 44;
    return `<rect class="rowbox" x="34" y="${top}" width="640" height="38" rx="8"/>
<text x="48" y="${top + 23}" font-size="11">${who}</text>
<rect class="db-${tone}" x="256" y="${top + 9}" width="104" height="20" rx="10"/>
<text class="cap t-${tone}" x="308" y="${top + 23}" font-size="10" text-anchor="middle">${db}</text>
<text class="mono cap" x="372" y="${top + 16}" font-size="9.5">${how1}</text>
<text class="cap" x="372" y="${top + 31}" font-size="9.5">${how2}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 404", S, "Кто держит журнал и не даёт его переиспользовать", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-pg { fill: var(--accent); }
.dg-${S} .t-ms { fill: var(--gold); }
.dg-${S} .free { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1.1; }
.dg-${S} .frozen { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 5 3; }
.dg-${S} .tag { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .pin { stroke: var(--bad); stroke-width: 2.2; }
.dg-${S} .rowbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .db-pg { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.1; }
.dg-${S} .db-ms { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.1; }
.dg-${S} .note { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Журнал нельзя переиспользовать, пока кто-то может в него заглянуть</text>

<rect class="free" x="40" y="58" width="172" height="36" rx="5"/>
<rect class="frozen" x="216" y="58" width="444" height="36" rx="5"/>
<text class="cap" x="126" y="80" font-size="10.5" text-anchor="middle">переиспользуется</text>
<text class="cap t-bad" x="438" y="80" font-size="10.5" text-anchor="middle">заморожено, пока закладку не снимут</text>
<path class="tag" d="M206,34 L222,34 L222,58 L214,51 L206,58 Z"/>
<line class="pin" x1="214" y1="58" x2="214" y2="98"/>
<text class="cap t-bad" x="232" y="46" font-size="10.5">самая старая закладка</text>

<text class="cap" x="26" y="118" font-size="11">Найти держателя — вся работа. Претендентов немного, и они разные в двух СУБД.</text>

<text class="cap" x="48" y="138" font-size="10">кто держит закладку</text>
<text class="cap" x="308" y="138" font-size="10" text-anchor="middle">где</text>
<text class="cap" x="372" y="138" font-size="10">чем ловят</text>
${body}

<rect class="note" x="34" y="332" width="640" height="62" rx="9"/>
<text class="cap" x="52" y="352" font-size="10.5">В PostgreSQL открытая транзакция журнал не держит — фазы undo нет, откатывать по журналу нечего.</text>
<text class="cap" x="52" y="369" font-size="10.5">Зато она держит горизонт очистки: автовакуум не убирает мёртвые версии, и пухнут таблицы.</text>
<text class="cap" x="52" y="386" font-size="10.5">Диск кончается так же, просто в другом каталоге.</text>
`);
}

/* ---------------------------------------------------------------- d10.04 */

// Лента на две сессии плюс дорожка самого значения внизу: обе прочитали 120,
// B честно отстояла очередь — и всё равно записала число, посчитанное из
// устаревшего чтения. Схема существует ради того, чтобы стало видно, что
// блокировка защищает строку от одновременной записи, но не от старого чтения.
function buildLostUpdateLane() {
  const S = "lost-update-lane";

  // Коробка ленты: верхняя строка — что за команда, нижняя — само число.
  const step = (x, y, w, cls, top, bottom, tone) => `
<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="48" rx="9"/>
<text class="cap ${tone === "warn" ? "t-bad" : ""}" x="${x + w / 2}" y="${y + 20}" font-size="9.5" text-anchor="middle">${top}</text>
<text class="${tone === "note" ? "cap" : "mono"} ${tone === "hot" ? "t-accent" : tone === "loss" ? "t-bad" : ""}" x="${x + w / 2}" y="${y + 38}" font-size="${tone === "note" ? 9.5 : 11}" text-anchor="middle">${bottom}</text>`;

  return svgWrap("0 0 700 376", S, "Потерянное обновление: очередь была, данные пропали", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .live { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .stall { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 5 3; }
.dg-${S} .wrong { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.5; }
.dg-${S} .trk { fill: var(--sunk); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .trkgone { fill: var(--paper); stroke: var(--bad); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .trkbad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .strike { stroke: var(--bad); stroke-width: 1.6; }
.dg-${S} .colline { stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Очередь отстояли честно, а данные всё равно испортились</text>
<text class="cap" x="26" y="48" font-size="10.5">MILK-1L / B-01-01 / L0013 — в ячейке 120.000, списывают 80 и 60</text>

<line class="colline" x1="275" y1="86" x2="275" y2="260"/>
<line class="colline" x1="426" y1="86" x2="426" y2="260"/>
<line class="colline" x1="526" y1="86" x2="526" y2="260"/>
<text class="cap" x="204" y="80" font-size="10" text-anchor="middle">обе прочитали</text>
<text class="cap" x="351" y="80" font-size="10" text-anchor="middle">A пишет</text>
<text class="cap" x="475" y="80" font-size="10" text-anchor="middle">A: COMMIT</text>
<text class="cap" x="604" y="80" font-size="10" text-anchor="middle">B проснулась</text>

<text x="26" y="120" font-size="11" font-weight="600">сессия A</text>
${step(140, 90, 128, "live", "SELECT qty", "прочитала 120", "hot")}
${step(282, 90, 138, "live", "UPDATE", "120 − 80 → 40", "")}
${step(432, 90, 86, "live", "A фиксирует", "COMMIT", "")}

<text x="26" y="182" font-size="11" font-weight="600">сессия B</text>
${step(140, 152, 128, "live", "SELECT qty", "прочитала 120", "hot")}
${step(282, 152, 236, "stall", "UPDATE ждёт: строку держит A", "ожидание сработало честно", "note")}
${step(534, 152, 140, "wrong", "проснулась и дописала", "120 − 60 → 60", "loss")}

<text class="cap" x="26" y="248" font-size="10">qty в ячейке</text>
<rect class="trk" x="140" y="228" width="284" height="30" rx="6"/>
<text class="mono" x="282" y="248" font-size="11" text-anchor="middle">120.000</text>
<rect class="trkgone" x="428" y="228" width="96" height="30" rx="6"/>
<text class="mono cap" x="476" y="248" font-size="11" text-anchor="middle">40.000</text>
<line class="strike" x1="440" y1="243" x2="512" y2="243"/>
<rect class="trkbad" x="528" y="228" width="146" height="30" rx="6"/>
<text class="mono t-bad" x="601" y="248" font-size="11" font-weight="700" text-anchor="middle">60.000</text>

${crossIcon(140, 269, 13)}
<text class="cap" x="162" y="280" font-size="10.5">40 прожило один шаг: B записала 60 из прочитанных когда-то 120, и списание A исчезло</text>

<line x1="26" y1="300" x2="674" y2="300" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="322" font-size="11">Обе прочитали 120, обе посчитали новое из него, обе записали — и первая запись стёрта без следа.</text>
<text class="cap" x="26" y="342" font-size="11">Блокировка защитила строку от одновременной записи, но не защитила старое чтение под этим числом.</text>
<text class="cap" x="26" y="362" font-size="11">Это и есть потерянное обновление: ни одна команда не пожаловалась, а восемьдесят пакетов исчезли.</text>
`);
}

// Две версии одной строки и снимок читателя, который выбирает из них ту, что
// ему полагается. Внизу — вторая половина мысли: уровни изоляции различаются
// не запретами, а тем, как часто берётся снимок. Схема существует ради того,
// чтобы стало ясно, почему читающий не ждёт пишущего вообще никогда.
function buildMvccVersions() {
  const S = "mvcc-versions";

  // Один «кадр» уровня: три коробки READ COMMITTED или одна длинная для RR.
  const shot = (x) => `
<rect class="cmdbox" x="${x}" y="222" width="92" height="32" rx="7"/>
<text class="mono" x="${x + 46}" y="238" font-size="9" text-anchor="middle">SELECT</text>
<text class="cap t-accent" x="${x + 46}" y="250" font-size="8.5" text-anchor="middle">снимок</text>`;

  return svgWrap("0 0 700 406", S, "Одна строка, несколько версий, снимок на каждого", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .verok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .vernew { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; stroke-dasharray: 5 3; }
.dg-${S} .snap { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .lvl { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .cmdbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .one { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .pick { stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .skip { stroke: var(--muted); stroke-width: 1.2; stroke-dasharray: 3 3; }
.dg-${S} .born { stroke: var(--gold); stroke-width: 1.4; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">UPDATE не меняет строку на месте — он делает новую версию</text>
<text class="cap" x="26" y="48" font-size="10.5">MILK-1L / A-01-01 / L0001: сессия A ставит 999 и транзакцию не фиксирует</text>

<text x="26" y="100" font-size="11" font-weight="600">одна строка,</text>
<text x="26" y="115" font-size="11" font-weight="600">две версии</text>
<text class="cap" x="26" y="132" font-size="10">старая никуда</text>
<text class="cap" x="26" y="146" font-size="10">не девается</text>

<rect class="verok" x="150" y="76" width="240" height="42" rx="9"/>
<text class="mono t-ok" x="170" y="98" font-size="12.5" font-weight="700">qty = 48.000</text>
<text class="cap" x="170" y="112" font-size="9.5">версия зафиксирована — годится всем</text>
${checkIcon(358, 88, 14)}
<line class="born" x1="270" y1="118" x2="270" y2="134" marker-end="url(#${S}-arrow)"/>
<text class="mono cap" x="280" y="132" font-size="9.5">UPDATE</text>
<rect class="vernew" x="150" y="138" width="240" height="42" rx="9"/>
<text class="mono t-gold" x="170" y="160" font-size="12.5" font-weight="700">qty = 999.000</text>
<text class="cap" x="170" y="174" font-size="9.5">новая версия, ещё не зафиксирована</text>
${crossIcon(358, 150, 14)}

<rect class="snap" x="420" y="76" width="254" height="104" rx="10"/>
<text x="436" y="98" font-size="10.5" font-weight="700">снимок сессии B</text>
<text class="cap" x="436" y="113" font-size="9.5">список того, чьи изменения ей видны</text>
<text class="mono t-ok" x="436" y="139" font-size="12.5" font-weight="700">читает 48.000</text>
<text class="cap" x="436" y="154" font-size="9.5">и не ждёт ни секунды</text>
<text class="cap" x="436" y="171" font-size="9.5">версия A в снимок не входит</text>
<line class="pick" x1="416" y1="97" x2="396" y2="97" marker-end="url(#${S}-arrow-accent)"/>
<line class="skip" x1="416" y1="159" x2="396" y2="159"/>

<text class="cap" x="26" y="208" font-size="11">разница между уровнями сводится к тому, как часто берётся снимок:</text>
<rect class="lvl" x="34" y="222" width="156" height="32" rx="8"/>
<text class="mono" x="112" y="242" font-size="10" text-anchor="middle">READ COMMITTED</text>
${shot(200)}${shot(304)}${shot(408)}
<text class="cap" x="516" y="236" font-size="9.5">свежий снимок</text>
<text class="cap" x="516" y="250" font-size="9.5">на каждую команду</text>

<rect class="lvl" x="34" y="272" width="156" height="32" rx="8"/>
<text class="mono" x="112" y="292" font-size="10" text-anchor="middle">REPEATABLE READ</text>
<rect class="one" x="200" y="272" width="300" height="32" rx="8"/>
<text class="cap t-accent" x="350" y="288" font-size="9.5" text-anchor="middle">снимок взят один раз, в первом запросе</text>
<text class="cap" x="350" y="300" font-size="9.5" text-anchor="middle">и держит всю транзакцию как фотографию</text>
<text class="cap" x="516" y="286" font-size="9.5">один снимок</text>
<text class="cap" x="516" y="300" font-size="9.5">на всю транзакцию</text>

<line x1="26" y1="330" x2="674" y2="330" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="352" font-size="11">Читающий не ждёт пишущего никогда: старая версия лежит на месте и никуда не денется.</text>
<text class="cap" x="26" y="372" font-size="11">И симметрично: пишущий не ждёт читающего. Ждёт только пишущий пишущего.</text>
<text class="cap" x="26" y="392" font-size="11">Отсюда и имя: MVCC, многоверсионность — версий строки несколько, каждая транзакция читает свою.</text>
`);
}

/* ---------------------------------------------------------------- d10.05 */

// Лента времени на две сессии: A занимает строку и работает, B приходит второй
// и просто висит до чужого COMMIT. Схема существует ради двух мыслей: ждёт не
// «менее важный», а пришедший вторым, и ожидание — это не ошибка, а штатное
// состояние, которое снаружи видно как active + wait_event_type = Lock.
function buildLockQueue() {
  const S = "lock-queue";
  // подпись момента и его координата на ленте времени
  // Отметки времени стоят ровно по краям коробок, иначе рядом с рамкой
  // получается вторая, чуть смещённая черта.
  const moments = [[140, "A: UPDATE"], [270, "B: UPDATE"], [466, "A: COMMIT"]];
  const ticks = moments.map(([x, label]) =>
    `<line class="colline" x1="${x}" y1="80" x2="${x}" y2="208"/>
<text class="cap" x="${x}" y="72" font-size="10" text-anchor="middle">${label}</text>`).join("\n");

  // Три факта, которые про то же ожидание видит посторонняя сессия C.
  const seen = [
    ["granted = false", "невыданная заявка", "и есть «ждёт»"],
    ["state = active", "не спит, а стоит", "в очереди на Lock"],
    ["locktype = transactionid", "ждут не строку,", "а чужую транзакцию"],
  ];
  const chips = seen.map(([code, a, b], i) => {
    const x = 34 + i * 220;
    return `<rect class="chipbox" x="${x}" y="236" width="206" height="50" rx="9"/>
<text class="mono t-accent" x="${x + 103}" y="254" font-size="10" text-anchor="middle">${code}</text>
<text class="cap" x="${x + 103}" y="269" font-size="9.5" text-anchor="middle">${a}</text>
<text class="cap" x="${x + 103}" y="282" font-size="9.5" text-anchor="middle">${b}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 382", S, "Ждёт тот, кто пришёл вторым", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .hold { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .stall { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 5 3; }
.dg-${S} .done { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .chipbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .colline { stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 4 4; }
.dg-${S} .wake { fill: none; stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Ждёт не тот, кто важнее, а тот, кто пришёл вторым</text>
<text class="cap" x="26" y="48" font-size="10.5">dbo.stock, MILK-1L / A-01-01 / L0001 — до начала там было 48.000</text>
${ticks}

<text x="26" y="115" font-size="11" font-weight="600">сессия A</text>
<rect class="hold" x="140" y="88" width="326" height="46" rx="9"/>
<text class="mono" x="152" y="108" font-size="10.5">BEGIN; UPDATE ... SET qty = 40</text>
<text class="cap" x="152" y="125" font-size="9.5">заявка на строку выдана — она пришла первой</text>
<text class="cap t-accent" x="478" y="106" font-size="10">транзакция кончилась —</text>
<text class="cap t-accent" x="478" y="122" font-size="10">заявка снята</text>

<text x="26" y="178" font-size="11" font-weight="600">сессия B</text>
<rect class="stall" x="270" y="150" width="196" height="50" rx="9"/>
<text class="mono" x="282" y="172" font-size="9.5">UPDATE ... SET qty = qty - 8</text>
<text class="cap t-bad" x="282" y="189" font-size="9.5">висит: ни ошибки, ни ответа</text>
<path class="wake" d="M466,140 L466,175 L542,175" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap t-accent" x="478" y="163" font-size="9.5">проснулась</text>
<rect class="done" x="548" y="150" width="126" height="50" rx="9"/>
<text class="cap" x="611" y="171" font-size="9.5" text-anchor="middle">перечитала: там 40</text>
<text class="mono t-ok" x="611" y="190" font-size="12.5" font-weight="700" text-anchor="middle">40 − 8 = 32</text>

<text class="cap" x="34" y="226" font-size="11">пока B висит, посторонняя сессия C видит это ожидание так:</text>
${chips}

<line x1="26" y1="308" x2="674" y2="308" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="330" font-size="11">Заявку выдают первому пришедшему; второй встаёт в очередь и просто ждёт — без ошибки и без приоритетов.</text>
<text class="cap" x="26" y="350" font-size="11">Снимает заявку конец транзакции: COMMIT или ROLLBACK, всё равно какой.</text>
<text class="cap" x="26" y="370" font-size="11">Дождавшись, B перечитала строку заново и вычла из нового значения: 40 − 8 = 32, а не 48 − 8.</text>
`);
}

// Одна и та же таблица, занятая на четырёх уровнях: строка, страница, таблица,
// база. Схема существует ради того, чтобы «гранулярность» перестала быть словом:
// видно, сколько чужой работы каждый уровень заодно перекрывает, и отдельно
// оговорено, что страничного уровня в обычной работе PostgreSQL нет.
function buildLockGranularity() {
  const S = "lock-granularity";
  const CX = [98, 266, 434, 602];   // центры четырёх панелей шириной 148
  const CELL = 30, CH = 18, DEMO_PROJECT = 3;
  const gx = (c, col) => CX[c] - 64.5 + col * (CELL + DEMO_PROJECT);
  const gy = (row) => 96 + row * (CH + DEMO_PROJECT);

  // Сетка 4x3 — таблица из двенадцати строк; hot решает, какие клетки заняты.
  const grid = (c, hot) => {
    let out = "";
    for (let r = 0; r < 3; r += 1) {
      for (let col = 0; col < 4; col += 1) {
        const on = hot(r, col);
        out += `<rect class="${on ? "hit" : "idle"}" x="${gx(c, col)}" y="${gy(r)}" width="${CELL}" height="${CH}" rx="3"/>\n`;
      }
    }
    return out;
  };

  const panels = [
    ["строка", grid(0, (r, col) => r === 1 && col === 2), ["занята одна ячейка остатка"]],
    ["страница", grid(1, (r) => r === 1)
      + `<rect class="pagebox" x="${gx(1, 0) - 4}" y="${gy(1) - 4}" width="137" height="26" rx="6"/>`,
      ["блок 8 КБ,", "а в нём десятки строк"]],
    ["таблица", grid(2, () => true), ["вся dbo.stock целиком"]],
    ["база", ["dbo.stock", "dbo.orders", "dbo.sku"].map((t, i) =>
      `<rect class="hit" x="${CX[3] - 64.5}" y="${96 + i * 21}" width="129" height="18" rx="3"/>
<text class="mono t-accent" x="${CX[3]}" y="${109 + i * 21}" font-size="8.5" text-anchor="middle">${t}</text>`).join("\n"),
      ["все таблицы разом —", "DROP DATABASE и родня"]],
  ];

  const body = panels.map(([name, art, caps], i) => `
<text x="${CX[i]}" y="80" font-size="11.5" font-weight="700" text-anchor="middle">${name}</text>
${art}
${caps.map((s, k) => `<text class="cap" x="${CX[i]}" y="${174 + k * 14}" font-size="9.5" text-anchor="middle">${s}</text>`).join("\n")}`).join("\n");

  return svgWrap("0 0 700 388", S, "Четыре уровня, на которых ставят заявку", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .idle { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .hit { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .pagebox { fill: none; stroke: var(--accent); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .axis { stroke: var(--muted); stroke-width: 1.2; }
.dg-${S} .note { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Заявку ставят не только на строку: уровней четыре</text>
<text class="cap" x="26" y="48" font-size="10.5">выбор уровня и называется гранулярностью блокировки</text>
${body}

<line class="axis" x1="44" y1="212" x2="656" y2="212" marker-start="url(#${S}-arrow)" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="180" y="232" font-size="10.5" text-anchor="middle">мельче — параллелизма больше, учёт дороже</text>
<text class="cap" x="520" y="232" font-size="10.5" text-anchor="middle">крупнее — параллелизма меньше, учёт дешевле</text>

<rect class="note" x="26" y="252" width="648" height="60" rx="9"/>
<text x="44" y="275" font-size="10.5" font-weight="600">В PostgreSQL рабочих уровня два — таблица и строка, и устроены они принципиально по-разному.</text>
<text class="cap" x="44" y="295" font-size="10.5">Страничных блокировок для обычной работы он не берёт: страница мелькает лишь внутри механизмов индексов.</text>

<line x1="26" y1="332" x2="674" y2="332" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="354" font-size="11">Два отборщика в разных ячейках не мешают друг другу вообще — ради этого и нужен мелкий уровень.</text>
<text class="cap" x="26" y="374" font-size="11">Плата за мелкость — учёт: на каждую занятую строку нужна своя запись, а записи занимают память сервера.</text>
`);
}

/* ---------------------------------------------------------------- реестр */

export const REGISTRY = {
  "acid-wait-line": {
    id: "acid-wait-line",
    title: "Чем платят за четыре обещания",
    caption: "Сверху B честно ждёт чужого COMMIT и считает по свежему — сходится 35. Снизу тот же конфликт без ожидания: списание A испаряется, и ни одна команда не жалуется.",
    anchor: "За четыре обещания платят ожиданием",
    svg: buildAcidWaitLine(),
  },
  "ac-two-modes": {
    id: "ac-two-modes",
    title: "Кто закрывает транзакцию: сервер или ты",
    caption: "Сверху транзакцию открывает и закрывает сервер, снизу — ты. Один и тот же зонд из соседней сессии видит разное, и меняется не только значение, но и state сессии.",
    anchor: "Что здесь произошло",
    svg: buildAcTwoModes(),
  },
  "wal-order": {
    id: "wal-order",
    title: "Куда уходит правка и в каком порядке",
    caption: "Память меняется сразу, журнал — сразу же следом, а файл данных не трогают вовсе. COMMIT дожидается диска журнала и на этом заканчивается.",
    anchor: "Что здесь произошло",
    svg: buildWalOrder(),
  },
  "wal-checkpoint": {
    id: "wal-checkpoint",
    title: "Контрольная точка режет журнал надвое",
    caption: "Слева от отметки сегменты уже не нужны и уйдут в переиспользование, справа лежит всё, чего может не быть в файлах данных. Отсюда и читают журнал после сбоя.",
    anchor: "Контрольная точка: с какого места читать журнал",
    svg: buildWalCheckpoint(),
  },
  "wal-holders": {
    id: "wal-holders",
    title: "Кто держит журнал и не даёт его переиспользовать",
    caption: "Одна закладка замораживает весь журнал правее себя. Претендентов на роль держателя всего четыре, и половина из них бывает только в одной из двух СУБД.",
    anchor: "Почему журнал растёт и не освобождается",
    svg: buildWalHolders(),
  },
  "lost-update-lane": {
    id: "lost-update-lane",
    title: "Потерянное обновление: очередь была, данные пропали",
    caption: "Обе сессии прочитали 120, B честно отстояла очередь — и записала число, посчитанное из устаревшего чтения. Дорожка внизу показывает, что 40 прожило ровно один шаг.",
    anchor: "Что здесь произошло",
    svg: buildLostUpdateLane(),
  },
  "mvcc-versions": {
    id: "mvcc-versions",
    title: "Одна строка, несколько версий, снимок на каждого",
    caption: "UPDATE делает новую версию, старая остаётся на месте — поэтому читателю нечего ждать. Внизу: уровни изоляции различаются лишь тем, как часто берётся снимок.",
    anchor: "В PostgreSQL изоляция сделана на версиях строк",
    svg: buildMvccVersions(),
  },
  "lock-queue": {
    id: "lock-queue",
    title: "Ждёт тот, кто пришёл вторым",
    caption: "Первая сессия заняла строку и работает, вторая висит до чужого COMMIT — без ошибки и без приоритетов. Проснувшись, она перечитывает строку заново, поэтому в итоге и выходит 32.",
    anchor: "Что здесь произошло",
    svg: buildLockQueue(),
  },
  "lock-granularity": {
    id: "lock-granularity",
    title: "Четыре уровня, на которых ставят заявку",
    caption: "Одна и та же таблица, занятая на четырёх уровнях подряд. Видно и выигрыш мелкой гранулярности, и её цену — и то, что страничного уровня в обычной работе PostgreSQL нет.",
    anchor: "Заявку ставят не только на строку",
    svg: buildLockGranularity(),
  },
};

// Привязка схем к нодам: код ноды -> список id.
export const INDEX = {
  "d10.01": ["acid-wait-line"],
  "d10.02": ["ac-two-modes"],
  "d10.03": ["wal-order", "wal-checkpoint", "wal-holders"],
  "d10.04": ["lost-update-lane", "mvcc-versions"],
  "d10.05": ["lock-queue", "lock-granularity"],
};
