// diagrams-sql-06.js
// Схемы этапа 6: оконные функции.
//
// Оснастка общая (diagrams-sql-kit.js), правила те же: самодостаточный модуль,
// цвета только через CSS-переменные страницы, никакого JS внутри SVG.
// Образец стиля — diagrams-sql-02.js.

import { arrowDefs, checkIcon, crossIcon, svgWrap } from "./diagrams-sql-kit.js";

/* ---------------------------------------------------------------- d6.01 */

// Тринадцать строк dbo.stock: слева к ним приписана колонка sum(qty) OVER (),
// справа тот же sum без OVER схлопывает их в одну строку. Схема существует
// ради главной мысли ноды: агрегат заменяет строки итогом, а окно итог
// дописывает — строк на выходе ровно столько же, сколько было на входе.
function buildWindowVsGroupby() {
  const S = "window-vs-groupby";
  // skuid, loc, qty — вывод первого примера ноды, все тринадцать строк.
  const rows = [
    ["APPLE-KG", "C-01-01", "55.500"],
    ["BREAD-DARK", "A-01-02", "30.000"],
    ["BUTTER-180", "C-01-02", "90.000"],
    ["CHICKEN-KG", "C-01-02", "33.250"],
    ["COFFEE-250", "A-02-01", "24.000"],
    ["EGGS-C1", "C-01-01", "45.000"],
    ["FLOUR-2KG", "B-01-02", "150.000"],
    ["KEFIR-05", "C-01-01", "40.000"],
    ["MILK-1L", "A-01-01", "48.000"],
    ["MILK-1L", "A-01-01", "60.000"],
    ["MILK-1L", "B-01-01", "120.000"],
    ["SUGAR-1KG", "A-02-01", "200.000"],
    ["WATER-6X15", "B-01-01", "80.000"],
  ];
  const Y0 = 110, P = 17;

  const table = rows.map(([sku, loc, qty], i) => {
    const y = Y0 + i * P;
    return `<rect class="srow" x="26" y="${y}" width="272" height="15" rx="4"/>
<text class="mono" x="34" y="${y + 11}" font-size="10">${sku}</text>
<text class="mono cap" x="112" y="${y + 11}" font-size="10">${loc}</text>
<text class="mono" x="290" y="${y + 11}" font-size="10" text-anchor="end">${qty}</text>
<rect class="wcell" x="304" y="${y}" width="126" height="15" rx="4"/>
<text class="mono t-accent" x="367" y="${y + 11}" font-size="10" text-anchor="middle">975.750</text>`;
  }).join("\n");

  // Правая половина: те же тринадцать строк без подписей — важно их число,
  // а не содержимое, — и воронка, сводящая их в одну.
  const bars = rows.map((_, i) => {
    const y = 112 + i * 9;
    return `<rect class="bar" x="470" y="${y}" width="62" height="6" rx="2"/>
<path class="funnel" d="M534,${y + 3} C552,${y + 3} 548,164 560,164"/>`;
  }).join("\n");

  return svgWrap("0 0 700 414", S, "GROUP BY схлопывает строки, окно — нет", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .srow { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
.dg-${S} .wcell { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1; }
.dg-${S} .bar { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
.dg-${S} .funnel { fill: none; stroke: var(--line-soft); stroke-width: 0.9; }
.dg-${S} .fold { fill: var(--sunk); stroke: var(--muted); stroke-width: 1.4; }
.dg-${S} .divider { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Семь символов OVER () меняют не число, а судьбу строк</text>
<text class="mono" x="26" y="52" font-size="11">SELECT skuid, loc, qty, sum(qty) OVER () AS total_wh FROM dbo.stock</text>

<line class="divider" x1="450" y1="66" x2="450" y2="352"/>

<text class="cap" x="26" y="78" font-size="11" font-weight="600">вошло 13 строк — вышло 13 строк</text>
<text class="cap" x="470" y="78" font-size="11" font-weight="600">тот же sum(qty), но без OVER</text>

<text class="cap" x="34" y="100" font-size="9.5">skuid</text>
<text class="cap" x="112" y="100" font-size="9.5">loc</text>
<text class="cap" x="290" y="100" font-size="9.5" text-anchor="end">qty</text>
<text class="cap t-accent" x="367" y="100" font-size="9.5" text-anchor="middle">total_wh</text>
<text class="cap" x="470" y="100" font-size="9.5">13 строк dbo.stock</text>
${table}
${bars}

<rect class="fold" x="566" y="149" width="104" height="30" rx="8"/>
<text class="mono" x="618" y="169" font-size="12" text-anchor="middle">975.750</text>
<text class="cap" x="618" y="196" font-size="9.5" text-anchor="middle">одна строка</text>

<text class="cap" x="470" y="252" font-size="10.5">число то же самое, а тринадцати</text>
<text class="cap" x="470" y="268" font-size="10.5">строк больше нет: loc, lot и qty</text>
<text class="cap t-bad" x="470" y="284" font-size="10.5">выброшены вместе со строками</text>
<text class="cap" x="470" y="312" font-size="10.5">так вёл себя агрегат весь</text>
<text class="cap" x="470" y="328" font-size="10.5">четвёртый этап</text>

<line x1="26" y1="366" x2="674" y2="366" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="388" font-size="11">GROUP BY схлопывает строки, окно — нет: на выходе окна строк ровно столько же, сколько было на входе.</text>
<text class="cap" x="26" y="408" font-size="11">Пустые скобки OVER () значат «окно — вся выборка целиком», поэтому число во всех строках одно.</text>
`);
}

// Логический конвейер SELECT с новой ступенькой «окна»: видно, что окна
// считаются после HAVING и до ORDER BY. Схема существует ради того, чтобы
// запреты 42P20 и приёмы вроде count(*) OVER () под LIMIT читались не как
// список правил, а как следствия одного места в конвейере.
function buildWindowWhen() {
  const S = "window-when";
  // ступень, состояние, две строки пояснения
  const steps = [
    ["FROM / JOIN", "plain", "набор строк собран, окон ещё нет вовсе", ""],
    ["WHERE", "no", "нельзя: window functions are not allowed in WHERE", "SQLSTATE 42P20 — и окно потом увидит только уцелевшее"],
    ["GROUP BY", "plain", "строки схлопнулись в группы", ""],
    ["HAVING", "no", "тоже нельзя: тот же 42P20, другое имя клаузы", ""],
    ["ОКНА", "hot", "здесь считаются все OVER (...) — одним проходом по набору", ""],
    ["ORDER BY", "yes", "можно: значение уже посчитано, сортировать по нему разрешено", ""],
    ["LIMIT", "yes", "окно старше отрезания хвоста: count(*) OVER () даст 13, а выйдут 3", ""],
  ];

  const body = steps.map(([name, st, n1, n2], i) => {
    const top = 78 + i * 40;
    const cy = top + 15;
    const cls = st === "hot" ? "hot" : st === "no" ? "off" : "stage";
    const icon = st === "no" ? crossIcon(184, cy - 7, 14)
      : st === "yes" ? checkIcon(184, cy - 7, 14)
      : "";
    const down = i === steps.length - 1 ? ""
      : `<line class="flow" x1="106" y1="${top + 30}" x2="106" y2="${top + 36}" marker-end="url(#${S}-arrow)"/>`;
    const t1y = n2 ? cy - 2 : cy + 4;
    return `<rect class="${cls}" x="40" y="${top}" width="132" height="30" rx="8"/>
<text class="mono ${st === "hot" ? "t-accent" : ""}" x="106" y="${cy + 4}" font-size="12" ${st === "hot" ? 'font-weight="700"' : ""} text-anchor="middle">${name}</text>
${icon}
<text class="cap ${st === "hot" ? "t-accent" : ""}" x="208" y="${t1y}" font-size="11">${n1}</text>
${n2 ? `<text class="cap" x="208" y="${cy + 13}" font-size="11">${n2}</text>` : ""}
${down}`;
  }).join("\n");

  return svgWrap("0 0 700 442", S, "Где в конвейере считается окно", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .stage { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .off { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; }
.dg-${S} .hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Окно считается после WHERE, GROUP BY и HAVING, но до ORDER BY и LIMIT</text>
<text class="cap" x="26" y="50" font-size="11">Из одной этой строчки конвейера следуют все запреты и все приёмы темы</text>
${body}

<line x1="26" y1="374" x2="674" y2="374" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="396" font-size="11">Окно не пишут в WHERE и HAVING не из вредности: на их ступеньках его ещё не существует.</text>
<text class="cap" x="26" y="416" font-size="11">Фильтровать по окну надо этажом выше: посчитать в CTE, а WHERE навесить снаружи.</text>
<text class="cap" x="26" y="436" font-size="11">И окно видит только пережившее WHERE: с фильтром zone = 'COLD' общий итог станет 263.750 вместо 975.750.</text>
`);
}

/* ---------------------------------------------------------------- d6.02 */

// Три шага row_number(): PARTITION BY режет выборку на окна, ORDER BY внутри
// OVER выстраивает в каждом окне очередь, и только потом раздаются номера.
// Схема существует ради того, чтобы ORDER BY внутри скобок перестал путаться
// с сортировкой вывода: это два разных порядка, живущих в разных местах.
function buildRownumPipeline() {
  const S = "rownum-pipeline";
  // Партии dbo.lot: у молока их три, у кефира одна — видно, что окна
  // независимы и каждое начинает счёт с единицы заново.
  const milkRaw = [["L0013", "2026-07-26"], ["L0001", "2026-07-20"], ["L0002", "2026-07-24"]];
  const milkQueue = [["L0001", "2026-07-20"], ["L0002", "2026-07-24"], ["L0013", "2026-07-26"]];
  const kefir = [["L0003", "2026-07-26"]];

  // Одно окно: рамка с заголовком и строками партий. n — номер, если он уже есть.
  const win = (x, y, name, list, withN) => {
    const h = 24 + list.length * 20 + 6;
    const rows = list.map(([lot, exp], i) => {
      const ry = y + 24 + i * 20;
      return `<rect class="lrow" x="${x + 8}" y="${ry}" width="${withN ? 128 : 172}" height="17" rx="4"/>
<text class="mono" x="${x + 14}" y="${ry + 12}" font-size="10">${lot}</text>
<text class="mono cap" x="${x + 56}" y="${ry + 12}" font-size="10">${exp}</text>
${withN ? `<rect class="ncell" x="${x + 142}" y="${ry}" width="38" height="17" rx="4"/>
<text class="mono t-accent" x="${x + 161}" y="${ry + 12}" font-size="11" font-weight="700" text-anchor="middle">${i + 1}</text>` : ""}`;
    }).join("\n");
    return `<rect class="win" x="${x}" y="${y}" width="196" height="${h}" rx="9"/>
<text class="mono" x="${x + 10}" y="${y + 16}" font-size="10.5" font-weight="700">${name}</text>
${rows}`;
  };

  const arrow = (x, y) => `<line class="flow" x1="${x}" y1="${y}" x2="${x + 22}" y2="${y}" marker-end="url(#${S}-arrow)"/>`;

  return svgWrap("0 0 700 366", S, "Три шага row_number()", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .win { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .lrow { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .ncell { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.1; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Номер — свойство не партии, а очереди, в которую её поставили</text>
<text class="mono" x="26" y="52" font-size="11">row_number() OVER (<tspan class="t-gold">PARTITION BY skuid</tspan> <tspan class="t-accent">ORDER BY expdate</tspan>)</text>

<text class="cap t-gold" x="26" y="78" font-size="10.5" font-weight="600">шаг 1 — PARTITION BY режет выборку</text>
<text class="cap" x="26" y="92" font-size="10.5">порядок внутри окна пока не обещан</text>
<text class="cap t-accent" x="252" y="78" font-size="10.5" font-weight="600">шаг 2 — ORDER BY строит очередь</text>
<text class="cap" x="252" y="92" font-size="10.5">и делает это в каждом окне отдельно</text>
<text class="cap" x="478" y="78" font-size="10.5" font-weight="600">шаг 3 — раздаются номера</text>
<text class="cap" x="478" y="92" font-size="10.5">каждое окно считает с единицы</text>

${win(26, 104, "окно skuid = MILK-1L", milkRaw, false)}
${win(26, 204, "окно skuid = KEFIR-05", kefir, false)}
${arrow(226, 152)}
${arrow(226, 236)}
${win(252, 104, "очередь по expdate", milkQueue, false)}
${win(252, 204, "очередь по expdate", kefir, false)}
${arrow(452, 152)}
${arrow(452, 236)}
${win(478, 104, "готовая колонка n", milkQueue, true)}
${win(478, 204, "готовая колонка n", kefir, true)}

<line x1="26" y1="278" x2="674" y2="278" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="300" font-size="11">ORDER BY внутри OVER не сортирует вывод: он выстраивает очередь внутри окна, по которой раздаются номера.</text>
<text class="cap" x="26" y="320" font-size="11">Что окажется на экране сверху, решает совсем другая клауза — ORDER BY в самом конце запроса.</text>
<text class="cap" x="26" y="340" font-size="11">Поэтому номера могут идти вразнобой: строка увозит свой номер туда, куда её поставила сортировка вывода.</text>
<text class="cap" x="26" y="360" font-size="11">И поэтому в одном запросе уживаются два окна с разными ORDER BY — они друг другу не мешают.</text>
`);
}

// Одиннадцать товаров dbo.sku, одна очередь по сроку годности и четыре колонки
// номеров рядом. Схема существует ради единственного различия между четырьмя
// функциями: что каждая делает с ничьёй — и где у rank() появляется провал,
// а у ntile() граница корзины проходит прямо посреди ничьей.
function buildRankVsDense() {
  const S = "rank-vs-dense";
  // skuid, срок, rn, rank, dense_rank, ntile(3) — вывод примера ноды целиком
  const rows = [
    ["BREAD-DARK", "5", "1", "1", "1", "1", true],
    ["CHICKEN-KG", "5", "2", "1", "1", "1", true],
    ["MILK-1L", "10", "3", "3", "2", "1", false],
    ["KEFIR-05", "14", "4", "4", "3", "1", false],
    ["EGGS-C1", "25", "5", "5", "4", "2", false],
    ["APPLE-KG", "30", "6", "6", "5", "2", false],
    ["BUTTER-180", "60", "7", "7", "6", "2", false],
    ["FLOUR-2KG", "365", "8", "8", "7", "2", true],
    ["SUGAR-1KG", "365", "9", "8", "7", "3", true],
    ["COFFEE-250", "540", "10", "10", "8", "3", false],
    ["TEA-100", "730", "11", "11", "9", "3", false],
  ];
  const Y0 = 116, P = 20;
  // Строки, где rank() перепрыгнул через съеденное ничьёй место.
  const jump = new Set(["MILK-1L", "COFFEE-250"]);

  const body = rows.map(([sku, sl, rn, rk, dr, bk], i) => {
    const y = Y0 + i * P;
    const tie = rows[i][6];
    return `<rect class="${tie ? "tierow" : "trow"}" x="60" y="${y}" width="470" height="17" rx="4"/>
<text class="mono" x="68" y="${y + 12}" font-size="10">${sku}</text>
<text class="mono cap" x="200" y="${y + 12}" font-size="10" text-anchor="end">${sl}</text>
<text class="mono" x="260" y="${y + 12}" font-size="11" text-anchor="middle">${rn}</text>
<text class="mono ${jump.has(sku) ? "t-bad" : ""}" x="330" y="${y + 12}" font-size="11" ${jump.has(sku) ? 'font-weight="700"' : ""} text-anchor="middle">${rk}</text>
<text class="mono" x="400" y="${y + 12}" font-size="11" text-anchor="middle">${dr}</text>
<text class="mono" x="470" y="${y + 12}" font-size="11" text-anchor="middle">${bk}</text>`;
  }).join("\n");

  // Скобка слева, стягивающая пару равных строк.
  const brace = (i) => {
    const y1 = Y0 + i * P + 2, y2 = Y0 + (i + 1) * P + 15;
    return `<path class="tie" d="M54,${y1} L46,${y1} L46,${y2} L54,${y2}"/>
<text class="cap t-gold" x="32" y="${(y1 + y2) / 2 + 4}" font-size="11" font-weight="700">=</text>`;
  };

  return svgWrap("0 0 700 422", S, "Четыре функции, одно окно, четыре ответа на ничью", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .trow { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .tierow { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1; }
.dg-${S} .tie { fill: none; stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .cut { stroke: var(--accent); stroke-width: 1.4; stroke-dasharray: 5 3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Одно окно, одна очередь — и четыре разных ответа на ничью</text>
<text class="mono" x="26" y="52" font-size="11">OVER (ORDER BY shelflife) по dbo.sku: одиннадцать товаров, два раза ничья</text>

<text class="mono" x="260" y="82" font-size="10" text-anchor="middle">row_number()</text>
<text class="mono" x="330" y="82" font-size="10" text-anchor="middle">rank()</text>
<text class="mono" x="400" y="82" font-size="10" text-anchor="middle">dense_rank()</text>
<text class="mono" x="470" y="82" font-size="10" text-anchor="middle">ntile(3)</text>
<text class="cap" x="260" y="96" font-size="9.5" text-anchor="middle">сплошь</text>
<text class="cap t-bad" x="330" y="96" font-size="9.5" text-anchor="middle">с провалом</text>
<text class="cap" x="400" y="96" font-size="9.5" text-anchor="middle">плотно</text>
<text class="cap t-accent" x="470" y="96" font-size="9.5" text-anchor="middle">по счёту строк</text>
<text class="cap" x="68" y="96" font-size="9.5">skuid</text>
<text class="cap" x="200" y="96" font-size="9.5" text-anchor="end">срок, дн.</text>

${body}
${brace(0)}
${brace(7)}

<line class="cut" x1="436" y1="${Y0 + 4 * P - 2}" x2="526" y2="${Y0 + 4 * P - 2}"/>
<line class="cut" x1="436" y1="${Y0 + 8 * P - 2}" x2="526" y2="${Y0 + 8 * P - 2}"/>

<text class="cap t-gold" x="546" y="${Y0 + 14}" font-size="10">ничья: 5 и 5,</text>
<text class="cap t-gold" x="546" y="${Y0 + 28}" font-size="10">номера всё равно разные</text>
<text class="cap t-bad" x="546" y="${Y0 + 2 * P + 12}" font-size="10">rank прыгнул на 3:</text>
<text class="cap t-bad" x="546" y="${Y0 + 2 * P + 26}" font-size="10">место №2 съела ничья</text>
<text class="cap t-accent" x="546" y="${Y0 + 7 * P + 12}" font-size="10">срок один, а корзины</text>
<text class="cap t-accent" x="546" y="${Y0 + 7 * P + 26}" font-size="10">разные: ntile режет</text>
<text class="cap t-accent" x="546" y="${Y0 + 7 * P + 40}" font-size="10">строки, а не значения</text>

<line x1="26" y1="354" x2="674" y2="354" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="376" font-size="11">На наборе 5, 5, 10: row_number() даст 1, 2, 3; rank() даст 1, 1, 3; dense_rank() даст 1, 1, 2.</text>
<text class="cap" x="26" y="396" font-size="11">Максимум row_number() — число строк, максимум dense_rank() — число различных значений: здесь 11 и 9.</text>
<text class="cap" x="26" y="416" font-size="11">Нужен топ-3 строк — бери row_number(). Нужен топ-3 значений — бери dense_rank().</text>
`);
}

/* ---------------------------------------------------------------- d6.03 */

// Кадр в трёх положениях: заказ 3 из dbo.orderdetail, и рядом тот же заказ
// без ORDER BY внутри OVER. Схема существует ради мысли, что накопительной
// функции в SQL нет — есть обычный sum, которому ORDER BY подсовывает всё
// более длинный кусок окна.
function buildRunFrame() {
  const S = "run-frame";
  // linenum, qty — строки заказа 3
  const lines = [["стр. 1", "10.000"], ["стр. 2", "12.000"], ["стр. 3", "5.000"]];
  const RY = 128, RP = 24, RH = 20;

  // Одна колонка: три строки заказа, рамка кадра поверх covered строк, итог снизу.
  const col = (x, w, covered, cur, big, note) => {
    const rows = lines.map(([ln, q], i) => {
      const y = RY + i * RP;
      const on = i < covered;
      return `<rect class="${cur === i ? "cur" : on ? "inrow" : "outrow"}" x="${x + 6}" y="${y}" width="${w - 12}" height="${RH}" rx="4"/>
<text class="mono ${on ? "" : "faint"}" x="${x + 14}" y="${y + 14}" font-size="10">${ln}</text>
<text class="mono ${on ? "" : "faint"}" x="${x + w - 14}" y="${y + 14}" font-size="10" text-anchor="end">${q}</text>`;
    }).join("\n");
    const fh = RY + (covered - 1) * RP + RH + 5 - (RY - 5);
    return `${rows}
<rect class="frame" x="${x + 2}" y="${RY - 5}" width="${w - 4}" height="${fh}" rx="7"/>
<rect class="res" x="${x + 6}" y="212" width="${w - 12}" height="34" rx="8"/>
<text class="mono t-accent" x="${x + w / 2}" y="${234}" font-size="15" font-weight="700" text-anchor="middle">${big}</text>
<text class="cap" x="${x + w / 2}" y="${262}" font-size="10" text-anchor="middle">${note}</text>`;
  };

  return svgWrap("0 0 700 356", S, "Кадр: что видит sum, стоя на строке", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .faint { fill: var(--line); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .inrow { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1; }
.dg-${S} .cur { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2; }
.dg-${S} .outrow { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 3 3; }
.dg-${S} .frame { fill: none; stroke: var(--accent); stroke-width: 1.3; stroke-dasharray: 5 3; }
.dg-${S} .res { fill: var(--paper); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .divider { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Никакой накопительной функции в SQL нет — есть sum, которому дают всё больший кусок окна</text>
<text class="mono" x="26" y="52" font-size="11">sum(qtyordered) OVER (PARTITION BY orderkey <tspan class="t-accent">ORDER BY linenum</tspan>) — заказ 3</text>

<line class="divider" x1="196" y1="68" x2="196" y2="270"/>
<text class="cap" x="28" y="78" font-size="10.5" font-weight="600">без ORDER BY в скобках</text>
<text class="cap t-accent" x="210" y="78" font-size="10.5" font-weight="600">с ORDER BY linenum — у окна включается кадр</text>

<text class="cap" x="28" y="100" font-size="10">кадра нет вовсе:</text>
<text class="cap" x="28" y="114" font-size="10">видно всё окно сразу</text>
<text class="cap" x="210" y="100" font-size="10">стоим на 1-й строке</text>
<text class="cap" x="210" y="114" font-size="10">кадр: с 1-й по 1-ю</text>
<text class="cap" x="368" y="100" font-size="10">стоим на 2-й строке</text>
<text class="cap" x="368" y="114" font-size="10">кадр: с 1-й по 2-ю</text>
<text class="cap" x="526" y="100" font-size="10">стоим на 3-й строке</text>
<text class="cap" x="526" y="114" font-size="10">кадр: с 1-й по 3-ю</text>

${col(28, 152, 3, -1, "27.000", "и так во всех трёх строках")}
${col(210, 148, 1, 0, "10.000", "10")}
${col(368, 148, 2, 1, "22.000", "10 + 12")}
${col(526, 148, 3, 2, "27.000", "10 + 12 + 5")}

<line x1="26" y1="288" x2="674" y2="288" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="310" font-size="11">Без ORDER BY в скобках агрегат считается по всему окну сразу и во всех его строках одинаков.</text>
<text class="cap" x="26" y="330" font-size="11">С ORDER BY включается кадр по умолчанию — «от начала окна по текущую строку», и агрегат считается заново.</text>
<text class="cap" x="26" y="350" font-size="11">Функция та же, партиция та же, данные те же. Разницу делает одна строчка внутри скобок.</text>
`);
}

// Задания на отбор заказа 1 из dbo.pickdetail: слева окно упорядочено по
// linenum, и две строки с linenum = 1 оказываются пирами, справа — по
// уникальному pickkey. Схема существует ради мины: итог копится не по
// строкам, а по различным значениям ORDER BY окна.
function buildRunPeers() {
  const S = "run-peers";
  // pickkey, linenum, qty, by_linenum, by_pickkey, пир ли
  const rows = [
    ["1", "1", "12.000", "24.000", "12.000", true],
    ["2", "1", "12.000", "24.000", "24.000", true],
    ["3", "2", "30.000", "54.000", "54.000", false],
  ];
  const RY = 112, RP = 24, RH = 20;

  const panel = (x, key, bad) => rows.map((r, i) => {
    const y = RY + i * RP;
    const tie = bad && r[5];
    return `<rect class="${tie ? "tierow" : "trow"}" x="${x}" y="${y}" width="282" height="${RH}" rx="4"/>
<text class="mono" x="${x + 30}" y="${y + 14}" font-size="10.5" text-anchor="middle">${r[0]}</text>
<text class="mono ${tie ? "t-gold" : ""}" x="${x + 84}" y="${y + 14}" font-size="10.5" text-anchor="middle">${r[1]}</text>
<text class="mono cap" x="${x + 166}" y="${y + 14}" font-size="10.5" text-anchor="end">${r[2]}</text>
<rect class="${tie ? "sumbad" : "sumok"}" x="${x + 192}" y="${y + 2}" width="84" height="16" rx="4"/>
<text class="mono ${tie ? "t-bad" : "t-ok"}" x="${x + 234}" y="${y + 14}" font-size="10.5" font-weight="700" text-anchor="middle">${bad ? r[3] : r[4]}</text>`;
  }).join("\n");

  const head = (x) => `<text class="cap" x="${x + 30}" y="102" font-size="9.5" text-anchor="middle">pickkey</text>
<text class="cap" x="${x + 84}" y="102" font-size="9.5" text-anchor="middle">linenum</text>
<text class="cap" x="${x + 166}" y="102" font-size="9.5" text-anchor="end">qty</text>
<text class="cap" x="${x + 234}" y="102" font-size="9.5" text-anchor="middle">накоплено</text>`;

  return svgWrap("0 0 700 358", S, "Ничья в ORDER BY окна двигает итог сразу на всех", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .trow { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .tierow { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1; }
.dg-${S} .sumok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1; }
.dg-${S} .sumbad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1; }
.dg-${S} .tie { fill: none; stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .divider { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Итог копится не по строкам, а по различным значениям ORDER BY окна</text>
<text class="mono" x="26" y="52" font-size="11">sum(qty) OVER (PARTITION BY orderkey ORDER BY ...) — задания на отбор заказа 1</text>

<line class="divider" x1="352" y1="68" x2="352" y2="272"/>
${crossIcon(48, 70, 14)}
<text class="cap" x="70" y="82" font-size="11" font-weight="600">ORDER BY linenum — есть ничья</text>
${checkIcon(370, 70, 14)}
<text class="cap" x="392" y="82" font-size="11" font-weight="600">ORDER BY pickkey — ничьих нет</text>

${head(48)}
${head(370)}
${panel(48, "linenum", true)}
${panel(370, "pickkey", false)}
<path class="tie" d="M40,114 L32,114 L32,154 L40,154"/>
<text class="cap t-gold" x="30" y="138" font-size="10.5" font-weight="700" text-anchor="end">=</text>

<text class="cap t-gold" x="48" y="196" font-size="10.5">у обеих строк linenum = 1: они пиры, и кадр</text>
<text class="cap t-gold" x="48" y="212" font-size="10.5">забирает их разом, обеим сразу написав 24</text>
<text class="cap t-bad" x="48" y="236" font-size="10.5">сборщик держит в руках 12, а отчёт уже</text>
<text class="cap t-bad" x="48" y="252" font-size="10.5">считает, что набрано 24 — итог забежал вперёд</text>

<text class="cap" x="370" y="196" font-size="10.5">pickkey — первичный ключ, значит уникален,</text>
<text class="cap" x="370" y="212" font-size="10.5">и каждая строка сама себе группа пиров</text>
<text class="cap t-ok" x="370" y="236" font-size="10.5">накопление идёт честно построчно:</text>
<text class="cap t-ok" x="370" y="252" font-size="10.5">12, потом 24, потом 54</text>

<line x1="26" y1="288" x2="674" y2="288" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="310" font-size="11">Пиры — строки с одинаковым значением ORDER BY окна. Кадр по умолчанию забирает их целиком, разом.</text>
<text class="cap" x="26" y="330" font-size="11">Лечится прямо сейчас: дописать в ORDER BY окна разбивающую колонку — ORDER BY linenum, pickkey.</text>
<text class="cap" x="26" y="350" font-size="11">На тестовых данных с уникальной сортировкой мина молчит, а в проде совпавшее время её взводит.</text>
`);
}

/* ---------------------------------------------------------------- d6.04 */

// Одиннадцать строк dbo.orderdetail лентой, и три слоя окна на одной и той же
// ленте: партиция решает «с кем», сортировка — «в каком порядке», кадр —
// «докуда считаем». Схема существует ради того, чтобы кадр перестал казаться
// частью сортировки: это отдельный, третий слой.
function buildFrameThreeLayers() {
  const S = "frame-three-layers";
  const okeys = [1, 1, 2, 2, 3, 3, 3, 4, 5, 5, 6];
  const X0 = 48, CW = 52, PITCH = 56;
  const cx = (i) => X0 + i * PITCH;

  // Лента из одиннадцати клеток: подпись — orderkey, состояние задаёт заливку.
  const strip = (y, fill) => okeys.map((k, i) =>
    `<rect class="${fill(i)}" x="${cx(i)}" y="${y}" width="${CW}" height="26" rx="6"/>
<text class="mono" x="${cx(i) + CW / 2}" y="${y + 17}" font-size="12" text-anchor="middle">${k}</text>`).join("\n");

  const CUR = 4;

  return svgWrap("0 0 700 400", S, "У окна три слоя, и кадр — третий", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .plain { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .lit { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.1; }
.dg-${S} .cur { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2.2; }
.dg-${S} .dim { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 3 3; }
.dg-${S} .band { fill: none; stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .peer { fill: none; stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .frame { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 5 3; }
.dg-${S} .flow { stroke: var(--muted); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">У окна три слоя, а не два — и путать их нельзя</text>
<text class="mono" x="26" y="52" font-size="11">SUM(qtyordered) OVER (ORDER BY orderkey ...) — одиннадцать строк dbo.orderdetail</text>

<text class="cap" x="26" y="80" font-size="11" font-weight="600">слой 1 — PARTITION BY</text>
<text class="cap" x="196" y="80" font-size="11">с кем строка вообще лежит в одном окне</text>
<rect class="band" x="${X0 - 5}" y="87" width="${cx(10) + CW - X0 + 10}" height="36" rx="9"/>
${strip(92, () => "plain")}
<text class="cap" x="${X0}" y="138" font-size="10">PARTITION BY здесь не написан — значит окно одно на все одиннадцать строк</text>

<text class="cap" x="26" y="166" font-size="11" font-weight="600">слой 2 — ORDER BY</text>
<text class="cap" x="196" y="166" font-size="11">в каком порядке они лежат внутри окна</text>
${strip(176, () => "plain")}
<line class="flow" x1="${X0}" y1="210" x2="${cx(10) + CW}" y2="210" marker-end="url(#${S}-arrow)"/>
<path class="peer" d="M${cx(4) - 3},216 L${cx(4) - 3},223 L${cx(6) + CW + 3},223 L${cx(6) + CW + 3},216"/>
<text class="cap t-gold" x="${cx(5) + CW / 2}" y="237" font-size="10" text-anchor="middle">у трёх строк orderkey = 3: они ровесники</text>

<text class="cap" x="26" y="256" font-size="11" font-weight="600">слой 3 — кадр</text>
<text class="cap" x="196" y="256" font-size="11">какие из них попадут в расчёт для этой строки</text>
${strip(266, (i) => (i === CUR ? "cur" : i < CUR ? "lit" : "dim"))}
<rect class="frame" x="${X0 - 5}" y="261" width="${cx(CUR) + CW - X0 + 10}" height="36" rx="9"/>
<text class="cap t-accent" x="${X0}" y="312" font-size="10">кадр текущей строки — свой у каждой строки, а какой именно, решают слова ROWS и RANGE</text>

<line x1="26" y1="332" x2="674" y2="332" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="354" font-size="11">Партиция — «с кем», сортировка — «в каком порядке», кадр — «докуда считаем».</text>
<text class="cap" x="26" y="374" font-size="11">ORDER BY внутри OVER не считает — он сортирует. Считает кадр; ORDER BY лишь молча его подставляет.</text>
<text class="cap" x="26" y="394" font-size="11">Кадр есть всегда: не написал сам — его подставил сервер.</text>
`);
}

// Та же лента из одиннадцати строк, но кадр «по текущую строку» очерчен дважды:
// сверху ROWS, снизу RANGE. Схема существует ради того, чтобы стало видно, как
// RANGE забирает ровесников, лежащих ниже текущей строки, — и почему счётчик
// в кадре у него не 5, а 7.
function buildFrameRowsVsRange() {
  const S = "frame-rows-vs-range";
  const okeys = [1, 1, 2, 2, 3, 3, 3, 4, 5, 5, 6];
  const inRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const inRange = [2, 2, 4, 4, 7, 7, 7, 8, 10, 10, 11];
  const X0 = 48, CW = 52, PITCH = 56, CUR = 4;
  const cx = (i) => X0 + i * PITCH;
  const MID = cx(CUR) + CW / 2;

  // Лента с числом строк в кадре под каждой клеткой. ahead красит золотом
  // клетки, попавшие в кадр, хотя лежат они ниже текущей строки.
  const strip = (y, last, ahead, counts) => okeys.map((k, i) => {
    const cls = i === CUR ? "cur" : i <= last ? (ahead && i > CUR ? "peek" : "lit") : "dim";
    return `<rect class="${cls}" x="${cx(i)}" y="${y}" width="${CW}" height="26" rx="6"/>
<text class="mono" x="${cx(i) + CW / 2}" y="${y + 17}" font-size="12" text-anchor="middle">${k}</text>
<text class="mono ${i === CUR ? "t-accent" : "cap"}" x="${cx(i) + CW / 2}" y="${y + 42}" font-size="11" ${i === CUR ? 'font-weight="700"' : ""} text-anchor="middle">${counts[i]}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 378", S, "ROWS считает строки, RANGE считает значения", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .lit { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.1; }
.dg-${S} .peek { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .cur { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2.2; }
.dg-${S} .dim { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 3 3; }
.dg-${S} .frame { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 5 3; }
.dg-${S} .frameg { fill: none; stroke: var(--gold); stroke-width: 1.5; stroke-dasharray: 5 3; }
.dg-${S} .flow { stroke: var(--accent); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">ROWS отсчитывает физические строки. RANGE отсчитывает значения ключа сортировки</text>
<text class="mono" x="26" y="52" font-size="11">COUNT(*) OVER (ORDER BY orderkey ...) — в клетках orderkey, под ними число строк в кадре</text>

<text class="cap" x="26" y="82" font-size="11" font-weight="600">ROWS — считает строки</text>
<text class="cap t-accent" x="${MID}" y="82" font-size="10" text-anchor="middle">текущая строка</text>
<line class="flow" x1="${MID}" y1="88" x2="${MID}" y2="102" marker-end="url(#${S}-arrow-accent)"/>
${strip(106, CUR, false, inRows)}
<rect class="frame" x="${X0 - 5}" y="101" width="${cx(CUR) + CW - X0 + 10}" height="36" rx="9"/>
<text class="cap" x="${X0}" y="166" font-size="10.5">кадр упирается ровно в текущую строку — в нём пять строк, и дальше он не смотрит</text>

<text class="cap" x="26" y="200" font-size="11" font-weight="600">RANGE — считает значения</text>
<line class="flow" x1="${MID}" y1="192" x2="${MID}" y2="206" marker-end="url(#${S}-arrow-accent)"/>
${strip(210, 6, true, inRange)}
<rect class="frameg" x="${X0 - 5}" y="205" width="${cx(6) + CW - X0 + 10}" height="36" rx="9"/>
<text class="cap t-gold" x="${X0}" y="270" font-size="10.5">кадр тянется до последнего ровесника текущей строки — в нём семь строк</text>
<text class="cap t-gold" x="${X0}" y="288" font-size="10.5">две золотые клетки лежат ниже текущей строки, а в кадр попали: у них тот же orderkey</text>

<line x1="26" y1="310" x2="674" y2="310" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="332" font-size="11">CURRENT ROW у RANGE значит не «эта строка», а «все строки с тем же значением ORDER BY».</text>
<text class="cap" x="26" y="352" font-size="11">Умолчание — RANGE. На данных без ничьих ROWS и RANGE дают одно и то же, и разницы не видно.</text>
<text class="cap" x="26" y="372" font-size="11">Нужен построчный нарастающий итог — пиши ROWS явно: это рефлекс, а не понимание.</text>
`);
}

// Пять границ кадра, разложенные по одному окну, и три готовых кадра, собранных
// из этих границ. Схема существует ради того, чтобы синтаксис ROWS BETWEEN
// перестал быть заклинанием: слева места на ленте, справа — что из них выходит.
function buildFrameBounds() {
  const S = "frame-bounds";
  const N = 9, CUR = 4;
  const RY = 84, RP = 24, RH = 20;

  // Вертикальное окно из девяти строк с отмеченной текущей.
  const column = Array.from({ length: N }, (_, i) =>
    `<rect class="${i === CUR ? "cur" : "plain"}" x="204" y="${RY + i * RP}" width="92" height="${RH}" rx="5"/>`).join("\n");

  // Подпись границы: имя, перевод и рисочка к нужной строке окна.
  const bound = (i, name, gloss) => {
    const cy = RY + i * RP + 13;
    return `<text class="mono" x="188" y="${cy - 5}" font-size="10.5" text-anchor="end">${name}</text>
<text class="cap" x="188" y="${cy + 9}" font-size="10" text-anchor="end">${gloss}</text>
<line class="tick" x1="192" y1="${cy}" x2="202" y2="${cy}"/>`;
  };

  // Мини-лента справа: девять клеточек, закрашен диапазон от a до b.
  const mini = (y, a, b) => Array.from({ length: N }, (_, i) =>
    `<rect class="${i === CUR ? "minicur" : i >= a && i <= b ? "minilit" : "minioff"}" x="${340 + i * 14}" y="${y}" width="12" height="14" rx="3"/>`).join("\n");

  return svgWrap("0 0 700 396", S, "Пять границ, из которых собирается кадр", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .plain { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .cur { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2; }
.dg-${S} .tick { stroke: var(--muted); stroke-width: 1.2; }
.dg-${S} .minilit { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1; }
.dg-${S} .minicur { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.8; }
.dg-${S} .minioff { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .divider { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Кадр пишется как ROWS BETWEEN «начало» AND «конец», и границ всего пять</text>
<text class="cap" x="26" y="50" font-size="11">Каждая может стоять и началом, и концом — отсюда все кадры, которые тебе понадобятся</text>

<line class="divider" x1="318" y1="66" x2="318" y2="330"/>
<text class="cap" x="250" y="76" font-size="10" text-anchor="middle">окно, строка за строкой</text>
${column}
${bound(0, "UNBOUNDED PRECEDING", "от самого начала окна")}
${bound(2, "N PRECEDING", "на N строк выше текущей")}
${bound(4, "CURRENT ROW", "текущая строка")}
${bound(6, "N FOLLOWING", "на N строк ниже текущей")}
${bound(8, "UNBOUNDED FOLLOWING", "до самого конца окна")}

<text class="cap" x="340" y="80" font-size="11" font-weight="600">что из них собирают чаще всего</text>
${mini(96, 0, CUR)}
<text class="mono" x="340" y="128" font-size="10">ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW</text>
<text class="cap t-accent" x="340" y="142" font-size="10.5">нарастающий итог, строка за строкой</text>

${mini(166, CUR - 1, CUR + 1)}
<text class="mono" x="340" y="198" font-size="10">ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING</text>
<text class="cap t-accent" x="340" y="212" font-size="10.5">скользящее среднее по трём соседям</text>

${mini(236, 0, N - 1)}
<text class="mono" x="340" y="268" font-size="10">ROWS BETWEEN UNBOUNDED PRECEDING</text>
<text class="mono" x="340" y="282" font-size="10">AND UNBOUNDED FOLLOWING</text>
<text class="cap t-accent" x="340" y="296" font-size="10.5">итог по всему окну, хотя ORDER BY на месте</text>

<line x1="26" y1="350" x2="674" y2="350" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="372" font-size="11">Короткая форма: написал только начало — концом молча встанет CURRENT ROW.</text>
<text class="cap" x="26" y="392" font-size="11">На краю окна кадр не выдумывает строк и не подставляет NULL — он просто становится короче.</text>
`);
}

/* ---------------------------------------------------------------- d6.05 */

// Три партии молока, выстроенные по сроку годности, и две стрелки от каждой
// строки: lag смотрит на шаг назад, lead — на шаг вперёд. Схема существует
// ради двух мыслей: «предыдущая» определяется ORDER BY окна, а NULL на краях —
// правильный ответ, потому что там строки физически нет.
function buildLagLeadShift() {
  const S = "lag-lead-shift";
  // lot, expdate, prev_exp, next_exp — вывод примера ноды
  const rows = [
    ["L0001", "2026-07-20", "NULL", "2026-07-24"],
    ["L0002", "2026-07-24", "2026-07-20", "2026-07-26"],
    ["L0013", "2026-07-26", "2026-07-24", "NULL"],
  ];
  const RY = 112, RP = 56, RH = 32;
  const cy = (i) => RY + i * RP + 16;

  const body = rows.map(([lot, exp, prev, next], i) => {
    const y = RY + i * RP;
    const nullPrev = prev === "NULL";
    const nullNext = next === "NULL";
    return `<rect class="${nullPrev ? "edge" : "side"}" x="60" y="${y}" width="120" height="${RH}" rx="7"/>
<text class="mono ${nullPrev ? "t-gold" : ""}" x="120" y="${y + 21}" font-size="11" text-anchor="middle">${prev}</text>
<rect class="row" x="220" y="${y}" width="144" height="${RH}" rx="7"/>
<text class="mono" x="230" y="${y + 21}" font-size="11">${lot}</text>
<text class="mono t-accent" x="356" y="${y + 21}" font-size="11" text-anchor="end">${exp}</text>
<rect class="${nullNext ? "edge" : "side"}" x="400" y="${y}" width="120" height="${RH}" rx="7"/>
<text class="mono ${nullNext ? "t-gold" : ""}" x="460" y="${y + 21}" font-size="11" text-anchor="middle">${next}</text>`;
  }).join("\n");

  // Стрелка lag: от строки выше — влево и вниз, в ячейку prev текущей строки.
  const lags = [1, 2].map((i) =>
    `<path class="wire" d="M216,${cy(i - 1)} C194,${cy(i - 1)} 200,${cy(i)} 184,${cy(i)}" marker-end="url(#${S}-arrow-accent)"/>`).join("\n");
  // Стрелка lead: от строки ниже — вправо и вверх, в ячейку next текущей строки.
  const leads = [0, 1].map((i) =>
    `<path class="wire" d="M368,${cy(i + 1)} C390,${cy(i + 1)} 384,${cy(i)} 396,${cy(i)}" marker-end="url(#${S}-arrow-accent)"/>`).join("\n");

  return svgWrap("0 0 700 354", S, "lag смотрит назад, lead — вперёд", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .row { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .side { fill: var(--paper); stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .edge { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .wire { fill: none; stroke: var(--accent); stroke-width: 1.4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Впервые одной строке нужна соседняя — и второго прохода по таблице для этого не нужно</text>
<text class="mono" x="26" y="52" font-size="11">lag(expdate) OVER (ORDER BY expdate), lead(expdate) OVER (ORDER BY expdate)</text>

<text class="mono" x="120" y="82" font-size="10.5" text-anchor="middle">lag(expdate)</text>
<text class="cap" x="120" y="96" font-size="10" text-anchor="middle">шаг назад по окну</text>
<text class="cap" x="292" y="82" font-size="10.5" text-anchor="middle" font-weight="600">партии молока</text>
<text class="cap" x="292" y="96" font-size="10" text-anchor="middle">порядок задан ORDER BY expdate</text>
<text class="mono" x="460" y="82" font-size="10.5" text-anchor="middle">lead(expdate)</text>
<text class="cap" x="460" y="96" font-size="10" text-anchor="middle">шаг вперёд по окну</text>

${body}
${lags}
${leads}

<text class="cap t-gold" x="540" y="${cy(0) + 4}" font-size="10">первая в ряду:</text>
<text class="cap t-gold" x="540" y="${cy(0) + 18}" font-size="10">предыдущей нет</text>
<text class="cap t-gold" x="540" y="${cy(2) + 4}" font-size="10">последняя в ряду:</text>
<text class="cap t-gold" x="540" y="${cy(2) + 18}" font-size="10">следующей нет</text>

<line x1="26" y1="286" x2="674" y2="286" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="308" font-size="11">Что такое «предыдущая», решает не таблица, а ORDER BY внутри OVER: другой порядок — другой сосед.</text>
<text class="cap" x="26" y="328" font-size="11">NULL на краях — правильный ответ, а не поломка: строки там физически нет, и сервер честно об этом молчит.</text>
<text class="cap" x="26" y="348" font-size="11">Полная форма lag(колонка, N, чем закрыть край): N — на сколько шагов отступить, третий аргумент — вместо NULL.</text>
`);
}

// Кадр по умолчанию в трёх положениях: его левый край стоит на месте, а правый
// едет вместе с текущей строкой. Схема существует ради главной ловушки темы —
// last_value без явного кадра возвращает саму текущую строку, потому что она
// и есть последняя строка кадра.
function buildLastvalueFrame() {
  const S = "lastvalue-frame";
  const lots = ["L0001", "L0002", "L0013"];
  const exps = ["2026-07-20", "2026-07-24", "2026-07-26"];
  const X0 = 130, CW = 92, PITCH = 96;
  const cx = (i) => X0 + i * PITCH;

  const strip = (y, last) => exps.map((e, i) => {
    const cls = i === last ? "cur" : i <= last ? "lit" : "dim";
    return `<rect class="${cls}" x="${cx(i)}" y="${y}" width="${CW}" height="26" rx="6"/>
<text class="mono ${i <= last ? "" : "faint"}" x="${cx(i) + CW / 2}" y="${y + 17}" font-size="11" text-anchor="middle">${e}</text>`;
  }).join("\n");

  const band = (y, last, label, first, lastv, tone, tail) => `
<text class="cap" x="26" y="${y + 17}" font-size="10.5">${label}</text>
${strip(y, last)}
<rect class="frame" x="${X0 - 5}" y="${y - 5}" width="${cx(last) + CW - X0 + 10}" height="36" rx="8"/>
<text class="mono t-accent" x="436" y="${y + 11}" font-size="10">first_value → ${first}</text>
<text class="mono t-${tone}" x="436" y="${y + 25}" font-size="10">last_value → ${lastv}${tail}</text>`;

  return svgWrap("0 0 700 400", S, "Почему last_value показывает текущую строку", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .faint { fill: var(--line); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .lit { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.1; }
.dg-${S} .cur { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2.2; }
.dg-${S} .dim { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 3 3; }
.dg-${S} .frame { fill: none; stroke: var(--accent); stroke-width: 1.4; stroke-dasharray: 5 3; }
.dg-${S} .divider { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Левый край кадра стоит на месте, правый едет вместе с текущей строкой</text>
<text class="mono" x="26" y="52" font-size="11">OVER (ORDER BY expdate) — кадр не написан, значит его подставил сервер</text>

${lots.map((l, i) => `<text class="mono cap" x="${cx(i) + CW / 2}" y="84" font-size="10" text-anchor="middle">${l}</text>`).join("\n")}

${band(96, 0, "стоим на L0001", "2026-07-20", "2026-07-20", "bad", " — сама текущая")}
${band(140, 1, "стоим на L0002", "2026-07-20", "2026-07-24", "bad", " — сама текущая")}
${band(184, 2, "стоим на L0013", "2026-07-20", "2026-07-26", "bad", " — сама текущая")}

<text class="cap" x="26" y="232" font-size="10.5">Жирная рамка — текущая строка, пунктир — кадр. Последняя строка кадра всегда совпадает с текущей.</text>
<line class="divider" x1="26" y1="248" x2="674" y2="248"/>

<text class="cap" x="26" y="270" font-size="10.5" font-weight="600">а теперь кадр растянут руками на всё окно:</text>
<text class="mono" x="26" y="286" font-size="10">ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING</text>
${band(302, 2, "любая строка", "2026-07-20", "2026-07-26", "ok", " — та самая")}

<line x1="26" y1="348" x2="674" y2="348" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="370" font-size="11">Ошибку не поймает никто: запрос безупречен, план молчит, а на товаре с одной партией её не видно.</text>
<text class="cap" x="26" y="390" font-size="11">Привычка короче лечения: нужна последняя строка — переверни ORDER BY и возьми first_value.</text>
`);
}

/* ---------------------------------------------------------------- d6.06 */

// Две ячейки склада, пронумерованные внутри себя, обёрнутые в CTE и обрезанные
// снаружи по номеру. Схема существует ради того, чтобы приём читался как одно
// движение из трёх шагов, и ради того, что отсекается он внутри каждой группы
// отдельно, а не по общему списку.
function buildTopnThreeSteps() {
  const S = "topn-three-steps";
  // ячейка, строки: skuid, qty, rn, прошла ли фильтр rn <= 2
  const cells = [
    ["A-01-01", [["MILK-1L", "60.000", 1], ["MILK-1L", "48.000", 2]], 110],
    ["C-01-01", [["APPLE-KG", "55.500", 1], ["EGGS-C1", "45.000", 2], ["KEFIR-05", "40.000", 3]], 190],
  ];

  // Окно-ячейка: заголовок и строки с номером. cut — обрезать ли по rn <= 2.
  const box = (x, name, list, y, cut) => {
    const rows = list.map(([sku, qty, rn], i) => {
      const ry = y + 24 + i * 20;
      const out = cut && rn > 2;
      return `<rect class="${out ? "outrow" : "inrow"}" x="${x + 8}" y="${ry}" width="168" height="17" rx="4"/>
<text class="mono ${out ? "faint" : ""}" x="${x + 14}" y="${ry + 12}" font-size="9.5">${sku}</text>
<text class="mono ${out ? "faint" : "cap"}" x="${x + 170}" y="${ry + 12}" font-size="9.5" text-anchor="end">${qty}</text>
<rect class="${out ? "nout" : "ncell"}" x="${x + 182}" y="${ry}" width="26" height="17" rx="4"/>
<text class="mono ${out ? "faint" : "t-accent"}" x="${x + 195}" y="${ry + 12}" font-size="10" font-weight="700" text-anchor="middle">${rn}</text>
${out ? `<line class="strike" x1="${x + 8}" y1="${ry + 8}" x2="${x + 208}" y2="${ry + 8}"/>` : ""}`;
    }).join("\n");
    const h = 24 + list.length * 20 + 6;
    return `<rect class="win" x="${x}" y="${y}" width="216" height="${h}" rx="9"/>
<text class="mono" x="${x + 10}" y="${y + 16}" font-size="10" font-weight="700">ячейка ${name}</text>
${rows}`;
  };

  return svgWrap("0 0 700 370", S, "Три шага, и они всегда одни и те же", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .faint { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .win { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .inrow { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .outrow { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 3 3; }
.dg-${S} .ncell { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1; }
.dg-${S} .nout { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .strike { stroke: var(--bad); stroke-width: 1.2; }
.dg-${S} .cte { fill: var(--paper); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .flow { stroke: var(--muted); stroke-width: 1.4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Одно движение из трёх шагов — им закрывается и «топ N в группе», и дедупликация</text>
<text class="mono" x="26" y="52" font-size="11">row_number() OVER (PARTITION BY loc ORDER BY qty DESC, lot) — две ячейки dbo.stock</text>

<text class="cap" x="26" y="82" font-size="10.5" font-weight="600">шаг 1 — пронумеровать внутри группы</text>
<text class="cap" x="26" y="96" font-size="10">в каждой ячейке счёт с единицы</text>
<text class="cap" x="278" y="82" font-size="10.5" font-weight="600">шаг 2 — обернуть в CTE</text>
<text class="cap" x="278" y="96" font-size="10">дать результату имя</text>
<text class="cap" x="458" y="82" font-size="10.5" font-weight="600">шаг 3 — отфильтровать снаружи</text>
<text class="cap" x="458" y="96" font-size="10">WHERE rn &lt;= 2 по готовой колонке</text>

${box(26, cells[0][0], cells[0][1], cells[0][2], false)}
${box(26, cells[1][0], cells[1][1], cells[1][2], false)}
<line class="flow" x1="248" y1="194" x2="272" y2="194" marker-end="url(#${S}-arrow)"/>
<rect class="cte" x="278" y="152" width="152" height="84" rx="9"/>
<text class="mono" x="290" y="172" font-size="10.5" font-weight="700">WITH numbered</text>
<text class="mono" x="290" y="190" font-size="10">loc | skuid</text>
<text class="mono" x="290" y="206" font-size="10">lot | qty</text>
<text class="mono t-accent" x="290" y="222" font-size="10">rn</text>
<text class="cap" x="278" y="254" font-size="10">внутри — окно,</text>
<text class="cap" x="278" y="268" font-size="10">снаружи — обычная</text>
<text class="cap" x="278" y="282" font-size="10">таблица с колонкой rn</text>
<line class="flow" x1="436" y1="194" x2="452" y2="194" marker-end="url(#${S}-arrow)"/>
${box(458, cells[0][0], cells[0][1], cells[0][2], true)}
${box(458, cells[1][0], cells[1][1], cells[1][2], true)}

<line x1="26" y1="304" x2="674" y2="304" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="326" font-size="11">Пронумеровал внутри группы → обернул в CTE → отфильтровал по номеру. Три шага, всегда одни и те же.</text>
<text class="cap" x="26" y="346" font-size="11">CTE тут не украшение: окно в WHERE писать нельзя, поэтому номер считают внутри, а фильтруют снаружи.</text>
<text class="cap" x="26" y="366" font-size="11">Отсекается внутри каждой группы отдельно: кефир на 40 вылетел, а хлеб на 30 в своей ячейке уцелел.</text>
`);
}

// Одна и та же граница «топ-3», проведённая тремя разными функциями по товарам
// dbo.sku с ничьёй на сроке 365. Схема существует ради вопроса, который надо
// задавать себе вслух: что должно случиться, если на границе ничья.
function buildTieThreeRanks() {
  const S = "tie-three-ranks";
  // skuid, срок, номер у row_number / rank / dense_rank
  const items = [
    ["TEA-100", "730", 1, 1, 1],
    ["COFFEE-250", "540", 2, 2, 2],
    ["FLOUR-2KG", "365", 3, 3, 3],
    ["SUGAR-1KG", "365", 4, 3, 3],
    ["BUTTER-180", "60", 5, 5, 4],
  ];
  const RY = 138, RP = 22;
  const cols = [
    [26, "row_number()", "нужно ровно N строк", "WHERE rn &lt;= 3", 3, 2, ["пришло 3 строки", "сахар выкинут, хотя срок тот же"]],
    [246, "rank()", "нужны все, кто в ничьей", "WHERE rnk &lt;= 3", 4, 3, ["пришло 4 строки", "третье место разделили двое"]],
    [466, "dense_rank()", "нужно N разных значений", "WHERE drnk &lt;= 4", 5, 5, ["пришло 5 строк", "зато ровно 4 разных срока"]],
  ];

  const panel = ([x, fn, use, flt, keep, cutAfter, notes], ci) => {
    const rows = items.map((it, i) => {
      const y = RY + i * RP;
      const n = it[2 + ci];
      const on = i < keep;
      const tie = it[1] === "365";
      return `<rect class="${on ? (tie ? "tierow" : "onrow") : "offrow"}" x="${x}" y="${y}" width="208" height="19" rx="4"/>
<text class="mono ${on ? "" : "faint"}" x="${x + 8}" y="${y + 13}" font-size="9.5">${it[0]}</text>
<text class="mono ${on ? "cap" : "faint"}" x="${x + 148}" y="${y + 13}" font-size="9.5" text-anchor="end">${it[1]}</text>
<text class="mono ${on ? "t-accent" : "faint"}" x="${x + 186}" y="${y + 13}" font-size="10" font-weight="700" text-anchor="middle">${n}</text>`;
    }).join("\n");
    const cutY = RY + (cutAfter + 1) * RP - 1.5;
    return `<text class="mono" x="${x}" y="${94}" font-size="11" font-weight="700">${fn}</text>
<text class="cap t-accent" x="${x}" y="${110}" font-size="10">${use}</text>
<text class="mono cap" x="${x}" y="${126}" font-size="10">${flt}</text>
${rows}
${cutAfter < items.length - 1 ? `<line class="cut" x1="${x - 4}" y1="${cutY}" x2="${x + 212}" y2="${cutY}"/>` : ""}
<text class="cap" x="${x}" y="${272}" font-size="10.5" font-weight="600">${notes[0]}</text>
<text class="cap" x="${x}" y="${288}" font-size="10">${notes[1]}</text>`;
  };

  return svgWrap("0 0 700 382", S, "Что делать, если на границе ничья", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .faint { fill: var(--line); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .onrow { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
.dg-${S} .tierow { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1; }
.dg-${S} .offrow { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 3 3; }
.dg-${S} .cut { stroke: var(--bad); stroke-width: 1.5; stroke-dasharray: 5 3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Один и тот же топ-3, проведённый тремя функциями — и три разных ответа на ничью</text>
<text class="mono" x="26" y="52" font-size="11">dbo.sku, uom = 'PC', ORDER BY shelflife DESC — на границе ничья: срок 365 у двоих</text>
<text class="cap t-gold" x="26" y="70" font-size="10">золотые строки — ничья по сроку годности; красный пунктир — где прошла отсечка</text>

${cols.map(panel).join("\n")}

<line x1="26" y1="310" x2="674" y2="310" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="332" font-size="11">Проверочный вопрос вслух: что должно случиться, если на границе ничья?</text>
<text class="cap" x="26" y="352" font-size="11">«Выкинуть лишнего, мне нужно ровно N» — row_number. «Вернуть обоих, иначе отчёт соврёт» — rank.</text>
<text class="cap" x="26" y="372" font-size="11">Не можешь ответить — задача поставлена не до конца, и идти надо не к клавиатуре, а к постановщику.</text>
`);
}

/* ---------------------------------------------------------------- d6.07 */

// Ряд ячеек A с дырками: занятые клетки, дуги lead от соседа к соседу и скобки
// островов и разрывов под линейкой. Схема существует ради того, что разрыв —
// это свойство пары соседей, а lead кладёт пару соседей в одну строку.
function buildGapsIslandsRuler() {
  const S = "gaps-islands-ruler";
  const busy = new Set([1, 2, 3, 7, 8, 12, 13, 14]);
  const X0 = 48, CW = 40, PITCH = 44;
  const cx = (n) => X0 + (n - 1) * PITCH;
  const mid = (n) => cx(n) + CW / 2;

  const ruler = Array.from({ length: 14 }, (_, i) => {
    const n = i + 1;
    const on = busy.has(n);
    return `<rect class="${on ? "busy" : "free"}" x="${cx(n)}" y="112" width="${CW}" height="30" rx="6"/>
<text class="mono ${on ? "" : "faint"}" x="${mid(n)}" y="132" font-size="12" text-anchor="middle">${n}</text>`;
  }).join("\n");

  // Дуга lead: от занятой клетки к следующей занятой. Через дырку она длинная.
  const list = [1, 2, 3, 7, 8, 12, 13, 14];
  const arcs = list.slice(0, -1).map((n, i) => {
    const to = list[i + 1];
    const jump = to - n > 1;
    const top = jump ? 84 : 96;
    return `<path class="${jump ? "arcbad" : "arc"}" d="M${mid(n)},108 C${mid(n)},${top} ${mid(to)},${top} ${mid(to)},108" marker-end="url(#${S}-arrow)"/>`;
  }).join("\n");

  // Скобки под линейкой: острова и разрывы вплотную закрывают весь ряд.
  const spans = [[1, 3, "остров 1–3", true], [4, 6, "разрыв 4–6", false],
    [7, 8, "остров 7–8", true], [9, 11, "разрыв 9–11", false], [12, 14, "остров 12–14", true]];
  const brackets = spans.map(([a, b, label, isle]) =>
    `<path class="${isle ? "brIsle" : "brGap"}" d="M${cx(a)},148 L${cx(a)},156 L${cx(b) + CW},156 L${cx(b) + CW},148"/>
<text class="cap ${isle ? "t-accent" : "t-gold"}" x="${(cx(a) + cx(b) + CW) / 2}" y="172" font-size="10" text-anchor="middle">${label}</text>`).join("\n");

  return svgWrap("0 0 700 366", S, "Остров, разрыв и пара соседей", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .faint { fill: var(--line); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .busy { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .free { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 3 3; }
.dg-${S} .arc { fill: none; stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .arcbad { fill: none; stroke: var(--gold); stroke-width: 1.6; }
.dg-${S} .brIsle { fill: none; stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .brGap { fill: none; stroke: var(--gold); stroke-width: 1.4; stroke-dasharray: 4 3; }
.dg-${S} .cell { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Остров — непрерывный кусок, разрыв — дырка между островами</text>
<text class="mono" x="26" y="52" font-size="11">WITH cell(n) AS (VALUES (1),(2),(3),(7),(8),(12),(13),(14))</text>
<text class="cap" x="26" y="70" font-size="10.5">дуги — lead(n): он подтягивает соседа в ту же строку, и длинная дуга значит дырку</text>

${arcs}
${ruler}
${brackets}

<text class="cap" x="48" y="204" font-size="10.5" font-weight="600">что вернул запрос</text>
<text class="cap" x="88" y="220" font-size="9.5" text-anchor="middle">gap_from</text>
<text class="cap" x="152" y="220" font-size="9.5" text-anchor="middle">gap_to</text>
<rect class="cell" x="48" y="226" width="140" height="20" rx="5"/>
<text class="mono" x="88" y="240" font-size="11" text-anchor="middle">4</text>
<text class="mono" x="152" y="240" font-size="11" text-anchor="middle">6</text>
<rect class="cell" x="48" y="250" width="140" height="20" rx="5"/>
<text class="mono" x="88" y="264" font-size="11" text-anchor="middle">9</text>
<text class="mono" x="152" y="264" font-size="11" text-anchor="middle">11</text>

<text class="cap" x="230" y="220" font-size="10.5">Разрыв — свойство пары соседей, а не одной строки.</text>
<text class="cap" x="230" y="238" font-size="10.5">Условие next_n − n &gt; 1 значит «между ними что-то пропало»,</text>
<text class="cap" x="230" y="256" font-size="10.5">и пропало ровно от n + 1 до next_n − 1.</text>
<text class="cap" x="230" y="280" font-size="10.5">У последней строки next_n = NULL, предикат NULL &gt; 1 даёт</text>
<text class="cap" x="230" y="298" font-size="10.5">UNKNOWN — строка отваливается сама, и это правильно.</text>

<line x1="26" y1="316" x2="674" y2="316" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="338" font-size="11">Глаз собирает числа в кучки мгновенно, а в таблице кучку не за что зацепить: «идут подряд» — не колонка.</text>
<text class="cap" x="26" y="358" font-size="11">Острова и разрывы — две стороны одной монеты, но разрывы ищутся заметно проще: с них и начинают.</text>
`);
}

// Две лестницы рядом: номер ячейки n и номер строки rn. Внутри острова обе
// растут на единицу, и расстояние между ними не меняется, а на разрыве n
// прыгает. Схема существует ради того, чтобы n − row_number() перестало быть
// фокусом: это просто расстояние между двумя одинаково растущими величинами.
function buildIslandConst() {
  const S = "island-const";
  // n, rn, grp = n - rn, ярлык острова
  const rows = [
    [1, 1, 0, "a"], [2, 2, 0, "a"], [3, 3, 0, "a"],
    [7, 4, 3, "b"], [8, 5, 3, "b"],
    [12, 6, 6, "c"], [13, 7, 6, "c"], [14, 8, 6, "c"],
  ];
  const RY = 112, RP = 24;
  // График: восемь точек по горизонтали, значения 1..14 по вертикали.
  const px = (i) => 356 + i * 40;
  const py = (v) => 266 - (v - 1) * 12.3;

  const table = rows.map(([n, rn, grp, tag], i) => {
    const y = RY + i * RP;
    return `<rect class="trow" x="26" y="${y}" width="272" height="20" rx="5"/>
<text class="mono" x="66" y="${y + 14}" font-size="11" text-anchor="middle">${n}</text>
<text class="mono cap" x="146" y="${y + 14}" font-size="11" text-anchor="middle">${rn}</text>
<rect class="g-${tag}" x="212" y="${y + 1}" width="80" height="18" rx="4"/>
<text class="mono" x="252" y="${y + 14}" font-size="11" font-weight="700" text-anchor="middle">${grp}</text>`;
  }).join("\n");

  const gapLines = rows.map(([n, rn], i) =>
    `<line class="gapline" x1="${px(i)}" y1="${py(rn)}" x2="${px(i)}" y2="${py(n)}"/>`).join("\n");
  const dots = (key, cls) => rows.map((r, i) =>
    `<circle class="${cls}" cx="${px(i)}" cy="${py(key === "n" ? r[0] : r[1])}" r="3"/>`).join("\n");
  const line = (key, cls) =>
    `<polyline class="${cls}" points="${rows.map((r, i) => `${px(i)},${py(key === "n" ? r[0] : r[1])}`).join(" ")}"/>`;

  return svgWrap("0 0 700 388", S, "Разность, которая не меняется внутри острова", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .trow { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .g-a { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.1; }
.dg-${S} .g-b { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.1; }
.dg-${S} .g-c { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.1; }
.dg-${S} .ln { fill: none; stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .lr { fill: none; stroke: var(--muted); stroke-width: 1.3; stroke-dasharray: 4 3; }
.dg-${S} .dn { fill: var(--accent); }
.dg-${S} .dr { fill: var(--muted); }
.dg-${S} .gapline { stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .divider { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Общего признака у острова в данных нет — его изготавливают одной строкой арифметики</text>
<text class="mono" x="26" y="52" font-size="11">n − row_number() OVER (ORDER BY n) AS grp</text>

<line class="divider" x1="330" y1="68" x2="330" y2="306"/>
<text class="mono" x="66" y="102" font-size="10" text-anchor="middle">n</text>
<text class="mono cap" x="146" y="102" font-size="10" text-anchor="middle">rn</text>
<text class="mono" x="252" y="102" font-size="10" text-anchor="middle">n − rn</text>
${table}

<text class="cap" x="352" y="88" font-size="10.5">цвет ячейки n − rn — остров; золотая палочка — сама разность</text>
${gapLines}
${line("rn", "lr")}
${line("n", "ln")}
${dots("rn", "dr")}
${dots("n", "dn")}
<text class="cap t-accent" x="644" y="${py(14) + 4}" font-size="10">n</text>
<text class="cap" x="644" y="${py(8) + 4}" font-size="10">rn</text>
<text class="cap t-gold" x="352" y="286" font-size="10">внутри острова длина палочки не меняется, на разрыве растёт</text>
<text class="cap t-gold" x="352" y="300" font-size="10">у первого острова она нулевая: n и rn там совпали</text>

<line x1="26" y1="320" x2="674" y2="320" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="342" font-size="11">Внутри острова n и rn растут на единицу вместе, значит их разность не меняется вообще.</text>
<text class="cap" x="26" y="362" font-size="11">На разрыве n перепрыгивает через несколько чисел, а rn шагает на единицу — разность подскакивает.</text>
<text class="cap" x="26" y="382" font-size="11">Само число в grp не значит ничего: важно лишь, что внутри острова оно одно, а у разных островов разное.</text>
`);
}

// Второй способ: флаг «здесь начинается остров» и нарастающая сумма флагов,
// превращающая метки в номера островов. Схема существует ради общности приёма:
// внутри CASE может стоять любое условие непрерывности, а не только арифметика.
function buildLagFlagsSum() {
  const S = "lag-flags-sum";
  // n, lag(n), is_start, grp
  const rows = [
    [1, "NULL", 1, 1], [2, "1", 0, 1], [3, "2", 0, 1],
    [7, "3", 1, 2], [8, "7", 0, 2],
    [12, "8", 1, 3], [13, "12", 0, 3], [14, "13", 0, 3],
  ];
  const RY = 110, RP = 24;

  const table = rows.map(([n, lg, flag, grp], i) => {
    const y = RY + i * RP;
    return `<rect class="trow" x="26" y="${y}" width="300" height="20" rx="5"/>
<text class="mono" x="56" y="${y + 14}" font-size="11" text-anchor="middle">${n}</text>
<text class="mono ${lg === "NULL" ? "t-gold" : "cap"}" x="120" y="${y + 14}" font-size="11" text-anchor="middle">${lg}</text>
<rect class="${flag ? "flagon" : "flagoff"}" x="166" y="${y + 1}" width="60" height="18" rx="4"/>
<text class="mono ${flag ? "t-bad" : "cap"}" x="196" y="${y + 14}" font-size="11" ${flag ? 'font-weight="700"' : ""} text-anchor="middle">${flag}</text>
<rect class="grpcell" x="234" y="${y + 1}" width="60" height="18" rx="4"/>
<text class="mono t-accent" x="264" y="${y + 14}" font-size="11" font-weight="700" text-anchor="middle">${grp}</text>`;
  }).join("\n");

  // Скобка острова: стягивает строки с одинаковым grp.
  const isle = (a, b, name, cells) => {
    const y1 = RY + a * RP, y2 = RY + b * RP + 20, mid = (y1 + y2) / 2;
    return `<path class="brace" d="M334,${y1} L342,${y1} L342,${y2} L334,${y2}"/>
<text class="cap t-accent" x="350" y="${mid - 3}" font-size="10.5" font-weight="600">${name}</text>
<text class="cap" x="350" y="${mid + 11}" font-size="10">${cells}</text>`;
  };

  return svgWrap("0 0 700 380", S, "Флаг начала острова и нарастающая сумма", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .trow { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .flagon { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.1; }
.dg-${S} .flagoff { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .grpcell { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.1; }
.dg-${S} .brace { fill: none; stroke: var(--accent); stroke-width: 1.4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Пометить начало острова единицей и посчитать метки нарастающим итогом</text>
<text class="mono" x="26" y="52" font-size="10.5">CASE WHEN n = lag(n) OVER (ORDER BY n) + 1 THEN 0 ELSE 1 END AS is_start</text>
<text class="mono" x="26" y="70" font-size="10.5">sum(is_start) OVER (ORDER BY n ROWS UNBOUNDED PRECEDING) AS grp</text>

<text class="mono" x="56" y="100" font-size="10" text-anchor="middle">n</text>
<text class="mono cap" x="120" y="100" font-size="10" text-anchor="middle">lag(n)</text>
<text class="mono" x="196" y="100" font-size="10" text-anchor="middle">is_start</text>
<text class="mono" x="264" y="100" font-size="10" text-anchor="middle">grp</text>
${table}
${isle(0, 2, "остров 1", "ячейки 1–3")}
${isle(3, 4, "остров 2", "ячейки 7–8")}
${isle(5, 7, "остров 3", "ячейки 12–14")}

<text class="cap t-gold" x="470" y="140" font-size="10">у первой строки lag = NULL, а NULL + 1</text>
<text class="cap t-gold" x="470" y="154" font-size="10">тоже NULL: сравнение даёт UNKNOWN,</text>
<text class="cap t-gold" x="470" y="168" font-size="10">и CASE уходит в ELSE — флаг 1</text>
<text class="cap t-bad" x="470" y="220" font-size="10">единица стоит только там, где номер</text>
<text class="cap t-bad" x="470" y="234" font-size="10">не продолжает предыдущий: у 7 и у 12</text>
<text class="cap t-accent" x="470" y="272" font-size="10">сумма стоит на месте внутри острова</text>
<text class="cap t-accent" x="470" y="286" font-size="10">и подрастает на каждом новом</text>

<line x1="26" y1="312" x2="674" y2="312" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="334" font-size="11">Флаг пишут через равенство (THEN 0 ELSE 1) именно ради первой строки: у неё lag честно даёт NULL.</text>
<text class="cap" x="26" y="354" font-size="11">Нарастающая сумма флагов сама становится номером острова — и номера эти, в отличие от grp, осмысленные.</text>
<text class="cap" x="26" y="374" font-size="11">Внутри CASE можно любое условие: тот же статус, та же зона, «прошло не больше пятнадцати минут».</text>
`);
}

/* ---------------------------------------------------------------- реестр */

export const REGISTRY = {
  "window-vs-groupby": {
    id: "window-vs-groupby",
    title: "GROUP BY схлопывает строки, окно — нет",
    caption: "Слева те же тринадцать строк остатка с приписанной колонкой sum(qty) OVER (): ничего не свернулось, просто справа приехало число. Справа тот же sum без OVER — тринадцать строк заменились одной.",
    anchor: "Что здесь произошло",
    svg: buildWindowVsGroupby(),
  },
  "window-when": {
    id: "window-when",
    title: "Где в конвейере считается окно",
    caption: "Окна — новая ступенька логического порядка, между HAVING и ORDER BY. Всё остальное в ноде — следствия её места: и запрет 42P20 в WHERE, и count(*) OVER () поверх LIMIT.",
    anchor: "Когда именно считается окно",
    svg: buildWindowWhen(),
  },
  "rownum-pipeline": {
    id: "rownum-pipeline",
    title: "Три шага row_number()",
    caption: "Сначала PARTITION BY режет выборку на окна, потом ORDER BY внутри OVER выстраивает очередь в каждом окне, и только потом раздаются номера. Каждое окно считает с единицы заново.",
    anchor: "Что здесь произошло",
    svg: buildRownumPipeline(),
  },
  "rank-vs-dense": {
    id: "rank-vs-dense",
    title: "Четыре функции, одно окно, четыре ответа на ничью",
    caption: "Одиннадцать товаров, одна очередь по сроку годности. Различаются функции ровно одним: row_number() ничьих не признаёт, rank() оставляет после них провал, dense_rank() считает плотно, а ntile() режет строки, не глядя на равенство значений.",
    anchor: "Четыре функции, одно окно, четыре разных ответа",
    svg: buildRankVsDense(),
  },
  "run-frame": {
    id: "run-frame",
    title: "Кадр: что видит sum, стоя на строке",
    caption: "Слева окно без ORDER BY: кадра нет, видно всё сразу, и во всех строках одно число. Справа то же окно с ORDER BY linenum — кадр тянется от начала окна по текущую строку и с каждым шагом удлиняется.",
    anchor: "Что здесь произошло",
    svg: buildRunFrame(),
  },
  "run-peers": {
    id: "run-peers",
    title: "Ничья в ORDER BY окна двигает итог сразу на всех",
    caption: "Два задания на отбор с одинаковым linenum — пиры, и кадр по умолчанию забирает их разом: обоим написано 24, хотя в руках у сборщика 12. Сортировка по уникальному pickkey ничьих не оставляет.",
    anchor: "Ничьи в ORDER BY окна двигают итог сразу на всех",
    svg: buildRunPeers(),
  },
  "frame-three-layers": {
    id: "frame-three-layers",
    title: "У окна три слоя, и кадр — третий",
    caption: "Партиция решает, с кем строка лежит в одном окне. Сортировка — в каком порядке они там лежат. Кадр — какие из них попадут в расчёт для этой конкретной строки.",
    anchor: "Что здесь произошло",
    svg: buildFrameThreeLayers(),
  },
  "frame-rows-vs-range": {
    id: "frame-rows-vs-range",
    title: "ROWS считает строки, RANGE считает значения",
    caption: "Одна и та же лента строк и один и тот же ORDER BY. У ROWS кадр упирается в текущую строку, у RANGE — тянется до последнего её ровесника, и две клетки ниже текущей строки попадают в расчёт.",
    anchor: "ROWS считает строки, RANGE считает значения",
    svg: buildFrameRowsVsRange(),
  },
  "frame-bounds": {
    id: "frame-bounds",
    title: "Пять границ, из которых собирается кадр",
    caption: "Слева пять мест на ленте окна, справа три кадра, собранных из этих мест. Нарастающий итог, скользящее среднее и итог по всему окну отличаются только тем, какие две границы взяты.",
    anchor: "Пять границ, из которых собирается любой кадр",
    svg: buildFrameBounds(),
  },
  "lag-lead-shift": {
    id: "lag-lead-shift",
    title: "lag смотрит назад, lead — вперёд",
    caption: "Три партии молока, выстроенные по сроку годности. lag берёт значение из строки выше по порядку окна, lead — из строки ниже, а на краях честно отдаёт NULL: там строки просто нет.",
    anchor: "Что здесь произошло",
    svg: buildLagLeadShift(),
  },
  "lastvalue-frame": {
    id: "lastvalue-frame",
    title: "Почему last_value показывает текущую строку",
    caption: "Кадр по умолчанию кончается на текущей строке, поэтому последняя строка кадра — она же и есть. Растянешь кадр руками на всё окно — last_value наконец покажет настоящую последнюю партию.",
    anchor: "Почему last_value без кадра показывает саму текущую строку",
    svg: buildLastvalueFrame(),
  },
  "topn-three-steps": {
    id: "topn-three-steps",
    title: "Три шага, и они всегда одни и те же",
    caption: "Пронумеровать строки внутри группы, обернуть это в CTE, отфильтровать по номеру снаружи. Меняются только границы групп, порядок внутри группы и число в фильтре.",
    anchor: "Три шага, и они всегда одни и те же",
    svg: buildTopnThreeSteps(),
  },
  "tie-three-ranks": {
    id: "tie-three-ranks",
    title: "Что делать, если на границе ничья",
    caption: "Одна и та же отсечка «топ-3», проведённая тремя функциями. row_number отдаёт ровно три строки, rank возвращает обоих, кто разделил третье место, dense_rank ограничивает число разных значений.",
    anchor: "Правило выбора: нужно ровно N или нужны все, кто разделил место",
    svg: buildTieThreeRanks(),
  },
  "gaps-islands-ruler": {
    id: "gaps-islands-ruler",
    title: "Остров, разрыв и пара соседей",
    caption: "Ряд ячеек с дырками: занятые клетки складываются в острова, пустые — в разрывы. Дуги показывают lead: он кладёт соседа в ту же строку, и длинная дуга и есть разрыв.",
    anchor: "Что здесь произошло",
    svg: buildGapsIslandsRuler(),
  },
  "island-const": {
    id: "island-const",
    title: "Разность, которая не меняется внутри острова",
    caption: "Номер ячейки и номер строки растут внутри острова одинаково, поэтому расстояние между ними стоит на месте. На разрыве номер ячейки прыгает, и разность подскакивает ровно на размер дырки.",
    anchor: "Разность, которая не меняется внутри острова",
    svg: buildIslandConst(),
  },
  "lag-flags-sum": {
    id: "lag-flags-sum",
    title: "Флаг начала острова и нарастающая сумма",
    caption: "Второй приём: единица там, где строка не продолжает предыдущую, и нарастающая сумма этих единиц. Она стоит на месте внутри острова и подрастает на каждом новом — превращаясь в его номер.",
    anchor: "Второй способ: пометить начало острова и посчитать метки",
    svg: buildLagFlagsSum(),
  },
};

// Привязка схем к нодам: код ноды -> список id.
export const INDEX = {
  "d6.01": ["window-vs-groupby", "window-when"],
  "d6.02": ["rownum-pipeline", "rank-vs-dense"],
  "d6.03": ["run-frame", "run-peers"],
  "d6.04": ["frame-three-layers", "frame-rows-vs-range", "frame-bounds"],
  "d6.05": ["lag-lead-shift", "lastvalue-frame"],
  "d6.06": ["topn-three-steps", "tie-three-ranks"],
  "d6.07": ["gaps-islands-ruler", "island-const", "lag-flags-sum"],
};
