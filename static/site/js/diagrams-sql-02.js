// diagrams-sql-02.js
// Схемы этапов 1-2 раздела DBA: анатомия SELECT, фильтрация, NULL, шаблоны,
// сортировка, CASE, приведение типов.

import { arrowDefs, checkIcon, crossIcon, svgWrap } from "./diagrams-sql-kit.js";

/* ---------------------------------------------------------------- d2.01 */

// Логический порядок выполнения SELECT: слева то, как запрос пишут, справа —
// в каком порядке ступени отрабатывают. Схема существует ради одной мысли:
// SELECT стоит в тексте первым, а выполняется предпоследним, и отсюда растёт
// вся история про «алиас не виден в WHERE, но виден в ORDER BY».
function buildSelectPipeline() {
  const S = "select-pipeline";
  const written = ["SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT"];
  // Порядок выполнения и то, чем ступень занята.
  const run = [
    ["FROM", "взять таблицу"],
    ["WHERE", "выбросить строки"],
    ["GROUP BY", "собрать в группы"],
    ["HAVING", "выбросить группы"],
    ["SELECT", "посчитать колонки"],
    ["ORDER BY", "разложить по порядку"],
    ["LIMIT", "отрезать хвост"],
  ];

  const leftCol = written.map((w, i) => {
    const y = 92 + i * 34;
    const hot = w === "SELECT";
    return `<rect class="${hot ? "hot" : "step"}" x="34" y="${y}" width="132" height="26" rx="7"/>
<text class="mono" x="100" y="${y + 18}" font-size="12" text-anchor="middle">${w}</text>`;
  }).join("\n");

  const rightCol = run.map(([w, what], i) => {
    const y = 92 + i * 34;
    const hot = w === "SELECT";
    return `<rect class="${hot ? "hot" : "step"}" x="330" y="${y}" width="132" height="26" rx="7"/>
<text class="mono" x="396" y="${y + 18}" font-size="12" text-anchor="middle">${w}</text>
<text class="cap" x="478" y="${y + 18}" font-size="11">${what}</text>`;
  }).join("\n");

  // Ниточки от места в тексте к месту в исполнении.
  const links = written.map((w, i) => {
    const from = 92 + i * 34 + 13;
    const to = 92 + run.findIndex(([r]) => r === w) * 34 + 13;
    const hot = w === "SELECT";
    return `<path class="${hot ? "hotwire" : "wire"}" d="M170,${from} C240,${from} 256,${to} 326,${to}"/>`;
  }).join("\n");

  return svgWrap("0 0 700 380", S, "Порядок написания и порядок выполнения", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .step { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .wire { fill: none; stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .hotwire { fill: none; stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="cap" x="34" y="56" font-size="12" font-weight="600">как ты это пишешь</text>
<text class="cap" x="330" y="56" font-size="12" font-weight="600">в каком порядке это выполняется</text>
<text class="cap" x="34" y="74" font-size="10.5">сверху вниз по тексту запроса</text>
<text class="cap" x="330" y="74" font-size="10.5">сверху вниз по времени</text>

${links}
${leftCol}
${rightCol}

<line x1="34" y1="348" x2="666" y2="348" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="34" y="368" font-size="11">SELECT написан первым, а выполняется пятым. Поэтому имя из него в WHERE ещё не существует, а в ORDER BY — уже да.</text>
`);
}

/* ---------------------------------------------------------------- d2.03 */

// WHERE как турникет: строки идут по одной, предикат пропускает или не пропускает.
// Смысл схемы — что фильтр работает построчно и ДО того, как SELECT что-то посчитает.
function buildWhereGate() {
  const S = "where-gate";
  const rows = [
    ["1", "PICKED", "16 июля", false],
    ["2", "NEW", "16 июля", true],
    ["3", "PICKING", "17 июля", true],
    ["4", "NEW", "17 июля", true],
    ["5", "NEW", "17 июля", true],
    ["6", "SHIPPED", "15 июля", false],
  ];
  const left = rows.map((r, i) => {
    const y = 74 + i * 40;
    return `<rect class="row" x="30" y="${y}" width="180" height="30" rx="7"/>
<text class="mono" x="44" y="${y + 20}" font-size="12.5">${r[0]}</text>
<text class="mono cap" x="70" y="${y + 20}" font-size="11.5">${r[1]}</text>
<text class="cap" x="150" y="${y + 20}" font-size="11">${r[2]}</text>
<line class="flow" x1="212" y1="${y + 15}" x2="288" y2="${y + 15}" marker-end="url(#${S}-arrow)"/>`;
  }).join("\n");

  let passed = 0;
  const right = rows.map((r, i) => {
    const y = 74 + i * 40;
    if (!r[3]) {
      return `${crossIcon(404, y + 8, 15)}
<text class="cap bad" x="430" y="${y + 20}" font-size="11.5">не прошла</text>`;
    }
    const ty = 74 + passed * 40;
    passed += 1;
    return `${checkIcon(404, y + 8, 15)}
<line class="pass" x1="430" y1="${y + 15}" x2="536" y2="${ty + 15}" marker-end="url(#${S}-arrow-accent)"/>
<rect class="out" x="540" y="${ty}" width="130" height="30" rx="7"/>
<text class="mono" x="554" y="${ty + 20}" font-size="12.5">${r[0]}</text>
<text class="mono cap" x="578" y="${ty + 20}" font-size="11.5">${r[1]}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 330", S, "WHERE пропускает строки по одной", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .bad { fill: var(--bad); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .out { fill: var(--paper); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .gate { fill: var(--sunk); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pass { stroke: var(--accent); stroke-width: 1.3; }
</style>

<text class="cap" x="30" y="52" font-size="12">dbo.orders — все строки</text>
<text class="cap" x="540" y="52" font-size="12">результат</text>
${left}

<rect class="gate" x="292" y="60" width="108" height="238" rx="12"/>
<text class="mono" x="346" y="90" font-size="12.5" font-weight="700" text-anchor="middle">WHERE</text>
<text class="cap" x="346" y="128" font-size="10.5" text-anchor="middle">дата в окне</text>
<text class="cap" x="346" y="146" font-size="10.5" text-anchor="middle">И</text>
<text class="cap" x="346" y="164" font-size="10.5" text-anchor="middle">статус NEW</text>
<text class="cap" x="346" y="182" font-size="10.5" text-anchor="middle">ИЛИ PICKING</text>
<text class="cap" x="346" y="228" font-size="10.5" text-anchor="middle">решение</text>
<text class="cap" x="346" y="244" font-size="10.5" text-anchor="middle">принимается</text>
<text class="cap" x="346" y="260" font-size="10.5" text-anchor="middle">для каждой</text>
<text class="cap" x="346" y="276" font-size="10.5" text-anchor="middle">строки отдельно</text>
${right}

<text class="cap" x="30" y="322" font-size="11">SELECT ещё не работал: он посчитает колонки только у тех строк, что дошли справа</text>
`);
}

// Дерево приоритета: одно и то же условие, свёрнутое двумя способами.
// Слева — как читает человек, справа — как сворачивает сервер.
function buildAndOrTree() {
  const S = "and-or-tree";
  return svgWrap("0 0 700 330", S, "AND сильнее OR", `
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

<text class="mono" x="30" y="34" font-size="13" font-weight="700">дата ≥ 16  AND  статус = NEW  OR  статус = PICKING</text>
<text class="cap" x="30" y="54" font-size="11.5">одна и та же строка условия — два разных смысла</text>
<line class="split" x1="350" y1="72" x2="350" y2="316"/>

<text class="cap" x="30" y="94" font-size="12" font-weight="600">как слышится человеку</text>
<rect class="node" x="96" y="108" width="120" height="30" rx="8"/>
<text class="mono" x="156" y="128" font-size="12.5" text-anchor="middle">AND</text>
<line class="edge" x1="130" y1="138" x2="80" y2="178"/>
<line class="edge" x1="182" y1="138" x2="228" y2="178"/>
<rect class="leaf" x="26" y="180" width="108" height="30" rx="8"/>
<text class="mono" x="80" y="200" font-size="11.5" text-anchor="middle">дата ≥ 16</text>
<rect class="node" x="172" y="180" width="112" height="30" rx="8"/>
<text class="mono" x="228" y="200" font-size="12.5" text-anchor="middle">OR</text>
<line class="edge" x1="204" y1="210" x2="176" y2="250"/>
<line class="edge" x1="252" y1="210" x2="284" y2="250"/>
<rect class="leaf" x="126" y="252" width="100" height="30" rx="8"/>
<text class="mono" x="176" y="272" font-size="11" text-anchor="middle">= NEW</text>
<rect class="leaf" x="236" y="252" width="104" height="30" rx="8"/>
<text class="mono" x="288" y="272" font-size="11" text-anchor="middle">= PICKING</text>
<text class="cap" x="30" y="306" font-size="11">«за 16-е, и статус любой из двух» — 1 строка</text>

<text class="cap" x="380" y="94" font-size="12" font-weight="600">как сворачивает сервер</text>
<rect class="hot" x="446" y="108" width="120" height="30" rx="8"/>
<text class="mono" x="506" y="128" font-size="12.5" text-anchor="middle">OR</text>
<line class="hotedge" x1="480" y1="138" x2="440" y2="178"/>
<line class="hotedge" x1="532" y1="138" x2="590" y2="178"/>
<rect class="hot" x="380" y="180" width="120" height="30" rx="8"/>
<text class="mono" x="440" y="200" font-size="12.5" text-anchor="middle">AND</text>
<line class="hotedge" x1="414" y1="210" x2="392" y2="250"/>
<line class="hotedge" x1="466" y1="210" x2="492" y2="250"/>
<rect class="leaf" x="340" y="252" width="104" height="30" rx="8"/>
<text class="mono" x="392" y="272" font-size="11" text-anchor="middle">дата ≥ 16</text>
<rect class="leaf" x="446" y="252" width="96" height="30" rx="8"/>
<text class="mono" x="494" y="272" font-size="11" text-anchor="middle">= NEW</text>
<rect class="leaf" x="546" y="180" width="118" height="30" rx="8"/>
<text class="mono" x="605" y="200" font-size="11" text-anchor="middle">= PICKING</text>
<text class="cap" x="380" y="306" font-size="11">«NEW за 16-е ИЛИ PICKING когда угодно» — 2 строки</text>
`);
}

/* ---------------------------------------------------------------- d2.04 */

// Трёхзначная логика на трёх строках: один и тот же предикат даёт TRUE, FALSE
// и UNKNOWN, а турникет WHERE открывается только на TRUE. Схема существует
// ради того, чтобы стало видно: «не TRUE» и «FALSE» — разные вещи, а строка
// с NULL пропадает молча, потому что для WHERE они неразличимы.
function buildNullGate() {
  const S = "null-gate";
  // skuid, вес, предикат с подставленным значением, исход, цвет исхода, прошла ли
  const rows = [
    ["MILK-1L", "1.030", "1.030 &lt;&gt; 1.030", "FALSE", "bad", false, "отброшена"],
    ["BREAD-DARK", "0.400", "0.400 &lt;&gt; 1.030", "TRUE", "ok", true, "прошла"],
    ["APPLE-KG", "NULL", "NULL &lt;&gt; 1.030", "UNKNOWN", "gold", false, "отброшена"],
  ];

  const body = rows.map(([sku, w, pred, verdict, tone, pass, mark], i) => {
    const top = 91 + i * 57;
    const cy = top + 17;
    const isNull = w === "NULL";
    const gate = pass
      ? `<line class="pass" x1="474" y1="${cy}" x2="560" y2="${cy}" marker-end="url(#${S}-arrow-accent)"/>`
      : `<line class="stop" x1="474" y1="${cy}" x2="490" y2="${cy}"/>
<rect class="gatebar" x="492" y="${cy - 3}" width="44" height="6" rx="3"/>`;
    return `<rect class="row" x="26" y="${top}" width="148" height="34" rx="8"/>
<text class="mono" x="36" y="${cy + 4}" font-size="11">${sku}</text>
<rect class="${isNull ? "nullcell" : "cell"}" x="114" y="${top + 7}" width="50" height="20" rx="5"/>
<text class="mono ${isNull ? "t-gold" : ""}" x="139" y="${cy + 4}" font-size="11" text-anchor="middle">${w}</text>
<line class="flow" x1="178" y1="${cy}" x2="200" y2="${cy}" marker-end="url(#${S}-arrow)"/>
<rect class="pred" x="204" y="${top}" width="124" height="34" rx="8"/>
<text class="mono" x="266" y="${cy + 4}" font-size="11" text-anchor="middle">${pred}</text>
<line class="flow" x1="332" y1="${cy}" x2="354" y2="${cy}" marker-end="url(#${S}-arrow)"/>
<rect class="pill p-${tone}" x="358" y="${top}" width="86" height="34" rx="8"/>
<text class="t-${tone}" x="401" y="${cy + 4}" font-size="11.5" font-weight="700" text-anchor="middle">${verdict}</text>
<line class="flow" x1="448" y1="${cy}" x2="468" y2="${cy}" marker-end="url(#${S}-arrow)"/>
<line class="post" x1="492" y1="${cy - 14}" x2="492" y2="${cy + 14}"/>
<line class="post" x1="536" y1="${cy - 14}" x2="536" y2="${cy + 14}"/>
${gate}
${pass ? checkIcon(568, cy - 7, 14) : crossIcon(568, cy - 7, 14)}
<text class="cap ${pass ? "t-ok" : "t-bad"}" x="594" y="${cy + 4}" font-size="11">${mark}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 360", S, "WHERE открывается только на TRUE", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .cell { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .nullcell { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.1; stroke-dasharray: 3 3; }
.dg-${S} .pred { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pill { stroke-width: 1.5; }
.dg-${S} .p-ok { fill: var(--ok-soft); stroke: var(--ok); }
.dg-${S} .p-bad { fill: var(--bad-soft); stroke: var(--bad); }
.dg-${S} .p-gold { fill: var(--gold-soft); stroke: var(--gold); }
.dg-${S} .gate { fill: var(--sunk); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pass { stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .stop { stroke: var(--muted); stroke-width: 1.2; }
.dg-${S} .post { stroke: var(--muted); stroke-width: 2; stroke-linecap: round; }
.dg-${S} .gatebar { fill: var(--bad); }
</style>

<text class="mono" x="26" y="32" font-size="13" font-weight="700">WHERE weight &lt;&gt; 1.030</text>
<text class="cap" x="26" y="52" font-size="11.5">три строки справочника — три разных исхода, а вовсе не два</text>

<rect class="gate" x="472" y="88" width="84" height="156" rx="12"/>
<text class="cap" x="26" y="80" font-size="10.5">строка</text>
<text class="cap" x="266" y="80" font-size="10.5" text-anchor="middle">что дал предикат</text>
<text class="cap" x="401" y="80" font-size="10.5" text-anchor="middle">исход</text>
<text class="mono" x="514" y="80" font-size="12" font-weight="700" text-anchor="middle">WHERE</text>
${body}
<text class="cap" x="514" y="262" font-size="10.5" text-anchor="middle">открыт только на TRUE</text>

<line x1="26" y1="286" x2="674" y2="286" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="308" font-size="11">Турникет открывается на TRUE — не «на всём, что не FALSE», а именно на TRUE.</text>
<text class="cap" x="26" y="328" font-size="11">FALSE значит «вес точно другой». UNKNOWN — «про вес ничего не известно». Для WHERE это одно и то же.</text>
<text class="cap" x="26" y="348" font-size="11">Ошибки нет, подчёркивания нет: строка с NULL просто молча не доходит до результата.</text>
`);
}

/* ---------------------------------------------------------------- d2.05 */

// Шаблон LIKE, приложенный к строке посимвольно: видно, какой кусок съел
// процент, а какой — подчёркивание. Схема существует ради двух мыслей:
// «%» торгуется по длине и может съесть пустоту, а «_» не торгуется вовсе,
// и при этом шаблон обязан покрыть строку целиком.
function buildLikeMask() {
  const S = "like-mask";
  const CW = 28, X0 = 126;
  const src = ["M", "I", "L", "K", "-", "1", "L"];
  const px = (i) => X0 + i * CW;

  // Каждая маска разложена на куски: что именно съел каждый символ шаблона.
  const masks = [
    { p: "'MILK%'", ok: true, note: "подошла — % съел «-1L»",
      seg: [["lit", 0, 4, "MILK"], ["pct", 4, 7, "%"]] },
    { p: "'%1L'", ok: true, note: "подошла — % съел «MILK-»",
      seg: [["pct", 0, 5, "%"], ["lit", 5, 7, "1L"]] },
    { p: "'MILK-1L%'", ok: true, note: "подошла — % съел пустоту, и это законно",
      seg: [["lit", 0, 7, "MILK-1L"], ["zero", 7, 7, "%"]] },
    { p: "'MILK_1L'", ok: true, note: "подошла — _ взял ровно один символ",
      seg: [["lit", 0, 4, "MILK"], ["und", 4, 5, "_"], ["lit", 5, 7, "1L"]] },
    { p: "'MILK__1L'", ok: false, note: "не подошла — двум _ нужно два символа",
      seg: [["lit", 0, 4, "MILK"], ["und", 4, 5, "_"], ["und", 5, 6, "_"], ["ghost", 6, 8, "1L"]] },
    { p: "'MILK'", ok: false, note: "не подошла — хвост строки никто не покрыл",
      seg: [["lit", 0, 4, "MILK"], ["uncov", 4, 7, "не покрыто"]] },
  ];

  // Короткие риски в зазоре: они связывают клетки строки со столбцами ниже.
  const guides = src.concat(["|"]).map((_, i) =>
    `<line class="guide" x1="${px(i)}" y1="95" x2="${px(i)}" y2="105"/>`).join("\n");

  const strip = src.map((ch, i) =>
    `<rect class="cell" x="${px(i)}" y="62" width="${CW}" height="30" rx="6"/>
<text class="mono" x="${px(i) + CW / 2}" y="82" font-size="13" text-anchor="middle">${ch}</text>`).join("\n");

  const body = masks.map((m, i) => {
    const top = 108 + i * 36;
    const cy = top + 13;
    const seg = m.seg.map(([kind, a, b, label]) => {
      if (kind === "zero") {
        return `<rect class="s-zero" x="${px(7)}" y="${top}" width="16" height="26" rx="5"/>
<text class="mono t-accent" x="${px(7) + 8}" y="${cy + 4}" font-size="11" text-anchor="middle">%</text>`;
      }
      const x = px(a), w = (b - a) * CW;
      const big = kind === "pct" || kind === "und";
      return `<rect class="s-${kind}" x="${x}" y="${top}" width="${w}" height="26" rx="5"/>
<text class="${kind === "uncov" ? "cap t-bad" : "mono"} ${kind === "pct" ? "t-accent" : ""}${kind === "und" ? "t-gold" : ""}${kind === "ghost" ? "t-bad" : ""}" x="${x + w / 2}" y="${cy + 4}" font-size="${big ? 13 : kind === "uncov" ? 10 : 11}" ${big ? 'font-weight="700"' : ""} text-anchor="middle">${label}</text>`;
    }).join("\n");
    return `<text class="mono" x="26" y="${cy + 4}" font-size="12">${m.p}</text>
${seg}
${m.ok ? checkIcon(372, cy - 7, 14) : crossIcon(372, cy - 7, 14)}
<text class="cap" x="394" y="${cy + 4}" font-size="11">${m.note}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 392", S, "Как шаблон LIKE ложится на строку", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .cell { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .guide { stroke: var(--line); stroke-width: 1; }
.dg-${S} .s-lit { fill: var(--sunk); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .s-pct { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .s-und { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .s-zero { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.2; stroke-dasharray: 3 3; }
.dg-${S} .s-ghost { fill: none; stroke: var(--bad); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .s-uncov { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; stroke-dasharray: 4 3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Шаблон обязан покрыть строку целиком — от первого символа до последнего</text>
<text class="cap" x="26" y="52" font-size="10.5">шаблон</text>
<text class="cap" x="224" y="52" font-size="10.5" text-anchor="middle">строка и то, чем её покрыли</text>
<text class="cap" x="372" y="52" font-size="10.5">итог</text>

${guides}
${strip}
${body}

<line x1="26" y1="336" x2="674" y2="336" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="358" font-size="11">% съедает любое количество символов, в том числе ноль. _ съедает ровно один — ни больше, ни меньше.</text>
<text class="cap" x="26" y="378" font-size="11">Поэтому % торгуется по длине, а _ считает символы поштучно.</text>
`);
}

/* ---------------------------------------------------------------- d2.06 */

// Два пути одной и той же выборки: с ORDER BY и без. Схема существует ради
// того, чтобы стало видно, что порядок — это отдельная ступень запроса,
// а не свойство таблицы: не написал ORDER BY — не получил никаких обещаний.
function buildOrderByLast() {
  const S = "order-by-last";
  const raw = ["MILK-1L", "KEFIR-05", "BREAD-DARK", "SUGAR-1KG", "APPLE-KG"];
  const sorted = ["APPLE-KG", "BREAD-DARK", "KEFIR-05", "MILK-1L", "SUGAR-1KG"];

  const list = (x, y0, items, cls) => items.map((v, i) => {
    const y = y0 + i * 24;
    return `<rect class="${cls}" x="${x}" y="${y}" width="124" height="20" rx="6"/>
<text class="mono" x="${x + 12}" y="${y + 14}" font-size="11">${v}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 446", S, "ORDER BY — отдельная ступень, а не свойство таблицы", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .hotword { fill: var(--accent); font-weight: 700; }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .rowok { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .loose { fill: var(--paper); stroke: var(--muted); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .step { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .nostep { fill: var(--sunk); stroke: var(--muted); stroke-width: 1.2; stroke-dasharray: 5 4; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .hotflow { stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="mono" x="26" y="32" font-size="12">FROM → WHERE → SELECT → <tspan class="hotword">ORDER BY</tspan> → LIMIT</text>
<text class="cap" x="26" y="52" font-size="11">Предпоследняя ступень: раскладывают не таблицу, а то, что от неё осталось к концу запроса.</text>

<text class="cap" x="26" y="78" font-size="11.5" font-weight="600">путь 1 — с ORDER BY skuid</text>
<text class="cap" x="364" y="78" font-size="10.5">на выходе — ровно то, что просили</text>
${list(26, 90, raw, "row")}
<rect class="step" x="198" y="86" width="118" height="124" rx="10"/>
<text class="mono" x="257" y="144" font-size="12" font-weight="700" text-anchor="middle">ORDER BY</text>
<text class="mono" x="257" y="162" font-size="11" text-anchor="middle">skuid</text>
<line class="flow" x1="154" y1="148" x2="194" y2="148" marker-end="url(#${S}-arrow)"/>
<line class="hotflow" x1="320" y1="148" x2="360" y2="148" marker-end="url(#${S}-arrow-accent)"/>
${list(364, 90, sorted, "rowok")}
<text class="cap" x="502" y="122" font-size="10.5">порядок задан явно</text>
<text class="cap" x="502" y="138" font-size="10.5">и повторится всегда:</text>
<text class="cap" x="502" y="154" font-size="10.5">хоть завтра, хоть через год</text>

<text class="cap" x="26" y="234" font-size="11.5" font-weight="600">путь 2 — без ORDER BY</text>
<text class="cap" x="364" y="234" font-size="10.5">на выходе — что движку удобнее</text>
${list(26, 246, raw, "row")}
<rect class="nostep" x="198" y="242" width="118" height="124" rx="10"/>
<text class="mono" x="257" y="298" font-size="12" text-anchor="middle">ORDER BY</text>
<text class="cap" x="257" y="316" font-size="10.5" text-anchor="middle">не написан</text>
<line class="flow" x1="154" y1="304" x2="194" y2="304" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="320" y1="304" x2="360" y2="304" marker-end="url(#${S}-arrow)"/>
${list(364, 246, raw, "loose")}
<text class="cap" x="502" y="278" font-size="10.5">порядок не обещан вообще</text>
<text class="cap" x="502" y="294" font-size="10.5">сегодня такой, завтра другой</text>
<text class="cap" x="502" y="310" font-size="10.5">новый индекс, другой план —</text>
<text class="cap" x="502" y="326" font-size="10.5">и список приедет иным</text>

<line x1="26" y1="390" x2="674" y2="390" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="412" font-size="11">Стабильный порядок без ORDER BY — не свойство базы, а везение: движок читает строки как ему удобнее.</text>
<text class="cap" x="26" y="432" font-size="11">Порядок важен — пиши ORDER BY. Не важен — не пиши. Третьего варианта, «и так работает», не бывает.</text>
`);
}

/* ---------------------------------------------------------------- d2.08 */

// CASE как лестница: движок идёт по веткам сверху вниз и останавливается на
// первой подошедшей. Схема существует ради двух вещей — что ветки ниже
// сработавшей не смотрятся вообще и что без ELSE непопадание даёт NULL молча.
function buildCaseLadder() {
  const S = "case-ladder";
  // условие ветки, значение THEN, состояние: miss — проверено и мимо,
  // hit — сработала, skip — до неё дело не дошло
  const branches = [
    ["WHEN 'NEW'", "THEN 'Новый'", "miss"],
    ["WHEN 'PICKING'", "THEN 'В отборе'", "miss"],
    ["WHEN 'PICKED'", "THEN 'Отобран'", "hit"],
    ["WHEN 'SHIPPED'", "THEN 'Отгружен'", "skip"],
  ];

  const body = branches.map(([when, then, st], i) => {
    const top = 92 + i * 52;
    const cy = top + 16;
    const boxCls = st === "hit" ? "hot" : st === "skip" ? "off" : "step";
    const icon = st === "hit" ? checkIcon(94, cy - 7, 14)
      : st === "miss" ? crossIcon(94, cy - 7, 14)
      : `<line class="dash" x1="94" y1="${cy}" x2="108" y2="${cy}"/>`;
    const link = st === "hit"
      ? `<line class="hotflow" x1="322" y1="${cy}" x2="382" y2="${cy}" marker-end="url(#${S}-arrow-accent)"/>`
      : `<line class="dead" x1="322" y1="${cy}" x2="384" y2="${cy}"/>`;
    // связка «нет» вниз: после сработавшей ветки движок уже не идёт
    const down = i === branches.length - 1 ? ""
      : i === 2
        ? `<line class="dead" x1="220" y1="${top + 32}" x2="220" y2="${top + 52}"/>`
        : `<line class="flow" x1="220" y1="${top + 32}" x2="220" y2="${top + 48}" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="230" y="${top + 46}" font-size="10">нет</text>`;
    return `${icon}
<rect class="${boxCls}" x="120" y="${top}" width="200" height="32" rx="8"/>
<text class="mono ${st === "skip" ? "faded" : ""}" x="220" y="${cy + 4}" font-size="12" text-anchor="middle">${when}</text>
${link}
<rect class="${st === "hit" ? "hotpill" : "offpill"}" x="386" y="${top}" width="150" height="32" rx="8"/>
<text class="mono ${st === "hit" ? "" : "faded"}" x="461" y="${cy + 4}" font-size="12" text-anchor="middle">${then}</text>
${down}`;
  }).join("\n");

  return svgWrap("0 0 700 434", S, "CASE идёт по веткам сверху вниз", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .faded { fill: var(--muted); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .in { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .step { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .off { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .hotpill { fill: var(--paper); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .offpill { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; }
.dg-${S} .elsebox { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; stroke-dasharray: 5 4; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .hotflow { stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .dead { stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 3 4; }
.dg-${S} .dash { stroke: var(--line); stroke-width: 1.4; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
.dg-${S} .brace { stroke: var(--muted); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Проверка идёт сверху вниз и останавливается на первой подошедшей ветке</text>
<text class="cap" x="26" y="66" font-size="10.5">на входе</text>
<rect class="in" x="120" y="44" width="200" height="28" rx="8"/>
<text class="mono" x="220" y="63" font-size="12" text-anchor="middle">status = 'PICKED'</text>
<line class="flow" x1="220" y1="74" x2="220" y2="88" marker-end="url(#${S}-arrow)"/>
${body}

<text class="cap t-accent" x="552" y="208" font-size="10.5">первое совпадение —</text>
<text class="cap t-accent" x="552" y="224" font-size="10.5">оно и результат</text>
<line class="brace" x1="546" y1="246" x2="546" y2="286"/>
<text class="cap" x="554" y="262" font-size="10.5">эту ветку движок</text>
<text class="cap" x="554" y="278" font-size="10.5">уже не смотрит</text>

<text class="cap" x="26" y="297" font-size="10.5">а если бы не совпало ничего:</text>
<line class="split" x1="26" y1="303" x2="674" y2="303"/>
<rect class="elsebox" x="120" y="318" width="200" height="38" rx="8"/>
<text class="cap" x="220" y="342" font-size="11.5" text-anchor="middle">не подошла ни одна ветка</text>
<line class="dead" x1="322" y1="337" x2="384" y2="337"/>
<rect class="elsebox" x="386" y="318" width="150" height="38" rx="8"/>
<text class="cap" x="461" y="334" font-size="10.5" text-anchor="middle">есть ELSE → его значение</text>
<text class="cap t-gold" x="461" y="349" font-size="10.5" text-anchor="middle">нет ELSE → NULL</text>

<line x1="26" y1="380" x2="674" y2="380" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="402" font-size="11">Первая ветка, у которой сравнение дало «да», и есть результат: остальные движок уже не смотрит.</text>
<text class="cap" x="26" y="422" font-size="11">Не совпало ничего, а ELSE нет — выражение молча вернёт NULL: CASE без ELSE это всегда ELSE NULL.</text>
`);
}

/* ---------------------------------------------------------------- d2.10 */

// Целочисленное деление: два пути одного вычисления, разница только в типах
// операндов. Схема существует ради мысли, что тип итога берётся из типов
// операндов, а не из того, что получилось по дороге, — и дробная часть
// поэтому не округляется, а отваливается.
function buildIntDiv() {
  const S = "int-div";

  // Один ярус операндов: два значения со своими типами и знак деления между ними.
  const operands = (xa, xb, ox, a, ta, b, tb, hotB) => `
<rect class="op" x="${xa}" y="72" width="96" height="48" rx="9"/>
<text class="mono" x="${xa + 48}" y="100" font-size="17" text-anchor="middle">${a}</text>
<text class="cap" x="${xa + 48}" y="114" font-size="10" text-anchor="middle">${ta}</text>
<text class="mono" x="${ox}" y="103" font-size="19" text-anchor="middle">/</text>
<rect class="${hotB ? "ophot" : "op"}" x="${xb}" y="72" width="96" height="48" rx="9"/>
<text class="mono ${hotB ? "t-ok" : ""}" x="${xb + 48}" y="100" font-size="17" text-anchor="middle">${b}</text>
<text class="cap ${hotB ? "t-ok" : ""}" x="${xb + 48}" y="114" font-size="10" text-anchor="middle">${tb}</text>`;

  return svgWrap("0 0 700 386", S, "Целое делить на целое даёт целое", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-bad" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--bad)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .op { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .ophot { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.6; }
.dg-${S} .act { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .resgold { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.6; }
.dg-${S} .resok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.6; }
.dg-${S} .lost { fill: none; stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 4 3; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Одно и то же деление. Разницу делает не результат, а типы операндов</text>
<line class="split" x1="346" y1="44" x2="346" y2="300"/>

<text class="cap" x="26" y="58" font-size="11.5" font-weight="600">оба операнда целые</text>
${operands(42, 218, 178, "5", "integer", "2", "integer", false)}
<line class="flow" x1="178" y1="122" x2="178" y2="142" marker-end="url(#${S}-arrow)"/>
<rect class="act" x="78" y="146" width="200" height="42" rx="9"/>
<text class="mono" x="178" y="167" font-size="14" text-anchor="middle">5 / 2</text>
<text class="cap" x="178" y="182" font-size="10.5" text-anchor="middle">целое ÷ целое → целое</text>
<line class="flow" x1="178" y1="190" x2="178" y2="204" marker-end="url(#${S}-arrow)"/>
<rect class="resgold" x="118" y="208" width="120" height="48" rx="9"/>
<text class="mono t-gold" x="178" y="235" font-size="20" font-weight="700" text-anchor="middle">2</text>
<text class="cap" x="178" y="252" font-size="10" text-anchor="middle">integer</text>
<path class="lost" d="M268,190 C286,206 285,222 285,244" marker-end="url(#${S}-arrow-bad)"/>
<rect class="lost" x="248" y="248" width="74" height="28" rx="8"/>
<text class="mono t-bad" x="285" y="267" font-size="13" text-anchor="middle">.5</text>
<text class="cap t-bad" x="285" y="292" font-size="10.5" text-anchor="middle">отвалилась</text>

<text class="cap" x="362" y="58" font-size="11.5" font-weight="600">один операнд дробный</text>
${operands(380, 554, 515, "5", "integer", "2.0", "numeric", true)}
<line class="flow" x1="515" y1="122" x2="515" y2="142" marker-end="url(#${S}-arrow)"/>
<rect class="act" x="415" y="146" width="200" height="42" rx="9"/>
<text class="mono" x="515" y="167" font-size="14" text-anchor="middle">5 / 2.0</text>
<text class="cap" x="515" y="182" font-size="10.5" text-anchor="middle">целое ÷ дробное → дробное</text>
<line class="flow" x1="515" y1="190" x2="515" y2="204" marker-end="url(#${S}-arrow)"/>
<rect class="resok" x="455" y="208" width="120" height="48" rx="9"/>
<text class="mono t-ok" x="515" y="235" font-size="20" font-weight="700" text-anchor="middle">2.5</text>
<text class="cap" x="515" y="252" font-size="10" text-anchor="middle">numeric</text>
<text class="cap t-ok" x="515" y="274" font-size="10.5" text-anchor="middle">дробная часть на месте</text>

<line x1="26" y1="316" x2="674" y2="316" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="338" font-size="11">Тип итога сервер берёт из типов операндов, а не из того, что получилось по дороге.</text>
<text class="cap" x="26" y="358" font-size="11">Целое ÷ целое обязано дать целое, поэтому дробная часть не округляется, а отрезается.</text>
<text class="cap" x="26" y="378" font-size="11">Нужна дробь — сделай дробным любой из двух: 5 / 2.0 или CAST(5 AS numeric) / 2.</text>
`);
}

/* ---------------------------------------------------------------- реестр */

export const REGISTRY = {
  "select-pipeline": {
    id: "select-pipeline",
    title: "Порядок написания и порядок выполнения",
    caption: "Слева — как запрос выглядит в тексте, справа — в каком порядке ступени отрабатывают. Ниточки показывают, куда уезжает каждая часть; SELECT уезжает дальше всех.",
    anchor: "Что здесь произошло",
    svg: buildSelectPipeline(),
  },
  "where-gate": {
    id: "where-gate",
    title: "WHERE пропускает строки по одной",
    caption: "Решение принимается для каждой строки отдельно и до того, как SELECT что-либо посчитает. Поэтому алиаса из SELECT здесь ещё не существует.",
    anchor: "Что здесь произошло",
    svg: buildWhereGate(),
  },
  "and-or-tree": {
    id: "and-or-tree",
    title: "AND стягивает соседей раньше, чем OR",
    caption: "Слева — как условие слышится человеку, справа — как его сворачивает сервер. Разница не косметическая: строк приходит разное число, а ошибки при этом нет.",
    anchor: "У AND и OR разная сила, и это не мелочь",
    svg: buildAndOrTree(),
  },
  "null-gate": {
    id: "null-gate",
    title: "WHERE открывается только на TRUE",
    caption: "Один предикат на трёх строках даёт три разных исхода. Турникет пропускает только TRUE, а FALSE и UNKNOWN для него неразличимы — поэтому строка с NULL пропадает молча.",
    anchor: "Что здесь произошло",
    svg: buildNullGate(),
  },
  "like-mask": {
    id: "like-mask",
    title: "Как шаблон LIKE ложится на строку",
    caption: "Каждый кусок шаблона съедает свой кусок строки: % — сколько угодно символов, в том числе ноль, а _ — ровно один. И покрыть надо всю строку целиком, иначе совпадения нет.",
    anchor: "Что здесь произошло",
    svg: buildLikeMask(),
  },
  "order-by-last": {
    id: "order-by-last",
    title: "ORDER BY — отдельная ступень, а не свойство таблицы",
    caption: "Сверху путь с сортировкой: порядок задан и повторяется всегда. Снизу тот же запрос без ORDER BY: строки придут в том порядке, в каком движку было удобнее их прочитать.",
    anchor: "Что здесь произошло",
    svg: buildOrderByLast(),
  },
  "case-ladder": {
    id: "case-ladder",
    title: "CASE идёт по веткам сверху вниз",
    caption: "Первая ветка, давшая «да», и есть результат: ветки ниже движок для этой строки даже не смотрит. А если не совпало ничего и ELSE не написан — выражение молча вернёт NULL.",
    anchor: "Что здесь произошло",
    svg: buildCaseLadder(),
  },
  "int-div": {
    id: "int-div",
    title: "Целое делить на целое даёт целое",
    caption: "Два пути одного вычисления. Слева оба операнда целые, и дробная часть отваливается; справа один операнд дробный, и она остаётся. Решает не результат, а типы операндов.",
    anchor: "Дробная часть не округлилась, а отвалилась",
    svg: buildIntDiv(),
  },
};

// Привязка схем к нодам. Коды с префиксом трека — те же, что в базе.
export const INDEX = {
  "d2.01": ["select-pipeline"],
  "d2.03": ["where-gate", "and-or-tree"],
  "d2.04": ["null-gate"],
  "d2.05": ["like-mask"],
  "d2.06": ["order-by-last"],
  "d2.08": ["case-ladder"],
  "d2.10": ["int-div"],
};
