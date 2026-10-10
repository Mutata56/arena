// diagrams-sql-08.js
// Схемы этапа 8: изменение данных.
//
// Оснастка общая (diagrams-sql-kit.js), правила те же: самодостаточный модуль,
// цвета только через CSS-переменные страницы, никакого JS внутри SVG.
// Образец стиля — diagrams-sql-02.js.

import { arrowDefs, checkIcon, crossIcon, svgWrap } from "./diagrams-sql-kit.js";

/* ---------------------------------------------------------------- d8.01 */

// Анатомия INSERT: куда кладём, в какие колонки, что кладём — и порядок,
// в котором движок собирает строку. Схема существует ради одной мысли:
// значения ложатся в колонки ПО ПОЗИЦИИ, а не по совпадению имён, и именно
// отсюда растёт вся история про обязательный список колонок.
function buildInsertParts() {
  const S = "insert-parts";
  // имя колонки, значение из VALUES, ширина ячейки
  const cols = [
    ["skuid", "'OIL-1L'", 92],
    ["descr", "'Масло подсолнечное 1л'", 176],
    ["uom", "'PC'", 56],
    ["weight", "0.920", 72],
    ["shelflife", "540", 84],
  ];
  let x = 116;
  const slots = cols.map(([name, val, w]) => {
    const at = x;
    x += w + 8;
    return { name, val, w, at, mid: at + w / 2 };
  });

  const head = slots.map((s) => `
<rect class="colcell" x="${s.at}" y="112" width="${s.w}" height="26" rx="7"/>
<text class="mono" x="${s.mid}" y="130" font-size="11" text-anchor="middle">${s.name}</text>`).join("");

  const ties = slots.map((s, i) => `
<line class="tie" x1="${s.mid}" y1="138" x2="${s.mid}" y2="160"/>
<circle class="pos" cx="${s.mid}" cy="149" r="8"/>
<text class="posn" x="${s.mid}" y="152.5" font-size="9.5" text-anchor="middle">${i + 1}</text>`).join("");

  const vals = slots.map((s) => `
<rect class="valcell" x="${s.at}" y="160" width="${s.w}" height="26" rx="7"/>
<text class="mono" x="${s.mid}" y="178" font-size="10.5" text-anchor="middle">${s.val}</text>`).join("");

  // Порядок работы движка: до записи строки происходит ещё три вещи.
  const steps = [
    ["1", "подставить DEFAULT", "в неназванные колонки"],
    ["2", "собрать строку", "целиком"],
    ["3", "проверить ограничения:", "NOT NULL, CHECK, ключи"],
    ["4", "записать строку", "и посчитать её"],
  ];
  const chain = steps.map(([n, a, b], i) => {
    const bx = 26 + i * 166;
    const arrow = i === steps.length - 1 ? ""
      : `<line class="flow" x1="${bx + 152}" y1="272" x2="${bx + 162}" y2="272" marker-end="url(#${S}-arrow)"/>`;
    return `
<rect class="stepbox" x="${bx}" y="244" width="150" height="56" rx="9"/>
<text class="posn2" x="${bx + 12}" y="262" font-size="10" font-weight="700">${n}</text>
<text class="cap" x="${bx + 75}" y="272" font-size="10" text-anchor="middle">${a}</text>
<text class="cap" x="${bx + 75}" y="288" font-size="10" text-anchor="middle">${b}</text>
${arrow}`;
  }).join("");

  return svgWrap("0 0 700 372", S, "Три части INSERT и порядок сборки строки", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .into { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .colcell { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .valcell { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .stepbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pos { fill: var(--card); stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .posn { fill: var(--accent); font-family: ui-monospace, Menlo, monospace; font-weight: 700; }
.dg-${S} .posn2 { fill: var(--muted); font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .tie { stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">У команды три части, и каждая отвечает ровно за своё</text>

<text class="cap" x="104" y="87" font-size="10.5" text-anchor="end">куда кладём</text>
<rect class="into" x="116" y="68" width="200" height="30" rx="8"/>
<text class="mono" x="216" y="88" font-size="12" text-anchor="middle">INSERT INTO dbo.sku</text>
<text class="cap" x="330" y="88" font-size="10.5">таблица одна и всегда одна</text>

<text class="cap" x="104" y="129" font-size="10" text-anchor="end">в какие колонки</text>
${head}
<text class="cap" x="104" y="177" font-size="10" text-anchor="end">что кладём</text>
${ties}
${vals}

<text class="cap" x="116" y="208" font-size="11">соответствие идёт по позиции: первое значение — в первую названную колонку, второе — во вторую</text>

<text class="cap" x="26" y="232" font-size="11.5" font-weight="600">Что движок делает с этой командой, по шагам</text>
${chain}

<line x1="26" y1="320" x2="674" y2="320" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="340" font-size="11">Ответ движка — строка вида INSERT 0 1. Единица в конце это число вставленных строк, и читать её стоит каждый раз.</text>
<text class="cap" x="26" y="360" font-size="11">Ждал сорок, увидел тридцать девять — значит, где-то потерялась строка, и узнать об этом лучше сейчас.</text>
`);
}

// Вставка без списка колонок, прогнанная дважды: до миграции и после неё.
// Схема существует ради того, чтобы стало видно, как одно и то же значение
// уезжает в чужую колонку — и что ошибки при этом не будет ни одной.
function buildInsertByPosition() {
  const S = "insert-by-position";
  const W = [110, 190, 70, 150];
  const X0 = 96;
  const at = (i) => X0 + W.slice(0, i).reduce((a, b) => a + b + 10, 0);
  const mid = (i) => at(i) + W[i] / 2;

  // Одна полоса: имена колонок сверху, значения снизу, риски между ними.
  const strip = (y, names, vals, hotIdx) => names.map((n, i) => {
    const hot = i === hotIdx;
    return `
<rect class="${hot ? "colbad" : "colcell"}" x="${at(i)}" y="${y}" width="${W[i]}" height="26" rx="7"/>
<text class="mono ${hot ? "t-bad" : ""}" x="${mid(i)}" y="${y + 18}" font-size="11" text-anchor="middle">${n}</text>
<line class="${hot ? "tiebad" : "tie"}" x1="${mid(i)}" y1="${y + 26}" x2="${mid(i)}" y2="${y + 38}"/>
<rect class="${hot ? "valbad" : "valcell"}" x="${at(i)}" y="${y + 38}" width="${W[i]}" height="26" rx="7"/>
<text class="mono ${hot ? "t-bad" : ""}" x="${mid(i)}" y="${y + 56}" font-size="10" text-anchor="middle">${vals[i]}</text>`;
  }).join("");

  return svgWrap("0 0 700 428", S, "Без списка колонок значения держатся за позицию", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .colcell { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .colbad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.5; }
.dg-${S} .valcell { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .valbad { fill: var(--paper); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .tie { stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .tiebad { stroke: var(--bad); stroke-width: 1.5; }
.dg-${S} .migr { fill: var(--sunk); stroke: var(--muted); stroke-width: 1.2; stroke-dasharray: 5 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Одна и та же вставка без списка колонок — до правки таблицы и после</text>
<text class="mono" x="26" y="52" font-size="11">INSERT INTO dbo.sku_draft VALUES (...);</text>
<text class="cap" x="288" y="52" font-size="10.5">— имён колонок в команде нет, есть только четыре значения подряд</text>

<text class="cap" x="26" y="88" font-size="11" font-weight="600">день, когда таблицу создали</text>
<text class="cap" x="88" y="114" font-size="10" text-anchor="end">колонки</text>
<text class="cap" x="88" y="152" font-size="10" text-anchor="end">значения</text>
${strip(96, ["skuid", "descr", "uom", "note"], ["'OIL-1L'", "'Масло подсолнечное 1л'", "'PC'", "'от поставщика'"], -1)}
${checkIcon(96, 172, 14)}
<text class="cap t-ok" x="118" y="184" font-size="11">«от поставщика» легло в note — ровно туда, куда задумывали</text>

<rect class="migr" x="26" y="198" width="648" height="64" rx="9"/>
<text class="cap" x="42" y="216" font-size="10.5">через полгода таблицу правят миграцией:</text>
<text class="mono" x="42" y="234" font-size="10.5">ALTER TABLE dbo.sku_draft DROP COLUMN note;</text>
<text class="mono" x="42" y="251" font-size="10.5">ALTER TABLE dbo.sku_draft ADD COLUMN barcode varchar(20) NULL;</text>

<text class="cap" x="26" y="286" font-size="11" font-weight="600">та же команда после миграции</text>
<text class="cap" x="88" y="312" font-size="10" text-anchor="end">колонки</text>
<text class="cap" x="88" y="350" font-size="10" text-anchor="end">значения</text>
${strip(294, ["skuid", "descr", "uom", "barcode"], ["'RICE-900'", "'Рис круглозёрный 900г'", "'PC'", "'от поставщика'"], 3)}
${crossIcon(96, 370, 14)}
<text class="cap t-bad" x="118" y="382" font-size="11">«от поставщика» легло в штрихкод: note выбросили, и четвёртое место заняла другая колонка</text>

<line x1="26" y1="396" x2="674" y2="396" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="414" font-size="11">Ошибки не было ни одной: движок разложил четыре значения по четырём колонкам в их сегодняшнем порядке.</text>
`);
}

// Развилка приёмки: строка из VALUES встречает справочник. Схема существует
// ради того, чтобы развести четыре исхода одной команды — вставку, падение,
// пропуск и обновление — и показать, что исход выбирает приписка, а не движок.
function buildInsertUpsertFork() {
  const S = "insert-upsert-fork";

  // Три дорожки для случая «ключ уже есть»: что написано и что из этого выйдет.
  const lanes = [
    { w: ["приписки нет"], k: "bad",
      out: ["duplicate key value", "violates unique constraint", "команда падает целиком"] },
    { w: ["ON CONFLICT", "DO NOTHING"], k: "off",
      out: ["строку пропустили,", "лежащая не изменилась", "ни на букву"] },
    { w: ["ON CONFLICT (skuid)", "DO UPDATE SET ..."], k: "hot",
      out: ["названные колонки", "обновлены значениями", "из EXCLUDED"] },
  ];
  const laneBody = lanes.map((l, i) => {
    const bx = 26 + i * 219;
    const cx = bx + 105;
    const wtxt = l.w.map((t, j) =>
      `<text class="${l.w.length === 1 ? "cap" : "mono"}" x="${cx}" y="${l.w.length === 1 ? 264 : 258 + j * 15}" font-size="10.5" ${l.w.length === 1 ? 'font-weight="600"' : ""} text-anchor="middle">${t}</text>`).join("\n");
    const otxt = l.out.map((t, j) =>
      `<text class="cap ${l.k === "bad" ? "t-bad" : l.k === "hot" ? "t-accent" : ""}" x="${cx}" y="${310 + j * 15}" font-size="10" text-anchor="middle">${t}</text>`).join("\n");
    const icon = l.k === "bad" ? crossIcon(cx - 7, 285, 14)
      : l.k === "hot" ? checkIcon(cx - 7, 285, 14)
      : `<line class="dash" x1="${cx - 8}" y1="292" x2="${cx + 8}" y2="292"/>`;
    return `
<rect class="lane-${l.k}" x="${bx}" y="240" width="210" height="118" rx="10"/>
${wtxt}
${icon}
${otxt}`;
  }).join("");

  return svgWrap("0 0 700 484", S, "Строка уже есть: четыре исхода одной команды", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .srcbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .askbox { fill: var(--sunk); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .okbox { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .lane-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .lane-off { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .lane-hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .excl { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .exclhot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .hotflow { stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .dash { stroke: var(--muted); stroke-width: 1.4; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Строка из VALUES встречает справочник — и дальше всё решает то, что дописано после команды</text>

<rect class="srcbox" x="26" y="58" width="176" height="52" rx="9"/>
<text class="cap" x="114" y="76" font-size="10" text-anchor="middle">строка из накладной</text>
<text class="mono" x="114" y="96" font-size="11" text-anchor="middle">('MILK-1L', 1.035, 12)</text>
<line class="flow" x1="206" y1="84" x2="238" y2="84" marker-end="url(#${S}-arrow)"/>

<rect class="askbox" x="242" y="56" width="180" height="56" rx="10"/>
<text class="cap" x="332" y="80" font-size="10.5" text-anchor="middle">есть ли в dbo.sku строка</text>
<text class="cap" x="332" y="96" font-size="10.5" text-anchor="middle">с таким skuid?</text>

<path class="flow" d="M424,74 C452,74 452,66 480,66" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="452" y="58" font-size="10" text-anchor="middle">нет</text>
<rect class="okbox" x="484" y="48" width="190" height="40" rx="9"/>
<text class="cap t-ok" x="579" y="64" font-size="10.5" text-anchor="middle">строка просто вставляется</text>
<text class="cap" x="579" y="79" font-size="10" text-anchor="middle">конфликтовать не с чем</text>

<path class="flow" d="M332,116 L332,150" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="344" y="140" font-size="10">да</text>

<text class="cap" x="26" y="172" font-size="11.5" font-weight="600">Ключ уже есть — исход выбирает приписка</text>
<text class="cap" x="26" y="192" font-size="10.5">одна и та же строка накладной, три разных конца</text>
<text class="cap" x="26" y="224" font-size="10">сверху — что дописано в команде, снизу — что из этого вышло</text>
${laneBody}

<line class="split" x1="26" y1="378" x2="674" y2="378"/>
<text class="cap" x="26" y="398" font-size="11" font-weight="600">Два имени внутри DO UPDATE — старое значение и предложенное</text>
<rect class="excl" x="26" y="410" width="176" height="40" rx="9"/>
<text class="mono" x="114" y="427" font-size="10.5" text-anchor="middle">dbo.stock.qty = 48</text>
<text class="cap" x="114" y="442" font-size="10" text-anchor="middle">то, что уже лежит</text>
<text class="mono" x="219" y="435" font-size="14" text-anchor="middle">+</text>
<rect class="exclhot" x="236" y="410" width="176" height="40" rx="9"/>
<text class="mono t-accent" x="324" y="427" font-size="10.5" text-anchor="middle">EXCLUDED.qty = 24</text>
<text class="cap" x="324" y="442" font-size="10" text-anchor="middle">то, что предлагал VALUES</text>
<line class="hotflow" x1="418" y1="430" x2="450" y2="430" marker-end="url(#${S}-arrow-accent)"/>
<rect class="okbox" x="454" y="410" width="220" height="40" rx="9"/>
<text class="mono t-ok" x="564" y="427" font-size="11" text-anchor="middle">qty = 72</text>
<text class="cap" x="564" y="442" font-size="10" text-anchor="middle">приход лёг на остаток, а не затёр его</text>

<text class="cap" x="26" y="470" font-size="11">EXCLUDED — та самая строка, которую конфликт исключил из вставки. Старое значение доступно под именем таблицы.</text>
`);
}

/* ---------------------------------------------------------------- d8.02 */

// Анатомия UPDATE и главное его свойство: правые части всех присваиваний
// считаются от строки ДО правки и записываются разом. Схема существует ради
// того, чтобы стало видно, почему «qtyallocated = 0» стоит ниже, а из остатка
// всё равно вычлось честное 12, — SET это снимок, а не последовательность шагов.
function buildUpdateParts() {
  const S = "update-parts";

  // Ячейка значения: имя колонки сверху, число внутри.
  const cellVal = (x, y, w, name, val, kind) => `
<rect class="${kind}" x="${x}" y="${y}" width="${w}" height="34" rx="8"/>
<text class="cap" x="${x + w / 2}" y="${y - 6}" font-size="10" text-anchor="middle">${name}</text>
<text class="mono" x="${x + w / 2}" y="${y + 22}" font-size="12.5" text-anchor="middle">${val}</text>`;

  return svgWrap("0 0 700 448", S, "SET считает от старых значений и пишет разом", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-gold" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--gold)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .part { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .parthot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .oldcell { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .newcell { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .expr { fill: var(--card); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .snap { fill: none; stroke: var(--gold); stroke-width: 1.4; stroke-dasharray: 5 4; }
.dg-${S} .flow { fill: none; stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .snapline { fill: none; stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .hotflow { fill: none; stroke: var(--accent); stroke-width: 1.5; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">У команды три части, и каждая отвечает ровно за своё</text>

<text class="cap" x="26" y="52" font-size="10">какую таблицу меняем</text>
<text class="cap" x="186" y="52" font-size="10">какие строки меняем</text>
<text class="cap" x="386" y="52" font-size="10">что в этих строках станет другим</text>
<rect class="part" x="26" y="60" width="150" height="34" rx="8"/>
<text class="mono" x="101" y="82" font-size="11" text-anchor="middle">UPDATE dbo.stock</text>
<rect class="part" x="186" y="60" width="190" height="34" rx="8"/>
<text class="mono" x="281" y="82" font-size="11" text-anchor="middle">WHERE lot = 'L0001'</text>
<rect class="parthot" x="386" y="60" width="288" height="34" rx="8"/>
<text class="mono" x="530" y="76" font-size="10.5" text-anchor="middle">SET qty = qty - qtyallocated,</text>
<text class="mono" x="530" y="90" font-size="10.5" text-anchor="middle">    qtyallocated = 0</text>

<line x1="26" y1="112" x2="674" y2="112" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="134" font-size="11.5" font-weight="600">Что происходит с одной отобранной строкой</text>

<rect class="snap" x="26" y="150" width="230" height="88" rx="10"/>
<text class="cap t-gold" x="141" y="170" font-size="10.5" text-anchor="middle">снимок строки ДО правки</text>
${cellVal(46, 194, 88, "qty", "48.000", "oldcell")}
${cellVal(150, 194, 88, "qtyallocated", "12.000", "oldcell")}

<path class="snapline" d="M90,228 C90,268 220,262 268,272" marker-end="url(#${S}-arrow-gold)"/>
<path class="snapline" d="M194,228 C194,258 230,276 268,282" marker-end="url(#${S}-arrow-gold)"/>

<rect class="expr" x="272" y="258" width="196" height="38" rx="9"/>
<text class="mono" x="370" y="282" font-size="12" text-anchor="middle">qty = 48 - 12</text>
<rect class="expr" x="272" y="316" width="196" height="38" rx="9"/>
<text class="mono" x="370" y="340" font-size="12" text-anchor="middle">qtyallocated = 0</text>
<text class="cap" x="370" y="246" font-size="10.5" text-anchor="middle">правые части считаются от снимка</text>

<line class="hotflow" x1="472" y1="277" x2="500" y2="296" marker-end="url(#${S}-arrow-accent)"/>
<line class="hotflow" x1="472" y1="335" x2="500" y2="316" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap t-accent" x="586" y="246" font-size="10.5" text-anchor="middle">записывается разом, одной строкой</text>
${cellVal(504, 288, 80, "qty", "36.000", "newcell")}
${cellVal(596, 288, 78, "qtyallocated", "0.000", "newcell")}
<text class="cap" x="576" y="344" font-size="10" text-anchor="middle">и только потом проверяются ограничения</text>

<line x1="26" y1="368" x2="674" y2="368" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="388" font-size="11">Присваивание qtyallocated = 0 стоит ниже — и всё равно из остатка вычлось честное 12, а не ноль.</text>
<text class="cap" x="26" y="408" font-size="11">Список в SET не последовательность шагов, а один снимок: справа все видят старое.</text>
<text class="cap" x="26" y="428" font-size="11">Прямое следствие: SET a = b, b = a честно меняет две колонки местами, без временной переменной.</text>
`);
}

// Форма UPDATE ... FROM в разрезе: какая таблица меняется, какая только
// читается, и во что превратился ON из привычного соединения. Схема нужна
// ради того, что связь и обычный отбор живут в одном WHERE вперемешку —
// и различает их только твоя голова.
function buildUpdateFromShapes() {
  const S = "update-from-shapes";
  // строка запроса, роль, тон
  const lines = [
    ["UPDATE dbo.stock s", "приёмник — единственная таблица, которую задевает команда", "hot"],
    ["SET qtyallocated = od.qtyordered", "что станет другим; справа — колонка источника", "hot"],
    ["FROM dbo.orderdetail od", "источник: читается, но не меняется", "src"],
    ["WHERE od.skuid = s.skuid", "связь: в обычном SELECT это было бы ON", "link"],
    ["  AND s.skuid = 'COFFEE-250'", "обычный отбор строк приёмника", "pick"],
  ];
  const body = lines.map(([q, role, tone], i) => {
    const y = 62 + i * 34;
    return `
<rect class="q-${tone}" x="26" y="${y}" width="290" height="28" rx="7"/>
<text class="mono" x="38" y="${y + 19}" font-size="11">${q}</text>
<line class="tie" x1="320" y1="${y + 14}" x2="340" y2="${y + 14}"/>
<text class="cap ${tone === "link" ? "t-gold" : tone === "hot" ? "t-accent" : ""}" x="346" y="${y + 18}" font-size="10.5">${role}</text>`;
  }).join("");

  return svgWrap("0 0 700 426", S, "UPDATE ... FROM: кто меняется, кто только читается", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .q-hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .q-src { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .q-link { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .q-pick { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .tbl-hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .tbl-src { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; stroke-dasharray: 5 4; }
.dg-${S} .cellv { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .cellnew { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .tie { stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .hotflow { stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Одна команда, четыре роли: приёмник, источник, связь и отбор</text>
<text class="cap" x="26" y="48" font-size="10.5">резерв под заказ: править надо dbo.stock, а число лежит в dbo.orderdetail</text>
${body}

<line x1="26" y1="248" x2="674" y2="248" stroke="var(--line)" stroke-width="1"/>

<rect class="tbl-src" x="386" y="268" width="288" height="76" rx="10"/>
<text class="cap" x="530" y="288" font-size="11" text-anchor="middle" font-weight="600">dbo.orderdetail — источник</text>
<rect class="cellv" x="404" y="298" width="252" height="26" rx="7"/>
<text class="mono" x="530" y="316" font-size="11" text-anchor="middle">COFFEE-250 → qtyordered = 6</text>
<text class="cap" x="530" y="338" font-size="10" text-anchor="middle">ни одна его строка не изменится</text>

<rect class="tbl-hot" x="26" y="268" width="288" height="76" rx="10"/>
<text class="cap t-accent" x="170" y="288" font-size="11" text-anchor="middle" font-weight="600">dbo.stock — приёмник</text>
<rect class="cellnew" x="44" y="298" width="252" height="26" rx="7"/>
<text class="mono" x="170" y="316" font-size="11" text-anchor="middle">A-02-01 / L0011 → qtyallocated = 6</text>
<text class="cap" x="170" y="338" font-size="10" text-anchor="middle">меняется только она</text>

<line class="hotflow" x1="382" y1="306" x2="322" y2="306" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap t-accent" x="352" y="298" font-size="10" text-anchor="middle">значение</text>

<text class="cap" x="26" y="368" font-size="11">Хоть десять таблиц поставь после FROM с любыми JOIN между ними — все они останутся только источником.</text>
<text class="cap" x="26" y="388" font-size="11">Связь и обычный отбор лежат в одном WHERE вперемешку, и различает их только твоя голова.</text>
<text class="cap" x="26" y="408" font-size="11">Потеряешь строчку связи — правку получит вся таблица, и ошибки при этом не будет ни одной.</text>
`);
}

// Мина формы с FROM: на одну строку приёмника пришлось два совпадения
// источника. Схема существует ради того, чтобы стало видно, что движок
// не суммирует и не ругается, а берёт одно значение на свой выбор, —
// и что лечится это сворачиванием источника, а не удачей.
function buildUpdateMultiMatch() {
  const S = "update-multi-match";
  const stock = [
    ["A-01-01 / L0001", 108],
    ["A-01-01 / L0002", 140],
    ["B-01-01 / L0013", 172],
  ];
  const orders = [
    ["заказ 1 → qtyordered 24", 116],
    ["заказ 4 → qtyordered 12", 156],
  ];

  const stockRows = stock.map(([t, y]) => `
<rect class="rowv" x="40" y="${y}" width="184" height="26" rx="7"/>
<text class="mono" x="132" y="${y + 18}" font-size="10.5" text-anchor="middle">${t}</text>`).join("");

  const orderRows = orders.map(([t, y]) => `
<rect class="rowsrc" x="452" y="${y}" width="200" height="26" rx="7"/>
<text class="mono" x="552" y="${y + 18}" font-size="10.5" text-anchor="middle">${t}</text>`).join("");

  // Каждая строка остатка сошлась с каждой строкой заказа: шесть пар на три места.
  const web = stock.flatMap(([, sy]) => orders.map(([, oy]) =>
    `<line class="webline" x1="228" y1="${sy + 13}" x2="448" y2="${oy + 13}"/>`)).join("\n");

  return svgWrap("0 0 700 442", S, "Два совпадения на одну строку — движок берёт любое", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-ok" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--ok)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .panebad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; }
.dg-${S} .paneok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.2; }
.dg-${S} .rowv { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .rowsrc { fill: var(--card); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .rowok { fill: var(--paper); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .webline { stroke: var(--bad); stroke-width: 1; opacity: 0.75; }
.dg-${S} .okflow { stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .foldbox { fill: var(--paper); stroke: var(--ok); stroke-width: 1.4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Три строки остатка, две строки заказов — и одна колонка, в которую надо положить число</text>

<rect class="panebad" x="26" y="44" width="648" height="216" rx="11"/>
<text class="mono" x="40" y="66" font-size="10.5">SET qtyallocated = od.qtyordered  FROM dbo.orderdetail od  WHERE od.skuid = s.skuid</text>
<text class="cap" x="132" y="98" font-size="10.5" text-anchor="middle" font-weight="600">dbo.stock, MILK-1L</text>
<text class="cap" x="552" y="98" font-size="10.5" text-anchor="middle" font-weight="600">dbo.orderdetail, MILK-1L</text>
${web}
${stockRows}
${orderRows}
<text class="cap t-bad" x="338" y="212" font-size="10.5" text-anchor="middle">связь сошлась у каждой пары: шесть совпадений на три места</text>
${crossIcon(40, 224, 14)}
<text class="cap t-bad" x="62" y="236" font-size="11">во все три строки легло 24.000 — ни 36, ни 12, а то, что движку попалось первым</text>
<text class="cap" x="62" y="252" font-size="10.5">второе совпадение выброшено молча; какое из двух возьмёт — решает план запроса, и завтра он другой</text>

<rect class="paneok" x="26" y="276" width="648" height="120" rx="11"/>
<text class="mono" x="40" y="298" font-size="10.5">FROM (SELECT skuid, sum(qtyordered) AS total FROM dbo.orderdetail GROUP BY skuid) AS need</text>
<rect class="foldbox" x="40" y="312" width="230" height="40" rx="9"/>
<text class="cap" x="155" y="329" font-size="10.5" text-anchor="middle">источник свёрнут по ключу</text>
<text class="mono" x="155" y="345" font-size="11" text-anchor="middle">MILK-1L → total = 36</text>
<line class="okflow" x1="276" y1="332" x2="308" y2="332" marker-end="url(#${S}-arrow-ok)"/>
<rect class="rowok" x="312" y="312" width="248" height="40" rx="9"/>
<text class="cap" x="436" y="329" font-size="10.5" text-anchor="middle">во все три строки остатка легло</text>
<text class="mono t-ok" x="436" y="345" font-size="12" text-anchor="middle">qtyallocated = 36.000</text>
${checkIcon(576, 325, 15)}
<text class="cap t-ok" x="600" y="337" font-size="10.5">и это твоё</text>
<text class="cap t-ok" x="600" y="351" font-size="10.5">решение</text>
<text class="cap" x="40" y="382" font-size="10.5">на каждый ключ справа ровно одна строка — результат перестал зависеть от плана</text>

<line x1="26" y1="408" x2="674" y2="408" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="428" font-size="11">Перед любым UPDATE ... FROM посмотри SELECT-ом, сколько строк источника приходится на один ключ приёмника.</text>
`);
}

/* ---------------------------------------------------------------- d8.03 */

// Анатомия DELETE: две части и два отсутствия. Схема существует ради того,
// чтобы стало видно, чего в команде НЕТ — списка колонок и SET, — и ради
// привычки смотреть тот же отбор SELECT-ом до удара: после DELETE от строки
// не остаётся ничего, что можно было бы пересчитать.
function buildDeleteParts() {
  const S = "delete-parts";
  const rows = [
    ["1", "1", "MILK-1L", "RELEASED"],
    ["2", "1", "BREAD-DARK", "PICKED"],
    ["3", "1", "EGGS-C1", "RELEASED"],
  ];
  const rowStrip = (x, y, gone) => rows.map((r, i) => {
    const ry = y + i * 24;
    return `
<rect class="${gone ? "rowgone" : "rowv"}" x="${x}" y="${ry}" width="272" height="20" rx="6"/>
<text class="mono ${gone ? "faded" : ""}" x="${x + 10}" y="${ry + 14}" font-size="10">${r[0]}</text>
<text class="mono ${gone ? "faded" : ""}" x="${x + 32}" y="${ry + 14}" font-size="10">${r[1]}</text>
<text class="mono ${gone ? "faded" : ""}" x="${x + 58}" y="${ry + 14}" font-size="10">${r[2]}</text>
<text class="mono ${gone ? "faded" : ""}" x="${x + 160}" y="${ry + 14}" font-size="10">${r[3]}</text>
${gone ? `<line class="strike" x1="${x + 6}" y1="${ry + 10}" x2="${x + 266}" y2="${ry + 10}"/>` : ""}`;
  }).join("");

  return svgWrap("0 0 700 418", S, "У DELETE две части, и вторая важнее первой", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .faded { fill: var(--muted); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .part { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .parthot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .absent { fill: none; stroke: var(--line-soft); stroke-width: 1.2; stroke-dasharray: 5 4; }
.dg-${S} .rowv { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .rowgone { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .strike { stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .pane { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .panebad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .flow { fill: none; stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">У команды две части, и вторая из них важнее первой</text>

<text class="cap" x="26" y="52" font-size="10">из какой таблицы уходят строки</text>
<text class="cap" x="306" y="52" font-size="10">какие именно строки уходят — теперь это «что потерять»</text>
<rect class="part" x="26" y="60" width="260" height="32" rx="8"/>
<text class="mono" x="156" y="81" font-size="11.5" text-anchor="middle">DELETE FROM dbo.pickdetail</text>
<rect class="parthot" x="306" y="60" width="368" height="32" rx="8"/>
<text class="mono" x="490" y="81" font-size="11.5" text-anchor="middle">WHERE orderkey = 1</text>

<text class="cap" x="26" y="116" font-size="11" font-weight="600">Чего в команде нет — и это не забывчивость</text>
<rect class="absent" x="26" y="126" width="310" height="30" rx="8"/>
<text class="mono faded" x="181" y="146" font-size="11" text-anchor="middle">(skuid, qty, status)</text>
${crossIcon(30, 132, 14)}
<text class="cap" x="26" y="174" font-size="10.5">списка колонок нет: уходит строка целиком.</text>
<text class="cap" x="26" y="190" font-size="10.5">убрать одну колонку — это UPDATE ... SET колонка = NULL</text>

<rect class="absent" x="364" y="126" width="310" height="30" rx="8"/>
<text class="mono faded" x="519" y="146" font-size="11" text-anchor="middle">SET ...</text>
${crossIcon(368, 132, 14)}
<text class="cap" x="364" y="174" font-size="10.5">SET нет: удалять нечего настраивать.</text>
<text class="cap" x="364" y="190" font-size="10.5">строка либо остаётся целиком, либо её больше нет</text>

<line x1="26" y1="208" x2="674" y2="208" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="230" font-size="11.5" font-weight="600">Отбор и удаление — это один приём в два шага, а не два разных дела</text>

<rect class="pane" x="26" y="242" width="300" height="140" rx="10"/>
<text class="mono" x="40" y="264" font-size="10.5">SELECT * FROM dbo.pickdetail</text>
<text class="mono t-accent" x="40" y="280" font-size="10.5">WHERE orderkey = 1;</text>
${rowStrip(40, 292, false)}
<text class="cap" x="40" y="374" font-size="10">три строки — те самые, глазами, до удара</text>

<line class="flow" x1="330" y1="312" x2="366" y2="312" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="348" y="304" font-size="10" text-anchor="middle">и только</text>
<text class="cap" x="348" y="330" font-size="10" text-anchor="middle">потом</text>

<rect class="panebad" x="374" y="242" width="300" height="140" rx="10"/>
<text class="mono" x="388" y="264" font-size="10.5">DELETE FROM dbo.pickdetail</text>
<text class="mono t-accent" x="388" y="280" font-size="10.5">WHERE orderkey = 1;</text>
${rowStrip(388, 292, true)}
<text class="cap t-bad" x="388" y="374" font-size="10">DELETE 3 — и вернуть их уже неоткуда</text>

<text class="cap" x="26" y="404" font-size="11">У UPDATE при ошибке остаётся старое значение и шанс пересчитать. У DELETE не остаётся ничего: строки просто нет.</text>
`);
}

// Две команды с одинаковым итогом «строк ноль» и совершенно разной механикой:
// DELETE идёт по строкам, TRUNCATE подменяет таблице файл. Схема существует
// ради доказательства из ноды — размера файла на диске: 8192 байта против нуля.
function buildDeleteVsTruncate() {
  const S = "delete-vs-truncate";
  const chips = [
    ["проверить", "условие"],
    ["запись", "в журнал"],
    ["разбудить", "триггер"],
    ["проверить", "внешние ключи"],
  ];
  const chain = chips.map(([a, b], i) => {
    const cx = 210 + i * 104;
    const arrow = i === chips.length - 1 ? ""
      : `<line class="flow" x1="${cx + 96}" y1="116" x2="${cx + 104}" y2="116" marker-end="url(#${S}-arrow)"/>`;
    return `
<rect class="chipstep" x="${cx}" y="100" width="96" height="32" rx="8"/>
<text class="cap" x="${cx + 48}" y="114" font-size="9" text-anchor="middle">${a}</text>
<text class="cap" x="${cx + 48}" y="126" font-size="9" text-anchor="middle">${b}</text>
${arrow}`;
  }).join("");

  const pageRows = (x, y, cls) => [0, 1, 2, 3].map((i) => `
<rect class="${cls}" x="${x + 12}" y="${y + 22 + i * 18}" width="126" height="14" rx="4"/>`).join("");

  return svgWrap("0 0 700 428", S, "DELETE ходит по строкам, TRUNCATE подменяет файл", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-ok" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--ok)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .pane { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .page { fill: var(--paper); stroke: var(--line); stroke-width: 1.4; }
.dg-${S} .pagedead { fill: var(--card); stroke: var(--line-soft); stroke-width: 1.2; stroke-dasharray: 5 4; }
.dg-${S} .rowv { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1; }
.dg-${S} .rowdead { fill: var(--card); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .chipstep { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .sumbad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .sumok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .flow { fill: none; stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .bigflow { fill: none; stroke: var(--ok); stroke-width: 2; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Итог у обеих команд один — строк ноль. Механика разная настолько, что видно по размеру файла</text>

<rect class="pane" x="26" y="44" width="648" height="172" rx="11"/>
<text class="mono" x="40" y="66" font-size="11">DELETE FROM dbo.stock;</text>
<text class="cap" x="210" y="66" font-size="10.5">построчная операция: каждая строка проходит через всё это</text>
<rect class="page" x="40" y="78" width="150" height="104" rx="8"/>
<text class="cap" x="115" y="94" font-size="9.5" text-anchor="middle">страница данных</text>
${pageRows(40, 78, "rowv")}
<line class="flow" x1="194" y1="116" x2="206" y2="116" marker-end="url(#${S}-arrow)"/>
${chain}
<text class="cap" x="210" y="150" font-size="10">и так с каждой строкой: тринадцать раз или двести миллионов раз</text>
<rect class="sumbad" x="210" y="160" width="440" height="34" rx="9"/>
<text class="mono t-bad" x="228" y="181" font-size="11">строк 0 · файл 8192 байта</text>
<text class="cap" x="404" y="181" font-size="10">— страницы у таблицы никто не отобрал</text>
<text class="cap" x="115" y="200" font-size="9.5" text-anchor="middle">по одной строке за раз</text>

<rect class="pane" x="26" y="228" width="648" height="146" rx="11"/>
<text class="mono" x="40" y="250" font-size="11">TRUNCATE TABLE dbo.stock;</text>
<text class="cap" x="240" y="250" font-size="10.5">операция на уровне файлов: строк движок не касается вообще</text>
<rect class="pagedead" x="40" y="262" width="150" height="96" rx="8"/>
<text class="cap" x="115" y="278" font-size="9.5" text-anchor="middle">старый файл</text>
${pageRows(40, 262, "rowdead")}
<line class="bigflow" x1="196" y1="310" x2="234" y2="310" marker-end="url(#${S}-arrow-ok)"/>
<text class="cap" x="215" y="300" font-size="9.5" text-anchor="middle">отцеплен</text>
<text class="cap" x="215" y="328" font-size="9.5" text-anchor="middle">разом</text>
<rect class="page" x="240" y="262" width="150" height="96" rx="8"/>
<text class="cap" x="315" y="278" font-size="9.5" text-anchor="middle">новый пустой файл</text>
<text class="cap" x="315" y="318" font-size="10" text-anchor="middle">пусто</text>
<rect class="sumok" x="410" y="278" width="240" height="34" rx="9"/>
<text class="mono t-ok" x="530" y="299" font-size="11" text-anchor="middle">строк 0 · файл 0 байт</text>
<text class="cap" x="410" y="334" font-size="10">ни журнала на каждую строку, ни триггеров,</text>
<text class="cap" x="410" y="350" font-size="10">ни проверки внешних ключей — работы просто нет</text>

<line x1="26" y1="392" x2="674" y2="392" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="412" font-size="11">На тринадцати строках разницы не видно. На двухстах миллионах DELETE идёт часами, а TRUNCATE — доли секунды.</text>
`);
}

// Лестница из трёх команд на трёх одинаковых таблицах: что после каждой
// остаётся. Схема существует ради того, чтобы развести «нет строк» и
// «нет таблицы» — и напомнить, что третья ступень это уже DDL, а не DML.
function buildDeleteDropLadder() {
  const S = "delete-drop-ladder";
  const cols = [
    { x: 26, q: "DELETE FROM dbo.a_draft", q2: "WHERE id = 2;", after: [1, 3], kind: "part",
      sum: ["ушли названные строки", "таблица, структура и права", "остались на месте"] },
    { x: 250, q: "TRUNCATE TABLE", q2: "dbo.b_draft;", after: [], kind: "empty",
      sum: ["ушли все строки", "таблица пустая, но живая:", "структура и права на месте"] },
    { x: 474, q: "DROP TABLE", q2: "dbo.c_draft;", after: null, kind: "gone",
      sum: ["ушёл сам объект", "ни строк, ни колонок,", "ни индексов, ни прав"] },
  ];

  const mini = (x, y, ids, cls) => {
    if (ids === null) {
      return `
<rect class="tblgone" x="${x}" y="${y}" width="200" height="70" rx="9"/>
<text class="cap faded" x="${x + 100}" y="${y + 32}" font-size="10.5" text-anchor="middle">таблицы больше нет</text>
<text class="mono faded" x="${x + 100}" y="${y + 50}" font-size="9.5" text-anchor="middle">relation does not exist</text>`;
    }
    if (ids.length === 0) {
      return `
<rect class="${cls}" x="${x}" y="${y}" width="200" height="70" rx="9"/>
<text class="cap" x="${x + 100}" y="${y + 40}" font-size="10.5" text-anchor="middle">строк нет, таблица есть</text>`;
    }
    const cells = [1, 2, 3].map((id, i) => {
      const alive = ids.includes(id);
      return `
<rect class="${alive ? "cellv" : "celldead"}" x="${x + 20}" y="${y + 10 + i * 18}" width="160" height="14" rx="4"/>
<text class="mono ${alive ? "" : "faded"}" x="${x + 100}" y="${y + 21 + i * 18}" font-size="9" text-anchor="middle">id = ${id}</text>`;
    }).join("");
    return `<rect class="${cls}" x="${x}" y="${y}" width="200" height="70" rx="9"/>${cells}`;
  };

  const body = cols.map((c) => `
<rect class="cmd" x="${c.x}" y="54" width="200" height="34" rx="8"/>
<text class="mono" x="${c.x + 100}" y="70" font-size="10" text-anchor="middle">${c.q}</text>
<text class="mono" x="${c.x + 100}" y="83" font-size="10" text-anchor="middle">${c.q2}</text>
<text class="cap" x="${c.x + 100}" y="106" font-size="9.5" text-anchor="middle">было</text>
${mini(c.x, 110, [1, 2, 3], "tblv")}
<line class="flow" x1="${c.x + 100}" y1="184" x2="${c.x + 100}" y2="200" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="${c.x + 100}" y="218" font-size="9.5" text-anchor="middle">стало</text>
${mini(c.x, 222, c.after, c.kind === "empty" ? "tblempty" : "tblv")}
${c.sum.map((t, i) => `<text class="cap" x="${c.x + 100}" y="${312 + i * 15}" font-size="10" text-anchor="middle">${t}</text>`).join("\n")}`).join("");

  return svgWrap("0 0 700 420", S, "DELETE, TRUNCATE, DROP: три ступени", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .faded { fill: var(--muted); }
.dg-${S} .cmd { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .tblv { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .tblempty { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .tblgone { fill: none; stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 5 4; }
.dg-${S} .cellv { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1; }
.dg-${S} .celldead { fill: none; stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 3 3; }
.dg-${S} .flow { fill: none; stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Три одинаковых таблицы по три строки, три разные команды</text>
<text class="cap" x="26" y="46" font-size="10.5">из трёх таблиц осталось две — и это разные потери, а не «одно и то же посильнее»</text>
${body}

<line x1="26" y1="366" x2="674" y2="366" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="386" font-size="11">Ступени растут не по силе, а по тому, что именно исчезает: названные строки, все строки, сам объект.</text>
<text class="cap" x="26" y="406" font-size="11">DROP TABLE это уже DDL, а не DML: он меняет схему базы, а не данные в ней.</text>
`);
}

// Одно большое удаление против удаления порциями. Схема существует ради трёх
// причин, по которым база встаёт от одной команды на восемьдесят миллионов
// строк, — и ради того, что лечится это не мощностью сервера, а зазорами
// между короткими транзакциями.
function buildDeleteBatches() {
  const S = "delete-batches";
  const bars = [0, 1, 2, 3, 4, 5].map((i) => {
    const bx = 40 + i * 106;
    const DEMO_PROJECT = i === 5 ? "" : `
<line class="gaparrow" x1="${bx + 97}" y1="292" x2="${bx + 97}" y2="268" marker-end="url(#${S}-arrow-ok)"/>`;
    return `
<rect class="barok" x="${bx}" y="252" width="88" height="30" rx="7"/>
<text class="cap" x="${bx + 44}" y="271" font-size="9.5" text-anchor="middle">5000 строк</text>
<circle class="commitdot" cx="${bx + 88}" cy="267" r="4.5"/>
${DEMO_PROJECT}`;
  }).join("");

  return svgWrap("0 0 700 424", S, "Одна большая транзакция против коротких пачек", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-ok" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--ok)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .panebad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; }
.dg-${S} .paneok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.2; }
.dg-${S} .barbad { fill: var(--card); stroke: var(--bad); stroke-width: 1.6; }
.dg-${S} .barok { fill: var(--card); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .commitdot { fill: var(--ok); }
.dg-${S} .gaparrow { fill: none; stroke: var(--ok); stroke-width: 1.2; }
.dg-${S} .blocked { fill: none; stroke: var(--bad); stroke-width: 1.2; stroke-dasharray: 4 3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Восемьдесят миллионов строк: одной командой или пачками</text>

<rect class="panebad" x="26" y="44" width="648" height="164" rx="11"/>
<text class="mono" x="40" y="66" font-size="10.5">DELETE FROM dbo.oplog WHERE logdate &lt; '2025-01-01';</text>
<text class="cap t-bad" x="380" y="66" font-size="10.5">так делать нельзя</text>
<rect class="barbad" x="40" y="80" width="600" height="32" rx="8"/>
<text class="cap" x="340" y="100" font-size="10.5" text-anchor="middle">одна транзакция — и она открыта все сорок минут</text>
<line class="blocked" x1="40" y1="122" x2="640" y2="122"/>
<text class="cap t-bad" x="40" y="138" font-size="10">чужие запросы к таблице стоят всё это время: зазора нет ни одного</text>
<text class="cap" x="40" y="160" font-size="10">— журнал не может переиспользовать место и растёт на весь объём удаления</text>
<text class="cap" x="40" y="176" font-size="10">— блокировок так много, что сервер решает запереть таблицу целиком</text>
<text class="cap" x="40" y="192" font-size="10">— убили подвисшую сессию, и откат пошёл дольше, чем шло удаление; отменить его нельзя</text>

<rect class="paneok" x="26" y="220" width="648" height="132" rx="11"/>
<text class="mono" x="40" y="242" font-size="10.5">LOOP  DELETE ... LIMIT 5000;  COMMIT;  EXIT WHEN ushlo = 0;  END LOOP;</text>
${bars}
<text class="cap t-ok" x="40" y="308" font-size="10">точка — COMMIT после каждой пачки; стрелка вверх — зазор, в который проходят чужие запросы</text>
<text class="cap" x="40" y="326" font-size="10">транзакция короткая, блокировки короткие, журнал успевает переиспользовать место</text>
<text class="cap" x="40" y="342" font-size="10">EXIT WHEN ushlo = 0 — пачка пришла пустой, работа окончена. Без этой строки цикл вечный.</text>

<line x1="26" y1="368" x2="674" y2="368" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="388" font-size="11">Размер пачки на бою — от тысячи до пятидесяти тысяч строк, и подбирают его под нагрузку, а не по вкусу.</text>
<text class="cap" x="26" y="408" font-size="11">Если сносить надо почти всё — быстрее перевернуть: нужное во временную таблицу, TRUNCATE, залить обратно.</text>
`);
}

/* ---------------------------------------------------------------- d8.04 */

// RETURNING как хвост команды: строка едет из VALUES в таблицу, таблица
// достраивает её своими значениями, и наружу уходит уже достроенная.
// Схема существует ради того, что отдаётся не переданное, а то, что реально
// легло, — и что происходит это внутри команды, а не запросом после неё.
function buildReturningTail() {
  const S = "returning-tail";
  const stage = (x, w, title, sub, chips, kind) => {
    const rows = chips.map(([t, hot], i) => `
<rect class="${hot ? "chiphot" : "chipv"}" x="${x + 12}" y="${178 + i * 24}" width="${w - 24}" height="20" rx="6"/>
<text class="mono ${hot ? "t-gold" : ""}" x="${x + w / 2}" y="${192 + i * 24}" font-size="10" text-anchor="middle">${t}</text>`).join("");
    return `
<rect class="${kind}" x="${x}" y="${152}" width="${w}" height="${28 + chips.length * 24}" rx="10"/>
<text class="cap" x="${x + w / 2}" y="${144}" font-size="10.5" text-anchor="middle" font-weight="600">${title}</text>
<text class="cap" x="${x + w / 2}" y="${170}" font-size="9.5" text-anchor="middle">${sub}</text>
${rows}`;
  };

  return svgWrap("0 0 700 402", S, "RETURNING отдаёт то, что реально легло", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .cmd { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .tailhot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .stagev { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .stagegold { fill: var(--paper); stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .stageout { fill: var(--paper); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .chipv { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .chiphot { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.1; }
.dg-${S} .flow { fill: none; stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .hotflow { fill: none; stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">RETURNING — не второй проход по таблице, а хвост, дописанный к команде</text>

<rect class="cmd" x="26" y="44" width="440" height="46" rx="9"/>
<text class="mono" x="42" y="63" font-size="10.5">INSERT INTO dbo.zadanie_draft (skuid, loc, qty)</text>
<text class="mono" x="42" y="80" font-size="10.5">VALUES ('MILK-1L', 'A-01-01', 24)</text>
<rect class="tailhot" x="26" y="94" width="440" height="26" rx="9"/>
<text class="mono t-accent" x="42" y="112" font-size="10.5">RETURNING zadaniekey, skuid, loc, qty, status;</text>
<text class="cap" x="480" y="66" font-size="10">команда и так идёт</text>
<text class="cap" x="480" y="81" font-size="10">по этим строкам —</text>
<text class="cap" x="480" y="96" font-size="10">хвост просит не</text>
<text class="cap" x="480" y="111" font-size="10">выбрасывать их</text>

${stage(26, 190, "что стояло в команде", "три значения из VALUES", [["'MILK-1L'", false], ["'A-01-01'", false], ["24", false]], "stagev")}
<line class="flow" x1="222" y1="212" x2="248" y2="212" marker-end="url(#${S}-arrow)"/>
${stage(252, 190, "таблица достроила строку", "своими значениями", [["zadaniekey = 1", true], ["status = 'NEW'", true]], "stagegold")}
<line class="hotflow" x1="448" y1="212" x2="474" y2="212" marker-end="url(#${S}-arrow-accent)"/>
${stage(478, 196, "RETURNING отдал", "то, что реально легло", [["1", true], ["MILK-1L", false], ["A-01-01", false], ["24.000", false], ["NEW", true]], "stageout")}

<text class="cap" x="252" y="248" font-size="10">ни ключа, ни статуса в команде не было</text>

<line x1="26" y1="308" x2="674" y2="308" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="328" font-size="11">Отдаётся то, что команда тронула, — а не то, что подходит под условие: до чего не дошла, того в выводе нет.</text>
<text class="cap" x="26" y="348" font-size="11">Происходит это внутри команды: между изменением и показом не вклинится ни второй запрос, ни чужая сессия.</text>
<text class="cap" x="26" y="368" font-size="11">Пишется как список SELECT: колонки, выражения, алиасы через AS, звёздочка.</text>
<text class="cap" x="26" y="388" font-size="11">Слово это PostgreSQL-ское. В SQL Server его нет вовсе — там ту же работу делает OUTPUT, устроенный иначе.</text>
`);
}

// Перенос строк в архив: три шага с разрывом посередине против одной команды.
// Схема существует ради слова «атомарный»: у CTE с DELETE ... RETURNING нет
// момента, в который данные лежат в двух местах или ни в одном.
function buildReturningMove() {
  const S = "returning-move";
  const moved = ["BREAD-DARK / L0004", "CHICKEN-KG / L0010", "MILK-1L / L0001", "MILK-1L / L0002"];
  const rowList = (x, y, cls) => moved.map((t, i) => `
<rect class="${cls}" x="${x}" y="${y + i * 22}" width="135" height="18" rx="5"/>
<text class="mono" x="${x + 67}" y="${y + 13 + i * 22}" font-size="9" text-anchor="middle">${t}</text>`).join("");

  return svgWrap("0 0 700 428", S, "Перенос в архив одной командой", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .panebad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; }
.dg-${S} .paneok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.2; }
.dg-${S} .stepv { fill: var(--card); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .tblv { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .tblout { fill: var(--paper); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .pipe { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .rowv { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .rowok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1; }
.dg-${S} .flow { fill: none; stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .hotflow { fill: none; stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .crack { fill: none; stroke: var(--bad); stroke-width: 1.6; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Просроченные партии надо убрать со склада, но не в никуда, а в архив</text>

<rect class="panebad" x="26" y="44" width="648" height="108" rx="11"/>
<text class="cap t-bad" x="40" y="66" font-size="11" font-weight="600">как это пишут в три шага</text>
<rect class="stepv" x="40" y="78" width="182" height="40" rx="9"/>
<text class="cap" x="131" y="94" font-size="10" text-anchor="middle">1. скопировать в архив</text>
<text class="mono" x="131" y="109" font-size="9.5" text-anchor="middle">INSERT ... SELECT</text>
<line class="crack" x1="232" y1="98" x2="266" y2="98"/>
<text class="cap t-bad" x="249" y="86" font-size="9" text-anchor="middle">пауза</text>
<rect class="stepv" x="276" y="78" width="182" height="40" rx="9"/>
<text class="cap" x="367" y="94" font-size="10" text-anchor="middle">2. удалить со склада</text>
<text class="mono" x="367" y="109" font-size="9.5" text-anchor="middle">DELETE FROM dbo.stock</text>
<text class="cap t-bad" x="474" y="88" font-size="10">3. надеяться, что между шагами</text>
<text class="cap t-bad" x="474" y="103" font-size="10">ничего не поменялось</text>
<text class="cap" x="40" y="138" font-size="10.5">упало в паузе — строки останутся и там и там, или пропадут совсем; и узнаешь ты об этом не сразу</text>

<rect class="paneok" x="26" y="164" width="648" height="196" rx="11"/>
<text class="cap t-ok" x="40" y="186" font-size="11" font-weight="600">одной командой: DELETE отдаёт строки прямо в INSERT</text>
<text class="mono" x="40" y="208" font-size="10">WITH spisannye AS ( DELETE FROM dbo.stock WHERE lot IN (...) RETURNING * )</text>
<text class="mono" x="40" y="224" font-size="10">INSERT INTO dbo.stock_archive_draft SELECT * FROM spisannye;</text>

<rect class="tblv" x="40" y="240" width="155" height="106" rx="9"/>
<text class="cap" x="117" y="256" font-size="9.5" text-anchor="middle">dbo.stock — уходят</text>
${rowList(50, 262, "rowv")}
<line class="hotflow" x1="199" y1="294" x2="251" y2="294" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap t-accent" x="225" y="286" font-size="8.5" text-anchor="middle">RETURNING *</text>

<rect class="pipe" x="255" y="252" width="150" height="82" rx="9"/>
<text class="mono t-accent" x="330" y="284" font-size="11" text-anchor="middle">spisannye</text>
<text class="cap" x="330" y="302" font-size="9.5" text-anchor="middle">имя работает как</text>
<text class="cap" x="330" y="316" font-size="9.5" text-anchor="middle">обычная таблица</text>
<line class="hotflow" x1="409" y1="294" x2="461" y2="294" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap t-accent" x="435" y="286" font-size="8.5" text-anchor="middle">SELECT *</text>

<rect class="tblout" x="465" y="240" width="155" height="106" rx="9"/>
<text class="cap" x="542" y="256" font-size="9.5" text-anchor="middle">архив — приезжают</text>
${rowList(475, 262, "rowok")}
${checkIcon(634, 285, 16)}

<line x1="26" y1="376" x2="674" y2="376" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="396" font-size="11">Это одна команда, а не две: вклиниться между половинками нечему. Либо переехало всё, либо не переехало ничего.</text>
<text class="cap" x="26" y="416" font-size="11">RETURNING * и INSERT без списка колонок сходятся, только пока архив объявлен теми же колонками в том же порядке.</text>
`);
}

// Две псевдотаблицы T-SQL: inserted — строка после изменения, deleted — она же
// до. Схема существует ради одной фразы: RETURNING знает одну версию строки,
// OUTPUT знает обе, и аудит «было — стало» из-за этого пишется в одну строчку.
function buildOutputTwoTables() {
  const S = "output-two-tables";
  const grid = [
    ["inserted", "да, вставленные строки", "да, строки после правки", "нет", [true, true, false]],
    ["deleted", "нет", "да, строки до правки", "да, удалённые строки", [false, true, true]],
  ];
  const matrix = grid.map(([name, a, b, c, marks], i) => {
    const y = 290 + i * 44;
    const cells = [a, b, c].map((t, j) => {
      const cx = 176 + j * 168;
      const ok = marks[j];
      return `
<rect class="${ok ? "cellok" : "cellno"}" x="${cx}" y="${y}" width="158" height="34" rx="8"/>
${ok ? checkIcon(cx + 10, y + 10, 13) : crossIcon(cx + 10, y + 10, 13)}
<text class="cap ${ok ? "" : "faded"}" x="${cx + 30}" y="${y + 22}" font-size="9.5">${t}</text>`;
    }).join("");
    return `
<text class="mono ${name === "inserted" ? "t-accent" : "t-gold"}" x="166" y="${y + 22}" font-size="11" text-anchor="end">${name}</text>
${cells}`;
  }).join("");

  return svgWrap("0 0 700 444", S, "OUTPUT знает обе версии строки", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .faded { fill: var(--muted); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .cmd { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .cmdhot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .psgold { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.5; }
.dg-${S} .psacc { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .outrow { fill: var(--paper); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .cellok { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .cellno { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .flow { fill: none; stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">В T-SQL клауза OUTPUT стоит в середине команды и видит обе версии строки</text>

<rect class="cmd" x="26" y="44" width="300" height="30" rx="8"/>
<text class="mono" x="40" y="64" font-size="10.5">UPDATE dbo.stock SET qtyallocated = 0</text>
<rect class="cmdhot" x="26" y="78" width="300" height="46" rx="8"/>
<text class="mono t-gold" x="40" y="96" font-size="10.5">OUTPUT deleted.qtyallocated AS snyato,</text>
<text class="mono t-accent" x="40" y="113" font-size="10.5">       inserted.qtyallocated AS ostalos</text>
<rect class="cmd" x="26" y="128" width="300" height="28" rx="8"/>
<text class="mono" x="40" y="147" font-size="10.5">WHERE qtyallocated &gt; 0;</text>
<text class="cap" x="26" y="174" font-size="10">не хвостом в конце, как RETURNING, а между SET и WHERE</text>

<rect class="psgold" x="352" y="44" width="150" height="56" rx="9"/>
<text class="mono t-gold" x="427" y="63" font-size="11" text-anchor="middle">deleted</text>
<text class="cap" x="427" y="78" font-size="9.5" text-anchor="middle">строка ДО изменения</text>
<text class="mono" x="427" y="93" font-size="11" text-anchor="middle">12.000</text>

<rect class="psacc" x="352" y="112" width="150" height="56" rx="9"/>
<text class="mono t-accent" x="427" y="131" font-size="11" text-anchor="middle">inserted</text>
<text class="cap" x="427" y="146" font-size="9.5" text-anchor="middle">строка ПОСЛЕ изменения</text>
<text class="mono" x="427" y="161" font-size="11" text-anchor="middle">0.000</text>

<line class="flow" x1="506" y1="72" x2="530" y2="94" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="506" y1="140" x2="530" y2="118" marker-end="url(#${S}-arrow)"/>
<rect class="outrow" x="534" y="86" width="140" height="40" rx="9"/>
<text class="cap" x="604" y="102" font-size="9.5" text-anchor="middle">snyato · ostalos</text>
<text class="mono" x="604" y="118" font-size="11" text-anchor="middle">12.000 · 0.000</text>
<text class="cap" x="604" y="146" font-size="9.5" text-anchor="middle">журнал «было — стало»</text>
<text class="cap" x="604" y="160" font-size="9.5" text-anchor="middle">в одну строчку</text>

<line x1="26" y1="196" x2="674" y2="196" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="216" font-size="11" font-weight="600">Псевдотаблиц не видно в списке таблиц: они живут только на время выполнения команды</text>
<text class="cap" x="26" y="236" font-size="10.5">и не у каждой команды есть обе — вот кто где доступен</text>
<text class="cap" x="255" y="278" font-size="10.5" text-anchor="middle" font-weight="600">INSERT</text>
<text class="cap" x="423" y="278" font-size="10.5" text-anchor="middle" font-weight="600">UPDATE</text>
<text class="cap" x="591" y="278" font-size="10.5" text-anchor="middle" font-weight="600">DELETE</text>
${matrix}

<line x1="26" y1="392" x2="674" y2="392" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="412" font-size="11">RETURNING знает одну версию строки — новую. OUTPUT знает обе, и аудит «было — стало» пишется одним словом deleted.</text>
<text class="cap" x="26" y="430" font-size="11">Цена этой мощи — переносимость: RETURNING есть в четырёх СУБД, OUTPUT только в одной.</text>
`);
}

/* ---------------------------------------------------------------- d8.05 */

// Три зоны MERGE: движок мысленно соединяет цель с источником по ON и
// раскладывает строки на «есть и там и там», «есть только в источнике» и
// «есть только в цели». Схема существует ради того, что ветку строке выбирает
// не автор, а условие сопоставления, и что в каждой зоне разрешено своё.
function buildMergeBranches() {
  const S = "merge-branches";
  const parts = [
    ["MERGE INTO sku_draft AS t", "цель: единственная таблица, которая получает изменения"],
    ["USING dbo.sku AS s", "источник: таблица, подзапрос или VALUES — только читается"],
    ["ON t.skuid = s.skuid", "условие сопоставления: само по себе не меняет ни строчки"],
  ];
  const head = parts.map(([q, role], i) => {
    const y = 46 + i * 26;
    return `
<rect class="${i === 2 ? "qhot" : "qv"}" x="26" y="${y}" width="238" height="22" rx="6"/>
<text class="mono" x="36" y="${y + 16}" font-size="10">${q}</text>
<text class="cap ${i === 2 ? "t-accent" : ""}" x="276" y="${y + 16}" font-size="10">${role}</text>`;
  }).join("");

  // Три зоны: подпись ветки, пояснение и товары из примера.
  const zones = [
    [180, "WHEN NOT MATCHED", "BY SOURCE", "есть у нас,", "в выгрузке нет", ["PASTA-500"]],
    [350, "WHEN MATCHED", "", "есть и там,", "и там", ["MILK-1L", "KEFIR-05"]],
    [520, "WHEN NOT MATCHED", "", "есть в выгрузке,", "у нас нет", ["COFFEE-250", "EGGS-C1"]],
  ];
  const zoneText = zones.map(([cx, l1, l2, s1, s2, items]) => `
<text class="mono zone" x="${cx}" y="192" font-size="9.5" text-anchor="middle" font-weight="700">${l1}</text>
${l2 ? `<text class="mono zone" x="${cx}" y="205" font-size="9.5" text-anchor="middle" font-weight="700">${l2}</text>` : ""}
<text class="cap" x="${cx}" y="${l2 ? 224 : 222}" font-size="9.5" text-anchor="middle">${s1}</text>
<text class="cap" x="${cx}" y="${l2 ? 237 : 235}" font-size="9.5" text-anchor="middle">${s2}</text>
${items.map((t, i) => `
<rect class="item" x="${cx - 52}" y="${250 + i * 22}" width="104" height="18" rx="5"/>
<text class="mono" x="${cx}" y="${263 + i * 22}" font-size="9.5" text-anchor="middle">${t}</text>`).join("")}`).join("");

  const legend = [
    [98, 164, "UPDATE · DELETE · DO NOTHING", "колонок источника здесь нет:", "подходящей строки не существует"],
    [268, 164, "UPDATE · DELETE · DO NOTHING", "обе стороны на месте,", "доступны и t, и s"],
    [438, 164, "только INSERT", "обновлять нечего:", "строки в цели ещё нет"],
  ];
  const legendBody = legend.map(([x, w, act, a, b]) => `
<rect class="legend" x="${x}" y="338" width="${w}" height="54" rx="9"/>
<text class="mono" x="${x + w / 2}" y="355" font-size="9" text-anchor="middle" font-weight="700">${act}</text>
<text class="cap" x="${x + w / 2}" y="371" font-size="9.5" text-anchor="middle">${a}</text>
<text class="cap" x="${x + w / 2}" y="384" font-size="9.5" text-anchor="middle">${b}</text>`).join("");

  return svgWrap("0 0 700 486", S, "Три зоны MERGE и кто в них попадает", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .zone { fill: var(--ink); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .qv { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .qhot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .lobeA { fill: var(--accent-soft); fill-opacity: 0.55; stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .lobeB { fill: var(--gold-soft); fill-opacity: 0.55; stroke: var(--gold); stroke-width: 1.5; }
.dg-${S} .item { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .legend { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
</style>

${head}
<ellipse class="lobeA" cx="270" cy="238" rx="185" ry="94"/>
<ellipse class="lobeB" cx="430" cy="238" rx="185" ry="94"/>
<text class="cap" x="42" y="150" font-size="10.5" font-weight="600">цель sku_draft</text>
<text class="cap" x="658" y="150" font-size="10.5" text-anchor="end" font-weight="600">источник — выгрузка из ERP</text>
${zoneText}
${legendBody}

<line x1="26" y1="412" x2="674" y2="412" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="432" font-size="11">Какая ветка достанется строке, решает не автор, а условие ON.</text>
<text class="cap" x="26" y="452" font-size="11">Движок соединяет цель с источником, раскладывает результат на три зоны и проходит по нему один раз.</text>
<text class="cap" x="26" y="472" font-size="11">Это один оператор, а не три команды подряд: промежуточного состояния снаружи не видно никому.</text>
`);
}

// Асимметрия мощности: две строки источника на одну строку цели валят весь
// оператор, а одна строка источника на три строки цели проходит молча.
// Схема существует ради того, что падение здесь — функция, и ради правила
// «условие ON должно совпадать с уникальным ключом цели».
function buildMergeCardinality() {
  const S = "merge-cardinality";
  const targets = ["A-01-01 / L0001", "A-01-01 / L0002", "B-01-01 / L0013"];
  const fan = targets.map((t, i) => {
    const y = 296 + i * 24;
    return `
<line class="okflow" x1="246" y1="317" x2="374" y2="${y + 10}" marker-end="url(#${S}-arrow-ok)"/>
<rect class="rowok" x="378" y="${y}" width="256" height="20" rx="6"/>
<text class="mono" x="506" y="${y + 14}" font-size="9.5" text-anchor="middle">${t} → qty 5.000</text>`;
  }).join("");

  return svgWrap("0 0 700 502", S, "Мощность источника: когда MERGE падает и когда молчит", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-ok" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--ok)"/></marker>
<marker id="${S}-arrow-bad" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--bad)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .panebad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; }
.dg-${S} .paneok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.2; }
.dg-${S} .rowv { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .rowsrc { fill: var(--card); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .rowok { fill: var(--paper); stroke: var(--ok); stroke-width: 1.2; }
.dg-${S} .clash { fill: none; stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .okflow { fill: none; stroke: var(--ok); stroke-width: 1.2; }
.dg-${S} .verdictbad { fill: var(--card); stroke: var(--bad); stroke-width: 1.5; }
.dg-${S} .verdictoff { fill: var(--card); stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Мешает только «много источника на одну цель» — обратный случай законен</text>

<rect class="panebad" x="26" y="44" width="648" height="208" rx="11"/>
<text class="cap t-bad" x="40" y="66" font-size="11" font-weight="600">две строки выгрузки на одну строку справочника</text>
<rect class="rowv" x="40" y="86" width="180" height="28" rx="7"/>
<text class="cap" x="130" y="80" font-size="9.5" text-anchor="middle">цель</text>
<text class="mono" x="130" y="105" font-size="10" text-anchor="middle">sku_draft: MILK-1L</text>
<text class="cap" x="500" y="80" font-size="9.5" text-anchor="middle">источник erp_draft</text>
<rect class="rowsrc" x="366" y="86" width="268" height="24" rx="6"/>
<text class="mono" x="500" y="102" font-size="9.5" text-anchor="middle">'Молоко 3.2% 1л, короб'   · 10</text>
<rect class="rowsrc" x="366" y="116" width="268" height="24" rx="6"/>
<text class="mono" x="500" y="132" font-size="9.5" text-anchor="middle">'Молоко 3.2% 1л, паллета' · 12</text>
<line class="clash" x1="362" y1="98" x2="228" y2="100" marker-end="url(#${S}-arrow-bad)"/>
<line class="clash" x1="362" y1="128" x2="228" y2="106" marker-end="url(#${S}-arrow-bad)"/>
<text class="cap t-bad" x="294" y="133" font-size="10.5" text-anchor="middle">какое из двух</text>
<text class="cap t-bad" x="294" y="148" font-size="10.5" text-anchor="middle">названий записать?</text>

<rect class="verdictbad" x="40" y="160" width="290" height="60" rx="9"/>
<text class="mono t-bad" x="185" y="178" font-size="10" text-anchor="middle" font-weight="700">MERGE</text>
<text class="cap t-bad" x="185" y="194" font-size="9.5" text-anchor="middle">cannot affect row a second time</text>
<text class="cap" x="185" y="209" font-size="9.5" text-anchor="middle">ни одна строка не изменена, откат</text>
<rect class="verdictoff" x="366" y="160" width="268" height="60" rx="9"/>
<text class="mono" x="500" y="178" font-size="10" text-anchor="middle" font-weight="700">UPDATE ... FROM</text>
<text class="cap" x="500" y="194" font-size="9.5" text-anchor="middle">обновлена 1 строка, вторая</text>
<text class="cap" x="500" y="209" font-size="9.5" text-anchor="middle">выброшена молча — какая, решает план</text>
<text class="cap" x="40" y="240" font-size="10.5">Падение здесь — функция, а не дефект: MERGE отказывается угадывать за тебя и требует свернуть источник заранее.</text>

<rect class="paneok" x="26" y="264" width="648" height="148" rx="11"/>
<text class="cap t-ok" x="40" y="286" font-size="11" font-weight="600">одна строка выгрузки на три строки остатка — ошибки нет</text>
<rect class="rowsrc" x="40" y="300" width="200" height="34" rx="7"/>
<text class="mono" x="140" y="321" font-size="10" text-anchor="middle">VALUES ('MILK-1L', 5.000)</text>
${fan}
<text class="cap t-gold" x="40" y="384" font-size="10">каждая строка цели изменена ровно один раз — а это единственное, что MERGE защищает</text>
<text class="cap" x="40" y="399" font-size="10">но ON написан по одному skuid, а ключ dbo.stock — тройка skuid + loc + lot: одна строка переписала три</text>

<line x1="26" y1="428" x2="674" y2="428" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="448" font-size="11">Источник MERGE всегда сворачивают по ключу соединения: GROUP BY, DISTINCT ON или ROW_NUMBER.</text>
<text class="cap" x="26" y="468" font-size="11">Дублей там не может быть ровно до дня, когда в ERP кто-то заведёт второй штрихкод на тот же товар.</text>
<text class="cap" x="26" y="488" font-size="11" font-weight="600">И условие ON должно совпадать с уникальным ключом цели: не «примерно», а совпадать.</text>
`);
}

/* ---------------------------------------------------------------- d8.06 */

// Три способа положить сто тысяч строк и три замера времени. Схема существует
// ради того, что массовая загрузка выигрывает не скоростью, а тем, что не
// платит за каждую строку разбором, планом и подтверждением.
function buildBulkVsInsert() {
  const S = "bulk-vs-insert";
  const chips = ["разбор текста", "построение плана", "проверка типов", "запись в журнал", "подтверждение"];
  const chipAt = (i) => 186 + i * 96;

  const lane = (y, name, sub, time, mode) => {
    const drawn = mode === "copy" ? 2 : 5;
    const cells = chips.slice(0, drawn).map((t, i) => {
      const hot = (mode === "tx" && i === 4) || mode === "copy";
      return `
<rect class="${hot ? "chipok" : "chipv"}" x="${chipAt(i)}" y="${y + 16}" width="88" height="30" rx="7"/>
<text class="cap ${hot ? "t-ok" : ""}" x="${chipAt(i) + 44}" y="${y + 35}" font-size="8.5" text-anchor="middle">${t}</text>`;
    }).join("");
    const stream = mode === "copy" ? `
<rect class="stream" x="${chipAt(2)}" y="${y + 16}" width="280" height="30" rx="7"/>
<text class="cap t-ok" x="${chipAt(2) + 140}" y="${y + 35}" font-size="9.5" text-anchor="middle">дальше строки едут потоком</text>` : "";
    let brace = "";
    if (mode === "each") {
      brace = `
<line class="brace" x1="186" y1="${y + 52}" x2="658" y2="${y + 52}"/>
<text class="cap t-bad" x="422" y="${y + 66}" font-size="9.5" text-anchor="middle">×100 000 — весь конвейер повторяется на каждой строке</text>`;
    } else if (mode === "tx") {
      brace = `
<line class="brace" x1="186" y1="${y + 52}" x2="562" y2="${y + 52}"/>
<text class="cap t-bad" x="374" y="${y + 66}" font-size="9.5" text-anchor="middle">×100 000 — разбор и план никуда не делись</text>
<text class="cap t-ok" x="614" y="${y + 66}" font-size="9.5" text-anchor="middle">один раз</text>`;
    } else {
      brace = `
<text class="cap t-ok" x="282" y="${y + 66}" font-size="9.5" text-anchor="middle">один раз на всю загрузку</text>`;
    }
    return `
<rect class="lanebox" x="26" y="${y}" width="648" height="76" rx="10"/>
<text class="cap" x="42" y="${y + 22}" font-size="10" font-weight="600">${name}</text>
<text class="cap" x="42" y="${y + 36}" font-size="9.5">${sub}</text>
<text class="mono ${mode === "copy" ? "t-ok" : "t-bad"}" x="42" y="${y + 62}" font-size="15" font-weight="700">${time}</text>
${cells}${stream}${brace}`;
  };

  return svgWrap("0 0 700 380", S, "Почему построчная вставка стоит так дорого", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .lanebox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .chipv { fill: var(--sunk); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .chipok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .stream { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.3; stroke-dasharray: 6 4; }
.dg-${S} .brace { stroke: var(--bad); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Сто тысяч одинаковых строк, три способа их положить — и три замера времени</text>
<text class="cap" x="26" y="46" font-size="10.5">локальная машина и SSD; на настоящем сервере с настоящей сетью разрыв только растёт</text>
${lane(58, "сто тысяч INSERT подряд", "каждый сам по себе", "7.43 с", "each")}
${lane(142, "те же сто тысяч INSERT", "внутри одной транзакции", "2.56 с", "tx")}
${lane(226, "\\copy из файла", "одна команда на весь файл", "0.03 с", "copy")}

<line x1="26" y1="322" x2="674" y2="322" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="342" font-size="11">Транзакция вокруг вставок убирает только подтверждение: журнал сбрасывается на диск один раз вместо ста тысяч.</text>
<text class="cap" x="26" y="362" font-size="11">Массовая загрузка выигрывает не тем, что «быстрая», а тем, что не платит за строку — там платят один раз за файл.</text>
`);
}

// Цепочка стейджинга: файл сначала попадает в таблицу, которая обязана принять
// что угодно, и только размеченное годным переливается в боевую. Схема
// существует ради превращения «загрузка упала» в «загружено столько-то,
// вот отчёт по остальному».
function buildStagingChain() {
  const S = "staging-chain";
  const rows = [
    ["MILK-1L", "120.000", "годится", true],
    ["KEFIR-05", "48.000", "годится", true],
    ["BREAD-DARK", "NULL", "количество не заполнено", false],
    ["EGGS-C1", "12,5", "количество не число", false],
    ["SKU-9999", "15.000", "нет такого товара", false],
  ];
  const table = rows.map(([sku, qty, verdict, ok], i) => {
    const y = 290 + i * 21;
    return `
<rect class="${ok ? "rowok" : "rowbad"}" x="40" y="${y}" width="620" height="18" rx="5"/>
<text class="mono" x="52" y="${y + 13}" font-size="9.5">${sku}</text>
<text class="mono" x="160" y="${y + 13}" font-size="9.5">${qty}</text>
<text class="cap ${ok ? "t-ok" : "t-bad"}" x="250" y="${y + 13}" font-size="9.5">${verdict}</text>
${ok ? checkIcon(486, y + 3, 12) : crossIcon(486, y + 3, 12)}
<text class="cap" x="506" y="${y + 13}" font-size="9.5">${ok ? "переливается в боевую таблицу" : "лежит в стейджинге с диагнозом"}</text>`;
  }).join("");

  return svgWrap("0 0 700 492", S, "Стейджинг: файл не грузят прямо в боевую таблицу", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .panebad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; }
.dg-${S} .paneok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.2; }
.dg-${S} .filebox { fill: var(--card); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .strictbox { fill: var(--card); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .stagebox { fill: var(--card); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .errbox { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .rowok { fill: var(--card); stroke: var(--ok); stroke-width: 1.2; }
.dg-${S} .rowbad { fill: var(--card); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .flow { fill: none; stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .hotflow { fill: none; stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Файл от заказчика: пять строк, и в одной из них количество написано через запятую</text>

<rect class="panebad" x="26" y="44" width="648" height="100" rx="11"/>
<text class="cap t-bad" x="40" y="66" font-size="11" font-weight="600">как хочется: сразу в таблицу с настоящими типами</text>
<rect class="filebox" x="40" y="76" width="130" height="36" rx="8"/>
<text class="mono" x="105" y="92" font-size="9.5" text-anchor="middle">stock_inbound.csv</text>
<text class="cap" x="105" y="106" font-size="9" text-anchor="middle">5 строк, одна кривая</text>
<line class="flow" x1="174" y1="94" x2="206" y2="94" marker-end="url(#${S}-arrow)"/>
<rect class="strictbox" x="210" y="76" width="210" height="36" rx="8"/>
<text class="mono" x="315" y="92" font-size="9.5" text-anchor="middle">dbo.stock_in</text>
<text class="cap" x="315" y="106" font-size="9" text-anchor="middle">varchar, decimal(12,3), NOT NULL</text>
<rect class="errbox" x="436" y="72" width="224" height="44" rx="8"/>
<text class="mono t-bad" x="548" y="90" font-size="9" text-anchor="middle">invalid input syntax for numeric:</text>
<text class="mono t-bad" x="548" y="104" font-size="10" text-anchor="middle">"12,5"  · line 6</text>
<text class="cap" x="40" y="134" font-size="10.5">Пять строк, одна кривая — и не загрузилось ничего: COPY неделим и откатывает всю загрузку целиком.</text>

<rect class="paneok" x="26" y="156" width="648" height="262" rx="11"/>
<text class="cap t-accent" x="40" y="178" font-size="11" font-weight="600">1 · стейджинг обязан принять файл целиком, каким бы он ни был</text>
<rect class="filebox" x="40" y="188" width="130" height="56" rx="8"/>
<text class="mono" x="105" y="212" font-size="9.5" text-anchor="middle">stock_inbound.csv</text>
<text class="cap" x="105" y="228" font-size="9" text-anchor="middle">мусор и всё</text>
<line class="hotflow" x1="174" y1="216" x2="206" y2="216" marker-end="url(#${S}-arrow-accent)"/>
<rect class="stagebox" x="210" y="188" width="280" height="56" rx="8"/>
<text class="mono t-accent" x="350" y="206" font-size="9.5" text-anchor="middle">dbo.stock_stage_draft</text>
<text class="cap" x="350" y="221" font-size="8.5" text-anchor="middle">колонки text · ни PK, ни FK, ни NOT NULL</text>
<text class="cap" x="350" y="235" font-size="8.5" text-anchor="middle">ни одного индекса · часто UNLOGGED</text>
<text class="cap" x="504" y="206" font-size="9.5">текст примет любой мусор,</text>
<text class="cap" x="504" y="220" font-size="9.5">а индексы здесь только</text>
<text class="cap" x="504" y="234" font-size="9.5">замедлили бы загрузку</text>

<text class="cap t-accent" x="40" y="270" font-size="11" font-weight="600">2 · разметка: вердикт на каждую строку — ничего не чиним и не удаляем</text>
<text class="cap" x="52" y="284" font-size="9">строка</text>
<text class="cap" x="160" y="284" font-size="9">qty</text>
<text class="cap" x="250" y="284" font-size="9">вердикт</text>
<text class="cap" x="486" y="284" font-size="9">куда она поедет</text>
${table}
<text class="cap" x="40" y="410" font-size="10.5">Две строки из пяти в боевой таблице, три лежат в стейджинге с диагнозом — с ними можно вернуться к заказчику.</text>

<line x1="26" y1="434" x2="674" y2="434" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="454" font-size="11">Проверку на NULL ставят первой: регулярка на NULL даёт не «ложь», а NULL — и строка молча уехала бы в «годится».</text>
<text class="cap" x="26" y="474" font-size="11">Стейджинг превращает «загрузка упала» в «загружено 1 800 000 из 2 000 000, вот отчёт по остальным».</text>
`);
}

/* ---------------------------------------------------------------- d8.07 */

// Один и тот же кусок выката, запущенный дважды: первый прогон делает работу,
// второй не делает ничего. Схема существует ради определения — идемпотентность
// это свойство не команды, а результата: база после второго прогона в том же
// состоянии, что и после первого.
function buildIdemTwoRuns() {
  const S = "idem-two-runs";
  const runs = [
    { y: 52, name: "первый прогон", tone: "hot", rows: [
      ["CREATE TABLE IF NOT EXISTS dbo.qczone_draft", "CREATE TABLE", "таблица создана", true],
      ["INSERT ... ON CONFLICT DO NOTHING", "INSERT 0 1", "строка вставлена", true],
    ] },
    { y: 164, name: "второй прогон — ни строчки не поменяли", tone: "off", rows: [
      ["CREATE TABLE IF NOT EXISTS dbo.qczone_draft", "NOTICE: already exists, skipping", "делать нечего", false],
      ["INSERT ... ON CONFLICT DO NOTHING", "INSERT 0 0", "вставлять нечего", false],
    ] },
  ];
  const body = runs.map((r) => {
    const lines = r.rows.map(([cmd, ans, what, did], i) => {
      const y = r.y + 30 + i * 34;
      return `
<rect class="cmdbox" x="40" y="${y}" width="272" height="26" rx="7"/>
<text class="mono" x="50" y="${y + 17}" font-size="9">${cmd}</text>
<line class="flow" x1="316" y1="${y + 13}" x2="338" y2="${y + 13}" marker-end="url(#${S}-arrow)"/>
<rect class="${did ? "ansdid" : "ansskip"}" x="342" y="${y}" width="230" height="26" rx="7"/>
<text class="mono ${did ? "t-ok" : ""}" x="352" y="${y + 17}" font-size="9">${ans}</text>
<text class="cap ${did ? "t-ok" : ""}" x="582" y="${y + 17}" font-size="9.5">${what}</text>`;
    }).join("");
    return `
<rect class="run-${r.tone}" x="26" y="${r.y}" width="648" height="100" rx="10"/>
<text class="cap ${r.tone === "hot" ? "t-accent" : ""}" x="40" y="${r.y + 20}" font-size="10.5" font-weight="600">${r.name}</text>
${lines}`;
  }).join("");

  const stateBox = (x, label) => `
<text class="cap" x="${x + 100}" y="${292}" font-size="10" text-anchor="middle">${label}</text>
<rect class="statebox" x="${x}" y="300" width="200" height="54" rx="9"/>
<text class="mono" x="${x + 100}" y="${319}" font-size="9.5" text-anchor="middle">dbo.qczone_draft</text>
<rect class="staterow" x="${x + 14}" y="${326}" width="172" height="18" rx="5"/>
<text class="mono" x="${x + 100}" y="${339}" font-size="9" text-anchor="middle">QC · Карантин и проверка</text>`;

  return svgWrap("0 0 700 450", S, "Первый прогон делает работу, второй — ничего", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .run-hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .run-off { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .cmdbox { fill: var(--card); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .ansdid { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .ansskip { fill: var(--card); stroke: var(--line-soft); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .statebox { fill: var(--paper); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .staterow { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1; }
.dg-${S} .flow { fill: none; stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Один и тот же кусок выката, выполненный два раза подряд</text>
${body}

<text class="cap" x="26" y="292" font-size="10.5" font-weight="600">состояние базы:</text>
${stateBox(180, "после первого прогона")}
<text class="mono" x="400" y="334" font-size="20" text-anchor="middle">=</text>
${stateBox(420, "после второго прогона")}

<line x1="26" y1="376" x2="674" y2="376" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="396" font-size="11">Слово skipping в ответе сервера — не ошибка и не жалоба: команда увидела, что делать нечего, и не стала.</text>
<text class="cap" x="26" y="416" font-size="11">Идемпотентный — это не «безошибочный» и не «аккуратно написанный», а повторяемый.</text>
<text class="cap" x="26" y="436" font-size="11">Свойство это не команды, а результата: не знаешь, доехал скрипт или нет, — запусти ещё раз.</text>
`);
}

// Боевой выкат целиком: одна транзакция, внутри неё команды в порядке
// зависимостей, и в каждой — оговорка на повтор. Схема существует ради того,
// что защит здесь две и они не заменяют друг друга: транзакция спасает от
// обрыва посреди выката, оговорки — от второго запуска после успешного первого.
function buildIdemDeployTxn() {
  const S = "idem-deploy-txn";
  const steps = [
    ["CREATE TABLE ", "IF NOT EXISTS", " dbo.qczone_draft", "справочник первым:", "на него будет ссылка"],
    ["CREATE TABLE ", "IF NOT EXISTS", " dbo.qcloc_draft ... REFERENCES", "ссылается на первую —", "значит идёт второй"],
    ["INSERT INTO dbo.qczone_draft ... ", "ON CONFLICT DO NOTHING", "", "сначала строка зоны", ""],
    ["INSERT INTO dbo.qcloc_draft ... ", "ON CONFLICT DO NOTHING", "", "потом строка ячейки:", "иначе внешний ключ не пустит"],
  ];
  const body = steps.map(([a, guard, b, n1, n2], i) => {
    const y = 96 + i * 38;
    return `
<circle class="pos" cx="44" cy="${y + 14}" r="9"/>
<text class="posn" x="44" y="${y + 18}" font-size="9.5" text-anchor="middle">${i + 1}</text>
<rect class="stepbox" x="62" y="${y}" width="358" height="28" rx="7"/>
<text class="mono" x="72" y="${y + 18}" font-size="9">${a}<tspan class="t-accent" font-weight="700">${guard}</tspan>${b}</text>
<text class="cap" x="436" y="${n2 ? y + 12 : y + 18}" font-size="9.5">${n1}</text>
${n2 ? `<text class="cap" x="436" y="${y + 25}" font-size="9.5">${n2}</text>` : ""}`;
  }).join("");

  return svgWrap("0 0 700 472", S, "Весь выкат — одна транзакция", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .frame { fill: var(--sunk); stroke: var(--ok); stroke-width: 1.6; }
.dg-${S} .stepbox { fill: var(--card); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .edge { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .pos { fill: var(--card); stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .posn { fill: var(--accent); font-family: ui-monospace, Menlo, monospace; font-weight: 700; }
.dg-${S} .shield { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Боевой выкат: команды в порядке зависимостей, каждая с оговоркой, и всё это в одной транзакции</text>
<text class="cap" x="26" y="48" font-size="10.5">в PostgreSQL транзакционен и DDL: CREATE TABLE внутри BEGIN ... ROLLBACK исчезает бесследно</text>

<rect class="frame" x="26" y="62" width="648" height="240" rx="12"/>
<rect class="edge" x="40" y="72" width="120" height="24" rx="7"/>
<text class="mono t-ok" x="100" y="89" font-size="11" text-anchor="middle" font-weight="700">BEGIN;</text>
${body}
<rect class="edge" x="40" y="264" width="120" height="24" rx="7"/>
<text class="mono t-ok" x="100" y="281" font-size="11" text-anchor="middle" font-weight="700">COMMIT;</text>
<text class="cap" x="176" y="281" font-size="9.5">оборвалось на середине — откатятся все команды разом, половины не будет</text>

<text class="cap" x="26" y="326" font-size="11" font-weight="600">Защит здесь две, и они не заменяют друг друга</text>
<rect class="shield" x="26" y="336" width="316" height="62" rx="10"/>
<text class="mono t-ok" x="184" y="356" font-size="10.5" text-anchor="middle" font-weight="700">BEGIN ... COMMIT</text>
<text class="cap" x="184" y="372" font-size="9.5" text-anchor="middle">спасает от обрыва посреди выката:</text>
<text class="cap" x="184" y="386" font-size="9.5" text-anchor="middle">упал VPN на двадцатой команде из сорока</text>
<rect class="shield" x="358" y="336" width="316" height="62" rx="10"/>
<text class="mono t-accent" x="516" y="356" font-size="10.5" text-anchor="middle" font-weight="700">IF NOT EXISTS · ON CONFLICT</text>
<text class="cap" x="516" y="372" font-size="9.5" text-anchor="middle">спасают от второго запуска —</text>
<text class="cap" x="516" y="386" font-size="9.5" text-anchor="middle">уже после успешного первого</text>

<line x1="26" y1="418" x2="674" y2="418" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="438" font-size="11">Порядок внутри не свободный: справочник создаётся и наполняется раньше того, кто на него ссылается.</text>
<text class="cap" x="26" y="458" font-size="11">Откат пишется наоборот, снизу вверх: сначала DROP зависимой, потом справочника — дом разбирают с крыши.</text>
`);
}

/* ---------------------------------------------------------------- реестр */

export const REGISTRY = {
  "insert-parts": {
    id: "insert-parts",
    title: "Три части INSERT и порядок сборки строки",
    caption: "Куда кладём, в какие колонки, что кладём. Значения ложатся по позиции: первое — в первую названную колонку. Ниже — что движок успевает сделать до того, как строка окажется в таблице.",
    anchor: "Что здесь произошло",
    svg: buildInsertParts(),
  },
  "insert-by-position": {
    id: "insert-by-position",
    title: "Без списка колонок значения держатся за позицию",
    caption: "Одна и та же вставка до правки таблицы и после неё. Колонку note выбросили, четвёртое место заняла barcode — и комментарий «от поставщика» лёг в штрихкод. Ошибки при этом не было ни одной.",
    anchor: "Список колонок пишут всегда",
    svg: buildInsertByPosition(),
  },
  "insert-upsert-fork": {
    id: "insert-upsert-fork",
    title: "Строка уже есть: четыре исхода одной команды",
    caption: "Ключа в таблице нет — строка просто вставляется. Ключ есть — дальше решает приписка: без неё команда падает, DO NOTHING пропускает строку, DO UPDATE правит названные колонки значениями из EXCLUDED.",
    anchor: "Строка уже есть: ON CONFLICT",
    svg: buildInsertUpsertFork(),
  },
  "update-parts": {
    id: "update-parts",
    title: "SET считает от старых значений и пишет разом",
    caption: "Какую таблицу меняем, какие строки, что в них станет другим. Правые части всех присваиваний читают один снимок строки до правки — поэтому из остатка вычлось честное 12, хотя обнуление резерва стоит ниже.",
    anchor: "Что здесь произошло",
    svg: buildUpdateParts(),
  },
  "update-from-shapes": {
    id: "update-from-shapes",
    title: "UPDATE ... FROM: кто меняется, кто только читается",
    caption: "Приёмник ровно один — та таблица, что названа после UPDATE. Всё, что стоит после FROM, только источник. А связь между ними и обычный отбор лежат в одном WHERE вперемешку.",
    anchor: "Значения приходят из другой таблицы",
    svg: buildUpdateFromShapes(),
  },
  "update-multi-match": {
    id: "update-multi-match",
    title: "Два совпадения на одну строку — движок берёт любое",
    caption: "Сверху связь сошлась у каждой пары, и в одну колонку просятся два разных числа: движок берёт одно на свой выбор, а второе выбрасывает молча. Снизу источник свёрнут по ключу, и результат перестал зависеть от плана.",
    anchor: "Мина формы с FROM: справа несколько строк",
    svg: buildUpdateMultiMatch(),
  },
  "delete-parts": {
    id: "delete-parts",
    title: "У DELETE две части, и вторая важнее первой",
    caption: "Из какой таблицы и какие строки. Списка колонок нет — уходит строка целиком; SET нет — настраивать нечего. А тот же WHERE стоит сначала прогнать SELECT-ом: после DELETE пересчитывать будет нечего.",
    anchor: "Что здесь произошло",
    svg: buildDeleteParts(),
  },
  "delete-vs-truncate": {
    id: "delete-vs-truncate",
    title: "DELETE ходит по строкам, TRUNCATE подменяет файл",
    caption: "Итог у обеих команд один — строк ноль. Но DELETE провёл каждую строку через журнал, триггеры и внешние ключи и оставил файл на месте, а TRUNCATE отцепил страницы разом и завёл таблице новый пустой файл.",
    anchor: "TRUNCATE выносит всю таблицу разом",
    svg: buildDeleteVsTruncate(),
  },
  "delete-drop-ladder": {
    id: "delete-drop-ladder",
    title: "DELETE, TRUNCATE, DROP: три ступени",
    caption: "Три одинаковых таблицы и три команды. Уходят названные строки, все строки и сам объект — это разные потери, а не одно и то же посильнее. Третья ступень уже DDL: она меняет схему, а не данные.",
    anchor: "DELETE, TRUNCATE, DROP: три ступени",
    svg: buildDeleteDropLadder(),
  },
  "returning-tail": {
    id: "returning-tail",
    title: "RETURNING отдаёт то, что реально легло",
    caption: "Хвост, дописанный к команде, а не второй проход по таблице. Наружу уходит достроенная строка — с ключом, который выдал счётчик, и статусом, который подставил DEFAULT: про них в команде не было ни слова.",
    anchor: "Что здесь произошло",
    svg: buildReturningTail(),
  },
  "returning-move": {
    id: "returning-move",
    title: "Перенос в архив одной командой",
    caption: "Сверху три шага с паузой посередине: упало в паузе — строки останутся и там и там или пропадут совсем. Снизу DELETE отдаёт удалённые строки прямо в INSERT: либо переехало всё, либо не переехало ничего.",
    anchor: "Перенести строки в архив, не разложив их по дороге",
    svg: buildReturningMove(),
  },
  "output-two-tables": {
    id: "output-two-tables",
    title: "OUTPUT знает обе версии строки",
    caption: "В T-SQL клауза стоит в середине команды и читает две псевдотаблицы: deleted — строка до изменения, inserted — она же после. Ниже — у какой команды какая из них есть.",
    anchor: "То же самое в SQL Server",
    svg: buildOutputTwoTables(),
  },
  "merge-branches": {
    id: "merge-branches",
    title: "Три зоны MERGE и кто в них попадает",
    caption: "Движок соединяет цель с источником по ON и раскладывает строки на три зоны: есть и там и там, есть только в источнике, есть только в цели. В каждой зоне разрешено своё, и выбирает зону условие, а не автор.",
    anchor: "Что здесь произошло",
    svg: buildMergeBranches(),
  },
  "merge-cardinality": {
    id: "merge-cardinality",
    title: "Мощность источника: когда MERGE падает и когда молчит",
    caption: "Две строки источника на одну строку цели валят весь оператор с ошибкой 21000, тогда как UPDATE ... FROM молча берёт любую. А одна строка источника на три строки цели проходит без единого звука — и смысл получается не тот.",
    anchor: "Один ключ, две строки в источнике",
    svg: buildMergeCardinality(),
  },
  "bulk-vs-insert": {
    id: "bulk-vs-insert",
    title: "Почему построчная вставка стоит так дорого",
    caption: "Сто тысяч строк тремя способами. Транзакция вокруг INSERT убирает только подтверждение, а массовая загрузка снимает и разбор с планом: за файл платят один раз, а не за каждую строку.",
    anchor: "Что здесь произошло",
    svg: buildBulkVsInsert(),
  },
  "staging-chain": {
    id: "staging-chain",
    title: "Стейджинг: файл не грузят прямо в боевую таблицу",
    caption: "Сверху загрузка сразу в строгие типы: одна кривая ячейка — и не загрузилось ничего. Снизу файл сначала попадает в таблицу, которая примет что угодно, там каждой строке вешают вердикт, и в боевую едет только годное.",
    anchor: "Стейджинг: почему файл не грузят прямо в боевую таблицу",
    svg: buildStagingChain(),
  },
  "idem-two-runs": {
    id: "idem-two-runs",
    title: "Первый прогон делает работу, второй — ничего",
    caption: "Один и тот же кусок выката, выполненный дважды. На повторе CREATE отвечает skipping, INSERT возвращает ноль строк — и состояние базы после второго прогона такое же, как после первого.",
    anchor: "Что здесь произошло",
    svg: buildIdemTwoRuns(),
  },
  "idem-deploy-txn": {
    id: "idem-deploy-txn",
    title: "Весь выкат — одна транзакция",
    caption: "Команды идут в порядке зависимостей, у каждой своя оговорка на повтор, и всё это завёрнуто в BEGIN ... COMMIT. Транзакция спасает от обрыва посреди выката, оговорки — от второго запуска: нужны обе.",
    anchor: "Весь выкат — одна транзакция",
    svg: buildIdemDeployTxn(),
  },
  "delete-batches": {
    id: "delete-batches",
    title: "Одна большая транзакция против коротких пачек",
    caption: "Сверху одна команда держит транзакцию открытой сорок минут: журнал растёт, блокировки эскалируют, откат идёт дольше самой работы. Снизу короткие пачки с COMMIT — и зазоры, в которые проходят чужие запросы.",
    anchor: "Миллионы строк одной командой удалять нельзя",
    svg: buildDeleteBatches(),
  },
};

// Привязка схем к нодам: код ноды -> список id.
export const INDEX = {
  "d8.01": ["insert-parts", "insert-by-position", "insert-upsert-fork"],
  "d8.02": ["update-parts", "update-from-shapes", "update-multi-match"],
  "d8.03": ["delete-parts", "delete-vs-truncate", "delete-drop-ladder", "delete-batches"],
  "d8.04": ["returning-tail", "returning-move", "output-two-tables"],
  "d8.05": ["merge-branches", "merge-cardinality"],
  "d8.06": ["bulk-vs-insert", "staging-chain"],
  "d8.07": ["idem-two-runs", "idem-deploy-txn"],
};
