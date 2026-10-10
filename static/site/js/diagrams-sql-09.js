// diagrams-sql-09.js
// Схемы этапа 9: программирование на стороне сервера.
//
// Оснастка общая (diagrams-sql-kit.js), правила те же: самодостаточный модуль,
// цвета только через CSS-переменные страницы, никакого JS внутри SVG.
// Образец стиля — diagrams-sql-02.js.

import { arrowDefs, checkIcon, crossIcon, svgWrap } from "./diagrams-sql-kit.js";

/* ---------------------------------------------------------------- d9.01 */

// Пакет и две его фазы: сначала сервер разбирает весь текст целиком, и только
// потом выполняет команды по очереди. Схема существует ради одной мысли:
// ошибка разбора роняет пакет весь, включая команды, стоящие выше опечатки,
// а ошибка выполнения — только то, до чего очередь ещё не дошла.
function buildBatchParse() {
  const S = "batch-parse";

  // Один путь: подпись, три команды и по две отметки на каждую (разбор, выполнение).
  // Отметка: "ok" | "bad" | "dash" | текст в скобках рисуется отдельно.
  const path = (y0, head, cmds, killPhase2, tail) => {
    const rows = cmds.map(([txt, parse, run, runNote], i) => {
      const top = y0 + 24 + i * 30;
      const cy = top + 15;
      const mark = (kind, x) => kind === "ok" ? checkIcon(x - 7, cy - 7, 14)
        : kind === "bad" ? crossIcon(x - 7, cy - 7, 14)
        : `<line class="hush" x1="${x - 7}" y1="${cy}" x2="${x + 7}" y2="${cy}"/>`;
      const runCell = killPhase2 ? "" : `${mark(run, 470)}
<text class="cap ${run === "bad" ? "t-bad" : ""}" x="488" y="${cy + 4}" font-size="10">${runNote}</text>`;
      return `<rect class="${parse === "bad" ? "rowbad" : "row"}" x="34" y="${top}" width="252" height="26" rx="7"/>
<text class="mono" x="44" y="${cy + 4}" font-size="10.5">${txt}</text>
${mark(parse, 340)}
<text class="cap ${parse === "bad" ? "t-bad" : ""}" x="358" y="${cy + 4}" font-size="10">${cmds[i][4]}</text>
${runCell}`;
    }).join("\n");

    const dead = killPhase2
      ? `<rect class="offbox" x="458" y="${y0 + 24}" width="210" height="86" rx="9"/>
<text class="cap t-bad" x="563" y="${y0 + 60}" font-size="11" font-weight="600" text-anchor="middle">фазы не было вовсе</text>
<text class="cap" x="563" y="${y0 + 78}" font-size="10" text-anchor="middle">сервер не выполнил ни одной команды</text>`
      : "";

    return `<text class="cap" x="26" y="${y0 + 14}" font-size="11.5" font-weight="600">${head}</text>
<rect class="batch" x="28" y="${y0 + 20}" width="264" height="94" rx="9"/>
${rows}
${dead}
<text class="cap" x="26" y="${y0 + 132}" font-size="11">${tail}</text>`;
  };

  return svgWrap("0 0 700 424", S, "Пакет разбирается целиком, потом выполняется", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .rowbad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .batch { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 5 4; }
.dg-${S} .offbox { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1.2; stroke-dasharray: 5 4; }
.dg-${S} .hush { stroke: var(--line); stroke-width: 1.6; stroke-linecap: round; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Клиент шлёт не три команды, а один пакет. Сервер сначала разбирает его весь, и только потом выполняет</text>
<text class="cap t-accent" x="34" y="52" font-size="10.5">один пакет — то, что уехало одним куском</text>
<text class="cap" x="340" y="52" font-size="10.5" font-weight="600">фаза 1 — разбор</text>
<text class="cap" x="470" y="52" font-size="10.5" font-weight="600">фаза 2 — выполнение</text>
<line class="split" x1="452" y1="58" x2="452" y2="176"/>
<line class="split" x1="452" y1="212" x2="452" y2="334"/>

${path(58, "путь 1 — опечатка INSRT: это ошибка разбора, SQLSTATE 42601", [
    ["CREATE TABLE recv_draft (…)", "ok", "dash", "", "разобралась"],
    ["INSRT INTO recv_draft VALUES", "bad", "dash", "", "syntax error"],
    ["SELECT step, note FROM …", "dash", "dash", "", "до неё не дошли"],
  ], true, "В базе не появилось ничего — даже таблицы из первой команды, которая стоит выше опечатки.")}

${path(216, "путь 2 — деление на ноль: это ошибка выполнения, SQLSTATE 22012", [
    ["CREATE TABLE recv_draft (…)", "ok", "ok", "таблица создана", "разобралась"],
    ["INSERT … VALUES (1, 240/0)", "ok", "bad", "division by zero", "разобралась"],
    ["SELECT step, note FROM …", "ok", "dash", "очередь не дошла", "разобралась"],
  ], false, "Разбор прошёл, команды пошли одна за другой — и до упавшей кое-что успело выполниться по-настоящему.")}

<line x1="26" y1="372" x2="674" y2="372" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="392" font-size="11">Ошибка разбора роняет весь пакет, включая команды до неё: сервер не идёт сверху вниз, он сначала читает всё.</text>
<text class="cap" x="26" y="412" font-size="11">Пакет — единица разбора, а не единица отката. Что делать с уже выполненным, решают транзакции, а не пакет.</text>
`);
}

// Сроки жизни: у каждого «хранилища значения» своя граница, за которой имени
// больше нет. Схема существует ради того, чтобы стало видно, что переменная
// T-SQL живёт ровно до GO, а переменная psql вообще не серКлиент A.
function buildVarScope() {
  const S = "var-scope";
  const X0 = 322;
  // подпись, пояснение, кто знает, до какого рубежа тянется полоса
  const rows = [
    ["DECLARE x int := 0;", "PL/pgSQL, внутри DO или функции", "сервер", 372, false],
    ["DECLARE @x int = 0;", "T-SQL, любой пакет", "сервер", 432, false],
    ["SET LOCAL my.x = …", "параметр внутри транзакции", "сервер", 496, false],
    ["SET my.x = …", "параметр сессии", "сервер", 566, false],
    ["CREATE TEMP TABLE t", "временная таблица", "сервер", 566, false],
    ["\\set x 'MILK-1L'", "переменная psql, подстановка :x", "клиент", 640, true],
  ];
  const ticks = [
    [372, "END блока"],
    [432, "GO"],
    [496, "COMMIT"],
    [566, "конец сессии"],
    [640, "выход из psql"],
  ];

  const top0 = 96, rh = 34;
  const bottom = top0 + rows.length * rh;

  const body = rows.map(([code, what, who, x1, client], i) => {
    const top = top0 + i * rh;
    const cy = top + 17;
    return `<text class="mono" x="26" y="${cy - 3}" font-size="10.5">${code}</text>
<text class="cap" x="26" y="${cy + 11}" font-size="9.5">${what}</text>
<rect class="${client ? "whoc" : "whos"}" x="252" y="${cy - 9}" width="56" height="18" rx="6"/>
<text class="cap ${client ? "t-gold" : "t-accent"}" x="280" y="${cy + 4}" font-size="9.5" text-anchor="middle">${who}</text>
<rect class="${client ? "barc" : "bars"}" x="${X0}" y="${cy - 8}" width="${x1 - X0}" height="16" rx="5"/>
<line class="edge" x1="${x1}" y1="${cy - 10}" x2="${x1}" y2="${cy + 10}"/>`;
  }).join("\n");

  const grid = ticks.map(([x, label]) =>
    `<line class="split" x1="${x}" y1="88" x2="${x}" y2="${bottom + 4}"/>
<text class="cap" x="${x}" y="${bottom + 20}" font-size="9.5" text-anchor="middle">${label}</text>`).join("\n");

  return svgWrap("0 0 700 400", S, "Кто про значение знает и до какого момента оно живёт", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .whos { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.1; }
.dg-${S} .whoc { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.1; }
.dg-${S} .bars { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .barc { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .edge { stroke: var(--ink-soft); stroke-width: 2; stroke-linecap: round; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
.dg-${S} .start { stroke: var(--muted); stroke-width: 1.4; }
</style>

<text class="cap" x="26" y="28" font-size="11.5" font-weight="600">Всё это отличается двумя вещами: кто про значение знает и до какого рубежа оно живёт</text>
<text class="cap" x="26" y="52" font-size="10.5">чем написано</text>
<text class="cap" x="252" y="52" font-size="10.5">кто знает</text>
<text class="cap" x="322" y="52" font-size="10.5">докуда живёт</text>
<line class="start" x1="${X0}" y1="76" x2="${X0}" y2="${bottom + 4}"/>
<text class="cap" x="${X0}" y="70" font-size="9.5" text-anchor="middle">объявили</text>
${grid}
${body}

<line x1="26" y1="${bottom + 38}" x2="674" y2="${bottom + 38}" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="${bottom + 58}" font-size="11">Область видимости переменной T-SQL — пакет: GO его закрыл, и дальше сервер про имя @x уже не знает.</text>
<text class="cap" x="26" y="${bottom + 78}" font-size="11">Переменная psql — не серКлиент A вовсе: клиент подставляет её в текст запроса ещё до отправки.</text>
`);
}

/* ---------------------------------------------------------------- d9.02 */

// CASE и IF рядом: слева одна команда выбирает значение для каждой строки,
// справа выбирается сама команда, и невыбранная на сервер не уезжает.
// Схема существует ради вопроса «сколько команд у тебя в руках».
function buildCaseVsIf() {
  const S = "case-vs-if";
  const rows = [
    ["BREAD-DARK L0004", "30 / 30", "резерв забрал всё"],
    ["MILK-1L L0001", "48 / 12", "зарезервировано частично"],
    ["MILK-1L L0002", "60 / 0", "резерва нет"],
  ];
  const left = rows.map(([sku, qty, word], i) => {
    const top = 148 + i * 40;
    const cy = top + 14;
    return `<rect class="row" x="26" y="${top}" width="128" height="28" rx="7"/>
<text class="mono" x="34" y="${cy - 1}" font-size="9.5">${sku}</text>
<text class="cap" x="34" y="${cy + 10}" font-size="9">qty / alloc = ${qty}</text>
<line class="flow" x1="158" y1="${cy}" x2="174" y2="${cy}" marker-end="url(#${S}-arrow)"/>
<rect class="pill" x="178" y="${top}" width="154" height="28" rx="7"/>
<text class="mono" x="255" y="${cy + 4}" font-size="9.5" text-anchor="middle">'${word}'</text>`;
  }).join("\n");

  return svgWrap("0 0 700 356", S, "CASE выбирает значение, IF выбирает команду", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .pill { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .cmd { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .cond { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .offcmd { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.2; stroke-dasharray: 5 4; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .hotflow { stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .mutewire { stroke: var(--line-soft); stroke-width: 1.2; stroke-dasharray: 3 4; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Спроси себя, сколько команд у тебя в руках. Одна — это CASE. Две, и надо выбрать — это IF</text>
<line class="split" x1="350" y1="44" x2="350" y2="292"/>

<text class="cap" x="26" y="60" font-size="11.5" font-weight="600">CASE — внутри запроса</text>
<text class="cap" x="26" y="78" font-size="10.5">команда одна, значений столько, сколько строк</text>
<rect class="cmd" x="26" y="90" width="306" height="42" rx="9"/>
<text class="mono" x="179" y="108" font-size="10" text-anchor="middle">SELECT skuid, lot,</text>
<text class="mono" x="179" y="124" font-size="10" text-anchor="middle">CASE WHEN … THEN … END AS пометка</text>
${left}
<text class="cap" x="26" y="284" font-size="10.5">Один SELECT прошёл по всем трём строкам</text>
<text class="cap" x="26" y="300" font-size="10.5">и на каждой выбрал слово для колонки.</text>

<text class="cap" x="374" y="60" font-size="11.5" font-weight="600">IF — вокруг запроса</text>
<text class="cap" x="374" y="78" font-size="10.5">команд две, серверу уедет ровно одна</text>
<rect class="cond" x="374" y="90" width="300" height="42" rx="9"/>
<text class="mono" x="524" y="108" font-size="10" text-anchor="middle">IF EXISTS (SELECT 1 FROM dbo.pickdetail</text>
<text class="mono" x="524" y="124" font-size="10" text-anchor="middle">WHERE status = 'RELEASED') THEN</text>

<line class="hotflow" x1="444" y1="134" x2="444" y2="164" marker-end="url(#${S}-arrow-accent)"/>
<text class="cap t-accent" x="452" y="152" font-size="9.5">да</text>
<line class="mutewire" x1="604" y1="134" x2="604" y2="166"/>
<text class="cap" x="612" y="152" font-size="9.5">нет</text>

<rect class="cmd" x="374" y="168" width="140" height="46" rx="8"/>
<text class="mono" x="444" y="186" font-size="9.5" text-anchor="middle">UPDATE dbo.orders</text>
<text class="mono" x="444" y="200" font-size="9.5" text-anchor="middle">SET status = 'PICKING'</text>
${checkIcon(384, 224, 14)}
<text class="cap" x="404" y="235" font-size="10">выполнилась</text>

<rect class="offcmd" x="534" y="168" width="140" height="46" rx="8"/>
<text class="mono cap" x="604" y="186" font-size="9.5" text-anchor="middle">DELETE FROM</text>
<text class="mono cap" x="604" y="200" font-size="9.5" text-anchor="middle">dbo.pickdetail</text>
${crossIcon(544, 224, 14)}
<text class="cap t-bad" x="564" y="235" font-size="10">не отправлена</text>

<text class="cap" x="374" y="266" font-size="10.5">Вторая ветка не «выполнилась и ничего не удалила».</text>
<text class="cap" x="374" y="284" font-size="10.5">Она вообще не уехала серверу — в этом весь смысл IF.</text>
<text class="cap" x="374" y="300" font-size="10.5">Команду внутрь CASE не засунуть: CASE — выражение.</text>

<line x1="26" y1="316" x2="674" y2="316" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="338" font-size="11">CASE работает внутри запроса и выбирает значение. IF работает вокруг запроса и выбирает, какую команду отправить.</text>
`);
}

/* ---------------------------------------------------------------- d9.03 */

// Три вызывающих и одно правило: слева у каждого своя копия кода, и копии
// разъехались; справа копия одна и лежит в самой базе. Схема существует ради
// мысли, ради которой процедуры и придумали: код живёт рядом с данными, и
// правку в нём видят все, кто его зовёт.
function buildProcOnePlace() {
  const S = "proc-one-place";
  const callers = ["приложение терминалов", "ночное задание", "оператор руками"];
  const copies = [
    ["свой SQL: 3 шага", "+ проверка «не минус»", true],
    ["свой SQL: 3 шага", "про проверку не знает", false],
    ["свой SQL: 3 шага", "про проверку не знает", false],
  ];

  const leftRows = callers.map((c, i) => {
    const top = 88 + i * 44;
    const cy = top + 15;
    const [head, note, fresh] = copies[i];
    return `<rect class="who" x="26" y="${top}" width="132" height="30" rx="8"/>
<text class="cap" x="92" y="${cy + 4}" font-size="9.5" text-anchor="middle">${c}</text>
<line class="flow" x1="160" y1="${cy}" x2="172" y2="${cy}" marker-end="url(#${S}-arrow)"/>
<rect class="${fresh ? "copyhot" : "copyold"}" x="176" y="${top}" width="144" height="30" rx="8"/>
<text class="mono" x="248" y="${cy - 1}" font-size="9" text-anchor="middle">${head}</text>
<text class="cap ${fresh ? "t-ok" : "t-bad"}" x="248" y="${cy + 11}" font-size="8.5" text-anchor="middle">${note}</text>
<line class="flow" x1="322" y1="${cy}" x2="334" y2="${cy}"/>`;
  }).join("\n");

  const rightRows = callers.map((c, i) => {
    const top = 88 + i * 44;
    const cy = top + 15;
    return `<rect class="who" x="374" y="${top}" width="132" height="30" rx="8"/>
<text class="cap" x="440" y="${cy + 4}" font-size="9.5" text-anchor="middle">${c}</text>
<path class="hotflow" d="M508,${cy} C520,${cy} 518,147 530,147" marker-end="url(#${S}-arrow-accent)"/>`;
  }).join("\n");

  return svgWrap("0 0 700 412", S, "Копия должна быть одна, и лежать в базе", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .who { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .copyhot { fill: var(--paper); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .copyold { fill: var(--paper); stroke: var(--bad); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .proc { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .tbl { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .flow { fill: none; stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .hotflow { fill: none; stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Расходятся не люди, а копии. Значит копия должна быть одна — и лежать там, где её видно всем</text>
<line class="split" x1="350" y1="44" x2="350" y2="332"/>

<text class="cap" x="26" y="62" font-size="11.5" font-weight="600">было — у каждого своя копия кода</text>
<text class="cap" x="26" y="78" font-size="9.5">кто запускает</text>
<text class="cap" x="176" y="78" font-size="9.5">что именно у него написано</text>
${leftRows}
<line class="flow" x1="334" y1="103" x2="334" y2="251"/>
<line class="flow" x1="334" y1="251" x2="268" y2="251" marker-end="url(#${S}-arrow)"/>
<rect class="tbl" x="128" y="236" width="134" height="30" rx="8"/>
<text class="mono" x="195" y="256" font-size="10.5" text-anchor="middle">dbo.stock</text>
<text class="cap" x="26" y="288" font-size="10.5">Правку про «не принимать минус» внесли</text>
<text class="cap" x="26" y="304" font-size="10.5">в одну копию из трёх — <tspan class="t-bad">а минус в остатках</tspan></text>
<text class="cap t-bad" x="26" y="320" font-size="10.5">нашли только через месяц.</text>

<text class="cap" x="374" y="62" font-size="11.5" font-weight="600">стало — копия одна, и лежит она в базе</text>
<text class="cap" x="374" y="78" font-size="9.5">кто запускает</text>
<text class="cap t-accent" x="530" y="78" font-size="9.5">CALL</text>
${rightRows}
<rect class="proc" x="530" y="88" width="144" height="118" rx="9"/>
<text class="mono" x="602" y="112" font-size="10" text-anchor="middle">dbo.receive(…)</text>
<text class="cap" x="602" y="136" font-size="9.5" text-anchor="middle">объект схемы dbo,</text>
<text class="cap" x="602" y="152" font-size="9.5" text-anchor="middle">запись в каталоге базы</text>
<text class="cap" x="602" y="174" font-size="9.5" text-anchor="middle">своё право EXECUTE:</text>
<text class="cap" x="602" y="190" font-size="9.5" text-anchor="middle">звать можно, таблицу — нет</text>
<line class="hotflow" x1="602" y1="208" x2="602" y2="232" marker-end="url(#${S}-arrow-accent)"/>
<rect class="tbl" x="535" y="236" width="134" height="30" rx="8"/>
<text class="mono" x="602" y="256" font-size="10.5" text-anchor="middle">dbo.stock</text>
<text class="cap" x="374" y="288" font-size="10.5">Поменял тело — поменялось сразу у всех троих,</text>
<text class="cap" x="374" y="304" font-size="10.5">и ни одно приложение пересобирать не надо.</text>

<line x1="26" y1="346" x2="674" y2="346" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="368" font-size="11">CREATE PROCEDURE кладёт код в каталог базы — туда же, где лежат таблицы. Это не отправленный и забытый текст.</text>
<text class="cap" x="26" y="388" font-size="11">Отсюда всё остальное: данные не ездят к коду по сети, у кода свои права, и его видно в системном каталоге.</text>
`);
}

// Один вызов процедуры, разрезанный COMMIT-ом на две транзакции. Схема нужна
// ради строки таблицы «распоряжается транзакцией: да» — и ради того, чтобы
// стало видно, что первый шаг пережил ROLLBACK, а второй нет.
function buildProcCommiclient_clit() {
  const S = "proc-commit-split";

  const band = (x, w, num, lot, was, became, note, kind) => `
<rect class="${kind === "ok" ? "txnok" : "txnbad"}" x="${x}" y="96" width="${w}" height="98" rx="10"/>
<text class="cap ${kind === "ok" ? "t-ok" : "t-bad"}" x="${x + 12}" y="116" font-size="10.5" font-weight="600">транзакция ${num}</text>
<rect class="stepbox" x="${x + 12}" y="126" width="${w - 24}" height="30" rx="7"/>
<text class="mono" x="${x + w / 2}" y="146" font-size="9.5" text-anchor="middle">UPDATE dbo.stock … WHERE lot = '${lot}'</text>
<text class="cap" x="${x + w / 2}" y="176" font-size="10" text-anchor="middle">qtyallocated: ${was} → ${became}${note}</text>`;

  return svgWrap("0 0 700 396", S, "Процедура распоряжается транзакцией, функция — нет", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .procbox { fill: none; stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .txnok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .txnbad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .stepbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .cut { stroke: var(--ink-soft); stroke-width: 2.4; stroke-linecap: round; }
.dg-${S} .fnbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; stroke-dasharray: 5 4; }
.dg-${S} .flow { fill: none; stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Внутри одного вызова процедура успела побывать в двух разных транзакциях</text>

<rect class="procbox" x="26" y="52" width="648" height="158" rx="12"/>
<text class="mono t-accent" x="40" y="72" font-size="10.5">CALL dbo.two_steps();</text>
<text class="cap" x="188" y="72" font-size="10">одно тело процедуры, четыре команды подряд</text>

${band(44, 268, 1, "L0001", "12", "17", "", "ok")}
<line class="cut" x1="336" y1="96" x2="336" y2="194"/>
<text class="mono" x="336" y="90" font-size="11" font-weight="700" text-anchor="middle">COMMIT</text>
${band(360, 268, 2, "L0002", "0", "5", "", "bad")}
<line class="cut" x1="652" y1="96" x2="652" y2="194"/>
<text class="mono" x="640" y="90" font-size="11" font-weight="700" text-anchor="end">ROLLBACK</text>

${checkIcon(46, 224, 15)}
<text class="cap" x="70" y="236" font-size="10.5">L0001 = <tspan class="t-ok" font-weight="700">17.000</tspan> — зафиксировано, ROLLBACK до него уже не дотянулся</text>
${crossIcon(46, 252, 15)}
<text class="cap" x="70" y="264" font-size="10.5">L0002 = <tspan class="t-bad" font-weight="700">0.000</tspan> — откатилось начисто, будто второго UPDATE и не было</text>

<rect class="fnbox" x="26" y="284" width="648" height="34" rx="9"/>
<text class="cap" x="40" y="305" font-size="10.5">А функция не коммитит никогда: она живёт внутри той транзакции, что её позвала — <tspan class="mono t-bad">invalid transaction termination</tspan></text>

<line x1="26" y1="336" x2="674" y2="336" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="358" font-size="11">Ради этой строки процедуры и завели: зафиксировать сделанное и продолжить работу уже в новой транзакции.</text>
<text class="cap" x="26" y="378" font-size="11">Но коммитить она умеет только тогда, когда её позвали не изнутри транзакции: обернул CALL в BEGIN — упадёт.</text>
`);
}

/* ---------------------------------------------------------------- d9.04 */

// Три категории изменчивости и три разных плана у одного и того же запроса.
// Схема существует ради того, чтобы стало видно: слово в заголовке функции —
// это обещание планировщику, и от него зависит, будет ли индекс.
function buildFnVolatility() {
  const S = "fn-volatility";
  // слово, тон, обещание автора (две строки), фрагмент плана, что это значит
  const rows = [
    ["IMMUTABLE", "ok",
      ["на одних аргументах всегда один ответ,", "к базе не обращаюсь вовсе"],
      "Index Cond: (skuid = 'sku-777'::text)",
      "функции в плане нет вовсе: на её месте готовая константа"],
    ["STABLE", "accent",
      ["внутри одного запроса ответ не меняется,", "базу только читаю"],
      "Index Cond: (skuid = dbo.fn_code(777))",
      "посчитал один раз и спустился по индексу"],
    ["VOLATILE", "bad",
      ["ответ может быть каждый раз новым", "— и это значение по умолчанию"],
      "Seq Scan  ·  Filter: (skuid = dbo.fn_code(777))",
      "прочитал все 20 000 строк, вызвав функцию на каждой"],
  ];

  const body = rows.map(([word, tone, promise, plan, what], i) => {
    const top = 104 + i * 64;
    const cy = top + 22;
    return `<rect class="pill p-${tone}" x="26" y="${top + 6}" width="104" height="32" rx="8"/>
<text class="mono t-${tone}" x="78" y="${top + 27}" font-size="10.5" font-weight="700" text-anchor="middle">${word}</text>
<text class="cap" x="142" y="${top + 18}" font-size="9.5">${promise[0]}</text>
<text class="cap" x="142" y="${top + 33}" font-size="9.5">${promise[1]}</text>
<line class="flow" x1="352" y1="${cy}" x2="370" y2="${cy}" marker-end="url(#${S}-arrow)"/>
<rect class="planbox b-${tone}" x="374" y="${top}" width="300" height="46" rx="8"/>
<text class="mono" x="386" y="${top + 20}" font-size="9" >${plan}</text>
<text class="cap t-${tone}" x="386" y="${top + 36}" font-size="9">${what}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 422", S, "Одно слово в заголовке функции — и план другой", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .qbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .pill { stroke-width: 1.5; }
.dg-${S} .p-ok { fill: var(--ok-soft); stroke: var(--ok); }
.dg-${S} .p-accent { fill: var(--accent-soft); stroke: var(--accent); }
.dg-${S} .p-bad { fill: var(--bad-soft); stroke: var(--bad); }
.dg-${S} .planbox { fill: var(--paper); stroke-width: 1.3; }
.dg-${S} .b-ok { stroke: var(--ok); }
.dg-${S} .b-accent { stroke: var(--accent); }
.dg-${S} .b-bad { stroke: var(--bad); }
.dg-${S} .warn { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Каждое слово — обещание автора планировщику. Тело функции одинаково до символа, а планы разные</text>
<rect class="qbox" x="26" y="40" width="648" height="30" rx="8"/>
<text class="mono" x="38" y="60" font-size="9.5">EXPLAIN SELECT descr FROM dbo.sku_draft WHERE skuid = dbo.fn_code(777);</text>
<text class="cap" x="540" y="60" font-size="9">20 000 строк, PRIMARY KEY</text>
<text class="cap" x="26" y="92" font-size="9.5">слово в заголовке</text>
<text class="cap" x="142" y="92" font-size="9.5">что автор обещает</text>
<text class="cap" x="374" y="92" font-size="9.5">что осталось в плане</text>
${body}

<rect class="warn" x="26" y="304" width="648" height="44" rx="9"/>
<text class="cap" x="40" y="324" font-size="10.5">Индекс по функции разрешён только <tspan class="mono t-gold">IMMUTABLE</tspan>. Со <tspan class="mono">STABLE</tspan> сервер отвечает прямым текстом, SQLSTATE 42P17:</text>
<text class="mono t-gold" x="40" y="340" font-size="10">functions in index expression must be marked IMMUTABLE</text>

<line x1="26" y1="364" x2="674" y2="364" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="386" font-size="11">Сервер тело не читает и обещание не проверяет — он верит на слово. Соврал про категорию — получил неверный ответ.</text>
<text class="cap" x="26" y="406" font-size="11">Правило без исключений: функция, которая читает таблицы, — максимум STABLE. IMMUTABLE — только чистая арифметика.</text>
`);
}

// Одна и та же логика на двух языках: тело на LANGUAGE sql встраивается в
// запрос и исчезает из плана, тело на plpgsql остаётся чёрным ящиком и зовётся
// по разу на строку. Схема существует ради правила «функцию, которую зовут по
// строкам, пиши на чистом SQL».
function buildFnInline() {
  const S = "fn-inline";

  const lane = (y0, lang, tone, stage, planTxt, cost, costTone) => `
<rect class="pill p-${tone}" x="26" y="${y0 + 8}" width="152" height="32" rx="8"/>
<text class="mono t-${tone}" x="102" y="${y0 + 29}" font-size="10" font-weight="700" text-anchor="middle">${lang}</text>
<line class="flow" x1="182" y1="${y0 + 24}" x2="200" y2="${y0 + 24}" marker-end="url(#${S}-arrow)"/>
<rect class="stagebox" x="204" y="${y0}" width="164" height="48" rx="8"/>
<text class="cap" x="286" y="${y0 + 20}" font-size="9.5" text-anchor="middle">${stage[0]}</text>
<text class="cap" x="286" y="${y0 + 35}" font-size="9.5" text-anchor="middle">${stage[1]}</text>
<line class="flow" x1="372" y1="${y0 + 24}" x2="390" y2="${y0 + 24}" marker-end="url(#${S}-arrow)"/>
<rect class="planbox b-${tone}" x="394" y="${y0}" width="280" height="48" rx="8"/>
<text class="cap" x="406" y="${y0 + 16}" font-size="8.5">строка Filter в плане:</text>
<text class="mono" x="406" y="${y0 + 31}" font-size="9">${planTxt}</text>
<text class="cap t-${costTone}" x="406" y="${y0 + 43}" font-size="9">${cost}</text>`;

  return svgWrap("0 0 700 366", S, "Тело на чистом SQL встраивается в запрос", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .qbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .pill { stroke-width: 1.5; }
.dg-${S} .p-ok { fill: var(--ok-soft); stroke: var(--ok); }
.dg-${S} .p-bad { fill: var(--bad-soft); stroke: var(--bad); }
.dg-${S} .stagebox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .planbox { fill: var(--paper); stroke-width: 1.3; }
.dg-${S} .b-ok { stroke: var(--ok); }
.dg-${S} .b-bad { stroke: var(--bad); }
.dg-${S} .countbox { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Тело одинаковое до символа, категория одинаковая. Разницу делает только слово после LANGUAGE</text>
<rect class="qbox" x="26" y="40" width="648" height="30" rx="8"/>
<text class="mono" x="38" y="60" font-size="9.5">SELECT skuid, loc FROM dbo.stock WHERE dbo.fn_free(qty, qtyallocated) &gt; 50;</text>

${lane(88, "LANGUAGE sql", "ok",
    ["тело подставлено", "на место вызова"],
    "((qty - qtyallocated) &gt; '50'::numeric)",
    "функции в плане нет — вызовов ноль", "ok")}

${lane(158, "LANGUAGE plpgsql", "bad",
    ["чёрный ящик: внутрь", "планировщик не видит"],
    "(dbo.fn_free_plpg(qty, …) &gt; '50'::numeric)",
    "честный вызов на каждую строку таблицы", "bad")}

<rect class="countbox" x="26" y="228" width="648" height="38" rx="9"/>
<text class="cap" x="40" y="244" font-size="10.5">Отдельный опыт со счётчиком, функция и в WHERE, и в SELECT: <tspan class="t-bad" font-weight="700">13 строк в dbo.stock — 16 вызовов.</tspan></text>
<text class="cap" x="40" y="259" font-size="10.5">Тринадцать в WHERE, по одному на строку, плюс три в SELECT для тех, кто фильтр прошёл: это разные вычисления.</text>

<line x1="26" y1="284" x2="674" y2="284" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="306" font-size="11">Функцию, которую зовут по строкам, пиши на чистом SQL: LANGUAGE sql и тело из одного SELECT — этого хватает.</text>
<text class="cap" x="26" y="326" font-size="11">Табличной функции пиши категорию руками: по умолчанию она VOLATILE, а VOLATILE встраивание запрещает.</text>
<text class="cap" x="26" y="346" font-size="11">И помни, чего встраивание не лечит: вычисление, надетое на колонку в WHERE, всё равно лишает сервер индекса.</text>
`);
}

/* ---------------------------------------------------------------- d9.05 */

// Один и тот же триггер по обе стороны от момента записи строки. Схема
// существует ради того, чтобы стало видно: BEFORE держит ещё не записанную
// строку и может её подменить, а после записи ехать правке уже некуда.
function buildTriggerBeforeAfter() {
  const S = "trigger-before-after";

  return svgWrap("0 0 700 380", S, "BEFORE успевает поправить строку, AFTER уже поздно", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .qbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .badgeok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .badgebad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.5; }
.dg-${S} .tg { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .resok { fill: var(--paper); stroke: var(--ok); stroke-width: 1.5; }
.dg-${S} .resbad { fill: var(--paper); stroke: var(--bad); stroke-width: 1.5; }
.dg-${S} .disk { stroke: var(--ink-soft); stroke-width: 2.6; stroke-linecap: round; }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .mutewire { stroke: var(--line-soft); stroke-width: 1.2; stroke-dasharray: 3 4; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Функция та же, таблица та же, данные те же. Меняется одно слово — и вместе с ним сторона от записи</text>
<rect class="qbox" x="26" y="40" width="648" height="32" rx="8"/>
<text class="mono" x="38" y="60" font-size="10">UPDATE dbo.stock_draft SET qty = qty - 100;</text>
<text class="cap" x="330" y="60" font-size="9.5">было qty = 48.000, посчиталось −52.000</text>

<line class="disk" x1="330" y1="96" x2="330" y2="272"/>
<text class="cap" x="330" y="90" font-size="10" font-weight="600" text-anchor="middle">момент записи строки</text>

<rect class="badgeok" x="26" y="108" width="128" height="30" rx="8"/>
<text class="mono t-ok" x="90" y="128" font-size="10.5" font-weight="700" text-anchor="middle">BEFORE UPDATE</text>
<text class="cap" x="26" y="154" font-size="9.5">строка ещё в руках</text>
<line class="flow" x1="158" y1="123" x2="172" y2="123" marker-end="url(#${S}-arrow)"/>
<rect class="tg" x="176" y="98" width="146" height="70" rx="8"/>
<text class="cap" x="249" y="116" font-size="9" text-anchor="middle">NEW.qty = −52.000</text>
<text class="mono" x="249" y="133" font-size="8.5" text-anchor="middle">IF NEW.qty &lt; 0 THEN</text>
<text class="mono" x="249" y="146" font-size="8.5" text-anchor="middle">NEW.qty := 0; RETURN NEW;</text>
<text class="cap t-ok" x="249" y="161" font-size="8.5" text-anchor="middle">подменил ещё не записанное</text>
<line class="flow" x1="336" y1="131" x2="352" y2="131" marker-end="url(#${S}-arrow)"/>
<rect class="resok" x="356" y="110" width="150" height="44" rx="8"/>
<text class="cap" x="431" y="128" font-size="9" text-anchor="middle">в таблице осталось</text>
<text class="mono t-ok" x="431" y="145" font-size="11" font-weight="700" text-anchor="middle">qty = 0.000</text>
${checkIcon(516, 124, 15)}
<text class="cap" x="538" y="128" font-size="9.5">записано то, что</text>
<text class="cap" x="538" y="142" font-size="9.5">подставил триггер</text>

<rect class="badgebad" x="26" y="196" width="128" height="30" rx="8"/>
<text class="mono t-bad" x="90" y="216" font-size="10.5" font-weight="700" text-anchor="middle">AFTER UPDATE</text>
<text class="cap" x="26" y="242" font-size="9.5">строка уже на диске</text>
<line class="mutewire" x1="158" y1="211" x2="326" y2="211"/>
<text class="cap" x="242" y="204" font-size="9" text-anchor="middle">до записи не происходит ничего</text>
<line class="flow" x1="336" y1="211" x2="352" y2="211" marker-end="url(#${S}-arrow)"/>
<rect class="tg" x="356" y="178" width="150" height="70" rx="8"/>
<text class="cap" x="431" y="196" font-size="9" text-anchor="middle">на диске уже −52.000</text>
<text class="mono" x="431" y="213" font-size="8.5" text-anchor="middle">NEW.qty := 0; RETURN NEW;</text>
<text class="cap t-bad" x="431" y="228" font-size="8.5" text-anchor="middle">выполнилось, но ехать</text>
<text class="cap t-bad" x="431" y="240" font-size="8.5" text-anchor="middle">этой правке уже некуда</text>
<line class="flow" x1="510" y1="211" x2="524" y2="211" marker-end="url(#${S}-arrow)"/>
<rect class="resbad" x="528" y="190" width="146" height="44" rx="8"/>
<text class="cap" x="601" y="208" font-size="9" text-anchor="middle">в таблице осталось</text>
<text class="mono t-bad" x="601" y="225" font-size="11" font-weight="700" text-anchor="middle">qty = −52.000</text>
${crossIcon(534, 244, 13)}
<text class="cap t-bad" x="554" y="255" font-size="9.5">минус на складе</text>

<line x1="26" y1="292" x2="674" y2="292" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="314" font-size="11">BEFORE — когда надо подправить значение или отбить недопустимую правку. AFTER — среагировать на случившееся.</text>
<text class="cap" x="26" y="334" font-size="11">Возвращаемое значение AFTER-триггера база просто выбрасывает: присваивание отработало, а строка уже записана.</text>
<text class="cap" x="26" y="354" font-size="11">Третий вид, INSTEAD OF, ставится только на представление и подменяет собой операцию целиком.</text>
`);
}

// Одна команда, задевшая три строки, по обе стороны диалектного водораздела.
// Схема существует ради того, чтобы привычка «триггер видит набор» не поехала
// в PostgreSQL, а привычка «триггер видит строку» — в SQL Server.
function buildTriggerRowVsStatement() {
  const S = "trigger-row-vs-statement";
  const skus = ["MILK-1L", "KEFIR-05", "BREAD-DARK"];

  const pgCalls = skus.map((sku, i) => {
    const top = 148 + i * 42;
    const cy = top + 16;
    return `<line class="hotflow" x1="40" y1="${cy}" x2="60" y2="${cy}" marker-end="url(#${S}-arrow-accent)"/>
<rect class="call" x="64" y="${top}" width="272" height="32" rx="8"/>
<text class="cap" x="74" y="${cy + 4}" font-size="9.5">вызов ${i + 1}</text>
<text class="mono" x="126" y="${cy + 4}" font-size="9.5">NEW = одна строка, ${sku}</text>`;
  }).join("\n");

  const setRow = (x, y, label, cls) =>
    `<rect class="${cls}" x="${x}" y="${y}" width="118" height="18" rx="5"/>
<text class="mono" x="${x + 8}" y="${y + 13}" font-size="8.5">${label}</text>`;

  return svgWrap("0 0 700 420", S, "Построчный триггер против триггера на команду", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .qbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .call { fill: var(--paper); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .once { fill: var(--paper); stroke: var(--gold); stroke-width: 1.5; }
.dg-${S} .setrowa { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1; }
.dg-${S} .setrowb { fill: var(--sunk); stroke: var(--line); stroke-width: 1; }
.dg-${S} .mine { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 4 3; }
.dg-${S} .hotflow { fill: none; stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--muted); stroke-width: 1.3; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Одна команда задела три строки. Дальше диалекты расходятся не в написании, а в устройстве</text>
<rect class="qbox" x="26" y="40" width="648" height="30" rx="8"/>
<text class="mono" x="38" y="60" font-size="10">UPDATE dbo.stock_draft SET qty = qty + 1;</text>
<text class="cap" x="330" y="60" font-size="9.5">задето 3 строки</text>
<line class="split" x1="350" y1="82" x2="350" y2="290"/>

<text class="cap t-accent" x="26" y="100" font-size="11.5" font-weight="600">PostgreSQL, FOR EACH ROW</text>
<text class="cap" x="26" y="116" font-size="9.5">функция сработает столько раз, сколько строк</text>
<line class="hotflow" x1="40" y1="126" x2="40" y2="248"/>
${pgCalls}
<text class="cap" x="26" y="288" font-size="9.5">NEW и OLD — это одна строка, всегда одна.</text>

<text class="cap t-gold" x="374" y="100" font-size="11.5" font-weight="600">SQL Server, всегда на команду</text>
<text class="cap" x="374" y="116" font-size="9.5">выбора нет: построчного режима не существует</text>
<line class="flow" x1="524" y1="128" x2="524" y2="148" marker-end="url(#${S}-arrow)"/>
<rect class="once" x="374" y="152" width="300" height="120" rx="9"/>
<text class="cap" x="524" y="170" font-size="10" font-weight="600" text-anchor="middle">одно-единственное срабатывание</text>
<text class="mono t-accent" x="390" y="190" font-size="9">inserted</text>
<text class="mono" x="546" y="190" font-size="9">deleted</text>
${setRow(384, 196, "MILK-1L    43.0", "setrowa")}
${setRow(384, 218, "KEFIR-05   41.0", "setrowa")}
${setRow(384, 240, "BREAD-DARK 31.0", "setrowa")}
${setRow(540, 196, "MILK-1L    42.0", "setrowb")}
${setRow(540, 218, "KEFIR-05   40.0", "setrowb")}
${setRow(540, 240, "BREAD-DARK 30.0", "setrowb")}
<text class="cap" x="374" y="288" font-size="9.5">Две псевдотаблицы: как стало и как было.</text>

<rect class="mine" x="26" y="302" width="648" height="42" rx="9"/>
<text class="cap" x="40" y="320" font-size="10.5">Мина при переносе привычки: <tspan class="mono t-bad">SELECT @qty = qty FROM inserted;</tspan> берёт одну ПРОИЗВОЛЬНУЮ строку набора.</text>
<text class="cap" x="40" y="336" font-size="10.5">Ошибки нет, триггер отработает — и при многострочной вставке проверку молча пройдёт брак.</text>

<line x1="26" y1="362" x2="674" y2="362" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="384" font-size="11">В SQL Server UPDATE на 500 строк дёрнет триггер один раз, и в inserted будет 500 строк. Не задевший ни одной — тоже дёрнет.</text>
<text class="cap" x="26" y="404" font-size="11">В PostgreSQL зерно пишут словами, и умолчание тут коварное: строку про зерно опустил — получил FOR EACH STATEMENT.</text>
`);
}

/* ---------------------------------------------------------------- d9.06 */

// Пять шагов курсора и бегунок, ползущий по результату. Схема существует ради
// того, чтобы стало видно, где именно выполняется запрос (на OPEN, а не на
// DECLARE) и почему FOUND проверяют сразу после FETCH.
function buildCursorLifecycle() {
  const S = "cursor-lifecycle";
  const steps = [
    ["DECLARE cur CURSOR FOR …", "имя привязали к запросу; сам запрос ещё не выполнялся"],
    ["OPEN cur", "теперь запрос выполнился, бегунок встал перед первой"],
    ["FETCH cur INTO rec", "забрать строку в rec и сдвинуть бегунок на шаг"],
    ["EXIT WHEN NOT FOUND", "FOUND = false значит строки кончились"],
    ["CLOSE cur", "отпустить результат и освободить занятое под него"],
  ];
  // Третий и четвёртый шаги отодвинуты: вокруг них рисуется рамка цикла,
  // и ей нужны поля, иначе пунктир ложится на подписи соседних шагов.
  const tops = [100, 148, 208, 256, 322];

  const left = steps.map(([code, what], i) => {
    const top = tops[i];
    return `<rect class="stepbox" x="26" y="${top}" width="212" height="26" rx="7"/>
<text class="mono" x="36" y="${top + 18}" font-size="9.5">${code}</text>
<text class="cap" x="26" y="${top + 40}" font-size="9.5">${what}</text>`;
  }).join("\n");

  const data = [
    ["A-01-01", "L0001", "36.000"],
    ["A-01-01", "L0002", "60.000"],
    ["B-01-01", "L0013", "120.000"],
  ];
  const rows = data.map(([loc, lot, free], i) => {
    const top = 116 + i * 30;
    const cy = top + 13;
    return `<rect class="row" x="400" y="${top}" width="234" height="26" rx="6"/>
<text class="mono" x="410" y="${cy + 4}" font-size="9.5">${loc}  ${lot}  своб. ${free}</text>
<text class="cap" x="376" y="${cy + 4}" font-size="8.5" text-anchor="end">FETCH ${i + 1}</text>
<path class="runner" d="M380,${cy - 5} L392,${cy} L380,${cy + 5} Z"/>
${checkIcon(642, cy - 7, 13)}`;
  }).join("\n");

  return svgWrap("0 0 700 444", S, "Пять шагов курсора и бегунок по результату", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .stepbox { fill: var(--paper); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .endbox { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dg-${S} .loop { fill: none; stroke: var(--accent); stroke-width: 1.2; stroke-dasharray: 5 4; }
.dg-${S} .samebox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .runner { fill: var(--accent); }
.dg-${S} .flow { stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Курсор — именованный бегунок по результату запроса: он отдаёт строки по одной и помнит, где встал</text>
<text class="cap" x="26" y="78" font-size="10.5" font-weight="600">пять шагов, три из них — чистая бухгалтерия</text>
<text class="cap" x="400" y="78" font-size="10.5" font-weight="600">результат запроса и где стоит бегунок</text>

<rect class="loop" x="18" y="198" width="300" height="110" rx="10"/>
<text class="cap t-accent" x="306" y="296" font-size="9" text-anchor="end">LOOP … END LOOP</text>
${left}
${rows}

<rect class="endbox" x="400" y="212" width="234" height="30" rx="7"/>
<text class="cap t-bad" x="517" y="231" font-size="9" text-anchor="middle">строк больше нет — FOUND = false, выходим</text>
<text class="cap" x="376" y="231" font-size="8.5" text-anchor="end">FETCH 4</text>
<path class="runner" d="M380,226 L392,231 L380,236 Z"/>

<rect class="samebox" x="400" y="262" width="274" height="76" rx="9"/>
<text class="cap" x="412" y="282" font-size="9.5" font-weight="600">FOR rec IN SELECT … LOOP — тот же курсор</text>
<text class="cap" x="412" y="302" font-size="9.5">Слова CURSOR в тексте нет, а построчный обход</text>
<text class="cap" x="412" y="317" font-size="9.5">есть: движок сам объявил, сам открыл, сам зовёт</text>
<text class="cap" x="412" y="332" font-size="9.5">FETCH на каждом витке и сам закроет на выходе.</text>

<line x1="26" y1="382" x2="674" y2="382" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="404" font-size="11">Запрос выполняется не на DECLARE, а на OPEN: там сервер решает, какие строки попадут в результат.</text>
<text class="cap" x="26" y="424" font-size="11">FOUND проверяют сразу после FETCH и до того, как трогать rec: иначе последний виток пойдёт по старым данным.</text>
`);
}

/* ---------------------------------------------------------------- d9.07 */

// Четыре шага динамического запроса: строка собралась, EXECUTE отдал её
// серверу, сервер разобрал текст с нуля, результат лёг в переменную. Схема
// существует ради границы: пока это строка — это данные, после EXECUTE — код.
function buildDynStringToPlan() {
  const S = "dyn-string-to-plan";
  const stages = [
    ["1", "format('SELECT count(*) FROM dbo.%I', tbl)",
      "собрал обычную текстовую строку: на месте %I оказалось содержимое tbl",
      "это данные, как 'Молоко 1л'"],
    ["2", "EXECUTE  →  'SELECT count(*) FROM dbo.stock'",
      "отдал строку серверу: вот тебе новый запрос, разбери его и выполни",
      "здесь текст становится кодом"],
    ["3", "разбор с нуля → план → выполнение",
      "сервер нашёл имя таблицы, проверил, что она есть, построил план",
      "это уже код"],
    ["4", "INTO n",
      "результат лёг в переменную: n = 13, ровно столько строк в dbo.stock",
      ""],
  ];

  const body = stages.map(([num, code, what, tag], i) => {
    const top = 96 + i * 56;
    const hot = i === 1;
    return `<rect class="${hot ? "stagehot" : "stagebox"}" x="52" y="${top}" width="622" height="46" rx="9"/>
<circle class="num" cx="36" cy="${top + 23}" r="12"/>
<text class="cap t-accent" x="36" y="${top + 27}" font-size="11" font-weight="700" text-anchor="middle">${num}</text>
<text class="${i === 2 ? "" : "mono"}" x="66" y="${top + 20}" font-size="${i === 2 ? 10.5 : 9.5}" ${i === 2 ? 'font-weight="600"' : ""}>${code}</text>
<text class="cap" x="66" y="${top + 36}" font-size="9.5">${what}</text>
${tag ? `<text class="cap ${hot ? "t-gold" : "t-accent"}" x="662" y="${top + 20}" font-size="8.5" text-anchor="end">${tag}</text>` : ""}
${i < stages.length - 1 ? `<line class="flow" x1="36" y1="${top + 36}" x2="36" y2="${top + 52}" marker-end="url(#${S}-arrow)"/>` : ""}`;
  }).join("\n");

  return svgWrap("0 0 700 396", S, "Как строка становится запросом", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .qbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .stagebox { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .stagehot { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.5; }
.dg-${S} .num { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--muted); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Имя таблицы после FROM подставить нельзя. Значит запрос надо собрать текстом — и текст этот собираешь ты</text>
<rect class="qbox" x="26" y="40" width="648" height="30" rx="8"/>
<text class="mono" x="38" y="60" font-size="9.5">tbl text := 'stock';</text>
<text class="cap" x="176" y="60" font-size="9">имя таблицы стало данными: поменяй на 'orders' — та же команда посчитает шесть заказов</text>
${body}

<line x1="26" y1="336" x2="674" y2="336" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="358" font-size="11">В статическом запросе твой код — это запрос. В динамическом твой код — программа, которая пишет запрос.</text>
<text class="cap" x="26" y="378" font-size="11">Отсюда и вся сила темы, и все её беды: то, что было строкой, после EXECUTE разбирается как язык.</text>
`);
}

/* ---------------------------------------------------------------- d9.08 */

// Одна и та же введённая строка по обе стороны от границы «данные / код».
// Схема существует ради мысли, что уязвимость не в сервере, а в способе,
// которым собрали строку: склейка стирает границу, параметр её держит.
function buildInjGranica() {
  const S = "inj-granica";
  const APO = "&#39;";

  return svgWrap("0 0 700 446", S, "Граница между данными и кодом", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-bad" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--bad)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .inbox { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .srcbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .badbox { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .okbox { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .valbox { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .border { stroke: var(--ink-soft); stroke-width: 2; stroke-dasharray: 6 5; }
.dg-${S} .flow { stroke: var(--muted); stroke-width: 1.3; }
.dg-${S} .badflow { stroke: var(--bad); stroke-width: 1.6; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Слева — данные: фамилия, количество, дата. Справа — код: кавычки, ключевые слова, точки с запятой</text>
<rect class="inbox" x="26" y="40" width="286" height="30" rx="8"/>
<text class="cap" x="38" y="60" font-size="9.5">в поле поиска набрали:</text>
<text class="mono t-bad" x="172" y="60" font-size="10.5" font-weight="700">${APO} OR ${APO}1${APO}=${APO}1</text>
<text class="cap" x="330" y="60" font-size="9.5">одна и та же строка, два способа её принять</text>

<line class="border" x1="336" y1="86" x2="336" y2="192"/>
<line class="border" x1="336" y1="214" x2="336" y2="326"/>
<text class="cap" x="336" y="80" font-size="9.5" font-weight="600" text-anchor="middle">граница</text>
<text class="cap" x="326" y="100" font-size="9" text-anchor="end">данные</text>
<text class="cap" x="346" y="100" font-size="9">код: то, что сервер обязан исполнить</text>

<text class="cap t-bad" x="26" y="124" font-size="11" font-weight="600">склейка через || — границы больше нет</text>
<rect class="srcbox" x="26" y="134" width="286" height="46" rx="8"/>
<text class="mono" x="36" y="153" font-size="8.5">q := ${APO}… WHERE surname = ${APO}${APO}${APO}</text>
<text class="mono" x="36" y="170" font-size="8.5">     || p_surname || ${APO}${APO}${APO}${APO};</text>
<line class="badflow" x1="316" y1="157" x2="352" y2="157" marker-end="url(#${S}-arrow-bad)"/>
<rect class="badbox" x="356" y="128" width="318" height="58" rx="8"/>
<text class="cap" x="366" y="146" font-size="8.5">ушло на разбор одной плоской строкой:</text>
<text class="mono" x="366" y="163" font-size="8.5">SELECT * FROM dbo.worker_draft</text>
<text class="mono" x="366" y="178" font-size="8.5">WHERE surname = <tspan class="t-bad" font-weight="700">${APO}${APO} OR ${APO}1${APO}=${APO}1${APO}</tspan></text>
${crossIcon(36, 196, 13)}
<text class="cap t-bad" x="56" y="207" font-size="10">Ввод стал куском языка: приехали все четыре сотрудника, фильтра больше нет.</text>

<text class="cap t-ok" x="26" y="248" font-size="11" font-weight="600">параметр — граница держится</text>
<rect class="srcbox" x="26" y="258" width="286" height="30" rx="8"/>
<text class="mono" x="36" y="277" font-size="8.5">EXECUTE ${APO}… WHERE surname = $1${APO}</text>
<rect class="valbox" x="26" y="294" width="286" height="30" rx="8"/>
<text class="mono" x="36" y="313" font-size="8.5">  USING p_surname</text>
<text class="cap t-gold" x="302" y="313" font-size="8.5" text-anchor="end">едет отдельно</text>
<line class="flow" x1="316" y1="273" x2="352" y2="273" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="316" y1="309" x2="352" y2="296" marker-end="url(#${S}-arrow)"/>
<rect class="okbox" x="356" y="248" width="318" height="68" rx="8"/>
<text class="cap" x="366" y="266" font-size="8.5">сервер разобрал шаблон до того, как значение оказалось рядом:</text>
<text class="mono" x="366" y="283" font-size="8.5">WHERE surname = $1</text>
<text class="cap" x="366" y="299" font-size="8.5">потом подставил значение в готовый план — как значение,</text>
<text class="cap" x="366" y="311" font-size="8.5">а не как текст запроса</text>
${checkIcon(36, 332, 13)}
<text class="cap t-ok" x="56" y="343" font-size="10">Ищется сотрудник с такой фамилией. Такого нет — строк ноль, и это правильный ответ.</text>

<line x1="26" y1="368" x2="674" y2="368" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="390" font-size="11">Пользователь ввёл значение, а сервер прочитал команду: к моменту разбора это уже одна плоская строка,</text>
<text class="cap" x="26" y="410" font-size="11">и парсер не знает, какие символы пришли от автора запроса, а какие приехали из поля ввода.</text>
<text class="cap" x="26" y="430" font-size="11">Уязвимость не в PostgreSQL и не в SQL Server. Она в способе, которым собрали строку.</text>
`);
}

/* ---------------------------------------------------------------- d9.09 */

// Блок с обработчиком: где именно управление сходит с прямой дороги и куда
// прыгает. Схема существует ради того, чтобы стало видно, что остаток тела
// после падения пропускается, а после отработавшей ветки жизнь продолжается.
function buildPgExceptionJump() {
  const S = "pg-exception-jump";
  // текст строки, отметка справа, пояснение
  const lines = [
    ["RAISE NOTICE 'считаем паллеты под % коробок', boxes;", "ok", "напечаталось"],
    ["RAISE NOTICE 'нужно паллет: %', boxes / per_pal;", "bad", "22012 division by zero"],
    ["RAISE NOTICE 'приёмка закрыта';", "skip", "остаток тела пропущен"],
  ];

  const body = lines.map(([txt, kind, note], i) => {
    const top = 84 + i * 26;
    const cy = top + 13;
    const mark = kind === "ok" ? checkIcon(398, cy - 7, 13)
      : kind === "bad" ? crossIcon(398, cy - 7, 13)
      : `<line class="hush" x1="398" y1="${cy}" x2="411" y2="${cy}"/>`;
    return `<rect class="${kind === "bad" ? "linebad" : kind === "skip" ? "lineskip" : "linebox"}" x="40" y="${top}" width="298" height="22" rx="6"/>
<text class="mono ${kind === "skip" ? "faded" : ""}" x="48" y="${cy + 4}" font-size="8">${txt}</text>
${mark}
<text class="cap ${kind === "bad" ? "t-bad" : ""}" x="420" y="${cy + 4}" font-size="9.5">${note}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 442", S, "Куда прыгает управление при исключении", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-gold" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--gold)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .faded { fill: var(--muted); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .blockbox { fill: none; stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .linebox { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .linebad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .lineskip { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .handler { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.4; }
.dg-${S} .outbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .jump { fill: none; stroke: var(--gold); stroke-width: 1.8; }
.dg-${S} .hush { stroke: var(--line); stroke-width: 1.6; stroke-linecap: round; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Как только команда падает, остаток тела пропускается, и управление прыгает в подошедшую ветку WHEN</text>

<rect class="blockbox" x="26" y="52" width="330" height="206" rx="10"/>
<text class="mono t-ok" x="40" y="72" font-size="9">DO $$ BEGIN</text>
${body}
<text class="mono" x="40" y="186" font-size="9">EXCEPTION</text>
<rect class="handler" x="40" y="192" width="298" height="34" rx="6"/>
<text class="mono" x="48" y="206" font-size="8">  WHEN division_by_zero THEN</text>
<text class="mono" x="48" y="220" font-size="8">    RAISE NOTICE 'поймали: % (SQLSTATE %)', SQLERRM, SQLSTATE;</text>
<text class="mono" x="40" y="246" font-size="9">END $$;</text>
<text class="cap t-ok" x="100" y="246" font-size="9.5">блок завершён штатно, жизнь продолжается</text>

<path class="jump" d="M344,110 C364,110 368,150 368,180 C368,204 358,209 346,209" marker-end="url(#${S}-arrow-gold)"/>
<text class="cap t-gold" x="420" y="200" font-size="9.5">ветка подошла к случившейся ошибке —</text>
<text class="cap t-gold" x="420" y="214" font-size="9.5">сюда и прыгает управление</text>
${checkIcon(398, 222, 13)}
<text class="cap" x="420" y="233" font-size="9.5">напечаталось</text>

<rect class="outbox" x="26" y="278" width="648" height="66" rx="9"/>
<text class="cap" x="40" y="296" font-size="9.5" font-weight="600">что приехало заметками, и чего в них нет</text>
<text class="mono" x="40" y="312" font-size="9">NOTICE: считаем паллеты под 240 коробок</text>
<text class="mono" x="40" y="326" font-size="9">NOTICE: поймали: division by zero (SQLSTATE 22012)</text>
<text class="cap" x="40" y="339" font-size="9">Строки «нужно паллет» нет — деление не состоялось. Строки «приёмка закрыта» нет — до неё не дошли.</text>
<text class="cap t-ok" x="662" y="296" font-size="9.5" text-anchor="end">ни одной красной строки: транзакция жива</text>

<line x1="26" y1="366" x2="674" y2="366" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="388" font-size="11">Если ловить некому, исключение вылетает из блока наружу, доезжает до клиента и рушит транзакцию.</text>
<text class="cap" x="26" y="408" font-size="11">SQLSTATE — пятизначный код, SQLERRM — текст ошибки. Имя условия это просто человеческое имя того же кода:</text>
<text class="cap" x="26" y="428" font-size="11">WHEN division_by_zero и WHEN SQLSTATE '22012' ловят ровно одно и то же.</text>
`);
}

/* ---------------------------------------------------------------- d9.10 */

// Сеанс psql, в котором после первой ошибки транзакция уходит в отменённое
// состояние. Схема существует ради двух фактов: там не выполнится ничего,
// даже чтение, и COMMIT отвечает словом ROLLBACK, а не отказом.
function buildTxnAbort() {
  const S = "txn-abort";
  // команда, ответ сервера, тон ответа, пояснение
  const steps = [
    ["BEGIN;", "BEGIN", "plain", ""],
    ["UPDATE dbo.stock SET qty = qty - 5 WHERE lot='L0001';", "UPDATE 1", "ok", "внутри транзакции остаток стал 43"],
    ["INSERT INTO dbo.pickdetail … VALUES (999, 1, …);", "ERROR 23503: violates foreign key", "bad", "заказа 999 не существует"],
    ["SELECT qty FROM dbo.stock WHERE lot = 'L0001';", "ERROR 25P02: transaction is aborted", "bad", "обычному чтению тоже отsite03"],
    ["COMMIT;", "ROLLBACK", "gold", "не ошибка и не отказ: молча откатил"],
  ];
  const tops = [92, 122, 166, 198, 230];

  const body = steps.map(([cmd, ans, tone, note], i) => {
    const top = tops[i];
    const cy = top + 12;
    return `<text class="mono" x="36" y="${cy + 4}" font-size="8.5">${cmd}</text>
<text class="mono t-${tone}" x="358" y="${cy}" font-size="8.5">${ans}</text>
${note ? `<text class="cap" x="358" y="${cy + 12}" font-size="8.5">${note}</text>` : ""}`;
  }).join("\n");

  return svgWrap("0 0 700 444", S, "Ошибка внутри транзакции убивает её целиком", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-plain { fill: var(--ink-soft); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .band { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 5 4; }
.dg-${S} .lastbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Сеанс psql: команды идут по одной, как их слал бы обычный клиент</text>
<text class="cap" x="36" y="76" font-size="10" font-weight="600">что набрали</text>
<text class="cap" x="358" y="76" font-size="10" font-weight="600">что ответил сервер</text>
<line class="split" x1="346" y1="84" x2="346" y2="150"/>

<rect class="band" x="26" y="156" width="648" height="140" rx="9"/>
${body}
<text class="cap t-bad" x="350" y="272" font-size="9.5" font-weight="600" text-anchor="middle">транзакция в отменённом состоянии</text>
<text class="cap t-bad" x="350" y="287" font-size="9.5" text-anchor="middle">здесь не выполнится ничего: ни чтение, ни запись, ни новая попытка того же INSERT</text>

<rect class="lastbox" x="26" y="312" width="648" height="34" rx="8"/>
<text class="mono" x="36" y="333" font-size="8.5">SELECT qty FROM dbo.stock WHERE lot = 'L0001';</text>
<text class="mono t-ok" x="358" y="328" font-size="8.5">48.000</text>
<text class="cap" x="358" y="340" font-size="8.5">первое изменение тоже исчезло — откатилось всё</text>

<line x1="26" y1="368" x2="674" y2="368" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="390" font-size="11">Единственное, что сервер согласится принять в этом состоянии, — ROLLBACK или ROLLBACK TO SAVEPOINT.</text>
<text class="cap" x="26" y="410" font-size="11">На COMMIT он отвечает словом ROLLBACK: фиксировать отменённую транзакцию нечего, и об этом он не предупредит.</text>
<text class="cap" x="26" y="430" font-size="11">Жёстко — зато предсказуемо: сценария, в котором половина работы просочилась в базу, тут не бывает.</text>
`);
}

// Точка сохранения на линии транзакции: откатили кусок, а не всё. Схема нужна
// ради того, чтобы стало видно, что ROLLBACK TO не закрывает транзакцию —
// после него работа продолжается и заканчивается обычным COMMIT.
function buildSavepointLine() {
  const S = "savepoint-line";

  return svgWrap("0 0 700 372", S, "SAVEPOINT: откатить не всё, а кусок", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-gold" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--gold)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .axis { stroke: var(--ink-soft); stroke-width: 2; }
.dg-${S} .tick { stroke: var(--ink-soft); stroke-width: 2; stroke-linecap: round; }
.dg-${S} .tickgold { stroke: var(--gold); stroke-width: 2.4; stroke-linecap: round; }
.dg-${S} .kept { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .undone { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 4 3; }
.dg-${S} .back { fill: none; stroke: var(--gold); stroke-width: 1.8; }
.dg-${S} .resbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">ROLLBACK — топор, он отменяет транзакцию целиком. Точка сохранения — скальпель</text>
<text class="cap" x="26" y="52" font-size="10.5">Списали десять пакетов с одной партии, пометили место, списали десять со второй — и передумали насчёт второй.</text>

<rect class="kept" x="86" y="96" width="184" height="42" rx="9"/>
<text class="mono" x="178" y="114" font-size="8.5" text-anchor="middle">UPDATE … lot = 'L0001'</text>
<text class="cap t-ok" x="178" y="130" font-size="9.5" text-anchor="middle">qty 48 → 38</text>
<rect class="undone" x="326" y="96" width="184" height="42" rx="9"/>
<text class="mono" x="418" y="114" font-size="8.5" text-anchor="middle">UPDATE … lot = 'L0002'</text>
<text class="cap t-bad" x="418" y="130" font-size="9.5" text-anchor="middle">qty 60 → 50, и это отменят</text>

<line class="axis" x1="40" y1="156" x2="664" y2="156"/>
<line class="tick" x1="60" y1="146" x2="60" y2="166"/>
<text class="cap" x="60" y="182" font-size="9.5" text-anchor="middle">BEGIN</text>
<line class="tickgold" x1="298" y1="144" x2="298" y2="168"/>
<text class="mono t-gold" x="298" y="182" font-size="9" text-anchor="middle">SAVEPOINT step1</text>
<line class="tick" x1="538" y1="146" x2="538" y2="166"/>
<text class="mono t-gold" x="538" y="182" font-size="9" text-anchor="middle">ROLLBACK TO step1</text>
<line class="tick" x1="646" y1="146" x2="646" y2="166"/>
<text class="mono" x="646" y="182" font-size="9" text-anchor="middle">COMMIT</text>

<path class="back" d="M538,196 C538,222 310,222 300,200" marker-end="url(#${S}-arrow-gold)"/>
<text class="cap t-gold" x="418" y="230" font-size="9.5" text-anchor="middle">вернулись к пометке: отменилось ровно то, что было после неё, и ни на шаг больше</text>

<rect class="resbox" x="26" y="246" width="648" height="52" rx="9"/>
<text class="mono" x="40" y="266" font-size="9">L0001  qty = 38.000</text>
<text class="cap t-ok" x="176" y="266" font-size="9.5">COMMIT зафиксировал: минус десять остались на месте</text>
<text class="mono" x="40" y="286" font-size="9">L0002  qty = 60.000</text>
<text class="cap" x="176" y="286" font-size="9.5">как было, так и осталось: этот UPDATE отменён точкой сохранения</text>

<line x1="26" y1="318" x2="674" y2="318" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="340" font-size="11">Точка сохранения ничего не сохраняет — она только помечает место, к которому можно вернуться.</text>
<text class="cap" x="26" y="360" font-size="11">ROLLBACK TO не завершает транзакцию: только он и выводит её из отменённого состояния, не потеряв всё разом.</text>
`);
}

/* ---------------------------------------------------------------- d9.11 */

// Четыре слоя боевой процедуры в жёстком порядке. Схема существует ради
// порядка: проверки стоят до единственной команды записи, поэтому отказ не
// стоит ни блокировок, ни отката.
function buildProcLayers() {
  const S = "proc-layers";
  const layers = [
    ["1", "узнать, что просят",
      "SELECT skuid, qtyordered - qtypicked INTO v_skuid, v_need",
      "и сразу IF NOT FOUND: пустой результат INTO не роняет, он молча кладёт NULL"],
    ["2", "сказать «нет» до того, как что-то изменил",
      "IF v_free < v_need THEN RAISE EXCEPTION … USING ERRCODE, HINT",
      "проверка стоит до единственного UPDATE: пока не писали, отказ не стоит ни блокировок, ни отката"],
    ["3", "одна команда вместо цикла",
      "WITH ranked … , plan …  UPDATE dbo.stock_draft … FROM plan",
      "раскладка по ячейкам по правилу FEFO — одним UPDATE, без промежуточных состояний"],
    ["4", "вернуть ответ",
      "p_reserved := v_need;",
      "процедура в PostgreSQL сама набор строк не отдаёт: нужен OUT-параметр или отдельная функция"],
  ];

  const body = layers.map(([num, title, code, note], i) => {
    const top = 92 + i * 58;
    return `<rect class="${i === 1 ? "layerhot" : "layerbox"}" x="52" y="${top}" width="622" height="50" rx="9"/>
<circle class="num" cx="36" cy="${top + 25}" r="12"/>
<text class="t-accent" x="36" y="${top + 29}" font-size="11" font-weight="700" text-anchor="middle">${num}</text>
<text x="66" y="${top + 18}" font-size="10.5" font-weight="600">${title}</text>
<text class="mono" x="66" y="${top + 32}" font-size="8.5">${code}</text>
<text class="cap" x="66" y="${top + 45}" font-size="9">${note}</text>
${i < layers.length - 1 ? `<line class="flow" x1="36" y1="${top + 38}" x2="36" y2="${top + 54}" marker-end="url(#${S}-arrow)"/>` : ""}`;
  }).join("\n");

  return svgWrap("0 0 700 404", S, "Четыре слоя боевой процедуры", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .qbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .layerbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .layerhot { fill: var(--paper); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .num { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--muted); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Процедура состоит из четырёх слоёв, и они идут в жёстком порядке — сверху вниз</text>
<rect class="qbox" x="26" y="40" width="648" height="30" rx="8"/>
<text class="mono" x="38" y="60" font-size="9.5">CALL dbo.reserve_line(4, 1::smallint, NULL);</text>
<text class="cap" x="330" y="60" font-size="9.5">→ p_reserved = 12.000, столько молока просит четвёртый заказ</text>
${body}

<line x1="26" y1="344" x2="674" y2="344" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="366" font-size="11">Слой третий — сердце: инстинкт говорит «цикл по ячейкам, вычитаем, пока не наберём». Инстинкт не прав.</text>
<text class="cap" x="26" y="386" font-size="11">Номер ошибки — для программы, текст — для человека: приложение поймает 23514, а инженер прочитает, чего не хватило.</text>
`);
}

// Как окно раскладывает потребность по партиям: нарастающий итог до строки и
// least(free, need - before). Схема существует ради того, чтобы стало видно,
// что последняя партия отдаёт не всё, а ровно хвост потребности.
function buildFefoPlan() {
  const S = "fefo-plan";
  const X0 = 60, K = 5; // 5 пикселей на единицу
  const seg = [
    ["L0001", "2026-07-20", 36, 0, 36, "36.000"],
    ["L0002", "2026-07-24", 60, 36, 60, "60.000"],
    ["L0013", "2026-07-26", 120, 96, 4, "120.000"],
  ];

  const bars = seg.map(([lot, , , before, take], i) => {
    const x = X0 + before * K, w = take * K;
    return `<rect class="takeseg${i === 2 ? " partial" : ""}" x="${x + 1}" y="104" width="${w - 2}" height="30" rx="4"/>
${w > 40 ? `<text class="mono t-paper" x="${x + w / 2}" y="${123}" font-size="10" font-weight="700" text-anchor="middle">${take}</text>` : ""}
<text class="cap" x="${x + w / 2}" y="${98}" font-size="8.5" text-anchor="middle">${w > 40 ? lot : ""}</text>`;
  }).join("\n");

  const rows = seg.map(([lot, exp, free, before, take, freeTxt], i) => {
    const top = 186 + i * 28;
    const cy = top + 14;
    return `<rect class="${i === 2 ? "rowpart" : "row"}" x="26" y="${top}" width="648" height="24" rx="6"/>
<text class="mono" x="38" y="${cy + 3}" font-size="9">${lot}</text>
<text class="mono" x="104" y="${cy + 3}" font-size="9">${exp}</text>
<text class="mono" x="252" y="${cy + 3}" font-size="9" text-anchor="end">${freeTxt}</text>
<text class="mono" x="352" y="${cy + 3}" font-size="9" text-anchor="end">${before}.000</text>
<text class="mono t-accent" x="452" y="${cy + 3}" font-size="9" font-weight="700" text-anchor="end">${take}.000</text>
<text class="cap" x="472" y="${cy + 3}" font-size="8.5">least(${free}, 100 − ${before}) = ${take}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 384", S, "Потребность 100, разложенная по партиям", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-paper { fill: var(--paper); }
.dg-${S} .takeseg { fill: var(--accent); stroke: var(--paper); stroke-width: 1.4; }
.dg-${S} .partial { fill: var(--gold); stroke: var(--paper); }
.dg-${S} .need { fill: none; stroke: var(--ink-soft); stroke-width: 1.4; }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .rowpart { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; }
.dg-${S} .lead { stroke: var(--gold); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="26" font-size="11.5" font-weight="600">Нужно 100 литров молока. Свободно 36, 60 и 120 — ста не хватает ни в одной партии</text>
<text class="cap" x="26" y="52" font-size="10.5">Раскладка идёт по сроку годности: сначала то, что протухнет раньше. Ни одного IF в этой арифметике нет.</text>

<rect class="need" x="${X0}" y="100" width="${100 * K}" height="38" rx="5"/>
<text class="cap" x="${X0}" y="80" font-size="9.5">потребность строки заказа — 100.000</text>
${bars}
<line class="lead" x1="570" y1="119" x2="592" y2="119"/>
<text class="cap t-accent" x="596" y="115" font-size="8.5">L0013: взяли 4</text>
<text class="cap" x="596" y="127" font-size="8.5">из 120 свободных</text>

<text class="cap" x="38" y="176" font-size="9">партия</text>
<text class="cap" x="104" y="176" font-size="9">протухнет</text>
<text class="cap" x="252" y="176" font-size="9" text-anchor="end">свободно</text>
<text class="cap" x="352" y="176" font-size="9" text-anchor="end">before</text>
<text class="cap" x="452" y="176" font-size="9" text-anchor="end">take</text>
<text class="cap" x="472" y="176" font-size="9">откуда взялось take</text>
${rows}

<text class="cap" x="26" y="290" font-size="10">before — нарастающий итог свободного до текущей строки. Строка участвует, если before &lt; 100: последняя прошла впритык, 96 &lt; 100.</text>

<line x1="26" y1="308" x2="674" y2="308" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="330" font-size="11">36 плюс 60 плюс 4 — ровно сто. Три строки изменены одной командой: ни цикла, ни курсора, ни счётчика.</text>
<text class="cap" x="26" y="350" font-size="11">И ни одного промежуточного состояния, в котором резерв поставлен наполовину.</text>
<text class="cap" x="26" y="370" font-size="11">Привычка, которая стоит недорого: сначала показать себе план отдельным запросом, и только потом дать его выполнить.</text>
`);
}

/* ---------------------------------------------------------------- реестр */

export const REGISTRY = {
  "batch-parse": {
    id: "batch-parse",
    title: "Пакет разбирается целиком, потом выполняется",
    caption: "Сверху опечатка: разбор упал, и не выполнилось ничего — даже команда, стоящая выше ошибки. Снизу деление на ноль: разбор прошёл, и до упавшей команды кое-что успело сделаться по-настоящему.",
    anchor: "Что здесь произошло",
    svg: buildBatchParse(),
  },
  "var-scope": {
    id: "var-scope",
    title: "Кто про значение знает и до какого момента оно живёт",
    caption: "Длина полосы — срок жизни. Переменная PL/pgSQL кончается на END блока, переменная T-SQL — на GO, SET LOCAL — на COMMIT, а переменная psql вообще не доезжает до сервера: её подставляет клиент.",
    anchor: "Кто сколько живёт: блок, пакет, транзакция, сессия",
    svg: buildVarScope(),
  },
  "case-vs-if": {
    id: "case-vs-if",
    title: "CASE выбирает значение, IF выбирает команду",
    caption: "Слева одна команда даёт разным строкам разные значения. Справа команд две, и невыбранная не выполняется вообще — она не уезжает серверу.",
    anchor: "CASE выбирает значение, IF выбирает команду",
    svg: buildCaseVsIf(),
  },
  "proc-one-place": {
    id: "proc-one-place",
    title: "Копия должна быть одна, и лежать в базе",
    caption: "Слева три копии одного правила, которые разъехались молча: правку внесли в одну, минус в остатках получили от двух других. Справа копия одна и лежит в каталоге базы — рядом с данными и с собственным правом EXECUTE.",
    anchor: "Что здесь произошло",
    svg: buildProcOnePlace(),
  },
  "proc-commit-split": {
    id: "proc-commit-split",
    title: "Процедура распоряжается транзакцией, функция — нет",
    caption: "COMMIT посреди тела разрезал один вызов на две транзакции: первый шаг зафиксирован и пережил ROLLBACK, второй откатился начисто. Функция так не умеет ни при каких вызывающих.",
    anchor: "Процедура и функция: кто что может",
    svg: buildProcCommiclient_clit(),
  },
  "fn-volatility": {
    id: "fn-volatility",
    title: "Одно слово в заголовке функции — и план другой",
    caption: "Три категории изменчивости на одном и том же запросе. VOLATILE читает все двадцать тысяч строк, STABLE спускается по индексу, IMMUTABLE вообще исчезает из плана — на её месте готовая константа.",
    anchor: "IMMUTABLE, STABLE и VOLATILE: три слова, которые читает планировщик",
    svg: buildFnVolatility(),
  },
  "fn-inline": {
    id: "fn-inline",
    title: "Тело на чистом SQL встраивается в запрос",
    caption: "Одна и та же логика на двух языках. На LANGUAGE sql тело подставляется прямо в текст запроса и вызовов не остаётся; на plpgsql функция остаётся чёрным ящиком, который зовут по разу на строку.",
    anchor: "Почему функция в SELECT бывает дороже самого запроса",
    svg: buildFnInline(),
  },
  "trigger-before-after": {
    id: "trigger-before-after",
    title: "BEFORE успевает поправить строку, AFTER уже поздно",
    caption: "Один и тот же триггер по разные стороны от момента записи. BEFORE держит ещё не записанную строку и подменяет её, AFTER выполняет то же присваивание впустую: возвращённое значение база выбрасывает.",
    anchor: "BEFORE успевает поправить строку, AFTER уже поздно",
    svg: buildTriggerBeforeAfter(),
  },
  "trigger-row-vs-statement": {
    id: "trigger-row-vs-statement",
    title: "Построчный триггер против триггера на команду",
    caption: "Одна команда, три строки. В PostgreSQL функция сработает трижды и каждый раз увидит одну строку; в SQL Server триггер сработает один раз и увидит набор целиком — отсюда и мина при переносе привычки.",
    anchor: "То же самое в SQL Server",
    svg: buildTriggerRowVsStatement(),
  },
  "cursor-lifecycle": {
    id: "cursor-lifecycle",
    title: "Пять шагов курсора и бегунок по результату",
    caption: "Слева пять слов, из которых собран обход, справа — результат и место, где бегунок остановился. Запрос выполняется на OPEN, а четвёртый FETCH не приносит строки и гасит FOUND — на этом цикл и кончается.",
    anchor: "Что здесь произошло",
    svg: buildCursorLifecycle(),
  },
  "dyn-string-to-plan": {
    id: "dyn-string-to-plan",
    title: "Как строка становится запросом",
    caption: "Четыре шага: format собрал текст, EXECUTE отдал его серверу, сервер разобрал его с нуля и построил план, INTO забрал результат. До EXECUTE это данные, после — код.",
    anchor: "Что здесь произошло",
    svg: buildDynStringToPlan(),
  },
  "inj-granica": {
    id: "inj-granica",
    title: "Граница между данными и кодом",
    caption: "Одна и та же введённая строка двумя путями. Склейка вклеивает её в текст запроса, и парсер читает ввод как язык. Параметр везёт значение отдельно от текста, поэтому кодом оно стать не может.",
    anchor: "Что здесь произошло",
    svg: buildInjGranica(),
  },
  "pg-exception-jump": {
    id: "pg-exception-jump",
    title: "Куда прыгает управление при исключении",
    caption: "Вторая команда упала, остаток тела пропущен, управление прыгнуло в подошедшую ветку WHEN — и после неё блок завершился штатно. Двух заметок в выводе поэтому нет, и красной строки тоже нет.",
    anchor: "Что здесь произошло",
    svg: buildPgExceptionJump(),
  },
  "txn-abort": {
    id: "txn-abort",
    title: "Ошибка внутри транзакции убивает её целиком",
    caption: "После первой ошибки PostgreSQL уводит транзакцию в отменённое состояние: там отsite03 и обычному SELECT. COMMIT в ответ говорит ROLLBACK, и первое, удачное изменение исчезает вместе со всем остальным.",
    anchor: "Ошибка внутри транзакции убивает её целиком",
    svg: buildTxnAbort(),
  },
  "savepoint-line": {
    id: "savepoint-line",
    title: "SAVEPOINT: откатить не всё, а кусок",
    caption: "Пометка посреди транзакции, и возврат к ней отменяет ровно то, что случилось после — ни на шаг больше. Транзакция при этом жива и заканчивается обычным COMMIT, который фиксирует работу до пометки.",
    anchor: "SAVEPOINT: откатить не всё, а кусок",
    svg: buildSavepointLine(),
  },
  "proc-layers": {
    id: "proc-layers",
    title: "Четыре слоя боевой процедуры",
    caption: "Порядок здесь и есть содержание: сначала выяснить, что просят, потом отказать, если не сходится, и только потом писать. Проверки стоят до единственного UPDATE, поэтому отказ не стоит ни блокировок, ни отката.",
    anchor: "Что здесь произошло",
    svg: buildProcLayers(),
  },
  "fefo-plan": {
    id: "fefo-plan",
    title: "Потребность 100, разложенная по партиям",
    caption: "Нарастающий итог before показывает, сколько наберётся из партий, которые протухнут раньше, а least(free, 100 − before) отрезает от последней ровно хвост потребности: 36 плюс 60 плюс 4.",
    anchor: "Резерв на три ячейки без единого цикла",
    svg: buildFefoPlan(),
  },
};

// Привязка схем к нодам: код ноды -> список id.
export const INDEX = {
  "d9.01": ["batch-parse", "var-scope"],
  "d9.02": ["case-vs-if"],
  "d9.03": ["proc-one-place", "proc-commit-split"],
  "d9.04": ["fn-volatility", "fn-inline"],
  "d9.05": ["trigger-before-after", "trigger-row-vs-statement"],
  "d9.06": ["cursor-lifecycle"],
  "d9.07": ["dyn-string-to-plan"],
  "d9.08": ["inj-granica"],
  "d9.09": ["pg-exception-jump"],
  "d9.10": ["txn-abort", "savepoint-line"],
  "d9.11": ["proc-layers", "fefo-plan"],
};
