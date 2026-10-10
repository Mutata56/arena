// diagrams-sql-03.js
// Схемы этапа 3: соединения таблиц и операции над множествами.
//
// Оснастка общая (diagrams-sql-kit.js), правила те же: самодостаточный модуль,
// цвета только через CSS-переменные страницы, никакого JS внутри SVG.
// Образец стиля — diagrams-sql-02.js.

import { arrowDefs, checkIcon, crossIcon, svgWrap } from "./diagrams-sql-kit.js";

/* ---------------------------------------------------------------- d3.01 */

// Механика соединения на одной строке: движок берёт строку из dbo.stock,
// примеряет к ней каждую строку dbo.sku и на каждой паре спрашивает предикат
// из ON. Схема существует ради того, чтобы стало видно: решение принимается
// не про колонки, а про пары строк, и в результат уходит только та пара,
// на которой предикат сказал «да».
function buildJoinPairs() {
  const S = "join-pairs";
  // Правая таблица в том порядке, в каком её перебирает движок. Совпала
  // ровно одна строка — та, у которой артикул тот же.
  const scan = [
    ["BREAD-DARK", false, false],
    ["KEFIR-05", false, false],
    ["APPLE-KG", true, false],
    ["MILK-1L", false, false],
    ["…ещё 8 строк", false, true],
  ];

  const rows = scan.map(([name, hit, ghost], i) => {
    const y = 96 + i * 34;
    const cy = y + 13;
    const box = hit ? "hot" : ghost ? "ghost" : "row";
    const tail = hit
      ? `<line class="pass" x1="414" y1="${cy}" x2="434" y2="${cy}" marker-end="url(#${S}-arrow-accent)"/>`
      : `<line class="dead" x1="414" y1="${cy}" x2="434" y2="${cy}"/>`;
    return `<path class="${hit ? "hotwire" : "wire"}" d="M182,177 C190,177 190,${cy} 194,${cy}" marker-end="url(#${S}-arrow${hit ? "-accent" : ""})"/>
<rect class="${box}" x="198" y="${y}" width="138" height="26" rx="7"/>
<text class="${ghost ? "cap" : "mono"}" x="208" y="${cy + 4}" font-size="${ghost ? 10 : 11}">${name}</text>
<rect class="pill ${hit ? "p-ok" : "p-off"}" x="352" y="${y + 2}" width="58" height="22" rx="7"/>
<text class="${hit ? "t-ok" : "cap"}" x="381" y="${cy + 4}" font-size="11" font-weight="${hit ? 700 : 400}" text-anchor="middle">${hit ? "да" : "нет"}</text>
${tail}`;
  }).join("\n");

  return svgWrap("0 0 700 348", S, "Соединение перебирает пары строк", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .ghost { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .hot { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.6; }
.dg-${S} .src { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .out { fill: var(--paper); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .half { fill: var(--accent-soft); stroke: none; }
.dg-${S} .pill { stroke-width: 1.3; }
.dg-${S} .p-ok { fill: var(--ok-soft); stroke: var(--ok); }
.dg-${S} .p-off { fill: var(--sunk); stroke: var(--line-soft); }
.dg-${S} .wire { fill: none; stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .hotwire { fill: none; stroke: var(--ok); stroke-width: 1.6; }
.dg-${S} .pass { stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .dead { stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 3 4; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Движок берёт одну строку слева и примеряет к ней каждую строку справа</text>
<text class="mono" x="24" y="50" font-size="12">ON k.skuid = s.skuid</text>

<text class="cap" x="24" y="82" font-size="10.5">строка слева, из dbo.stock</text>
<text class="cap" x="198" y="82" font-size="10.5">dbo.sku — примеряем каждую строку</text>
<text class="cap" x="440" y="82" font-size="10.5">результат — по строке на пару</text>

<rect class="src" x="24" y="152" width="156" height="50" rx="9"/>
<text class="mono" x="34" y="176" font-size="12.5">APPLE-KG</text>
<text class="cap" x="34" y="193" font-size="9.5">C-01-01 · L0009 · 55.500</text>

${rows}

<rect class="out" x="438" y="150" width="238" height="54" rx="9"/>
<rect class="half" x="439.5" y="151.5" width="235" height="25" rx="7"/>
<text class="mono t-accent" x="448" y="169" font-size="9.5">APPLE-KG · Яблоки Голден весовые</text>
<text class="mono" x="448" y="196" font-size="9.5">C-01-01 · L0009 · 55.500</text>

<line x1="24" y1="286" x2="676" y2="286" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="308" font-size="11">Пара образуется там, где предикат из ON сказал «да» — не «не нет», а именно «да».</text>
<text class="cap" x="24" y="328" font-size="11">Каждая такая пара даёт ровно одну строку результата, и колонки в неё берутся из обеих её половин.</text>
`);
}

// Одна строка справочника, три строки остатков — три строки результата;
// рядом чай, у которого пар нет совсем, и потому нет ни одной строки.
// Схема существует ради мысли, что JOIN не приклеивает колонку к строке,
// а образует пары: приклеивание не умеет ни размножать, ни терять.
function buildJoinFanout() {
  const S = "join-fanout";
  const milk = [
    ["A-01-01 · L0001", "48.000"],
    ["A-01-01 · L0002", "60.000"],
    ["B-01-01 · L0013", "120.000"],
  ];

  const bandA = milk.map(([where, qty], i) => {
    const y = 94 + i * 34;
    const cy = y + 13;
    return `<path class="wire" d="M222,141 C232,141 236,${cy} 252,${cy}" marker-end="url(#${S}-arrow)"/>
<rect class="row" x="256" y="${y}" width="148" height="26" rx="7"/>
<text class="mono" x="264" y="${cy + 4}" font-size="10">${where}</text>
<line class="pass" x1="408" y1="${cy}" x2="432" y2="${cy}" marker-end="url(#${S}-arrow-accent)"/>
<rect class="out" x="436" y="${y}" width="240" height="26" rx="7"/>
<line class="seam" x1="618" y1="${y}" x2="618" y2="${y + 26}"/>
<rect class="half" x="437.5" y="${y + 1.5}" width="180" height="23" rx="6"/>
<text class="mono t-accent" x="442" y="${cy + 4}" font-size="9.5">Молоко пастеризованное 3.2% 1л</text>
<text class="mono" x="647" y="${cy + 4}" font-size="10" text-anchor="middle">${qty}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 362", S, "Одна строка слева, три пары справа", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .src { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .out { fill: var(--paper); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .half { fill: var(--accent-soft); stroke: none; }
.dg-${S} .seam { stroke: var(--accent); stroke-width: 1; }
.dg-${S} .empty { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .none { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .wire { fill: none; stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pass { stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .dead { stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 3 4; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Строка слева даёт столько строк результата, сколько ей нашлось пар справа</text>
<text class="cap" x="24" y="48" font-size="11">Ни одной пары — ни одной строки. Три пары — три строки, и левая половина повторится в каждой.</text>

<text class="cap" x="24" y="80" font-size="10.5">dbo.sku — справочник</text>
<text class="cap" x="256" y="80" font-size="10.5">dbo.stock — пары по skuid</text>
<text class="cap" x="436" y="80" font-size="10.5">результат</text>

<rect class="src" x="24" y="119" width="196" height="44" rx="9"/>
<text class="mono" x="34" y="137" font-size="12">MILK-1L</text>
<text class="cap" x="34" y="154" font-size="9.5">Молоко пастеризованное 3.2% 1л</text>
${bandA}
<text class="cap" x="24" y="204" font-size="10.5">одна строка слева × три пары справа = три строки результата</text>

<line class="split" x1="24" y1="216" x2="676" y2="216"/>

<rect class="src" x="24" y="227" width="196" height="44" rx="9"/>
<text class="mono" x="34" y="245" font-size="12">TEA-100</text>
<text class="cap" x="34" y="262" font-size="9.5">Чай чёрный листовой 100г</text>
<path class="wire" d="M222,249 C232,249 236,249 252,249" marker-end="url(#${S}-arrow)"/>
<rect class="empty" x="256" y="232" width="148" height="34" rx="8"/>
<text class="cap" x="330" y="253" font-size="10" text-anchor="middle">ни одной строки</text>
<line class="dead" x1="408" y1="249" x2="432" y2="249"/>
<rect class="none" x="436" y="232" width="240" height="34" rx="8"/>
${crossIcon(450, 242, 14)}
<text class="cap t-bad" x="474" y="253" font-size="10.5">ни одной строки результата</text>
<text class="cap" x="24" y="290" font-size="10.5">одна строка слева × ноль пар = чая в отчёте нет вообще, молча</text>

<line x1="24" y1="304" x2="676" y2="304" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="326" font-size="11">База ничего не задублировала: в справочнике как была одна строка молока, так и осталась.</text>
<text class="cap" x="24" y="346" font-size="11">Приклеивание колонок не умеет ни размножать строки, ни терять их. Образование пар умеет и то, и другое.</text>
`);
}

/* ---------------------------------------------------------------- d3.02 */

// Результат LEFT JOIN построчно: слева таблица берётся целиком, справа встаёт
// то, что нашлось, а строке без пары движок дописывает NULL сразу во все
// колонки правой таблицы. Схема существует ради того, чтобы стало видно:
// заглушка — это не данные из таблицы, а ответ «пары не нашлось».
function buildLeftJoinFill() {
  const S = "left-join-fill";
  // skuid, loc, lot, qty, есть ли пара
  const res = [
    ["KEFIR-05", "C-01-01", "L0003", "40.000", true],
    ["MILK-1L", "A-01-01", "L0001", "48.000", true],
    ["MILK-1L", "A-01-01", "L0002", "60.000", true],
    ["MILK-1L", "B-01-01", "L0013", "120.000", true],
    ["TEA-100", "NULL", "NULL", "NULL", false],
  ];

  const rows = res.map(([sku, loc, lot, qty, pair], i) => {
    const y = 124 + i * 32;
    const cy = y + 14;
    const fill = pair ? "" : `<rect class="nullcell" x="314" y="${y + 2}" width="278" height="24" rx="6"/>`;
    return `<line class="tie" x1="178" y1="${cy}" x2="202" y2="${cy}"/>
<rect class="${pair ? "row" : "orphan"}" x="206" y="${y}" width="390" height="28" rx="8"/>
${fill}
<text class="mono" x="216" y="${cy + 4}" font-size="10.5">${sku}</text>
<text class="mono ${pair ? "" : "t-gold"}" x="320" y="${cy + 4}" font-size="10.5">${loc}</text>
<text class="mono ${pair ? "" : "t-gold"}" x="412" y="${cy + 4}" font-size="10.5">${lot}</text>
<text class="mono ${pair ? "" : "t-gold"}" x="496" y="${cy + 4}" font-size="10.5">${qty}</text>
<text class="cap ${pair ? "" : "t-gold"}" x="606" y="${cy + 4}" font-size="10">${pair ? "пара" : "нет пары"}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 376", S, "LEFT JOIN дописывает строку без пары", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .orphan { fill: var(--paper); stroke: var(--gold); stroke-width: 1.5; }
.dg-${S} .nullcell { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1; stroke-dasharray: 3 3; }
.dg-${S} .src { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .srcgold { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.5; }
.dg-${S} .bandl { fill: var(--accent-soft); stroke: none; }
.dg-${S} .bandr { fill: var(--sunk); stroke: none; }
.dg-${S} .tie { stroke: var(--line); stroke-width: 1.1; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Левая таблица берётся целиком: строка без пары тоже попадает в результат</text>
<text class="mono" x="24" y="50" font-size="11">FROM dbo.sku k LEFT JOIN dbo.stock s ON s.skuid = k.skuid</text>

<text class="cap" x="24" y="90" font-size="10.5">dbo.sku целиком</text>
<rect class="bandl" x="206" y="76" width="104" height="20" rx="6"/>
<text class="cap" x="258" y="90" font-size="9.5" text-anchor="middle">из левой</text>
<rect class="bandr" x="314" y="76" width="282" height="20" rx="6"/>
<text class="cap" x="455" y="90" font-size="9.5" text-anchor="middle">из правой — или заглушка, если пары нет</text>

<text class="cap" x="216" y="114" font-size="10">skuid</text>
<text class="cap" x="320" y="114" font-size="10">loc</text>
<text class="cap" x="412" y="114" font-size="10">lot</text>
<text class="cap" x="496" y="114" font-size="10">qty</text>

<rect class="src" x="24" y="124" width="150" height="28" rx="8"/>
<text class="mono" x="34" y="142" font-size="11">KEFIR-05</text>
<rect class="src" x="24" y="156" width="150" height="92" rx="8"/>
<text class="mono" x="34" y="176" font-size="11">MILK-1L</text>
<text class="cap" x="34" y="193" font-size="9.5">три партии в остатках</text>
<rect class="srcgold" x="24" y="252" width="150" height="28" rx="8"/>
<text class="mono t-gold" x="34" y="270" font-size="11">TEA-100</text>
${rows}

<line x1="24" y1="300" x2="676" y2="300" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="322" font-size="11">Строка без пары не выбрасывается: LEFT JOIN всё равно отдаёт её, а колонки правой таблицы заполняет NULL.</text>
<text class="cap" x="24" y="342" font-size="11">Эти NULL нигде не хранятся — в dbo.stock все колонки объявлены NOT NULL. Они родились в момент соединения.</text>
<text class="cap" x="24" y="362" font-size="11">Заглушка значит ровно одно: «пары не нашлось». Не «остаток нулевой» и не «ячейка неизвестна».</text>
`);
}

// Три внешних соединения в одной таблице сравнения: строки распадаются на три
// сорта, и вся разница между LEFT, RIGHT и FULL — в судьбе крайних сортов.
// Схема существует ради того, чтобы RIGHT перестал казаться отдельным зверем:
// он то же самое, только зеркально.
function buildOuterThree() {
  const S = "outer-three";
  // сорт строк: подпись и пояснение
  const kinds = [
    ["строки только слева", "пары справа нет"],
    ["пары", "совпало по ON"],
    ["строки только справа", "пары слева нет"],
  ];
  // панель: заголовок, что берётся целиком, судьба каждого сорта
  const panels = [
    ["LEFT JOIN", "левая целиком", [["keep", "остаётся,", "справа NULL"], ["keep", "остаются как есть", ""], ["drop", "пропадают", ""]]],
    ["RIGHT JOIN", "правая целиком", [["drop", "пропадают", ""], ["keep", "остаются как есть", ""], ["keep", "остаётся,", "слева NULL"]]],
    ["FULL OUTER JOIN", "обе целиком", [["keep", "остаётся,", "справа NULL"], ["keep", "остаются как есть", ""], ["keep", "остаётся,", "слева NULL"]]],
  ];

  const legend = kinds.map(([a, b], i) => {
    const cy = 158 + i * 52;
    return `<text class="cap" x="156" y="${cy - 2}" font-size="10" text-anchor="end" font-weight="600">${a}</text>
<text class="cap" x="156" y="${cy + 13}" font-size="9.5" text-anchor="end">${b}</text>`;
  }).join("\n");

  const grid = panels.map(([name, sub, cells], p) => {
    const x = 170 + p * 170;
    const head = `<rect class="head" x="${x}" y="86" width="150" height="40" rx="9"/>
<text class="mono" x="${x + 75}" y="106" font-size="11" font-weight="700" text-anchor="middle">${name}</text>
<text class="cap" x="${x + 75}" y="121" font-size="9.5" text-anchor="middle">${sub}</text>`;
    const body = cells.map(([st, l1, l2], i) => {
      const y = 136 + i * 52;
      const cy = y + 22;
      const icon = st === "keep" ? checkIcon(x + 12, cy - 7, 14) : crossIcon(x + 12, cy - 7, 14);
      const txt = l2
        ? `<text class="cap" x="${x + 36}" y="${cy - 2}" font-size="9.5">${l1}</text>
<text class="cap" x="${x + 36}" y="${cy + 12}" font-size="9.5">${l2}</text>`
        : `<text class="cap" x="${x + 36}" y="${cy + 4}" font-size="9.5">${l1}</text>`;
      return `<rect class="${st}" x="${x}" y="${y}" width="150" height="44" rx="9"/>
${icon}
${txt}`;
    }).join("\n");
    return head + "\n" + body;
  }).join("\n");

  return svgWrap("0 0 700 384", S, "Три внешних соединения рядом", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .head { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .keep { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .drop { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Строки распадаются на три сорта, и вся разница — в судьбе крайних</text>
<text class="cap" x="24" y="48" font-size="11">Внешнее соединение отличается от внутреннего ровно одним: оно сохраняет строки без пары.</text>

${legend}
${grid}

<line x1="24" y1="308" x2="676" y2="308" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="330" font-size="11">a RIGHT JOIN b — это ровно b LEFT JOIN a: условие в ON не трогается, местами меняются только таблицы.</text>
<text class="cap" x="24" y="350" font-size="11">Поэтому в живом коде пишут LEFT: сохраняемая таблица стоит первой и запрос читается сверху вниз.</text>
<text class="cap" x="24" y="370" font-size="11">FULL оправдан ровно там, где сироты возможны с обеих сторон, — а это сверка двух независимых источников.</text>
`);
}

// Антисоединение: LEFT JOIN даёт и пары, и сирот, а WHERE по колонке правой
// таблицы IS NULL оставляет ровно сирот. Схема существует ради того, чтобы
// было видно, откуда берётся сама возможность: пустой колонка правой таблицы
// бывает только у строки, которой пары не нашлось.
function buildAntiJoin() {
  const S = "anti-join";
  // k.skuid, s.skuid, сирота ли, призрачная ли строка (свёрнутый хвост)
  const rows = [
    ["KEFIR-05", "KEFIR-05", false, false],
    ["MILK-1L", "MILK-1L", false, false],
    ["SUGAR-1KG", "SUGAR-1KG", false, false],
    ["TEA-100", "NULL", true, false],
    ["…ещё 10 пар", "…", false, true],
  ];

  const body = rows.map(([l, r, orphan, ghost], i) => {
    const y = 104 + i * 30;
    const cy = y + 13;
    return `<rect class="${orphan ? "orphan" : ghost ? "ghost" : "row"}" x="24" y="${y}" width="250" height="26" rx="7"/>
<text class="${ghost ? "cap" : "mono"}" x="34" y="${cy + 4}" font-size="10">${l}</text>
<rect class="${orphan ? "nullcell" : "cell"}" x="160" y="${y + 3}" width="106" height="20" rx="5"/>
<text class="mono ${orphan ? "t-gold" : ghost ? "faded" : ""}" x="213" y="${cy + 4}" font-size="10" text-anchor="middle">${r}</text>
<line class="flow" x1="278" y1="${cy}" x2="296" y2="${cy}" marker-end="url(#${S}-arrow)"/>
${orphan ? `<line class="pass" x1="412" y1="${cy}" x2="434" y2="${cy}" marker-end="url(#${S}-arrow-accent)"/>` : ""}`;
  }).join("\n");

  return svgWrap("0 0 700 410", S, "Антисоединение оставляет ровно сирот", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .faded { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .ghost { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .orphan { fill: var(--paper); stroke: var(--gold); stroke-width: 1.5; }
.dg-${S} .cell { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .nullcell { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.1; stroke-dasharray: 3 3; }
.dg-${S} .gate { fill: var(--sunk); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .out { fill: var(--paper); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .tmpl { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pass { stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Пустая колонка правой таблицы бывает только у строки без пары</text>
<text class="mono" x="24" y="50" font-size="11">FROM dbo.sku k LEFT JOIN dbo.stock s ON s.skuid = k.skuid</text>

<text class="cap" x="24" y="76" font-size="10.5">результат LEFT JOIN — 13 пар и одна сирота</text>
<text class="cap" x="34" y="94" font-size="9.5">k.skuid</text>
<text class="cap" x="213" y="94" font-size="9.5" text-anchor="middle">s.skuid</text>
<text class="cap" x="440" y="94" font-size="10.5">остались ровно сироты</text>

${body}

<rect class="gate" x="300" y="98" width="110" height="158" rx="12"/>
<text class="mono" x="355" y="124" font-size="11.5" font-weight="700" text-anchor="middle">WHERE</text>
<text class="mono" x="355" y="146" font-size="10.5" text-anchor="middle">s.skuid</text>
<text class="mono" x="355" y="162" font-size="10.5" text-anchor="middle">IS NULL</text>
<text class="cap" x="355" y="196" font-size="9.5" text-anchor="middle">пропускает только</text>
<text class="cap" x="355" y="211" font-size="9.5" text-anchor="middle">заглушки, то есть</text>
<text class="cap" x="355" y="226" font-size="9.5" text-anchor="middle">строки без пары</text>

<rect class="out" x="436" y="186" width="240" height="42" rx="9"/>
<text class="mono" x="448" y="206" font-size="11">TEA-100</text>
<text class="cap" x="448" y="222" font-size="9.5">Чай чёрный листовой 100г</text>

<rect class="tmpl" x="24" y="276" width="300" height="76" rx="9"/>
<text class="cap" x="36" y="298" font-size="10">шаблон, который стоит выучить наизусть</text>
<text class="mono" x="36" y="318" font-size="10.5">FROM левая</text>
<text class="mono" x="36" y="334" font-size="10.5">LEFT JOIN правая ON условие</text>
<text class="mono" x="36" y="350" font-size="10.5">WHERE правая.колонка IS NULL</text>

<text class="cap" x="344" y="298" font-size="11">Обычное соединение отвечает «что с чем совпало».</text>
<text class="cap" x="344" y="318" font-size="11">Антисоединение — «а чего нет».</text>
<text class="cap" x="344" y="338" font-size="11">Меняются только имена таблиц и условие в ON.</text>

<line x1="24" y1="372" x2="676" y2="372" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="394" font-size="11">Тем же шаблоном спрашивают «ячейка без товара» и «партия, по которой не было отбора».</text>
`);
}

// Один и тот же LEFT JOIN до и после невинной правки: условие по правой
// таблице переехало в WHERE. Схема существует ради того, чтобы стало видно,
// почему сирота гибнет — не «не прошёл проверку», а «проверять было нечем»:
// сравнение с заглушкой даёт UNKNOWN, а WHERE открывается только на TRUE.
function buildLeftToInner() {
  const S = "left-to-inner";
  // skuid, qty, предикат, исход, прошла ли
  const rows = [
    ["KEFIR-05", "40.000", "40.000 &lt;&gt; 0", "TRUE", true],
    ["MILK-1L", "48.000", "48.000 &lt;&gt; 0", "TRUE", true],
    ["MILK-1L", "60.000", "60.000 &lt;&gt; 0", "TRUE", true],
    ["MILK-1L", "120.000", "120.000 &lt;&gt; 0", "TRUE", true],
    ["TEA-100", "NULL", "NULL &lt;&gt; 0", "UNKNOWN", false],
  ];

  const body = rows.map(([sku, qty, pred, verdict, pass], i) => {
    const y = 100 + i * 40;
    const cy = y + 16;
    const isNull = qty === "NULL";
    const gate = pass
      ? `<line class="pass" x1="472" y1="${cy}" x2="560" y2="${cy}" marker-end="url(#${S}-arrow-accent)"/>`
      : `<line class="stop" x1="472" y1="${cy}" x2="488" y2="${cy}"/>
<rect class="gatebar" x="490" y="${cy - 3}" width="44" height="6" rx="3"/>`;
    return `<rect class="${isNull ? "orphan" : "row"}" x="24" y="${y}" width="160" height="32" rx="8"/>
<text class="mono" x="34" y="${cy + 4}" font-size="10.5">${sku}</text>
<rect class="${isNull ? "nullcell" : "cell"}" x="112" y="${y + 6}" width="62" height="20" rx="5"/>
<text class="mono ${isNull ? "t-gold" : ""}" x="143" y="${cy + 4}" font-size="10" text-anchor="middle">${qty}</text>
<line class="flow" x1="188" y1="${cy}" x2="204" y2="${cy}" marker-end="url(#${S}-arrow)"/>
<rect class="pred" x="208" y="${y}" width="124" height="32" rx="8"/>
<text class="mono" x="270" y="${cy + 4}" font-size="10.5" text-anchor="middle">${pred}</text>
<line class="flow" x1="336" y1="${cy}" x2="352" y2="${cy}" marker-end="url(#${S}-arrow)"/>
<rect class="pill ${pass ? "p-ok" : "p-gold"}" x="356" y="${y}" width="86" height="32" rx="8"/>
<text class="${pass ? "t-ok" : "t-gold"}" x="399" y="${cy + 4}" font-size="11" font-weight="700" text-anchor="middle">${verdict}</text>
<line class="flow" x1="446" y1="${cy}" x2="464" y2="${cy}" marker-end="url(#${S}-arrow)"/>
<line class="post" x1="490" y1="${cy - 14}" x2="490" y2="${cy + 14}"/>
<line class="post" x1="534" y1="${cy - 14}" x2="534" y2="${cy + 14}"/>
${gate}
${pass ? checkIcon(568, cy - 7, 14) : crossIcon(568, cy - 7, 14)}
<text class="cap ${pass ? "t-ok" : "t-gold"}" x="592" y="${cy + 4}" font-size="10.5">${pass ? "прошла" : "отброшена"}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 392", S, "LEFT схлопывается в INNER", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .orphan { fill: var(--paper); stroke: var(--gold); stroke-width: 1.5; }
.dg-${S} .cell { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .nullcell { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.1; stroke-dasharray: 3 3; }
.dg-${S} .pred { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pill { stroke-width: 1.5; }
.dg-${S} .p-ok { fill: var(--ok-soft); stroke: var(--ok); }
.dg-${S} .p-gold { fill: var(--gold-soft); stroke: var(--gold); }
.dg-${S} .gate { fill: var(--sunk); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pass { stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .stop { stroke: var(--muted); stroke-width: 1.2; }
.dg-${S} .post { stroke: var(--muted); stroke-width: 2; stroke-linecap: round; }
.dg-${S} .gatebar { fill: var(--bad); }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Слово LEFT осталось в запросе, а дописанной строки в результате уже нет</text>
<text class="mono" x="24" y="50" font-size="11">LEFT JOIN dbo.stock s ON s.skuid = k.skuid   ...   WHERE s.qty &lt;&gt; 0</text>

<rect class="gate" x="470" y="94" width="84" height="196" rx="12"/>
<text class="cap" x="24" y="88" font-size="10">строка после LEFT JOIN</text>
<text class="cap" x="270" y="88" font-size="10" text-anchor="middle">что дал предикат</text>
<text class="cap" x="399" y="88" font-size="10" text-anchor="middle">исход</text>
<text class="mono" x="512" y="88" font-size="11" font-weight="700" text-anchor="middle">WHERE</text>
${body}
<text class="cap" x="512" y="306" font-size="9.5" text-anchor="middle">открыт только на TRUE</text>

<line x1="24" y1="322" x2="676" y2="322" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="344" font-size="11">У сироты в s.qty стоит заглушка. Сравнение с заглушкой даёт UNKNOWN, а WHERE открывается только на TRUE.</text>
<text class="cap" x="24" y="364" font-size="11">Сирота отброшен не потому, что не прошёл проверку на количество, а потому, что проверить его было нечем.</text>
<text class="cap" x="24" y="384" font-size="11">Дело не в операторе: так же убьёт s.qty &gt; 0, s.loc = 'A-01-01', s.lot LIKE 'L%'. Место такого условия — в ON.</text>
`);
}

/* ---------------------------------------------------------------- d3.03 */

// Одно и то же условие на двух разных ступенях. Слева оно стоит в ON и решает,
// кто кому пара; справа — в WHERE и режет уже собранный результат вместе с
// дописанными строками. Схема существует ради того, чтобы стало видно: между
// ступенями есть момент, когда соединение готово, а фильтрация ещё не начиналась.
function buildOnVsWhere() {
  const S = "on-vs-where";
  // Колонка: сдвиг по x, заголовок-запрос, что делает ON, чипы после ON,
  // что делает WHERE, чипы после WHERE, итог в двух строках.
  const cols = [
    {
      x: 24, tone: "ok",
      head: "ON ... AND pd.status = 'PICKED'",
      on: "условие здесь: оно решает, кто кому пара",
      onChips: [["пары — 4", "chip"], ["сироты дописаны — 4", "chip"]],
      where: "условия нет — резать нечем",
      whereChips: [["все 8 строк проходят дальше", "chip"]],
      out: ["6 заказов из 6", "ни один не пропал"],
    },
    {
      x: 374, tone: "bad",
      head: "WHERE pd.status = 'PICKED'",
      on: "здесь только ключ: сироты дописываются как есть",
      onChips: [["пары — 5", "chip"], ["сироты дописаны — 3", "chip"]],
      where: "условие здесь: режет готовые строки",
      whereChips: [["пара SHIPPED → FALSE", "cut"], ["сироты → UNKNOWN", "cut"]],
      out: ["2 заказа из 6", "четыре пропали молча"],
    },
  ];

  const lanes = cols.map((c) => {
    const L = c.x, C = L + 151;
    const chips = (list, y) => {
      const w = list.length === 1 ? 278 : 138;
      return list.map(([label, cls], i) => {
        const x = L + 12 + i * 140;
        return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="26" rx="7"/>
<text class="cap ${cls === "cut" ? "t-bad" : ""}" x="${x + w / 2}" y="${y + 17}" font-size="9.5" text-anchor="middle">${label}</text>`;
      }).join("\n");
    };
    return `<rect class="head h-${c.tone}" x="${L}" y="72" width="302" height="28" rx="8"/>
<text class="mono t-${c.tone}" x="${C}" y="91" font-size="11" text-anchor="middle">${c.head}</text>

<rect class="stage" x="${L}" y="112" width="302" height="80" rx="10"/>
<text class="cap" x="${L + 12}" y="130" font-size="10.5" font-weight="600">ступень 1 — FROM ... LEFT JOIN ... ON</text>
<text class="cap" x="${L + 12}" y="147" font-size="9.5">${c.on}</text>
${chips(c.onChips, 156)}
<line class="flow" x1="${C}" y1="192" x2="${C}" y2="210" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="${C + 12}" y="206" font-size="9.5">8 строк вперемешку</text>

<rect class="stage" x="${L}" y="214" width="302" height="80" rx="10"/>
<text class="cap" x="${L + 12}" y="232" font-size="10.5" font-weight="600">ступень 2 — WHERE</text>
<text class="cap" x="${L + 12}" y="249" font-size="9.5">${c.where}</text>
${chips(c.whereChips, 258)}
<line class="flow" x1="${C}" y1="294" x2="${C}" y2="312" marker-end="url(#${S}-arrow)"/>

<rect class="out o-${c.tone}" x="${L}" y="314" width="302" height="42" rx="9"/>
<text class="t-${c.tone}" x="${C}" y="334" font-size="12" font-weight="700" text-anchor="middle">${c.out[0]}</text>
<text class="cap" x="${C}" y="350" font-size="9.5" text-anchor="middle">${c.out[1]}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 434", S, "ON строит пары, WHERE режет готовое", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .head { stroke-width: 1.5; }
.dg-${S} .h-ok { fill: var(--ok-soft); stroke: var(--ok); }
.dg-${S} .h-bad { fill: var(--bad-soft); stroke: var(--bad); }
.dg-${S} .stage { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .chip { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .cut { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .out { stroke-width: 1.6; }
.dg-${S} .o-ok { fill: var(--ok-soft); stroke: var(--ok); }
.dg-${S} .o-bad { fill: var(--bad-soft); stroke: var(--bad); }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Ступеней две: ON строит пары, WHERE режет уже собранный результат</text>
<text class="cap" x="24" y="48" font-size="11">Условие одно и то же, запросы отличаются одной строчкой — тем, на какой ступени она стоит.</text>
<line class="split" x1="350" y1="66" x2="350" y2="362"/>
${lanes}

<line x1="24" y1="378" x2="676" y2="378" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="400" font-size="11">ON не выбрасывает строки левой таблицы — у него нет такого полномочия. «Ни одной пары» значит «справа NULL».</text>
<text class="cap" x="24" y="420" font-size="11">WHERE не знает, откуда взялась строка: пара и дописанная сирота для неё одинаковые. Потому и режет обеих.</text>
`);
}

// FULL OUTER JOIN даёт сирот с двух сторон сразу, и предикат в WHERE рубит обе:
// у левого сироты пусты правые колонки, у правого — левые. Схема существует
// ради того, чтобы стало видно, почему правило «правая в ON, левая в WHERE»
// здесь просто не на что опереть.
function buildFullBothSides() {
  const S = "full-both-sides";
  // группа строк: подпись группы и её строки
  // строка: orderkey, o.status, pickkey, pd.status, сорт, исход предиката, судьба
  const groups = [
    ["настоящие пары — заказы 1 и 3 со своими PICKED-отборами", [
      ["1", "PICKED", "1", "PICKED", "pair", "TRUE", "остаётся"],
      ["3", "PICKING", "4", "PICKED", "pair", "TRUE", "остаётся"],
    ]],
    ["сироты слева — заказы без PICKED-отбора: 2, 4, 5 и 6", [
      ["2", "NEW", "NULL", "NULL", "left", "TRUE", "остаётся"],
      ["6", "SHIPPED", "NULL", "NULL", "left", "FALSE", "срезано"],
    ]],
    ["сироты справа — отборы 5 и 6, которым заказа не нашлось", [
      ["NULL", "NULL", "5", "RELEASED", "right", "UNKNOWN", "срезано заодно"],
      ["NULL", "NULL", "6", "SHIPPED", "right", "UNKNOWN", "срезано заодно"],
    ]],
  ];

  let y = 146;
  const body = groups.map(([label, rows], g) => {
    const head = `<text class="cap" x="24" y="${y - 8}" font-size="9.5" font-weight="600">${label}</text>`;
    const drawn = rows.map(([ok, os, pk, ps, kind, verdict, fate]) => {
      const top = y, cy = top + 13;
      const hl = kind === "left"
        ? `<rect class="nullcell" x="240" y="${top + 3}" width="210" height="20" rx="5"/>`
        : kind === "right"
          ? `<rect class="nullcell" x="28" y="${top + 3}" width="202" height="20" rx="5"/>`
          : "";
      const gold = (v) => (v === "NULL" ? "t-gold" : "");
      const keep = verdict === "TRUE";
      const tone = keep ? "ok" : verdict === "FALSE" ? "bad" : "gold";
      y += 28;
      return `<rect class="row" x="24" y="${top}" width="430" height="26" rx="7"/>
${hl}
<text class="mono ${gold(ok)}" x="34" y="${cy + 4}" font-size="10">${ok}</text>
<text class="mono ${gold(os)}" x="112" y="${cy + 4}" font-size="10">${os}</text>
<text class="mono ${gold(pk)}" x="246" y="${cy + 4}" font-size="10">${pk}</text>
<text class="mono ${gold(ps)}" x="306" y="${cy + 4}" font-size="10">${ps}</text>
<rect class="pill p-${tone}" x="466" y="${top}" width="86" height="26" rx="7"/>
<text class="t-${tone}" x="509" y="${cy + 4}" font-size="10" font-weight="700" text-anchor="middle">${verdict}</text>
${keep ? checkIcon(566, cy - 7, 13) : crossIcon(566, cy - 7, 13)}
<text class="cap ${keep ? "t-ok" : "t-bad"}" x="588" y="${cy + 4}" font-size="9.5">${fate}</text>`;
    }).join("\n");
    y += g < groups.length - 1 ? 18 : 0;
    return head + "\n" + drawn;
  }).join("\n");

  return svgWrap("0 0 700 434", S, "У FULL сироты с обеих сторон", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .nullcell { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1; stroke-dasharray: 3 3; }
.dg-${S} .bandl { fill: var(--accent-soft); stroke: none; }
.dg-${S} .bandr { fill: var(--sunk); stroke: none; }
.dg-${S} .pill { stroke-width: 1.4; }
.dg-${S} .p-ok { fill: var(--ok-soft); stroke: var(--ok); }
.dg-${S} .p-bad { fill: var(--bad-soft); stroke: var(--bad); }
.dg-${S} .p-gold { fill: var(--gold-soft); stroke: var(--gold); }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">У FULL сироты с обеих сторон, и любое условие в WHERE рубит обе</text>
<text class="mono" x="24" y="50" font-size="10.5">FULL OUTER JOIN ... ON pd.orderkey = o.orderkey AND pd.status = 'PICKED'</text>
<text class="mono t-bad" x="24" y="70" font-size="10.5">WHERE o.status &lt;&gt; 'SHIPPED'</text>
<text class="cap" x="210" y="70" font-size="10">условие по левой таблице — по прежним правилам безобидное</text>

<rect class="bandl" x="24" y="86" width="210" height="18" rx="5"/>
<text class="cap" x="129" y="99" font-size="9" text-anchor="middle">левые колонки — o.*</text>
<rect class="bandr" x="236" y="86" width="218" height="18" rx="5"/>
<text class="cap" x="345" y="99" font-size="9" text-anchor="middle">правые колонки — pd.*</text>

<text class="cap" x="34" y="120" font-size="9">orderkey</text>
<text class="cap" x="112" y="120" font-size="9">o.status</text>
<text class="cap" x="246" y="120" font-size="9">pickkey</text>
<text class="cap" x="306" y="120" font-size="9">pd.status</text>
<text class="cap" x="509" y="120" font-size="9" text-anchor="middle">предикат WHERE</text>

${body}

<line x1="24" y1="378" x2="676" y2="378" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="400" font-size="11">У правого сироты NULL стоит в левых колонках, поэтому условие по левой таблице даёт на нём UNKNOWN.</text>
<text class="cap" x="24" y="420" font-size="11">Условия отбора здесь идут только в ON, а в WHERE остаются лишь IS NULL и IS NOT NULL.</text>
`);
}

/* ---------------------------------------------------------------- d3.04 */

// Декартово произведение как настоящая решётка: две ячейки по вертикали,
// три товара по горизонтали, шесть клеток на пересечениях. Схема существует
// ради двух мыслей сразу: сетка описывает не факты, а все мыслимые сочетания,
// и число строк на выходе — произведение, а не сумма.
function buildCrossGrid() {
  const S = "cross-grid";
  const cols = ["KEFIR-05", "MILK-1L", "TEA-100"];
  const rows = ["C-01-01", "C-01-02"];

  const head = cols.map((c, j) => {
    const x = 140 + j * 140;
    return `<rect class="hcell" x="${x}" y="86" width="136" height="26" rx="7"/>
<text class="mono" x="${x + 68}" y="104" font-size="10.5" text-anchor="middle">${c}</text>`;
  }).join("\n");

  const grid = rows.map((r, i) => {
    const y = 118 + i * 42;
    const rh = `<rect class="hcell" x="24" y="${y}" width="108" height="38" rx="7"/>
<text class="mono" x="78" y="${y + 24}" font-size="10.5" text-anchor="middle">${r}</text>`;
    const cells = cols.map((c, j) => {
      const x = 140 + j * 140;
      const n = i * 3 + j + 1;
      return `<rect class="cell" x="${x}" y="${y}" width="136" height="38" rx="7"/>
<text class="cap" x="${x + 9}" y="${y + 14}" font-size="8.5">строка ${n}</text>
<text class="mono" x="${x + 68}" y="${y + 30}" font-size="9.5" text-anchor="middle">${r} · ${c}</text>`;
    }).join("\n");
    return rh + "\n" + cells;
  }).join("\n");

  // Как быстро растёт произведение: те же крошечные таблицы и боевые.
  const growth = [
    [140, 140, "12 × 9 = 108"],
    [292, 160, "12 × 9 × 6 = 648"],
    [464, 212, "миллион × миллион = триллион"],
  ].map(([x, w, label]) =>
    `<rect class="grow" x="${x}" y="212" width="${w}" height="26" rx="7"/>
<text class="cap" x="${x + w / 2}" y="${229}" font-size="9.5" text-anchor="middle">${label}</text>`).join("\n");

  return svgWrap("0 0 700 330", S, "Каждая слева с каждой справа", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .hcell { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .cell { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .grow { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; }
.dg-${S} .count { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">CROSS JOIN соединяет без условия: каждая строка слева с каждой справа</text>
<text class="mono" x="24" y="50" font-size="11">FROM dbo.loc l CROSS JOIN dbo.sku k</text>
<text class="cap" x="272" y="50" font-size="10">ON здесь нет — и написать его нельзя</text>

<text class="cap" x="24" y="76" font-size="10">dbo.loc — зона COLD</text>
<text class="cap" x="140" y="76" font-size="10">dbo.sku — три товара</text>
${head}
${grid}

<rect class="count" x="570" y="118" width="106" height="80" rx="10"/>
<text class="mono" x="623" y="146" font-size="14" text-anchor="middle">2 × 3</text>
<text class="mono t-accent" x="623" y="174" font-size="20" font-weight="700" text-anchor="middle">6</text>
<text class="cap" x="623" y="190" font-size="9" text-anchor="middle">строк на выходе</text>

<text class="cap" x="24" y="229" font-size="10">как это растёт</text>
${growth}

<line x1="24" y1="254" x2="676" y2="254" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="276" font-size="11">Сетка описывает не факты, а все мыслимые сочетания: чая нет ни в одной ячейке, а в сетке он есть.</text>
<text class="cap" x="24" y="296" font-size="11">Строк на выходе — произведение, а не сумма. Запятая в FROM — та же самая операция, только записанная старым способом.</text>
<text class="cap" x="24" y="316" font-size="11">Поэтому произведение пишут осознанно и на маленьких наборах. Получилось случайно — это авария.</text>
`);
}

// Два слоя одного отчёта: снизу пустая решётка от CROSS JOIN, сверху факты,
// которые навесил LEFT JOIN. Схема существует ради того, чтобы стало видно,
// откуда в прямоугольном отчёте берутся прочерки — и почему условие по
// таблице фактов в WHERE их немедленно сотрёт.
function buildCrossPlusLeft() {
  const S = "cross-plus-left";
  const cols = ["KEFIR-05", "MILK-1L", "TEA-100"];
  const rows = ["C-01-01", "C-01-02"];
  // единственный настоящий факт: кефир в C-01-01
  const fact = { "C-01-01|KEFIR-05": "40.000" };

  const drawGrid = (X, filled) => {
    const head = cols.map((c, j) =>
      `<text class="cap" x="${X + 76 + j * 76 + 36}" y="94" font-size="9" text-anchor="middle">${c}</text>`).join("\n");
    const body = rows.map((r, i) => {
      const y = 102 + i * 38;
      const rh = `<rect class="hcell" x="${X}" y="${y}" width="72" height="34" rx="6"/>
<text class="mono" x="${X + 36}" y="${y + 22}" font-size="9" text-anchor="middle">${r}</text>`;
      const cells = cols.map((c, j) => {
        const x = X + 76 + j * 76;
        const v = fact[`${r}|${c}`];
        if (!filled) {
          return `<rect class="blank" x="${x}" y="${y}" width="72" height="34" rx="6"/>`;
        }
        return v
          ? `<rect class="hit" x="${x}" y="${y}" width="72" height="34" rx="6"/>
<text class="mono t-accent" x="${x + 36}" y="${y + 22}" font-size="10" font-weight="700" text-anchor="middle">${v}</text>`
          : `<rect class="DEMO_PROJECT" x="${x}" y="${y}" width="72" height="34" rx="6"/>
<text class="mono t-gold" x="${x + 36}" y="${y + 22}" font-size="9.5" text-anchor="middle">NULL</text>`;
      }).join("\n");
      return rh + "\n" + cells;
    }).join("\n");
    return head + "\n" + body;
  };

  return svgWrap("0 0 700 328", S, "Сетка, а на неё факты", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .hcell { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .blank { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .hit { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .DEMO_PROJECT { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; stroke-dasharray: 3 3; }
.dg-${S} .warn { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 5 4; }
.dg-${S} .flow { stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Сначала решётка всех сочетаний, потом на неё — факты</text>
<text class="mono" x="24" y="50" font-size="10.5">FROM dbo.loc l CROSS JOIN dbo.sku k LEFT JOIN dbo.stock st ON ...</text>

<text class="cap" x="24" y="76" font-size="10">шаг 1 — CROSS JOIN: что должно быть</text>
<text class="cap" x="376" y="76" font-size="10">шаг 2 — LEFT JOIN: что есть на самом деле</text>
${drawGrid(24, false)}
${drawGrid(376, true)}

<line class="flow" x1="332" y1="136" x2="362" y2="136" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap" x="347" y="126" font-size="9" text-anchor="middle">факты</text>

<text class="cap" x="24" y="196" font-size="10">шесть клеток, которые должны существовать</text>
<text class="cap" x="376" y="196" font-size="10">одна цифра и пять прочерков — их и просили</text>

<rect class="warn" x="24" y="214" width="652" height="36" rx="9"/>
${crossIcon(40, 225, 14)}
<text class="cap t-bad" x="64" y="237" font-size="10.5">условие по dbo.stock в WHERE срежет все клетки с прочерком и вернёт отчёт к одной-единственной строке</text>

<line x1="24" y1="270" x2="676" y2="270" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="292" font-size="11">Прочерк там, где прочерка быть не должно, и есть находка инвентаризации — ради него всё и затевалось.</text>
<text class="cap" x="24" y="312" font-size="11">Фильтры в WHERE трогают только сохраняемые стороны — l.zone и k.skuid. Условие по фактам живёт в ON.</text>
`);
}

/* ---------------------------------------------------------------- d3.05 */

// Одна таблица, прочитанная дважды под разными именами. Схема существует ради
// единственной мысли ноды: сервер не знает, что a и b — «одна таблица». Для
// него это два независимых источника строк, которые случайно совпали, и
// поэтому self join не требует ни нового оператора, ни нового синтаксиса.
function buildSelfJoinTwoCopies() {
  const S = "self-join-two-copies";
  // Партии молока — единственный товар, у которого их больше одной.
  const lots = [
    ["L0001 · MILK-1L · 2026-07-20", false],
    ["L0002 · MILK-1L · 2026-07-24", false],
    ["L0013 · MILK-1L · 2026-07-26", false],
    ["…и ещё 10 партий других товаров", true],
  ];

  const copy = (X, alias, role) => {
    const rows = lots.map(([label, ghost], i) => {
      const y = 186 + i * 24;
      return `<rect class="${ghost ? "ghost" : "row"}" x="${X + 12}" y="${y}" width="256" height="20" rx="6"/>
<text class="${ghost ? "cap" : "mono"}" x="${X + 22}" y="${y + 14}" font-size="9.5">${label}</text>`;
    }).join("\n");
    return `<rect class="copy" x="${X}" y="146" width="280" height="132" rx="10"/>
<rect class="badge" x="${X + 12}" y="158" width="30" height="24" rx="7"/>
<text class="mono t-accent" x="${X + 27}" y="175" font-size="12.5" font-weight="700" text-anchor="middle">${alias}</text>
<text class="cap" x="${X + 50}" y="175" font-size="9.5">${role}</text>
${rows}`;
  };

  return svgWrap("0 0 700 414", S, "Одна таблица как два источника", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .disk { fill: var(--sunk); stroke: var(--line); stroke-width: 1.4; }
.dg-${S} .copy { fill: var(--paper); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .badge { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .row { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .ghost { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 4 3; }
.dg-${S} .onbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .fork { fill: none; stroke: var(--accent); stroke-width: 1.5; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Для сервера здесь нет «одной таблицы» — здесь два источника строк</text>
<text class="cap" x="24" y="48" font-size="11">То, что оба читают одни и те же данные с диска, — деталь реализации, а не смысл запроса.</text>

<rect class="disk" x="250" y="68" width="200" height="42" rx="10"/>
<text class="mono" x="350" y="90" font-size="12.5" text-anchor="middle">dbo.lot</text>
<text class="cap" x="350" y="104" font-size="9" text-anchor="middle">тринадцать строк, лежащих на диске</text>
<path class="fork" d="M350,110 C350,130 164,126 164,142" marker-end="url(#${S}-arrow-accent)"/>
<path class="fork" d="M350,110 C350,130 536,126 536,142" marker-end="url(#${S}-arrow-accent)"/>

${copy(24, "a", "источник 1 — здесь строка «раньше»")}
${copy(396, "b", "источник 2 — здесь строка «позже»")}

<text class="cap" x="350" y="200" font-size="9" text-anchor="middle">все сочетания</text>
<text class="cap" x="350" y="215" font-size="9" text-anchor="middle">двух наборов</text>
<text class="cap" x="350" y="230" font-size="9" text-anchor="middle">проверяются</text>
<text class="cap" x="350" y="245" font-size="9" text-anchor="middle">предикатом ON</text>

<rect class="onbox" x="24" y="294" width="652" height="44" rx="10"/>
<text class="mono" x="350" y="316" font-size="11.5" text-anchor="middle">ON b.skuid = a.skuid AND a.expdate &lt; b.expdate</text>
<text class="cap" x="350" y="331" font-size="9.5" text-anchor="middle">равенство сводит строки одного товара, неравенство назначает роли: слева всегда та партия, что протухнет раньше</text>

<line x1="24" y1="356" x2="676" y2="356" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="378" font-size="11">Отдельного оператора SELF JOIN не существует: это обычный JOIN, у которого обе стороны — одна таблица.</text>
<text class="cap" x="24" y="398" font-size="11">Зато алиасы становятся обязательными: без них у двух источников совпадёт имя и сервер откажется угадывать.</text>
`);
}

// Матрица всех сочетаний внутри одной группы: диагональ — строки, соединённые
// сами с собой, верхний треугольник — то, что оставляет строгое «меньше»,
// нижний — те же пары, записанные наоборот. Схема существует ради того, чтобы
// стало видно, откуда берётся удвоение и почему «<» лечит обе беды разом.
function buildSelfJoinMatrix() {
  const S = "self-join-matrix";
  const items = ["APPLE-KG", "EGGS-C1", "KEFIR-05"];

  const head = items.map((c, j) =>
    `<rect class="hcell" x="${138 + j * 122}" y="86" width="118" height="24" rx="6"/>
<text class="mono" x="${138 + j * 122 + 59}" y="103" font-size="9.5" text-anchor="middle">${c}</text>`).join("\n");

  const grid = items.map((r, i) => {
    const y = 116 + i * 48;
    const rh = `<rect class="hcell" x="24" y="${y}" width="110" height="44" rx="7"/>
<text class="mono" x="79" y="${y + 27}" font-size="9.5" text-anchor="middle">${r}</text>`;
    const cells = items.map((c, j) => {
      const x = 138 + j * 122;
      const kind = i === j ? "self" : i < j ? "keep" : "mirror";
      const word = kind === "self" ? "сама с собой" : kind === "keep" ? "пара" : "зеркало";
      const verdict = kind === "keep" ? "a &lt; b → да" : "a &lt; b → нет";
      return `<rect class="c-${kind}" x="${x}" y="${y}" width="118" height="44" rx="7"/>
<text class="cap ${kind === "keep" ? "t-ok" : kind === "self" ? "t-gold" : ""}" x="${x + 59}" y="${y + 19}" font-size="9.5" text-anchor="middle" font-weight="600">${word}</text>
<text class="mono" x="${x + 59}" y="${y + 34}" font-size="9" text-anchor="middle">${verdict}</text>`;
    }).join("\n");
    return rh + "\n" + cells;
  }).join("\n");

  // Что напишешь в ON — столько строк и получишь.
  const variants = [
    ["ON a.loc = b.loc", "все девять сочетаний: и самопары, и зеркала"],
    ["... AND a.skuid &lt;&gt; b.skuid", "шесть строк — каждая пара приходит дважды"],
    ["... AND a.skuid &lt; b.skuid", "три строки — каждая пара один раз, слева всегда меньший"],
  ].map(([code, what], i) =>
    `<text class="mono" x="24" y="${298 + i * 20}" font-size="10">${code}</text>
<text class="cap" x="210" y="${298 + i * 20}" font-size="10.5">${what}</text>`).join("\n");

  return svgWrap("0 0 700 400", S, "Девять сочетаний: самопары, пары и зеркала", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .hcell { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .c-self { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; stroke-dasharray: 4 3; }
.dg-${S} .c-keep { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .c-mirror { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .sw-self { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; }
.dg-${S} .sw-keep { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .sw-mirror { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 3 3; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Сочетаний девять: три самопары, три пары и три зеркала</text>
<text class="cap" x="24" y="48" font-size="11">В ячейке C-01-01 лежат три товара. Соединяем остатки сами с собой по loc.</text>

<text class="cap" x="24" y="76" font-size="10">a — первый источник</text>
<text class="cap" x="138" y="76" font-size="10">b — второй источник</text>
${head}
${grid}

<rect class="sw-self" x="516" y="122" width="16" height="16" rx="4"/>
<text class="cap" x="542" y="128" font-size="9.5" font-weight="600">диагональ</text>
<text class="cap" x="542" y="142" font-size="9.5">строка сама с собой</text>
<rect class="sw-keep" x="516" y="170" width="16" height="16" rx="4"/>
<text class="cap" x="542" y="176" font-size="9.5" font-weight="600">верхний треугольник</text>
<text class="cap" x="542" y="190" font-size="9.5">то, что оставляет «меньше»</text>
<rect class="sw-mirror" x="516" y="218" width="16" height="16" rx="4"/>
<text class="cap" x="542" y="224" font-size="9.5" font-weight="600">нижний треугольник</text>
<text class="cap" x="542" y="238" font-size="9.5">зеркала — тот же факт,</text>
<text class="cap" x="542" y="252" font-size="9.5">записанный наоборот</text>

<text class="cap" x="24" y="278" font-size="10.5" font-weight="600">что напишешь в ON — то и получишь</text>
${variants}

<line x1="24" y1="360" x2="676" y2="360" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="382" font-size="11">Предикат «не равно» симметричен и пропускает оба зеркала. Строгое «меньше» несимметрично и оставляет одно.</text>
`);
}

// Иерархия «сотрудник — начальник» на одной таблице: bossid смотрит на id той
// же таблицы, и два алиаса играют две роли. Схема существует ради того, чтобы
// объяснить, зачем здесь именно LEFT: у директора ссылка пустая, и INNER JOIN
// вычеркнул бы его из отчёта молча.
function buildSelfJoinBoss() {
  const S = "self-join-boss";
  // id, имя, bossid
  const emp = [
    ["1", "Директор", "NULL"],
    ["2", "Петров", "1"],
    ["3", "Иванов", "2"],
  ];
  // сотрудник, его начальник (NULL — сирота)
  const pairs = [
    ["Иванов", "Петров"],
    ["Петров", "Директор"],
    ["Директор", "NULL"],
  ];

  const table = emp.map(([id, name, boss], i) => {
    const y = 112 + i * 28;
    const isNull = boss === "NULL";
    return `<rect class="row" x="24" y="${y}" width="210" height="24" rx="6"/>
<text class="mono" x="34" y="${y + 16}" font-size="10">${id}</text>
<text class="cap" x="72" y="${y + 16}" font-size="10">${name}</text>
<rect class="${isNull ? "nullcell" : "cell"}" x="164" y="${y + 3}" width="60" height="18" rx="5"/>
<text class="mono ${isNull ? "t-gold" : ""}" x="194" y="${y + 16}" font-size="9.5" text-anchor="middle">${boss}</text>`;
  }).join("\n");

  const out = pairs.map(([e, m], i) => {
    const y = 112 + i * 28;
    const isNull = m === "NULL";
    return `<rect class="row" x="410" y="${y}" width="266" height="24" rx="6"/>
<line class="seam" x1="534" y1="${y}" x2="534" y2="${y + 24}"/>
<text class="cap" x="420" y="${y + 16}" font-size="10">${e}</text>
${isNull ? `<rect class="nullcell" x="540" y="${y + 3}" width="60" height="18" rx="5"/>` : ""}
<text class="mono ${isNull ? "t-gold" : "cap"}" x="${isNull ? 570 : 544}" y="${y + 16}" font-size="10" ${isNull ? 'text-anchor="middle"' : ""}>${m}</text>
${isNull ? `<text class="cap" x="612" y="${y + 16}" font-size="9">никого нет</text>` : ""}`;
  }).join("\n");

  return svgWrap("0 0 700 328", S, "Сотрудник и его начальник — две роли одной таблицы", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .cell { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .nullcell { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.1; stroke-dasharray: 3 3; }
.dg-${S} .badge { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .seam { stroke: var(--line); stroke-width: 1; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .selfref { fill: none; stroke: var(--accent); stroke-width: 1.3; stroke-dasharray: 4 3; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Одна таблица в двух ролях: сотрудник и его начальник</text>
<text class="mono" x="24" y="50" font-size="11">FROM emp AS e LEFT JOIN emp AS m ON m.id = e.bossid</text>

<text class="cap" x="24" y="76" font-size="10">emp — сотрудники</text>
<text class="cap" x="410" y="76" font-size="10">результат — каждый рядом со своим начальником</text>

<rect class="row" x="24" y="86" width="210" height="22" rx="6"/>
<text class="cap" x="34" y="101" font-size="9">id</text>
<text class="cap" x="72" y="101" font-size="9">name</text>
<text class="cap" x="194" y="101" font-size="9" text-anchor="middle">bossid</text>
${table}
<path class="selfref" d="M194,196 C194,216 44,216 44,198" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap" x="24" y="238" font-size="10">bossid ссылается на id той же самой таблицы</text>

<rect class="badge" x="266" y="112" width="118" height="32" rx="8"/>
<text class="mono t-accent" x="282" y="133" font-size="12" font-weight="700">e</text>
<text class="cap" x="300" y="133" font-size="9.5">сотрудник</text>
<rect class="badge" x="266" y="156" width="118" height="32" rx="8"/>
<text class="mono t-accent" x="282" y="177" font-size="12" font-weight="700">m</text>
<text class="cap" x="300" y="177" font-size="9.5">его начальник</text>
<line class="flow" x1="238" y1="128" x2="262" y2="128" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="238" y1="172" x2="262" y2="172" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="388" y1="128" x2="406" y2="140" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="388" y1="172" x2="406" y2="158" marker-end="url(#${S}-arrow)"/>

<rect class="row" x="410" y="86" width="266" height="22" rx="6"/>
<text class="cap" x="420" y="101" font-size="9">e.name — сотрудник</text>
<text class="cap" x="544" y="101" font-size="9">m.name — его начальник</text>
${out}

<text class="cap" x="410" y="216" font-size="10">у директора bossid пустой: INNER JOIN вычеркнул бы</text>
<text class="cap" x="410" y="232" font-size="10">его из отчёта молча, поэтому здесь именно LEFT</text>

<line x1="24" y1="256" x2="676" y2="256" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="278" font-size="11">Петров попадёт в вывод дважды: как сотрудник — в паре с директором, и как начальник — в паре с Ивановым.</text>
<text class="cap" x="24" y="298" font-size="11">Тем же приёмом обходят любое «узел — родитель»: категории, дерево комментариев, разузлование изделия.</text>
<text class="cap" x="24" y="318" font-size="11">Потолок жёсткий: один self join достаёт ровно один уровень. Глубже — только рекурсивный CTE из этапа 5.</text>
`);
}

/* ---------------------------------------------------------------- d3.06 */

// Свёртка цепочки слева направо: движок не соединяет четыре таблицы разом, а
// берёт их по одной, и после каждого шага у него на руках одна промежуточная
// таблица. Схема существует ради единственной мысли ноды: результат
// предыдущего соединения — это левая сторона следующего.
function buildChainFold() {
  const S = "chain-fold";
  // Четыре таблицы из FROM в том порядке, в каком они написаны.
  const srcs = [
    ["dbo.orders o", 24, 150],
    ["dbo.orderdetail od", 182, 160],
    ["dbo.pickdetail pd", 350, 156],
    ["dbo.lot lt", 514, 162],
  ];
  const heads = srcs.map(([name, x, w]) =>
    `<rect class="src" x="${x}" y="96" width="${w}" height="34" rx="8"/>
<text class="mono" x="${x + w / 2}" y="118" font-size="11" text-anchor="middle">${name}</text>`).join("\n");

  // Вход в очередной шаг. Накопленное слева падает прямо вниз по одной и той же
  // вертикали — это и есть «левая сторона». Очередная таблица приходит своей
  // вертикалью справа, пунктиром: она стояла в FROM и ждала своей очереди.
  const carry = (y0, y1) =>
    `<line class="carry" x1="99" y1="${y0}" x2="99" y2="${y1}" marker-end="url(#${S}-arrow-accent)"/>`;
  const wait = (x, y1) =>
    `<line class="wait" x1="${x}" y1="130" x2="${x}" y2="${y1}" marker-end="url(#${S}-arrow)"/>`;

  // Шаг цепочки: y блока, ширина, выражение и что получилось.
  const steps = [
    [162, 318, "(orders JOIN orderdetail)", "одна новая таблица: все колонки заказа и все колонки строки"],
    [228, 482, "((orders JOIN orderdetail) JOIN pickdetail)", "результат шага 1 целиком стал левой стороной шага 2"],
    [294, 652, "(((orders JOIN orderdetail) JOIN pickdetail) JOIN lot)", "и снова: слева — всё накопленное, справа — одна новая таблица"],
  ];
  const blocks = steps.map(([y, w, expr, what], i) =>
    `<text class="cap" x="24" y="${y - 5}" font-size="9">шаг ${i + 1}</text>
<rect class="fold" x="24" y="${y}" width="${w}" height="38" rx="9"/>
<text class="mono t-accent" x="36" y="${y + 18}" font-size="10.5">${expr}</text>
<text class="cap" x="36" y="${y + 32}" font-size="9">${what}</text>`).join("\n");

  return svgWrap("0 0 700 428", S, "Цепочка сворачивается слева направо", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .src { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .fold { fill: var(--paper); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .carry { stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .wait { stroke: var(--line); stroke-width: 1.2; stroke-dasharray: 5 4; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Запись a JOIN b JOIN c означает (a JOIN b) JOIN c — и ничего более хитрого</text>
<text class="mono" x="24" y="50" font-size="11">FROM dbo.orders o JOIN dbo.orderdetail od JOIN dbo.pickdetail pd JOIN dbo.lot lt</text>

<text class="cap" x="24" y="82" font-size="10.5">четыре таблицы в FROM — движок берёт их по одной, слева направо</text>
${heads}

${carry(130, 159)}${wait(262, 159)}
${carry(200, 225)}${wait(428, 225)}
${carry(266, 291)}${wait(595, 291)}
<text class="cap" x="436" y="180" font-size="8.5">присоединяется на шаге 2</text>
<text class="cap" x="587" y="212" font-size="8.5" text-anchor="end">присоединяется на шаге 3</text>
${blocks}

<line x1="24" y1="352" x2="676" y2="352" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="374" font-size="11">Соединение всегда бинарное: слева одна таблица — та, что накопилась выше, — справа одна новая.</text>
<text class="cap" x="24" y="394" font-size="11">Раз слева накоплено всё, что было выше по тексту, ON очередного шага видит любую таблицу выше, а не только соседнюю.</text>
<text class="cap" x="24" y="414" font-size="11">А сослаться вперёд, на таблицу ниже по тексту, нельзя: в накопленном слева её ещё нет, и это ловится ошибкой.</text>
`);
}

// Три записи одного отчёта рядом: сломанная, вылеченная лишним LEFT и
// вылеченная скобками. Схема существует ради мысли, что необязательная ветка
// обрывается не там, где её объявили необязательной, а ниже по цепочке, — и
// что скобки собирают её в один блок, который цепляется к заказам целиком.
function buildJoinParens() {
  const S = "join-parens";
  // Полоса: x, тон, заголовок, подзаголовок, заметки, итог.
  const lanes = [
    {
      x: 24, tone: "bad", head: "так ломается", sub: "LEFT, а следом обычный JOIN",
      links: [["LEFT JOIN", "ok"], ["JOIN", "bad"]],
      notes: ["у заказов 2, 4 и 5 в pd.skuid — NULL", "s.skuid = NULL даёт UNKNOWN", "а INNER пропускает только «да»"],
      out: ["6 строк вместо 9", "заказы 2, 4 и 5 пропали молча"],
    },
    {
      x: 246, tone: "ok", head: "способ 1 — LEFT дальше", sub: "ветка необязательна целиком",
      links: [["LEFT JOIN", "ok"], ["LEFT JOIN", "ok"]],
      notes: ["всё, что растёт из ветки,", "присоединяется тоже через LEFT", "одного пропущенного хватит"],
      out: ["9 строк", "все заказы на месте"],
    },
    {
      x: 468, tone: "ok", head: "способ 2 — скобки", sub: "ветка собрана в один блок",
      links: [["LEFT JOIN", "ok"], ["JOIN", "ok"]],
      notes: ["внутри скобок NULL не появляется", "у отбора карточка есть всегда", "наружу блок выходит целиком"],
      out: ["9 строк", "нет отбора — весь блок NULL"],
    },
  ];

  const drawn = lanes.map((c, li) => {
    const L = c.x, C = L + 104, paren = li === 2;
    const notes = c.notes.map((t, i) =>
      `<text class="cap" x="${L + 10}" y="${264 + i * 13}" font-size="9">${t}</text>`).join("\n");
    const body = paren
      ? `<line class="flow" x1="${L + 34}" y1="142" x2="${L + 34}" y2="156" marker-end="url(#${S}-arrow)"/>
<text class="mono t-ok" x="${L + 46}" y="153" font-size="9">${c.links[0][0]}</text>
<rect class="paren" x="${L + 8}" y="158" width="192" height="92" rx="10"/>
<text class="cap t-accent" x="${L + 18}" y="173" font-size="8.5">скобки — соединяется первым</text>
<rect class="leaf" x="${L + 20}" y="180" width="168" height="26" rx="7"/>
<text class="mono" x="${L + 104}" y="197" font-size="9.5" text-anchor="middle">dbo.pickdetail pd</text>
<line class="flow" x1="${L + 38}" y1="206" x2="${L + 38}" y2="218" marker-end="url(#${S}-arrow)"/>
<text class="mono" x="${L + 50}" y="216" font-size="9">JOIN</text>
<rect class="leaf" x="${L + 20}" y="218" width="168" height="26" rx="7"/>
<text class="mono" x="${L + 104}" y="235" font-size="9.5" text-anchor="middle">dbo.sku s</text>`
      : `<line class="flow" x1="${L + 34}" y1="142" x2="${L + 34}" y2="164" marker-end="url(#${S}-arrow)"/>
<text class="mono t-${c.links[0][1]}" x="${L + 46}" y="157" font-size="9">${c.links[0][0]}</text>
<rect class="leaf" x="${L + 16}" y="164" width="176" height="26" rx="7"/>
<text class="mono" x="${C}" y="181" font-size="9.5" text-anchor="middle">dbo.pickdetail pd</text>
<line class="flow" x1="${L + 34}" y1="190" x2="${L + 34}" y2="212" marker-end="url(#${S}-arrow)"/>
<text class="mono t-${c.links[1][1]}" x="${L + 46}" y="205" font-size="9">${c.links[1][0]}</text>
<rect class="leaf" x="${L + 16}" y="212" width="176" height="26" rx="7"/>
<text class="mono" x="${C}" y="229" font-size="9.5" text-anchor="middle">dbo.sku s</text>`;

    return `<rect class="plate p-${c.tone}" x="${L}" y="72" width="208" height="32" rx="9"/>
<text class="t-${c.tone}" x="${C}" y="88" font-size="10" font-weight="700" text-anchor="middle">${c.head}</text>
<text class="cap" x="${C}" y="100" font-size="8.5" text-anchor="middle">${c.sub}</text>

<rect class="leaf" x="${L + 16}" y="116" width="176" height="26" rx="7"/>
<text class="mono" x="${C}" y="133" font-size="9.5" text-anchor="middle">dbo.orders o</text>
${body}
${notes}
<rect class="plate p-${c.tone}" x="${L}" y="300" width="208" height="36" rx="9"/>
<text class="t-${c.tone}" x="${C}" y="320" font-size="11.5" font-weight="700" text-anchor="middle">${c.out[0]}</text>
<text class="cap" x="${C}" y="332" font-size="9" text-anchor="middle">${c.out[1]}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 430", S, "Необязательная ветка и две починки", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .plate { stroke-width: 1.5; }
.dg-${S} .p-ok { fill: var(--ok-soft); stroke: var(--ok); }
.dg-${S} .p-bad { fill: var(--bad-soft); stroke: var(--bad); }
.dg-${S} .leaf { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .paren { fill: var(--sunk); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Необязательная ветка обрывается не там, где её объявили, а ниже по цепочке</text>
<text class="cap" x="24" y="48" font-size="11">Лечится двумя движениями: вести LEFT дальше по ветке или собрать ветку в скобки — тогда это один блок.</text>

${drawn}

<line x1="24" y1="354" x2="676" y2="354" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="376" font-size="11">Способ 1: всё, что растёт из необязательной ветки, тоже присоединяй через LEFT — ветка необязательна целиком.</text>
<text class="cap" x="24" y="396" font-size="11">Способ 2: LEFT JOIN (dbo.pickdetail pd JOIN dbo.sku s ON s.skuid = pd.skuid) ON pd.orderkey = o.orderkey.</text>
<text class="cap" x="24" y="416" font-size="11">Скобки честнее, когда из ветки растёт хвост: внутри блока LEFT просто не нужен, и забыть его негде.</text>
`);
}

/* ---------------------------------------------------------------- d3.07 */

// Цикл по левым строкам: значение текущей строки подставляется внутрь скобок,
// подзапрос выполняется заново, а результат склеивается с этой же строкой.
// Схема существует ради того, чтобы стало видно: правая часть здесь не одна на
// весь запрос, а по одной на каждую строку слева.
function buildLateralLoop() {
  const S = "lateral-loop";
  // Строки слева: подпись, текущая ли она, свёрнутый ли хвост.
  const lefts = [
    ["APPLE-KG", false, false],
    ["BREAD-DARK", false, false],
    ["KEFIR-05", false, false],
    ["MILK-1L", true, false],
    ["…ещё 8 товаров", false, true],
  ];
  const col = lefts.map(([name, hot, ghost], i) => {
    const y = 96 + i * 30;
    return `<rect class="${hot ? "hot" : ghost ? "ghost" : "row"}" x="24" y="${y}" width="140" height="26" rx="7"/>
<text class="${ghost ? "cap" : "mono"} ${hot ? "t-accent" : ""}" x="34" y="${y + 17}" font-size="${ghost ? 9 : 10.5}">${name}</text>`;
  }).join("\n");

  // Что подзапрос вернул для MILK-1L: три партии, отсортированные по сроку.
  const lots = [
    ["L0013 · 2026-07-26", true],
    ["L0002 · 2026-07-24", false],
    ["L0001 · 2026-07-20", false],
  ];
  const back = lots.map(([label, keep], i) => {
    const y = 104 + i * 32;
    return `<rect class="${keep ? "hot" : "ghost"}" x="480" y="${y}" width="156" height="26" rx="7"/>
<text class="mono ${keep ? "t-accent" : "cap"}" x="490" y="${y + 17}" font-size="9.5">${label}</text>
${keep ? checkIcon(646, y + 6, 14) : crossIcon(646, y + 6, 14)}`;
  }).join("\n");

  return svgWrap("0 0 700 428", S, "Подзапрос выполняется заново на каждую строку слева", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .ghost { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .sub { fill: var(--sunk); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .subst { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .out { fill: var(--paper); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .half { fill: var(--accent-soft); stroke: none; }
.dg-${S} .seam { stroke: var(--accent); stroke-width: 1; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .again { fill: none; stroke: var(--accent); stroke-width: 1.4; stroke-dasharray: 5 4; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">LATERAL даёт правой части право видеть колонки левой строки</text>
<text class="mono" x="24" y="50" font-size="11">FROM dbo.sku s JOIN LATERAL ( ... ) AS f ON true</text>

<text class="cap" x="24" y="82" font-size="10.5">строки слева — dbo.sku</text>
<text class="cap" x="180" y="82" font-size="10.5">подзапрос в скобках</text>
<text class="cap" x="480" y="82" font-size="10.5">что он вернул для этой строки</text>
${col}
<line class="flow" x1="166" y1="199" x2="176" y2="199" marker-end="url(#${S}-arrow-accent)"/>

<rect class="sub" x="180" y="96" width="286" height="146" rx="10"/>
<text class="cap" x="192" y="114" font-size="9">выполняется заново на каждую строку слева</text>
<text class="mono" x="192" y="136" font-size="9.5">SELECT l.lot, l.expdate</text>
<text class="mono" x="192" y="152" font-size="9.5">FROM dbo.lot AS l</text>
<rect class="subst" x="186" y="160" width="270" height="22" rx="6"/>
<text class="mono" x="194" y="175" font-size="9.5">WHERE l.skuid =</text>
<text class="mono t-accent" x="288" y="175" font-size="9.5" font-weight="700">'MILK-1L'</text>
<text class="mono" x="192" y="199" font-size="9.5">ORDER BY l.expdate DESC, l.lot DESC</text>
<text class="mono" x="192" y="215" font-size="9.5">LIMIT 1</text>
<text class="cap" x="192" y="233" font-size="8.5">подставилась колонка текущей левой строки</text>
<line class="flow" x1="468" y1="169" x2="476" y2="169" marker-end="url(#${S}-arrow-accent)"/>

${back}
<text class="cap" x="480" y="209" font-size="8.5">отсортировано и отрезано</text>
<text class="cap" x="480" y="222" font-size="8.5">внутри своей левой строки</text>

<line class="flow" x1="210" y1="244" x2="210" y2="266" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap" x="228" y="262" font-size="9.5">склеить левую строку с тем, что вышло справа</text>
<rect class="out" x="180" y="270" width="496" height="34" rx="9"/>
<rect class="half" x="181.5" y="271.5" width="138" height="31" rx="7"/>
<text class="mono t-accent" x="194" y="291" font-size="11">MILK-1L</text>
<line class="seam" x1="320" y1="270" x2="320" y2="304"/>
<text class="mono" x="334" y="291" font-size="11">L0013 · 2026-07-26</text>
<text class="cap" x="480" y="291" font-size="9">левая строка плюс то, что вышло справа</text>

<path class="again" d="M250,308 C170,336 100,332 92,306 C88,294 90,282 90,250" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap" x="270" y="330" font-size="10">и всё заново — по разу на каждую из двенадцати строк слева</text>

<line x1="24" y1="352" x2="676" y2="352" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="374" font-size="11">Обычные скобки в FROM вычисляются сами по себе и про соседей ничего не знают — отсюда invalid reference.</text>
<text class="cap" x="24" y="394" font-size="11">LATERAL снимает запрет: правая часть смотрит влево, берёт значения текущей строки и пересчитывается заново.</text>
<text class="cap" x="24" y="414" font-size="11">Двенадцать товаров — двенадцать отдельных запусков подзапроса, каждый со своим значением skuid внутри.</text>
`);
}

// Таблица соответствий двух диалектов: та же мысль, два синтаксиса. Схема
// существует ради того, чтобы перевод в обе стороны делался механически, а не
// припоминался, — и чтобы стало видно, где перевода нет вовсе.
function buildApplyLateralMap() {
  const S = "apply-lateral-map";
  // мысль | T-SQL: строка кода и уточнение | PostgreSQL: строка кода и уточнение | ключевая ли пара
  const rows = [
    ["правая часть видит левую строку", ["CROSS APPLY (…) AS a", ""], ["JOIN LATERAL (…) AS a ON true", ""], true],
    ["то же, но левую строку не терять", ["OUTER APPLY (…) AS a", ""], ["LEFT JOIN LATERAL (…) AS a ON true", ""], true],
    ["ограничение внутри скобок", ["TOP (N)", "сразу после SELECT"], ["LIMIT N", "в самом конце подзапроса"], false],
    ["без ON вообще", ["так и пишется", ""], ["CROSS JOIN LATERAL (…) AS a", ""], false],
    ["совсем коротко", ["такого нет", ""], ["FROM t, LATERAL (…) AS a", ""], false],
  ];

  const cell = (x, w, y, pair, hot) => {
    const cx = x + w / 2;
    const code = pair[0], note = pair[1];
    const isCode = /[a-z(]/.test(code) && code !== "так и пишется" && code !== "такого нет";
    const body = note
      ? `<text class="mono ${hot ? "t-accent" : ""}" x="${cx}" y="${y + 15}" font-size="9.5" text-anchor="middle">${code}</text>
<text class="cap" x="${cx}" y="${y + 27}" font-size="8.5" text-anchor="middle">${note}</text>`
      : `<text class="${isCode ? "mono" : "cap"} ${hot ? "t-accent" : ""}" x="${cx}" y="${y + 20}" font-size="${isCode ? 9.5 : 9.5}" text-anchor="middle">${code}</text>`;
    return `<rect class="${hot ? "hot" : "cell"}" x="${x}" y="${y}" width="${w}" height="32" rx="8"/>
${body}`;
  };

  const body = rows.map(([label, tsql, pg, hot], i) => {
    const y = 122 + i * 38;
    return `<text class="cap" x="24" y="${y + 21}" font-size="9.5">${label}</text>
${cell(222, 206, y, tsql, hot)}
<text class="cap" x="440" y="${y + 21}" font-size="11" text-anchor="middle">↔</text>
${cell(452, 224, y, pg, hot)}`;
  }).join("\n");

  return svgWrap("0 0 700 436", S, "CROSS APPLY и JOIN LATERAL — одно и то же", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .head { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .cell { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .warn { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 5 4; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Одна и та же мысль, два синтаксиса — соответствие дословное</text>
<text class="cap" x="24" y="48" font-size="11">Здесь диалекты расходятся целой конструкцией, а не одним словом. Переводится строчка в строчку.</text>

<text class="cap" x="24" y="104" font-size="10" font-weight="600">мысль</text>
<rect class="head" x="222" y="84" width="206" height="30" rx="8"/>
<text class="mono" x="325" y="104" font-size="11" font-weight="700" text-anchor="middle">SQL Server</text>
<rect class="head" x="452" y="84" width="224" height="30" rx="8"/>
<text class="mono" x="564" y="104" font-size="11" font-weight="700" text-anchor="middle">PostgreSQL</text>
${body}

<rect class="warn" x="24" y="322" width="652" height="40" rx="9"/>
${crossIcon(40, 334, 14)}
<text class="cap t-bad" x="64" y="339" font-size="10">Скопируешь CROSS APPLY в PostgreSQL — получишь syntax error at or near "APPLY", SQLSTATE 42601,</text>
<text class="cap" x="64" y="354" font-size="10">и никакой подсказки: про LATERAL сервер даже не догадывается, что ты имел в виду его.</text>

<line x1="24" y1="380" x2="676" y2="380" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="402" font-size="11">LATERAL — стандарт SQL: он есть и в PostgreSQL, и в Oracle, и в MySQL. APPLY — изобретение Microsoft.</text>
<text class="cap" x="24" y="422" font-size="11">Само CROSS APPLY / JOIN LATERAL переносимо не записать — эти строчки придётся править руками.</text>
`);
}

/* ---------------------------------------------------------------- d3.08 */

// Направление: JOIN кладёт листы рядом и добавляет колонки, UNION кладёт их
// стопкой и добавляет строки. Схема существует ради одной пары образов, на
// которой держится вся нода, — и ради того, чтобы разницу было видно по форме
// листа, а не по тексту запроса.
function buildUnionStack() {
  const S = "union-stack";

  // Лист: рамка, полоска шапки с именами колонок и полосы-строки.
  const sheet = (x, y, w, cols, tints, minH) => {
    const h = Math.max(24 + tints.length * 18, minH || 0);
    const names = cols.map((c, i) =>
      `<text class="cap" x="${(x + (w * (i + 0.5)) / cols.length).toFixed(1)}" y="${y + 13}" font-size="8.5" text-anchor="middle">${c}</text>`).join("\n");
    const bars = tints.map((t, i) =>
      `<rect class="${t}" x="${x + 6}" y="${y + 22 + i * 18}" width="${w - 12}" height="14" rx="4"/>`).join("\n");
    return `<rect class="paper" x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>
<rect class="hstrip" x="${x}" y="${y}" width="${w}" height="18" rx="8"/>
<rect class="hstrip" x="${x}" y="${y + 10}" width="${w}" height="8"/>
${names}
${bars}`;
  };

  // Результат JOIN: строк столько же, но каждая разрезана надвое по колонкам.
  const joined = [0, 1, 2].map((i) => {
    const y = 264 + i * 18;
    return `<rect class="froma" x="38" y="${y}" width="140" height="14" rx="4"/>
<rect class="fromb" x="180" y="${y}" width="138" height="14" rx="4"/>`;
  }).join("\n");
  const joinCols = ["skuid", "loc", "descr", "uom"].map((c, i) =>
    `<text class="cap" x="${(32 + (292 * (i + 0.5)) / 4).toFixed(1)}" y="255" font-size="8.5" text-anchor="middle">${c}</text>`).join("\n");

  return svgWrap("0 0 700 427", S, "JOIN кладёт листы рядом, UNION — стопкой", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .paper { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .hstrip { fill: var(--sunk); stroke: none; }
.dg-${S} .froma { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1; }
.dg-${S} .fromb { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1; }
.dg-${S} .plate { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .seam { stroke: var(--muted); stroke-width: 1.2; stroke-dasharray: 3 3; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">JOIN кладёт листы рядом и добавляет колонки. UNION кладёт их стопкой и добавляет строки.</text>
<text class="cap" x="24" y="48" font-size="11">Оба «объединяют таблицы», оба пишутся между двумя именами — а делают противоположное по направлению.</text>
<line class="split" x1="350" y1="66" x2="350" y2="326"/>

<rect class="plate" x="24" y="72" width="316" height="30" rx="9"/>
<text class="mono" x="40" y="92" font-size="12" font-weight="700">JOIN</text>
<text class="cap" x="94" y="92" font-size="9.5">вбок — прибавились колонки</text>
<rect class="plate" x="360" y="72" width="316" height="30" rx="9"/>
<text class="mono" x="376" y="92" font-size="12" font-weight="700">UNION ALL</text>
<text class="cap" x="454" y="92" font-size="9.5">вниз — прибавились строки</text>

<text class="cap" x="32" y="118" font-size="8.5">dbo.stock — 3 строки, 2 колонки</text>
${sheet(32, 124, 142, ["skuid", "loc"], ["froma", "froma", "froma"])}
<text class="cap" x="182" y="118" font-size="8.5">dbo.sku — 1 строка, 3 колонки</text>
${sheet(182, 124, 142, ["skuid", "descr", "uom"], ["fromb"], 78)}
<line class="flow" x1="103" y1="206" x2="103" y2="222" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="253" y1="206" x2="253" y2="222" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="32" y="236" font-size="8.5">результат JOIN — 3 строки, 4 колонки</text>
<rect class="paper" x="32" y="242" width="292" height="78" rx="8"/>
<rect class="hstrip" x="32" y="242" width="292" height="18" rx="8"/>
<rect class="hstrip" x="32" y="252" width="292" height="8"/>
${joinCols}
${joined}
<line class="seam" x1="179" y1="242" x2="179" y2="320"/>
<text class="cap" x="32" y="338" font-size="10">строк как было — 3</text>
<text class="t-accent" x="32" y="353" font-size="10" font-weight="700">колонок стало 2 + 2 = 4</text>

<text class="cap" x="366" y="118" font-size="8.5">dbo.stock — 3 строки</text>
${sheet(366, 124, 126, ["skuid", "loc"], ["froma", "froma", "froma"])}
<text class="cap" x="366" y="216" font-size="8.5">dbo.pickdetail — 2 строки</text>
${sheet(366, 222, 126, ["skuid", "loc"], ["fromb", "fromb"])}
<line class="flow" x1="496" y1="163" x2="512" y2="178" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="496" y1="255" x2="512" y2="238" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="518" y="140" font-size="8.5">результат UNION ALL — 5 строк</text>
${sheet(518, 146, 150, ["skuid", "loc"], ["froma", "froma", "froma", "fromb", "fromb"])}
<line class="seam" x1="518" y1="220" x2="668" y2="220"/>
<text class="cap" x="366" y="306" font-size="9">строки второй ветки дописаны под первую — ничего не сравнивалось</text>
<text class="cap" x="518" y="338" font-size="10">колонок как было — 2</text>
<text class="t-accent" x="518" y="353" font-size="10" font-weight="700">строк стало 3 + 2 = 5</text>

<line x1="24" y1="371" x2="676" y2="371" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="393" font-size="11">JOIN отвечает на вопрос «что ещё известно про эту строку». UNION — на вопрос «какие ещё строки бывают».</text>
<text class="cap" x="24" y="413" font-size="11">Отсюда и требование к веткам: одинаковое число колонок и совместимые типы по позициям, а имена не значат ничего.</text>
`);
}

// Цена чистоты: UNION — это UNION ALL плюс неявный DISTINCT, и за него платят
// сортировкой или хешем по всему объединённому набору. Схема существует ради
// того, чтобы стало видно, что дедупликация — отдельная ступень, а не свойство
// слова UNION, и что она не разбирает, из какой ветки пришла строка.
function buildUnionDedup() {
  const S = "union-dedup";
  // Пять строк объединённого набора: значение, из какой ветки, подпись ветки.
  const stack = [
    ["MILK-1L · A-01-01", "froma", "остаток"],
    ["MILK-1L · A-01-01", "froma", "остаток"],
    ["MILK-1L · A-01-01", "fromb", "отбор"],
    ["MILK-1L · A-01-01", "fromb", "отбор"],
    ["MILK-1L · B-01-01", "froma", "остаток"],
  ];
  const rows = stack.map(([label, tint, from], i) => {
    const y = 94 + i * 28;
    return `<rect class="${tint}" x="24" y="${y}" width="200" height="24" rx="7"/>
<text class="mono" x="34" y="${y + 16}" font-size="9.5">${label}</text>
<text class="cap" x="214" y="${y + 16}" font-size="8" text-anchor="end">${from}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 380", S, "UNION — это UNION ALL плюс неявный DISTINCT", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .froma { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .fromb { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; }
.dg-${S} .lane { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .step { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .mill { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.5; }
.dg-${S} .keep { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">UNION — это UNION ALL плюс неявный DISTINCT, и за него платят</text>
<text class="cap" x="24" y="48" font-size="11">Тот же запрос про молоко, изменено ровно одно слово — убрано ALL. Было пять строк, стало две.</text>

<text class="cap" x="24" y="82" font-size="10.5">стопка из двух веток — пять строк</text>
${rows}
<line class="flow" x1="232" y1="106" x2="232" y2="200"/>
<line class="flow" x1="232" y1="118" x2="242" y2="118" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="232" y1="200" x2="242" y2="200" marker-end="url(#${S}-arrow)"/>

<rect class="lane" x="246" y="94" width="430" height="54" rx="10"/>
<text class="mono" x="260" y="117" font-size="12" font-weight="700">UNION ALL</text>
<text class="cap" x="260" y="135" font-size="9">ничего не сравнивает и ничего не ищет — просто дописывает</text>
<line class="flow" x1="524" y1="121" x2="552" y2="121" marker-end="url(#${S}-arrow)"/>
<rect class="keep" x="558" y="104" width="104" height="34" rx="9"/>
<text class="t-accent" x="610" y="120" font-size="12" font-weight="700" text-anchor="middle">5 строк</text>
<text class="cap" x="610" y="132" font-size="8.5" text-anchor="middle">все на месте</text>

<rect class="lane" x="246" y="160" width="430" height="126" rx="10"/>
<text class="cap" x="260" y="181" font-size="9.5" font-weight="600">UNION = UNION ALL + неявный DISTINCT поверх всего результата</text>
<rect class="step" x="260" y="196" width="96" height="40" rx="9"/>
<text x="308" y="215" font-size="11" font-weight="700" text-anchor="middle">5 строк</text>
<text class="cap" x="308" y="228" font-size="8" text-anchor="middle">стопка как есть</text>
<line class="flow" x1="360" y1="216" x2="378" y2="216" marker-end="url(#${S}-arrow)"/>
<rect class="mill" x="382" y="196" width="180" height="40" rx="9"/>
<text class="t-gold" x="472" y="214" font-size="10.5" font-weight="700" text-anchor="middle">неявный DISTINCT</text>
<text class="cap" x="472" y="227" font-size="8" text-anchor="middle">сортировка или хеш по всему набору</text>
<line class="flow" x1="566" y1="216" x2="584" y2="216" marker-end="url(#${S}-arrow)"/>
<rect class="keep" x="588" y="196" width="76" height="40" rx="9"/>
<text class="t-accent" x="626" y="215" font-size="11" font-weight="700" text-anchor="middle">2 строки</text>
<text class="cap" x="626" y="228" font-size="8" text-anchor="middle">из пяти</text>
<text class="cap" x="260" y="257" font-size="9">схлопнулись три строки — набор объединили, и откуда пришла строка, ему уже всё равно</text>
<text class="cap" x="260" y="273" font-size="9">заплатишь всегда: чтобы узнать, что дублей нет, их сначала надо поискать</text>

<line x1="24" y1="304" x2="676" y2="304" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="326" font-size="11">Повтор — это совпадение всех выбранных колонок целиком, а не какой-то одной. Ветку строки DISTINCT не различает.</text>
<text class="cap" x="24" y="346" font-size="11">Цена — сортировка или хеш по всему объединённому набору. Платишь даже тогда, когда дублей в данных нет.</text>
<text class="cap" x="24" y="366" font-size="11">По умолчанию пиши UNION ALL — он не способен потерять строку. UNION — когда можешь объяснить, какие дубли мешают.</text>
`);
}

/* ---------------------------------------------------------------- d3.09 */

// Два набора и три зоны между ними: только слева, в обеих сразу, только
// справа. Схема существует ради того, чтобы разность и пересечение перестали
// быть словами и стали выбором зоны: EXCEPT берёт левую, INTERSECT — среднюю.
function buildExceptIntersect() {
  const S = "except-intersect";
  // Полоса: подпись вопроса, запрос, три зоны и итог.
  const bands = [
    {
      y: 110, label: "вопрос «чего нет» — разность",
      q: "SELECT skuid FROM dbo.sku   EXCEPT   SELECT skuid FROM dbo.stock",
      zones: [
        ["keep", "только в dbo.sku", "TEA-100", "карточка есть, остатков нет", true],
        ["drop", "и там, и там", "11 артикулов", "разность их выбрасывает", false],
        ["drop", "только в dbo.stock", "таких нет", "разность их и не берёт", false],
      ],
      out: ["TEA-100", "одна строка в ответе"],
    },
    {
      y: 224, label: "вопрос «что совпало» — пересечение",
      q: "SELECT skuid FROM dbo.stock   INTERSECT   SELECT skuid FROM dbo.pickdetail",
      zones: [
        ["drop", "только в dbo.stock", "APPLE-KG COFFEE-250 EGGS-C1", "FLOUR-2KG SUGAR-1KG WATER-6X15", true],
        ["keep", "и там, и там", "BREAD-DARK BUTTER-180 CHICKEN-KG", "KEFIR-05 MILK-1L", true],
        ["drop", "только в dbo.pickdetail", "таких нет", "всё отобранное лежит", false],
      ],
      out: ["5 строк", "и лежат, и отбирались"],
    },
  ];

  const drawn = bands.map((b) => {
    const xs = [[24, 186], [216, 186], [408, 140]];
    const zones = b.zones.map(([tone, title, l1, l2, mono], i) => {
      const [x, w] = xs[i];
      return `<rect class="z-${tone}" x="${x}" y="${b.y}" width="${w}" height="62" rx="9"/>
<text class="cap ${tone === "keep" ? "t-ok" : ""}" x="${x + 10}" y="${b.y + 16}" font-size="9" font-weight="600">${title}</text>
<text class="${mono ? "mono" : "cap"}" x="${x + 10}" y="${b.y + 34}" font-size="${mono ? 8 : 9}">${l1}</text>
<text class="${mono ? "mono" : "cap"} cap" x="${x + 10}" y="${b.y + 50}" font-size="${mono ? 8 : 9}">${l2}</text>`;
    }).join("\n");
    return `<text class="cap" x="24" y="${b.y - 30}" font-size="10.5" font-weight="600">${b.label}</text>
<text class="mono" x="24" y="${b.y - 10}" font-size="10">${b.q}</text>
${zones}
<line class="flow" x1="552" y1="${b.y + 31}" x2="566" y2="${b.y + 31}" marker-end="url(#${S}-arrow-accent)"/>
<rect class="out" x="572" y="${b.y}" width="104" height="62" rx="9"/>
<text class="mono t-accent" x="624" y="${b.y + 28}" font-size="11" font-weight="700" text-anchor="middle">${b.out[0]}</text>
<text class="cap" x="624" y="${b.y + 46}" font-size="8.5" text-anchor="middle">${b.out[1]}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 398", S, "Что оставляет разность и что оставляет пересечение", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; fill: var(--ink); }
.dg-${S} .mono.cap { fill: var(--muted); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .z-keep { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.6; }
.dg-${S} .z-drop { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .out { fill: var(--paper); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .flow { stroke: var(--accent); stroke-width: 1.5; }
</style>

<text class="cap" x="24" y="28" font-size="11.5" font-weight="600">Два набора распадаются на три зоны, и слово между ветками выбирает зону</text>
<text class="cap" x="24" y="48" font-size="11">Сравнивается строка целиком со строкой целиком, а не колонка с колонкой по условию, как в JOIN ... ON.</text>

${drawn}

<text class="cap" x="24" y="306" font-size="10">EXCEPT берёт левую зону. INTERSECT берёт среднюю. Правая не достаётся ни тому, ни другому.</text>

<line x1="24" y1="322" x2="676" y2="322" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="344" font-size="11">Требования к веткам те же, что у UNION: одинаковое число колонок и совместимые типы по позициям.</text>
<text class="cap" x="24" y="364" font-size="11">Повторы оба убирают молча — внутри сидит тот же неявный DISTINCT. Вернуть их умеют EXCEPT ALL и INTERSECT ALL.</text>
<text class="cap" x="24" y="384" font-size="11">Имена колонок результата берутся из первой ветки, а ORDER BY один и стоит в самом конце запроса.</text>
`);
}

// Свёртка цепочки по приоритету: INTERSECT стягивает соседей раньше, чем UNION
// и EXCEPT. Схема нарочно повторяет форму схемы про AND и OR из этапа 2 —
// урок здесь дословно тот же, только участники другие.
function buildSetPrecedence() {
  const S = "set-precedence";

  return svgWrap("0 0 700 390", S, "INTERSECT стягивает соседей первым", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .leaf { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .node { fill: var(--sunk); stroke: var(--muted); stroke-width: 1.3; }
.dg-${S} .hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .edge { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .hotedge { stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="mono" x="24" y="34" font-size="12.5" font-weight="700">отборы  UNION  строки заказов  INTERSECT  остаток в A-02-01</text>
<text class="cap" x="24" y="54" font-size="11.5">одна и та же цепочка без единой скобки — два разных смысла</text>
<line class="split" x1="350" y1="72" x2="350" y2="326"/>

<text class="cap" x="24" y="94" font-size="12" font-weight="600">как читаешь ты — слева направо</text>
<rect class="node" x="104" y="106" width="134" height="30" rx="8"/>
<text class="mono" x="171" y="126" font-size="11.5" text-anchor="middle">INTERSECT</text>
<line class="edge" x1="140" y1="136" x2="86" y2="178"/>
<line class="edge" x1="204" y1="136" x2="261" y2="178"/>
<rect class="node" x="32" y="178" width="108" height="30" rx="8"/>
<text class="mono" x="86" y="198" font-size="11.5" text-anchor="middle">UNION</text>
<rect class="leaf" x="186" y="178" width="150" height="30" rx="8"/>
<text class="mono" x="261" y="198" font-size="10" text-anchor="middle">stock A-02-01</text>
<line class="edge" x1="72" y1="208" x2="76" y2="250"/>
<line class="edge" x1="110" y1="208" x2="182" y2="250"/>
<rect class="leaf" x="24" y="250" width="104" height="30" rx="8"/>
<text class="mono" x="76" y="270" font-size="10" text-anchor="middle">pickdetail</text>
<rect class="leaf" x="136" y="250" width="112" height="30" rx="8"/>
<text class="mono" x="192" y="270" font-size="10" text-anchor="middle">orderdetail</text>
<text class="mono" x="24" y="302" font-size="10">(отборы UNION заказы) INTERSECT остаток</text>
<text class="cap" x="24" y="318" font-size="11">то, что ты имел в виду, — 2 строки</text>

<text class="cap" x="380" y="94" font-size="12" font-weight="600">как сворачивает сервер</text>
<rect class="hot" x="460" y="106" width="134" height="30" rx="8"/>
<text class="mono" x="527" y="126" font-size="11.5" text-anchor="middle">UNION</text>
<line class="hotedge" x1="496" y1="136" x2="439" y2="178"/>
<line class="hotedge" x1="558" y1="136" x2="590" y2="178"/>
<rect class="leaf" x="380" y="178" width="118" height="30" rx="8"/>
<text class="mono" x="439" y="198" font-size="10" text-anchor="middle">pickdetail</text>
<rect class="hot" x="520" y="178" width="140" height="30" rx="8"/>
<text class="mono" x="590" y="198" font-size="11.5" text-anchor="middle">INTERSECT</text>
<line class="hotedge" x1="566" y1="208" x2="508" y2="250"/>
<line class="hotedge" x1="614" y1="208" x2="624" y2="250"/>
<rect class="leaf" x="452" y="250" width="112" height="30" rx="8"/>
<text class="mono" x="508" y="270" font-size="10" text-anchor="middle">orderdetail</text>
<rect class="leaf" x="572" y="250" width="104" height="30" rx="8"/>
<text class="mono" x="624" y="270" font-size="9.5" text-anchor="middle">stock A-02-01</text>
<text class="mono" x="380" y="302" font-size="10">отборы UNION (заказы INTERSECT остаток)</text>
<text class="cap" x="380" y="318" font-size="11">то, что получишь на самом деле, — 7 строк</text>

<line x1="24" y1="334" x2="676" y2="334" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="24" y="356" font-size="11">Сила такая: сначала INTERSECT, потом UNION и EXCEPT — они равны между собой и разбираются слева направо.</text>
<text class="cap" x="24" y="376" font-size="11">Сервер не ругается: синтаксис безупречен, строки приходят — просто не те. Смешал операции — поставь скобки.</text>
`);
}

/* ---------------------------------------------------------------- реестр */

export const REGISTRY = {
  "join-pairs": {
    id: "join-pairs",
    title: "Соединение перебирает пары строк",
    caption: "Одна строка слева, каждая строка справа примеряется к ней по очереди. Пара, на которой предикат из ON сказал «да», даёт одну строку результата — и колонки в неё приходят из обеих половин пары.",
    anchor: "Что здесь произошло",
    svg: buildJoinPairs(),
  },
  "join-fanout": {
    id: "join-fanout",
    title: "Одна строка слева, три пары справа",
    caption: "У молока одна строка в справочнике и три в остатках — значит три пары и три строки результата, с повтором названия. У чая пар нет ни одной, и в отчёт он не попадёт вовсе.",
    anchor: "JOIN не приклеивает колонки, он образует пары",
    svg: buildJoinFanout(),
  },
  "left-join-fill": {
    id: "left-join-fill",
    title: "LEFT JOIN дописывает строку без пары",
    caption: "Слева таблица берётся целиком, справа встаёт то, что нашлось. Строке, которой пары не нашлось, движок дописывает NULL сразу во все колонки правой таблицы — и это не данные, а ответ «пары нет».",
    anchor: "Что здесь произошло",
    svg: buildLeftJoinFill(),
  },
  "outer-three": {
    id: "outer-three",
    title: "Три внешних соединения рядом",
    caption: "Строки соединения бывают трёх сортов, и LEFT, RIGHT и FULL отличаются только судьбой крайних. RIGHT — то же самое, что LEFT, если переставить таблицы местами.",
    anchor: "RIGHT JOIN: то же самое, только зеркально",
    svg: buildOuterThree(),
  },
  "anti-join": {
    id: "anti-join",
    title: "Антисоединение оставляет ровно сирот",
    caption: "Колонка правой таблицы бывает пустой только у строки без пары. Поэтому LEFT JOIN плюс IS NULL по этой колонке отвечает не на вопрос «что с чем совпало», а на вопрос «а чего нет».",
    anchor: "Антисоединение: как спросить «а чего нет»",
    svg: buildAntiJoin(),
  },
  "left-to-inner": {
    id: "left-to-inner",
    title: "LEFT схлопывается в INNER",
    caption: "Условие по правой таблице в WHERE срезает дописанные строки: сравнение с заглушкой даёт UNKNOWN, а WHERE открывается только на TRUE. Слово LEFT остаётся в тексте, результат становится как у INNER.",
    anchor: "Где на этом спотыкаются",
    svg: buildLeftToInner(),
  },
  "on-vs-where": {
    id: "on-vs-where",
    title: "ON строит пары, WHERE режет готовое",
    caption: "Между ступенями есть момент, когда соединение уже собрано, а фильтрация ещё не начиналась. Условие в ON решает, кто кому пара; условие в WHERE режет готовый результат вместе с дописанными строками.",
    anchor: "Что здесь произошло",
    svg: buildOnVsWhere(),
  },
  "full-both-sides": {
    id: "full-both-sides",
    title: "У FULL сироты с обеих сторон",
    caption: "Правило «правая таблица — в ON, левая — в WHERE» держалось на том, что у соединения есть сохраняемая сторона. У FULL их две, и обычный предикат в WHERE рубит обе — какую бы колонку он ни упоминал.",
    anchor: "У FULL OUTER JOIN сторон нет, и правило перестаёт работать",
    svg: buildFullBothSides(),
  },
  "cross-grid": {
    id: "cross-grid",
    title: "Каждая слева с каждой справа",
    caption: "Условия нет, значит сервер не выбирает пары — он берёт все. Две ячейки на три товара дают шесть клеток, и число строк на выходе всегда произведение, а не сумма.",
    anchor: "Что здесь произошло",
    svg: buildCrossGrid(),
  },
  "cross-plus-left": {
    id: "cross-plus-left",
    title: "Сетка, а на неё факты",
    caption: "CROSS JOIN строит решётку всех сочетаний, которые должны существовать, а LEFT JOIN навешивает на неё то, что существует на самом деле. Где факта нет, остаётся прочерк — ради него отчёт и делали.",
    anchor: "Сетка плюс факты: отчёт без дырок",
    svg: buildCrossPlusLeft(),
  },
  "self-join-two-copies": {
    id: "self-join-two-copies",
    title: "Одна таблица как два источника",
    caption: "Сервер не знает, что a и b читают одни и те же данные: для него это два независимых набора строк. Поэтому self join не требует нового оператора — но требует алиасов, иначе имена источников совпадут.",
    anchor: "Что здесь произошло",
    svg: buildSelfJoinTwoCopies(),
  },
  "self-join-matrix": {
    id: "self-join-matrix",
    title: "Девять сочетаний: самопары, пары и зеркала",
    caption: "Диагональ — строки, соединённые сами с собой. Верхний треугольник — то, что оставляет строгое «меньше». Нижний — те же самые пары, записанные наоборот, и именно из них берётся удвоение отчёта.",
    anchor: "Почему каждая пара приходит дважды",
    svg: buildSelfJoinMatrix(),
  },
  "self-join-boss": {
    id: "self-join-boss",
    title: "Сотрудник и его начальник — две роли одной таблицы",
    caption: "bossid смотрит на id той же таблицы, и два алиаса разводят строки по ролям. У директора ссылка пустая, поэтому соединение здесь именно LEFT: INNER вычеркнул бы его из отчёта молча.",
    anchor: "Начальник и подчинённый: зачем это придумали в жизни",
    svg: buildSelfJoinBoss(),
  },
  "chain-fold": {
    id: "chain-fold",
    title: "Цепочка сворачивается слева направо",
    caption: "Движок берёт таблицы по одной, и после каждого шага у него на руках одна промежуточная таблица. Она целиком становится левой стороной следующего соединения — поэтому a JOIN b JOIN c это (a JOIN b) JOIN c.",
    anchor: "Цепочка сворачивается слева направо",
    svg: buildChainFold(),
  },
  "join-parens": {
    id: "join-parens",
    title: "Необязательная ветка и две починки",
    caption: "Внутреннее соединение ниже по цепочке аннулирует LEFT, стоящий выше. Лечится либо тем, что вся ветка идёт через LEFT, либо скобками: они собирают ветку в один блок, который цепляется к заказам целиком.",
    anchor: "Лечится двумя способами: LEFT дальше по цепочке или скобки",
    svg: buildJoinParens(),
  },
  "lateral-loop": {
    id: "lateral-loop",
    title: "Подзапрос выполняется заново на каждую строку слева",
    caption: "Колонки текущей левой строки подставляются внутрь скобок, и подзапрос выполняется с этой подстановкой. Не один раз на весь запрос, а по разу на каждую строку слева — отсюда и слово «корреляция».",
    anchor: "Что здесь произошло",
    svg: buildLateralLoop(),
  },
  "apply-lateral-map": {
    id: "apply-lateral-map",
    title: "CROSS APPLY и JOIN LATERAL — одно и то же",
    caption: "В SQL Server слова LATERAL нет, в PostgreSQL нет слова APPLY, а мысль одна и та же. Соответствие дословное, и перевод делается механически: конструкция, хвост ON и форма ограничения.",
    anchor: "То же самое в SQL Server",
    svg: buildApplyLateralMap(),
  },
  "union-stack": {
    id: "union-stack",
    title: "JOIN кладёт листы рядом, UNION — стопкой",
    caption: "У JOIN строк осталось столько же, а колонок прибавилось. У UNION колонок как было, зато строк стало больше, чем в любой ветке по отдельности. Вбок против вниз — вся разница в направлении.",
    anchor: "Что здесь произошло",
    svg: buildUnionStack(),
  },
  "union-dedup": {
    id: "union-dedup",
    title: "UNION — это UNION ALL плюс неявный DISTINCT",
    caption: "Дедупликация — отдельная ступень, а не свойство слова. Она схлопывает совпавшие целиком строки, не разбирая, из какой ветки они пришли, и стоит сортировки или хеша по всему объединённому набору.",
    anchor: "UNION против UNION ALL: кто платит за чистоту",
    svg: buildUnionDedup(),
  },
  "except-intersect": {
    id: "except-intersect",
    title: "Что оставляет разность и что оставляет пересечение",
    caption: "Два набора распадаются на три зоны: только слева, в обеих сразу, только справа. EXCEPT берёт левую зону, INTERSECT — среднюю, и сравнивает при этом строку целиком со строкой целиком.",
    anchor: "Что здесь произошло",
    svg: buildExceptIntersect(),
  },
  "set-precedence": {
    id: "set-precedence",
    title: "INTERSECT стягивает соседей первым",
    caption: "Слева — как цепочку читаешь ты, справа — как её сворачивает сервер. INTERSECT сильнее, поэтому a UNION b INTERSECT c это a UNION (b INTERSECT c). Ошибки при этом нет, а строк приходит разное число.",
    anchor: "INTERSECT сильнее остальных, и это ровно тот же урок, что был с AND и OR",
    svg: buildSetPrecedence(),
  },
};

// Привязка схем к нодам: код ноды -> список id.
export const INDEX = {
  "d3.01": ["join-pairs", "join-fanout"],
  "d3.02": ["left-join-fill", "outer-three", "anti-join", "left-to-inner"],
  "d3.03": ["on-vs-where", "full-both-sides"],
  "d3.04": ["cross-grid", "cross-plus-left"],
  "d3.05": ["self-join-two-copies", "self-join-matrix", "self-join-boss"],
  "d3.06": ["chain-fold", "join-parens"],
  "d3.07": ["lateral-loop", "apply-lateral-map"],
  "d3.08": ["union-stack", "union-dedup"],
  "d3.09": ["except-intersect", "set-precedence"],
};
