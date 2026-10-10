// diagrams-sql-05.js
// Схемы этапа 5: подзапросы и CTE.
//
// Оснастка общая (diagrams-sql-kit.js), правила те же: самодостаточный модуль,
// цвета только через CSS-переменные страницы, никакого JS внутри SVG.
// Образец стиля — diagrams-sql-02.js.

import { arrowDefs, checkIcon, crossIcon, svgWrap } from "./diagrams-sql-kit.js";

/* ---------------------------------------------------------------- d5.01 */

// Скалярный подзапрос как «дырка под одно значение» в списке SELECT: слева
// текст запроса с подсвеченными скобками, ниже — что вернули эти скобки
// (таблица 1×1) и что получилось в итоге. Схема существует ради мысли, что
// сервер видит на месте скобок не запрос, а число, и потому строки не пропали.
function buildScalarSlot() {
  const S = "scalar-slot";
  const rows = [
    ["MILK-1L", "A-01-01", "48.000", "975.750"],
    ["MILK-1L", "A-01-01", "60.000", "975.750"],
    ["MILK-1L", "B-01-01", "120.000", "975.750"],
  ];

  const cols = [
    ["skuid", 246, 112],
    ["loc", 358, 92],
    ["qty", 450, 80],
    ["total_qty", 530, 120],
  ];

  const head = cols.map(([name, x, w], i) =>
    `<rect class="${i === 3 ? "thead-hot" : "thead"}" x="${x}" y="186" width="${w}" height="22"/>
<text class="cap${i === 3 ? " t-accent" : ""}" x="${x + w / 2}" y="201" font-size="10.5" text-anchor="middle">${name}</text>`).join("\n");

  const body = rows.map((r, i) => {
    const y = 208 + i * 30;
    return r.map(([], j) => {
      const [, x, w] = cols[j];
      return `<rect class="${j === 3 ? "tcell-hot" : "tcell"}" x="${x}" y="${y}" width="${w}" height="30"/>
<text class="mono${j === 3 ? " t-accent" : ""}" x="${x + w / 2}" y="${y + 19}" font-size="11" text-anchor="middle">${r[j]}</text>`;
    }).join("\n");
  }).join("\n");

  return svgWrap("0 0 700 400", S, "Скалярный подзапрос стоит на месте одного значения", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .qbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .slot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .thead { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .thead-hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .tcell { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .tcell-hot { fill: var(--paper); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .hotflow { stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">На месте четвёртой колонки списка SELECT стоит не имя и не выражение, а целый запрос в скобках</text>

<rect class="qbox" x="26" y="44" width="648" height="104" rx="10"/>
<rect class="slot" x="91" y="76" width="245" height="21" rx="5"/>
<text class="mono" x="42" y="70" font-size="12.5">SELECT skuid, loc, lot, qty,</text>
<text class="mono" x="94.7" y="92" font-size="12.5">(SELECT sum(qty) FROM dbo.stock) AS total_qty</text>
<text class="mono" x="42" y="114" font-size="12.5">FROM dbo.stock</text>
<text class="mono" x="42" y="136" font-size="12.5">WHERE skuid = 'MILK-1L'</text>

<line class="flow" x1="100" y1="152" x2="100" y2="180" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="112" y="178" font-size="10.5">выполняется отдельно</text>

<rect class="thead" x="26" y="186" width="150" height="22"/>
<text class="cap" x="101" y="201" font-size="10.5" text-anchor="middle">sum(qty)</text>
<rect class="tcell-hot" x="26" y="208" width="150" height="30"/>
<text class="mono t-accent" x="101" y="228" font-size="13" font-weight="700" text-anchor="middle">975.750</text>
<text class="cap" x="101" y="256" font-size="10.5" text-anchor="middle">одна строка</text>
<text class="cap" x="101" y="272" font-size="10.5" text-anchor="middle">и одна колонка</text>
<text class="cap" x="101" y="292" font-size="10.5" text-anchor="middle">то есть одно значение</text>

<line class="hotflow" x1="180" y1="222" x2="240" y2="222" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap" x="210" y="212" font-size="10" text-anchor="middle">как число</text>

<text class="cap" x="246" y="178" font-size="10.5">значение встаёт на место скобок — и так в каждой строке</text>
${head}
${body}

<line x1="26" y1="322" x2="674" y2="322" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="344" font-size="11">Подзапрос, отдающий ровно одно значение, — скалярный. Сервер видит на его месте не запрос, а число.</text>
<text class="cap" x="26" y="364" font-size="11">Поэтому его можно поставить всюду, где допустимо одно значение: в SELECT, в WHERE, в ORDER BY, в CASE.</text>
<text class="cap" x="26" y="384" font-size="11">Правило GROUP BY не нарушено: агрегат живёт внутри своих скобок, наружу выходит уже не агрегат.</text>
`);
}

// Три формы результата подзапроса рядом: 1×1 работает, «много строк» падает
// на данных, «много колонок» не запускается вовсе. Схема существует ради того,
// чтобы стало видно, ПОЧЕМУ эти две ошибки ловятся в разное время: число
// колонок написано в тексте, а число строк из текста не видно никак.
function buildScalarArity() {
  const S = "scalar-arity";

  // сдвиг ряда, строки кода, ячейки результата, подпись формы, ok?,
  // строки сообщения сервера, код, когда ловится, пояснение к «когда»
  const rows = [
    {
      y: 64,
      code: ["(SELECT sum(qty)", "FROM dbo.stock)"],
      shape: [["975.750"]],
      form: "1 строка × 1 колонка",
      ok: true,
      msg: ["значение готово,", "подзапрос скалярный"],
      code2: "",
      when: "никогда",
      why: "агрегат без GROUP BY",
      why2: "даёт строку всегда",
    },
    {
      y: 152,
      code: ["(SELECT lot FROM dbo.lot", "WHERE skuid = 'MILK-1L')"],
      shape: [["L0001"], ["L0002"], ["L0013"]],
      form: "3 строки × 1 колонка",
      ok: false,
      msg: ["more than one row", "returned by a subquery", "used as an expression"],
      code2: "SQLSTATE 21000",
      when: "при выполнении",
      why: "пока партия одна —",
      why2: "работает годами",
    },
    {
      y: 250,
      code: ["(SELECT lot, expdate", "FROM dbo.lot", "WHERE lot = 'L0001')"],
      shape: [["L0001", "2026-07-20"]],
      form: "1 строка × 2 колонки",
      ok: false,
      msg: ["subquery must return", "only one column"],
      code2: "SQLSTATE 42601",
      when: "при разборе текста",
      why: "не запустится вообще,",
      why2: "данные не смотрели",
    },
  ];

  const body = rows.map((r) => {
    const code = r.code.map((ln, i) =>
      `<text class="mono" x="26" y="${r.y + 20 + i * 15}" font-size="10.5">${ln}</text>`).join("\n");

    const cellW = r.shape[0].length === 2 ? 58 : 96;
    const grid = r.shape.map((line, i) => line.map((v, j) => {
      const x = 236 + j * (cellW + 2);
      const y = r.y + 10 + i * 24;
      return `<rect class="${r.ok ? "cell-ok" : "cell-bad"}" x="${x}" y="${y}" width="${cellW}" height="22" rx="4"/>
<text class="mono" x="${x + cellW / 2}" y="${y + 15}" font-size="${cellW === 58 ? 9 : 10.5}" text-anchor="middle">${v}</text>`;
    }).join("\n")).join("\n");

    const formY = r.y + 10 + r.shape.length * 24 + 12;
    const icon = r.ok ? checkIcon(360, r.y + 12, 14) : crossIcon(360, r.y + 12, 14);
    const msg = r.msg.map((ln, i) =>
      `<text class="${r.ok ? "cap" : "mono t-bad"}" x="382" y="${r.y + 24 + i * 14}" font-size="${r.ok ? 10.5 : 9.5}">${ln}</text>`).join("\n");
    const code2 = r.code2
      ? `<text class="cap" x="382" y="${r.y + 24 + r.msg.length * 14 + 4}" font-size="9.5">${r.code2}</text>` : "";

    return `${code}
${grid}
<text class="cap" x="${236 + (r.shape[0].length === 2 ? 59 : 48)}" y="${formY}" font-size="10" text-anchor="middle">${r.form}</text>
${icon}
${msg}
${code2}
<text class="${r.ok ? "cap" : "t-bad"}" x="536" y="${r.y + 24}" font-size="11" font-weight="600">${r.when}</text>
<text class="cap" x="536" y="${r.y + 42}" font-size="10">${r.why}</text>
<text class="cap" x="536" y="${r.y + 56}" font-size="10">${r.why2}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 412", S, "Одна строка и одна колонка: два способа это нарушить", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .cell-ok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .cell-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; }
.dg-${S} .rule { stroke: var(--line-soft); stroke-width: 1; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Скаляр — это ровно одна строка и ровно одна колонка. Нарушить требование можно двумя способами</text>

<text class="cap" x="26" y="52" font-size="10">подзапрос</text>
<text class="cap" x="236" y="52" font-size="10">что он вернул</text>
<text class="cap" x="360" y="52" font-size="10">что скажет сервер</text>
<text class="cap" x="536" y="52" font-size="10">когда это выяснится</text>
<line class="rule" x1="26" y1="58" x2="674" y2="58"/>
<line class="rule" x1="26" y1="146" x2="674" y2="146"/>
<line class="rule" x1="26" y1="244" x2="674" y2="244"/>
${body}

<line x1="26" y1="336" x2="674" y2="336" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="358" font-size="11">Число колонок написано прямо в тексте: сервер видит его сразу и не запускает запрос вообще.</text>
<text class="cap" x="26" y="378" font-size="11">Число строк из текста не видно — оно зависит от данных. Поэтому 21000 ловят не на ревью, а в бою.</text>
<text class="cap" x="26" y="398" font-size="11">Одну строку гарантируют: агрегат без GROUP BY, фильтр по ключу, ORDER BY плюс FETCH FIRST 1 ROW ONLY.</text>
`);
}

/* ---------------------------------------------------------------- d5.02 */

// Подзапрос-список под IN: слева набор, который посчитал внутренний запрос,
// справа строки справочника, каждая из которых спрашивает у набора «я тут
// есть?». Схема существует ради двух мыслей: список приехал из таблицы, а не
// из текста, и IN проверяет принадлежность, а не считает совпадения — поэтому
// молоко, попавшее в набор дважды, даёт в результате одну строку.
function buildInPodzapros() {
  const S = "in-podzapros";
  // значение набора и признак «это дубликат молока»
  const bag = [
    ["MILK-1L", true],
    ["MILK-1L", true],
    ["BREAD-DARK", false],
    ["KEFIR-05", false],
    ["BUTTER-180", false],
    ["CHICKEN-KG", false],
  ];
  // строка справочника и прошла ли она
  const skus = [
    ["MILK-1L", true],
    ["BREAD-DARK", true],
    ["KEFIR-05", true],
    ["BUTTER-180", true],
    ["CHICKEN-KG", true],
    ["APPLE-KG", false],
    ["TEA-100", false],
  ];

  const bagRows = bag.map(([v, dup], i) => {
    const y = 186 + i * 24;
    return `<rect class="${dup ? "chip-dup" : "chipbox"}" x="38" y="${y}" width="150" height="22" rx="6"/>
<text class="mono${dup ? " t-gold" : ""}" x="52" y="${y + 15}" font-size="11">${v}</text>`;
  }).join("\n");

  const skuRows = skus.map(([v, pass], i) => {
    const y = 186 + i * 24;
    return `<rect class="${pass ? "chip-ok" : "chipbox"}" x="250" y="${y}" width="140" height="22" rx="6"/>
<text class="mono" x="264" y="${y + 15}" font-size="11">${v}</text>
${pass ? checkIcon(400, y + 4, 14) : crossIcon(400, y + 4, 14)}
<text class="cap ${pass ? "t-ok" : "t-bad"}" x="424" y="${y + 15}" font-size="10.5">${pass ? "прошла" : "не прошла"}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 446", S, "Список для IN посчитан подзапросом", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .qbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .slot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .bagbox { fill: var(--paper); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .chipbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .chip-dup { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .chip-ok { fill: var(--paper); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .dupwire { fill: none; stroke: var(--gold); stroke-width: 1.4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Список для IN не написан в тексте запроса — его посчитал другой запрос, стоящий тут же в скобках</text>

<rect class="qbox" x="26" y="42" width="648" height="86" rx="10"/>
<rect class="slot" x="152" y="94" width="262" height="21" rx="5"/>
<text class="mono" x="42" y="66" font-size="12.5">SELECT skuid, descr</text>
<text class="mono" x="42" y="88" font-size="12.5">FROM dbo.sku</text>
<text class="mono" x="42" y="110" font-size="12.5">WHERE skuid IN (SELECT skuid FROM dbo.pickdetail)</text>

<line class="flow" x1="120" y1="134" x2="120" y2="156" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="26" y="172" font-size="10.5">набор из подзапроса</text>
<rect class="bagbox" x="26" y="178" width="174" height="164" rx="10"/>
${bagRows}

<text class="cap" x="250" y="172" font-size="10.5">каждая строка dbo.sku спрашивает: я в этом наборе есть?</text>
${skuRows}

<path class="dupwire" d="M202,197 L246,197"/>
<path class="dupwire" d="M202,221 C226,221 226,199 246,197"/>

<text class="cap t-gold" x="26" y="362" font-size="10.5">шесть строк, а товаров пять</text>
<text class="cap" x="250" y="369" font-size="10.5">…и ещё пять строк справочника</text>

<text class="cap t-gold" x="500" y="200" font-size="10.5">Молоко попало в набор</text>
<text class="cap t-gold" x="500" y="216" font-size="10.5">дважды: его отбирали</text>
<text class="cap t-gold" x="500" y="232" font-size="10.5">двумя партиями.</text>
<text class="cap" x="500" y="258" font-size="10.5">Но ответ от этого не</text>
<text class="cap" x="500" y="274" font-size="10.5">меняется: IN проверяет</text>
<text class="cap" x="500" y="290" font-size="10.5">принадлежность набору,</text>
<text class="cap" x="500" y="306" font-size="10.5">а не считает совпадения.</text>
<text class="cap" x="500" y="332" font-size="10.5">Поэтому DISTINCT внутри</text>
<text class="cap" x="500" y="348" font-size="10.5">такого подзапроса —</text>
<text class="cap" x="500" y="364" font-size="10.5">чистая декорация.</text>

<line x1="26" y1="390" x2="674" y2="390" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="412" font-size="11">Подзапрос под IN обязан вернуть ровно одну колонку; строк в ней может быть сколько угодно, хоть ноль.</text>
<text class="cap" x="26" y="432" font-size="11">Ссылок наружу внутри нет: подзапрос некоррелированный, сервер считает его один раз, а не для каждой строки.</text>
`);
}

// ANY и ALL на одном и том же наборе (48, 60, 120) и с одним и тем же «>».
// Каждый квантор развёрнут в свою цепочку: ИЛИ у ANY и И у ALL. Схема нужна,
// чтобы «хотя бы одному» и «всем сразу» перестали быть словами: видно, что ANY
// тянет условие к минимуму набора, а ALL — к максимуму, отсюда 7 строк и 2.
function buildAnyAllOs() {
  const S = "any-all-os";
  // связки цепочки: пробелы неразрывные, иначе SVG их схлопнет
  const OR = `<tspan class="t-accent" font-weight="700">&#160;&#160;ИЛИ&#160;&#160;</tspan>`;
  const AND = `<tspan class="t-accent" font-weight="700">&#160;&#160;И&#160;&#160;</tspan>`;

  const col = (x0, quant, chain, link, why1, why2, eq, res, ex1, ex2, ex3) => `
<text class="mono t-accent" x="${x0}" y="${138}" font-size="12.5" font-weight="700">qty &gt; ${quant} (48, 60, 120)</text>
<text class="cap" x="${x0}" y="${160}" font-size="10.5">разворачивается в цепочку ${link}:</text>
<text class="mono" x="${x0}" y="${184}" font-size="11">${chain}</text>
<text class="cap" x="${x0}" y="${208}" font-size="10.5">${why1}</text>
<text class="cap" x="${x0}" y="${224}" font-size="10.5">${why2}</text>
<rect class="eqbox" x="${x0}" y="${238}" width="290" height="34" rx="8"/>
<text class="mono" x="${x0 + 145}" y="${259}" font-size="12" text-anchor="middle">${eq}</text>
<text class="t-accent" x="${x0}" y="${300}" font-size="11.5" font-weight="700">${res}</text>
<text class="cap" x="${x0}" y="${320}" font-size="10.5">${ex1}</text>
<text class="cap" x="${x0}" y="${336}" font-size="10.5">${ex2}</text>
<text class="cap" x="${x0}" y="${352}" font-size="10.5">${ex3}</text>`;

  const chips = [["48.000", "min"], ["60.000", ""], ["120.000", "max"]].map(([v, mark], i) => {
    const x = 268 + i * 84;
    return `<rect class="${mark ? "chip-edge" : "chipbox"}" x="${x}" y="${56}" width="76" height="26" rx="7"/>
<text class="mono" x="${x + 38}" y="${74}" font-size="11.5" text-anchor="middle">${v}</text>
${mark ? `<text class="cap t-accent" x="${x + 38}" y="${96}" font-size="10" text-anchor="middle">${mark} набора</text>` : ""}`;
  }).join("\n");

  return svgWrap("0 0 700 450", S, "ANY тянет к минимуму, ALL — к максимуму", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .chipbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .chip-edge { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .eqbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Набор один и тот же, оператор один и тот же. Разница только в слове перед скобками</text>
<text class="cap" x="26" y="74" font-size="10.5">остатки молока —</text>
<text class="cap" x="26" y="90" font-size="10.5">набор из подзапроса:</text>
${chips}

<line class="split" x1="350" y1="112" x2="350" y2="364"/>
${col(26, "ANY", `qty &gt; 48${OR}qty &gt; 60${OR}qty &gt; 120`, "ИЛИ",
    "хватит перебить самое слабое звено —",
    "сорок восемь. Условие тянется к минимуму.",
    "= то же, что  qty &gt; 48",
    "прошли 7 строк из 13",
    "самая маленькая из них — APPLE-KG 55.500;",
    "молоко на 120 тоже прошло: оно больше",
    "собственных сорока восьми")}
${col(372, "ALL", `qty &gt; 48${AND}qty &gt; 60${AND}qty &gt; 120`, "И",
    "перебить надо каждого, включая самого",
    "сильного. Условие тянется к максимуму.",
    "= то же, что  qty &gt; 120",
    "прошли 2 строки из 13",
    "SUGAR-1KG 200.000 и FLOUR-2KG 150.000;",
    "молока среди них нет — само себя",
    "оно не больше")}

<line x1="26" y1="380" x2="674" y2="380" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="400" font-size="11">Без NULL в наборе x &gt; ALL (S) это ровно x &gt; (SELECT max(...)), а x &gt; ANY (S) — ровно x &gt; (SELECT min(...)).</text>
<text class="cap" x="26" y="418" font-size="11">Отсюда же и родство: IN это в точности = ANY, а NOT IN — в точности &lt;&gt; ALL. Те же цепочки, ИЛИ против И.</text>
<text class="cap" x="26" y="436" font-size="11">Пустой набор переворачивает всё: ALL пропускает вообще всё, ANY не пропускает ничего.</text>
`);
}

/* ---------------------------------------------------------------- d5.03 */

// Ход коррелированного EXISTS: три строки справочника, и для каждой в подзапрос
// подставляется её собственный артикул. Схема существует ради двух мыслей —
// подзапрос пересчитывается для КАЖДОЙ внешней строки, и наружу из него выходит
// не значение и не число найденных строк, а одно только «нашлась / не нашлась».
function buildExistsLoop() {
  const S = "exists-loop";
  // артикул, подставленный предикат, что нашёл подзапрос, EXISTS, прошла ли
  const rows = [
    ["APPLE-KG", "p.skuid = 'APPLE-KG'", "ни одной", false],
    ["MILK-1L", "p.skuid = 'MILK-1L'", "две строки", true],
    ["TEA-100", "p.skuid = 'TEA-100'", "ни одной", false],
  ];

  const body = rows.map(([sku, pred, found, ex], i) => {
    const top = 164 + i * 44;
    const cy = top + 21;
    const pill = (x, w, val, good) =>
      `<rect class="${good ? "pill-ok" : "pill-bad"}" x="${x}" y="${top + 7}" width="${w}" height="28" rx="8"/>
<text class="mono ${good ? "t-ok" : "t-bad"}" x="${x + w / 2}" y="${cy + 4}" font-size="11" font-weight="700" text-anchor="middle">${val}</text>`;
    return `<rect class="chipbox" x="26" y="${top + 7}" width="114" height="28" rx="7"/>
<text class="mono" x="38" y="${cy + 4}" font-size="11">${sku}</text>
<text class="mono t-accent" x="152" y="${cy + 4}" font-size="11">${pred}</text>
<text class="cap" x="330" y="${cy + 4}" font-size="10.5">${found}</text>
${pill(432, 88, ex ? "TRUE" : "FALSE", ex)}
${pill(528, 108, ex ? "FALSE" : "TRUE", !ex)}
${ex ? crossIcon(650, cy - 7, 14) : checkIcon(650, cy - 7, 14)}`;
  }).join("\n");

  return svgWrap("0 0 700 406", S, "EXISTS перебирает внешние строки по одной", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .qbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .chipbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pill-ok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .pill-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .rule { stroke: var(--line-soft); stroke-width: 1; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Внутри скобок стоит ссылка наружу — и поэтому подзапрос считается заново для каждой строки справочника</text>

<rect class="qbox" x="26" y="42" width="648" height="94" rx="10"/>
<text class="mono" x="42" y="66" font-size="12.5">SELECT k.skuid, k.descr</text>
<text class="mono" x="42" y="88" font-size="12.5">FROM dbo.sku k</text>
<text class="mono" x="42" y="110" font-size="12.5">WHERE NOT EXISTS (SELECT 1 FROM dbo.pickdetail p</text>
<text class="mono" x="177.5" y="128" font-size="12.5">WHERE p.skuid = <tspan class="t-accent" font-weight="700">k.skuid</tspan>)</text>

<text class="cap" x="26" y="156" font-size="10">строка dbo.sku</text>
<text class="cap" x="152" y="156" font-size="10">предикат внутри превратился в</text>
<text class="cap" x="330" y="156" font-size="10">нашёл</text>
<text class="cap" x="432" y="156" font-size="10">EXISTS</text>
<text class="cap" x="528" y="156" font-size="10">NOT EXISTS</text>
<text class="cap" x="640" y="156" font-size="10">итог</text>
<line class="rule" x1="26" y1="162" x2="674" y2="162"/>
${body}
<line class="rule" x1="26" y1="296" x2="674" y2="296"/>
<text class="cap" x="26" y="314" font-size="10.5">…и так все двенадцать раз: пять раз EXISTS сказал «да», семь раз «нет» — вместе ровно двенадцать</text>

<line x1="26" y1="330" x2="674" y2="330" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="352" font-size="11">Нашлась одна строка или тысяча — EXISTS отвечает одинаково: наружу выходит только «да» или «нет».</text>
<text class="cap" x="26" y="372" font-size="11">Поэтому список колонок внутри не вычисляется: SELECT 1, SELECT *, SELECT NULL — ответ один и тот же.</text>
<text class="cap" x="26" y="392" font-size="11">Убери ссылку k.skuid — и вопрос сменится на «есть ли в pickdetail хоть что-нибудь»: всё или ничего.</text>
`);
}

// Один вопрос про TEA-100, один и тот же список с шестью заглушками — и два
// разных ответа. Схема существует ради того, чтобы показать место, где ломается
// NOT IN: цепочка И спотыкается о сравнение с NULL и отдаёт UNKNOWN, тогда как
// NOT EXISTS спрашивает про наличие строки, а оно известно всегда точно.
function buildNotInHole() {
  const S = "not-in-hole";
  const list = ["BREAD-DARK", "BUTTER-180", "CHICKEN-KG", "KEFIR-05", "MILK-1L", "MILK-1L"];

  const chips = list.map((v, i) => {
    const x = 26 + i * 92;
    return `<rect class="chipbox" x="${x}" y="64" width="86" height="24" rx="6"/>
<text class="mono" x="${x + 43}" y="80" font-size="9.5" text-anchor="middle">${v}</text>`;
  }).join("\n");

  // сравнение и его исход в цепочке NOT IN
  const chain = [
    ["'TEA-100' &lt;&gt; 'MILK-1L'", "TRUE", "ok"],
    ["'TEA-100' &lt;&gt; 'KEFIR-05'", "TRUE", "ok"],
    ["…ещё четыре сравнения", "TRUE", "ok"],
    ["'TEA-100' &lt;&gt; NULL", "UNKNOWN", "gold"],
  ].map(([expr, verdict, tone], i) => {
    const y = 196 + i * 22;
    return `<text class="mono ${tone === "gold" ? "t-gold" : ""}" x="26" y="${y}" font-size="10.5">${expr}</text>
<text class="mono t-${tone}" x="228" y="${y}" font-size="10.5" font-weight="700">${verdict}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 461", S, "NOT IN спрашивает про значения, NOT EXISTS — про строки", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .chipbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .chip-null { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.4; stroke-dasharray: 3 3; }
.dg-${S} .resbox-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .resbox-ok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .goldbox { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .plainbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Один вопрос про TEA-100, один и тот же список из LEFT JOIN — и два совершенно разных ответа</text>

<text class="cap" x="26" y="56" font-size="10.5">список отобранных артикулов, собранный через LEFT JOIN:</text>
${chips}
<rect class="chip-null" x="578" y="64" width="96" height="24" rx="6"/>
<text class="mono t-gold" x="626" y="80" font-size="9.5" text-anchor="middle">NULL × 6</text>
<text class="cap t-gold" x="26" y="106" font-size="10.5">шесть заглушек — строки заказов, по которым отбора ещё не было; глазами в отчёте их никто не заметит</text>

<line class="split" x1="350" y1="120" x2="350" y2="396"/>

<text class="mono t-accent" x="26" y="142" font-size="12" font-weight="700">'TEA-100' NOT IN (список)</text>
<text class="cap" x="26" y="166" font-size="10.5">спрашивает про значения и разворачивается</text>
<text class="cap" x="26" y="180" font-size="10.5">в цепочку И:</text>
${chain}
<rect class="goldbox" x="26" y="296" width="300" height="30" rx="8"/>
<text class="mono t-gold" x="176" y="316" font-size="11" font-weight="700" text-anchor="middle">TRUE И UNKNOWN = UNKNOWN</text>
<rect class="resbox-bad" x="26" y="334" width="300" height="30" rx="8"/>
<text class="mono t-bad" x="176" y="354" font-size="11.5" font-weight="700" text-anchor="middle">ответ предиката: NULL</text>
${crossIcon(26, 380, 14)}
<text class="cap t-bad" x="48" y="392" font-size="10.5">WHERE неизвестность не пропускает — чай выпал</text>

<text class="mono t-accent" x="372" y="142" font-size="12" font-weight="700">NOT EXISTS (… p.skuid = 'TEA-100')</text>
<text class="cap" x="372" y="166" font-size="10.5">спрашивает одно: нашлась ли строка?</text>
<text class="cap" x="372" y="180" font-size="10.5">на значения он не смотрит вовсе</text>
<rect class="plainbox" x="372" y="196" width="302" height="76" rx="9"/>
<text class="cap" x="386" y="218" font-size="10.5">подзапрос пробежал те же двенадцать строк</text>
<text class="cap" x="386" y="236" font-size="10.5">и искал среди них хотя бы одну,</text>
<text class="mono" x="386" y="256" font-size="10.5">где p.skuid = 'TEA-100'</text>
<rect class="plainbox" x="372" y="296" width="302" height="30" rx="8"/>
<text class="mono" x="523" y="316" font-size="11" font-weight="700" text-anchor="middle">строк нет → EXISTS = false</text>
<rect class="resbox-ok" x="372" y="334" width="302" height="30" rx="8"/>
<text class="mono t-ok" x="523" y="354" font-size="11.5" font-weight="700" text-anchor="middle">ответ предиката: true</text>
${checkIcon(372, 380, 14)}
<text class="cap t-ok" x="394" y="392" font-size="10.5">WHERE пропускает — чай в отчёте, как и должно быть</text>

<line x1="26" y1="404" x2="674" y2="404" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="426" font-size="11">NOT IN спрашивает про значения, и одно неизвестное значение отравляет весь ответ.</text>
<text class="cap" x="26" y="446" font-size="11">NOT EXISTS спрашивает про наличие строки, а оно известно всегда точно: третьего ответа у него нет.</text>
`);
}

// Три механизма на одном вопросе «каких товаров ни разу не отбирали»: у всех
// троих один и тот же ответ на хороших данных, но разные внутренности и разные
// мины. Схема существует ради вывода: NOT EXISTS отвечает ровно на заданный
// вопрос и один не имеет своей ловушки.
function buildThreeAntis() {
  const S = "three-antis";
  const cols = [
    {
      x: 26,
      head: "LEFT JOIN … IS NULL",
      steps: [
        ["соединяем справочник", "со всеми строками отбора"],
        ["получается широкая таблица,", "у части строк — заглушки"],
        ["оставляем только те,", "где p.skuid IS NULL"],
      ],
      risk: ["своя мина: проверять надо заведомо", "NOT NULL колонку, иначе настоящий", "NULL притворится сиротой"],
      tone: "warn",
    },
    {
      x: 248,
      head: "NOT IN (…)",
      steps: [
        ["подзапрос собирает", "список значений"],
        ["сверяем свой артикул", "с каждым из списка"],
        ["не совпал ни с одним —", "товар проходит"],
      ],
      risk: ["мина: один NULL в списке —", "и отчёт пуст, молча", "и без единого симптома"],
      tone: "bad",
    },
    {
      x: 470,
      head: "NOT EXISTS (…)",
      steps: [
        ["для каждого товара", "запускаем подзапрос"],
        ["смотрим только одно:", "строка нашлась или нет"],
        ["не нашлась —", "товар проходит"],
      ],
      risk: ["своей мины нет: наличие строки", "известно всегда точно,", "UNKNOWN тут неоткуда взяться"],
      tone: "ok",
    },
  ];

  const body = cols.map((c) => {
    const steps = c.steps.map(([a, b], i) => {
      const y = 82 + i * 68;
      const arrow = i === 2 ? "" :
        `<line class="flow" x1="${c.x + 101}" y1="${y + 54}" x2="${c.x + 101}" y2="${y + 66}" marker-end="url(#${S}-arrow)"/>`;
      return `<rect class="stepbox" x="${c.x}" y="${y}" width="202" height="54" rx="9"/>
<text class="cap" x="${c.x + 101}" y="${y + 23}" font-size="10" text-anchor="middle">${a}</text>
<text class="cap" x="${c.x + 101}" y="${y + 39}" font-size="10" text-anchor="middle">${b}</text>
${arrow}`;
    }).join("\n");
    const tone = c.tone === "ok" ? "t-ok" : c.tone === "bad" ? "t-bad" : "t-gold";
    const risk = c.risk.map((ln, i) =>
      `<text class="cap ${tone}" x="${c.x}" y="${348 + i * 16}" font-size="10">${ln}</text>`).join("\n");
    return `<text class="mono t-accent" x="${c.x}" y="${64}" font-size="11.5" font-weight="700">${c.head}</text>
${steps}
<line class="flow" x1="${c.x + 101}" y1="${272}" x2="${c.x + 101}" y2="${284}" marker-end="url(#${S}-arrow-accent)"/>
<rect class="resbox" x="${c.x}" y="${288}" width="202" height="32" rx="9"/>
<text class="t-accent" x="${c.x + 101}" y="${309}" font-size="12" font-weight="700" text-anchor="middle">семь строк</text>
${risk}`;
  }).join("\n");

  return svgWrap("0 0 700 467", S, "Три способа спросить «а чего нет»", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .stepbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .resbox { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Один вопрос — «каких товаров ни разу не отбирали» — тремя механизмами. На честном списке ответ у всех один</text>
${body}

<line x1="26" y1="412" x2="674" y2="412" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="432" font-size="11">На хороших данных все три равноправны, разница вылезает на плохих: NOT IN ломается о NULL насмерть.</text>
<text class="cap" x="26" y="452" font-size="11">Поэтому вопрос «чего нет» по умолчанию пишется через NOT EXISTS — он спрашивает ровно то, что спросили.</text>
`);
}

/* ---------------------------------------------------------------- d5.04 */

// Разворот NOT IN в цепочку неравенств на одной конкретной партии: три честных
// сравнения дают TRUE, четвёртое упирается в NULL и даёт UNKNOWN, а вся связка
// И после этого TRUE уже не отдаст. Схема существует ради того, чтобы стало
// видно место поломки: не «данные пропали», а одна пустая клетка в наборе.
function buildNotInUnfold() {
  const S = "not-in-unfold";
  const was = ["2026-07-20", "2026-07-24", "2026-07-26"];

  const chipRow = (items, y, nullAt) => items.map((v, i) => {
    const x = 82 + i * 86;
    const isNull = i === nullAt;
    return `<rect class="${isNull ? "chip-null" : "chipbox"}" x="${x}" y="${y}" width="80" height="24" rx="6"/>
<text class="mono${isNull ? " t-gold" : ""}" x="${x + 40}" y="${y + 16}" font-size="9.5" text-anchor="middle">${v}</text>`;
  }).join("\n");

  // сравнение, исход, тон
  const chain = [
    ["2026-07-22 &lt;&gt; 2026-07-20", "TRUE", "ok"],
    ["2026-07-22 &lt;&gt; 2026-07-24", "TRUE", "ok"],
    ["2026-07-22 &lt;&gt; 2026-07-26", "TRUE", "ok"],
    ["2026-07-22 &lt;&gt; NULL", "UNKNOWN", "gold"],
  ].map(([expr, verdict, tone], i) => {
    const y = 194 + i * 24;
    const link = i === 0 ? "" :
      `<text class="t-accent" x="28" y="${y - 12}" font-size="10.5" font-weight="700">И</text>`;
    return `${link}
<text class="mono ${tone === "gold" ? "t-gold" : ""}" x="48" y="${y}" font-size="10.5">${expr}</text>
<text class="mono t-${tone}" x="232" y="${y}" font-size="10.5" font-weight="700">${verdict}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 418", S, "Как NOT IN разворачивается в цепочку И", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .chipbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .chip-null { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.4; stroke-dasharray: 3 3; }
.dg-${S} .plainbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .goldbox { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .badbox { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .brace { stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">В наборе-эталоне изменилась одна строка — и отчёт из восьми строк стал пустым</text>

<text class="cap" x="26" y="76" font-size="10.5">было:</text>
${chipRow(was, 62, -1)}
<text class="t-ok" x="356" y="79" font-size="11" font-weight="600">восемь строк в отчёте</text>

<text class="cap" x="26" y="112" font-size="10.5">стало:</text>
${chipRow(was.concat(["NULL"]), 98, 3)}
<text class="t-bad" x="442" y="115" font-size="11" font-weight="600">ни одной строки</text>
<text class="cap t-gold" x="26" y="140" font-size="10.5">приняли партию воды L0008, а срок годности в карточке не проставили: колонка его допускает</text>

<text class="cap" x="26" y="168" font-size="10.5">берём партию хлеба L0004 со сроком 2026-07-22 — NOT IN разворачивается в цепочку неравенств:</text>
${chain}
<text class="cap t-gold" x="26" y="296" font-size="10.5">сравнение с NULL не даёт ни «да», ни «нет»:</text>
<text class="cap t-gold" x="26" y="312" font-size="10.5">про пустую клетку неизвестно ничего</text>

<rect class="plainbox" x="358" y="180" width="316" height="30" rx="8"/>
<text class="mono" x="516" y="200" font-size="11" text-anchor="middle">три честных сравнения → TRUE</text>
<line class="flow" x1="516" y1="212" x2="516" y2="226" marker-end="url(#${S}-arrow)"/>
<rect class="goldbox" x="358" y="230" width="316" height="30" rx="8"/>
<text class="mono t-gold" x="516" y="250" font-size="11" font-weight="700" text-anchor="middle">TRUE И UNKNOWN = UNKNOWN</text>
<line class="flow" x1="516" y1="262" x2="516" y2="276" marker-end="url(#${S}-arrow)"/>
<rect class="badbox" x="358" y="280" width="316" height="30" rx="8"/>
<text class="mono t-bad" x="516" y="300" font-size="11" font-weight="700" text-anchor="middle">WHERE пропускает только TRUE</text>
${crossIcon(358, 320, 14)}
<text class="cap t-bad" x="380" y="332" font-size="10.5">строка не прошла — и ни одна другая тоже</text>

<line x1="26" y1="348" x2="674" y2="348" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="368" font-size="11">NOT IN — не отдельный оператор, а сокращение для цепочки «не равно», склеенной через И.</text>
<text class="cap" x="26" y="386" font-size="11">Одного UNKNOWN хватает, чтобы TRUE из такой цепочки не вышел уже никогда, ни при каких данных.</text>
<text class="cap" x="26" y="404" font-size="11">Ошибки нет, предупреждения нет: запрос отработал за миллисекунды и вернул законный результат — пустой.</text>
`);
}

// Четыре клетки: попал в набор и не попал, через IN и через NOT IN. Схема
// существует ради того, чтобы стало видно, что ломается ровно одна клетка из
// четырёх, — а значит рядом всегда есть похожий работающий код, и на ревью
// конструкция выглядит знакомой и безопасной.
function buildInVsNotIn() {
  const S = "in-vs-not-in";
  // строка: подпись слева; клетки: цепочка, итог, тон итога, две строки пояснения
  const grid = [
    {
      lab: ["значение есть в наборе", "(2026-07-20)"],
      cells: [
        ["TRUE  ИЛИ  UNKNOWN", "= TRUE", "ok", ["одного TRUE в связке ИЛИ", "хватает, чтобы решить всё"]],
        ["FALSE  И  UNKNOWN", "= FALSE", "ok", ["одного FALSE в связке И тоже", "хватает — и это честный ответ"]],
      ],
    },
    {
      lab: ["значения в наборе нет", "(2026-07-22)"],
      cells: [
        ["FALSE  ИЛИ  UNKNOWN", "= UNKNOWN", "gold", ["промах стал «не знаю», но промах", "и так отбрасывался: разницы нет"]],
        ["TRUE  И  UNKNOWN", "= UNKNOWN", "bad", ["а вот здесь и ломается: строка", "должна была пройти и не прошла"]],
      ],
    },
  ];

  const body = grid.map((r, ri) => {
    const top = 74 + ri * 108;
    const lab = `<text class="cap" x="26" y="${top + 44}" font-size="10.5">${r.lab[0]}</text>
<text class="mono" x="26" y="${top + 62}" font-size="10.5">${r.lab[1]}</text>`;
    const cells = r.cells.map(([chain, res, tone, note], ci) => {
      const x = 196 + ci * 244;
      const broken = tone === "bad";
      return `<rect class="${broken ? "cell-bad" : "cell"}" x="${x}" y="${top}" width="234" height="100" rx="10"/>
<text class="mono" x="${x + 117}" y="${top + 28}" font-size="10.5" text-anchor="middle">${chain}</text>
<text class="mono t-${tone}" x="${x + 117}" y="${top + 52}" font-size="13" font-weight="700" text-anchor="middle">${res}</text>
<text class="cap" x="${x + 117}" y="${top + 74}" font-size="9.5" text-anchor="middle">${note[0]}</text>
<text class="cap" x="${x + 117}" y="${top + 88}" font-size="9.5" text-anchor="middle">${note[1]}</text>`;
    }).join("\n");
    return `${lab}\n${cells}`;
  }).join("\n");

  return svgWrap("0 0 700 408", S, "Ломается ровно одна клетка из четырёх", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .cell { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .cell-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.8; }
.dg-${S} .keybox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Один и тот же NULL в одном и том же наборе. Из четырёх клеток ломается ровно одна</text>

<text class="mono t-accent" x="313" y="64" font-size="11.5" font-weight="700" text-anchor="middle">IN — цепочка ИЛИ</text>
<text class="mono t-accent" x="557" y="64" font-size="11.5" font-weight="700" text-anchor="middle">NOT IN — цепочка И</text>
${body}

<rect class="keybox" x="26" y="300" width="648" height="38" rx="10"/>
<text class="mono" x="350" y="324" font-size="12" font-weight="700" text-anchor="middle">И губит цепочку одним UNKNOWN, ИЛИ — нет</text>

<line x1="26" y1="354" x2="674" y2="354" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="374" font-size="11">Половина запросов с NULL в наборе работает нормально — те, что с IN. Ломается только отрицание.</text>
<text class="cap" x="26" y="392" font-size="11">Проверяющий видит знакомую конструкцию, вспоминает, что «такое где-то работало», и идёт дальше.</text>
`);
}

/* ---------------------------------------------------------------- d5.05 */

// Коррелированный подзапрос как функция от строки: одно и то же тело в скобках
// на каждой внешней строке превращается в свой запрос и отдаёт своё число.
// Схема существует ради контраста справа — уберёшь ссылку наружу, и та же
// конструкция станет константой, одинаковой для всех тринадцати строк.
function buildCorrelatedRowLoop() {
  const S = "correlated-row-loop";
  // артикул внешней строки, её qty, предикат после подстановки, итог подзапроса
  const rows = [
    ["APPLE-KG", "55.500", "s2.skuid = 'APPLE-KG'", "55.500"],
    ["MILK-1L", "48.000", "s2.skuid = 'MILK-1L'", "228.000"],
    ["MILK-1L", "60.000", "s2.skuid = 'MILK-1L'", "228.000"],
    ["SUGAR-1KG", "200.000", "s2.skuid = 'SUGAR-1KG'", "200.000"],
  ];

  const body = rows.map(([sku, qty, pred, res], i) => {
    const top = 172 + i * 34;
    const b = top + 20;
    return `<rect class="rowbox" x="26" y="${top}" width="152" height="30" rx="7"/>
<text class="mono" x="38" y="${b}" font-size="10.5">${sku}</text>
<text class="mono cap" x="122" y="${b}" font-size="10.5">${qty}</text>
<text class="mono t-accent" x="194" y="${b}" font-size="10.5">${pred}</text>
<rect class="respill" x="396" y="${top}" width="100" height="30" rx="7"/>
<text class="mono" x="446" y="${b}" font-size="11" font-weight="700" text-anchor="middle">${res}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 400", S, "Коррелированный подзапрос считается заново для каждой строки", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .qbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .rowbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .respill { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .constpill { fill: var(--sunk); stroke: var(--muted); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .rule { stroke: var(--line-soft); stroke-width: 1; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Подзапрос протянул руку наружу — и поэтому считается заново для каждой внешней строки</text>

<rect class="qbox" x="26" y="42" width="648" height="82" rx="10"/>
<text class="mono" x="42" y="66" font-size="12.5">SELECT st.skuid, st.loc, st.qty,</text>
<text class="mono" x="94.7" y="88" font-size="12.5">(SELECT sum(s2.qty) FROM dbo.stock AS s2 WHERE s2.skuid = <tspan class="t-accent" font-weight="700">st.skuid</tspan>)</text>
<text class="mono" x="42" y="110" font-size="12.5">FROM dbo.stock AS st</text>

<text class="cap" x="26" y="146" font-size="10.5">тринадцать строк остатка — тринадцать отдельных вычислений, каждое со своим значением внутри</text>
<text class="cap" x="26" y="166" font-size="10">строка внешнего запроса</text>
<text class="cap" x="194" y="166" font-size="10">во что превратился WHERE внутри</text>
<text class="cap" x="396" y="166" font-size="10">что вернул</text>
${body}
<text class="cap" x="26" y="330" font-size="10.5">…и так все тринадцать раз: у молока в обеих строках один итог, у яблок — свой</text>

<text class="cap" x="516" y="180" font-size="10.5">убери ссылку наружу —</text>
<text class="cap" x="516" y="196" font-size="10.5">и та же конструкция</text>
<text class="cap" x="516" y="212" font-size="10.5">станет константой:</text>
<rect class="constpill" x="516" y="224" width="100" height="30" rx="7"/>
<text class="mono cap" x="566" y="244" font-size="11" font-weight="700" text-anchor="middle">975.750</text>
<text class="cap" x="516" y="272" font-size="10.5">одно и то же число</text>
<text class="cap" x="516" y="288" font-size="10.5">у всех тринадцати строк</text>

<line x1="26" y1="346" x2="674" y2="346" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="366" font-size="11">Обычный подзапрос — это константа: он ни на что снаружи не смотрит и раздаёт всем одно число.</text>
<text class="cap" x="26" y="384" font-size="11">Коррелированный — функция от строки: аргумент ему дают колонки внешней строки, телом служат скобки.</text>
`);
}

// Односторонняя видимость имён: изнутри скобок видно наружу, снаружи внутрь —
// нет. Схема существует ради двух практических следствий: ссылка на внутренний
// алиас снаружи даёт 42P01, а скопированный в отдельное окно коррелированный
// подзапрос падает — это и есть простой способ отличить его от обычного.
function buildCorrelatedScope() {
  const S = "correlated-scope";

  return svgWrap("0 0 700 410", S, "Изнутри наружу можно, снаружи внутрь нельзя", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-ok" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--ok)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .outer { fill: var(--paper); stroke: var(--line); stroke-width: 1.4; }
.dg-${S} .innerbox { fill: var(--sunk); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .okwire { fill: none; stroke: var(--ok); stroke-width: 1.6; }
.dg-${S} .badwire { fill: none; stroke: var(--bad); stroke-width: 1.4; stroke-dasharray: 4 3; }
.dg-${S} .wall { fill: var(--bad); }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Видимость имён односторонняя, и это надо один раз уложить в голове</text>

<rect class="outer" x="26" y="52" width="420" height="200" rx="12"/>
<text class="cap" x="40" y="72" font-size="10">внешний запрос, алиас st</text>
<text class="mono" x="40" y="96" font-size="11.5">SELECT st.skuid, <tspan class="t-bad" font-weight="700">s2.qty</tspan></text>
<text class="mono" x="40" y="116" font-size="11.5">FROM dbo.stock AS st</text>
<text class="mono" x="40" y="136" font-size="11.5">WHERE st.qty &gt;</text>

<rect class="innerbox" x="46" y="146" width="300" height="96" rx="10"/>
<text class="cap t-accent" x="58" y="166" font-size="10">подзапрос, алиас s2</text>
<text class="mono" x="58" y="190" font-size="11">(SELECT avg(s2.qty)</text>
<text class="mono" x="58" y="210" font-size="11">FROM dbo.stock AS s2</text>
<text class="mono" x="58" y="230" font-size="11">WHERE s2.skuid = <tspan class="t-accent" font-weight="700">st.skuid</tspan>)</text>

<path class="okwire" d="M232,224 C330,234 402,214 402,152 C402,112 248,122 180,110" marker-end="url(#${S}-arrow-ok)"/>
<path class="badwire" d="M206,92 C272,92 302,104 302,136"/>
<rect class="wall" x="281" y="143" width="42" height="5" rx="2.5"/>

${checkIcon(470, 84, 14)}
<text class="t-ok" x="492" y="96" font-size="11" font-weight="700">изнутри наружу — можно</text>
<text class="cap" x="470" y="118" font-size="10">подзапрос знает и свои таблицы,</text>
<text class="cap" x="470" y="134" font-size="10">и все таблицы внешнего запроса</text>

${crossIcon(470, 160, 14)}
<text class="t-bad" x="492" y="172" font-size="11" font-weight="700">снаружи внутрь — нельзя</text>
<text class="cap" x="470" y="194" font-size="10">внешний запрос про содержимое</text>
<text class="cap" x="470" y="210" font-size="10">скобок не знает ничего:</text>
<text class="mono t-bad" x="470" y="232" font-size="9.5">missing FROM-clause entry</text>
<text class="mono t-bad" x="470" y="246" font-size="9.5">for table "s2"</text>
<text class="cap" x="470" y="262" font-size="9.5">SQLSTATE 42P01</text>

<line class="split" x1="26" y1="272" x2="674" y2="272"/>
<text class="cap" x="26" y="294" font-size="11" font-weight="600">Как проверить чужой подзапрос на корреляцию: скопируй его в отдельное окно и запусти</text>
${checkIcon(26, 306, 14)}
<text class="cap" x="48" y="318" font-size="10.5">некоррелированный выполнится сам по себе — ему никто снаружи не нужен</text>
${crossIcon(26, 330, 14)}
<text class="cap" x="48" y="342" font-size="10.5">коррелированный упадёт с тем же 42P01, но уже на внешний алиас: missing FROM-clause entry for table "st"</text>

<line x1="26" y1="358" x2="674" y2="358" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="378" font-size="11">Скобки отдают наружу одно значение — и на этом их разговор с внешним запросом окончен.</text>
<text class="cap" x="26" y="396" font-size="11">Имя колонки движок ищет сначала у себя, в таблицах подзапроса, и только потом идёт наружу.</text>
`);
}

/* ---------------------------------------------------------------- d5.06 */

// Производная таблица как обычная ступень конвейера: подзапрос свернул тринадцать
// строк остатка до семи, и дальше внешний запрос работает с ними как с настоящей
// таблицей. Схема существует ради вывода про WHERE: снаружи qtytotal уже не
// агрегат, а обычная колонка, поэтому HAVING здесь не нужен.
function buildDerivedTwoSteps() {
  const S = "derived-two-steps";
  const stages = [
    { x: 25, hot: false, lines: ["dbo.stock", "тринадцать строк", "остатка"] },
    { x: 195, hot: false, lines: ["подзапрос:", "SUM(qty)", "GROUP BY loc"] },
    { x: 365, hot: true, lines: ["таблица t", "семь строк,", "две колонки"] },
    { x: 535, hot: false, lines: ["внешний запрос:", "JOIN dbo.loc", "и WHERE"] },
  ];

  const body = stages.map((st, i) => {
    const arrow = i === 3 ? "" :
      `<line class="flow" x1="${st.x + 140}" y1="246" x2="${st.x + 166}" y2="246" marker-end="url(#${S}-arrow)"/>`;
    const lineY = [236, 254, 270];
    const lines = st.lines.map((ln, j) =>
      `<text class="${j === 0 ? (st.hot ? "mono t-accent" : "mono") : (/^[A-Za-z0-9_.,()* ]+$/.test(ln) ? "cap mono" : "cap")}" x="${st.x + 70}" y="${lineY[j]}" font-size="${j === 0 ? 11.5 : 10}" ${j === 0 ? 'font-weight="700"' : ""} text-anchor="middle">${ln}</text>`).join("\n");
    return `<rect class="${st.hot ? "stagehot" : "stagebox"}" x="${st.x}" y="214" width="140" height="64" rx="10"/>
${lines}
${arrow}`;
  }).join("\n");

  return svgWrap("0 0 700 408", S, "Подзапрос в FROM — это обычная таблица", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .qbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .derived { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .stagebox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .stagehot { fill: var(--paper); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .keybox { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">В FROM стоит не имя таблицы, а целый запрос в скобках: результат любого запроса — это тоже таблица</text>

<rect class="qbox" x="26" y="42" width="648" height="148" rx="10"/>
<rect class="derived" x="76" y="74" width="262" height="68" rx="8"/>
<text class="mono" x="42" y="66" font-size="12.5">SELECT t.loc, l.zone, t.qtytotal</text>
<text class="mono" x="42" y="88" font-size="12.5">FROM (SELECT loc, SUM(qty) AS qtytotal</text>
<text class="mono" x="87.2" y="110" font-size="12.5">FROM dbo.stock</text>
<text class="mono" x="87.2" y="132" font-size="12.5">GROUP BY loc) AS t</text>
<text class="mono" x="42" y="154" font-size="12.5">JOIN dbo.loc AS l ON l.loc = t.loc</text>
<text class="mono" x="42" y="176" font-size="12.5">WHERE t.qtytotal &gt; 100</text>

<text class="cap" x="26" y="206" font-size="10.5">эти скобки живут только на время запроса — но пока он идёт, они ничем не хуже настоящей таблицы</text>
${body}

<rect class="keybox" x="26" y="296" width="648" height="42" rx="10"/>
<text class="cap" x="350" y="313" font-size="10.5" text-anchor="middle">Для внешнего запроса qtytotal — не агрегат, а обычная колонка обычной таблицы.</text>
<text class="cap" x="350" y="330" font-size="10.5" text-anchor="middle">Поэтому WHERE t.qtytotal &gt; 100 совершенно законен, и HAVING тут не нужен.</text>

<line x1="26" y1="356" x2="674" y2="356" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="376" font-size="11">Таблицу t можно джойнить, фильтровать, сортировать, группировать ещё раз и класть внутрь новых скобок.</text>
<text class="cap" x="26" y="394" font-size="11">Имя после скобки — не украшение: без него внешнему запросу нечем называть свой источник данных.</text>
`);
}

// Стена с окном: колонок внутри скобок много, а наружу выходят ровно те, что
// подзапрос вынес в свой SELECT. Схема существует ради ошибки 42703 — колонка
// «не существует», хотя она есть в исходной таблице: снаружи никакой исходной
// таблицы нет, там есть только результат подзапроса.
function buildDerivedWindow() {
  const S = "derived-window";
  // колонка исходной таблицы и проходит ли она наружу
  const inside = [
    ["loc", true],
    ["qty", true],
    ["skuid", false],
    ["lot", false],
    ["qtyallocated", false],
  ];

  const chips = inside.map(([name, pass], i) => {
    const y = 96 + i * 30;
    const wire = pass
      ? `<line class="okwire" x1="162" y1="${y + 12}" x2="${400}" y2="${y + 12}" marker-end="url(#${S}-arrow-accent)"/>`
      : `<line class="deadwire" x1="162" y1="${y + 12}" x2="322" y2="${y + 12}"/>`;
    return `<rect class="${pass ? "chip-ok" : "chipbox"}" x="26" y="${y}" width="136" height="24" rx="6"/>
<text class="mono${pass ? " t-accent" : " cap"}" x="38" y="${y + 16}" font-size="10.5">${name}</text>
${wire}`;
  }).join("\n");

  return svgWrap("0 0 700 374", S, "Наружу выходит только то, что попало в SELECT подзапроса", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .chipbox { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; }
.dg-${S} .chip-ok { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .outchip { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .failchip { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 4 3; }
.dg-${S} .wall { fill: var(--sunk); stroke: var(--muted); stroke-width: 1.3; }
.dg-${S} .okwire { stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .deadwire { stroke: var(--muted); stroke-width: 1.2; stroke-dasharray: 3 4; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Скобки производной таблицы — это стена с окном, и окно вырезано ровно по списку внутреннего SELECT</text>
<text class="mono t-accent" x="26" y="54" font-size="11">SELECT loc, SUM(qty) AS qtytotal</text>
<text class="cap" x="266" y="54" font-size="10.5">— вот это и есть размер окна</text>

<text class="cap" x="26" y="84" font-size="10">внутри скобок — dbo.stock со всеми колонками</text>
<text class="cap" x="400" y="84" font-size="10">снаружи существует только таблица t</text>

<rect class="wall" x="326" y="62" width="14" height="34"/>
<rect class="wall" x="326" y="156" width="14" height="136"/>
${chips}

<rect class="outchip" x="400" y="96" width="150" height="24" rx="6"/>
<text class="mono t-accent" x="412" y="112" font-size="10.5">t.loc</text>
<rect class="outchip" x="400" y="126" width="150" height="24" rx="6"/>
<text class="mono t-accent" x="412" y="142" font-size="10.5">t.qtytotal</text>
${checkIcon(562, 100, 14)}
${checkIcon(562, 130, 14)}

<rect class="failchip" x="400" y="216" width="150" height="24" rx="6"/>
<text class="mono t-bad" x="412" y="232" font-size="10.5">t.qtyallocated</text>
${crossIcon(562, 220, 14)}
<text class="mono t-bad" x="400" y="260" font-size="10">column t.qtyallocated does not exist</text>
<text class="cap" x="400" y="276" font-size="10">SQLSTATE 42703 — не «нет доступа»,</text>
<text class="cap" x="400" y="290" font-size="10">а именно «не существует»</text>

<line class="split" x1="26" y1="304" x2="674" y2="304"/>
<text class="cap" x="26" y="324" font-size="11">Видимость здесь обратная той, что была у коррелированного подзапроса: внешний смотрит внутрь.</text>
<text class="cap" x="26" y="342" font-size="11">И видит там не таблицы подзапроса, а только его результат — ровно те колонки, что попали в SELECT.</text>
<text class="cap" x="26" y="360" font-size="11">Нужна колонка снаружи — вынеси её в SELECT подзапроса: дотянуться до неё потом уже не выйдет.</text>
`);
}

// Почему «сначала свернуть, потом соединить»: у молока три строки остатка и три
// партии, JOIN даёт девять строк, и SUM честно складывает все девять — 684 вместо
// 228. Схема существует ради того, чтобы размножение стало видимым: сверху сетка
// три на три, снизу два свёрнутых источника по одной строке.
function buildDerivedFoldThenJoin() {
  const S = "derived-fold-then-join";

  const cells = [];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      cells.push(`<rect class="dupcell" x="${346 + j * 26}" y="${84 + i * 18}" width="20" height="14" rx="3"/>`);
    }
  }

  return svgWrap("0 0 700 408", S, "Сначала свернуть, потом соединить", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .srcbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .badbox { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .okbox { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .foldbox { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .joinbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .dupcell { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">У молока три строки остатка и три партии. JOIN их перемножает — и каждая сумма считается трижды</text>

<text class="cap t-bad" x="26" y="66" font-size="11" font-weight="600">в лоб: два JOIN, потом GROUP BY</text>
<rect class="srcbox" x="26" y="74" width="120" height="78" rx="9"/>
<text class="mono" x="86" y="96" font-size="11" font-weight="700" text-anchor="middle">dbo.stock</text>
<text class="cap" x="86" y="114" font-size="10" text-anchor="middle">три строки молока</text>
<text class="mono cap" x="86" y="134" font-size="9.5" text-anchor="middle">48 · 60 · 120</text>
<text class="mono" x="158" y="118" font-size="14" text-anchor="middle">×</text>
<rect class="srcbox" x="170" y="74" width="120" height="78" rx="9"/>
<text class="mono" x="230" y="96" font-size="11" font-weight="700" text-anchor="middle">dbo.lot</text>
<text class="cap" x="230" y="114" font-size="10" text-anchor="middle">три партии</text>
<text class="mono cap" x="230" y="134" font-size="9" text-anchor="middle">L0001 L0002 L0013</text>
<line class="flow" x1="296" y1="113" x2="322" y2="113" marker-end="url(#${S}-arrow)"/>
<rect class="srcbox" x="330" y="74" width="130" height="78" rx="9"/>
${cells.join("\n")}
<text class="cap t-bad" x="395" y="146" font-size="10" text-anchor="middle">девять строк после JOIN</text>
<line class="flow" x1="466" y1="113" x2="492" y2="113" marker-end="url(#${S}-arrow)"/>
<rect class="badbox" x="500" y="74" width="174" height="78" rx="9"/>
<text class="mono t-bad" x="587" y="100" font-size="12.5" font-weight="700" text-anchor="middle">SUM(qty) = 684.000</text>
<text class="cap" x="587" y="120" font-size="10" text-anchor="middle">на складе его 228:</text>
<text class="cap" x="587" y="136" font-size="10" text-anchor="middle">каждая сумма сложена трижды</text>
<text class="cap" x="26" y="172" font-size="10.5">SUM дублей не выкидывает и выкидывать не должен — он честно сложил все девять строк</text>

<line class="split" x1="26" y1="184" x2="674" y2="184"/>
<text class="cap t-accent" x="26" y="206" font-size="11" font-weight="600">правильно: свернуть каждую таблицу по отдельности, и только потом соединять</text>

<rect class="foldbox" x="26" y="218" width="190" height="56" rx="9"/>
<text class="mono" x="121" y="240" font-size="10.5" text-anchor="middle">SUM(qty) GROUP BY skuid</text>
<text class="cap" x="121" y="260" font-size="10" text-anchor="middle">одна строка на товар: 228.000</text>
<rect class="foldbox" x="26" y="284" width="190" height="56" rx="9"/>
<text class="mono" x="121" y="306" font-size="10.5" text-anchor="middle">COUNT(*) GROUP BY skuid</text>
<text class="cap" x="121" y="326" font-size="10" text-anchor="middle">одна строка на товар: 3</text>
<line class="flow" x1="220" y1="246" x2="248" y2="262" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="220" y1="312" x2="248" y2="296" marker-end="url(#${S}-arrow)"/>

<rect class="joinbox" x="256" y="246" width="140" height="66" rx="9"/>
<text class="mono" x="326" y="270" font-size="11" font-weight="700" text-anchor="middle">JOIN</text>
<text class="cap" x="326" y="288" font-size="10" text-anchor="middle">одна строка с одной —</text>
<text class="cap" x="326" y="302" font-size="10" text-anchor="middle">размножать нечего</text>
<line class="flow" x1="402" y1="279" x2="428" y2="279" marker-end="url(#${S}-arrow)"/>
<rect class="okbox" x="436" y="256" width="238" height="46" rx="9"/>
<text class="mono t-ok" x="555" y="277" font-size="12" font-weight="700" text-anchor="middle">MILK-1L | 228.000 | 3</text>
<text class="cap" x="555" y="293" font-size="10" text-anchor="middle">столько, сколько лежит на самом деле</text>

<line x1="26" y1="356" x2="674" y2="356" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="376" font-size="11">Считаешь итоги сразу по двум таблицам-спутникам — сворачивай каждую отдельно, и только потом JOIN.</text>
<text class="cap" x="26" y="394" font-size="11">COUNT(DISTINCT …) в плоском варианте уцелел случайно: DISTINCT выкинул дубли, а SUM их не выкидывает.</text>
`);
}

/* ---------------------------------------------------------------- d5.07 */

// Одна и та же мысль из трёх шагов в двух записях: слева вложенные скобки,
// которые читаются изнутри наружу, справа цепочка WITH, которая читается
// сверху вниз. Схема существует ради второй половины: следующий шаг называет
// предыдущий по имени, и порядок объявления совпадает с порядком мысли.
function buildCteChain() {
  const S = "cte-chain";
  const steps = [
    ["WITH lines AS ( … )", "берём строки заказов"],
    ["pct_by_order AS ( … FROM lines )", "считаем процент по заказу"],
    ["SELECT … FROM pct_by_order", "показываем недобранные"],
  ];

  const right = steps.map(([code, what], i) => {
    const y = 82 + i * 68;
    const arrow = i === 2 ? "" :
      `<line class="flow" x1="523" y1="${y + 54}" x2="523" y2="${y + 66}" marker-end="url(#${S}-arrow)"/>`;
    return `<rect class="${i === 2 ? "stepbox" : "stephot"}" x="372" y="${y}" width="302" height="54" rx="9"/>
<text class="stepnum" x="386" y="${y + 32}" font-size="13" font-weight="700">${i + 1}</text>
<text class="mono" x="404" y="${y + 24}" font-size="10.5">${code}</text>
<text class="cap" x="404" y="${y + 42}" font-size="10">${what}</text>
${arrow}`;
  }).join("\n");

  return svgWrap("0 0 700 396", S, "Матрёшка против цепочки шагов", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .stepnum { fill: var(--accent); font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .nest { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .nest2 { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .stepbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .stephot { fill: var(--paper); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .leanwire { fill: none; stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Одна и та же мысль из трёх шагов. Слева она записана задом наперёд, справа — по порядку</text>
<line class="split" x1="352" y1="48" x2="352" y2="318"/>

<text class="cap" x="26" y="66" font-size="11" font-weight="600">матрёшка: читается изнутри наружу</text>
<rect class="nest" x="26" y="78" width="310" height="176" rx="10"/>
<text class="mono" x="40" y="100" font-size="10.5">) AS c  WHERE c.pct &lt; 100</text>
<text class="stepnum" x="316" y="100" font-size="13" font-weight="700">3</text>
<rect class="nest2" x="46" y="112" width="270" height="122" rx="9"/>
<text class="mono" x="60" y="134" font-size="10.5">) AS b  GROUP BY b.orderkey</text>
<text class="stepnum" x="296" y="134" font-size="13" font-weight="700">2</text>
<rect class="nest" x="66" y="146" width="230" height="70" rx="8"/>
<text class="mono" x="80" y="170" font-size="10.5">SELECT a.orderkey …</text>
<text class="mono cap" x="80" y="190" font-size="10.5">FROM dbo.orderdetail</text>
<text class="stepnum" x="276" y="170" font-size="13" font-weight="700">1</text>
<text class="cap" x="26" y="292" font-size="10.5">глаз проваливается до самой внутренней скобки — и только</text>
<text class="cap" x="26" y="308" font-size="10.5">оттуда начинает читать, снизу вверх и изнутри наружу</text>

<text class="cap" x="372" y="66" font-size="11" font-weight="600">WITH: читается сверху вниз, как текст</text>
${right}
<path class="leanwire" d="M366,109 C346,109 346,166 366,166" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap t-accent" x="372" y="292" font-size="10.5">второй шаг назвал первый по имени: там, где стоит</text>
<text class="cap t-accent" x="372" y="308" font-size="10.5">lines, мог бы стоять любой обычный источник строк</text>

<line x1="26" y1="326" x2="674" y2="326" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="346" font-size="11">CTE — это подзапрос, которому дали имя. Слово WITH пишется один раз, шаги идут через запятую.</text>
<text class="cap" x="26" y="364" font-size="11">Каждый следующий шаг видит все объявленные до него. Ссылки вперёд запрещены — кроме рекурсии.</text>
<text class="cap" x="26" y="382" font-size="11">Имя живёт ровно один оператор: точка с запятой закрыла запрос — и никакого имени больше нет.</text>
`);
}

// Что делает с CTE оптимизатор: слева встраивание, где условие уезжает внутрь
// агрегации, справа материализация, где шаг считается целиком в буфер, а фильтр
// остаётся снаружи. Схема существует ради того, чтобы разница была видна в плане,
// и ради нижней таблички — у трёх движков тут три разных поведения по умолчанию.
function buildCteInlineVsMaterialize() {
  const S = "cte-inline-vs-materialize";

  const node = (x, y, w, h, cls, lines) => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="7"/>
${lines.map((ln, i) => `<text class="mono${ln[1] ? " " + ln[1] : ""}" x="${x + w / 2}" y="${y + (h === 46 ? 20 : 19) + i * 17}" font-size="10" text-anchor="middle">${ln[0]}</text>`).join("\n")}`;

  const arrow = (x, y1, y2) => `<line class="flow" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" marker-end="url(#${S}-arrow)"/>`;

  const who = [
    ["SQL Server", "всегда встраивает, как макрос: упомянул шаг дважды — он посчитается дважды"],
    ["PostgreSQL до 12", "всегда материализует: CTE был барьером оптимизации, условия внутрь не шли"],
    ["PostgreSQL 12 и новее", "одна ссылка и нет рекурсии — встраивает; ссылок несколько — материализует"],
  ].map(([name, what], i) => {
    const y = 322 + i * 20;
    return `<text class="cap t-accent" x="26" y="${y}" font-size="10.5" font-weight="600">${name}</text>
<text class="cap" x="196" y="${y}" font-size="10.5">${what}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 434", S, "Встраивание против материализации", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .plan { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .planhot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .buf { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Одно и то же WITH, два разных поведения оптимизатора — и разница видна прямо в плане</text>
<line class="split" x1="350" y1="46" x2="350" y2="296"/>

<text class="mono t-accent" x="26" y="66" font-size="11.5" font-weight="700">встраивание</text>
<text class="cap" x="26" y="84" font-size="10.5">шаг растворяется в запросе, узла CTE в плане нет</text>
${node(66, 96, 220, 28, "plan", [["Seq Scan on stock", ""]])}
${arrow(176, 126, 140)}
${node(66, 144, 220, 46, "planhot", [["HashAggregate", ""], ["Filter: sum(…) &lt; 50", "t-accent"]])}
${arrow(176, 192, 206)}
${node(66, 210, 220, 28, "plan", [["результат", ""]])}
<text class="cap t-accent" x="26" y="262" font-size="10.5">условие уехало внутрь агрегации и отсекло строки</text>
<text class="cap" x="26" y="278" font-size="10.5">там же, где они рождаются, — это дешевле всего</text>

<text class="mono t-accent" x="372" y="66" font-size="11.5" font-weight="700">материализация</text>
<text class="cap" x="372" y="84" font-size="10.5">шаг считается целиком и складывается в буфер</text>
${node(412, 96, 220, 28, "plan", [["Seq Scan on stock", ""]])}
${arrow(522, 126, 140)}
${node(412, 144, 220, 28, "plan", [["HashAggregate", ""]])}
${arrow(522, 174, 188)}
${node(412, 192, 220, 28, "buf", [["CTE free_stock — буфер", "t-gold"]])}
${arrow(522, 222, 236)}
${node(412, 240, 220, 28, "plan", [["CTE Scan  Filter: … &lt; 50", ""]])}
<text class="cap t-gold" x="372" y="290" font-size="10.5">фильтр остался снаружи: внутрь буфера он не провалился</text>

<line class="split" x1="26" y1="304" x2="674" y2="304"/>
${who}
<text class="cap" x="26" y="384" font-size="10.5">переключатели вручную:</text>
<text class="mono t-accent" x="196" y="384" font-size="10.5">AS MATERIALIZED</text>
<text class="cap" x="304" y="384" font-size="10.5">— считай отдельно;</text>
<text class="mono t-accent" x="424" y="384" font-size="10.5">AS NOT MATERIALIZED</text>
<text class="cap" x="562" y="384" font-size="10.5">— встраивай</text>

<line x1="26" y1="398" x2="674" y2="398" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="420" font-size="11">Совет с чужого форума про CTE читай, глядя на подпись автора: у движков тут разные умолчания.</text>
`);
}

/* ---------------------------------------------------------------- d5.08 */

// Три части рекурсивного CTE слева и то, как движок их крутит, справа. Схема
// существует ради двух правил, на которых спотыкаются: под именем CTE лежат
// только строки предыдущего прохода, а останов наступает не по уровню, а когда
// очередной проход вернул ноль строк.
function buildRecCteLoop() {
  const S = "rec-cte-loop";
  // подпись прохода, что он нашёл, тон
  const passes = [
    ["якорь", ["Зона COLD"], "hot"],
    ["проход 1", ["Ряд C-01"], "hot"],
    ["проход 2", ["C-01-01", "C-01-02"], "hot"],
    ["проход 3", ["ноль строк — стоп"], "stop"],
  ];

  const right = passes.map(([name, found, tone], i) => {
    const y = 76 + i * 46;
    const chips = found.map((v, j) => {
      const w = tone === "stop" ? 160 : found.length === 2 ? 106 : 140;
      const x = 456 + j * (w + 6);
      return `<rect class="${tone === "stop" ? "chip-stop" : "chip-hot"}" x="${x}" y="${y}" width="${w}" height="26" rx="7"/>
<text class="mono${tone === "stop" ? " t-bad" : ""}" x="${x + w / 2}" y="${y + 17}" font-size="10" text-anchor="middle">${v}</text>`;
    }).join("\n");
    const arrow = i === 3 ? "" :
      `<line class="flow" x1="410" y1="${y + 26}" x2="410" y2="${y + 44}" marker-end="url(#${S}-arrow)"/>`;
    return `<text class="mono t-accent" x="372" y="${y + 17}" font-size="10.5" font-weight="700">${name}</text>
${chips}
${arrow}`;
  }).join("\n");

  return svgWrap("0 0 700 362", S, "Как крутится рекурсивный CTE", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .part { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .parthot { fill: var(--paper); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .chip-hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .chip-stop { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 4 3; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .selfwire { fill: none; stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Рекурсивная часть делает ровно один шаг вглубь. Многоуровневость даёт не она, а цикл вокруг неё</text>
<line class="split" x1="352" y1="46" x2="352" y2="280"/>

<text class="cap" x="26" y="58" font-size="10.5">якорная часть — выполняется ровно один раз</text>
<rect class="part" x="26" y="64" width="310" height="52" rx="9"/>
<text class="mono" x="40" y="86" font-size="10.5">SELECT id, name FROM node</text>
<text class="mono" x="40" y="104" font-size="10.5">WHERE name = 'Зона COLD'</text>
<text class="mono t-accent" x="181" y="136" font-size="11.5" font-weight="700" text-anchor="middle">UNION ALL</text>
<text class="cap" x="26" y="152" font-size="10.5">рекурсивная часть — один шаг вглубь, к прямым детям</text>
<rect class="parthot" x="26" y="158" width="310" height="70" rx="9"/>
<text class="mono" x="40" y="180" font-size="10.5">SELECT c.id, c.name</text>
<text class="mono" x="40" y="198" font-size="10.5">FROM node AS c</text>
<text class="mono" x="40" y="216" font-size="10.5">JOIN <tspan class="t-accent" font-weight="700">inside</tspan> AS i ON c.parent = i.id</text>
<path class="selfwire" d="M22,214 C6,214 6,168 22,168" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap t-accent" x="26" y="252" font-size="10.5">в FROM стоит имя того самого CTE, внутри которого</text>
<text class="cap t-accent" x="26" y="268" font-size="10.5">мы сейчас находимся: CTE ссылается сам на себя</text>

<text class="cap" x="372" y="58" font-size="10.5">как это крутится</text>
${right}
<text class="cap" x="372" y="278" font-size="10.5">движок не считает уровни: он смотрит одно —</text>
<text class="cap" x="372" y="294" font-size="10.5">вернул ли очередной проход хотя бы одну строку</text>

<line x1="26" y1="310" x2="674" y2="310" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="330" font-size="11">Под именем CTE рекурсивная часть видит не всё накопленное дерево, а только строки прошлого прохода.</text>
<text class="cap" x="26" y="348" font-size="11">Наружу отдаётся всё, что накопилось за все проходы. Слово RECURSIVE пишется один раз, сразу после WITH.</text>
`);
}

// Дерево склада по уровням: каждая полоса — это выхлоп одного прохода, а колонка
// lvl оказывается протоколом работы движка. Схема существует ради приёма-накопителя:
// в якоре начальное значение, в рекурсивной части выражение от родителя, — и ради
// последней пустой полосы, из-за которой обход и остановился.
function buildRecSteps() {
  const S = "rec-steps";
  // уровень: подпись прохода, число строк, узлы (имя, центр по x)
  const levels = [
    ["якорь", "одна строка", [["Склад", 438]]],
    ["проход 1", "две строки", [["Зона PICK", 323], ["Зона COLD", 553]]],
    ["проход 2", "три строки", [["Ряд A-01", 247], ["Ряд A-02", 400], ["Ряд C-01", 553]]],
    ["проход 3", "пять строк", [["A-01-01", 196], ["A-01-02", 298], ["A-02-01", 400], ["C-01-01", 502], ["C-01-02", 604]]],
  ];
  // кто чей родитель: индекс уровня, индекс ребёнка, индекс родителя
  const edges = [[1, 0, 0], [1, 1, 0], [2, 0, 0], [2, 1, 0], [2, 2, 1], [3, 0, 0], [3, 1, 0], [3, 2, 1], [3, 3, 2], [3, 4, 2]];

  const rowY = (i) => 76 + i * 70;

  const nodes = levels.map(([pass, cnt, list], i) => {
    const y = rowY(i);
    const chips = list.map(([name, cx]) => {
      const w = 92;
      return `<rect class="node" x="${cx - w / 2}" y="${y}" width="${w}" height="26" rx="7"/>
<text class="mono" x="${cx}" y="${y + 17}" font-size="9.5" text-anchor="middle">${name}</text>`;
    }).join("\n");
    return `<text class="mono t-accent" x="26" y="${y + 12}" font-size="10.5" font-weight="700">${pass}</text>
<text class="cap" x="26" y="${y + 28}" font-size="10">lvl = ${i} · ${cnt}</text>
${chips}`;
  }).join("\n");

  const wires = edges.map(([lv, ci, pi]) => {
    const c = levels[lv][2][ci][1];
    const p = levels[lv - 1][2][pi][1];
    const y1 = rowY(lv - 1) + 26;
    const y2 = rowY(lv);
    return `<path class="edge" d="M${p},${y1} C${p},${y1 + 22} ${c},${y2 - 22} ${c},${y2}"/>`;
  }).join("\n");

  return svgWrap("0 0 700 434", S, "Колонка уровня — это протокол работы движка", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .node { fill: var(--paper); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .emptyrow { fill: none; stroke: var(--gold); stroke-width: 1.3; stroke-dasharray: 5 4; }
.dg-${S} .edge { fill: none; stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Каждая полоса — это выхлоп одного прохода, а колонка lvl оказывается протоколом работы движка</text>
${wires}
${nodes}

<text class="mono t-gold" x="26" y="348" font-size="10.5" font-weight="700">проход 4</text>
<text class="cap" x="26" y="364" font-size="10">ноль строк</text>
<rect class="emptyrow" x="170" y="336" width="504" height="30" rx="8"/>
<text class="cap t-gold" x="422" y="355" font-size="10.5" text-anchor="middle">у ячеек детей нет — проход вернул пусто, обход остановился, и уровня 4 в таблице просто нет</text>

<line x1="26" y1="382" x2="674" y2="382" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="402" font-size="11">Колонку lvl никто не заводил в данных: в якоре стоит 0, в рекурсивной части — lvl родителя плюс один.</text>
<text class="cap" x="26" y="420" font-size="11">Так считается всё, что копится вдоль пути обхода: уровень, путь от корня, сумма или счётчик по дороге.</text>
`);
}

// Кольцо в данных и три защиты от него. Схема существует ради того, чтобы
// стало видно, почему закон остановки тут не срабатывает: дети находятся на
// каждом проходе, поэтому ноль строк не наступает никогда, — и чтобы отделить
// предохранитель (лимит глубины) от настоящего лечения (проверка пути).
function buildRecCycle() {
  const S = "rec-cycle";
  // уровень, найденное, повтор ли
  const trace = [
    ["lvl 0", ["Ряд C-01"], false],
    ["lvl 1", ["C-01-01", "C-01-02"], false],
    ["lvl 2", ["Ряд C-01"], true],
    ["lvl 3", ["C-01-01", "C-01-02"], true],
  ];

  const rows = trace.map(([lv, items, dup], i) => {
    const y = 70 + i * 30;
    const chips = items.map((v, j) => {
      const w = 112;
      const x = 392 + j * (w + 6);
      return `<rect class="${dup ? "chip-dup" : "chipbox"}" x="${x}" y="${y}" width="${w}" height="24" rx="6"/>
<text class="mono${dup ? " t-gold" : ""}" x="${x + w / 2}" y="${y + 16}" font-size="9.5" text-anchor="middle">${v}</text>`;
    }).join("\n");
    return `<text class="mono cap" x="330" y="${y + 16}" font-size="10">${lv}</text>
${chips}`;
  }).join("\n");

  const cards = [
    {
      x: 26,
      head: "лимит глубины",
      code: ["WHERE t.lvl &lt; 3"],
      tone: "gold",
      note: ["предохранитель, а не лечение:", "запрос точно кончится, но", "правильность им не обещана"],
    },
    {
      x: 248,
      head: "путь и проверка",
      code: ["WHERE t.path NOT LIKE", "'%/' || c.name || '/%'"],
      tone: "ok",
      note: ["не ходим туда, где уже были:", "проход не даёт строк, и рекурсия", "встаёт сама, без всяких лимитов"],
    },
    {
      x: 470,
      head: "лимит движка",
      code: ["OPTION (MAXRECURSION n)"],
      tone: "bad",
      note: ["в SQL Server сто проходов по", "умолчанию. В PostgreSQL лимита", "нет вообще: защиту кладёт автор"],
    },
  ].map((c) => {
    const note = c.note.map((ln, i) =>
      `<text class="cap" x="${c.x + 14}" y="${322 + i * 14}" font-size="9.5">${ln}</text>`).join("\n");
    const code = c.code.map((ln, i) =>
      `<text class="mono t-accent" x="${c.x + 14}" y="${288 + i * 15}" font-size="10">${ln}</text>`).join("\n");
    return `<rect class="card card-${c.tone}" x="${c.x}" y="${244}" width="202" height="116" rx="10"/>
<text class="t-${c.tone}" x="${c.x + 14}" y="${266}" font-size="11" font-weight="700">${c.head}</text>
${code}
${note}`;
  }).join("\n");

  return svgWrap("0 0 700 410", S, "Кольцо в данных и три защиты от него", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .node { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .chipbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .chip-dup { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .loop { fill: none; stroke: var(--bad); stroke-width: 1.5; }
.dg-${S} .card { fill: var(--paper); stroke-width: 1.4; }
.dg-${S} .card-gold { stroke: var(--gold); }
.dg-${S} .card-ok { stroke: var(--ok); }
.dg-${S} .card-bad { stroke: var(--bad); }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Одна кривая запись в parent — и дерево перестало быть деревом: получилось кольцо</text>

<text class="cap" x="26" y="58" font-size="10.5">кольцо в данных</text>
<rect class="node" x="46" y="66" width="130" height="28" rx="8"/>
<text class="mono" x="111" y="85" font-size="10.5" text-anchor="middle">Ряд C-01</text>
<line class="loop" x1="111" y1="96" x2="111" y2="116" marker-end="url(#${S}-arrow)"/>
<rect class="node" x="46" y="120" width="130" height="28" rx="8"/>
<text class="mono" x="111" y="139" font-size="10.5" text-anchor="middle">C-01-01</text>
<path class="loop" d="M176,134 C216,134 216,80 180,80" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="228" y="94" font-size="9.5">внутри ряда —</text>
<text class="cap" x="228" y="108" font-size="9.5">ячейка, а внутри</text>
<text class="cap" x="228" y="122" font-size="9.5">ячейки — снова</text>
<text class="cap" x="228" y="136" font-size="9.5">тот же ряд</text>
<text class="cap t-bad" x="26" y="180" font-size="10.5">дети находятся на каждом проходе, поэтому</text>
<text class="cap t-bad" x="26" y="196" font-size="10.5">ноль строк не наступит уже никогда</text>

<text class="cap" x="330" y="58" font-size="10.5">что при этом накапливается</text>
${rows}
<text class="cap t-gold" x="330" y="212" font-size="10.5">узлы повторяются через уровень — кольцо видно глазами</text>

<line class="split" x1="26" y1="228" x2="674" y2="228"/>
${cards}

<line x1="26" y1="376" x2="674" y2="376" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="396" font-size="11">Зациклившийся запрос в PostgreSQL крутится, пока не съест память или пока его не снимет statement_timeout.</text>
`);
}

/* ---------------------------------------------------------------- реестр */

export const REGISTRY = {
  "scalar-slot": {
    id: "scalar-slot",
    title: "Скалярный подзапрос стоит на месте одного значения",
    caption: "Сервер выполняет скобки отдельным запросом, тот отдаёт таблицу 1×1, и это единственное значение встаёт на место скобок в каждой строке. Строки не пропали, потому что агрегат остался внутри своего запроса.",
    anchor: "Что здесь произошло",
    svg: buildScalarSlot(),
  },
  "scalar-arity": {
    id: "scalar-arity",
    title: "Одна строка и одна колонка: два способа это нарушить",
    caption: "Лишняя колонка видна прямо в тексте запроса, поэтому сервер отказывается его запускать. Лишняя строка из текста не видна вовсе — она зависит от данных, и потому ждёт своего часа месяцами.",
    anchor: "Одна строка и одна колонка: два способа это нарушить",
    svg: buildScalarArity(),
  },
  "in-podzapros": {
    id: "in-podzapros",
    title: "Список для IN посчитан подзапросом",
    caption: "Внутренний запрос собирает набор из таблицы, а внешний спрашивает у него про каждую свою строку: «я тут есть?». Молоко попало в набор дважды, но ответ от этого не меняется — IN проверяет принадлежность, а не считает совпадения.",
    anchor: "Что здесь произошло",
    svg: buildInPodzapros(),
  },
  "any-all-os": {
    id: "any-all-os",
    title: "ANY тянет к минимуму, ALL — к максимуму",
    caption: "Каждый квантор — это цепочка сравнений: у ANY она сшита словом ИЛИ, у ALL — словом И. Поэтому «хотя бы одному» упирается в минимум набора, а «всем сразу» — в максимум, и семь строк превращаются в две.",
    anchor: "ANY и ALL: «хотя бы одного» против «всех»",
    svg: buildAnyAllOs(),
  },
  "exists-loop": {
    id: "exists-loop",
    title: "EXISTS перебирает внешние строки по одной",
    caption: "Внутри скобок стоит ссылка на внешний алиас, поэтому подзапрос пересчитывается для каждой строки справочника. Наружу из него выходит не значение и не число найденных строк, а только «нашлась» или «не нашлась».",
    anchor: "Что здесь произошло",
    svg: buildExistsLoop(),
  },
  "not-in-hole": {
    id: "not-in-hole",
    title: "NOT IN спрашивает про значения, NOT EXISTS — про строки",
    caption: "Один и тот же список с шестью заглушками. У NOT IN цепочка И спотыкается о сравнение с NULL и отдаёт «не знаю», и строка выпадает молча. NOT EXISTS про значения не спрашивает вовсе, поэтому отвечает твёрдо.",
    anchor: "EXISTS отвечает только «да» или «нет» — и в этом вся его сила",
    svg: buildNotInHole(),
  },
  "three-antis": {
    id: "three-antis",
    title: "Три способа спросить «а чего нет»",
    caption: "Механизмы разные, ответ на честных данных один и тот же. Разница в минах: антисоединению нужна заведомо NOT NULL колонка, NOT IN ломается о NULL в списке, а у NOT EXISTS своей ловушки нет.",
    anchor: "Три способа спросить «а чего нет»",
    svg: buildThreeAntis(),
  },
  "not-in-unfold": {
    id: "not-in-unfold",
    title: "Как NOT IN разворачивается в цепочку И",
    caption: "Три честных сравнения дают TRUE, четвёртое упирается в пустую клетку и даёт UNKNOWN — и связка И после этого TRUE уже не отдаст. Ни ошибки, ни предупреждения: отчёт просто становится пустым.",
    anchor: "Что здесь произошло",
    svg: buildNotInUnfold(),
  },
  "in-vs-not-in": {
    id: "in-vs-not-in",
    title: "Ломается ровно одна клетка из четырёх",
    caption: "Тот же NULL в том же наборе. У IN цепочка сшита словом ИЛИ, и одного TRUE ей хватает; у NOT IN — словом И, и одного UNKNOWN хватает, чтобы всё испортить. Рядом всегда есть похожий работающий код — потому баг и не находят.",
    anchor: "У IN такой беды нет, и поэтому баг не находят",
    svg: buildInVsNotIn(),
  },
  "correlated-row-loop": {
    id: "correlated-row-loop",
    title: "Коррелированный подзапрос считается заново для каждой строки",
    caption: "Одно и то же тело в скобках на каждой внешней строке превращается в свой запрос и отдаёт своё число. Убери ссылку наружу — и та же конструкция станет константой, одинаковой для всех тринадцати строк.",
    anchor: "Что здесь произошло",
    svg: buildCorrelatedRowLoop(),
  },
  "correlated-scope": {
    id: "correlated-scope",
    title: "Изнутри наружу можно, снаружи внутрь нельзя",
    caption: "Подзапрос знает и свои таблицы, и все таблицы внешнего запроса. Обратно не видно ничего: ссылка на внутренний алиас снаружи даёт 42P01 — и на этом же держится простой способ отличить коррелированный подзапрос от обычного.",
    anchor: "Кто кого видит: изнутри наружу можно, снаружи внутрь нельзя",
    svg: buildCorrelatedScope(),
  },
  "derived-two-steps": {
    id: "derived-two-steps",
    title: "Подзапрос в FROM — это обычная таблица",
    caption: "Внутренний SELECT свернул тринадцать строк остатка до семи, и дальше внешний запрос работает с ними как с настоящей таблицей: джойнит, фильтрует, сортирует. Агрегат остался внутри скобок и вышел наружу уже числом.",
    anchor: "Что здесь произошло",
    svg: buildDerivedTwoSteps(),
  },
  "derived-window": {
    id: "derived-window",
    title: "Наружу выходит только то, что попало в SELECT подзапроса",
    caption: "Колонок внутри скобок много, а наружу проходят ровно те, что подзапрос вынес в свой список. Остальных снаружи не существует — и сервер говорит именно так, а не «нет доступа».",
    anchor: "Наружу видно только то, что подзапрос вынес в свой SELECT",
    svg: buildDerivedWindow(),
  },
  "derived-fold-then-join": {
    id: "derived-fold-then-join",
    title: "Сначала свернуть, потом соединить",
    caption: "Три строки остатка на три партии дают девять строк, и SUM честно складывает все девять: 684 вместо 228. Свернёшь каждую таблицу отдельно — соединять будет нечего размножать.",
    anchor: "Первое применение: сначала свернуть, потом соединить",
    svg: buildDerivedFoldThenJoin(),
  },
  "cte-chain": {
    id: "cte-chain",
    title: "Матрёшка против цепочки шагов",
    caption: "Слева три шага записаны вложенными скобками, и читать их приходится изнутри наружу. Справа те же три шага названы по именам и идут по порядку: каждый следующий опирается на предыдущий и пишется там, где стоит имя таблицы.",
    anchor: "Что здесь произошло",
    svg: buildCteChain(),
  },
  "cte-inline-vs-materialize": {
    id: "cte-inline-vs-materialize",
    title: "Встраивание против материализации",
    caption: "При встраивании шаг растворяется в запросе, и условие уезжает внутрь агрегации. При материализации он считается целиком в буфер, а фильтр остаётся снаружи. У SQL Server и у разных версий PostgreSQL умолчания тут разные.",
    anchor: "Что на самом деле делает оптимизатор",
    svg: buildCteInlineVsMaterialize(),
  },
  "rec-cte-loop": {
    id: "rec-cte-loop",
    title: "Как крутится рекурсивный CTE",
    caption: "Якорь отрабатывает один раз, рекурсивная часть делает ровно один шаг вглубь, а многоуровневость даёт цикл вокруг неё. Под именем CTE лежат только строки прошлого прохода, и останов наступает, когда очередной проход вернул пусто.",
    anchor: "Что здесь произошло",
    svg: buildRecCteLoop(),
  },
  "rec-steps": {
    id: "rec-steps",
    title: "Колонка уровня — это протокол работы движка",
    caption: "Каждая полоса дерева — выхлоп одного прохода: одна строка якоря, две на первом проходе, три на втором, пять на третьем. Четвёртый вернул пусто, поэтому уровня 4 в таблице просто нет.",
    anchor: "Сделаем шаги видимыми: колонка уровня",
    svg: buildRecSteps(),
  },
  "rec-cycle": {
    id: "rec-cycle",
    title: "Кольцо в данных и три защиты от него",
    caption: "В кольце дети находятся на каждом проходе, поэтому обычный закон остановки не срабатывает никогда. Лимит глубины — предохранитель, проверка пути — настоящее лечение, а умолчательный потолок есть только у SQL Server.",
    anchor: "Бесконечность и три способа от неё уберечься",
    svg: buildRecCycle(),
  },
};

// Привязка схем к нодам: код ноды -> список id.
export const INDEX = {
  "d5.01": ["scalar-slot", "scalar-arity"],
  "d5.02": ["in-podzapros", "any-all-os"],
  "d5.03": ["exists-loop", "not-in-hole", "three-antis"],
  "d5.04": ["not-in-unfold", "in-vs-not-in"],
  "d5.05": ["correlated-row-loop", "correlated-scope"],
  "d5.06": ["derived-two-steps", "derived-window", "derived-fold-then-join"],
  "d5.07": ["cte-chain", "cte-inline-vs-materialize"],
  "d5.08": ["rec-cte-loop", "rec-steps", "rec-cycle"],
};
