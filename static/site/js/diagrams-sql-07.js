// diagrams-sql-07.js
// Схемы этапа 7: типы данных и DDL.
//
// Оснастка общая (diagrams-sql-kit.js), правила те же: самодостаточный модуль,
// цвета только через CSS-переменные страницы, никакого JS внутри SVG.
// Образец стиля — diagrams-sql-02.js.

import { arrowDefs, checkIcon, crossIcon, svgWrap } from "./diagrams-sql-kit.js";

/* ---------------------------------------------------------------- d7.01 */

// Одно и то же число 0.1 в точном и в приблизительном типе: слева десятичные
// цифры лежат как есть, справа лежит ближайшая двоичная дробь. Схема нужна
// ради мысли, что разница не в печати, а в физическом содержимом колонки, —
// отсюда и «0.1 + 0.2 = 0.3 → false», и шесть пропавших рублей в отчёте.
function buildNumExactVsApprox() {
  const S = "num-exact-vs-approx";
  const LX = 158, LW = 248, RX = 418, RW = 252;

  // подпись слева (две строки), значение и пояснение для каждой колонки
  const rows = [
    [["что легло", "в колонку"], "0.10", "десятичные цифры, как на бумаге",
      "0.00011001100110011…", "ближайшая двоичная дробь", false],
    [["0.1 + 0.2", "даёт"], "0.3", "то же, что и на бумаге",
      "0.30000000000000004", "лишний хвост в конце", true],
    [["сравнили", "с 0.3"], "true", "строка находится",
      "false", "WHERE = 0.3 молча не найдёт", true],
    [["сложили 0.1", "десять раз"], "1.0", "ошибке неоткуда взяться",
      "0.9999999999999999", "погрешность накопилась", true],
  ];

  const body = rows.map(([label, lv, ln, rv, rn, toned], i) => {
    const top = 88 + i * 54;
    const lcls = toned ? "plate-ok" : "plate";
    const rcls = toned ? "plate-bad" : "plate";
    return `<text class="cap" x="26" y="${top + 22}" font-size="10.5">${label[0]}</text>
<text class="cap" x="26" y="${top + 38}" font-size="10.5">${label[1]}</text>
<rect class="${lcls}" x="${LX}" y="${top}" width="${LW}" height="46" rx="9"/>
<text class="mono ${toned ? "t-ok" : ""}" x="${LX + 14}" y="${top + 24}" font-size="13" font-weight="${toned ? 700 : 400}">${lv}</text>
<text class="cap" x="${LX + 14}" y="${top + 39}" font-size="10">${ln}</text>
<rect class="${rcls}" x="${RX}" y="${top}" width="${RW}" height="46" rx="9"/>
<text class="mono ${toned ? "t-bad" : ""}" x="${RX + 14}" y="${top + 24}" font-size="13" font-weight="${toned ? 700 : 400}">${rv}</text>
<text class="cap" x="${RX + 14}" y="${top + 39}" font-size="10">${rn}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 392", S, "Точный тип и приблизительный хранят 0.1 по-разному", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .plate { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .plate-ok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .plate-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .split { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Одно и то же 0.1 в двух семействах числовых типов</text>
<text class="cap" x="26" y="50" font-size="10.5">Разница не в том, как число печатается, а в том, что физически лежит в колонке</text>

<line class="split" x1="410" y1="66" x2="410" y2="300"/>
<text class="cap" x="158" y="78" font-size="11.5" font-weight="600">точный: numeric, он же decimal</text>
<text class="cap" x="418" y="78" font-size="11.5" font-weight="600">приблизительный: real, double precision</text>

${body}

<line x1="26" y1="316" x2="674" y2="316" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="338" font-size="11">Точный тип хранит десятичные цифры и складывает их по разрядам — как складывают столбиком на бумаге.</text>
<text class="cap" x="26" y="358" font-size="11">Приблизительный хранит двоичную дробь, а 0.1 в двоичной записи бесконечна: в колонку ложится соседнее число.</text>
<text class="cap" x="26" y="378" font-size="11">Погрешность не исчезает при сложении, а копится: сто тысяч раз по семь копеек — и в отчёте не хватает шести рублей.</text>
`);
}

// Разбор numeric(12,3) по клеткам: двенадцать значащих цифр, три из них после
// запятой. Схема нужна ради асимметрии, которая стоит людям волос: лишние
// знаки справа сервер округлит молча, лишние цифры слева уронят запрос.
function buildNumPrecisionScale() {
  const S = "num-precision-scale";
  const CW = 30, X0 = 163, DEMO_PROJECT = 14;
  // x-координата i-й клетки: после девятой вставлен зазор под запятую
  const cx = (i) => (i < 9 ? X0 + i * CW : X0 + 9 * CW + DEMO_PROJECT + (i - 9) * CW);

  const cells = Array.from({ length: 12 }, (_, i) => {
    const kind = i < 9 ? "cell-int" : "cell-frac";
    return `<rect class="${kind}" x="${cx(i)}" y="140" width="${CW}" height="36" rx="6"/>
<text class="mono ${i < 9 ? "t-accent" : "t-gold"}" x="${cx(i) + CW / 2}" y="164" font-size="14" text-anchor="middle">9</text>`;
  }).join("\n");

  return svgWrap("0 0 700 408", S, "Точность и масштаб в numeric(12,3)", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .frame { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .cell-int { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .cell-frac { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; }
.dg-${S} .brace { fill: none; stroke: var(--muted); stroke-width: 1.1; }
.dg-${S} .swatch-a { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .swatch-g { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; }
.dg-${S} .panel-gold { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .panel-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--muted); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Два числа в скобках — и ведут они себя совершенно по-разному</text>

<rect class="frame" x="26" y="52" width="210" height="52" rx="10"/>
<text class="mono" x="131" y="86" font-size="20" text-anchor="middle">numeric(<tspan class="t-accent" font-weight="700">12</tspan>, <tspan class="t-gold" font-weight="700">3</tspan>)</text>
<rect class="swatch-a" x="256" y="64" width="10" height="10" rx="3"/>
<text class="cap" x="274" y="73" font-size="11">12 — точность: сколько всего значащих цифр</text>
<rect class="swatch-g" x="256" y="90" width="10" height="10" rx="3"/>
<text class="cap" x="274" y="99" font-size="11">3 — масштаб: сколько из них стоит после запятой</text>

<text class="cap" x="26" y="132" font-size="10.5">Двенадцать клеток под цифры: девять слева от запятой и три справа</text>
${cells}
<text class="mono" x="${X0 + 9 * CW + DEMO_PROJECT / 2}" y="168" font-size="17" text-anchor="middle">.</text>

<path class="brace" d="M${X0},186 L${X0},192 L${X0 + 9 * CW - 2},192 L${X0 + 9 * CW - 2},186"/>
<text class="cap" x="${X0 + 4.5 * CW}" y="206" font-size="10.5" text-anchor="middle">девять цифр до запятой</text>
<path class="brace" d="M${cx(9)},186 L${cx(9)},192 L${cx(11) + CW},192 L${cx(11) + CW},186"/>
<text class="cap" x="${(cx(9) + cx(11) + CW) / 2}" y="206" font-size="10.5" text-anchor="middle">три после</text>
<text class="cap" x="350" y="228" font-size="11" text-anchor="middle">самое большое, что сюда влезет — 999 999 999.999</text>

<text class="cap" x="26" y="258" font-size="11.5" font-weight="600">лишние знаки справа — тихое округление</text>
<rect class="panel-gold" x="26" y="266" width="314" height="66" rx="10"/>
<text class="mono" x="44" y="298" font-size="14">17.5555</text>
<line class="flow" x1="120" y1="293" x2="156" y2="293" marker-end="url(#${S}-arrow)"/>
<text class="mono t-gold" x="166" y="298" font-size="14" font-weight="700">17.556</text>
<text class="cap" x="44" y="320" font-size="10.5">четвёртого знака в колонке нет — сервер округлил молча</text>

<text class="cap" x="360" y="258" font-size="11.5" font-weight="600">лишние цифры слева — падение запроса</text>
<rect class="panel-bad" x="360" y="266" width="314" height="66" rx="10"/>
<text class="mono" x="378" y="298" font-size="14">1000000000.00</text>
${crossIcon(500, 286, 14)}
<text class="t-bad" x="522" y="298" font-size="12.5" font-weight="700">ошибка</text>
<text class="cap" x="378" y="320" font-size="10.5">numeric field overflow, SQLSTATE 22003</text>

<line x1="26" y1="352" x2="674" y2="352" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="374" font-size="11">Не влез масштаб — сервер округлит и ничего не скажет: это потеря точности, о которой ты не узнаешь.</text>
<text class="cap" x="26" y="394" font-size="11">Не влезла точность — запрос упадёт немедленно. Лишние знаки справа тихие, лишние цифры слева громкие.</text>
`);
}

/* ---------------------------------------------------------------- d7.02 */

// Откуда сервер берёт правило сравнения строк: локаль машины → CREATE DATABASE
// → колонка → сравнение. Схема нужна ради двух мыслей: коллация решает и
// «меньше», и «равно», и она приезжает из базы, а не из запроса, — поэтому
// один и тот же ORDER BY на другом сервере даёт другой список.
function buildCollateSource() {
  const S = "collate-source";

  // правило, чем оно задано, ответ на 'Яблоки 1' < 'Абажур 2', пояснение
  const verdicts = [
    ["true", "bad", "правило базы: en_US.UTF-8", "буквы разницы не дали, решили цифры 1 и 2"],
    ["false", "ok", "COLLATE \"ru-RU-x-icu\"", "А раньше Я — как в любом словаре"],
  ];

  const cards = verdicts.map(([word, tone, src, note], i) => {
    const top = 150 + i * 54;
    return `<rect class="slab-${tone}" x="336" y="${top}" width="338" height="44" rx="9"/>
<rect class="pill-${tone}" x="346" y="${top + 9}" width="66" height="26" rx="7"/>
<text class="mono t-${tone}" x="379" y="${top + 27}" font-size="12.5" font-weight="700" text-anchor="middle">${word}</text>
<text class="mono" x="424" y="${top + 20}" font-size="11">${src}</text>
<text class="cap" x="424" y="${top + 36}" font-size="10">${note}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 408", S, "Правило сравнения строк приезжает из коллации", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .frame { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .slab-ok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .slab-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .pill-ok { fill: var(--paper); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .pill-bad { fill: var(--paper); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .sunkbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .flow { fill: none; stroke: var(--muted); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Сервер видит байты. Какая строка «меньше» — он спрашивает у коллации</text>
<text class="cap" x="26" y="50" font-size="10.5">Коллация — не про хранение и не про вид на экране, а про правило сравнения</text>

<text class="cap" x="26" y="70" font-size="10.5">правило приезжает в запрос так:</text>
<rect class="frame" x="26" y="76" width="172" height="44" rx="9"/>
<text class="cap" x="38" y="94" font-size="10">локаль машины</text>
<text class="mono" x="38" y="111" font-size="12">en_US.UTF-8</text>
<line class="flow" x1="202" y1="98" x2="226" y2="98" marker-end="url(#${S}-arrow)"/>
<rect class="hot" x="230" y="76" width="198" height="44" rx="9"/>
<text class="cap" x="242" y="94" font-size="10">CREATE DATABASE записал</text>
<text class="mono" x="242" y="111" font-size="12">datcollate = en_US.UTF-8</text>
<line class="flow" x1="432" y1="98" x2="456" y2="98" marker-end="url(#${S}-arrow)"/>
<rect class="frame" x="460" y="76" width="214" height="44" rx="9"/>
<text class="cap" x="472" y="94" font-size="10">колонка descr унаследовала</text>
<text class="mono" x="472" y="111" font-size="12">правило сравнения</text>

<text class="cap" x="26" y="142" font-size="11.5" font-weight="600">Одна и та же пара строк, два правила — два разных ответа</text>
<rect class="sunkbox" x="26" y="182" width="124" height="34" rx="8"/>
<text class="mono" x="88" y="204" font-size="12.5" text-anchor="middle">'Яблоки 1'</text>
<text class="mono" x="163" y="206" font-size="17" text-anchor="middle">&lt;</text>
<rect class="sunkbox" x="176" y="182" width="124" height="34" rx="8"/>
<text class="mono" x="238" y="204" font-size="12.5" text-anchor="middle">'Абажур 2'</text>
<path class="flow" d="M304,199 L316,199"/>
<path class="flow" d="M316,199 C326,199 322,172 332,172" marker-end="url(#${S}-arrow)"/>
<path class="flow" d="M316,199 C326,199 322,226 332,226" marker-end="url(#${S}-arrow)"/>
${cards}

<text class="cap" x="26" y="272" font-size="11.5" font-weight="600">Одно правило отвечает сразу на два вопроса</text>
<rect class="frame" x="26" y="282" width="314" height="54" rx="9"/>
<text class="cap" x="42" y="302" font-size="11" font-weight="600">какая из двух строк меньше</text>
<text class="cap" x="42" y="322" font-size="10">ORDER BY, &lt;, &gt;, MIN, MAX, порядок ключей в индексе</text>
<rect class="frame" x="360" y="282" width="314" height="54" rx="9"/>
<text class="cap" x="376" y="302" font-size="11" font-weight="600">равны ли две строки</text>
<text class="cap" x="376" y="322" font-size="10">=, DISTINCT, GROUP BY, JOIN ... ON</text>

<line x1="26" y1="356" x2="674" y2="356" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="378" font-size="11">Порядок строк — свойство базы, а не свойство запроса: тот же ORDER BY на другой базе разложит список иначе.</text>
<text class="cap" x="26" y="398" font-size="11">Коллацию выбирают при CREATE DATABASE и наследуют дальше. В запросе её можно перебить словом COLLATE.</text>
`);
}

/* ---------------------------------------------------------------- d7.03 */

// Четыре разных вопроса, на которые может отвечать «дата», и четыре типа под
// них в обоих диалектах. Схема нужна, чтобы разговорное слово «дата» распалось
// на день, время суток, пару «день+время» и момент на планете — и чтобы стало
// видно, что T-SQL timestamp в этот ряд не входит вовсе.
function buildDateFourQuestions() {
  const S = "date-four-questions";

  // вопрос колонки, пример со склада, тип в PostgreSQL, тип в SQL Server, крайний ли
  const rows = [
    ["только календарный день", "срок годности партии — тридцать первое июля, времени суток нет",
      "date", "date", false],
    ["только время суток", "смена начинается в 08:00 и кончается в 20:00, и так любой день",
      "time(n)", "time(n)", false],
    ["день вместе со временем суток", "заказ оформлен семнадцатого июля в 07:45",
      "timestamp(n)", "datetime2(n)", false],
    ["момент на планете, с указаны чьи это часы", "07:45 в Москве и 07:45 во Владивостоке — разные моменты",
      "timestamptz", "datetimeoffset(n)", true],
  ];

  const body = rows.map(([q, ex, pg, ms, hot], i) => {
    const top = 86 + i * 54;
    return `<rect class="${hot ? "rowhot" : "rowbg"}" x="26" y="${top}" width="648" height="48" rx="9"/>
<text x="42" y="${top + 21}" font-size="11" font-weight="600">${q}</text>
<text class="cap" x="42" y="${top + 37}" font-size="10">${ex}</text>
<rect class="${hot ? "tag-hot" : "tag"}" x="404" y="${top + 12}" width="134" height="24" rx="6"/>
<text class="mono ${hot ? "t-accent" : ""}" x="471" y="${top + 28}" font-size="11" text-anchor="middle">${pg}</text>
<rect class="${hot ? "tag-hot" : "tag"}" x="546" y="${top + 12}" width="128" height="24" rx="6"/>
<text class="mono ${hot ? "t-accent" : ""}" x="610" y="${top + 28}" font-size="10.5" text-anchor="middle">${ms}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 448", S, "Четыре вопроса, на которые отвечает «дата»", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .rowbg { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .rowhot { fill: var(--paper); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .tag { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .tag-hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .panel-gold { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Слово «дата» в разговоре означает четыре разные вещи</text>
<text class="cap" x="26" y="50" font-size="10.5">Колонка обязана отвечать ровно на один вопрос — вот все четыре и типы под них</text>

<text class="cap" x="42" y="76" font-size="10" font-weight="600">на какой вопрос отвечает колонка</text>
<text class="cap" x="471" y="76" font-size="10" font-weight="600" text-anchor="middle">PostgreSQL</text>
<text class="cap" x="610" y="76" font-size="10" font-weight="600" text-anchor="middle">SQL Server</text>
${body}

<rect class="panel-gold" x="26" y="314" width="648" height="42" rx="9"/>
<text class="t-gold" x="42" y="333" font-size="11" font-weight="700">Ловушка третьей строки</text>
<text class="cap" x="42" y="349" font-size="10.5">в T-SQL слово timestamp тоже есть, но означает счётчик версии строки, а не дату — и ошибки при этом не будет</text>

<line x1="26" y1="376" x2="674" y2="376" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="398" font-size="11">Событие — заказ оформлен, груз принят, пользователь вошёл — это момент на планете, и пояс ему нужен.</text>
<text class="cap" x="26" y="418" font-size="11">Бизнес-дата — срок годности, отчётный период, день рождения — к поясу отношения не имеет, ей нужен date.</text>
<text class="cap" x="26" y="438" font-size="11">«Сколько прошло» — это уже пятый вопрос и отдельный тип interval; в SQL Server такого типа нет вовсе.</text>
`);
}

// Одно и то же записанное значение, прочитанное двумя сессиями с разными
// поясами. Схема нужна ради того, чтобы стало видно: timestamp не двигается
// никогда, потому что двигать нечего, а timestamptz неподвижен как момент,
// но печатается часами того, кто смотрит, — вплоть до смены календарного дня.
function buildTzWallVsMoment() {
  const S = "tz-wall-vs-moment";
  const C1 = 176, C2 = 430, CW = 244;

  // подпись слева (две строки), значение и пояснение для каждой колонки, горячая ли ячейка справа
  const rows = [
    [["что физически", "лежит в базе"], "17.07.2026 23:50", "просто цифры на циферблате",
      "17.07.2026 23:50 UTC", "точка на оси времени", false],
    [["сессия сидит в", "Europe/Moscow"], "2026-07-17 23:50:00", "колонка не сдвинулась",
      "2026-07-18 02:50:00+03", "уже 18-е: московские часы", true],
    [["сессия сидит в", "UTC"], "2026-07-17 23:50:00", "колонка не сдвинулась",
      "2026-07-17 23:50:00+00", "17-е: часы UTC", false],
  ];

  const body = rows.map(([label, v1, n1, v2, n2, hot], i) => {
    const top = 106 + i * 56;
    return `<text class="cap" x="26" y="${top + 22}" font-size="10">${label[0]}</text>
<text class="mono" x="26" y="${top + 38}" font-size="11">${label[1]}</text>
<rect class="cell" x="${C1}" y="${top}" width="${CW}" height="48" rx="9"/>
<text class="mono" x="${C1 + 14}" y="${top + 24}" font-size="12.5">${v1}</text>
<text class="cap" x="${C1 + 14}" y="${top + 39}" font-size="10">${n1}</text>
<rect class="${hot ? "cell-hot" : "cell"}" x="${C2}" y="${top}" width="${CW}" height="48" rx="9"/>
<text class="mono ${hot ? "t-accent" : ""}" x="${C2 + 14}" y="${top + 24}" font-size="12.5" font-weight="${hot ? 700 : 400}">${v2}</text>
<text class="cap" x="${C2 + 14}" y="${top + 39}" font-size="10">${n2}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 428", S, "Часы на стене и момент на планете", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .cell { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .cell-hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .sumflat { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .sumhot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Одно значение, две сессии — и сдвинулась только одна колонка</text>
<text class="cap" x="26" y="50" font-size="10.5">timestamp отвечает «что показывали часы», timestamptz — «когда это случилось»</text>

<text class="mono" x="${C1 + 14}" y="80" font-size="13" font-weight="700">timestamp</text>
<text class="cap" x="${C1 + 14}" y="96" font-size="10.5">часы на стене</text>
<text class="mono" x="${C2 + 14}" y="80" font-size="13" font-weight="700">timestamptz</text>
<text class="cap" x="${C2 + 14}" y="96" font-size="10.5">момент на планете</text>
${body}

<rect class="sumflat" x="${C1}" y="286" width="${CW}" height="44" rx="9"/>
<text class="cap" x="${C1 + 14}" y="306" font-size="10.5" font-weight="600">две сессии — одна и та же строка</text>
<text class="cap" x="${C1 + 14}" y="322" font-size="10">двигать нечего: это просто цифры</text>
<rect class="sumhot" x="${C2}" y="286" width="${CW}" height="44" rx="9"/>
<text class="cap" x="${C2 + 14}" y="306" font-size="10.5" font-weight="600">две сессии — две разные строки</text>
<text class="cap" x="${C2 + 14}" y="322" font-size="10">момент один, а часы у каждого свои</text>

<line x1="26" y1="352" x2="674" y2="352" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="374" font-size="11">timestamp — часы на стене: в значении не написано, в каком городе они висят, и сервер это не выясняет.</text>
<text class="cap" x="26" y="394" font-size="11">timestamptz сервер пишет в UTC, а печатает часами того, кто смотрит: значение неподвижно, вид зависит от сессии.</text>
<text class="cap" x="26" y="414" font-size="11">Отсюда и заказ, уехавший на завтра: писали момент в UTC, а кладовщик читает отчёт московскими глазами.</text>
`);
}

/* ---------------------------------------------------------------- d7.04 */

// Куда ложится новая строка в индексе: счётчик всегда в конец, случайный uuid —
// в случайную страницу. Схема нужна не ради размера ключа, а ради порядка:
// сверху видно, что вставка 1-2-3-4 дала в индексе 2-4-3-1, снизу — чем это
// оборачивается для страниц индекса.
function buildUuidVsIdentity() {
  const S = "uuid-vs-identity";

  // номер вставки и начало uuid; порядок в индексе — по значению uuid
  const ins = [
    ["1", "f47ac10b-58cc-4372-…"],
    ["2", "1b9d6bcd-bbfd-4b2d-…"],
    ["3", "c9b1f0a2-3d4e-4f5a-…"],
    ["4", "3f2504e0-4f89-41d3-…"],
  ];
  const idx = [ins[1], ins[3], ins[2], ins[0]];

  const chip = (x, y, n, u) => `<rect class="chipbox" x="${x}" y="${y}" width="250" height="20" rx="6"/>
<text class="mono" x="${x + 12}" y="${y + 14}" font-size="11" font-weight="700">${n}</text>
<text class="mono" x="${x + 34}" y="${y + 14}" font-size="10.5">${u}</text>`;

  const rows = ins.map(([n, u], i) => {
    const y = 88 + i * 24;
    const j = idx.findIndex((r) => r[0] === n);
    const y2 = 88 + j * 24;
    return `${chip(26, y, n, u)}
<path class="wire" d="M280,${y + 10} C330,${y + 10} 326,${y2 + 10} 376,${y2 + 10}"/>`;
  }).join("\n") + "\n" + idx.map(([n, u], i) => chip(380, 88 + i * 24, n, u)).join("\n");

  // одна панель: заголовок, значение новой строки, ряд страниц индекса, две подписи
  const panel = (x, title, sub, val, pages, hotIdx, tone, notes) => {
    const px = (i) => x + 16 + i * 68;
    const cellsSvg = pages.map((p, i) => `<rect class="${i === hotIdx ? "page-" + tone : "page"}" x="${px(i)}" y="304" width="62" height="34" rx="7"/>
<text class="mono ${i === hotIdx ? "t-" + tone : "cap"}" x="${px(i) + 31}" y="325" font-size="10" text-anchor="middle">${p}</text>`).join("\n");
    const cx = px(hotIdx) + 31;
    return `<rect class="panel" x="${x}" y="216" width="314" height="166" rx="10"/>
<text x="${x + 16}" y="236" font-size="11" font-weight="600">${title}</text>
<text class="cap" x="${x + 16}" y="252" font-size="10">${sub}</text>
<text class="cap" x="${cx}" y="266" font-size="9.5" text-anchor="middle">новая строка</text>
<rect class="newbox" x="${cx - 50}" y="272" width="100" height="22" rx="6"/>
<text class="mono" x="${cx}" y="287" font-size="11" text-anchor="middle">${val}</text>
<line class="drop" x1="${cx}" y1="296" x2="${cx}" y2="303" marker-end="url(#${S}-arrow)"/>
${cellsSvg}
<text class="cap" x="${x + 16}" y="356" font-size="10">${notes[0]}</text>
<text class="cap" x="${x + 16}" y="371" font-size="10">${notes[1]}</text>`;
  };

  return svgWrap("0 0 700 478", S, "Счётчик кладёт строку в конец индекса, uuid — куда попало", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .chipbox { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .panel { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .newbox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .page { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1.1; }
.dg-${S} .page-ok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.6; }
.dg-${S} .page-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.6; }
.dg-${S} .wire { fill: none; stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .drop { stroke: var(--muted); stroke-width: 1.4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Счётчик кладёт новую строку в конец индекса, случайный uuid — куда попало</text>
<text class="cap" x="26" y="50" font-size="10.5">Четыре значения вставлены по порядку номеров, а в индексе они лежат по значению uuid</text>

<text class="cap" x="26" y="80" font-size="10" font-weight="600">вставили в таком порядке</text>
<text class="cap" x="380" y="80" font-size="10" font-weight="600">а в индексе легло так</text>
${rows}
<text class="cap" x="26" y="200" font-size="10.5">Порядок вставки 1-2-3-4, порядок в индексе 2-4-3-1 — ни малейшей связи.</text>

${panel(26, "int IDENTITY — счётчик сервера", "значения растут, каждое следующее больше предыдущего",
    "1502", ["1–500", "501–1000", "1001–1500", "1501–…"], 3, "ok",
    ["одна и та же страница на все вставки: она",
      "уже в памяти, и место на ней есть"])}
${panel(360, "uuid — значение из воздуха", "старшие байты случайны, соседства нет ни с чем",
    "8c1e…", ["0…3", "4…7", "8…b", "c…f"], 2, "bad",
    ["чужую страницу надо поднять с диска, а места",
      "на ней нет — она делится пополам, индекс пухнет"])}

<line x1="26" y1="402" x2="674" y2="402" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="424" font-size="11">Шестнадцать байт против четырёх — это ещё не беда: ключ лежит во всех индексах, но диск дешёвый.</text>
<text class="cap" x="26" y="444" font-size="11">Беда — порядок: каждая новая строка приземляется в случайное место дерева, и страницы рвутся пополам.</text>
<text class="cap" x="26" y="464" font-size="11">uuid оправдан там, где значение обязано родиться вне базы. Иначе — узкий счётчик, а uuid рядом с UNIQUE.</text>
`);
}

// Один и тот же литерал, положенный в json и в jsonb. Схема нужна ради того,
// что jsonb — не «json побыстрее», а другой способ хранения: он выбрасывает
// пробелы, дубликаты ключей и исходный порядок, потому что хранит дерево,
// а не текст.
function buildJsonVsJsonb() {
  const S = "json-vs-jsonb";

  // тип, подзаголовок, что сделал сервер (две строки), результат, три пометки, вывод
  const cols = [
    ["json", "текст как есть", "убедился, что документ разбирается,",
      "и положил исходный текст символ в символ",
      "{\"temp\": \"+4\",  \"cert\": [\"EAC\"], \"temp\": \"+6\"}", 9,
      ["два пробела остались двумя пробелами", "оба ключа temp на месте", "порядок ключей исходный"],
      "keep", "каждое обращение к полю заново разбирает текст", "bad"],
    ["jsonb", "разобранное дерево", "разобрал документ один раз на приёме",
      "и выбросил всё, что не несёт смысла",
      "{\"cert\": [\"EAC\"], \"temp\": \"+6\"}", 11,
      ["лишние пробелы ушли", "дубликат ключа исчез — выжил последний", "ключи легли в свой порядок: cert раньше temp"],
      "change", "поля достаются быстро, и по ним строится индекс", "ok"],
  ];

  const body = cols.map(([name, sub, l1, l2, res, fs, marks, dot, tail, tone], i) => {
    const x = 26 + i * 334;
    const notes = marks.map((m, k) => `<rect class="dot-${dot}" x="${x + 16}" y="${266 + k * 17}" width="8" height="8" rx="2"/>
<text class="cap" x="${x + 30}" y="${274 + k * 17}" font-size="10">${m}</text>`).join("\n");
    return `<rect class="panel" x="${x}" y="148" width="314" height="192" rx="10"/>
<text class="mono" x="${x + 16}" y="174" font-size="15" font-weight="700">${name}</text>
<text class="cap" x="${x + 16 + name.length * 10 + 12}" y="174" font-size="10.5">${sub}</text>
<text class="cap" x="${x + 16}" y="196" font-size="10">${l1}</text>
<text class="cap" x="${x + 16}" y="211" font-size="10">${l2}</text>
<rect class="res" x="${x + 14}" y="222" width="286" height="30" rx="7"/>
<text class="mono" xml:space="preserve" x="${x + 24}" y="242" font-size="${fs}">${res}</text>
${notes}
<line x1="${x + 16}" y1="${318}" x2="${x + 298}" y2="${318}" stroke="var(--line-soft)" stroke-width="1"/>
<text class="cap t-${tone}" x="${x + 16}" y="333" font-size="10">${tail}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 416", S, "json хранит текст, jsonb хранит дерево", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .frame { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .panel { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .res { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .dot-keep { fill: var(--paper); stroke: var(--muted); stroke-width: 1.2; }
.dg-${S} .dot-change { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; }
.dg-${S} .flow { fill: none; stroke: var(--muted); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Один литерал, два типа — и только один сохранил его дословно</text>
<text class="cap" x="26" y="50" font-size="10.5">В PostgreSQL типов для JSON два, и разница между ними не в скорости, а в том, что лежит на диске</text>

<text class="cap" x="26" y="70" font-size="10">на входе:</text>
<rect class="frame" x="26" y="76" width="648" height="52" rx="9"/>
<text class="mono" xml:space="preserve" x="42" y="102" font-size="12.5">{"temp": "+4",  "cert": ["EAC"], "temp": "+6"}</text>
<text class="cap" x="42" y="120" font-size="10.5">в нём нарочно два пробела подряд и ключ temp, встреченный дважды</text>
<path class="flow" d="M183,130 L183,144" marker-end="url(#${S}-arrow)"/>
<path class="flow" d="M517,130 L517,144" marker-end="url(#${S}-arrow)"/>
${body}

<line x1="26" y1="360" x2="674" y2="360" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="382" font-size="11">json — это text с проверкой синтаксиса на входе: сервер убеждается, что документ разбирается, и кладёт текст.</text>
<text class="cap" x="26" y="402" font-size="11">Бери jsonb. json нужен ровно тогда, когда исходный текст обязан сохраниться байт в байт: подпись, чужой payload.</text>
`);
}

/* ---------------------------------------------------------------- d7.05 */

// Разбор одной строки CREATE TABLE на части: имя, тип, признак NULL/NOT NULL
// и всё остальное поверх них. Схема нужна, чтобы объявление колонки перестало
// быть сплошной строкой и распалось на обязательное и необязательное.
function buildDdlColumn() {
  const S = "ddl-column";

  // имя, тип, признак, надстройка, смысл
  const cols = [
    ["skuid", "varchar(20)", "NOT NULL", "", "артикул, без него строки нет"],
    ["descr", "varchar(100)", "NOT NULL", "", "название, тоже обязательно"],
    ["uom", "varchar(10)", "NOT NULL", "DEFAULT 'PC'", "забыли — подставится 'PC'"],
    ["weight", "decimal(9,3)", "NULL", "", "у весовых штучного веса нет"],
  ];

  const body = cols.map(([nm, tp, fl, df, why], i) => {
    const top = 204 + i * 32;
    return `<rect class="rowbg" x="26" y="${top}" width="648" height="28" rx="7"/>
<text class="mono" x="40" y="${top + 19}" font-size="11">${nm}</text>
<text class="mono" x="150" y="${top + 19}" font-size="11">${tp}</text>
<text class="mono ${fl === "NULL" ? "t-gold" : ""}" x="286" y="${top + 19}" font-size="11">${fl}</text>
<text class="mono cap" x="392" y="${top + 19}" font-size="11">${df || "—"}</text>
<text class="cap" x="506" y="${top + 19}" font-size="10">${why}</text>`;
  }).join("\n");

  // кусок объявления, его x, ширина подчёркивания, тон, две строки подписи
  const parts = [
    ["uom", 26, 28, "a", "имя", "как называется"],
    ["varchar(10)", 110, 106, "a", "тип", "что может лежать внутри"],
    ["NOT NULL", 272, 78, "g", "признак", "обязательно ли значение"],
    ["DEFAULT 'PC'", 414, 122, "m", "надстройка", "что подставить, если забыли"],
  ];
  const dissect = parts.map(([txt, x, w, tone, l1, l2]) =>
    `<text class="mono" x="${x}" y="104" font-size="16">${txt}</text>
<rect class="seg-${tone}" x="${x}" y="112" width="${w}" height="4" rx="2"/>
<text class="cap ${tone === "a" ? "t-accent" : tone === "g" ? "t-gold" : ""}" x="${x}" y="132" font-size="10.5" font-weight="600">${l1}</text>
<text class="cap" x="${x}" y="147" font-size="10">${l2}</text>`).join("\n");

  return svgWrap("0 0 700 424", S, "Из чего собрано объявление колонки", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .rowbg { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .seg-a { fill: var(--accent); }
.dg-${S} .seg-g { fill: var(--gold); }
.dg-${S} .seg-m { fill: var(--line); }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Колонка — это имя, тип и признак NULL/NOT NULL. Всё остальное — надстройка</text>
<text class="cap" x="26" y="50" font-size="10.5">Первые две части обязательны всегда, третью стоит писать явно каждый раз</text>

<text class="cap" x="26" y="78" font-size="10">третья строка из CREATE TABLE dbo.sku_draft, разобранная по частям:</text>
${dissect}

<text class="cap" x="26" y="180" font-size="10.5" font-weight="600">все четыре колонки той же таблицы по тем же частям</text>
<text class="cap" x="40" y="198" font-size="9.5">имя</text>
<text class="cap" x="150" y="198" font-size="9.5">тип</text>
<text class="cap" x="286" y="198" font-size="9.5">признак</text>
<text class="cap" x="392" y="198" font-size="9.5">надстройка</text>
<text class="cap" x="506" y="198" font-size="9.5">что это значит</text>
${body}

<line x1="26" y1="352" x2="674" y2="352" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="374" font-size="11">Имя и тип обязательны всегда, остальное надстраивается поверх них.</text>
<text class="cap" x="26" y="394" font-size="11">Признак NULL/NOT NULL пиши явно: умолчание у серверов разное, а в SQL Server зависит ещё и от настроек сессии.</text>
<text class="cap" x="26" y="414" font-size="11">CREATE TABLE и ALTER TABLE — это DDL: они меняют форму таблицы, а не строки внутри неё.</text>
`);
}

// Что переезжает при CREATE TABLE ... AS SELECT, а что остаётся в оригинале.
// Схема нужна ради одной вещи: копия выглядит как таблица, но правил в ней нет
// вообще, и это видно только когда в неё уже прошёл дубль ключа.
function buildCtasLoss() {
  const S = "ctas-loss";
  const kept = ["имена колонок", "типы колонок", "сами данные"];
  const lost = ["PRIMARY KEY", "NOT NULL", "DEFAULT 'PC'", "CHECK", "UNIQUE", "FOREIGN KEY", "индексы"];

  const keptSvg = kept.map((k, i) => `${checkIcon(44, 186 + i * 22, 13)}
<text class="mono" x="68" y="${197 + i * 22}" font-size="11.5">${k}</text>`).join("\n");
  const lostSvg = lost.map((k, i) => `${crossIcon(378, 186 + i * 22, 13)}
<text class="mono cap" x="402" y="${197 + i * 22}" font-size="11.5">${k}</text>`).join("\n");

  // литерал вставки и чем он должен был упереться в оригинале
  const proofs = [
    ["('APPLE-KG', 'Второе яблоко…')", "дубль артикула, хотя в оригинале это первичный ключ"],
    ["(NULL, NULL, NULL, NULL)", "строка без артикула, хотя обе колонки были NOT NULL"],
  ];
  const proofSvg = proofs.map(([lit, why], i) => {
    const y = 388 + i * 26;
    return `<text class="mono" x="42" y="${y + 14}" font-size="11">${lit}</text>
<rect class="pill-gold" x="264" y="${y}" width="64" height="20" rx="6"/>
<text class="t-gold" x="296" y="${y + 14}" font-size="10.5" font-weight="700" text-anchor="middle">прошло</text>
<text class="cap" x="340" y="${y + 14}" font-size="10.5">${why}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 512", S, "Что теряет копия, снятая через CREATE TABLE AS SELECT", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .frame { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .panel-ok { fill: var(--paper); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .panel-bad { fill: var(--paper); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .proof { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
.dg-${S} .pill-gold { fill: var(--paper); stroke: var(--gold); stroke-width: 1.2; }
.dg-${S} .flow { fill: none; stroke: var(--muted); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">CREATE TABLE ... AS SELECT переносит имена, типы и данные. И больше ничего</text>
<text class="cap" x="26" y="50" font-size="10.5">Копия выглядит как таблица, но правил в ней нет ни одного</text>

<rect class="frame" x="26" y="70" width="648" height="56" rx="9"/>
<text class="mono" x="42" y="94" font-size="12">CREATE TABLE dbo.sku_kg AS</text>
<text class="mono" x="42" y="114" font-size="12">SELECT skuid, descr, uom, weight FROM dbo.sku WHERE uom = 'KG';</text>
<path class="flow" d="M350,128 L350,142" marker-end="url(#${S}-arrow)"/>

<rect class="panel-ok" x="26" y="150" width="314" height="190" rx="10"/>
<text class="t-ok" x="42" y="172" font-size="11.5" font-weight="700">переехало в копию</text>
${keptSvg}
<text class="cap" x="42" y="286" font-size="10">Для слепка перед опасной операцией этого</text>
<text class="cap" x="42" y="301" font-size="10">и достаточно: там нужны данные, а не правила.</text>

<rect class="panel-bad" x="360" y="150" width="314" height="190" rx="10"/>
<text class="t-bad" x="376" y="172" font-size="11.5" font-weight="700">осталось в оригинале</text>
${lostSvg}

<text class="cap" x="26" y="368" font-size="10.5" font-weight="600">проверка руками: в копию проходит то, что оригинал не пустил бы никогда</text>
<rect class="proof" x="26" y="378" width="648" height="62" rx="9"/>
${proofSvg}

<line x1="26" y1="460" x2="674" y2="460" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="482" font-size="11">Переносятся только имена колонок, типы и данные — ни ключей, ни CHECK, ни UNIQUE, ни даже NOT NULL.</text>
<text class="cap" x="26" y="502" font-size="11">Снять слепок так можно и нужно. Сделать так рабочую таблицу — потерять всю защиту разом и заметить через месяц.</text>
`);
}

/* ---------------------------------------------------------------- d7.06 */

// Одно и то же правило, записанное в двух местах: в методе приложения и в
// схеме таблицы. Схема нужна ради главной мысли ноды — проверка в коде
// караулит один вход, а проверка в схеме стоит на самом входе в таблицу,
// и мимо неё пути нет ни у кого.
function buildConstraintGate() {
  const S = "constraint-gate";
  const who = ["приложение", "выгрузка из 1С", "скрипт подрядчика", "человек с консолью"];

  const clients = (y0) => who.map((w, i) => {
    const top = y0 + i * 28;
    return `<rect class="who" x="26" y="${top}" width="150" height="24" rx="7"/>
<text class="cap" x="38" y="${top + 16}" font-size="10.5">${w}</text>`;
  }).join("\n");

  // пути мимо проверки: три нижних клиента идут прямо в таблицу
  const bypass = who.slice(1).map((_, i) => {
    const cy = 104 + (i + 1) * 28 + 12;
    return `<line class="leak" x1="180" y1="${cy}" x2="506" y2="${cy}" marker-end="url(#${S}-arrow-bad)"/>`;
  }).join("\n");

  const blocked = who.map((_, i) => {
    const cy = 288 + i * 28 + 12;
    return `<line class="flow" x1="180" y1="${cy}" x2="426" y2="${cy}" marker-end="url(#${S}-arrow)"/>
${crossIcon(444, cy - 7, 15)}`;
  }).join("\n");

  return svgWrap("0 0 700 492", S, "Правило в коде и то же правило в схеме", `
<defs>${arrowDefs(S)}
<marker id="${S}-arrow-bad" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--bad)"/></marker></defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .who { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .codebox { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .tbl { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .tbl-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.4; }
.dg-${S} .tbl-ok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.4; }
.dg-${S} .bar { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .flow { stroke: var(--muted); stroke-width: 1.2; }
.dg-${S} .leak { stroke: var(--bad); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Одно и то же правило, записанное в двух разных местах</text>
<text class="cap" x="26" y="50" font-size="10.5">«товар обязан быть в справочнике» — проверка либо в коде приложения, либо в самой таблице</text>

<text class="t-bad" x="26" y="86" font-size="11" font-weight="700">правило живёт в методе saveStock()</text>
${clients(104)}
<rect class="codebox" x="200" y="104" width="124" height="24" rx="7"/>
<text class="cap" x="262" y="120" font-size="10" text-anchor="middle">проверка в коде</text>
<line class="flow" x1="180" y1="116" x2="196" y2="116" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="328" y1="116" x2="506" y2="116" marker-end="url(#${S}-arrow)"/>
${bypass}
<rect class="tbl-bad" x="510" y="100" width="164" height="110" rx="10"/>
<text class="mono" x="592" y="132" font-size="12.5" text-anchor="middle">dbo.stock</text>
<rect class="tbl" x="524" y="150" width="136" height="26" rx="6"/>
<text class="mono t-bad" x="592" y="167" font-size="10.5" text-anchor="middle">ЧАЙ-РАЗВЕС 40</text>
<text class="cap t-bad" x="592" y="194" font-size="10" text-anchor="middle">товара нет в справочнике</text>
<text class="cap" x="26" y="230" font-size="10.5">Три пути из четырёх идут мимо проверки — и «ЧАЙ-РАЗВЕС» спокойно лёг в остатки.</text>

<text class="t-ok" x="26" y="268" font-size="11" font-weight="700">правило живёт в схеме таблицы</text>
${clients(288)}
<text class="cap" x="452" y="278" font-size="10" text-anchor="middle">FOREIGN KEY</text>
<rect class="bar" x="430" y="284" width="44" height="118" rx="10"/>
${blocked}
<rect class="tbl-ok" x="500" y="284" width="174" height="118" rx="10"/>
<text class="mono" x="587" y="330" font-size="12.5" text-anchor="middle">dbo.stock</text>
<text class="cap" x="587" y="354" font-size="10" text-anchor="middle">«ЧАЙ-РАЗВЕС» сюда</text>
<text class="cap" x="587" y="369" font-size="10" text-anchor="middle">не попал ни одним путём</text>
<text class="cap" x="26" y="422" font-size="10.5">Все четыре пути упираются в одну и ту же проверку, и все четыре получают ошибку 23503.</text>

<line x1="26" y1="440" x2="674" y2="440" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="462" font-size="11">Ограничение — правило в определении таблицы: сервер проверяет его сам, на каждой строке, для всех подряд.</text>
<text class="cap" x="26" y="482" font-size="11">Правило в схеме работает всегда. Правило в коде приложения — ровно до первого, кто пошёл мимо приложения.</text>
`);
}

// Дерево ссылок вокруг справочника товаров и две стороны, с которых внешний
// ключ караулит. Схема нужна, чтобы стало видно: FK мешает и вставить сироту,
// и удалить родителя, — а порядок удаления без каскадов идёт от листьев к корню.
function buildFkTree() {
  const S = "fk-tree";
  const order = ["pickdetail", "orderdetail", "stock", "lot", "dbo.sku"];

  const chain = order.map((t, i) => {
    const x = 26 + i * 128;
    const arrow = i === order.length - 1 ? ""
      : `<line class="flow" x1="${x + 106}" y1="399" x2="${x + 124}" y2="399" marker-end="url(#${S}-arrow)"/>`;
    return `<rect class="${i === order.length - 1 ? "node-hot" : "node"}" x="${x}" y="384" width="106" height="30" rx="8"/>
<text class="mono ${i === order.length - 1 ? "t-accent" : ""}" x="${x + 53}" y="403" font-size="11" text-anchor="middle">${t}</text>
${arrow}`;
  }).join("\n");

  // заголовок панели, команда, что ответил сервер, короткий вывод
  const sides = [
    ["со стороны ребёнка: сироте не появиться", "INSERT INTO dbo.stock … 'ЧАЙ-РАЗВЕС'",
      "23503: такого артикула нет в dbo.sku", "ссылка в пустоту не пройдёт никогда"],
    ["со стороны родителя: удалить не дадут", "DELETE FROM dbo.sku WHERE skuid='MILK-1L'",
      "на MILK-1L ещё ссылается lot", "и это только первый конфликт из трёх"],
  ];
  const panels = sides.map(([t, cmd, err, note], i) => {
    const x = 26 + i * 334;
    return `<rect class="panel" x="${x}" y="248" width="314" height="104" rx="10"/>
<text x="${x + 16}" y="268" font-size="11" font-weight="600">${t}</text>
<text class="mono cap" x="${x + 16}" y="290" font-size="10.5">${cmd}</text>
${crossIcon(x + 16, 306, 13)}
<text class="cap t-bad" x="${x + 38}" y="317" font-size="10.5">${err}</text>
<text class="cap" x="${x + 16}" y="338" font-size="10">${note}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 490", S, "Внешний ключ караулит с двух сторон", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .node { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .node-hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.dg-${S} .panel { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .flow { fill: none; stroke: var(--muted); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Внешний ключ караулит с двух сторон, и обе стороны важны</text>
<text class="cap" x="26" y="50" font-size="10.5">«значение в моей колонке обязано существовать вон в той таблице» — и это работает в обе стороны</text>

<text class="cap" x="26" y="86" font-size="10">кто на кого ссылается вокруг справочника товаров (стрелка идёт от ребёнка к родителю):</text>
<rect class="node" x="196" y="100" width="132" height="30" rx="8"/>
<text class="mono" x="262" y="119" font-size="11" text-anchor="middle">lot</text>
<rect class="node" x="196" y="140" width="132" height="30" rx="8"/>
<text class="mono" x="262" y="159" font-size="11" text-anchor="middle">stock</text>
<rect class="node" x="196" y="180" width="132" height="30" rx="8"/>
<text class="mono" x="262" y="199" font-size="11" text-anchor="middle">orderdetail</text>
<rect class="node" x="26" y="180" width="132" height="30" rx="8"/>
<text class="mono" x="92" y="199" font-size="11" text-anchor="middle">pickdetail</text>
<line class="flow" x1="160" y1="195" x2="192" y2="195" marker-end="url(#${S}-arrow)"/>
<path class="flow" d="M330,115 C364,115 366,140 394,146" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="330" y1="155" x2="394" y2="157" marker-end="url(#${S}-arrow)"/>
<path class="flow" d="M330,195 C364,195 366,174 394,168" marker-end="url(#${S}-arrow)"/>
<rect class="node-hot" x="398" y="135" width="160" height="44" rx="9"/>
<text class="mono t-accent" x="478" y="162" font-size="13" font-weight="700" text-anchor="middle">dbo.sku</text>
<text class="cap" x="398" y="198" font-size="10">родитель: PRIMARY KEY (skuid)</text>
<text class="cap" x="398" y="213" font-size="10">на него ссылаются все трое</text>

<text class="cap" x="26" y="236" font-size="10.5" font-weight="600">две стороны одного и того же ключа</text>
${panels}

<text class="cap" x="26" y="374" font-size="10.5" font-weight="600">удалять без каскадов приходится от листьев к корню:</text>
${chain}

<line x1="26" y1="434" x2="674" y2="434" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="456" font-size="11">Ссылаться можно только на PRIMARY KEY или UNIQUE родителя: на неуникальное сослаться нельзя, ошибка 42830.</text>
<text class="cap" x="26" y="476" font-size="11">Сервер валится на первом же найденном конфликте — остальные ты увидишь только когда разберёшься с этим.</text>
`);
}

/* ---------------------------------------------------------------- d7.07 */

// Счётчик как отдельный объект рядом с таблицей: вставка, где про колонку не
// сказали ни слова, идёт к нему за числом. Схема нужна, чтобы автоинкремент
// перестал быть магией внутри колонки и стал видимой вещью с именем, стартом
// и шагом, которая умеет ровно одно — отдать следующее число.
function buildIdentityCounter() {
  const S = "identity-counter";

  // кусок объявления, x, ширина подчёркивания, тон, подпись
  const parts = [
    ["wavekey int", 26, 92, "m", "имя и тип"],
    ["GENERATED BY DEFAULT AS IDENTITY", 134, 270, "a", "новое здесь только это"],
    ["PRIMARY KEY", 419, 92, "m", "знакомое ограничение"],
  ];
  const dissect = parts.map(([txt, x, w, tone, label]) =>
    `<text class="mono" x="${x}" y="104" font-size="14">${txt}</text>
<rect class="seg-${tone}" x="${x}" y="112" width="${w}" height="4" rx="2"/>
<text class="cap ${tone === "a" ? "t-accent" : ""}" x="${x}" y="130" font-size="10.5">${label}</text>`).join("\n");

  return svgWrap("0 0 700 456", S, "За колонкой стоит отдельный счётчик", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .seg-a { fill: var(--accent); }
.dg-${S} .seg-m { fill: var(--line); }
.dg-${S} .step { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .counter { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .frame { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .flow { fill: none; stroke: var(--muted); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">За автоинкрементной колонкой стоит отдельный маленький объект — счётчик</text>
<text class="cap" x="26" y="50" font-size="10.5">Он умеет ровно одно: отдать следующее число и никогда не отдать одно и то же дважды</text>

<text class="cap" x="26" y="78" font-size="10">объявление колонки, разобранное по частям:</text>
${dissect}

<text class="cap" x="26" y="158" font-size="10.5" font-weight="600">что происходит при вставке, где про колонку не сказали ни слова</text>
<rect class="step" x="26" y="172" width="196" height="96" rx="10"/>
<text class="cap" x="42" y="192" font-size="10" font-weight="600">1. вставка без wavekey</text>
<text class="mono" x="42" y="216" font-size="9.5">INSERT INTO dbo.wave_draft</text>
<text class="mono" x="42" y="232" font-size="9.5">(descr) VALUES ('Волна утро')</text>
<text class="cap" x="42" y="254" font-size="10">про ключ не сказано ни слова</text>
<line class="flow" x1="226" y1="220" x2="248" y2="220" marker-end="url(#${S}-arrow)"/>

<rect class="counter" x="254" y="172" width="204" height="96" rx="10"/>
<text class="cap" x="270" y="192" font-size="10" font-weight="600">2. колонка идёт к счётчику</text>
<text class="mono" x="270" y="212" font-size="10">wave_draft_wavekey_seq</text>
<text class="cap" x="270" y="228" font-size="9.5">START WITH 1, INCREMENT BY 1</text>
<text class="mono t-accent" x="270" y="252" font-size="16" font-weight="700">1 → 2</text>
<text class="cap" x="338" y="252" font-size="9">отдал 1 и передвинулся</text>
<line class="flow" x1="462" y1="220" x2="484" y2="220" marker-end="url(#${S}-arrow)"/>

<rect class="step" x="490" y="172" width="184" height="96" rx="10"/>
<text class="cap" x="506" y="192" font-size="10" font-weight="600">3. в строку легло</text>
<text class="mono" x="506" y="224" font-size="15" font-weight="700">wavekey = 1</text>
<text class="cap" x="506" y="246" font-size="10">это число уже никогда</text>
<text class="cap" x="506" y="260" font-size="10">не будет выдано второй раз</text>

<text class="cap" x="26" y="290" font-size="10.5" font-weight="600">старт и шаг настраиваются</text>
<rect class="frame" x="26" y="300" width="648" height="62" rx="9"/>
<text class="mono" x="42" y="324" font-size="11">palletkey int GENERATED BY DEFAULT AS IDENTITY (START WITH 4000 INCREMENT BY 5)</text>
<text class="cap" x="42" y="346" font-size="10.5">в T-SQL это две цифры в скобках — IDENTITY(4000,5); первые три вставки дадут 4000, 4005, 4010</text>

<line x1="26" y1="384" x2="674" y2="384" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="406" font-size="11">Счётчик — не абстракция, а объект в базе: у него есть имя, которое сервер придумал сам, старт и шаг.</text>
<text class="cap" x="26" y="426" font-size="11">Всё, что он умеет, — отдать следующее число. Больше он не умеет ничего, и это стоит запомнить дословно.</text>
<text class="cap" x="26" y="446" font-size="11">Про колонку не сказали ни слова — значение берётся у него. Сказали своё — сервер возьмёт твоё.</text>
`);
}

// Три вставки, из которых средняя откачена, и две дорожки под ними: строки
// таблицы и счётчик. Схема нужна ради одной строчки: откат достаёт до таблицы
// и не достаёт до счётчика, поэтому уникальность есть, а непрерывности нет.
function buildSeqOutsideTx() {
  const S = "seq-outside-tx";
  const CX = (i) => 146 + i * 132;
  const CWD = 124;

  // команда (до трёх строк), что отдал счётчик, приписка, что стало в таблице, тон строки
  const steps = [
    [["INSERT", "'Волна утро'"], "1", "", "1  Волна утро", "ok"],
    [["SAVEPOINT s;", "INSERT", "'отменённая'"], "2", "", "2  отменённая", "flat"],
    [["ROLLBACK TO", "SAVEPOINT s;"], "—", "остался на 2", "её больше нет", "bad"],
    [["INSERT", "'Волна вечер'"], "3", "", "3  Волна вечер", "ok"],
  ];

  const body = steps.map(([cmd, got, note, inTable, tone], i) => {
    const x = CX(i);
    const cmdSvg = cmd.map((c, k) => `<text class="mono" x="${x + 12}" y="${116 + k * 16}" font-size="9.5">${c}</text>`).join("\n");
    return `<rect class="step" x="${x}" y="96" width="${CWD}" height="64" rx="8"/>
${cmdSvg}
<rect class="seq" x="${x}" y="170" width="${CWD}" height="44" rx="8"/>
<text class="mono t-accent" x="${x + CWD / 2}" y="${note ? 192 : 198}" font-size="16" font-weight="700" text-anchor="middle">${got}</text>
${note ? `<text class="cap" x="${x + CWD / 2}" y="206" font-size="9.5" text-anchor="middle">${note}</text>` : ""}
<rect class="tbl-${tone}" x="${x}" y="224" width="${CWD}" height="46" rx="8"/>
<text class="mono ${tone === "bad" ? "t-bad" : "cap"}" x="${x + CWD / 2}" y="252" font-size="10.5" text-anchor="middle">${inTable}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 496", S, "Откат достаёт до строк и не достаёт до счётчика", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .step { fill: var(--sunk); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .seq { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.3; }
.dg-${S} .tbl-ok { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .tbl-flat { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .tbl-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 4 3; }
.dg-${S} .panel { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .DEMO_PROJECT { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; stroke-dasharray: 4 3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Автонумерация гарантирует уникальность и не гарантирует непрерывность</text>
<text class="cap" x="26" y="50" font-size="10.5">Один прогон, три вставки, средняя отменена — и посмотри, что стало с номерами</text>

<text class="cap" x="26" y="132" font-size="10" font-weight="600">что выполнили</text>
<text class="cap" x="26" y="186" font-size="10" font-weight="600">счётчик отдал</text>
<text class="cap t-accent" x="26" y="200" font-size="9.5">живёт вне транзакции</text>
<text class="cap" x="26" y="242" font-size="10" font-weight="600">что стало в таблице</text>
<text class="cap" x="26" y="256" font-size="9.5">откат сюда достаёт</text>
${body}

<rect class="panel" x="26" y="296" width="314" height="106" rx="10"/>
<text class="cap" x="42" y="316" font-size="10" font-weight="600">SELECT wavekey, descr FROM dbo.wave_draft</text>
<text class="mono" x="42" y="338" font-size="11">1   Волна утро</text>
<rect class="DEMO_PROJECT" x="40" y="344" width="220" height="20" rx="5"/>
<text class="cap t-gold" x="50" y="358" font-size="10">двойки нет — номер потрачен</text>
<text class="mono" x="42" y="384" font-size="11">3   Волна вечер</text>

<rect class="panel" x="360" y="296" width="314" height="106" rx="10"/>
<text class="cap" x="376" y="316" font-size="10" font-weight="600">почему двойка не вернулась</text>
<text class="cap" x="376" y="338" font-size="10.5">средняя вставка сходила к счётчику,</text>
<text class="cap" x="376" y="354" font-size="10.5">он отдал двойку и передвинулся;</text>
<text class="cap" x="376" y="370" font-size="10.5">ROLLBACK отменил строку, но не счётчик —</text>
<text class="cap" x="376" y="386" font-size="10.5">номер назад не принимается никогда</text>

<line x1="26" y1="422" x2="674" y2="422" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="444" font-size="11">Это не недоделка: если бы счётчик откатывался, все писатели вставали бы в очередь по одному.</text>
<text class="cap" x="26" y="464" font-size="11">Сервер выбирает скорость — номер выдаётся мгновенно, никого не блокируя. Плата за это — дырки.</text>
<text class="cap" x="26" y="484" font-size="11">Отсюда правило: max(orderkey) — это номер последнего заказа, а вовсе не количество заказов.</text>
`);
}

/* ---------------------------------------------------------------- d7.08 */

// Где лежит временная таблица и сколько живёт. Схема нужна ради двух вещей:
// отдельной базы под временные объекты в PostgreSQL нет — у каждой сессии своя
// схема pg_temp_N внутри той же базы; а в задачнике таблица живёт ровно один
// прогон, потому что DDL там транзакционен и откатывается вместе со всем.
function buildTempLife() {
  const S = "temp-life";

  // заголовок отсека, что внутри, подпись
  const boxes = [
    [46, 170, "dbo", ["sku", "stock", "loc"], "постоянные таблицы, видны всем", false],
    [246, 194, "pg_temp_7", ["free_by_zone_draft"], "схема сессии 1 — видит только она", true],
    [460, 194, "pg_temp_12", ["free_by_zone_draft"], "схема сессии 2 — видит только она", true],
  ];
  const inner = boxes.map(([x, w, name, items, note, temp]) => {
    // одиночную строку подвинем к середине отсека, чтобы низ не пустовал
    const y0 = 136 + (3 - items.length) * 11;
    const rows = items.map((t, i) => `<rect class="tbl" x="${x + 14}" y="${y0 + i * 22}" width="${w - 28}" height="18" rx="5"/>
<text class="mono" x="${x + 22}" y="${y0 + 13 + i * 22}" font-size="9.5">${t}</text>`).join("\n");
    return `<rect class="${temp ? "schema-tmp" : "schema"}" x="${x}" y="104" width="${w}" height="120" rx="9"/>
<text class="mono ${temp ? "t-accent" : ""}" x="${x + 14}" y="126" font-size="12" font-weight="700">${name}</text>
${rows}
<text class="cap" x="${x + 14}" y="216" font-size="9">${note}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 440", S, "Где лежит временная таблица и сколько живёт", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .db { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .schema { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .schema-tmp { fill: var(--paper); stroke: var(--accent); stroke-width: 1.4; stroke-dasharray: 5 4; }
.dg-${S} .tbl { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .live { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .gone { fill: none; stroke: var(--bad); stroke-width: 1.2; stroke-dasharray: 5 4; }
.dg-${S} .axis { stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Временная таблица лежит не в dbo, а в собственной схеме сессии</text>
<text class="cap" x="26" y="50" font-size="10.5">Слово «временная» — не про черновой характер данных, а ровно про срок жизни</text>

<rect class="db" x="26" y="76" width="648" height="160" rx="10"/>
<text class="cap" x="42" y="94" font-size="10" font-weight="600">одна и та же база: отдельной базы под временные объекты в PostgreSQL нет</text>
${inner}

<text class="cap" x="26" y="264" font-size="10.5" font-weight="600">сколько она живёт в задачнике: ровно один прогон</text>
<rect class="live" x="60" y="276" width="380" height="18" rx="6"/>
<text class="cap t-accent" x="250" y="289" font-size="10" text-anchor="middle">таблица существует</text>
<rect class="gone" x="448" y="276" width="226" height="18" rx="6"/>
<text class="cap t-bad" x="561" y="289" font-size="10" text-anchor="middle">имени нет: 42P01</text>
<line class="axis" x1="60" y1="306" x2="674" y2="306"/>
<line class="axis" x1="60" y1="302" x2="60" y2="310"/>
<line class="axis" x1="444" y1="302" x2="444" y2="310"/>
<text class="cap" x="60" y="322" font-size="10">CREATE TEMP TABLE, INSERT, SELECT</text>
<text class="cap" x="444" y="322" font-size="10">конец прогона: откат</text>
<text class="cap" x="26" y="344" font-size="10.5">В PostgreSQL транзакционен и DDL, поэтому таблица откатывается вместе со всем остальным.</text>

<line x1="26" y1="364" x2="674" y2="364" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="386" font-size="11">Отдельной базы под временные объекты нет: каждая сессия получает свою схему pg_temp_N внутри той же базы.</text>
<text class="cap" x="26" y="406" font-size="11">Номер в имени — номер обслуживающего процесса, у соседа он другой: одинаковые имена столкнуться не могут.</text>
<text class="cap" x="26" y="426" font-size="11">Создал, наполнил, прочитал — всё в одном окне: нажал «выполнить» второй раз, и база опять чистая.</text>
`);
}

// Три сущности T-SQL, которые все называют «временной таблицей», в одной
// таблице сравнения. Схема нужна, чтобы стало видно главное различие — не
// синтаксис, а область видимости, поведение при откате и статистика,
// из-за которой @t на больших объёмах уезжает с секунды на десятки минут.
function buildTsqlTempScope() {
  const S = "tsql-temp-scope";
  const CX = [176, 346, 516], CW = [162, 162, 158];

  const head = [["#free", "локальная"], ["##free", "глобальная"], ["@free", "табличная переменная"]];

  // подпись строки и три ячейки: [строки текста, тон]
  const rows = [
    ["как объявляют",
      [["CREATE TABLE #free"], "mono"], [["CREATE TABLE ##free"], "mono"], [["DECLARE @free TABLE"], "mono"]],
    ["кто её видит",
      [["своя сессия и все", "вложенные вызовы"], ""], [["все сессии", "экземпляра целиком"], "bad"], [["только свой пакет", "или процедура"], ""]],
    ["когда умирает",
      [["конец сессии или выход", "из процедуры"], ""], [["создатель отключился и", "дочитал последний запрос"], ""], [["конец пакета", "или процедуры"], ""]],
    ["что делает ROLLBACK",
      [["откатывает данные"], ""], [["откатывает данные"], ""], [["ничего: данные остаются"], "gold"]],
    ["статистика",
      [["есть"], ""], [["есть"], ""], [["нет, совсем"], "bad"]],
    ["можно ли индексировать",
      [["да, CREATE INDEX", "после наполнения"], ""], [["да, точно так же"], ""], [["только inline", "в DECLARE"], "gold"]],
  ];

  const body = rows.map(([label, ...cells], i) => {
    const top = 118 + i * 38;
    const cellsSvg = cells.map(([lines, tone], k) => {
      const cls = tone === "mono" ? "mono" : `cap ${tone ? "t-" + tone : ""}`;
      const size = tone === "mono" ? 9.5 : 10;
      const txt = lines.length === 2
        ? `<text class="${cls}" x="${CX[k] + 14}" y="${top + 15}" font-size="${size}">${lines[0]}</text>
<text class="${cls}" x="${CX[k] + 14}" y="${top + 28}" font-size="${size}">${lines[1]}</text>`
        : `<text class="${cls}" x="${CX[k] + 14}" y="${top + 22}" font-size="${size}">${lines[0]}</text>`;
      return `<rect class="${tone && tone !== "mono" ? "cell-" + tone : "cell"}" x="${CX[k]}" y="${top}" width="${CW[k]}" height="34" rx="7"/>
${txt}`;
    }).join("\n");
    return `<text class="cap" x="26" y="${top + 22}" font-size="10" font-weight="600">${label}</text>
${cellsSvg}`;
  }).join("\n");

  const heads = head.map(([nm, sub], k) => `<text class="mono" x="${CX[k]}" y="94" font-size="15" font-weight="700">${nm}</text>
<text class="cap" x="${CX[k]}" y="110" font-size="9.5">${sub}</text>`).join("\n");

  return svgWrap("0 0 700 476", S, "Три сущности T-SQL вместо одной временной таблицы", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .cell { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .cell-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; }
.dg-${S} .cell-gold { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; }
.dg-${S} .warn { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.3; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">В T-SQL вместо одной временной таблицы три разные сущности</text>
<text class="cap" x="26" y="50" font-size="10.5">Различать их надо твёрдо: это половина ответа на «в процедуре тормозит, а руками летает»</text>

<text class="cap" x="26" y="94" font-size="10" font-weight="600">что сравниваем</text>
${heads}
${body}

<rect class="warn" x="26" y="358" width="648" height="46" rx="9"/>
<text class="t-gold" x="42" y="378" font-size="11" font-weight="700">Симптом, который надо запомнить уже сейчас</text>
<text class="cap" x="42" y="395" font-size="10.5">в плане у чтения @t Estimated Rows = 1, а Actual Rows — тысячи: статистики нет, и перекос данных не виден</text>

<line x1="26" y1="424" x2="674" y2="424" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="446" font-size="11">Локальная #t видна своей сессии и всем вложенным вызовам, глобальная ##t — всем сессиям экземпляра сразу.</text>
<text class="cap" x="26" y="466" font-size="11">##t в рабочем коде почти всегда признак того, что архитектуру пора пересмотреть: применений мало, граблей много.</text>
`);
}

/* ---------------------------------------------------------------- d7.09 */

// Что легло в базу при CREATE VIEW и что происходит при обращении к нему.
// Схема нужна ради двух мыслей: представление не хранит данных вообще, а при
// чтении имя разворачивается в сохранённый текст — и внешнее условие уезжает
// внутрь, на настоящую таблицу.
function buildViewExpand() {
  const S = "view-expand";

  const stored = [
    ["ok", "текст запроса лёг в служебные таблицы"],
    ["ok", "проверено, что таблицы и колонки есть"],
    ["zero", "строк данных прочитано: ни одной"],
    ["zero", "байт на диске занято: ноль"],
  ];
  const storedSvg = stored.map(([kind, t], i) => {
    const y = 110 + i * 21;
    const mark = kind === "ok" ? checkIcon(376, y - 10, 13)
      : `<rect class="zero" x="376" y="${y - 10}" width="13" height="13" rx="4"/>
<text class="mono t-gold" x="382.5" y="${y}" font-size="9" text-anchor="middle">0</text>`;
    return `${mark}
<text class="cap" x="400" y="${y}" font-size="10.5">${t}</text>`;
  }).join("\n");

  const plan = [
    ["SELECT s.skuid, k.descr, s.loc, s.lot, s.qty - s.qtyallocated", false],
    ["FROM dbo.stock AS s", false],
    ["JOIN dbo.sku AS k ON k.skuid = s.skuid", false],
    ["JOIN dbo.loc AS l ON l.loc = s.loc", false],
    ["WHERE l.zone = 'PICK' AND s.qty - s.qtyallocated > 0", true],
  ];
  const planSvg = plan.map(([t, hot], i) =>
    `<text class="mono ${hot ? "t-accent" : ""}" x="42" y="${348 + i * 16}" font-size="10.5" font-weight="${hot ? 700 : 400}">${t}</text>`).join("\n");

  return svgWrap("0 0 700 524", S, "Представление — это именованный запрос, а не данные", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .panel { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .code { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .plan { fill: var(--sunk); stroke: var(--accent); stroke-width: 1.4; }
.dg-${S} .zero { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.1; }
.dg-${S} .flow { fill: none; stroke: var(--muted); stroke-width: 1.4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Представление — это именованный запрос, сохранённый в базе</text>
<text class="cap" x="26" y="50" font-size="10.5">В момент CREATE VIEW сервер запомнил текст. Ни одной строки данных он при этом не прочитал</text>

<rect class="code" x="26" y="76" width="314" height="108" rx="9"/>
<text class="mono" x="42" y="96" font-size="10.5" font-weight="700">CREATE VIEW dbo.v_stock_free AS</text>
<text class="mono" x="42" y="116" font-size="9.5">SELECT s.skuid, k.descr, l.zone, s.loc, s.lot,</text>
<text class="mono" xml:space="preserve" x="42" y="131" font-size="9.5">       s.qty - s.qtyallocated AS qty_free</text>
<text class="mono" x="42" y="146" font-size="9.5">FROM dbo.stock AS s</text>
<text class="mono" x="42" y="161" font-size="9.5">JOIN dbo.sku AS k ON … JOIN dbo.loc AS l ON …</text>

<rect class="panel" x="360" y="76" width="314" height="108" rx="9"/>
<text class="cap" x="376" y="93" font-size="10.5" font-weight="600">что при этом легло в базу</text>
${storedSvg}

<text class="cap" x="26" y="206" font-size="10.5" font-weight="600">что происходит, когда к представлению обращаются</text>
<rect class="code" x="26" y="220" width="648" height="62" rx="9"/>
<text class="cap" x="42" y="237" font-size="10">что ты написал</text>
<text class="mono" x="42" y="256" font-size="11">SELECT skuid, descr, loc, lot, qty_free FROM dbo.v_stock_free</text>
<text class="mono" x="42" y="272" font-size="11">WHERE zone = 'PICK' AND qty_free &gt; 0</text>
<path class="flow" d="M60,286 L60,306" marker-end="url(#${S}-arrow)"/>
<text class="cap" x="78" y="302" font-size="10.5">оптимизатор подставляет вместо имени сохранённый текст и планирует один общий запрос</text>

<rect class="plan" x="26" y="312" width="648" height="114" rx="9"/>
<text class="cap" x="42" y="330" font-size="10">что на самом деле поехало к таблицам</text>
${planSvg}
<text class="cap t-accent" x="26" y="448" font-size="10.5">Внешние условия уехали внутрь: zone = 'PICK' отработало на таблице loc, а не поверх готового результата.</text>

<line x1="26" y1="468" x2="674" y2="468" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="490" font-size="11">CREATE VIEW не читает данные и никуда их не копирует: в базу ложится текст запроса и проверка, что имена есть.</text>
<text class="cap" x="26" y="510" font-size="11">CTE живёт ровно один оператор, а представление лежит в базе, пока его не удалят, и доступно всем, у кого есть права.</text>
`);
}

// Три способа хранить один и тот же агрегат: обычное представление, материа-
// лизованное в PostgreSQL и индексированное в SQL Server. Схема нужна ради
// фразы, которую спрашивают на собеседовании: у Microsoft всегда свежее и
// дорогое на запись, у PostgreSQL дешёвое на запись и устаревающее.
function buildViewVsMatview() {
  const S = "view-vs-matview";
  const CX = [172, 344, 516], CW = [164, 164, 158];
  const heads = [["VIEW", "оба диалекта"], ["MATERIALIZED VIEW", "только PostgreSQL"], ["indexed view", "только SQL Server"]];

  // подпись строки и три ячейки: [строки, тон]
  const rows = [
    ["что лежит на диске",
      [["ничего,", "ноль байт"], ""], [["посчитанный результат,", "8192 байта"], ""], [["результат внутри", "кластерного индекса"], ""]],
    ["свежесть данных",
      [["всегда свежее"], "ok"], [["снимок: устаревает", "молча, без ошибок"], "bad"], [["всегда свежее"], "ok"]],
    ["кто обновляет",
      [["нечего обновлять"], ""], [["ты сам: REFRESH", "MATERIALIZED VIEW"], "gold"], [["сервер, в той же", "транзакции"], ""]],
    ["чем за это платишь",
      [["каждый SELECT", "считает заново"], ""], [["ничем при записи —", "только свежестью"], ""], [["запись в базовые", "таблицы дорожает"], ""]],
  ];

  const body = rows.map(([label, ...cells], i) => {
    const top = 118 + i * 42;
    const cellsSvg = cells.map(([lines, tone], k) => {
      const cls = `cap ${tone ? "t-" + tone : ""}`;
      const txt = lines.length === 2
        ? `<text class="${cls}" x="${CX[k] + 12}" y="${top + 16}" font-size="10">${lines[0]}</text>
<text class="${cls}" x="${CX[k] + 12}" y="${top + 30}" font-size="10">${lines[1]}</text>`
        : `<text class="${cls}" x="${CX[k] + 12}" y="${top + 23}" font-size="10">${lines[0]}</text>`;
      return `<rect class="${tone ? "cell-" + tone : "cell"}" x="${CX[k]}" y="${top}" width="${CW[k]}" height="38" rx="7"/>
${txt}`;
    }).join("\n");
    return `<text class="cap" x="26" y="${top + 23}" font-size="10" font-weight="600">${label}</text>
${cellsSvg}`;
  }).join("\n");

  const headSvg = heads.map(([nm, sub], k) => `<text class="mono" x="${CX[k]}" y="92" font-size="12.5" font-weight="700">${nm}</text>
<text class="cap" x="${CX[k]}" y="108" font-size="9.5">${sub}</text>`).join("\n");

  const demo = [["462.000", "ok", "увидел сразу"], ["362.000", "bad", "снимок не двинулся"], ["462.000", "ok", "поправился сам"]];
  const demoSvg = demo.map(([v, tone, note], k) => `<rect class="cell-${tone}" x="${CX[k]}" y="314" width="${CW[k]}" height="48" rx="8"/>
<text class="mono t-${tone}" x="${CX[k] + 12}" y="338" font-size="14" font-weight="700">${v}</text>
<text class="cap" x="${CX[k] + 12}" y="354" font-size="10">${note}</text>`).join("\n");

  return svgWrap("0 0 700 458", S, "Представление, материализованное и индексированное", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .t-gold { fill: var(--gold); }
.dg-${S} .cell { fill: var(--paper); stroke: var(--line); stroke-width: 1.1; }
.dg-${S} .cell-ok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.2; }
.dg-${S} .cell-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.2; }
.dg-${S} .cell-gold { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Тело запроса одно и то же. Разница — лежат ли где-то посчитанные строки</text>
<text class="cap" x="26" y="50" font-size="10.5">Один агрегат по зонам, три способа его держать — и три разные цены</text>

<text class="cap" x="26" y="92" font-size="10" font-weight="600">что сравниваем</text>
${headSvg}
${body}

<text class="cap" x="26" y="304" font-size="10.5" font-weight="600">после UPDATE dbo.stock SET qty = qty + 100 WHERE skuid = 'SUGAR-1KG' — что покажет зона PICK</text>
${demoSvg}

<line x1="26" y1="382" x2="674" y2="382" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="404" font-size="11">Обычное представление — ноль байт: каждый SELECT разворачивается в запрос к настоящим таблицам.</text>
<text class="cap" x="26" y="424" font-size="11">У Microsoft всегда свежее и дорогое на запись, у PostgreSQL дешёвое на запись и устаревающее.</text>
<text class="cap" x="26" y="444" font-size="11">Свежесть материализованного — твоя обязанность: нет джоба с REFRESH — нет и свежих данных.</text>
`);
}

/* ---------------------------------------------------------------- d7.10 */

// Схема как три разные вещи сразу: пространство имён, единица группировки и
// единица прав. Схема нужна, чтобы «кусок имени слева от точки» перестал быть
// формальностью: в разных схемах спокойно живут два stock, а права выдаются
// на схему целиком — одной командой вместо сорока.
function buildSchemaBox() {
  const S = "schema-box";

  // имя схемы, x, ширина, что внутри, подпись
  const schemas = [
    ["dbo", 44, 148, ["stock", "sku"], "боевые данные"],
    ["stage", 204, 148, ["stock", "stock_load"], "загрузка"],
    ["archive", 364, 148, ["orders"], "история"],
    ["public", 524, 132, ["(пусто)"], "общая"],
  ];
  const boxes = schemas.map(([name, x, w, items, note]) => {
    // одноимённые stock в dbo и stage подсвечены: это и есть пространство имён
    const rows = items.map((t, i) => `<rect class="${t === "stock" ? "tbl-hot" : "tbl"}" x="${x + 12}" y="${128 + i * 22}" width="${w - 24}" height="18" rx="5"/>
<text class="mono ${t === "stock" ? "t-accent" : ""}" x="${x + 20}" y="${141 + i * 22}" font-size="9.5">${t}</text>`).join("\n");
    return `<rect class="schema" x="${x}" y="104" width="${w}" height="86" rx="9"/>
<text class="mono" x="${x + 12}" y="122" font-size="11.5" font-weight="700">${name}</text>
${rows}
<text class="cap" x="${x + 12}" y="183" font-size="9">${note}</text>`;
  }).join("\n");

  // заголовок свойства и его строки
  const props = [
    ["пространство имён", 26, 210, [
      "внутри одной схемы двух таблиц",
      "с именем stock быть не может;",
      "в двух разных — сколько угодно.",
      "",
      "dbo.stock и stage.stock — разные",
      "объекты: разные колонки, разные",
      "данные, и конфликта нет.",
    ]],
    ["единица группировки", 246, 210, [
      "имя читается как оглавление:",
      "archive.orders — это история,",
      "stage.stock_load — времянка",
      "под загрузку.",
      "",
      "Техники за этим нет, это чистая",
      "договорённость между людьми.",
    ]],
    ["единица прав", 466, 208, [
      "права выдаются не только на",
      "таблицу, но и на схему целиком.",
      "",
      "Это единственный способ сказать",
      "«пусти аналитика во всю",
      "отчётность» одной командой,",
      "а не сорока.",
    ]],
  ];
  const panels = props.map(([title, x, w, lines]) =>
    `<rect class="panel" x="${x}" y="222" width="${w}" height="134" rx="10"/>
<text x="${x + 14}" y="242" font-size="11" font-weight="600">${title}</text>
${lines.map((l, i) => l ? `<text class="cap" x="${x + 14}" y="${262 + i * 14}" font-size="9.5">${l}</text>` : "").join("\n")}`).join("\n");

  return svgWrap("0 0 700 494", S, "У схемы три отдельных свойства", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .db { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .schema { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .tbl { fill: var(--sunk); stroke: var(--line-soft); stroke-width: 1; }
.dg-${S} .tbl-hot { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.2; }
.dg-${S} .panel { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .acl { fill: var(--sunk); stroke: var(--line); stroke-width: 1.2; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Схема — не просто кусок имени слева от точки</text>
<text class="cap" x="26" y="50" font-size="10.5">У неё три отдельных свойства, и каждое работает само по себе</text>

<rect class="db" x="26" y="76" width="648" height="126" rx="10"/>
<text class="cap" x="42" y="94" font-size="10" font-weight="600">одна база, четыре раздела внутри неё — на учебной их два: dbo с семью таблицами и пустой public</text>
${boxes}
${panels}

<rect class="acl" x="26" y="370" width="648" height="54" rx="9"/>
<text class="mono" x="42" y="392" font-size="11">dbo | {demo_user=UC/demo_user,arena_learn=UC/demo_user}</text>
<text class="cap" x="42" y="412" font-size="10">слева от знака равенства — кому выдано, справа — что, после косой черты — кто выдал; U = USAGE, C = CREATE</text>

<line x1="26" y1="442" x2="674" y2="442" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="464" font-size="11">Внутри одной схемы двух таблиц с одним именем быть не может, в разных — сколько угодно: полные имена разные.</text>
<text class="cap" x="26" y="484" font-size="11">Права выдаются и на схему целиком: одна команда вместо сорока отдельных GRANT на каждую таблицу.</text>
`);
}

// Голое имя, идущее по search_path слева направо, и три остановки на этом пути.
// Схема нужна ради того, что поиск обрывается на первой схеме, где имя нашлось:
// ошибки «имя неоднозначно» не будет, и настоящая таблица просто останется
// непроверенной — вместе со всеми своими двенадцатью строками.
function buildSearchPathRace() {
  const S = "search-path-race";

  // имя схемы, x, ширина, две строки подписи, состояние
  const stops = [
    ["pg_catalog", 150, 150, ["имени sku здесь нет", "идём дальше"], "miss"],
    ["public", 334, 150, ["нашлось: public.sku", "поиск остановился"], "hit"],
    ["dbo", 518, 156, ["здесь настоящий справочник", "но сюда уже не пошли"], "skip"],
  ];
  const stopsSvg = stops.map(([name, x, w, lines, st]) => {
    const cls = st === "hit" ? "stop-hit" : st === "skip" ? "stop-skip" : "stop";
    const mark = st === "hit" ? checkIcon(x + w - 30, 118, 14)
      : st === "miss" ? crossIcon(x + w - 30, 118, 14) : "";
    return `<rect class="${cls}" x="${x}" y="110" width="${w}" height="52" rx="9"/>
<text class="mono ${st === "hit" ? "t-accent" : st === "skip" ? "cap" : ""}" x="${x + 14}" y="130" font-size="12" font-weight="700">${name}</text>
${mark}
<text class="cap" x="${x + 14}" y="145" font-size="9.5">${lines[0]}</text>
<text class="cap" x="${x + 14}" y="157" font-size="9.5">${lines[1]}</text>`;
  }).join("\n");

  const runs = [
    ["SELECT count(*) FROM sku", "1", "bad", "это public.sku — подсунутая строка"],
    ["SELECT count(*) FROM dbo.sku", "12", "ok", "настоящий справочник, все двенадцать"],
  ];
  const runsSvg = runs.map(([q, n, tone, note], i) => {
    const x = 26 + i * 334;
    return `<rect class="run-${tone}" x="${x}" y="220" width="314" height="90" rx="10"/>
<text class="mono" x="${x + 16}" y="244" font-size="11">${q}</text>
<text class="mono t-${tone}" x="${x + 16}" y="280" font-size="22" font-weight="700">${n}</text>
<text class="cap" x="${x + 16}" y="298" font-size="10">${note}</text>`;
  }).join("\n");

  return svgWrap("0 0 700 406", S, "Побеждает первая схема пути, где имя нашлось", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .t-accent { fill: var(--accent); }
.dg-${S} .t-ok { fill: var(--ok); }
.dg-${S} .t-bad { fill: var(--bad); }
.dg-${S} .token { fill: var(--sunk); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .stop { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .stop-hit { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .stop-skip { fill: var(--paper); stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 4 3; }
.dg-${S} .run-ok { fill: var(--ok-soft); stroke: var(--ok); stroke-width: 1.3; }
.dg-${S} .run-bad { fill: var(--bad-soft); stroke: var(--bad); stroke-width: 1.3; }
.dg-${S} .flow { stroke: var(--muted); stroke-width: 1.3; }
.dg-${S} .dead { stroke: var(--line-soft); stroke-width: 1.1; stroke-dasharray: 3 4; }
</style>

<text class="cap" x="26" y="30" font-size="11.5" font-weight="600">Побеждает первая схема пути, в которой имя нашлось</text>
<text class="cap" x="26" y="50" font-size="10.5">Поиск на этом останавливается: остальные схемы даже не проверяются, и ошибки «имя неоднозначно» не будет</text>

<text class="mono" x="26" y="76" font-size="11">SET search_path TO public, dbo;</text>
<text class="cap" x="26" y="94" font-size="10">полный путь, каким его видит сервер: {pg_catalog, public, dbo} — сервер идёт по нему слева направо</text>
<rect class="token" x="26" y="118" width="90" height="36" rx="8"/>
<text class="mono" x="71" y="141" font-size="11.5" text-anchor="middle">FROM sku</text>
<line class="flow" x1="120" y1="136" x2="146" y2="136" marker-end="url(#${S}-arrow)"/>
<line class="flow" x1="304" y1="136" x2="330" y2="136" marker-end="url(#${S}-arrow)"/>
<line class="dead" x1="488" y1="136" x2="514" y2="136"/>
${stopsSvg}

<text class="cap" x="26" y="200" font-size="10.5" font-weight="600">один и тот же прогон, одна и та же база — разница в четырёх символах текста</text>
${runsSvg}

<line x1="26" y1="330" x2="674" y2="330" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="352" font-size="11">pg_catalog в путь не писали, но он там есть и стоит первым: подменить count своей функцией не выйдет.</text>
<text class="cap" x="26" y="372" font-size="11">Ошибки «имя неоднозначно» не будет: сервер не считает совпадение проблемой и молча берёт первое.</text>
<text class="cap" x="26" y="392" font-size="11">Голое имя — это вопрос к пути. Написал схему явно — вопроса нет, и запрос перестаёт зависеть от настройки.</text>
`);
}

/* ---------------------------------------------------------------- реестр */

export const REGISTRY = {
  "num-exact-vs-approx": {
    id: "num-exact-vs-approx",
    title: "Точный тип и приблизительный хранят 0.1 по-разному",
    caption: "Слева numeric держит десятичные цифры и считает по разрядам, справа double precision держит ближайшую двоичную дробь. Оттуда и «0.1 + 0.2 = 0.3 → false», и шесть рублей, пропавших в отчёте.",
    anchor: "Что здесь произошло",
    svg: buildNumExactVsApprox(),
  },
  "num-precision-scale": {
    id: "num-precision-scale",
    title: "Точность и масштаб в numeric(12,3)",
    caption: "Двенадцать клеток под значащие цифры, три из них после запятой. Переполнение справа сервер гасит округлением и молчит, переполнение слева роняет запрос с 22003.",
    anchor: "Что значит numeric(12,3)",
    svg: buildNumPrecisionScale(),
  },
  "collate-source": {
    id: "collate-source",
    title: "Правило сравнения строк приезжает из коллации",
    caption: "Коллацию выбирают при создании базы, колонка её наследует, а запрос ею пользуется. Она же решает и «что меньше» для ORDER BY, и «равно ли» для = и GROUP BY.",
    anchor: "Что здесь произошло",
    svg: buildCollateSource(),
  },
  "date-four-questions": {
    id: "date-four-questions",
    title: "Четыре вопроса, на которые отвечает «дата»",
    caption: "День, время суток, пара «день плюс время» и момент на планете — четыре разных вопроса и четыре разных типа в каждом диалекте. Слово timestamp в T-SQL в этот ряд не входит.",
    anchor: "Четыре разных вопроса, четыре разных типа",
    svg: buildDateFourQuestions(),
  },
  "tz-wall-vs-moment": {
    id: "tz-wall-vs-moment",
    title: "Часы на стене и момент на планете",
    caption: "Одно записанное значение читают две сессии с разными поясами. timestamp не двигается никогда, а timestamptz печатается часами того, кто смотрит, — вплоть до смены календарного дня.",
    anchor: "Часы на стене и момент на планете",
    svg: buildTzWallVsMoment(),
  },
  "uuid-vs-identity": {
    id: "uuid-vs-identity",
    title: "Счётчик кладёт строку в конец индекса, uuid — куда попало",
    caption: "Сверху: вставили 1-2-3-4, а в индексе легло 2-4-3-1. Снизу — во что это обходится страницам: счётчик всегда пишет в одну горячую страницу, случайный uuid рвёт пополам чужие.",
    anchor: "Ключ, который выдают не спрашивая базу",
    svg: buildUuidVsIdentity(),
  },
  "json-vs-jsonb": {
    id: "json-vs-jsonb",
    title: "json хранит текст, jsonb хранит дерево",
    caption: "Один литерал с двумя пробелами и повторённым ключом. json кладёт его символ в символ, jsonb разбирает в структуру и выбрасывает всё, что не несёт смысла.",
    anchor: "JSON: в PostgreSQL два типа, в SQL Server ни одного",
    svg: buildJsonVsJsonb(),
  },
  "ddl-column": {
    id: "ddl-column",
    title: "Из чего собрано объявление колонки",
    caption: "Одна строка CREATE TABLE распадается на четыре части: имя, тип, признак NULL/NOT NULL и надстройку. Первые две обязательны всегда, третью стоит писать явно каждый раз.",
    anchor: "Что здесь произошло",
    svg: buildDdlColumn(),
  },
  "ctas-loss": {
    id: "ctas-loss",
    title: "Что теряет копия, снятая через CREATE TABLE AS SELECT",
    caption: "Слева то, что переехало: имена, типы, данные. Справа то, что осталось в оригинале, — все правила разом. Снизу проверка руками: в копию проходит и дубль ключа, и строка из одних NULL.",
    anchor: "Копия таблицы одной строкой — и что в ней теряется",
    svg: buildCtasLoss(),
  },
  "constraint-gate": {
    id: "constraint-gate",
    title: "Правило в коде и то же правило в схеме",
    caption: "Сверху проверка живёт в методе приложения — и три пути из четырёх идут мимо неё. Снизу та же проверка стоит в схеме таблицы, и мимо неё пути нет ни у кого.",
    anchor: "Что здесь произошло",
    svg: buildConstraintGate(),
  },
  "fk-tree": {
    id: "fk-tree",
    title: "Внешний ключ караулит с двух сторон",
    caption: "Дерево ссылок вокруг справочника товаров: со стороны ребёнка ключ не даёт появиться сироте, со стороны родителя — удалить того, на кого ссылаются. Отсюда и порядок удаления от листьев к корню.",
    anchor: "FOREIGN KEY: ссылка, за которой кто-то стоит",
    svg: buildFkTree(),
  },
  "identity-counter": {
    id: "identity-counter",
    title: "За колонкой стоит отдельный счётчик",
    caption: "Автоинкремент — не магия внутри колонки, а отдельный объект базы с именем, стартом и шагом. Вставка, где про колонку не сказали ни слова, идёт к нему за следующим числом.",
    anchor: "Что здесь произошло",
    svg: buildIdentityCounter(),
  },
  "seq-outside-tx": {
    id: "seq-outside-tx",
    title: "Откат достаёт до строк и не достаёт до счётчика",
    caption: "Три вставки, средняя отменена. Строка исчезла, а выданный ей номер остался потраченным: счётчик живёт вне транзакции, и откат до него не дотягивается.",
    anchor: "Уникальность есть, непрерывности нет",
    svg: buildSeqOutsideTx(),
  },
  "temp-life": {
    id: "temp-life",
    title: "Где лежит временная таблица и сколько живёт",
    caption: "Отдельной базы под временные объекты в PostgreSQL нет: каждая сессия получает свою схему pg_temp_N внутри той же базы. А в задачнике таблица живёт ровно один прогон.",
    anchor: "Что здесь произошло",
    svg: buildTempLife(),
  },
  "tsql-temp-scope": {
    id: "tsql-temp-scope",
    title: "Три сущности T-SQL вместо одной временной таблицы",
    caption: "#t, ##t и @t различаются не синтаксисом, а областью видимости, поведением при откате и наличием статистики — из-за последней @t на больших объёмах и уезжает с секунды на десятки минут.",
    anchor: "То же самое в SQL Server: вместо одной сущности три",
    svg: buildTsqlTempScope(),
  },
  "view-expand": {
    id: "view-expand",
    title: "Представление — это именованный запрос, а не данные",
    caption: "CREATE VIEW кладёт в базу текст запроса и ноль байт данных. При обращении имя разворачивается в этот текст, и внешнее условие уезжает внутрь — на настоящую таблицу.",
    anchor: "Что здесь произошло",
    svg: buildViewExpand(),
  },
  "view-vs-matview": {
    id: "view-vs-matview",
    title: "Представление, материализованное и индексированное",
    caption: "Один агрегат, три способа его держать. У Microsoft всегда свежее и дорогое на запись, у PostgreSQL дешёвое на запись и устаревающее, а за свежесть отвечает DBA.",
    anchor: "Материализованное представление: тот случай, когда данные всё-таки лежат",
    svg: buildViewVsMatview(),
  },
  "schema-box": {
    id: "schema-box",
    title: "У схемы три отдельных свойства",
    caption: "Схема — это пространство имён, единица группировки и единица прав сразу. В разных схемах спокойно живут два stock, а права выдаются на схему целиком — одной командой вместо сорока.",
    anchor: "Что здесь произошло",
    svg: buildSchemaBox(),
  },
  "search-path-race": {
    id: "search-path-race",
    title: "Побеждает первая схема пути, где имя нашлось",
    caption: "Голое имя идёт по search_path слева направо и останавливается на первом совпадении. Настоящий справочник остаётся непроверенным, а ошибки «имя неоднозначно» не будет.",
    anchor: "`search_path` вглубь: кто побеждает, когда имён два",
    svg: buildSearchPathRace(),
  },
};

// Привязка схем к нодам: код ноды -> список id.
export const INDEX = {
  "d7.01": ["num-exact-vs-approx", "num-precision-scale"],
  "d7.02": ["collate-source"],
  "d7.03": ["date-four-questions", "tz-wall-vs-moment"],
  "d7.04": ["uuid-vs-identity", "json-vs-jsonb"],
  "d7.05": ["ddl-column", "ctas-loss"],
  "d7.06": ["constraint-gate", "fk-tree"],
  "d7.07": ["identity-counter", "seq-outside-tx"],
  "d7.08": ["temp-life", "tsql-temp-scope"],
  "d7.09": ["view-expand", "view-vs-matview"],
  "d7.10": ["schema-box", "search-path-race"],
};
