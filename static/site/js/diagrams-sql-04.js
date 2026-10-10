// diagrams-sql-04.js
// Схемы этапа 4: агрегация и группировка.
//
// Оснастка общая (diagrams-sql-kit.js), правила те же: самодостаточный модуль,
// цвета только через CSS-переменные страницы, никакого JS внутри SVG.
// Образец стиля — diagrams-sql-02.js.

import { arrowDefs, checkIcon, crossIcon, svgWrap } from "./diagrams-sql-kit.js";

/* ---------------------------------------------------------------- d4.01 */

// Два способа читать одну и ту же колонку: обычная функция считает внутри
// строки и отдаёт столько же строк, агрегат читает столбец целиком и отдаёт
// одну. Схема существует ради этой единственной мысли — агрегат работает
// поперёк строк, а не внутри строки, и потому меняет форму ответа.
function buildAggFold() {
  const S = "agg-fold";
  // qty из dbo.stock: четыре реальных значения и заглушка на остальные девять.
  const vals = ["48.000", "60.000", "30.000", "200.000"];
  const scal = ["48", "60", "30", "200"];
  const ROWS = 5;
  const ry = (i) => 112 + i * 30;

  // Левая половина: одна строка на входе — одна строка на выходе.
  const lane = vals.map((v, i) => {
    const y = ry(i), c = y + 12;
    return `<rect class="cell" x="54" y="${y}" width="90" height="24" rx="6"/>
<text class="mono" x="99" y="${c + 4}" font-size="11.5" text-anchor="middle">${v}</text>
<line class="flow" x1="150" y1="${c}" x2="184" y2="${c}" marker-end="url(#${S}-arrow)"/>
<rect class="cell" x="190" y="${y}" width="90" height="24" rx="6"/>
<text class="mono" x="235" y="${c + 4}" font-size="11.5" text-anchor="middle">${scal[i]}</text>`;
  }).join("\n");

  const laneTail = (() => {
    const y = ry(4), c = y + 12;
    return `<rect class="ghost" x="54" y="${y}" width="90" height="24" rx="6"/>
<text class="cap" x="99" y="${c + 4}" font-size="10" text-anchor="middle">ещё 9 строк</text>
<line class="flow" x1="150" y1="${c}" x2="184" y2="${c}" marker-end="url(#${S}-arrow)"/>
<rect class="ghost" x="190" y="${y}" width="90" height="24" rx="6"/>
<text class="cap" x="235" y="${c + 4}" font-size="10" text-anchor="middle">ещё 9 строк</text>`;
  })();

  // Правая половина: тот же столбец, но все значения сходятся в одну точку.
  const col = vals.map((v, i) => {
    const y = ry(i), c = y + 12;
    return `<rect class="cell" x="392" y="${y}" width="90" height="24" rx="6"/>
<text class="mono" x="437" y="${c + 4}" font-size="11.5" text-anchor="middle">${v}</text>`;
  }).join("\n");

  const colTail = `<rect class="ghost" x="392" y="${ry(4)}" width="90" height="24" rx="6"/>
<text class="cap" x="437" y="${ry(4) + 16}" font-size="10" text-anchor="middle">ещё 9 строк</text>`;

  const fan = Array.from({ length: ROWS }, (_, i) =>
    `<line class="fold" x1="486" y1="${ry(i) + 12}" x2="552" y2="184"/>`).join("\n");

  return svgWrap("0 0 700 390", S, "Агрегат сворачивает столбец в одно значение", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .cell { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .ghost { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 4 3; }
.dg-${S} .out { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .fold { stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="32" font-size="11.5" font-weight="600">Один и тот же столбец qty, прочитанный двумя разными способами</text>
<line class="split" x1="350" y1="56" x2="350" y2="300"/>

<text class="cap" x="54" y="76" font-size="11.5" font-weight="600">обычная функция — внутри строки</text>
<text class="cap" x="99" y="98" font-size="10.5" text-anchor="middle">qty</text>
<text class="mono cap" x="235" y="98" font-size="10.5" text-anchor="middle">round(qty)</text>
${lane}
${laneTail}
<text class="cap" x="54" y="290" font-size="11">13 строк вошло — 13 строк вышло</text>

<text class="cap" x="392" y="76" font-size="11.5" font-weight="600">агрегат — поперёк строк</text>
<text class="cap" x="437" y="98" font-size="10.5" text-anchor="middle">qty</text>
<text class="mono t-accent" x="556" y="98" font-size="11.5" text-anchor="middle" font-weight="700">sum(qty)</text>
${col}
${colTail}
${fan}
<line class="fold" x1="552" y1="184" x2="572" y2="184" marker-end="url(#${S}-arrow-accent)"/>
<rect class="out" x="578" y="162" width="92" height="44" rx="9"/>
<text class="mono t-accent" x="624" y="190" font-size="16" font-weight="700" text-anchor="middle">975.750</text>
<text class="cap" x="392" y="290" font-size="11">13 строк вошло — 1 строка вышла</text>

<line x1="26" y1="314" x2="674" y2="314" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="336" font-size="11">Обычная функция читает значения одной строки и отвечает за неё же: сколько строк было, столько и осталось.</text>
<text class="cap" x="26" y="356" font-size="11">Агрегат читает целый столбец сразу и отдаёт одно значение — он работает поперёк строк, а не внутри строки.</text>
<text class="cap" x="26" y="376" font-size="11">Группа сегодня одна — вся выборка после FROM и WHERE. С GROUP BY групп станет несколько, механика та же.</text>
`);
}

/* ---------------------------------------------------------------- d4.02 */

// Строки раскладываются по кучкам по значению группирующей колонки, агрегат
// считается внутри каждой кучки отдельно, и каждая кучка отдаёт ровно одну
// строку результата. Схема существует ради равенства «одна кучка = одна
// строка»: именно из него считается, сколько строк вернёт запрос.
function buildGroupByBuckets() {
  const S = "group-by-buckets";
  // Сырьё намеренно вперемешку: видно, что раскладка по кучкам — реальная работа.
  const raw = [
    ["A-01-01", "48.000", 0, 0],
    ["C-01-01", "45.000", 2, 1],
    ["A-01-02", "30.000", 1, 0],
    ["A-01-01", "60.000", 0, 1],
    ["C-01-01", "55.500", 2, 0],
    ["C-01-01", "40.000", 2, 2],
  ];
  // Кучки: имя, значения внутри, y-верх, результат.
  const buckets = [
    ["A-01-01", ["48.000", "60.000"], 92, "2", "108.000"],
    ["A-01-02", ["30.000"], 176, "1", "30.000"],
    ["C-01-01", ["55.500", "45.000", "40.000"], 240, "3", "140.500"],
  ];
  const bh = (n) => 26 + n * 20 + 6;
  const chipY = (top, i) => top + 26 + i * 20;

  const rowsLeft = raw.map(([loc, qty], i) => {
    const y = 96 + i * 26, c = y + 11;
    return `<rect class="row" x="26" y="${y}" width="160" height="22" rx="6"/>
<text class="mono" x="38" y="${c + 4}" font-size="11">${loc}</text>
<text class="mono cap" x="120" y="${c + 4}" font-size="11">${qty}</text>`;
  }).join("\n");
  const rowsTail = `<rect class="ghost" x="26" y="252" width="160" height="22" rx="6"/>
<text class="cap" x="106" y="267" font-size="10" text-anchor="middle">ещё 7 строк</text>`;

  const wires = raw.map(([, , b, k], i) => {
    const y1 = 96 + i * 26 + 11;
    const y2 = chipY(buckets[b][2], k) + 9;
    return `<path class="wire" d="M190,${y1} C214,${y1} 210,${y2} 232,${y2}" marker-end="url(#${S}-arrow)"/>`;
  }).join("\n");
  const wireTail = `<path class="wire" d="M190,263 C214,263 210,357 232,357" marker-end="url(#${S}-arrow)"/>`;

  const piles = buckets.map(([name, vals, top, cnt, sum]) => {
    const h = bh(vals.length), mid = top + h / 2;
    const chips = vals.map((v, i) =>
      `<rect class="chip" x="248" y="${chipY(top, i)}" width="82" height="18" rx="5"/>
<text class="mono" x="289" y="${chipY(top, i) + 13}" font-size="10.5" text-anchor="middle">${v}</text>`).join("\n");
    return `<rect class="pile" x="236" y="${top}" width="182" height="${h}" rx="10"/>
<text class="mono" x="248" y="${top + 18}" font-size="11" font-weight="700">${name}</text>
<text class="cap" x="410" y="${top + 18}" font-size="9.5" text-anchor="end">${vals.length} стр.</text>
${chips}
<line class="pass" x1="422" y1="${mid}" x2="464" y2="${mid}" marker-end="url(#${S}-arrow-accent)"/>
<rect class="out" x="468" y="${mid - 13}" width="206" height="26" rx="7"/>
<text class="mono" x="480" y="${mid + 4}" font-size="11">${name}</text>
<text class="mono" x="566" y="${mid + 4}" font-size="11" text-anchor="middle">${cnt}</text>
<text class="mono" x="662" y="${mid + 4}" font-size="11" text-anchor="end">${sum}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 452", S, "Одна кучка даёт ровно одну строку результата", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .ghost { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 4 3; }
.dg-${S} .pile { fill: var(--sunk); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .pileghost { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 5 4; }
.dg-${S} .chip { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
.dg-${S} .out { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .outghost { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 5 4; }
.dg-${S} .wire { fill: none; stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .pass { stroke: var(--accent); stroke-width: 1.4; }
</style>

<text class="mono" x="26" y="32" font-size="12">SELECT loc, count(*), sum(qty) FROM dbo.stock GROUP BY loc</text>
<text class="cap" x="26" y="52" font-size="11">Сначала раскладка по кучкам, и только потом счёт — своей суммой на каждую кучку</text>

<text class="cap" x="26" y="82" font-size="10.5" font-weight="600">13 строк dbo.stock</text>
<text class="cap" x="236" y="82" font-size="10.5" font-weight="600">кучки по значению loc</text>
<text class="cap" x="468" y="82" font-size="10.5" font-weight="600">результат: строка на кучку</text>
<text class="mono cap" x="480" y="106" font-size="9.5">loc</text>
<text class="mono cap" x="566" y="106" font-size="9.5" text-anchor="middle">count(*)</text>
<text class="mono cap" x="662" y="106" font-size="9.5" text-anchor="end">sum(qty)</text>
${rowsLeft}
${rowsTail}
${wires}
${wireTail}
${piles}

<rect class="pileghost" x="236" y="344" width="182" height="26" rx="8"/>
<text class="cap" x="327" y="361" font-size="10.5" text-anchor="middle">ещё 4 кучки</text>
<line class="wire" x1="422" y1="357" x2="464" y2="357" marker-end="url(#${S}-arrow)"/>
<rect class="outghost" x="468" y="344" width="206" height="26" rx="7"/>
<text class="cap" x="571" y="361" font-size="10.5" text-anchor="middle">ещё 4 строки</text>

<line x1="26" y1="392" x2="674" y2="392" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="414" font-size="11">Кучка — единица работы: в неё попадают строки с одинаковым loc, и агрегат считается внутри неё.</text>
<text class="cap" x="26" y="434" font-size="11">Одна кучка = одна строка ответа. Сколько строк вернёт запрос — это сколько разных значений у loc.</text>
`);
}

// Почему голая колонка вне GROUP BY запрещена: под кучку в результате отведена
// одна строка, а в ней под колонку — одна ячейка. У колонки из GROUP BY
// кандидат один, у агрегата кандидатов много, но есть инструкция, а у голой
// колонки кандидатов девять и инструкции нет. Отсюда и ошибка 42803.
function buildGroupBySelectSlot() {
  const S = "group-by-select-slot";
  const descr = [
    "Молоко пастеризованное 3.2% 1л",
    "Кефир 1% 0.5л",
    "Хлеб Бородинский нарезка",
    "Сахар-песок 1кг",
  ];
  const rows = descr.map((d, i) =>
    `<rect class="chip" x="38" y="${112 + i * 22}" width="206" height="18" rx="5"/>
<text class="cap" x="46" y="${125 + i * 22}" font-size="10">${d}</text>`).join("\n");

  // Три вердикта: колонка из GROUP BY, голая колонка, агрегат.
  const verdicts = [
    ["uom", "PC", true, "кандидат ровно один", "колонка из GROUP BY: у всех строк кучки она одинаковая"],
    ["descr", "?", false, "девять кандидатов, правила нет", "какое из девяти названий печатать — не сказано никак"],
    ["count(*)", "9", true, "девять кандидатов, правило есть", "агрегат сам говорит, как из многих сделать одно"],
  ];
  const vb = verdicts.map(([name, val, ok, tag, expl], i) => {
    const top = 100 + i * 74, mid = top + 34;
    return `<path class="${ok ? "pass" : "wire"}" d="M256,162 C304,162 308,${mid} 348,${mid}" marker-end="url(#${S}-arrow${ok ? "-accent" : ""})"/>
<rect class="${ok ? "vok" : "vbad"}" x="352" y="${top}" width="322" height="68" rx="9"/>
<text class="mono cap" x="364" y="${top + 17}" font-size="10">${name}</text>
<rect class="${ok ? "slotok" : "slotbad"}" x="364" y="${top + 22}" width="76" height="24" rx="6"/>
<text class="mono ${ok ? "" : "t-bad"}" x="402" y="${top + 39}" font-size="${val === "?" ? 14 : 12}" font-weight="700" text-anchor="middle">${val}</text>
${ok ? checkIcon(452, top + 27, 15) : crossIcon(452, top + 27, 15)}
<text class="cap" x="478" y="${top + 39}" font-size="10.5">${tag}</text>
<text class="cap" x="364" y="${top + 60}" font-size="10">${expl}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 436", S, "Одна ячейка — один кандидат", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .pile { fill: var(--sunk); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .chip { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
.dg-${S} .ghost { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 4 3; }
.dg-${S} .vok { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .vbad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .slotok { fill: var(--sunk); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .slotbad { fill: var(--paper); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 4 3; }
.dg-${S} .errbox { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; }
.dg-${S} .wire { fill: none; stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .pass { fill: none; stroke: var(--accent); stroke-width: 1.3; }
</style>

<text class="mono" x="26" y="32" font-size="12">SELECT uom, descr, count(*) FROM dbo.sku GROUP BY uom</text>
<text class="cap" x="26" y="52" font-size="11">В кучке девять строк, а в результате под неё отведена одна строка — и в ней по одной ячейке</text>

<text class="cap" x="26" y="82" font-size="10.5" font-weight="600">кучка uom = 'PC' — девять строк</text>
<rect class="pile" x="26" y="92" width="230" height="140" rx="10"/>
${rows}
<rect class="ghost" x="38" y="200" width="206" height="18" rx="5"/>
<text class="cap" x="141" y="213" font-size="10" text-anchor="middle">ещё 5 строк</text>

<text class="cap" x="352" y="82" font-size="10.5" font-weight="600">одна строка результата: три ячейки</text>
${vb}

<rect class="errbox" x="26" y="328" width="648" height="30" rx="8"/>
<text class="mono t-bad" x="40" y="348" font-size="11">column "sku.descr" must appear in the GROUP BY clause or be used in an aggregate function</text>

<line x1="26" y1="376" x2="674" y2="376" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="398" font-size="11">В SELECT при GROUP BY бывает ровно две вещи: колонка из GROUP BY или выражение под агрегатом.</text>
<text class="cap" x="26" y="418" font-size="11">Голая колонка — это девять кандидатов на одну ячейку без правила выбора, и сервер отказывается гадать.</text>
`);
}

// Место GROUP BY в конвейере: третья ступень, после WHERE и до SELECT.
// Схема существует ради трёх следствий этого положения — WHERE фильтрует до
// группировки, агрегат в WHERE невозможен (кучек ещё нет), а ORDER BY по
// агрегату законен, потому что к шестой ступени всё уже посчитано.
function buildGroupByPipeline() {
  const S = "group-by-pipeline";
  // ступень, что делает, видит строки, видит агрегат, заметка
  const steps = [
    ["FROM", "берёт строки таблицы", "yes", "dash", ""],
    ["WHERE", "выбрасывает строки", "yes", "no", "кучек ещё нет"],
    ["GROUP BY", "раскладывает строки по кучкам", "yes", "dash", "кучки рождаются"],
    ["HAVING", "выбрасывает кучки целиком", "no", "yes", "уже по кучкам"],
    ["SELECT", "считает колонки и агрегаты", "no", "yes", "сам их и считает"],
    ["ORDER BY", "раскладывает строки по порядку", "no", "yes", "и по имени тоже"],
    ["LIMIT", "отрезает хвост", "no", "dash", ""],
  ];

  const mark = (kind, cx, cy) => {
    if (kind === "yes") return checkIcon(cx - 7, cy - 7, 14);
    if (kind === "no") return crossIcon(cx - 7, cy - 7, 14);
    return `<text class="cap" x="${cx}" y="${cy + 4}" font-size="12" text-anchor="middle">—</text>`;
  };

  const body = steps.map(([name, what, r, a, note], i) => {
    const top = 92 + i * 36, cy = top + 14;
    const hot = name === "GROUP BY";
    const down = i === steps.length - 1 ? ""
      : `<line class="flow" x1="98" y1="${top + 28}" x2="98" y2="${top + 34}" marker-end="url(#${S}-arrow)"/>`;
    return `<text class="cap" x="26" y="${cy + 4}" font-size="10">${i + 1}</text>
<rect class="${hot ? "hot" : "step"}" x="40" y="${top}" width="116" height="28" rx="7"/>
<text class="mono" x="98" y="${cy + 4}" font-size="11.5" ${hot ? 'font-weight="700"' : ""} text-anchor="middle">${name}</text>
<text class="cap" x="168" y="${cy + 4}" font-size="11">${what}</text>
${mark(r, 430, cy)}
${mark(a, 530, cy)}
<text class="cap ${hot ? "t-accent" : ""}" x="576" y="${cy + 4}" font-size="10">${note}</text>
${down}`;
  }).join("\n");

  return svgWrap("0 0 700 436", S, "Где GROUP BY стоит в конвейере", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .step { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .band { fill: var(--sunk); stroke: none; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="32" font-size="11.5" font-weight="600">GROUP BY — третья ступень: после WHERE и до SELECT</text>
<text class="cap" x="26" y="52" font-size="11">Из этого положения растут все три правила темы, и ни одно из них не приходится запоминать отдельно</text>

<rect class="band" x="384" y="70" width="188" height="${92 + 6 * 36 + 28 - 70}" rx="8"/>
<text class="cap" x="40" y="82" font-size="10.5" font-weight="600">ступень</text>
<text class="cap" x="168" y="82" font-size="10.5" font-weight="600">что делает</text>
<text class="cap" x="430" y="82" font-size="10" text-anchor="middle">видит строки</text>
<text class="cap" x="530" y="82" font-size="10" text-anchor="middle">видит кучки</text>
${body}

<line x1="26" y1="358" x2="674" y2="358" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="380" font-size="11">WHERE стоит раньше — он выбрасывает строки, и в кучки попадает только то, что уцелело.</text>
<text class="cap" x="26" y="400" font-size="11">Агрегат в WHERE невозможен в принципе: на второй ступени кучек ещё не существует. Для этого есть HAVING.</text>
<text class="cap" x="26" y="420" font-size="11">А ORDER BY по агрегату законен: к шестой ступени и кучки собраны, и суммы посчитаны.</text>
`);
}

/* ---------------------------------------------------------------- d4.03 */

// Конвейер с тающим потоком: строки превращаются в кучки, у кучек появляются
// суммы, и только тогда включается HAVING. Схема существует ради того, чтобы
// стало видно, на каком материале работает каждый фильтр: WHERE — на строках,
// HAVING — на уже собранных кучках, которые он выбрасывает целиком.
function buildHavingPipeline() {
  const S = "having-pipeline";
  // ступень, состояние потока после неё, вид рамки, подпись под потоком
  const steps = [
    ["FROM", "13 строк", "step", ""],
    ["WHERE", "13 строк", "off", "не написан"],
    ["GROUP BY", "7 кучек", "step", "у каждой своя сумма"],
    ["HAVING", "6 кучек", "hot", ""],
    ["SELECT", "6 строк", "step", ""],
    ["ORDER BY", "6 строк", "step", ""],
  ];
  const bx = (i) => 30 + i * 108;

  const body = steps.map(([name, flow, kind, note], i) => {
    const x = bx(i), cx = x + 49;
    const link = i === steps.length - 1 ? ""
      : `<line class="flow" x1="${x + 98}" y1="113" x2="${x + 106}" y2="113" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="${x + 98}" y1="159" x2="${x + 106}" y2="159" marker-end="url(#${S}-arrow)"/>`;
    return `<rect class="${kind}" x="${x}" y="96" width="98" height="34" rx="8"/>
<text class="mono ${kind === "off" ? "cap" : ""}" x="${cx}" y="118" font-size="11.5" ${kind === "hot" ? 'font-weight="700"' : ""} text-anchor="middle">${name}</text>
<rect class="${kind === "off" ? "flowghost" : "flowpill"}" x="${x}" y="146" width="98" height="26" rx="7"/>
<text class="cap" x="${cx}" y="163" font-size="10.5" text-anchor="middle">${flow}</text>
<text class="cap" x="${cx}" y="190" font-size="9.5" text-anchor="middle">${note}</text>
${link}`;
  }).join("\n");

  return svgWrap("0 0 700 348", S, "HAVING включается там, где строк уже нет", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-bad" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--bad)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .step { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .off { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 5 4; }
.dg-${S} .flowpill { fill: var(--sunk); stroke: var(--line); stroke-width: 1; }
.dg-${S} .flowghost { fill: none; stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 4 3; }
.dg-${S} .drop { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .dropline { stroke: var(--bad); stroke-width: 1.3; }
</style>

<text class="mono" x="30" y="32" font-size="12">SELECT loc, SUM(qty) FROM dbo.stock GROUP BY loc HAVING SUM(qty) &gt; 100</text>
<text class="cap" x="30" y="52" font-size="11">Поток тает по ступеням, и по дороге меняет единицу измерения: сначала строки, потом кучки</text>
<text class="cap" x="30" y="82" font-size="10" font-weight="600">ступень</text>
<text class="cap" x="30" y="140" font-size="10" font-weight="600">что осталось в потоке</text>
${body}

<line class="dropline" x1="403" y1="174" x2="403" y2="202" marker-end="url(#${S}-arrow-bad)"/>
<rect class="drop" x="230" y="206" width="340" height="42" rx="9"/>
${crossIcon(244, 217, 14)}
<text class="mono t-bad" x="270" y="228" font-size="11">A-01-02 · sum(qty) = 30.000</text>
<text class="cap" x="244" y="243" font-size="10">30 не больше 100 — кучка выброшена целиком, со своей строкой</text>

<line x1="30" y1="270" x2="670" y2="270" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="30" y="292" font-size="11">FROM даёт строки, GROUP BY сворачивает их в кучки, и только после этого у кучки появляется сумма.</text>
<text class="cap" x="30" y="312" font-size="11">HAVING — тот же фильтр, что WHERE, но слово «строка» в его описании везде заменено на «кучка».</text>
<text class="cap" x="30" y="332" font-size="11">WHERE решает, какие строки войдут в кучки. HAVING решает, какие собранные кучки останутся в ответе.</text>
`);
}

// Один и тот же фильтр в двух местах конвейера даёт разные числа. Схема
// существует ради мысли, что WHERE меняет состав кучки, а значит и сам агрегат,
// а HAVING получает уже сложенную сумму и умеет только выбросить кучку целиком:
// заглянуть внутрь коробки и вынуть половину он не может.
function buildHavingSumsChange() {
  const S = "having-sums-change";
  const src = [["заказ 1", "PICKED", "54.000"], ["заказ 4", "NEW", "12.000"]];

  const srcRows = src.map(([o, st, q], i) => {
    const y = 64 + i * 26;
    return `<rect class="row" x="250" y="${y}" width="200" height="24" rx="6"/>
<text class="mono" x="262" y="${y + 16}" font-size="10.5">${o}</text>
<text class="mono" x="320" y="${y + 16}" font-size="10.5">${st}</text>
<text class="mono cap" x="438" y="${y + 16}" font-size="10.5" text-anchor="end">${q}</text>`;
  }).join("\n");

  // Одна кучка: заголовок и чипы, часть которых может быть отброшена.
  const pile = (x, chips) => {
    const inner = chips.map(([v, live], i) => {
      const y = 212 + i * 22;
      return live
        ? `<rect class="chip" x="${x + 14}" y="${y}" width="120" height="18" rx="5"/>
<text class="mono" x="${x + 74}" y="${y + 13}" font-size="10.5" text-anchor="middle">${v}</text>`
        : `<rect class="chipdead" x="${x + 14}" y="${y}" width="120" height="18" rx="5"/>
<text class="mono cap" x="${x + 74}" y="${y + 13}" font-size="10.5" text-anchor="middle">${v}</text>
${crossIcon(x + 142, y + 2, 13)}
<text class="cap t-bad" x="${x + 162}" y="${y + 13}" font-size="9.5">не доехала до кучки</text>`;
    }).join("\n");
    return `<rect class="pile" x="${x}" y="188" width="296" height="76" rx="10"/>
<text class="cap" x="${x + 14}" y="${205}" font-size="10.5">кучка: Пятёрочка №1234</text>
${inner}`;
  };

  return svgWrap("0 0 700 500", S, "WHERE меняет сумму, HAVING — только состав отчёта", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-bad" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--bad)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .gate { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .plain { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .pile { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .chip { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
.dg-${S} .chipdead { fill: none; stroke: var(--bad); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .resok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.6; }
.dg-${S} .resgold { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.6; }
.dg-${S} .noteok { fill: var(--paper); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .notegold { fill: var(--paper); stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .wire { fill: none; stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="32" font-size="11.5" font-weight="600">Один клиент, два его заказа — и один и тот же фильтр, поставленный в двух местах</text>
<text class="cap" x="250" y="52" font-size="10">после JOIN, до всякой группировки</text>
${srcRows}

<path class="wire" d="M264,118 C214,124 198,128 182,140" marker-end="url(#${S}-arrow)"/>
<path class="wire" d="M436,118 C486,124 502,128 526,140" marker-end="url(#${S}-arrow)"/>
<line class="split" x1="354" y1="130" x2="354" y2="410"/>

<text class="cap" x="34" y="158" font-size="11" font-weight="600">фильтр в WHERE — до сложения</text>
<rect class="gate" x="34" y="166" width="296" height="26" rx="7"/>
<text class="mono" x="182" y="184" font-size="11.5" text-anchor="middle">WHERE o.status = 'NEW'</text>
${pile(34, [["54.000", false], ["12.000", true]])}
<line class="flow" x1="182" y1="266" x2="182" y2="284" marker-end="url(#${S}-arrow)"/>
<rect class="resok" x="34" y="288" width="296" height="38" rx="9"/>
<text class="mono t-ok" x="182" y="313" font-size="14" font-weight="700" text-anchor="middle">sum(qty) = 12.000</text>
<rect class="noteok" x="34" y="340" width="296" height="66" rx="9"/>
<text class="cap" x="48" y="366" font-size="10.5">состав кучки другой — и сумма другая</text>
<text class="cap" x="48" y="386" font-size="10.5">12.000 — ответ на вопрос про новые заказы</text>

<text class="cap" x="378" y="158" font-size="11" font-weight="600">фильтр в HAVING — после сложения</text>
<rect class="plain" x="378" y="166" width="296" height="26" rx="7"/>
<text class="mono" x="526" y="184" font-size="11.5" text-anchor="middle">GROUP BY o.customer</text>
${pile(378, [["54.000", true], ["12.000", true]])}
<line class="flow" x1="526" y1="266" x2="526" y2="284" marker-end="url(#${S}-arrow)"/>
<rect class="resgold" x="378" y="288" width="296" height="38" rx="9"/>
<text class="mono t-gold" x="526" y="313" font-size="14" font-weight="700" text-anchor="middle">sum(qty) = 66.000</text>
<rect class="notegold" x="378" y="340" width="296" height="66" rx="9"/>
<text class="cap" x="392" y="359" font-size="10.5">HAVING видит кучку снаружи, как коробку:</text>
${checkIcon(392, 367, 13)}
<text class="cap" x="414" y="378" font-size="10.5">выбросить её целиком — умеет</text>
${crossIcon(392, 387, 13)}
<text class="cap" x="414" y="398" font-size="10.5">вынуть из неё половину — не умеет</text>

<line x1="26" y1="424" x2="674" y2="424" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="446" font-size="11">WHERE выбрасывает строки до сложения — в кучку попадает другое, и сумма получается другая.</text>
<text class="cap" x="26" y="466" font-size="11">HAVING получает уже сложенную сумму: он видит кучку снаружи, как коробку с наклеенной этикеткой.</text>
<text class="cap" x="26" y="486" font-size="11">Выбросить всю коробку он умеет, вынуть из неё половину — нет: 66 никаким HAVING не превратить в 12.</text>
`);
}

/* ---------------------------------------------------------------- d4.04 */

// Три счётчика по одной и той же колонке дают три разных числа. Схема
// существует ради порядка работы внутри агрегата: сначала выбрасываются NULL,
// потом схлопываются дубли, и только после этого начинается счёт — поэтому
// count(DISTINCT ...) считает не строки, а разные значения.
function buildDistinctAggFunnel() {
  const S = "distinct-agg-funnel";
  // выражение, чипы (значение, состояние), что сделало сито, число
  const lanes = [
    ["count(*)", [["строка 1", "live"], ["строка 2", "live"], ["строка 3", "live"]],
      "строки считаются как есть", "3"],
    ["count(loc)", [["A-01-01", "live"], ["A-01-01", "live"], ["B-01-01", "live"]],
      "NULL за борт — их тут нет", "3"],
    ["count(DISTINCT loc)", [["A-01-01", "live"], ["A-01-01", "dead"], ["B-01-01", "live"]],
      "дубль схлопнут в одно", "2"],
  ];

  const body = lanes.map(([expr, chips, note, n], i) => {
    const top = 110 + i * 68, cy = top + 22;
    const hot = i === 2;
    const cells = chips.map(([v, st], k) => {
      const x = 186 + k * 82;
      return st === "live"
        ? `<rect class="chip" x="${x}" y="${top + 8}" width="76" height="28" rx="7"/>
<text class="mono" x="${x + 38}" y="${cy + 4}" font-size="10.5" text-anchor="middle">${v}</text>`
        : `<rect class="chipdead" x="${x}" y="${top + 8}" width="76" height="28" rx="7"/>
<text class="mono cap" x="${x + 38}" y="${cy + 4}" font-size="10.5" text-anchor="middle">${v}</text>
<line class="strike" x1="${x + 10}" y1="${cy - 2}" x2="${x + 66}" y2="${cy - 2}"/>`;
    }).join("\n");
    return `<rect class="${hot ? "exprhot" : "expr"}" x="26" y="${top + 8}" width="150" height="28" rx="7"/>
<text class="mono ${hot ? "t-accent" : ""}" x="101" y="${cy + 4}" font-size="10.5" ${hot ? 'font-weight="700"' : ""} text-anchor="middle">${expr}</text>
${cells}
<text class="cap" x="440" y="${cy + 4}" font-size="10">${note}</text>
<line class="flow" x1="596" y1="${cy}" x2="612" y2="${cy}" marker-end="url(#${S}-arrow${hot ? "-accent" : ""})"/>
<rect class="${hot ? "numhot" : "num"}" x="616" y="${top + 6}" width="56" height="32" rx="8"/>
<text class="mono ${hot ? "t-accent" : ""}" x="644" y="${cy + 6}" font-size="15" font-weight="700" text-anchor="middle">${n}</text>`;
  }).join("\n");

  // Порядок работы внутри скобок агрегата: счёт стоит последним.
  const stages = ["взять значения", "NULL за борт", "дубли схлопнуть", "посчитать"];
  const strip = stages.map((t, i) => {
    const x = 26 + i * 164;
    const hot = i === 2;
    const link = i === stages.length - 1 ? ""
      : `<line class="flow" x1="${x + 140}" y1="${346}" x2="${x + 158}" y2="346" marker-end="url(#${S}-arrow)"/>`;
    return `<rect class="${hot ? "stagehot" : "stage"}" x="${x}" y="${332}" width="140" height="28" rx="7"/>
<text class="cap ${hot ? "t-accent" : ""}" x="${x + 70}" y="350" font-size="10.5" text-anchor="middle">${t}</text>
${link}`;
  }).join("\n");

  return svgWrap("0 0 700 442", S, "Три числа из одной колонки", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .expr { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .exprhot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .chip { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .chipdead { fill: none; stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .strike { stroke: var(--accent); stroke-width: 1.5; stroke-linecap: round; }
.dg-${S} .num { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .numhot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .stage { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .stagehot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="mono" x="26" y="32" font-size="12">... FROM dbo.stock WHERE skuid = 'MILK-1L'</text>
<text class="cap" x="26" y="52" font-size="11">Три строки, одна колонка loc со значениями A-01-01, A-01-01, B-01-01 — и три разных ответа</text>
<text class="cap" x="26" y="98" font-size="10" font-weight="600">что спросили</text>
<text class="cap" x="186" y="98" font-size="10" font-weight="600">что попало в агрегат</text>
<text class="cap" x="440" y="98" font-size="10" font-weight="600">что сделало сито</text>
<text class="cap" x="644" y="98" font-size="10" font-weight="600" text-anchor="middle">ответ</text>
${body}

<text class="cap" x="26" y="318" font-size="10.5" font-weight="600">порядок работы внутри скобок агрегата</text>
${strip}

<line x1="26" y1="382" x2="674" y2="382" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="404" font-size="11">Схлопывание дублей стоит перед счётом: агрегат получает уже прополотый список и считает его.</text>
<text class="cap" x="26" y="424" font-size="11">Поэтому count(*) считает строки, count(loc) — непустые значения, а count(DISTINCT loc) — разные значения.</text>
`);
}

// Соединение размножило строки заказа, и счётчик строк начал считать копии.
// Схема существует ради приёма: поверх JOIN сущности считают по первичному
// ключу через DISTINCT, потому что ключ дублируется, а число разных ключей —
// нет, сколько бы таблиц ни приджойнили дальше.
function buildJoinInflateKeys() {
  const S = "join-inflate-keys";
  const det = [["1", "KEFIR-05"], ["2", "BUTTER-180"], ["3", "EGGS-C1"]];
  const dy = (i) => 96 + i * 30;

  const mid = det.map(([ln, sku], i) => {
    const y = dy(i), c = y + 13;
    return `<rect class="row" x="250" y="${y}" width="176" height="26" rx="6"/>
<text class="mono" x="262" y="${c + 4}" font-size="10.5">3</text>
<text class="mono cap" x="284" y="${c + 4}" font-size="10.5">${ln}</text>
<text class="mono" x="308" y="${c + 4}" font-size="10.5">${sku}</text>
<path class="wire" d="M226,141 C240,141 236,${c} 246,${c}" marker-end="url(#${S}-arrow)"/>
<line class="wire" x1="430" y1="${c}" x2="450" y2="${c}" marker-end="url(#${S}-arrow)"/>
<rect class="out" x="454" y="${y}" width="220" height="26" rx="6"/>
<text class="mono t-bad" x="466" y="${c + 4}" font-size="10.5" font-weight="700">3</text>
<text class="mono cap" x="488" y="${c + 4}" font-size="10.5">Перекрёсток №561</text>
<text class="mono" x="606" y="${c + 4}" font-size="10.5">${sku}</text>`;
  }).join("\n");

  // Два счётчика по одному и тому же результату соединения.
  const box = (x, expr, n, ok, l1, l2) => `<rect class="${ok ? "cok" : "cbad"}" x="${x}" y="230" width="316" height="80" rx="10"/>
<text class="mono" x="${x + 14}" y="${252}" font-size="11">${expr}</text>
<rect class="${ok ? "pillok" : "pillbad"}" x="${x + 14}" y="262" width="56" height="34" rx="8"/>
<text class="mono ${ok ? "t-ok" : "t-bad"}" x="${x + 42}" y="${285}" font-size="16" font-weight="700" text-anchor="middle">${n}</text>
${ok ? checkIcon(x + 82, 272, 15) : crossIcon(x + 82, 272, 15)}
<text class="cap" x="${x + 110}" y="277" font-size="10">${l1}</text>
<text class="cap" x="${x + 110}" y="293" font-size="10">${l2}</text>`;

  return svgWrap("0 0 700 400", S, "Соединение размножило строки, но не заказы", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .one { fill: var(--sunk); stroke: var(--line); stroke-width: 1.4; }
.dg-${S} .out { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .cok { fill: var(--paper); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .cbad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.5; }
.dg-${S} .pillok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .pillbad { fill: var(--paper); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .wire { fill: none; stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="32" font-size="11.5" font-weight="600">Один заказ, три позиции — и три строки после соединения</text>
<text class="cap" x="26" y="52" font-size="11">Данные не испортились: просто строка результата теперь не «заказ», а «позиция заказа»</text>

<text class="cap" x="26" y="82" font-size="10" font-weight="600">dbo.orders</text>
<text class="cap" x="250" y="82" font-size="10" font-weight="600">dbo.orderdetail</text>
<text class="cap" x="454" y="82" font-size="10" font-weight="600">после JOIN — orderkey размножился</text>
<rect class="one" x="26" y="126" width="200" height="30" rx="7"/>
<text class="mono" x="38" y="145" font-size="10.5">3</text>
<text class="mono" x="60" y="145" font-size="10.5">Перекрёсток №561</text>
${mid}
<text class="cap" x="26" y="180" font-size="10">одна строка слева</text>
<text class="cap" x="250" y="200" font-size="10">три строки справа</text>
<text class="cap" x="454" y="200" font-size="10">ключ заказа во всех трёх один и тот же</text>

${box(26, "count(*)", "3", false, "три строки приняты за три заказа,", "а заказ был один")}
${box(358, "count(DISTINCT o.orderkey)", "1", true, "разных ключей ровно один:", "JOIN продублировал — DISTINCT снял")}

<line x1="26" y1="328" x2="674" y2="328" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="350" font-size="11">Считаешь сущности поверх соединения — считай их первичный ключ через DISTINCT, а не строки.</text>
<text class="cap" x="26" y="370" font-size="11">Сколько таблиц ни приджойни дальше, ключ продублируется, а число разных ключей не изменится.</text>
<text class="cap" x="26" y="390" font-size="11">Завышение бывает и не втрое: у клиента с тремя строками и двумя заказами оно всего в полтора раза.</text>
`);
}

// Одно слово в двух местах запроса делает две разные вещи. Схема существует
// ради границы: SELECT DISTINCT прореживает то, что видно, а count(DISTINCT)
// считает разные значения — и потому по-разному обходится с NULL.
function buildDistinctTwoPlaces() {
  const S = "distinct-two-places";
  const src = [["1.030", 0], ["0.400", 0], ["0.250", 0]];

  const chips = src.map(([v], i) =>
    `<rect class="chip" x="${200 + i * 66}" y="88" width="60" height="22" rx="6"/>
<text class="mono" x="${230 + i * 66}" y="103" font-size="10.5" text-anchor="middle">${v}</text>`).join("\n");

  const panel = (x, tone, expr, s1, s2, big, small, n1, n2) => `<rect class="head-${tone}" x="${x}" y="182" width="316" height="30" rx="8"/>
<text class="mono t-${tone}" x="${x + 158}" y="202" font-size="11.5" font-weight="700" text-anchor="middle">${expr}</text>
<text class="cap" x="${x + 14}" y="232" font-size="10">${s1}</text>
<text class="cap" x="${x + 14}" y="248" font-size="10">${s2}</text>
<rect class="res-${tone}" x="${x}" y="260" width="316" height="56" rx="9"/>
<text class="mono t-${tone}" x="${x + 158}" y="290" font-size="19" font-weight="700" text-anchor="middle">${big}</text>
<text class="cap" x="${x + 158}" y="308" font-size="10" text-anchor="middle">${small}</text>
<text class="cap" x="${x + 14}" y="340" font-size="10">${n1}</text>
<text class="cap" x="${x + 14}" y="356" font-size="10">${n2}</text>`;

  return svgWrap("0 0 700 436", S, "Одно слово в двух местах — две разные вещи", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .src { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .chip { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .chipnull { fill: var(--paper); stroke: var(--muted); stroke-width: 1.1; stroke-dasharray: 3 3; }
.dg-${S} .chipmore { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; stroke-dasharray: 4 3; }
.dg-${S} .head-gold { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.5; }
.dg-${S} .head-accent { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .res-gold { fill: var(--paper); stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .res-accent { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .wire { fill: none; stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="32" font-size="11.5" font-weight="600">Одна и та же колонка weight, одно и то же слово DISTINCT — и два разных ответа</text>

<rect class="src" x="190" y="62" width="320" height="94" rx="10"/>
<text class="cap" x="202" y="80" font-size="10">dbo.sku, колонка weight — 12 строк</text>
${chips}
<rect class="chipmore" x="200" y="116" width="126" height="22" rx="6"/>
<text class="cap" x="263" y="131" font-size="10" text-anchor="middle">ещё 7 значений</text>
<rect class="chipnull" x="332" y="116" width="60" height="22" rx="6"/>
<text class="mono cap" x="362" y="131" font-size="10.5" text-anchor="middle">NULL</text>
<rect class="chipnull" x="398" y="116" width="60" height="22" rx="6"/>
<text class="mono cap" x="428" y="131" font-size="10.5" text-anchor="middle">NULL</text>
<text class="cap" x="350" y="150" font-size="9.5" text-anchor="middle">десять разных значений и две пустых ячейки</text>

<path class="wire" d="M210,158 C168,166 158,168 184,178" marker-end="url(#${S}-arrow)"/>
<path class="wire" d="M490,158 C532,166 542,168 516,178" marker-end="url(#${S}-arrow)"/>
<line class="split" x1="350" y1="176" x2="350" y2="366"/>

${panel(26, "gold", "SELECT DISTINCT weight",
  "стоит сразу после SELECT и относится",
  "ко всему списку колонок разом",
  "11 строк", "столько строк осталось в выводе",
  "две неизвестности между собой неразличимы —",
  "это повтор, и одна строка NULL в выводе остаётся")}

${panel(358, "accent", "count(DISTINCT weight)",
  "стоит внутри скобок агрегата и относится",
  "ровно к одному выражению",
  "10", "одно число, строк не убавилось",
  "NULL — не значение, а его отсутствие,",
  "и в счёт разных значений он не идёт вовсе")}

<line x1="26" y1="378" x2="674" y2="378" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="400" font-size="11">SELECT DISTINCT прореживает вывод: он убирает повторяющиеся строки и ничего не считает.</text>
<text class="cap" x="26" y="420" font-size="11">count(DISTINCT) не убирает строк вовсе — он возвращает число. Разница ровно в одной строке: в той, где NULL.</text>
`);
}

/* ---------------------------------------------------------------- d4.05 */

// Склейка как обычная агрегация: кучка собирается по ключу, элементы берутся
// из её строк, а разделитель встаёт в зазоры между ними. Схема существует ради
// двух вещей — что разделитель живёт между элементами, а не после каждого,
// и что в кучке из одной строки его не будет вовсе.
function buildStringAggFold() {
  const S = "string-agg-fold";
  const CW = 6.3, PAD = 14, SEP = 26;

  // Раскладка склейки: элементы и зазоры между ними, слева направо.
  const glue = (x0, y, items) => {
    let x = x0;
    const out = [];
    items.forEach((v, i) => {
      if (i > 0) {
        out.push(`<rect class="sep" x="${x}" y="${y}" width="${SEP}" height="26" rx="6"/>
<text class="mono t-accent" x="${x + SEP / 2}" y="${y + 18}" font-size="11" font-weight="700" text-anchor="middle">,</text>`);
        x += SEP + 3;
      }
      const w = PAD + v.length * CW;
      out.push(`<rect class="item" x="${x}" y="${y}" width="${w.toFixed(1)}" height="26" rx="6"/>
<text class="mono" x="${(x + w / 2).toFixed(1)}" y="${y + 18}" font-size="10.5" text-anchor="middle">${v}</text>`);
      x += w + 3;
    });
    return { svg: out.join("\n"), end: x };
  };

  const gA = glue(288, 128, ["APPLE-KG", "EGGS-C1", "KEFIR-05"]);
  const gB = glue(288, 232, ["BREAD-DARK"]);

  const pile = (x, y, name, vals) => {
    const chips = vals.map((v, i) =>
      `<rect class="chip" x="${x + 12}" y="${y + 26 + i * 22}" width="186" height="18" rx="5"/>
<text class="mono" x="${x + 105}" y="${y + 39 + i * 22}" font-size="10.5" text-anchor="middle">${v}</text>`).join("\n");
    return `<rect class="pile" x="${x}" y="${y}" width="210" height="${26 + vals.length * 22 + 8}" rx="10"/>
<text class="mono" x="${x + 12}" y="${y + 18}" font-size="11" font-weight="700">${name}</text>
${chips}`;
  };

  return svgWrap("0 0 700 396", S, "Разделитель живёт в зазорах, а не после каждого", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .pile { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .chip { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
.dg-${S} .cellbox { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .item { fill: var(--sunk); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .sep { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .sepdead { fill: none; stroke: var(--bad); stroke-width: 1.2; stroke-dasharray: 3 3; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.3; }
</style>

<text class="mono" x="26" y="32" font-size="12">string_agg(skuid, ', ' ORDER BY skuid)</text>
<text class="cap" x="26" y="52" font-size="11">Тот же GROUP BY и та же кучка, что у sum и count. Новое только одно: на выходе не число, а текст</text>

<text class="cap" x="26" y="82" font-size="10" font-weight="600">кучка по loc</text>
<text class="cap" x="276" y="82" font-size="10" font-weight="600">одна ячейка результата</text>

${pile(26, 92, "C-01-01", ["APPLE-KG", "EGGS-C1", "KEFIR-05"])}
<line class="flow" x1="240" y1="141" x2="270" y2="141" marker-end="url(#${S}-arrow)"/>
<rect class="cellbox" x="276" y="118" width="${(gA.end - 276 + 12).toFixed(1)}" height="46" rx="9"/>
${gA.svg}
<text class="cap t-accent" x="288" y="178" font-size="10">три элемента — два зазора, и в каждом по разделителю</text>

${pile(26, 200, "A-01-02", ["BREAD-DARK"])}
<line class="flow" x1="240" y1="245" x2="270" y2="245" marker-end="url(#${S}-arrow)"/>
<rect class="cellbox" x="276" y="222" width="${(gB.end - 276 + 12).toFixed(1)}" height="46" rx="9"/>
${gB.svg}
<rect class="sepdead" x="${(gB.end + 6).toFixed(1)}" y="232" width="${SEP}" height="26" rx="6"/>
<text class="mono t-bad" x="${(gB.end + 6 + SEP / 2).toFixed(1)}" y="250" font-size="11" text-anchor="middle">,</text>
${crossIcon(gB.end + 40, 238, 14)}
<text class="cap t-bad" x="${(gB.end + 62).toFixed(1)}" y="250" font-size="10">этого разделителя не будет</text>
<text class="cap" x="288" y="282" font-size="10">один элемент — зазоров нет, и разделитель не появится вовсе</text>

<line x1="26" y1="308" x2="674" y2="308" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="330" font-size="11">Первый аргумент вычисляется для каждой строки кучки: там может стоять и выражение, а не только колонка.</text>
<text class="cap" x="26" y="350" font-size="11">Второй аргумент — разделитель. Он ставится строго между элементами, а не после каждого.</text>
<text class="cap" x="26" y="370" font-size="11">Хвостовой запятой не будет никогда, подрезать её руками не надо: зазоров всегда на один меньше.</text>
`);
}

// Две сортировки в одном запросе, и они про разное: внутренняя стоит до
// закрывающей скобки и решает порядок кусочков внутри ячейки, внешняя стоит
// в конце и решает порядок строк отчёта. Схема существует ради того, чтобы
// они перестали путаться, и ради того, что без внутренней порядка нет вообще.
function buildAggOrderPlan() {
  const S = "agg-order-plan";
  const rows = [
    ["A-02-01", ["COFFEE-250", "SUGAR-1KG"]],
    ["B-01-01", ["MILK-1L", "WATER-6X15"]],
    ["C-01-01", ["APPLE-KG", "EGGS-C1", "KEFIR-05"]],
  ];

  const table = rows.map(([loc, items], i) => {
    const y = 186 + i * 36, c = y + 15;
    const chips = items.map((v, k) =>
      `<rect class="item" x="${196 + k * 106}" y="${y + 3}" width="100" height="24" rx="6"/>
<text class="mono" x="${246 + k * 106}" y="${c + 4}" font-size="10.5" text-anchor="middle">${v}</text>`).join("\n");
    return `<rect class="row" x="78" y="${y}" width="560" height="30" rx="7"/>
<text class="mono" x="94" y="${c + 4}" font-size="11">${loc}</text>
${chips}`;
  }).join("\n");

  return svgWrap("0 0 700 420", S, "Две сортировки в одном запросе", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-gold" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--gold)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .item { fill: var(--sunk); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .warn { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .inner { stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .outer { stroke: var(--gold); stroke-width: 1.6; }
</style>

<text class="cap" x="26" y="32" font-size="11.5" font-weight="600">В одном запросе спокойно бывает два ORDER BY, и это не опечатка</text>
<text class="mono" x="34" y="60" font-size="12">SELECT loc, string_agg(skuid, ', ' <tspan class="t-accent" font-weight="700">ORDER BY skuid</tspan>) AS content</text>
<text class="mono" x="34" y="80" font-size="12">FROM dbo.stock</text>
<text class="mono" x="34" y="100" font-size="12">GROUP BY loc</text>
<text class="mono" x="34" y="120" font-size="12"><tspan class="t-gold" font-weight="700">ORDER BY loc</tspan>;</text>

<text class="cap t-gold" x="34" y="152" font-size="10.5">внешний — порядок строк отчёта</text>
<text class="cap t-accent" x="300" y="152" font-size="10.5">внутренний — порядок кусочков внутри одной ячейки</text>

<line class="outer" x1="56" y1="168" x2="56" y2="288" marker-end="url(#${S}-arrow-gold)"/>
<line class="inner" x1="196" y1="172" x2="612" y2="172" marker-end="url(#${S}-arrow-accent)"/>
${table}

<rect class="warn" x="78" y="306" width="560" height="40" rx="9"/>
${crossIcon(92, 318, 14)}
<text class="mono t-bad" x="118" y="329" font-size="11">A-02-01 | SUGAR-1KG, COFFEE-250</text>
<text class="cap" x="92" y="343" font-size="10">убери ORDER BY из скобок — и порядок кусочков не обещан ничем: сегодня такой, завтра другой</text>

<line x1="26" y1="362" x2="674" y2="362" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="384" font-size="11">Внутренняя сортировка стоит до закрывающей скобки и работает своя у каждой кучки.</text>
<text class="cap" x="26" y="404" font-size="11">Внешняя стоит в конце запроса и к содержимому ячеек отношения не имеет. Это две разные вещи.</text>
`);
}

/* ---------------------------------------------------------------- d4.06 */

// Один отчёт, собранный двумя способами: слева два запроса и два прохода по
// таблице, справа один запрос с двумя наборами группировки и один проход.
// Схема существует ради того, что GROUPING SETS снимает ограничение «один
// набор», а пустой набор () означает ровно «итог по всему».
function buildGsSets() {
  const S = "gs-sets";
  const zone = [["BULK", "350.000"], ["COLD", "263.750"], ["PICK", "362.000"]];

  // Стопка строк-результатов одного набора.
  const res = (x, items, tone) => items.map(([a, b], i) => {
    const y = 194 + i * 24;
    return `<rect class="${tone}" x="${x}" y="${y}" width="142" height="20" rx="5"/>
<text class="mono" x="${x + 10}" y="${y + 14}" font-size="10">${a}</text>
<text class="mono cap" x="${x + 132}" y="${y + 14}" font-size="10" text-anchor="end">${b}</text>`;
  }).join("\n");

  // Таблица-источник: коробка с тремя полосками внутри.
  const src = (x) => `<rect class="src" x="${x}" y="88" width="150" height="34" rx="8"/>
<text class="mono" x="${x + 75}" y="103" font-size="10.5" text-anchor="middle">dbo.stock</text>
<line class="srcline" x1="${x + 16}" y1="112" x2="${x + 134}" y2="112"/>
<line class="srcline" x1="${x + 16}" y1="116" x2="${x + 134}" y2="116"/>`;

  return svgWrap("0 0 700 390", S, "Несколько наборов группировки за один проход", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .src { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .srcline { stroke: var(--line); stroke-width: 1; }
.dg-${S} .frame { fill: none; stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 5 4; }
.dg-${S} .framehot { fill: none; stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .setbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .setboxhot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .rowhot { fill: var(--paper); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pass { stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="32" font-size="11.5" font-weight="600">Один и тот же отчёт: три строки по зонам и строка общего итога</text>
<text class="cap" x="26" y="52" font-size="11">Разница не в результате, а в том, сколько раз сервер прочитает таблицу</text>
<line class="split" x1="350" y1="70" x2="350" y2="300"/>

<text class="cap" x="26" y="82" font-size="11" font-weight="600">два запроса через UNION ALL</text>
${src(109)}
<path class="flow" d="M148,124 C124,134 118,140 106,150" marker-end="url(#${S}-arrow)"/>
<path class="flow" d="M220,124 C244,134 250,140 262,150" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="52" y="140" font-size="9.5">проход 1</text>
<text class="cap" x="268" y="140" font-size="9.5">проход 2</text>
<rect class="setbox" x="34" y="154" width="142" height="28" rx="7"/>
<text class="mono" x="105" y="172" font-size="10.5" text-anchor="middle">GROUP BY zone</text>
<rect class="setbox" x="192" y="154" width="142" height="28" rx="7"/>
<text class="mono" x="263" y="172" font-size="10.5" text-anchor="middle">без GROUP BY</text>
${res(34, zone, "row")}
${res(192, [["NULL", "975.750"]], "row")}
<text class="cap" x="192" y="234" font-size="9.5">заглушку NULL</text>
<text class="cap" x="192" y="248" font-size="9.5">пишешь руками</text>
<text class="cap" x="34" y="280" font-size="9.5">Таблица прочитана дважды, потом UNION ALL</text>
<text class="cap" x="34" y="296" font-size="9.5">просто ставит куски друг под друга.</text>

<text class="cap t-accent" x="366" y="82" font-size="11" font-weight="600">один запрос через GROUPING SETS</text>
${src(441)}
<line class="pass" x1="516" y1="124" x2="516" y2="150" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap t-accent" x="524" y="140" font-size="9.5">один проход</text>
<rect class="framehot" x="358" y="146" width="316" height="44" rx="9"/>
<rect class="setboxhot" x="366" y="154" width="142" height="28" rx="7"/>
<text class="mono" x="437" y="172" font-size="10.5" text-anchor="middle">(l.zone)</text>
<rect class="setboxhot" x="524" y="154" width="142" height="28" rx="7"/>
<text class="mono" x="595" y="172" font-size="10.5" text-anchor="middle">()</text>
${res(366, zone, "rowhot")}
${res(524, [["NULL", "975.750"]], "rowhot")}
<text class="cap" x="524" y="234" font-size="9.5">NULL ставит движок</text>
<text class="cap t-accent" x="524" y="248" font-size="9.5">() = итог по всему</text>
<text class="cap" x="366" y="280" font-size="9.5">Источник прочитан один раз: оба уровня</text>
<text class="cap" x="366" y="296" font-size="9.5">собраны за этот единственный проход.</text>

<line x1="26" y1="312" x2="674" y2="312" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="334" font-size="11">Обычный GROUP BY задаёт один набор группировки. GROUPING SETS снимает ограничение «один».</text>
<text class="cap" x="26" y="354" font-size="11">Пустой набор () — это «итог по всему»: колонок для группировки в нём нет, вся выборка одна группа.</text>
<text class="cap" x="26" y="374" font-size="11">В колонке зоны у такой строки NULL — заглушку ставит движок, а не ты.</text>
`);
}

// ROLLUP разворачивается в наборы, у которых колонки исчезают справа налево:
// (a, b), (a), (). Схема существует ради двух следствий — n колонок дают n + 1
// наборов, и порядок колонок внутри ROLLUP меняет сам отчёт, а не оформление.
function buildRollupFold() {
  const S = "rollup-fold";
  // слоты (zone, uom), подпись, число строк, пример строки результата
  const sets = [
    [[true, true], "детализация", "5", "BULK | CASE | 80.000"],
    [[true, false], "подытог по зоне", "3", "BULK | NULL | 350.000"],
    [[false, false], "общий итог", "1", "NULL | NULL | 975.750"],
  ];

  const body = sets.map(([slots, what, n, sample], i) => {
    const top = 116 + i * 56, cy = top + 22;
    const cell = (x, on, label) => on
      ? `<rect class="slot" x="${x}" y="${top + 8}" width="96" height="28" rx="7"/>
<text class="mono" x="${x + 48}" y="${cy + 4}" font-size="10.5" text-anchor="middle">${label}</text>`
      : `<rect class="slotoff" x="${x}" y="${top + 8}" width="96" height="28" rx="7"/>
<text class="cap" x="${x + 48}" y="${cy + 5}" font-size="13" text-anchor="middle">—</text>`;
    return `${cell(90, slots[0], "l.zone")}
${cell(194, slots[1], "sk.uom")}
<text class="cap" x="302" y="${cy + 4}" font-size="10.5">${what}</text>
<text class="mono" x="466" y="${cy + 4}" font-size="11" text-anchor="end">${n}</text>
<text class="mono cap" x="512" y="${cy + 4}" font-size="10.5">${sample}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 372", S, "ROLLUP сворачивает колонки справа налево", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .slot { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .slotoff { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .fold { stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="mono" x="26" y="32" font-size="12">GROUP BY ROLLUP(l.zone, sk.uom)</text>
<text class="cap" x="26" y="52" font-size="11">Сокращение для трёх наборов сразу: детализация, подытог по зоне и общий итог</text>

<text class="cap t-accent" x="190" y="76" font-size="10.5" text-anchor="middle">колонки исчезают справа налево</text>
<line class="fold" x1="286" y1="88" x2="94" y2="88" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap" x="138" y="106" font-size="9.5" text-anchor="middle">l.zone</text>
<text class="cap" x="242" y="106" font-size="9.5" text-anchor="middle">sk.uom</text>
<text class="cap" x="302" y="106" font-size="9.5">что за уровень</text>
<text class="cap" x="466" y="106" font-size="9.5" text-anchor="end">строк</text>
<text class="cap" x="512" y="106" font-size="9.5">пример строки результата</text>
${body}

<line x1="26" y1="308" x2="674" y2="308" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="330" font-size="11">ROLLUP(a, b) — это ровно GROUPING SETS ((a, b), (a), ()). Ничего сверх них он не умеет, он короче.</text>
<text class="cap" x="26" y="350" font-size="11">Правило простое: n колонок дают n + 1 наборов. А порядок колонок внутри меняет сам отчёт.</text>
`);
}

// Почему у CUBE наборов ровно два в степени числа колонок: каждая колонка
// независимо от других либо участвует в группировке, либо свёрнута. Схема
// существует ради того, чтобы стало видно, как быстро растёт число слоёв.
function buildCubePower() {
  const S = "cube-power";
  // [zone участвует?, uom участвует?] -> набор и подпись
  const cells = [
    [0, 0, "(l.zone, sk.uom)", "детализация"],
    [1, 0, "(sk.uom)", "итог по единице измерения"],
    [0, 1, "(l.zone)", "подытог по зоне"],
    [1, 1, "()", "общий итог по складу"],
  ];

  const grid = cells.map(([cx, ry, set, what]) => {
    const x = 260 + cx * 200, y = 130 + ry * 74;
    return `<rect class="cell" x="${x}" y="${y}" width="190" height="64" rx="9"/>
<text class="mono" x="${x + 95}" y="${y + 28}" font-size="12" font-weight="700" text-anchor="middle">${set}</text>
<text class="cap" x="${x + 95}" y="${y + 48}" font-size="10" text-anchor="middle">${what}</text>`;
  }).join("\n");

  const ladder = ["1 колонка — 2 набора", "2 колонки — 4 набора", "3 колонки — 8 наборов", "4 колонки — 16 наборов"]
    .map((t, i) => {
      const x = 26 + i * 164, hot = i === 3;
      return `<rect class="${hot ? "stephot" : "step"}" x="${x}" y="298" width="140" height="28" rx="7"/>
<text class="cap ${hot ? "t-gold" : ""}" x="${x + 70}" y="316" font-size="10" text-anchor="middle">${t}</text>`;
    }).join("\n");

  return svgWrap("0 0 700 418", S, "У CUBE наборов два в степени числа колонок", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .cell { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .axis { fill: var(--sunk); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .step { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .stephot { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.4; }
</style>

<text class="mono" x="26" y="32" font-size="12">GROUP BY CUBE(l.zone, sk.uom)</text>
<text class="cap" x="26" y="52" font-size="11">Каждая колонка независимо от остальных либо участвует в группировке, либо свёрнута</text>

<text class="cap" x="455" y="82" font-size="10.5" font-weight="600" text-anchor="middle">l.zone</text>
<rect class="axis" x="260" y="92" width="190" height="26" rx="7"/>
<text class="cap" x="355" y="109" font-size="10" text-anchor="middle">участвует</text>
<rect class="axis" x="460" y="92" width="190" height="26" rx="7"/>
<text class="cap" x="555" y="109" font-size="10" text-anchor="middle">свёрнута</text>

<text class="cap" x="26" y="203" font-size="10.5" font-weight="600">sk.uom</text>
<rect class="axis" x="120" y="130" width="130" height="64" rx="7"/>
<text class="cap" x="185" y="167" font-size="10" text-anchor="middle">участвует</text>
<rect class="axis" x="120" y="204" width="130" height="64" rx="7"/>
<text class="cap" x="185" y="241" font-size="10" text-anchor="middle">свёрнута</text>
${grid}

<text class="cap" x="26" y="290" font-size="10.5" font-weight="600">два состояния на колонку, колонки друг от друга не зависят — значит 2 в степени числа колонок</text>
${ladder}

<line x1="26" y1="348" x2="674" y2="348" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="370" font-size="11">CUBE(a, b) — это четыре набора: (a, b), (a), (b) и (). Все возможные сочетания, без пропусков.</text>
<text class="cap" x="26" y="390" font-size="11">На четырёх колонках слоёв шестнадцать: строк в ответе станет больше, чем в исходной таблице.</text>
<text class="cap" x="26" y="410" font-size="11">Поэтому CUBE берут осознанно и на двух-трёх колонках, а не «вдруг пригодится».</text>
`);
}

/* ---------------------------------------------------------------- d4.07 */

// Разворот: слово, лежавшее значением внутри таблицы, встаёт именем колонки
// в шапке. Схема существует ради этой единственной мысли и ради её прямого
// следствия — раз имя колонки пишется в тексте запроса, все имена сводной
// известны заранее, иначе её просто не собрать.
function buildPivotTurn() {
  const S = "pivot-turn";
  // Длинная форма — ровно то, что вернул GROUP BY customer, status.
  const long = [
    ["Клиент B ТК-77", "NEW", "1"],
    ["Пятёрочка №1234", "NEW", "1"],
    ["Пятёрочка №1234", "PICKED", "1"],
    ["Дикси №308", "SHIPPED", "1"],
    ["ВкусВилл №42", "NEW", "1"],
    ["Перекрёсток №561", "PICKING", "1"],
  ];
  // Широкая форма — та же выборка, статусы уехали в шапку.
  const wide = [
    ["Клиент B ТК-77", ["1", "0", "0", "0"]],
    ["Пятёрочка №1234", ["1", "0", "1", "0"]],
    ["Дикси №308", ["0", "0", "0", "1"]],
    ["ВкусВилл №42", ["1", "0", "0", "0"]],
    ["Перекрёсток №561", ["0", "1", "0", "0"]],
  ];
  const heads = ["new", "picking", "picked", "shipped"];
  const HOTROW = 2;                    // строка с PICKED слева
  const HOTCOL = 2;                    // колонка picked справа
  const ry = (i) => 112 + i * 21;      // верх i-й строки в обеих таблицах
  const CW = 44.5;
  const cx = (k) => 496 + k * CW;      // левый край k-й колонки статуса

  const leftRows = long.map(([who, st, n], i) => {
    const y = ry(i), b = y + 14, hot = i === HOTROW;
    return `<text class="mono" x="34" y="${b}" font-size="9.5">${who}</text>
<rect class="${hot ? "vchiphot" : "vchip"}" x="172" y="${y + 3}" width="80" height="15" rx="5"/>
<text class="mono ${hot ? "t-accent" : ""}" x="212" y="${b}" font-size="9.5"${hot ? ' font-weight="700"' : ""} text-anchor="middle">${st}</text>
<text class="mono cap" x="310" y="${b}" font-size="9.5" text-anchor="end">${n}</text>`;
  }).join("\n");

  const rightRows = wide.map(([who, ns], i) => {
    const y = ry(i), b = y + 14;
    const cells = ns.map((v, k) =>
      `<text class="mono${k === HOTCOL ? " t-accent" : ""}" x="${(cx(k) + CW / 2).toFixed(1)}" y="${b}" font-size="9.5"${k === HOTCOL ? ' font-weight="700"' : ""} text-anchor="middle">${v}</text>`).join("\n");
    return `<text class="mono" x="392" y="${b}" font-size="9">${who}</text>
${cells}`;
  }).join("\n");

  const rightHeads = heads.map((h, k) =>
    `<text class="mono${k === HOTCOL ? " t-accent" : " cap"}" x="${(cx(k) + CW / 2).toFixed(1)}" y="106" font-size="8.5"${k === HOTCOL ? ' font-weight="700"' : ""} text-anchor="middle">${h}</text>`).join("\n");

  const hairs = (x1, x2, n) => Array.from({ length: n - 1 }, (_, i) =>
    `<line class="hair" x1="${x1}" y1="${ry(i + 1)}" x2="${x2}" y2="${ry(i + 1)}"/>`).join("\n");
  const verts = [496, 540.5, 585, 629.5].map((x) =>
    `<line class="hair" x1="${x}" y1="92" x2="${x}" y2="217"/>`).join("\n");

  return svgWrap("0 0 700 356", S, "Значение становится именем колонки", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .head { fill: var(--sunk); stroke: none; }
.dg-${S} .hair { stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .hotrow { fill: var(--accent-soft); stroke: none; }
.dg-${S} .colband { fill: var(--accent-soft); stroke: none; }
.dg-${S} .hotcell { fill: var(--paper); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .hothead { fill: none; stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .vchip { fill: var(--sunk); stroke: var(--line); stroke-width: 1; }
.dg-${S} .vchiphot { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .turn { fill: none; stroke: var(--accent); stroke-width: 1.6; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Один и тот же PICKED: слева он лежит в ячейке, справа стоит в шапке</text>
<text class="t-accent" x="470" y="50" font-size="10.5" font-weight="600" text-anchor="middle">то, что было значением, стало именем колонки</text>
<path class="turn" d="M320,164 C358,164 352,64 388,64 L556,64 C598,64 605,70 607,90" marker-end="url(#${S}-arrow-accent)"/>

<text class="cap" x="26" y="84" font-size="10" font-weight="600">длинная форма — GROUP BY customer, status</text>
<rect class="box" x="26" y="92" width="292" height="146" rx="8"/>
<rect class="head" x="27" y="93" width="290" height="19"/>
<rect class="hotrow" x="27" y="${ry(HOTROW)}" width="290" height="21"/>
<line class="hair" x1="26" y1="112" x2="318" y2="112"/>
<line class="hair" x1="166" y1="92" x2="166" y2="238"/>
<line class="hair" x1="266" y1="92" x2="266" y2="238"/>
${hairs(26, 318, 6)}
<text class="cap" x="34" y="106" font-size="8.5">customer</text>
<text class="cap" x="174" y="106" font-size="8.5">status</text>
<text class="cap" x="310" y="106" font-size="8.5" text-anchor="end">cnt</text>
${leftRows}
<text class="cap" x="26" y="258" font-size="9.5">шесть строк: «Пятёрочка» разбросана по двум из них</text>

<text class="cap" x="384" y="84" font-size="10" font-weight="600">широкая (сводная) — строка на клиента</text>
<rect class="box" x="384" y="92" width="290" height="125" rx="8"/>
<rect class="head" x="385" y="93" width="288" height="19"/>
<rect class="colband" x="${cx(HOTCOL)}" y="93" width="${CW}" height="123"/>
<rect class="hotcell" x="${cx(HOTCOL)}" y="${ry(1)}" width="${CW}" height="21"/>
<rect class="hothead" x="${cx(HOTCOL)}" y="92" width="${CW}" height="20"/>
<line class="hair" x1="384" y1="112" x2="674" y2="112"/>
${verts}
${hairs(384, 674, 5)}
<text class="cap" x="392" y="106" font-size="8.5">customer</text>
${rightHeads}
${rightRows}
<text class="cap" x="384" y="237" font-size="9.5">пять строк: про клиента всё видно разом</text>
<text class="cap" x="384" y="257" font-size="9.5">имена колонок написаны в запросе руками</text>

<line x1="26" y1="282" x2="674" y2="282" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="304" font-size="11">Разворот — это когда то, что было значением в ячейке, становится именем колонки в шапке.</text>
<text class="cap" x="26" y="324" font-size="11">Отсюда главное ограничение темы: имена колонок пишутся в тексте запроса, а значит известны заранее.</text>
<text class="cap" x="26" y="344" font-size="11">Строк стало меньше, колонок больше: узкая длинная таблица превратилась в широкую короткую.</text>
`);
}

// Разбор одной клетки сводной. CASE внутри агрегата — это выключатель: нужная
// строка даёт единицу, чужая ноль, и sum складывает выключатели по всей кучке.
// Схема существует ради того, что чужие строки из агрегата никуда не делись —
// они вошли в него и внесли ноль.
function buildCaseCell() {
  const S = "case-cell";
  // orderkey, customer, status, флаг CASE, входит ли в разбираемую кучку
  const rows = [
    ["1", "Пятёрочка №1234", "PICKED", "1", true],
    ["2", "Клиент B ТК-77", "NEW", "0", false],
    ["3", "Перекрёсток №561", "PICKING", "0", false],
    ["4", "Пятёрочка №1234", "NEW", "0", true],
    ["5", "ВкусВилл №42", "NEW", "0", false],
    ["6", "Дикси №308", "SHIPPED", "0", false],
  ];
  const ry = (i) => 108 + i * 22;

  const body = rows.map(([k, who, st, flag, mine], i) => {
    const y = ry(i), b = y + 15;
    return `${mine ? `<rect class="minerow" x="27" y="${y}" width="362" height="22"/>` : ""}
<text class="mono cap" x="34" y="${b}" font-size="9">${k}</text>
<text class="mono" x="60" y="${b}" font-size="9.5">${who}</text>
<rect class="vchip" x="202" y="${y + 3}" width="80" height="16" rx="5"/>
<text class="mono" x="242" y="${b}" font-size="9.5" text-anchor="middle">${st}</text>
<rect class="${flag === "1" ? "flagon" : "flagoff"}" x="340" y="${y + 3}" width="36" height="16" rx="5"/>
<text class="mono ${flag === "1" ? "t-ok" : "cap"}" x="358" y="${b}" font-size="9.5" font-weight="700" text-anchor="middle">${flag}</text>`;
  }).join("\n");

  const hairs = Array.from({ length: 5 }, (_, i) =>
    `<line class="hair" x1="26" y1="${ry(i + 1)}" x2="390" y2="${ry(i + 1)}"/>`).join("\n");

  return svgWrap("0 0 700 356", S, "Откуда в клетке взялась единица", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .head { fill: var(--sunk); stroke: none; }
.dg-${S} .hair { stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .band { fill: var(--sunk); stroke: none; }
.dg-${S} .minerow { fill: var(--accent-soft); stroke: none; }
.dg-${S} .vchip { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
.dg-${S} .flagon { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.2; }
.dg-${S} .flagoff { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .pilebox { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .sumbox { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .pass { fill: none; stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .hair2 { stroke: var(--line); stroke-width: 1; }
</style>

<text class="mono" x="26" y="28" font-size="11.5">sum(CASE WHEN status = 'PICKED' THEN 1 ELSE 0 END)</text>
<text class="cap" x="26" y="48" font-size="11">Разбираем одну клетку сводной — ту, где сходятся «Пятёрочка №1234» и picked</text>

<text class="cap" x="26" y="78" font-size="10" font-weight="600">CASE считается отдельно для каждой строки: нужная даёт 1, чужая 0</text>
<rect class="box" x="26" y="88" width="364" height="152" rx="8"/>
<rect class="band" x="326" y="89" width="63" height="150"/>
<rect class="head" x="27" y="89" width="362" height="19"/>
${body}
<line class="hair" x1="26" y1="108" x2="390" y2="108"/>
<line class="hair" x1="52" y1="88" x2="52" y2="240"/>
<line class="hair" x1="196" y1="88" x2="196" y2="240"/>
<line class="hair2" x1="326" y1="88" x2="326" y2="240"/>
${hairs}
<text class="cap" x="60" y="102" font-size="8.5">customer</text>
<text class="cap" x="204" y="102" font-size="8.5">status</text>
<text class="cap" x="358" y="102" font-size="8" text-anchor="middle">picked_flag</text>

<text class="cap" x="414" y="78" font-size="10" font-weight="600">sum складывает выключатели внутри кучки</text>
<rect class="pilebox" x="414" y="88" width="260" height="156" rx="9"/>
<text class="cap" x="428" y="106" font-size="10">кучка по customer: Пятёрочка №1234</text>
<path class="pass" d="M392,119 C406,119 400,146 410,146" marker-end="url(#${S}-arrow-accent)"/>
<path class="pass" d="M392,185 C406,185 400,180 410,180" marker-end="url(#${S}-arrow-accent)"/>
<rect class="flagon" x="428" y="136" width="34" height="20" rx="6"/>
<text class="mono t-ok" x="445" y="150" font-size="11" font-weight="700" text-anchor="middle">1</text>
<text class="mono cap" x="472" y="150" font-size="9.5">заказ 1 · PICKED</text>
<text class="cap" x="445" y="167" font-size="11" text-anchor="middle">+</text>
<rect class="flagoff" x="428" y="170" width="34" height="20" rx="6"/>
<text class="mono cap" x="445" y="184" font-size="11" font-weight="700" text-anchor="middle">0</text>
<text class="mono cap" x="472" y="184" font-size="9.5">заказ 4 · NEW</text>
<line class="hair2" x1="428" y1="200" x2="660" y2="200"/>
<rect class="sumbox" x="428" y="208" width="146" height="28" rx="8"/>
<text class="mono t-accent" x="501" y="228" font-size="14" font-weight="700" text-anchor="middle">sum = 1</text>
<text class="cap" x="586" y="220" font-size="9.5">это и есть</text>
<text class="cap" x="586" y="233" font-size="9.5">клетка picked</text>

<text class="cap" x="26" y="264" font-size="10.5">Четыре колонки отчёта — четыре таких выключателя, каждый настроен на свой статус.</text>
<line x1="26" y1="282" x2="674" y2="282" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="304" font-size="11">CASE внутри агрегата пропускает в него только нужные строки, а остальные превращает в ноль.</text>
<text class="cap" x="26" y="324" font-size="11">Агрегат честно сворачивает всю группу — просто «чужие» строки вносят в сумму ноль и потому не мешают.</text>
<text class="cap" x="26" y="344" font-size="11">Приём называется условной агрегацией: своего оператора у него нет, это CASE, положенный внутрь sum.</text>
`);
}

/* ---------------------------------------------------------------- d4.08 */

// Обратный ход: к каждой левой строке приклеивается табличка из VALUES,
// собранная заново из чисел именно этой строки. Схема существует ради двух
// вещей — что одна строка слева даёт столько строк, сколько их в табличке,
// и что имя колонки при этом перестаёт быть именем и становится значением.
function buildUnpivotLateral() {
  const S = "unpivot-lateral";
  const src = [
    ["KEFIR-05", "10.000", "10.000"],
    ["BUTTER-180", "12.000", "6.000"],
    ["EGGS-C1", "5.000", "0.000"],
  ];
  const HOT = 1;
  const sy = (i) => 110 + i * 22;

  const rows = src.map(([sku, a, b], i) => {
    const y = sy(i), t = y + 15;
    return `${i === HOT ? `<rect class="hotrow" x="27" y="${y}" width="228" height="22"/>` : ""}
<text class="mono" x="34" y="${t}" font-size="9">${sku}</text>
<text class="mono${i === HOT ? " t-accent" : " cap"}" x="187" y="${t}" font-size="9" text-anchor="end">${a}</text>
<text class="mono${i === HOT ? " t-accent" : " cap"}" x="250" y="${t}" font-size="9" text-anchor="end">${b}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 400", S, "Одна левая строка размножается табличкой", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .head { fill: var(--sunk); stroke: none; }
.dg-${S} .hair { stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .hotrow { fill: var(--accent-soft); stroke: none; }
.dg-${S} .valbox { fill: var(--paper); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .outbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .note { fill: var(--sunk); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .nameold { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; stroke-dasharray: 5 4; }
.dg-${S} .namenew { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .wire { fill: none; stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .divide { stroke: var(--line); stroke-width: 1; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Табличный конструктор VALUES, приклеенный к каждой левой строке</text>
<text class="mono" x="26" y="50" font-size="10.5">CROSS JOIN LATERAL (VALUES ('заsite03', d.qtyordered), ('отобрано', d.qtypicked)) AS v(kind, qty)</text>

<text class="cap" x="26" y="82" font-size="9.5" font-weight="600">dbo.orderdetail — заказ 3, три позиции</text>
<rect class="box" x="26" y="90" width="230" height="86" rx="8"/>
<rect class="head" x="27" y="91" width="228" height="19"/>
${rows}
<line class="hair" x1="26" y1="110" x2="256" y2="110"/>
<line class="hair" x1="130" y1="90" x2="130" y2="176"/>
<line class="hair" x1="193" y1="90" x2="193" y2="176"/>
<line class="hair" x1="26" y1="132" x2="256" y2="132"/>
<line class="hair" x1="26" y1="154" x2="256" y2="154"/>
<text class="cap" x="34" y="104" font-size="8">skuid</text>
<text class="cap" x="187" y="104" font-size="8" text-anchor="end">qtyordered</text>
<text class="cap" x="250" y="104" font-size="8" text-anchor="end">qtypicked</text>

<path class="wire" d="M258,143 C278,143 280,150 294,152" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap t-accent" x="300" y="112" font-size="9.5" font-weight="600">табличка для этой строки</text>
<rect class="valbox" x="300" y="118" width="180" height="76" rx="9"/>
<rect class="head" x="301" y="119" width="178" height="18"/>
<line class="hair" x1="300" y1="166" x2="480" y2="166"/>
<text class="cap" x="310" y="132" font-size="8">kind</text>
<text class="cap" x="470" y="132" font-size="8" text-anchor="end">qty</text>
<text class="mono t-accent" x="310" y="156" font-size="9.5" font-weight="700">'заsite03'</text>
<text class="mono" x="470" y="156" font-size="9.5" text-anchor="end">12.000</text>
<text class="mono t-accent" x="310" y="184" font-size="9.5" font-weight="700">'отобрано'</text>
<text class="mono" x="470" y="184" font-size="9.5" text-anchor="end">6.000</text>

<path class="wire" d="M484,156 C490,156 490,156 494,156" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap" x="500" y="112" font-size="9.5" font-weight="600">две строки результата</text>
<rect class="outbox" x="500" y="118" width="174" height="76" rx="9"/>
<rect class="head" x="501" y="119" width="172" height="18"/>
<line class="hair" x1="500" y1="166" x2="674" y2="166"/>
<line class="hair" x1="574" y1="118" x2="574" y2="194"/>
<line class="hair" x1="628" y1="118" x2="628" y2="194"/>
<text class="cap" x="506" y="132" font-size="8">skuid</text>
<text class="cap" x="580" y="132" font-size="8">kind</text>
<text class="cap" x="668" y="132" font-size="8" text-anchor="end">qty</text>
<text class="mono" x="506" y="156" font-size="8.5">BUTTER-180</text>
<text class="mono" x="580" y="156" font-size="8.5">заsite03</text>
<text class="mono" x="668" y="156" font-size="8.5" text-anchor="end">12.000</text>
<text class="mono" x="506" y="184" font-size="8.5">BUTTER-180</text>
<text class="mono" x="580" y="184" font-size="8.5">отобрано</text>
<text class="mono" x="668" y="184" font-size="8.5" text-anchor="end">6.000</text>

<text class="cap" x="26" y="216" font-size="11">Три левые строки × две строки таблички = шесть строк результата. Ни одно число не потерялось.</text>
<text class="cap" x="26" y="238" font-size="11" font-weight="600">И главное: имя колонки перестало быть именем</text>
<rect class="note" x="26" y="246" width="648" height="64" rx="9"/>
<rect class="nameold" x="60" y="258" width="118" height="26" rx="7"/>
<text class="mono cap" x="119" y="275" font-size="11" text-anchor="middle">qtyordered</text>
<text class="cap" x="119" y="300" font-size="9" text-anchor="middle">имя из текста запроса</text>
<line class="wire" x1="192" y1="271" x2="244" y2="271" marker-end="url(#${S}-arrow-accent)"/>
<rect class="namenew" x="256" y="258" width="118" height="26" rx="7"/>
<text class="mono t-accent" x="315" y="275" font-size="11" font-weight="700" text-anchor="middle">'заsite03'</text>
<text class="cap" x="315" y="300" font-size="9" text-anchor="middle">значение в колонке kind</text>
<line class="divide" x1="404" y1="256" x2="404" y2="300"/>
<text class="cap" x="424" y="268" font-size="10">с этого момента с видом количества можно</text>
<text class="cap" x="424" y="284" font-size="10">делать всё то же, что с любыми данными:</text>
<text class="cap" x="424" y="300" font-size="10">фильтровать, группировать, складывать</text>

<line x1="26" y1="326" x2="674" y2="326" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="348" font-size="11">VALUES в FROM — это таблица, записанная прямо в тексте запроса; имена её колонок задаёт AS v(kind, qty).</text>
<text class="cap" x="26" y="368" font-size="11">LATERAL даёт правой части право видеть колонки левой строки — без него ссылка на d.qtyordered незаконна.</text>
<text class="cap" x="26" y="388" font-size="11">Одна строка слева × две строки справа = две строки результата: три позиции заказа дали шесть строк.</text>
`);
}

// Две формы одних и тех же данных. Схема существует ради того, где живёт
// смысл: в широкой форме часть его записана в схеме, в заголовке колонки,
// а в длинной весь смысл лежит рядом со значением, в самих данных. Отсюда и
// правило про то, что широкую форму делают в самом конце.
function buildWideVsLong() {
  const S = "wide-vs-long";
  const wide = [
    ["KEFIR-05", "10.000", "10.000"],
    ["BUTTER-180", "12.000", "6.000"],
    ["EGGS-C1", "5.000", "0.000"],
  ];
  const long = [
    ["KEFIR-05", "заsite03", "10.000"],
    ["KEFIR-05", "отобрано", "10.000"],
    ["BUTTER-180", "заsite03", "12.000"],
    ["BUTTER-180", "отобрано", "6.000"],
    ["EGGS-C1", "заsite03", "5.000"],
    ["EGGS-C1", "отобрано", "0.000"],
  ];
  const ry = (i) => 114 + i * 22;

  const wrows = wide.map(([sku, a, b], i) => {
    const y = ry(i), t = y + 15, hot = i === 1;
    return `${hot ? `<rect class="goldcell" x="146" y="${y}" width="92" height="22" rx="4"/>` : ""}
<text class="mono" x="34" y="${t}" font-size="9.5">${sku}</text>
<text class="mono${hot ? " t-gold" : ""}" x="230" y="${t}" font-size="9.5"${hot ? ' font-weight="700"' : ""} text-anchor="end">${a}</text>
<text class="mono cap" x="322" y="${t}" font-size="9.5" text-anchor="end">${b}</text>`;
  }).join("\n");

  const lrows = long.map(([sku, kind, q], i) => {
    const y = ry(i), t = y + 15;
    return `<rect class="accband" x="490" y="${y}" width="92" height="22"/>
<text class="mono" x="378" y="${t}" font-size="9.5">${sku}</text>
<text class="mono t-accent" x="536" y="${t}" font-size="9.5" font-weight="700" text-anchor="middle">${kind}</text>
<text class="mono cap" x="666" y="${t}" font-size="9.5" text-anchor="end">${q}</text>`;
  }).join("\n");

  const hairs = (x1, x2, n) => Array.from({ length: n - 1 }, (_, i) =>
    `<line class="hair" x1="${x1}" y1="${ry(i + 1)}" x2="${x2}" y2="${ry(i + 1)}"/>`).join("\n");

  return svgWrap("0 0 700 384", S, "Одни данные в двух формах", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .head { fill: var(--sunk); stroke: none; }
.dg-${S} .hair { stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .goldhead { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .goldcell { fill: none; stroke: var(--gold); stroke-width: 1.4; stroke-dasharray: 4 3; }
.dg-${S} .accband { fill: var(--accent-soft); stroke: none; }
.dg-${S} .ghost { fill: none; stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 5 4; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Одни и те же шесть чисел, разложенные двумя способами</text>
<text class="cap" x="26" y="48" font-size="11">Ни одно не потерялось и ни одно не прибавилось — они просто переехали из ширины в длину</text>
<line class="split" x1="350" y1="64" x2="350" y2="300"/>

<text class="t-gold" x="26" y="82" font-size="10" font-weight="600">широкая (wide) — один объект, одна строка</text>
<rect class="box" x="26" y="92" width="304" height="88" rx="8"/>
<rect class="head" x="27" y="93" width="302" height="21"/>
<rect class="goldhead" x="146" y="92" width="92" height="22"/>
${wrows}
<line class="hair" x1="26" y1="114" x2="330" y2="114"/>
<line class="hair" x1="146" y1="92" x2="146" y2="180"/>
<line class="hair" x1="238" y1="92" x2="238" y2="180"/>
${hairs(26, 330, 3)}
<text class="cap" x="34" y="107" font-size="8.5">skuid</text>
<text class="t-gold" x="192" y="107" font-size="8.5" font-weight="700" text-anchor="middle">qtyordered</text>
<text class="cap" x="322" y="107" font-size="8.5" text-anchor="end">qtypicked</text>
<text class="t-gold" x="26" y="202" font-size="9.5">чтобы понять, что значит 12.000, надо</text>
<text class="t-gold" x="26" y="218" font-size="9.5">посмотреть на заголовок колонки — смысл в схеме</text>
<rect class="ghost" x="26" y="232" width="304" height="42" rx="8"/>
<text class="cap" x="40" y="252" font-size="9.5">приедет колонка «апрель» — и запросы поверх</text>
<text class="cap" x="40" y="266" font-size="9.5">молча посчитают по трём месяцам из четырёх</text>

<text class="t-accent" x="370" y="82" font-size="10" font-weight="600">длинная (long) — одно значение, одна строка</text>
<rect class="box" x="370" y="92" width="304" height="154" rx="8"/>
<rect class="head" x="371" y="93" width="302" height="21"/>
${lrows}
<line class="hair" x1="370" y1="114" x2="674" y2="114"/>
<line class="hair" x1="490" y1="92" x2="490" y2="246"/>
<line class="hair" x1="582" y1="92" x2="582" y2="246"/>
${hairs(370, 674, 6)}
<text class="cap" x="378" y="107" font-size="8.5">skuid</text>
<text class="t-accent" x="536" y="107" font-size="8.5" font-weight="700" text-anchor="middle">kind</text>
<text class="cap" x="666" y="107" font-size="8.5" text-anchor="end">qty</text>
<text class="t-accent" x="370" y="268" font-size="9.5">рядом с числом лежит слово «заsite03»: смысл в данных</text>
<text class="cap" x="370" y="284" font-size="9.5">новый вид количества — просто ещё одна строка</text>

<line x1="26" y1="310" x2="674" y2="310" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="332" font-size="11">Широкая форма придумана для чтения глазами: она живёт на границах системы — Excel, выгрузки, отчёты.</text>
<text class="cap" x="26" y="352" font-size="11">Длинная — рабочая: нормализованные таблицы почти всегда длинные, и SQL рассчитан именно на них.</text>
<text class="cap" x="26" y="372" font-size="11">Правило: внутри системы данные держат длинными, широкую форму делают в самом конце, для показа.</text>
`);
}

/* ---------------------------------------------------------------- реестр */

export const REGISTRY = {
  "agg-fold": {
    id: "agg-fold",
    title: "Агрегат сворачивает столбец в одно значение",
    caption: "Слева обычная функция: она считает внутри строки, и строк на выходе столько же. Справа агрегат: он читает столбец целиком и отдаёт одно число — тринадцать строк вошло, одна вышла.",
    anchor: "Что здесь произошло",
    svg: buildAggFold(),
  },
  "group-by-buckets": {
    id: "group-by-buckets",
    title: "Одна кучка даёт ровно одну строку результата",
    caption: "Сначала строки раскладываются по кучкам по значению loc, и только потом каждая кучка взвешивается отдельно. Сколько разных значений у группирующей колонки — столько строк и вернёт запрос.",
    anchor: "Что здесь произошло",
    svg: buildGroupByBuckets(),
  },
  "group-by-select-slot": {
    id: "group-by-select-slot",
    title: "Одна ячейка — один кандидат",
    caption: "У колонки из GROUP BY кандидат в кучке ровно один. У агрегата кандидатов много, но функция сказала, как из них сделать одно. У голой колонки кандидатов девять и никакой инструкции — отсюда 42803.",
    anchor: "Железное правило: в SELECT либо группирующая колонка, либо агрегат",
    svg: buildGroupBySelectSlot(),
  },
  "group-by-pipeline": {
    id: "group-by-pipeline",
    title: "Где GROUP BY стоит в конвейере",
    caption: "Третья ступень: после WHERE и до SELECT. Отсюда сразу видно, что WHERE фильтрует до группировки, что агрегата в WHERE не бывает и что ORDER BY по агрегату — законная вещь.",
    anchor: "Где GROUP BY стоит в конвейере",
    svg: buildGroupByPipeline(),
  },
  "having-pipeline": {
    id: "having-pipeline",
    title: "HAVING включается там, где строк уже нет",
    caption: "Поток тает по ступеням и по дороге меняет единицу измерения: сначала строки, после GROUP BY — кучки. HAVING приходит последним из фильтров и выбрасывает кучку целиком, вместе со всем её содержимым.",
    anchor: "Что здесь произошло",
    svg: buildHavingPipeline(),
  },
  "having-sums-change": {
    id: "having-sums-change",
    title: "WHERE меняет сумму, HAVING — только состав отчёта",
    caption: "Один и тот же фильтр в двух местах конвейера. Слева он выбрасывает строку до сложения, и сумма выходит другая. Справа сумма уже сложена, и HAVING умеет только выбросить всю коробку целиком.",
    anchor: "Иногда перенос меняет не цену, а ответ",
    svg: buildHavingSumsChange(),
  },
  "distinct-agg-funnel": {
    id: "distinct-agg-funnel",
    title: "Три числа из одной колонки",
    caption: "count(*) считает строки, count(loc) — непустые значения, count(DISTINCT loc) — разные значения. Дубли схлопываются до счёта, а не после: агрегат получает уже прополотый список.",
    anchor: "Что здесь произошло",
    svg: buildDistinctAggFunnel(),
  },
  "join-inflate-keys": {
    id: "join-inflate-keys",
    title: "Соединение размножило строки, но не заказы",
    caption: "JOIN не испортил данные — он сделал строку результата мельче: не «заказ», а «позиция заказа». Счётчик строк начал считать копии, а счётчик разных ключей остался честным.",
    anchor: "Главное применение: считать сущности поверх соединения",
    svg: buildJoinInflateKeys(),
  },
  "distinct-two-places": {
    id: "distinct-two-places",
    title: "Одно слово в двух местах — две разные вещи",
    caption: "SELECT DISTINCT убирает повторяющиеся строки вывода, count(DISTINCT) считает разные значения внутри группы. Отсюда и расхождение на NULL: строка с ним остаётся, а в счёт он не идёт.",
    anchor: "SELECT DISTINCT и count(DISTINCT) — не родственники",
    svg: buildDistinctTwoPlaces(),
  },
  "string-agg-fold": {
    id: "string-agg-fold",
    title: "Разделитель живёт в зазорах, а не после каждого",
    caption: "Кучка собирается по loc, элементы берутся из её строк, а разделитель встаёт в зазоры между ними. Зазоров всегда на один меньше, чем элементов, — поэтому хвостовой запятой не бывает.",
    anchor: "Что здесь произошло",
    svg: buildStringAggFold(),
  },
  "agg-order-plan": {
    id: "agg-order-plan",
    title: "Две сортировки в одном запросе",
    caption: "Внутренняя стоит до закрывающей скобки и решает порядок кусочков внутри ячейки, внешняя стоит в конце и решает порядок строк отчёта. Уберёшь внутреннюю — порядка внутри ячейки не будет вообще.",
    anchor: "Порядок внутри склейки не берётся сам собой",
    svg: buildAggOrderPlan(),
  },
  "gs-sets": {
    id: "gs-sets",
    title: "Несколько наборов группировки за один проход",
    caption: "Слева два запроса и два прохода по таблице, справа один запрос и один проход. Результат тот же, а пустой набор () — это «итог по всему»: заглушку NULL в колонке зоны ставит движок, а не ты.",
    anchor: "Что здесь произошло",
    svg: buildGsSets(),
  },
  "rollup-fold": {
    id: "rollup-fold",
    title: "ROLLUP сворачивает колонки справа налево",
    caption: "Колонки исчезают по одной с правого края: (zone, uom), потом (zone), потом (). Отсюда оба правила разом — n колонок дают n + 1 уровней, а порядок колонок внутри ROLLUP меняет сам отчёт.",
    anchor: "ROLLUP: сворачиваем справа налево",
    svg: buildRollupFold(),
  },
  "cube-power": {
    id: "cube-power",
    title: "У CUBE наборов два в степени числа колонок",
    caption: "Каждая колонка независимо от остальных либо участвует в группировке, либо свёрнута. Два состояния на колонку — значит на двух колонках четыре набора, а на четырёх уже шестнадцать.",
    anchor: "CUBE: все сочетания сразу",
    svg: buildCubePower(),
  },
  "pivot-turn": {
    id: "pivot-turn",
    title: "Значение становится именем колонки",
    caption: "Слева PICKED лежит внутри таблицы, в ячейке колонки status. Справа то же слово стоит в шапке. Отсюда и главное ограничение темы: имена колонок пишутся в тексте запроса, а значит известны заранее.",
    anchor: "Что здесь произошло",
    svg: buildPivotTurn(),
  },
  "case-cell": {
    id: "case-cell",
    title: "Откуда в клетке взялась единица",
    caption: "CASE внутри агрегата — это выключатель: нужная строка даёт 1, чужая 0. Чужие строки из агрегата никуда не делись, они честно в него вошли и внесли ноль — поэтому и не помешали.",
    anchor: "Что здесь произошло",
    svg: buildCaseCell(),
  },
  "unpivot-lateral": {
    id: "unpivot-lateral",
    title: "Одна левая строка размножается табличкой",
    caption: "К каждой строке приклеивается табличка из VALUES, собранная заново из чисел именно этой строки, — за это право отвечает LATERAL. Три позиции × две строки таблички дали шесть строк.",
    anchor: "Что здесь произошло",
    svg: buildUnpivotLateral(),
  },
  "wide-vs-long": {
    id: "wide-vs-long",
    title: "Одни данные в двух формах",
    caption: "Разница не в красоте, а в том, где живёт смысл. В широкой форме часть его записана в схеме, в заголовке колонки; в длинной весь смысл лежит рядом со значением, в самих данных.",
    anchor: "Широкая форма удобна человеку, длинная — базе",
    svg: buildWideVsLong(),
  },
};

// Привязка схем к нодам: код ноды -> список id.
export const INDEX = {
  "d4.01": ["agg-fold"],
  "d4.02": ["group-by-buckets", "group-by-select-slot", "group-by-pipeline"],
  "d4.03": ["having-pipeline", "having-sums-change"],
  "d4.04": ["distinct-agg-funnel", "join-inflate-keys", "distinct-two-places"],
  "d4.05": ["string-agg-fold", "agg-order-plan"],
  "d4.06": ["gs-sets", "rollup-fold", "cube-power"],
  "d4.07": ["pivot-turn", "case-cell"],
  "d4.08": ["unpivot-lateral", "wide-vs-long"],
};
