// diagrams.js
// Библиотека наглядных SVG-схем для учебных статей по Java.
//
// Самодостаточный ES-модуль: без импортов, без внешних зависимостей.
// Вызывающая сторона (см. static/site/js/article.js) оборачивает каждую
// схему в свою карточку (.figure / .fig-title / figcaption), поэтому сами
// SVG ниже не рисуют внешний фон и не дублируют заголовок — только контент
// схемы. Цвета — исключительно через CSS-переменные страницы:
//   --ink --muted --line --accent --paper --ok --bad --gold
// Никаких хардкод-хексов, никакого JS-рантайма внутри схем — только
// декларативный SVG + необязательный :hover в собственном <style>.

// Схемы раздела DBA живут отдельным файлом: этот и так за четыре тысячи строк.
// Зависимость односторонняя — оттуда сюда ничего не импортируется.
import { SQL_INDEX, SQL_REGISTRY } from "./diagrams-sql.js";

/* ---------------------------------------------------------------- хелперы */

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Обёртка <svg>: единые атрибуты отзывчивости + скрытый accessible-title.
// slug используется как префикс класса корневой группы стилизации (см. ниже)
// и НЕ используется как префикс id маркеров — те префиксуются отдельно на
// месте объявления, чтобы префикс всегда был виден рядом с самим id.
function svgWrap(viewBox, slug, title, inner) {
  return `<svg viewBox="${viewBox}" width="100%" height="auto" preserveAspectRatio="xMidYMid meet" class="dg-${slug}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
${inner}
</svg>`;
}

// Однотипные наконечники стрелок (обычный + акцентный), id уже
// префиксован слагом схемы — уникален в пределах всего файла.
function arrowDefs(slug) {
  return `<marker id="${slug}-arrow" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--muted)"/></marker>
<marker id="${slug}-arrow-accent" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--accent)"/></marker>`;
}

// Мелкие значки "галочка"/"крест" путями (не эмодзи, не текстовые глифы).
function checkIcon(x, y, s, cls) {
  const a = (x + s * 0.02).toFixed(1), b = (y + s * 0.55).toFixed(1);
  const c = (x + s * 0.4).toFixed(1), d = (y + s * 0.86).toFixed(1);
  const e = (x + s * 0.98).toFixed(1), f = (y + s * 0.16).toFixed(1);
  return `<path class="${cls || ""}" d="M${a},${b} L${c},${d} L${e},${f}" fill="none" stroke="var(--ok)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function crossIcon(x, y, s, cls) {
  const x1 = x.toFixed(1), y1 = y.toFixed(1), x2 = (x + s).toFixed(1), y2 = (y + s).toFixed(1);
  return `<path class="${cls || ""}" d="M${x1},${y1} L${x2},${y2} M${x2},${y1} L${x1},${y2}" fill="none" stroke="var(--bad)" stroke-width="1.8" stroke-linecap="round"/>`;
}

/* ---------------------------------------------------------------- 2.01 */

// Переменная как коробка с именем: тип на крышке, имя на боку, значение внутри.
// Отдельно показан, что присваивание не добавляет, а затирает — это то место,
// где новичок думает, что старое где-то сохранилось.
function buildVarBox() {
  const S = "var-box";
  return svgWrap("0 0 700 320", S, "Переменная: имя, тип и значение", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.4; }
.dg-${S} .val { fill: var(--paper); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .gone { fill: var(--muted); opacity: .5; }
.dg-${S} .lead { stroke: var(--line); stroke-width: 1; stroke-dasharray: 3 3; }
</style>

<text class="mono" x="40" y="46" font-size="17" font-weight="700">int</text>
<text class="mono" x="86" y="46" font-size="17" font-weight="700">count</text>
<text class="mono" x="176" y="46" font-size="17" font-weight="700">=</text>
<text class="mono" x="204" y="46" font-size="17" font-weight="700">3;</text>

<line class="lead" x1="52" y1="56" x2="52" y2="86"/>
<line class="lead" x1="118" y1="56" x2="118" y2="112"/>
<line class="lead" x1="182" y1="56" x2="182" y2="140"/>
<line class="lead" x1="212" y1="56" x2="212" y2="86"/>

<text class="cap" x="52" y="100" font-size="11.5" text-anchor="middle">тип</text>
<text class="cap" x="52" y="114" font-size="11" text-anchor="middle">что можно класть</text>
<text class="cap" x="118" y="126" font-size="11.5" text-anchor="middle">имя</text>
<text class="cap" x="212" y="100" font-size="11.5" text-anchor="middle">значение</text>
<text class="cap" x="182" y="154" font-size="11.5" text-anchor="middle">положить справа налево</text>

<rect class="box" x="392" y="34" width="220" height="104" rx="12"/>
<text class="cap mono" x="408" y="56" font-size="12">count</text>
<rect class="val" x="470" y="62" width="64" height="52" rx="10"/>
<text class="mono" x="502" y="96" font-size="22" font-weight="700" text-anchor="middle">3</text>
<text class="cap" x="502" y="130" font-size="11" text-anchor="middle">целые числа, и только</text>

<line x1="242" y1="86" x2="384" y2="86" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${S}-arrow-accent)"/>

<line x1="30" y1="182" x2="670" y2="182" stroke="var(--line)" stroke-width="1"/>
<text class="mono" x="40" y="216" font-size="15" font-weight="700">count = 25;</text>
<text class="cap" x="40" y="238" font-size="11.5">то же место, новое значение</text>

<rect class="box" x="392" y="196" width="220" height="104" rx="12"/>
<text class="cap mono" x="408" y="218" font-size="12">count</text>
<rect class="val" x="470" y="224" width="64" height="52" rx="10"/>
<text class="mono" x="502" y="258" font-size="22" font-weight="700" text-anchor="middle">25</text>
<text class="mono gone" x="330" y="258" font-size="20" font-weight="700" text-anchor="middle">3</text>
<line class="lead" x1="306" y1="250" x2="354" y2="250" stroke="var(--muted)"/>
<text class="cap" x="330" y="278" font-size="11" text-anchor="middle">старое стёрлось</text>
<text class="cap" x="330" y="292" font-size="11" text-anchor="middle">насовсем</text>
<line x1="242" y1="248" x2="384" y2="248" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${S}-arrow-accent)"/>`);
}

/* ---------------------------------------------------------------- 2.02 */

// Четыре целых типа как вложенные коробки: каждая следующая вдвое шире по байтам
// и во много раз шире по диапазону. Главное, что должно остаться в голове —
// int это выбор по умолчанию, а не «средний из четырёх».
function buildIntSizes() {
  const S = "int-sizes";
  const row = (y, name, bytes, range, w, accent) => `
<rect class="bar${accent ? " on" : ""}" x="150" y="${y}" width="${w}" height="42" rx="9"/>
<text class="mono" x="140" y="${y + 27}" font-size="14" font-weight="700" text-anchor="end">${name}</text>
<text class="cap" x="164" y="${y + 26}" font-size="11.5">${bytes}</text>
<text class="cap mono" x="${150 + w + 12}" y="${y + 26}" font-size="11.5">${range}</text>`;
  return svgWrap("0 0 700 250", S, "Четыре целых типа и их диапазоны", `
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .bar { fill: var(--sunk, var(--paper)); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .bar.on { stroke: var(--accent); stroke-width: 1.8; }
</style>
${row(18, "byte", "1 байт", "-128 … 127", 60, false)}
${row(70, "short", "2 байта", "± 32 тысячи", 110, false)}
${row(122, "int", "4 байта", "± 2 миллиарда", 210, true)}
${row(174, "long", "8 байт", "± 9 квинтиллионов", 410, false)}
<text class="cap" x="150" y="234" font-size="11.5">каждый следующий вдвое больше по памяти, но в сотни раз по диапазону</text>
<text class="cap" x="590" y="150" font-size="11.5" fill="var(--accent)">берут по умолчанию</text>`);
}

/* ---------------------------------------------------------------- 2.03 */

// Почему 0.1 + 0.2 не равно 0.3. Показываем не «магию плавающей точки», а простую
// вещь: в память кладут НЕ те числа, которые ты написал, а ближайшие, которые
// вообще представимы. Сумма двух приближений промахивается мимо третьего.
// Все цифры настоящие: BigDecimal(double) на JDK 26.
function buildDoubleDrift() {
  const S = "double-drift";
  const row = (y, label, shown, real, mark) => `
<text class="mono" x="24" y="${y + 4}" font-size="14" font-weight="700">${label}</text>
<rect class="box" x="96" y="${y - 18}" width="86" height="30" rx="8"/>
<text class="mono" x="139" y="${y + 3}" font-size="14" text-anchor="middle">${shown}</text>
<text class="cap" x="196" y="${y + 3}" font-size="10.5">лежит в памяти</text>
<text class="mono real" x="286" y="${y + 3}" font-size="11.5">${real}</text>
${mark || ""}`;
  return svgWrap("0 0 700 260", S, "Почему 0.1 + 0.2 не равно 0.3", `
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .real { fill: var(--muted); }
.dg-${S} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .sum { fill: var(--paper); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .bad { fill: var(--bad); }
.dg-${S} .tail { fill: var(--bad); font-weight: 700; }
</style>

<text class="cap" x="24" y="24" font-size="11.5">ты написал десятичную дробь, а хранится ближайшая двоичная</text>

${row(62, "0.1", "0.1", "0.1000000000000000055511151231257827…")}
${row(104, "0.2", "0.2", "0.2000000000000000111022302462515654…")}

<line x1="24" y1="128" x2="676" y2="128" stroke="var(--line)" stroke-width="1"/>

<text class="mono" x="24" y="164" font-size="14" font-weight="700">сумма</text>
<rect class="sum" x="96" y="142" width="152" height="30" rx="8"/>
<text class="mono" x="172" y="163" font-size="14" text-anchor="middle">0.3000000000000000<tspan class="tail">4</tspan></text>
<text class="cap" x="262" y="163" font-size="10.5">две погрешности сложились</text>

<text class="mono" x="24" y="206" font-size="14" font-weight="700">0.3</text>
<rect class="box" x="96" y="184" width="86" height="30" rx="8"/>
<text class="mono" x="139" y="205" font-size="14" text-anchor="middle">0.3</text>
<text class="cap" x="196" y="205" font-size="10.5">лежит в памяти</text>
<text class="mono real" x="286" y="205" font-size="11.5">0.2999999999999999888977697537484…</text>

<text class="mono bad" x="24" y="242" font-size="13" font-weight="700">0.1 + 0.2 == 0.3  →  false</text>
<text class="cap" x="240" y="242" font-size="11.5">это разные числа, и Java не врёт, отвечая false</text>`);
}

/* ---------------------------------------------------------------- 2.04 */

// char это число с человеческим лицом. Главная мысль схемы: в памяти лежит номер,
// а буква появляется только при печати. Отсюда и 'A' + 'B' = 131, а не "AB".
function buildCharCode() {
  const S = "char-code";
  const cell = (x, ch, code, accent) => `
<rect class="cell${accent ? " on" : ""}" x="${x}" y="60" width="64" height="58" rx="10"/>
<text class="mono" x="${x + 32}" y="92" font-size="20" font-weight="700" text-anchor="middle">${ch}</text>
<text class="cap mono" x="${x + 32}" y="134" font-size="12.5" text-anchor="middle">${code}</text>`;
  return svgWrap("0 0 700 240", S, "char это номер, а не картинка", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .cell { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .cell.on { stroke: var(--accent); stroke-width: 1.8; }
.dg-${S} .box { fill: var(--paper); stroke: var(--accent); stroke-width: 1.6; }
.dg-${S} .bad { fill: var(--bad); }
</style>

<text class="cap" x="24" y="34" font-size="11.5">что ты пишешь</text>
<text class="cap" x="24" y="150" font-size="11.5">что лежит в памяти</text>

${cell(120, "'A'", "65", true)}
${cell(196, "'B'", "66", false)}
${cell(272, "'a'", "97", false)}
${cell(348, "'0'", "48", false)}
${cell(424, "'7'", "55", false)}
${cell(500, "'Я'", "1071", false)}

<text class="cap" x="24" y="196" font-size="11.5">поэтому это не склейка, а сложение чисел:</text>
<rect class="box" x="300" y="176" width="230" height="30" rx="9"/>
<text class="mono" x="415" y="197" font-size="14" text-anchor="middle">'A' + 'B'  →  131</text>
<text class="mono bad" x="546" y="197" font-size="13">не "AB"</text>`);
}

/* ---------------------------------------------------------------- 2.05 */

// Одно и то же число, записанное четырьмя способами. Главная мысль: запись это
// только форма для человека, в памяти лежит одно и то же значение. Плюс ловушка
// с ведущим нулём, на которой горят все.
function buildLiteralForms() {
  const S = "literal-forms";
  const form = (y, label, code, note, warn) => `
<text class="cap" x="24" y="${y + 4}" font-size="11.5">${label}</text>
<rect class="box${warn ? " warn" : ""}" x="150" y="${y - 18}" width="150" height="30" rx="8"/>
<text class="mono" x="225" y="${y + 3}" font-size="14" text-anchor="middle">${code}</text>
<text class="cap" x="316" y="${y + 3}" font-size="11">${note}</text>`;
  return svgWrap("0 0 700 250", S, "Одно число, четыре записи", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${S} .box.warn { stroke: var(--bad); stroke-dasharray: 4 3; }
.dg-${S} .val { fill: var(--paper); stroke: var(--accent); stroke-width: 1.8; }
.dg-${S} .bad { fill: var(--bad); }
</style>

${form(40, "десятичная", "255", "как пишут люди")}
${form(82, "шестнадцатеричная", "0xFF", "префикс 0x, цифры 0-9 и A-F")}
${form(124, "двоичная", "0b11111111", "префикс 0b, только нули и единицы")}

<rect class="val" x="480" y="34" width="150" height="120" rx="12"/>
<text class="cap" x="555" y="60" font-size="11" text-anchor="middle">в памяти</text>
<text class="mono" x="555" y="104" font-size="26" font-weight="700" text-anchor="middle">255</text>
<text class="cap" x="555" y="132" font-size="11" text-anchor="middle">одно и то же число</text>
<line x1="404" y1="94" x2="472" y2="94" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${S}-arrow-accent)"/>

<line x1="24" y1="176" x2="676" y2="176" stroke="var(--line)" stroke-width="1"/>
${form(206, "ведущий ноль", "010", "это НЕ десять", true)}
<text class="mono bad" x="480" y="209" font-size="15" font-weight="700">= 8</text>
<text class="cap" x="530" y="209" font-size="11">восьмеричная запись, наследие древности</text>`);
}

/* ---------------------------------------------------------------- 2.06 (второе) */

// Правило приведения при арифметике. Лестница рядом показывает, КУДА можно
// расширять, а эта схема — по какому правилу Java выбирает тип результата.
// Ключевое, на чём все спотыкаются: у арифметики есть нижняя граница в int,
// поэтому byte + byte это int, а float + float остаётся float.
function buildPromotionFloor() {
  const S = "promotion-floor";
  const rule = (y, cond, res, accent) => `
<rect class="row${accent ? " on" : ""}" x="24" y="${y - 18}" width="330" height="30" rx="8"/>
<text class="mono" x="40" y="${y + 2}" font-size="12.5">${cond}</text>
<text class="mono" x="372" y="${y + 2}" font-size="12.5" font-weight="700">${res}</text>`;
  const small = (x, name) => `
<rect class="tiny" x="${x}" y="176" width="72" height="34" rx="8"/>
<text class="mono" x="${x + 36}" y="197" font-size="12.5" text-anchor="middle">${name}</text>`;
  return svgWrap("0 0 700 260", S, "Какой тип получится при сложении", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .row { fill: var(--paper); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .row.on { stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .tiny { fill: var(--paper); stroke: var(--bad); stroke-width: 1.3; stroke-dasharray: 4 3; }
.dg-${S} .floor { fill: var(--paper); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .bad { fill: var(--bad); }
</style>

<text class="cap" x="24" y="26" font-size="11.5">берётся первое подходящее правило сверху</text>
${rule(56, "есть double", "double")}
${rule(94, "иначе есть float", "float", true)}
${rule(132, "иначе есть long", "long")}
${rule(170, "иначе", "int")}

<line x1="440" y1="24" x2="440" y2="200" stroke="var(--line)" stroke-width="1"/>

<text class="cap" x="468" y="40" font-size="11.5">а эти до сложения</text>
<text class="cap" x="468" y="56" font-size="11.5">поднимаются до int всегда:</text>
${small(468, "byte")}
${small(548, "short")}
${small(628, "char")}
<line x1="504" y1="172" x2="504" y2="150" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${S}-arrow-accent)"/>
<rect class="floor" x="468" y="106" width="152" height="34" rx="8"/>
<text class="mono" x="544" y="128" font-size="13" font-weight="700" text-anchor="middle">int</text>
<text class="cap bad" x="468" y="240" font-size="11.5">поэтому byte + byte это int,</text>
<text class="cap" x="468" y="256" font-size="11.5">а float + float остаётся float</text>`);
}

/* ---------------------------------------------------------------- 1.02 */

// Кто с кем разговаривает: телефон рисует, сервер знает. Между ними два шага —
// запрос и ответ. Намеренно без слов «HTTP», «API» и «клиент»: на этой ноде
// человек ещё не писал ни строчки, ему нужна картинка, а не словарь.
function buildFrontBack() {
  const S = "front-back";
  return svgWrap("0 0 700 300", S, "Как фронтенд и бекенд разговаривают", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.4; }
.dg-${S} .num { fill: var(--accent); font-weight: 700; }
</style>

<!-- телефон -->
<g>
  <rect class="box" x="16" y="54" width="130" height="200" rx="20"/>
  <rect x="61" y="66" width="40" height="5" rx="2.5" fill="var(--line)"/>
  <rect x="34" y="88" width="94" height="14" rx="4" fill="var(--line)" opacity=".55"/>
  <rect x="34" y="112" width="94" height="10" rx="3" fill="var(--line)" opacity=".35"/>
  <rect x="34" y="130" width="72" height="10" rx="3" fill="var(--line)" opacity=".35"/>
  <rect x="34" y="148" width="94" height="10" rx="3" fill="var(--line)" opacity=".35"/>
  <text x="81" y="196" font-size="13.5" font-weight="700" text-anchor="middle">фронтенд</text>
  <text class="cap" x="81" y="214" font-size="11" text-anchor="middle">то, что ты видишь</text>
</g>

<!-- бекенд: коробка, внутри которой живут и Java, и база -->
<g>
  <rect x="300" y="30" width="384" height="244" rx="18" fill="var(--paper)"
        stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="6 4" opacity=".95"/>
  <text x="318" y="54" font-size="13.5" font-weight="700" fill="var(--accent)">бекенд</text>

  <!-- программа на Java -->
  <rect class="box" x="322" y="78" width="152" height="104" rx="12"/>
  <text x="398" y="118" font-size="15" font-weight="700" text-anchor="middle">Java</text>
  <text class="cap" x="398" y="138" font-size="11" text-anchor="middle">принимает запрос</text>
  <text class="cap" x="398" y="154" font-size="11" text-anchor="middle">и решает, что отдать</text>

  <!-- база данных -->
  <g>
    <ellipse cx="588" cy="104" rx="44" ry="11" fill="var(--paper)" stroke="var(--line)" stroke-width="1.4"/>
    <path d="M544,104 v66 a44,11 0 0 0 88,0 v-66" fill="var(--paper)" stroke="var(--line)" stroke-width="1.4"/>
    <ellipse cx="588" cy="104" rx="44" ry="11" fill="none" stroke="var(--line)" stroke-width="1.4"/>
    <text class="cap" x="588" y="200" font-size="11" text-anchor="middle">база данных</text>
    <text class="cap" x="588" y="216" font-size="10.5" text-anchor="middle">тут лежат строки</text>
  </g>

  <!-- Java просит строки и получает их -->
  <text class="cap" x="509" y="114" font-size="10.5" text-anchor="middle">дай строки</text>
  <line x1="478" y1="124" x2="540" y2="124" stroke="var(--line)" stroke-width="1.4"
        marker-end="url(#${S}-arrow)"/>
  <text class="cap" x="509" y="150" font-size="10.5" text-anchor="middle">строки</text>
  <line x1="540" y1="160" x2="478" y2="160" stroke="var(--line)" stroke-width="1.4"
        marker-end="url(#${S}-arrow)"/>
</g>

<!-- запрос: телефон стучится прямо к программе -->
<g>
  <text class="num" x="152" y="100" font-size="12">1</text>
  <text class="mono" x="166" y="100" font-size="11.5" fill="var(--accent)">покажи операции</text>
  <line x1="150" y1="112" x2="316" y2="112" stroke="var(--accent)" stroke-width="1.6"
        marker-end="url(#${S}-arrow-accent)"/>
</g>

<!-- ответ -->
<g>
  <text class="num" x="152" y="180" font-size="12">2</text>
  <text class="mono" x="166" y="180" font-size="11.5">вот 12 платежей</text>
  <line x1="316" y1="192" x2="150" y2="192" stroke="var(--muted)" stroke-width="1.6"
        marker-end="url(#${S}-arrow)"/>
</g>
`);
}

/* ---------------------------------------------------------------- 1.03 */

// Три вещи одной картинкой: что такое байткод, кто его делает и зачем нужна
// прослойка в виде JVM. Главное здесь — что налево от .class всё происходит
// один раз, а направо повторяется на каждой машине своё.
function buildBytecodeJvm() {
  const S = "bytecode-jvm";
  const vm = (y, os) => `
<rect class="vm" x="556" y="${y}" width="132" height="58" rx="10"/>
<text class="mono" x="622" y="${y + 26}" font-size="13" text-anchor="middle" font-weight="700">JVM</text>
<text class="cap" x="622" y="${y + 44}" font-size="11" text-anchor="middle">${os}</text>`;
  return svgWrap("0 0 700 300", S, "От исходника к байткоду и в JVM", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.4; }
.dg-${S} .tool { fill: var(--paper); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .vm { fill: var(--paper); stroke: var(--muted); stroke-width: 1.3; }
.dg-${S} .thin { stroke: var(--line); stroke-width: 1.2; }
</style>

<rect class="box" x="14" y="110" width="130" height="84" rx="10"/>
<text class="mono" x="79" y="146" font-size="13" text-anchor="middle" font-weight="700">Hello.java</text>
<text class="cap" x="79" y="166" font-size="11" text-anchor="middle">текст, который</text>
<text class="cap" x="79" y="181" font-size="11" text-anchor="middle">написал ты</text>
<text class="cap" x="79" y="216" font-size="11" text-anchor="middle">читает человек</text>

<line x1="148" y1="152" x2="192" y2="152" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${S}-arrow-accent)"/>

<rect class="tool" x="198" y="120" width="110" height="64" rx="10"/>
<text class="mono" x="253" y="148" font-size="13" text-anchor="middle" font-weight="700">javac</text>
<text class="cap" x="253" y="167" font-size="11" text-anchor="middle">компилятор</text>
<text class="cap" x="253" y="216" font-size="11" text-anchor="middle">переводит один раз</text>

<line x1="312" y1="152" x2="356" y2="152" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${S}-arrow-accent)"/>

<rect class="box" x="362" y="110" width="132" height="84" rx="10"/>
<text class="mono" x="428" y="146" font-size="13" text-anchor="middle" font-weight="700">Hello.class</text>
<text class="cap" x="428" y="166" font-size="11" text-anchor="middle">байткод: команды</text>
<text class="cap" x="428" y="181" font-size="11" text-anchor="middle">для JVM</text>
<text class="cap" x="428" y="216" font-size="11" text-anchor="middle">человеку не читается</text>

<path class="thin" d="M498,152 C524,152 528,61 552,61" fill="none" marker-end="url(#${S}-arrow)"/>
<line class="thin" x1="498" y1="152" x2="552" y2="152" marker-end="url(#${S}-arrow)"/>
<path class="thin" d="M498,152 C524,152 528,243 552,243" fill="none" marker-end="url(#${S}-arrow)"/>

<text class="cap" x="688" y="20" font-size="11" text-anchor="end">один файл - разные машины</text>
${vm(32, "Windows")}
${vm(124, "macOS")}
${vm(216, "Linux")}`);
}

// Зачем вообще нужна стандартная библиотека. Слева одно и то же дело двумя
// путями: длинная возня руками против одной готовой команды.
function buildStdlibWhy() {
  const S = "stdlib-why";
  const step = (x, w, l1, l2) => `
<rect class="step" x="${x}" y="62" width="${w}" height="52" rx="9"/>
<text class="cap" x="${x + w / 2}" y="${l2 ? 86 : 92}" font-size="10.5" text-anchor="middle">${l1}</text>
${l2 ? `<text class="cap" x="${x + w / 2}" y="101" font-size="10.5" text-anchor="middle">${l2}</text>` : ""}`;
  const tick = (x) => `<line class="thin" x1="${x}" y1="88" x2="${x + 14}" y2="88" marker-end="url(#${S}-arrow)"/>`;
  return svgWrap("0 0 700 270", S, "Зачем нужна стандартная библиотека", `
<defs>${arrowDefs(S)}</defs>
<style>
.dg-${S} text { font-family: inherit; fill: var(--ink); }
.dg-${S} .cap { fill: var(--muted); }
.dg-${S} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${S} .step { fill: var(--sunk, var(--paper)); stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .ready { fill: var(--paper); stroke: var(--accent); stroke-width: 1.7; }
.dg-${S} .screen { fill: var(--paper); stroke: var(--line); stroke-width: 1.4; }
.dg-${S} .thin { stroke: var(--line); stroke-width: 1.2; }
.dg-${S} .side { font-weight: 700; }
</style>

<text class="side" x="14" y="34" font-size="12.5">Если бы готового не было</text>
<text class="cap" x="14" y="50" font-size="11">и это пришлось бы писать каждому, заново</text>
${step(14, 150, "найти, куда на этой", "системе вообще писать")}
${tick(166)}
${step(184, 140, "перевести буквы", "в числа")}
${tick(326)}
${step(344, 150, "попросить систему", "их отправить")}
${tick(496)}
${step(514, 172, "проверить, что", "ничего не потерялось")}

<line class="thin" x1="14" y1="146" x2="686" y2="146"/>

<text class="side" x="14" y="180" font-size="12.5">Как есть на самом деле</text>
<text class="cap" x="14" y="196" font-size="11">все эти шаги уже написаны и лежат рядом с Java</text>
<rect class="ready" x="14" y="208" width="330" height="46" rx="10"/>
<text class="mono" x="179" y="237" font-size="13" text-anchor="middle">System.out.println("Привет");</text>
<line x1="348" y1="231" x2="392" y2="231" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${S}-arrow-accent)"/>
<rect class="screen" x="398" y="204" width="288" height="54" rx="8"/>
<text class="mono" x="416" y="236" font-size="13">Привет</text>
<text class="cap" x="670" y="222" font-size="10.5" text-anchor="end">экран</text>`);
}

function buildJdkMatryoshka() {
  const slug = "jdk-matryoshka";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .ring { fill: var(--paper); transition: stroke-width .15s ease; }
.dg-${slug} .lvl:hover .ring { stroke-width: 2.4; }
.dg-${slug} .lvl:hover .lbl { fill: var(--accent); }
.dg-${slug} .chip { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
.dg-${slug} .lead { stroke: var(--line); stroke-width: 1; stroke-dasharray: 2.5 3; }
</style>
<g class="lvl" data-l="jdk">
  <rect class="ring" x="20" y="20" width="350" height="320" rx="18" stroke="var(--line)" stroke-width="1.4"/>
  <text class="lbl mono" x="42" y="48" font-size="15" font-weight="700">JDK</text>
  <text class="cap" x="42" y="65" font-size="11">комплект разработки</text>
  <rect class="chip" x="42" y="78" width="62" height="24" rx="12"/>
  <text class="mono" x="73" y="94" font-size="11" text-anchor="middle">javac</text>
  <rect class="chip" x="112" y="78" width="70" height="24" rx="12"/>
  <text class="mono" x="147" y="94" font-size="11" text-anchor="middle">jshell</text>
  <rect class="chip" x="190" y="78" width="62" height="24" rx="12"/>
  <text class="mono" x="221" y="94" font-size="11" text-anchor="middle">javap</text>
  <rect class="chip" x="260" y="78" width="46" height="24" rx="12"/>
  <text class="mono" x="283" y="94" font-size="11" text-anchor="middle">jar</text>
</g>
<g class="lvl" data-l="jre">
  <rect class="ring" x="54" y="108" width="282" height="222" rx="16" stroke="var(--muted)" stroke-width="1.4"/>
  <text class="lbl mono" x="76" y="136" font-size="15" font-weight="700">JRE</text>
  <text class="cap" x="76" y="153" font-size="11">среда выполнения</text>
  <text class="cap" x="76" y="300" font-size="11">стандартная библиотека классов</text>
  <text class="mono cap" x="76" y="316" font-size="11">System.out, String, ArrayList…</text>
</g>
<g class="lvl" data-l="jvm">
  <rect class="ring" x="94" y="170" width="202" height="112" rx="14" stroke="var(--accent)" stroke-width="1.6"/>
  <text class="lbl mono" x="195" y="210" font-size="15" font-weight="700" text-anchor="middle">JVM</text>
  <text class="cap" x="195" y="228" font-size="11" text-anchor="middle">исполнение байткода</text>
  <text class="cap" x="195" y="244" font-size="11" text-anchor="middle">память кучи и стека</text>
  <text class="cap" x="195" y="260" font-size="11" text-anchor="middle">сборка мусора (GC)</text>
</g>
<line class="lead" x1="370" y1="88" x2="410" y2="58"/>
<line class="lead" x1="336" y1="140" x2="410" y2="150"/>
<line class="lead" x1="296" y1="222" x2="410" y2="222"/>
<text x="414" y="30" font-size="11" class="cap">что доступно на уровне</text>
<text x="414" y="54" font-size="13" font-weight="700">разрабатывать</text>
<text x="414" y="70" font-size="11" class="cap">пишешь и компилируешь код</text>
<text x="414" y="144" font-size="13" font-weight="700">запускать</text>
<text x="414" y="160" font-size="11" class="cap">стартуешь готовую программу</text>
<text x="414" y="226" font-size="13" font-weight="700">исполнять байткод</text>
<text x="414" y="242" font-size="11" class="cap">JVM крутит инструкции построчно</text>`;
  return svgWrap("0 0 640 360", slug, "Матрёшка JDK, JRE и JVM", inner);
}

/* ---------------------------------------------------------------- 1.04 */

function buildCompilePipeline() {
  const slug = "compile-pipeline";
  const cy = 110; // общий вертикальный центр всех блоков и стрелок
  const cap = (x, t) => `<text class="cap" x="${x}" y="190" font-size="11" text-anchor="middle">${t}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; transition: stroke .15s ease; }
.dg-${slug} .step:hover .box { stroke: var(--accent); }
.dg-${slug} .chip { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
.dg-${slug} .pill { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
</style>
<g class="step">
  <rect class="box" x="14" y="50" width="120" height="120" rx="10"/>
  <path d="M52,66 L86,66 L100,80 L100,138 L52,138 Z" fill="var(--paper)" stroke="var(--muted)" stroke-width="1.2"/>
  <path d="M86,66 L100,80 L86,80 Z" fill="var(--paper)" stroke="var(--muted)" stroke-width="1"/>
  <rect x="60" y="94" width="30" height="3" rx="1.5" fill="var(--accent)"/>
  <rect x="60" y="103" width="22" height="3" rx="1.5" fill="var(--line)"/>
  <rect x="60" y="112" width="26" height="3" rx="1.5" fill="var(--line)"/>
  <text class="mono" x="74" y="155" font-size="12" font-weight="700" text-anchor="middle">Hello.java</text>
  <text class="cap" x="74" y="169" font-size="11" text-anchor="middle">текст</text>
</g>
${cap(74, "лежит на диске как текст")}

<line x1="134" y1="${cy}" x2="186" y2="${cy}" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<rect class="chip" x="138" y="96" width="44" height="26" rx="13"/>
<text class="mono" x="160" y="113" font-size="11" text-anchor="middle" font-weight="700">javac</text>

<g class="step">
  <rect class="box" x="186" y="50" width="120" height="120" rx="10"/>
  <path d="M224,66 L258,66 L272,80 L272,138 L224,138 Z" fill="var(--paper)" stroke="var(--gold)" stroke-width="1.2"/>
  <path d="M258,66 L272,80 L258,80 Z" fill="var(--paper)" stroke="var(--gold)" stroke-width="1"/>
  <rect x="232" y="93" width="4" height="4" fill="var(--gold)"/><rect x="239" y="93" width="4" height="4" fill="var(--line)"/><rect x="246" y="93" width="4" height="4" fill="var(--gold)"/><rect x="253" y="93" width="4" height="4" fill="var(--line)"/>
  <rect x="232" y="100" width="4" height="4" fill="var(--line)"/><rect x="239" y="100" width="4" height="4" fill="var(--gold)"/><rect x="246" y="100" width="4" height="4" fill="var(--line)"/><rect x="253" y="100" width="4" height="4" fill="var(--gold)"/>
  <rect x="232" y="107" width="4" height="4" fill="var(--gold)"/><rect x="239" y="107" width="4" height="4" fill="var(--gold)"/><rect x="246" y="107" width="4" height="4" fill="var(--line)"/><rect x="253" y="107" width="4" height="4" fill="var(--line)"/>
  <text class="mono" x="246" y="155" font-size="12" font-weight="700" text-anchor="middle">Hello.class</text>
  <text class="cap" x="246" y="169" font-size="11" text-anchor="middle">байткод</text>
</g>
${cap(246, "байткод на диске")}

<line x1="306" y1="${cy}" x2="358" y2="${cy}" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<rect class="chip" x="310" y="96" width="40" height="26" rx="13"/>
<text class="mono" x="330" y="113" font-size="11" text-anchor="middle" font-weight="700">java</text>

<g class="step">
  <rect class="box" x="358" y="40" width="190" height="140" rx="14" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="453" y="62" font-size="13" font-weight="700" text-anchor="middle">JVM</text>
  <rect class="pill" x="374" y="72" width="158" height="22" rx="11"/>
  <text class="cap" x="453" y="87" font-size="11" text-anchor="middle">загрузка классов</text>
  <path d="M453,94 L453,100" stroke="var(--line)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
  <rect class="pill" x="374" y="100" width="158" height="22" rx="11"/>
  <text class="cap" x="453" y="115" font-size="11" text-anchor="middle">верификация байткода</text>
  <path d="M453,122 L453,128" stroke="var(--line)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
  <rect class="pill" x="374" y="128" width="158" height="22" rx="11"/>
  <text class="cap" x="453" y="143" font-size="11" text-anchor="middle">исполнение байткода</text>
</g>
${cap(453, "существует только в памяти")}

<line x1="548" y1="${cy}" x2="580" y2="${cy}" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>

<g class="step">
  <rect class="box" x="580" y="50" width="100" height="120" rx="10"/>
  <rect x="600" y="66" width="60" height="42" rx="5" fill="var(--ink)" opacity="0.06"/>
  <rect x="600" y="66" width="60" height="42" rx="5" fill="none" stroke="var(--muted)" stroke-width="1.2"/>
  <path d="M600,71 Q600,66 605,66 L655,66 Q660,66 660,71 L660,73 L600,73 Z" fill="var(--muted)" opacity="0.5"/>
  <rect x="606" y="80" width="20" height="2.6" rx="1.3" fill="var(--accent)"/>
  <rect x="606" y="87" width="30" height="2.6" rx="1.3" fill="var(--muted)"/>
  <rect x="606" y="94" width="14" height="2.6" rx="1.3" fill="var(--muted)"/>
  <text class="mono" x="630" y="132" font-size="11" font-weight="700" text-anchor="middle">$ java Hello</text>
  <text class="cap" x="630" y="146" font-size="11" text-anchor="middle">вывод</text>
</g>
${cap(630, "текст в консоли")}`;
  return svgWrap("0 0 680 205", slug, "Путь программы: от исходника до вывода", inner);
}
/* ---------------------------------------------------------------- 1.07 */

function buildMainAnatomy() {
  const slug = "main-anatomy";
  const cb = (ax, bx, head, l1, l2) => `
<path d="M${ax},124 L${ax},150 L${bx},150 L${bx},186" fill="none" stroke="var(--line)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<circle cx="${ax}" cy="121" r="2.6" fill="var(--accent)"/>
<g class="box"><rect x="${bx - 70}" y="190" width="140" height="70" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/></g>
<text class="mono" x="${bx}" y="213" font-size="13" font-weight="700" text-anchor="middle">${head}</text>
<text class="cap" x="${bx}" y="231" font-size="11" text-anchor="middle">${l1}</text>
<text class="cap" x="${bx}" y="246" font-size="11" text-anchor="middle">${l2}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .box rect { transition: stroke .15s ease; }
.dg-${slug} .box:hover rect { stroke: var(--accent); }
</style>
<text x="310" y="26" font-size="11" text-anchor="middle" class="cap">файл Main.java → класс Main → метод main → тело { … }</text>
<text class="mono" font-size="15" font-weight="700" y="115">
<tspan x="139">public</tspan><tspan x="202">static</tspan><tspan x="265">void</tspan><tspan x="310">main</tspan><tspan x="346">(String[] args)</tspan>
</text>
${cb(165, 86, "public", "виден снаружи —", "JVM может его вызвать")}
${cb(229, 236, "static", "вызывается без", "создания объекта")}
${cb(283, 386, "void", "ничего не", "возвращает")}
${cb(413, 536, "String[] args", "аргументы", "командной строки")}`;
  return svgWrap("0 0 620 272", slug, "Анатомия public static void main", inner);
}

/* ---------------------------------------------------------------- 1.19 */

function buildErrorGates() {
  const slug = "error-gates";
  const gate = (gx, head, items, note, okChip) => {
    const n = items.length;
    const bullets = items.map((t, i) => `
<g transform="translate(${gx + 18},${86 + i * 24})">
${crossIcon(0, 0, 11)}
<text class="cap" x="18" y="9" font-size="11">${t}</text>
</g>`).join("");
    const dividerY = 86 + n * 24 - 6;
    const noteY = 86 + n * 24 + 12;
    const chipY = 86 + n * 24 + 20;
    return `
<rect x="${gx}" y="20" width="170" height="205" rx="12" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<path d="M${gx + 14},52 L${gx + 14},30 L${gx + 156},30 L${gx + 156},52" fill="none" stroke="var(--muted)" stroke-width="1.3"/>
<text x="${gx + 85}" y="70" font-size="13" font-weight="700" text-anchor="middle">${head}</text>
${bullets}
<line x1="${gx + 18}" y1="${dividerY}" x2="${gx + 152}" y2="${dividerY}" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="${gx + 85}" y="${noteY}" font-size="11" text-anchor="middle">${note}</text>
${okChip ? `<g transform="translate(${gx + 85 - 46},${chipY})">
<rect width="92" height="24" rx="12" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.2"/>
${checkIcon(12, 5, 13)}
<text x="52" y="16" font-size="11" text-anchor="middle" fill="var(--ok)">${okChip}</text>
</g>` : ""}`;
  };
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
</style>
<rect class="box" x="14" y="70" width="90" height="80" rx="10"/>
<text class="mono" x="59" y="114" font-size="11" text-anchor="middle">Hello.java</text>
<line x1="104" y1="110" x2="124" y2="110" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
${gate(124, "ворота javac", ["синтаксис", "типы", "несовместимость типов"], "нет ошибок —", "скомпилировалось")}
<line x1="294" y1="110" x2="314" y2="110" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<rect class="box" x="314" y="70" width="90" height="80" rx="10"/>
<text class="mono" x="359" y="114" font-size="11" text-anchor="middle">Hello.class</text>
<line x1="404" y1="110" x2="424" y2="110" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
${gate(424, "ловушки java", ["NullPointerException", "деление на ноль", "выход за границы массива"], "долетело сюда ≠", "")}
<line x1="594" y1="110" x2="614" y2="110" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<rect class="box" x="614" y="80" width="56" height="60" rx="10"/>
<text class="cap" x="642" y="114" font-size="11" text-anchor="middle">запуск</text>
<rect x="40" y="300" width="600" height="34" rx="10" fill="var(--paper)" stroke="var(--gold)" stroke-width="1.3"/>
<text x="340" y="322" font-size="13" font-weight="700" text-anchor="middle">«скомпилировалось» ≠ «работает»</text>`;
  return svgWrap("0 0 680 350", slug, "Где ловится какая ошибка", inner);
}

/* ---------------------------------------------------------------- 1.21 */

function buildStackTrace() {
  const slug = "stack-trace";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .jdkline { fill: var(--muted); }
</style>
<rect x="4" y="10" width="732" height="170" rx="12" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<circle cx="18" cy="46" r="3" fill="var(--ink)"/>
<text class="mono" x="30" y="50" font-size="12"><tspan fill="var(--ink)">Exception in thread "main" </tspan><tspan fill="var(--bad)" font-weight="700">java.lang.NumberFormatException</tspan><tspan fill="var(--ink)">: For input string: "12a"</tspan></text>

<line x1="18" y1="66" x2="18" y2="100" stroke="var(--muted)" stroke-width="1.2"/>
<text class="jdkline mono" x="48" y="76" font-size="12">at java.base/java.lang.NumberFormatException.forInputString(NumberFormatException.java:67)</text>
<text class="jdkline mono" x="48" y="100" font-size="12">at java.base/java.lang.Integer.parseInt(Integer.java:668)</text>

<rect x="38" y="112" width="560" height="20" rx="5" fill="var(--accent)" opacity="0.1"/>
<rect x="38" y="112" width="560" height="20" rx="5" fill="none" stroke="var(--accent)" stroke-width="1.2"/>
<path d="M13,118 L17,122 L21,113" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
<text class="mono" x="48" y="127" font-size="12" fill="var(--accent)" font-weight="700">at warehouse.OrderParser.readQty(OrderParser.java:22)</text>

<circle cx="18" cy="148" r="3" fill="var(--ink)"/>
<text class="mono" x="48" y="152" font-size="12">at warehouse.OrderParser.main(OrderParser.java:7)</text>

<g transform="translate(30,196)">
  <circle cx="4" cy="-3" r="3" fill="var(--ink)"/>
  <text class="cap" x="16" y="0" font-size="11">тип исключения и сообщение — что именно пошло не так</text>
</g>
<g transform="translate(30,216)">
  <line x1="4" y1="-10" x2="4" y2="3" stroke="var(--muted)" stroke-width="1.2"/>
  <text class="cap" x="16" y="0" font-size="11">код JDK — не твой баг, но полезно понимать механизм</text>
</g>
<g transform="translate(30,236)">
  <path d="M0,-3 L4,1 L8,-7" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <text class="cap" x="16" y="0" font-size="11" fill="var(--accent)">первая твоя строка — здесь и искать ошибку</text>
</g>
<g transform="translate(30,256)">
  <circle cx="4" cy="-3" r="3" fill="var(--ink)"/>
  <text class="cap" x="16" y="0" font-size="11">точка входа — main, глубже стека не будет</text>
</g>

<line x1="20" y1="288" x2="720" y2="288" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="306" font-size="11">стек фреймов и порядок печати трейса устроены зеркально:</text>

<g transform="translate(240,332)">
  <rect x="0" y="0" width="150" height="22" rx="5" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.2"/>
  <text class="mono cap" x="75" y="15" font-size="11" text-anchor="middle">forInputString</text>
  <rect x="0" y="26" width="150" height="22" rx="5" fill="var(--paper)" stroke="var(--line)" stroke-width="1.1"/>
  <text class="mono cap" x="75" y="41" font-size="11" text-anchor="middle">parseInt</text>
  <rect x="0" y="52" width="150" height="22" rx="5" fill="var(--paper)" stroke="var(--line)" stroke-width="1.1"/>
  <text class="mono cap" x="75" y="67" font-size="11" text-anchor="middle">readQty</text>
  <rect x="0" y="78" width="150" height="22" rx="5" fill="var(--paper)" stroke="var(--line)" stroke-width="1.1"/>
  <text class="mono cap" x="75" y="93" font-size="11" text-anchor="middle">main</text>
  <path d="M-24,100 L-24,0" fill="none" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
  <text class="cap" x="-24" y="-6" font-size="11" text-anchor="middle">растёт ↑</text>
  <path d="M190,0 L190,100" fill="none" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
  <text class="cap" x="190" y="114" font-size="11" text-anchor="middle">печать ↓</text>
</g>`;
  return svgWrap("0 0 740 470", slug, "Как читать stack trace", inner);
}
/* ---------------------------------------------------------------- 2.06 */

function buildWideningLadder() {
  const slug = "widening-ladder";
  const box = (x, w, name, bits) => `
<rect x="${x}" y="85" width="${w}" height="50" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="${x + w / 2}" y="109" font-size="13" font-weight="700" text-anchor="middle">${name}</text>
<text class="cap" x="${x + w / 2}" y="125" font-size="11" text-anchor="middle">${bits}</text>`;
  const arrow = (x1, x2) => `<line x1="${x1}" y1="110" x2="${x2}" y2="110" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
${box(230, 85, "char", "16 бит")}
<line x1="272" y1="60" x2="272" y2="85" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<rect x="230" y="20" width="85" height="40" rx="10" fill="var(--paper)" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="3 3"/>
<text class="mono" x="272" y="44" font-size="13" font-weight="700" text-anchor="middle">char</text>

${box(20, 85, "byte", "8 бит")}
${arrow(105, 125)}
${box(125, 85, "short", "16 бит")}
${arrow(210, 230)}
${box(230, 85, "int", "32 бита")}
${arrow(315, 335)}
${box(335, 85, "long", "64 бита")}
${arrow(420, 440)}
${box(440, 95, "float", "32 бита")}
${arrow(535, 555)}
${box(555, 95, "double", "64 бита")}

<path d="M602,135 C602,225 63,225 63,135" fill="none" stroke="var(--muted)" stroke-width="1.3" stroke-dasharray="4 4" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="333" y="222" font-size="11" text-anchor="middle">только явный каст — данные могут потеряться, например <tspan class="mono">(byte) x</tspan></text>

<rect x="20" y="248" width="640" height="46" rx="10" fill="var(--paper)" stroke="var(--gold)" stroke-width="1.3"/>
<text x="340" y="267" font-size="12" text-anchor="middle">всё, что меньше <tspan class="mono" font-weight="700">int</tspan>, поднимается до <tspan class="mono" font-weight="700">int</tspan> ДО вычисления</text>
<text x="340" y="284" font-size="12" text-anchor="middle" class="mono" font-weight="700">byte + byte → int, не byte</text>`;
  return svgWrap("0 0 680 304", slug, "Лестница расширения типов", inner);
}

/* ---------------------------------------------------------------- 2.07 */

function buildCastCut() {
  const slug = "cast-cut";
  const groupX = [40, 184, 328, 472];
  const groupBits = [
    ["0", "0", "0", "0", "0", "0", "0", "0"],
    ["0", "0", "0", "0", "0", "0", "0", "0"],
    ["0", "0", "0", "0", "0", "0", "0", "1"],
    ["0", "0", "1", "0", "1", "1", "0", "0"],
  ];
  const groupLabel = ["биты 31–24", "биты 23–16", "биты 15–8", "биты 7–0"];
  const cells = groupX.map((gx, gi) => {
    const dim = gi < 3;
    const cellsHtml = groupBits[gi].map((b, i) => `
<rect x="${gx + i * 17}" y="50" width="16" height="28" rx="3" fill="var(--paper)" stroke="var(--line)" stroke-width="1"/>
<text class="mono" x="${gx + i * 17 + 8}" y="69" font-size="11" text-anchor="middle">${b}</text>`).join("");
    return `<g ${dim ? 'opacity="0.4"' : ""}>${cellsHtml}</g>
<text class="cap" x="${gx + 60}" y="92" font-size="11" text-anchor="middle">${groupLabel[gi]}</text>`;
  }).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono cap" x="40" y="38" font-size="11">300 в 32-битном int:</text>
${cells}
<line x1="40" y1="64" x2="464" y2="64" stroke="var(--bad)" stroke-width="1.5"/>
<path d="M40,104 L40,110 L464,110 L464,104" fill="none" stroke="var(--bad)" stroke-width="1.2"/>
<text class="cap" x="252" y="124" font-size="11" text-anchor="middle" fill="var(--bad)">отрезается кастом (byte)</text>
<path d="M472,104 L472,110 L608,110 L608,104" fill="none" stroke="var(--accent)" stroke-width="1.2"/>
<text class="cap" x="540" y="124" font-size="11" text-anchor="middle" fill="var(--accent)">остаётся</text>
<rect x="224" y="134" width="200" height="28" rx="10" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.3"/>
<text class="mono" x="324" y="153" font-size="12" font-weight="700" text-anchor="middle" text-decoration="none">(byte) 300 → 44</text>

<line x1="20" y1="188" x2="660" y2="188" stroke="var(--line)" stroke-width="1"/>

<text class="mono" x="60" y="222" font-size="15" font-weight="700"><tspan fill="var(--ink)">(int) 9</tspan><tspan fill="var(--bad)" opacity="0.55" text-decoration="line-through">.99</tspan></text>
<line x1="185" y1="216" x2="225" y2="216" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<text class="mono" x="245" y="222" font-size="15" font-weight="700" fill="var(--accent)">9</text>
<text class="cap" x="300" y="222" font-size="11">— усечение: дробная часть просто отбрасывается, это не <tspan class="mono">Math.round</tspan></text>`;
  return svgWrap("0 0 680 248", slug, "Что отрезает каст", inner);
}

/* ---------------------------------------------------------------- 2.09 */

// Пять операторов над одной парой чисел. Первые три никого не удивляют, поэтому
// они нарисованы спокойно, а `/` и `%` подсвечены: именно на них ломается
// интуиция «деление даёт дробь». Пара 7 и 2 выбрана так, чтобы неполное частное
// и остаток были разными числами — иначе картинка ничего не доказывает.
function buildArithFive() {
  const slug = "arith-five";
  const cell = (x, sym, name, res, hot) => `
<rect class="op${hot ? " hot" : ""}" x="${x}" y="70" width="112" height="96" rx="12"/>
<text class="mono" x="${x + 56}" y="106" font-size="26" font-weight="700" text-anchor="middle" fill="${hot ? "var(--accent)" : "var(--ink)"}">${sym}</text>
<text class="cap" x="${x + 56}" y="126" font-size="10.5" text-anchor="middle">${name}</text>
<text class="mono" x="${x + 56}" y="154" font-size="19" font-weight="700" text-anchor="middle">${res}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .op { fill: var(--sunk, var(--paper)); stroke: var(--line); stroke-width: 1.3; }
.dg-${slug} .op.hot { stroke: var(--accent); stroke-width: 1.8; }
</style>
<text class="mono" x="30" y="40" font-size="17" font-weight="700">int a = 7;</text>
<text class="mono" x="150" y="40" font-size="17" font-weight="700">int b = 2;</text>
<text class="cap" x="300" y="40" font-size="11.5">одна пара чисел, пять действий</text>
${cell(30, "+", "сложение", "9", false)}
${cell(152, "−", "вычитание", "5", false)}
${cell(274, "*", "умножение", "14", false)}
${cell(396, "/", "неполное частное", "3", true)}
${cell(518, "%", "остаток", "1", true)}
<line x1="452" y1="182" x2="452" y2="200" stroke="var(--accent)" stroke-width="1.3"/>
<line x1="574" y1="182" x2="574" y2="200" stroke="var(--accent)" stroke-width="1.3"/>
<line x1="452" y1="200" x2="574" y2="200" stroke="var(--accent)" stroke-width="1.3"/>
<text class="cap" x="513" y="220" font-size="11.5" text-anchor="middle" fill="var(--accent)">целое ÷ целое = целое</text>
<text class="cap" x="513" y="236" font-size="11" text-anchor="middle">3 × 2 + 1 = 7 — ничего не потерялось</text>`;
  return svgWrap("0 0 660 250", slug, "Пять арифметических операторов над 7 и 2", inner);
}

/* ---------------------------------------------------------------- 2.10 */

// Деление с остатком как раскладка по полным ящикам. Главное, что должно остаться:
// частное и остаток — не два разных ответа на один вопрос, а две части одного
// разложения, которое всегда собирается обратно равенством 17 = 3·5 + 2.
function buildDivmodSplit() {
  const slug = "divmod-split";
  const unit = (x, y, hot) =>
    `<circle cx="${x}" cy="${y}" r="7.5" fill="${hot ? "var(--accent)" : "var(--paper)"}" stroke="${hot ? "var(--accent)" : "var(--line)"}" stroke-width="1.4"/>`;
  let groups = "";
  for (let g = 0; g < 3; g++) {
    const bx = 40 + g * 148;
    groups += `<rect x="${bx}" y="64" width="126" height="66" rx="10" fill="var(--sunk, var(--paper))" stroke="var(--line)" stroke-width="1.3"/>`;
    for (let k = 0; k < 5; k++) groups += unit(bx + 21 + k * 21, 97, false);
    groups += `<text class="cap" x="${bx + 63}" y="148" font-size="11" text-anchor="middle">полная пятёрка</text>`;
  }
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="40" y="38" font-size="17" font-weight="700">17</text>
<text class="cap" x="66" y="38" font-size="12">конфет раскладываем по пять</text>
${groups}
<rect x="484" y="64" width="72" height="66" rx="10" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="5 4"/>
${unit(506, 97, true)}${unit(534, 97, true)}
<text class="cap" x="520" y="148" font-size="11" text-anchor="middle" fill="var(--accent)">не влезло</text>

<line x1="40" y1="176" x2="556" y2="176" stroke="var(--line)" stroke-width="1"/>

<text class="mono" x="40" y="206" font-size="15" font-weight="700">17 / 5</text>
<line x1="112" y1="201" x2="146" y2="201" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<text class="mono" x="158" y="206" font-size="15" font-weight="700">3</text>
<text class="cap" x="180" y="206" font-size="11.5">сколько полных ящиков получилось</text>

<text class="mono" x="40" y="234" font-size="15" font-weight="700">17 % 5</text>
<line x1="112" y1="229" x2="146" y2="229" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<text class="mono" x="158" y="234" font-size="15" font-weight="700" fill="var(--accent)">2</text>
<text class="cap" x="180" y="234" font-size="11.5">сколько осталось лежать рядом</text>

<text class="mono cap" x="40" y="264" font-size="12.5">17 = 3 × 5 + 2</text>
<text class="cap" x="180" y="264" font-size="11.5">частное и остаток всегда собираются обратно</text>`;
  return svgWrap("0 0 600 280", slug, "Деление с остатком: 17 на 5", inner);
}

/* ---------------------------------------------------------------- 2.11 */

function buildIntOverflowRing() {
  const slug = "int-overflow-ring";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<path d="M254.0,60.6 A160,160 0 1 1 226.0,60.6" fill="none" stroke="var(--line)" stroke-width="1.6"/>
<line x1="400" y1="220" x2="384" y2="220" stroke="var(--line)" stroke-width="1.2"/>
<line x1="80" y1="220" x2="96" y2="220" stroke="var(--line)" stroke-width="1.2"/>

<path d="M226,60.6 Q240,18 254,60.6" fill="none" stroke="var(--bad)" stroke-width="1.6" marker-end="url(#${slug}-arrow-accent)"/>
<text x="240" y="30" font-size="12" font-weight="700" text-anchor="middle" fill="var(--bad)">+1</text>

<circle cx="226" cy="60.6" r="3.4" fill="var(--ink)"/>
<text class="mono" x="196" y="38" font-size="12" font-weight="700" text-anchor="end">MAX_VALUE</text>
<text class="mono cap" x="196" y="53" font-size="11" text-anchor="end">2147483647</text>

<circle cx="254" cy="60.6" r="3.4" fill="var(--ink)"/>
<text class="mono" x="284" y="38" font-size="12" font-weight="700">MIN_VALUE</text>
<text class="mono cap" x="284" y="53" font-size="11">-2147483648</text>

<circle cx="240" cy="380" r="3.4" fill="var(--ink)"/>
<text class="mono" x="240" y="404" font-size="13" font-weight="700" text-anchor="middle">0</text>
<text class="cap" x="240" y="420" font-size="11" text-anchor="middle">старт отсчёта</text>

<text class="cap" x="240" y="446" font-size="11" text-anchor="middle">переполнение — не ошибка: JVM молча заворачивает число</text>`;
  return svgWrap("0 0 480 460", slug, "Числовой круг int", inner);
}
/* ---------------------------------------------------------------- 2.12 */

// i++ против ++i. Обе ветки заканчиваются одинаково — переменная стала шестёркой,
// и это главное, что теряется при объяснении словами. Отличается только то, какое
// число ушло наружу, поэтому «отдано наружу» вынесено в отдельную колонку.
function buildIncrPrePost() {
  const slug = "incr-pre-post";
  const lane = (y, code, first, second, out, outAccent) => `
<rect x="26" y="${y}" width="120" height="46" rx="10" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono" x="86" y="${y + 29}" font-size="16" font-weight="700" text-anchor="middle">${code}</text>
<line x1="150" y1="${y + 23}" x2="184" y2="${y + 23}" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<rect x="188" y="${y}" width="176" height="46" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="cap" x="276" y="${y + 28}" font-size="11.5" text-anchor="middle">${first}</text>
<line x1="368" y1="${y + 23}" x2="402" y2="${y + 23}" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<rect x="406" y="${y}" width="176" height="46" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="cap" x="494" y="${y + 28}" font-size="11.5" text-anchor="middle">${second}</text>
<text class="mono" x="638" y="${y + 29}" font-size="20" font-weight="700" text-anchor="middle" fill="${outAccent ? "var(--accent)" : "var(--ink)"}">${out}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="26" y="26" font-size="14" font-weight="700">int i = 5;</text>
<text class="cap" x="638" y="26" font-size="11" text-anchor="middle">отдано наружу</text>
${lane(44, "i++", "отдать старое значение", "увеличить переменную", "5", true)}
${lane(112, "++i", "увеличить переменную", "отдать новое значение", "6", true)}
<line x1="26" y1="180" x2="700" y2="180" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="204" font-size="11.5">в переменной после обеих строк лежит</text>
<text class="mono" x="290" y="205" font-size="16" font-weight="700">6</text>
<text class="cap" x="312" y="204" font-size="11.5">— разница только в том, что ушло дальше по строке</text>`;
  return svgWrap("0 0 700 220", slug, "Постфиксный и префиксный инкремент", inner);
}

/* ---------------------------------------------------------------- 2.13 */

function buildExprOrder() {
  const slug = "expr-order";
  const node = (x, y, label, op) => `
<circle cx="${x}" cy="${y}" r="22" fill="var(--paper)" stroke="${op ? "var(--accent)" : "var(--line)"}" stroke-width="1.5"/>
<text class="mono" x="${x}" y="${y + 5}" font-size="14" font-weight="700" text-anchor="middle" fill="${op ? "var(--accent)" : "var(--ink)"}">${label}</text>`;
  const edge = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--muted)" stroke-width="1.2"/>`;
  const badge = (x, y, n) => `
<circle cx="${x}" cy="${y}" r="10" fill="var(--accent)"/>
<text x="${x}" y="${y + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--paper)">${n}</text>`;
  const row = (y, level, assoc, hi) => `
<rect x="380" y="${y}" width="300" height="36" rx="8" fill="${hi ? "var(--accent)" : "var(--paper)"}" fill-opacity="${hi ? 0.1 : 1}" stroke="${hi ? "var(--accent)" : "var(--line)"}" stroke-width="${hi ? 1.4 : 1.1}"/>
<text x="392" y="${y + 23}" font-size="12" class="mono">${level}</text>
<text x="668" y="${y + 23}" font-size="11" text-anchor="end" class="cap">${assoc}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="150" y="18" font-size="13" font-weight="700" text-anchor="middle">19 / 4 * 4 = 16</text>
${edge(150, 60, 90, 165)}
${edge(150, 60, 210, 165)}
${edge(90, 165, 50, 270)}
${edge(90, 165, 130, 270)}
${node(150, 60, "*", true)}
${node(90, 165, "/", true)}
${node(210, 165, "4", false)}
${node(50, 270, "19", false)}
${node(130, 270, "4", false)}
${badge(58, 128, "1")}
${badge(178, 35, "2")}
<text class="cap" x="90" y="204" font-size="11" text-anchor="middle" fill="var(--accent)">= 4</text>

<text x="380" y="14" font-size="11" class="cap">приоритет операторов</text>
${row(20, "унарные + − ! ~", "право → лево", false)}
${row(64, "* / %", "лево → право", true)}
${row(108, "+ −", "лево → право", false)}
${row(152, "&lt; &gt; &lt;= &gt;= == !=", "лево → право", false)}
${row(196, "&amp;&amp;", "лево → право", false)}
${row(240, "||", "лево → право", false)}
${row(284, "= += -= …", "право → лево", false)}
<text class="cap" x="530" y="336" font-size="11" text-anchor="middle" fill="var(--accent)">/ и * — на одной строке, поэтому считаем слева направо</text>`;
  return svgWrap("0 0 680 356", slug, "Порядок вычисления выражения", inner);
}

/* ---------------------------------------------------------------- 2.17 */

// Почему "сумма: " + 2 + 3 даёт 23, а 2 + 3 + " это сумма" даёт 5. Показываем не
// правило, а два прохода слева направо: как только слева оказалась строка, роль
// плюса меняется до конца выражения и обратно уже не переключается.
function buildStringPlus() {
  const slug = "string-plus";
  const step = (x, y, text, str) => `
<rect x="${x}" y="${y}" width="${text.length > 12 ? 190 : 150}" height="38" rx="9" fill="${str ? "var(--sunk, var(--paper))" : "var(--paper)"}" stroke="${str ? "var(--accent)" : "var(--line)"}" stroke-width="${str ? 1.7 : 1.3}"/>
<text class="mono" x="${x + (text.length > 12 ? 95 : 75)}" y="${y + 24}" font-size="13" font-weight="700" text-anchor="middle">${esc(text)}</text>`;
  const arrow = (x1, y, x2, label) => `
<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="${(x1 + x2) / 2}" y="${y - 8}" font-size="10" text-anchor="middle">${label}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="26" y="26" font-size="14" font-weight="700">"сумма: " + 2 + 3</text>
${step(26, 40, `"сумма: "`, true)}
${arrow(182, 59, 214, "склейка")}
${step(220, 40, `"сумма: 2"`, true)}
${arrow(376, 59, 408, "склейка")}
${step(414, 40, `"сумма: 23"`, true)}
<text class="cap" x="26" y="104" font-size="11">строка встретилась сразу — оба плюса склеивают</text>

<line x1="26" y1="124" x2="640" y2="124" stroke="var(--line)" stroke-width="1"/>

<text class="mono" x="26" y="156" font-size="14" font-weight="700">2 + 3 + " это сумма"</text>
${step(26, 170, `2`, false)}
${arrow(182, 189, 214, "сложение")}
${step(220, 170, `5`, false)}
${arrow(376, 189, 408, "склейка")}
${step(414, 170, `"5 это сумма"`, true)}
<text class="cap" x="26" y="234" font-size="11">пока слева числа — плюс складывает; строка переключает роль один раз и навсегда</text>`;
  return svgWrap("0 0 660 250", slug, "Плюс со строкой читается слева направо", inner);
}

/* ---------------------------------------------------------------- 2.18 */

// Буфер ввода и знаменитая пара nextInt + nextLine. Ключ картинки — сам символ
// перевода строки: он нарисован отдельной ячейкой, потому что в тексте его не
// видно, и именно из-за него имя выходит пустым.
function buildScannerBuffer() {
  const slug = "scanner-buffer";
  const cellw = 30;
  const buf = (x, y, chars, from) => chars.map((c, i) => `
<rect x="${x + i * cellw}" y="${y}" width="${cellw - 3}" height="34" rx="6" fill="${i < from ? "var(--paper)" : "var(--sunk, var(--paper))"}" stroke="${c === "⏎" ? "var(--accent)" : "var(--line)"}" stroke-width="${c === "⏎" ? 1.7 : 1.2}" ${i < from ? 'stroke-dasharray="4 3"' : ""}/>
<text class="mono" x="${x + i * cellw + (cellw - 3) / 2}" y="${y + 23}" font-size="14" font-weight="700" text-anchor="middle" fill="${i < from ? "var(--muted)" : c === "⏎" ? "var(--accent)" : "var(--ink)"}">${c}</text>`).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="26" y="24" font-size="11.5">набрали 30, нажали Enter — в буфере лежит</text>
${buf(26, 34, ["3", "0", "⏎"], 0)}
<text class="cap" x="130" y="57" font-size="11" fill="var(--accent)">невидимый символ от Enter</text>

<text class="mono" x="26" y="110" font-size="14" font-weight="700">sc.nextInt()</text>
<line x1="140" y1="105" x2="176" y2="105" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="186" y="110" font-size="11.5">забирает только цифры</text>
${buf(400, 88, ["3", "0", "⏎"], 2)}
<text class="cap" x="400" y="140" font-size="11">съедено</text>
<text class="cap" x="462" y="140" font-size="11" fill="var(--accent)">осталось</text>

<text class="mono" x="26" y="188" font-size="14" font-weight="700">sc.nextLine()</text>
<line x1="150" y1="183" x2="186" y2="183" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="196" y="188" font-size="11.5">читает до перевода строки — а он первый же</text>
<rect x="546" y="166" width="86" height="34" rx="8" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.5"/>
<text class="mono" x="589" y="189" font-size="13" font-weight="700" text-anchor="middle" fill="var(--bad)">""</text>

<line x1="26" y1="222" x2="640" y2="222" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="248" font-size="11.5">лечится лишним</text>
<text class="mono" x="140" y="249" font-size="12.5" font-weight="700">sc.nextLine()</text>
<text class="cap" x="256" y="248" font-size="11.5">между ними: он и подбирает этот хвост</text>`;
  return svgWrap("0 0 660 262", slug, "Буфер ввода: почему nextLine возвращает пустую строку", inner);
}

/* ---------------------------------------------------------------- 2.19 */

// Шесть операторов на одной числовой оси. Ось нужна затем, чтобы «больше или
// равно» перестало быть парой символов и стало отрезком: видно, что границу
// включает только вариант с равенством, и ошибка на единицу становится видимой.
function buildCompareOps() {
  const slug = "compare-ops";
  const x0 = 130, step = 52, lead = 18;
  const px = (v) => x0 + (v - 1) * step;
  const left = x0 - lead, right = px(9) + lead;
  const axis = (y) => `
<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="var(--line)" stroke-width="1.2"/>
${[1, 3, 5, 7, 9].map((v) => `<circle cx="${px(v)}" cy="${y}" r="2.4" fill="var(--muted)"/>
<text class="mono cap" x="${px(v)}" y="${y + 18}" font-size="10" text-anchor="middle">${v}</text>`).join("")}`;
  const row = (y, label, from, to, open, hit) => `
<text class="mono" x="26" y="${y + 5}" font-size="14" font-weight="700">${esc(label)}</text>
${axis(y)}
<line x1="${from}" y1="${y}" x2="${to}" y2="${y}" stroke="var(--accent)" stroke-width="3.4" stroke-linecap="round"/>
<circle cx="${px(5)}" cy="${y}" r="5.4" fill="${open ? "var(--paper)" : "var(--accent)"}" stroke="var(--accent)" stroke-width="1.8"/>
<text class="cap" x="${right + 16}" y="${y + 4}" font-size="11">${hit}</text>`;
  const inner = `
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="26" y="24" font-size="11.5">какие значения x дают true, если сравнивать с 5</text>
${row(56, "x > 5", px(5) + 6, right, true, "пятёрка не входит")}
${row(114, "x >= 5", px(5), right, false, "пятёрка входит")}
${row(172, "x < 5", left, px(5) - 6, true, "пятёрка не входит")}
${row(230, "x <= 5", left, px(5), false, "пятёрка входит")}
<line x1="26" y1="272" x2="700" y2="272" stroke="var(--line)" stroke-width="1"/>
<text class="mono" x="26" y="305" font-size="14" font-weight="700">x == 5</text>
<line x1="${left}" y1="300" x2="${right}" y2="300" stroke="var(--line)" stroke-width="1.2"/>
<circle cx="${px(5)}" cy="300" r="5.4" fill="var(--accent)" stroke="var(--accent)" stroke-width="1.8"/>
<text class="cap" x="${right + 16}" y="304" font-size="11">одна-единственная точка</text>
<text class="mono" x="26" y="345" font-size="14" font-weight="700">x != 5</text>
<line x1="${left}" y1="340" x2="${px(5) - 6}" y2="340" stroke="var(--accent)" stroke-width="3.4" stroke-linecap="round"/>
<line x1="${px(5) + 6}" y1="340" x2="${right}" y2="340" stroke="var(--accent)" stroke-width="3.4" stroke-linecap="round"/>
<circle cx="${px(5)}" cy="340" r="5.4" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.8"/>
<text class="cap" x="${right + 16}" y="344" font-size="11">всё, кроме одной точки</text>`;
  return svgWrap("0 0 760 362", slug, "Шесть операторов сравнения на числовой оси", inner);
}

/* ---------------------------------------------------------------- 2.20 */

// Три логические операции разом плюс короткое замыкание. Таблица истинности
// нарисована галочками и крестами, а не словами true/false: так строка «обе
// стороны» читается за один взгляд, а не вычитывается.
function buildBoolOps() {
  const slug = "bool-ops";
  const mark = (x, y, on) => (on ? checkIcon(x, y, 13, "") : crossIcon(x, y, 13, ""));
  const trow = (y, a, b, and, or, nota) => `
${mark(64, y, a)}${mark(126, y, b)}
<line x1="168" y1="${y - 6}" x2="168" y2="${y + 20}" stroke="var(--line)" stroke-width="1"/>
${mark(206, y, and)}${mark(286, y, or)}${mark(366, y, nota)}`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .lane { fill: var(--sunk, var(--paper)); stroke: var(--line); stroke-width: 1.3; }
</style>
<text class="mono cap" x="70" y="30" font-size="12" text-anchor="middle">a</text>
<text class="mono cap" x="132" y="30" font-size="12" text-anchor="middle">b</text>
<text class="mono" x="212" y="30" font-size="13" font-weight="700" text-anchor="middle">a &amp;&amp; b</text>
<text class="mono" x="292" y="30" font-size="13" font-weight="700" text-anchor="middle">a || b</text>
<text class="mono" x="372" y="30" font-size="13" font-weight="700" text-anchor="middle">!a</text>
<line x1="52" y1="40" x2="392" y2="40" stroke="var(--line)" stroke-width="1"/>
${trow(52, true, true, true, true, false)}
${trow(84, true, false, false, true, false)}
${trow(116, false, true, false, true, true)}
${trow(148, false, false, false, false, true)}
<text class="cap" x="212" y="192" font-size="10.5" text-anchor="middle">нужны обе</text>
<text class="cap" x="292" y="192" font-size="10.5" text-anchor="middle">хватит одной</text>
<text class="cap" x="372" y="192" font-size="10.5" text-anchor="middle">наоборот</text>

<line x1="430" y1="20" x2="430" y2="196" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="452" y="30" font-size="11.5">короткое замыкание</text>
<rect class="lane" x="452" y="46" width="180" height="44" rx="9"/>
<text class="mono" x="466" y="66" font-size="12" font-weight="700">b != 0</text>
<text class="cap" x="466" y="82" font-size="10.5">дало false</text>
<line x1="542" y1="68" x2="576" y2="68" stroke="var(--bad)" stroke-width="1.4" stroke-dasharray="4 3"/>
<text x="600" y="72" font-size="13" font-weight="700" fill="var(--bad)" text-anchor="middle">✕</text>
<rect x="452" y="100" width="180" height="44" rx="9" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2" stroke-dasharray="5 4"/>
<text class="mono cap" x="466" y="120" font-size="12">a / b &gt; 1</text>
<text class="cap" x="466" y="136" font-size="10.5">не вычисляется вовсе</text>
<text class="cap" x="452" y="168" font-size="11">ответ уже определён левой стороной,</text>
<text class="cap" x="452" y="184" font-size="11">поэтому деления на ноль не происходит</text>`;
  return svgWrap("0 0 660 208", slug, "Три логические операции и короткое замыкание", inner);
}

/* ---------------------------------------------------------------- 2.21 */

// Блок-схема if else. Ромб, две ветки, обязательное схождение внизу — именно
// схождение объясняет, почему после конструкции программа продолжается одна,
// а не «остаётся в ветке».
function buildIfFlow() {
  const slug = "if-flow";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${slug} .act { fill: var(--sunk, var(--paper)); stroke: var(--accent); stroke-width: 1.6; }
</style>
<rect class="box" x="250" y="16" width="180" height="38" rx="9"/>
<text class="cap" x="340" y="40" font-size="11.5" text-anchor="middle">программа идёт сверху вниз</text>
<line x1="340" y1="54" x2="340" y2="76" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>

<path d="M340,80 L456,124 L340,168 L224,124 Z" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.7"/>
<text class="mono" x="340" y="122" font-size="13" font-weight="700" text-anchor="middle">age &gt;= 18</text>
<text class="cap" x="340" y="138" font-size="10.5" text-anchor="middle">условие в скобках</text>

<line x1="224" y1="124" x2="150" y2="124" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="150" y1="124" x2="150" y2="182" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<text class="mono" x="186" y="116" font-size="12" font-weight="700" text-anchor="middle">false</text>

<line x1="456" y1="124" x2="530" y2="124" stroke="var(--accent)" stroke-width="1.3"/>
<line x1="530" y1="124" x2="530" y2="182" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<text class="mono" x="494" y="116" font-size="12" font-weight="700" text-anchor="middle">true</text>

<rect class="box" x="62" y="186" width="176" height="46" rx="10"/>
<text class="mono" x="150" y="207" font-size="12" text-anchor="middle">блок после else</text>
<text class="cap" x="150" y="222" font-size="10.5" text-anchor="middle">«Нельзя»</text>

<rect class="act" x="442" y="186" width="176" height="46" rx="10"/>
<text class="mono" x="530" y="207" font-size="12" text-anchor="middle">блок после if</text>
<text class="cap" x="530" y="222" font-size="10.5" text-anchor="middle">«Проходите»</text>

<line x1="150" y1="232" x2="150" y2="268" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="530" y1="232" x2="530" y2="268" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="150" y1="268" x2="530" y2="268" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="340" y1="268" x2="340" y2="292" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<rect class="box" x="250" y="296" width="180" height="38" rx="9"/>
<text class="cap" x="340" y="320" font-size="11.5" text-anchor="middle">строка после конструкции</text>
<text class="cap" x="340" y="356" font-size="11" text-anchor="middle">ветка выполняется ровно одна, дальше пути снова сходятся</text>`;
  return svgWrap("0 0 680 366", slug, "Как выполняется if else", inner);
}

/* ---------------------------------------------------------------- 2.22 */

// Цепочка else if как очередь сит. Главное здесь — перечёркнутые нижние
// проверки: они не «дали false», их вообще не спрашивали. Именно это делает
// порядок веток логикой, а не оформлением.
function buildElseifChain() {
  const slug = "elseif-chain";
  const step = (y, cond, out, state) => {
    const color = state === "hit" ? "var(--accent)" : state === "skip" ? "var(--muted)" : "var(--line)";
    return `
<rect x="150" y="${y}" width="200" height="42" rx="10" fill="${state === "hit" ? "var(--sunk, var(--paper))" : "var(--paper)"}" stroke="${color}" stroke-width="${state === "hit" ? 1.8 : 1.2}" ${state === "skip" ? 'stroke-dasharray="5 4"' : ""}/>
<text class="mono" x="250" y="${y + 27}" font-size="13.5" font-weight="700" text-anchor="middle" fill="${state === "skip" ? "var(--muted)" : "var(--ink)"}">${esc(cond)}</text>
<text class="cap" x="372" y="${y + 26}" font-size="11" fill="${state === "hit" ? "var(--accent)" : "var(--muted)"}">${out}</text>`;
  };
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="26" y="30" font-size="15" font-weight="700">score = 82</text>
<text class="cap" x="150" y="30" font-size="11.5">проверки идут сверху вниз</text>
${step(44, "score >= 90", "не подошло, идём дальше", "miss")}
<line x1="250" y1="86" x2="250" y2="102" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
${step(106, "score >= 75", "подошло — печатаем «хорошо»", "hit")}
<line x1="250" y1="148" x2="250" y2="164" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="4 3"/>
${step(168, "score >= 60", "уже не спрашивают", "skip")}
${step(230, "else", "уже не спрашивают", "skip")}
<line x1="594" y1="127" x2="640" y2="127" stroke="var(--accent)" stroke-width="1.4"/>
<line x1="640" y1="127" x2="640" y2="292" stroke="var(--accent)" stroke-width="1.4"/>
<line x1="640" y1="292" x2="360" y2="292" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="656" y="204" font-size="11" fill="var(--accent)">выход из всей</text>
<text class="cap" x="656" y="219" font-size="11" fill="var(--accent)">конструкции</text>
<text class="cap" x="26" y="288" font-size="11.5">условие 82 &gt;= 60 тоже истинно —</text>
<text class="cap" x="26" y="304" font-size="11.5">но до него очередь не дошла</text>`;
  return svgWrap("0 0 780 324", slug, "Цепочка else if: первое совпадение обрывает очередь", inner);
}

/* ---------------------------------------------------------------- 2.23 */

// Разбор тернарника по частям и главное отличие от if: у него есть значение,
// поэтому стрелка ведёт не «в действие», а обратно в переменную.
function buildTernaryParts() {
  const slug = "ternary-parts";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .lead { stroke: var(--line); stroke-width: 1; stroke-dasharray: 3 3; }
.dg-${slug} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
</style>
<text class="mono" x="30" y="44" font-size="17" font-weight="700">int max = a &gt; b ? a : b;</text>

<line class="lead" x1="161" y1="54" x2="161" y2="86"/>
<line class="lead" x1="220" y1="54" x2="220" y2="112"/>
<line class="lead" x1="240" y1="54" x2="240" y2="164"/>
<line class="lead" x1="260" y1="54" x2="260" y2="138"/>

<text class="cap" x="161" y="100" font-size="11.5" text-anchor="middle">условие</text>
<text class="cap" x="220" y="126" font-size="11.5" text-anchor="middle">если да</text>
<text class="cap" x="260" y="152" font-size="11.5" text-anchor="middle">если нет</text>
<text class="cap" x="240" y="178" font-size="11.5" text-anchor="middle">двоеточие разделяет две ветки</text>

<line x1="30" y1="200" x2="640" y2="200" stroke="var(--line)" stroke-width="1"/>

<rect class="box" x="30" y="226" width="250" height="96" rx="12"/>
<text class="mono" x="46" y="250" font-size="13" font-weight="700">if</text>
<text class="cap" x="46" y="272" font-size="11.5">это инструкция:</text>
<text class="cap" x="46" y="288" font-size="11.5">она что-то делает</text>
<text class="cap" x="46" y="310" font-size="11.5">присвоить её никуда нельзя</text>

<rect x="330" y="226" width="290" height="96" rx="12" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.7"/>
<text class="mono" x="346" y="250" font-size="13" font-weight="700" fill="var(--accent)">a &gt; b ? a : b</text>
<text class="cap" x="346" y="272" font-size="11.5">это выражение:</text>
<text class="cap" x="346" y="288" font-size="11.5">у него есть значение</text>
<line x1="346" y1="302" x2="380" y2="302" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="392" y="306" font-size="11.5">можно присвоить, напечатать, склеить</text>`;
  return svgWrap("0 0 660 336", slug, "Тернарный оператор по частям", inner);
}

/* ---------------------------------------------------------------- 2.25 */

// Провал. Слева — что человек имел в виду, справа — что произошло на самом деле.
// Ключевая деталь: метки нарисованы как ориентиры на одной сплошной ленте кода,
// а не как отдельные коробки, — тогда становится видно, что останавливать
// выполнение там нечему.
function buildSwitchFallthrough() {
  const slug = "switch-fallthrough";
  const lane = (x, title, rows, note) => `
<text class="cap" x="${x}" y="24" font-size="11.5">${title}</text>
<rect x="${x}" y="34" width="264" height="176" rx="12" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
${rows.map((r, i) => `
<text class="mono" x="${x + 16}" y="${68 + i * 40}" font-size="13" font-weight="700" fill="${r.on ? "var(--accent)" : "var(--muted)"}">${esc(r.label)}</text>
<text class="cap" x="${x + 124}" y="${68 + i * 40}" font-size="11" fill="${r.on ? "var(--ink)" : "var(--muted)"}">${esc(r.out)}</text>`).join("")}
<text class="cap" x="${x}" y="232" font-size="11">${note}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
${lane(26, "что имели в виду при d = 2", [
    { label: "case 1:", out: "пропущено", on: false },
    { label: "case 2:", out: "печатаем «два»", on: true },
    { label: "case 3:", out: "пропущено", on: false },
    { label: "default:", out: "пропущено", on: false },
  ], "ожидание: одна строка")}
${lane(360, "что происходит без break", [
    { label: "case 1:", out: "прыжок мимо", on: false },
    { label: "case 2:", out: "печатаем «два»", on: true },
    { label: "case 3:", out: "печатаем «три»", on: true },
    { label: "default:", out: "печатаем «что-то ещё»", on: true },
  ], "реальность: три строки")}
<line x1="344" y1="76" x2="344" y2="188" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="330" y="106" font-size="10.5" fill="var(--accent)" text-anchor="end">метки не</text>
<text class="cap" x="330" y="120" font-size="10.5" fill="var(--accent)" text-anchor="end">останавливают</text>
<text class="cap" x="26" y="256" font-size="11.5">метка — это точка входа, а не граница блока: остановить выполнение может только break</text>`;
  return svgWrap("0 0 660 268", slug, "Провал в классическом switch", inner);
}

/* ---------------------------------------------------------------- 2.26 */

// Две записи рядом. Смысл картинки не в том, что новая короче, а в двух вещах,
// которые в тексте приходится повторять: у стрелочной ветки есть границы, и
// у всей конструкции появляется значение — стрелка уходит обратно в переменную.
function buildSwitchArrow() {
  const slug = "switch-arrow";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .old { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${slug} .new { fill: var(--sunk, var(--paper)); stroke: var(--accent); stroke-width: 1.6; }
</style>
<text class="cap" x="26" y="24" font-size="11.5">классическая запись</text>
<rect class="old" x="26" y="34" width="286" height="150" rx="12"/>
<text class="mono" x="42" y="62" font-size="12.5">case 2:</text>
<text class="mono" x="62" y="86" font-size="12.5">println("два");</text>
<text class="mono" x="62" y="110" font-size="12.5" fill="var(--bad)">break;</text>
<text class="cap" x="42" y="136" font-size="10.5" fill="var(--bad)">забудешь — провалишься дальше</text>
<text class="cap" x="42" y="160" font-size="10.5">значение вернуть нельзя,</text>
<text class="cap" x="42" y="174" font-size="10.5">только присвоить в переменную снаружи</text>

<text class="cap" x="360" y="24" font-size="11.5">стрелочная запись</text>
<rect class="new" x="360" y="34" width="286" height="150" rx="12"/>
<text class="mono" x="376" y="62" font-size="12.5">case 2 -&gt; "два";</text>
<text class="cap" x="376" y="86" font-size="10.5">границы ветки заданы самой стрелкой</text>
<text class="cap" x="376" y="104" font-size="10.5" fill="var(--accent)">провала нет, break не нужен</text>
<line x1="376" y1="122" x2="376" y2="140" stroke="var(--accent)" stroke-width="1.3"/>
<line x1="376" y1="140" x2="410" y2="140" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="422" y="144" font-size="10.5">у всей конструкции есть значение</text>
<text class="mono" x="376" y="172" font-size="12" font-weight="700">String s = switch (n) { … };</text>

<line x1="26" y1="206" x2="646" y2="206" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="230" font-size="11.5">смешивать двоеточия и стрелки в одном switch нельзя — либо всё старое, либо всё новое</text>`;
  return svgWrap("0 0 680 242", slug, "Классический и стрелочный switch рядом", inner);
}

/* ---------------------------------------------------------------- 2.29-2.31 */

// Общий каркас для трёх блок-схем циклов: одинаковые фигуры и одинаковые места,
// чтобы разницу между while, do while и for было видно как смещение одного
// элемента, а не как три несвязанные картинки.
function loopStyle(slug) {
  return `<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .box { fill: var(--paper); stroke: var(--line); stroke-width: 1.3; }
.dg-${slug} .body { fill: var(--sunk, var(--paper)); stroke: var(--accent); stroke-width: 1.6; }
</style>`;
}
function loopDiamond(cx, cy, w, h, text, sub) {
  return `<path d="M${cx},${cy - h} L${cx + w},${cy} L${cx},${cy + h} L${cx - w},${cy} Z" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono" x="${cx}" y="${cy + (sub ? -2 : 5)}" font-size="12.5" font-weight="700" text-anchor="middle">${esc(text)}</text>
${sub ? `<text class="cap" x="${cx}" y="${cy + 14}" font-size="10" text-anchor="middle">${esc(sub)}</text>` : ""}`;
}
function loopBox(x, y, w, h, cls, text, sub) {
  return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>
<text class="mono" x="${x + w / 2}" y="${y + (sub ? 22 : h / 2 + 5)}" font-size="12.5" font-weight="700" text-anchor="middle">${esc(text)}</text>
${sub ? `<text class="cap" x="${x + w / 2}" y="${y + 38}" font-size="10" text-anchor="middle">${esc(sub)}</text>` : ""}`;
}

function buildWhileFlow() {
  const slug = "while-flow";
  const inner = `<defs>${arrowDefs(slug)}</defs>${loopStyle(slug)}
${loopBox(216, 14, 208, 34, "box", "int i = 1;", "")}
<text class="cap" x="440" y="35" font-size="11">подготовка — до цикла</text>
<line x1="320" y1="48" x2="320" y2="70" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
${loopDiamond(320, 106, 116, 36, "i <= 5", "проверка перед телом")}
<line x1="320" y1="142" x2="320" y2="176" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="mono" x="336" y="164" font-size="11.5" font-weight="700">true</text>
${loopBox(216, 180, 208, 52, "body", "println(i);", "i++;")}
<line x1="216" y1="206" x2="150" y2="206" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="150" y1="206" x2="150" y2="106" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="150" y1="106" x2="202" y2="106" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="112" y="160" font-size="10.5" text-anchor="middle">возврат</text>
<text class="cap" x="112" y="174" font-size="10.5" text-anchor="middle">к проверке</text>
<line x1="436" y1="106" x2="520" y2="106" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="520" y1="106" x2="520" y2="262" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="520" y1="262" x2="424" y2="262" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<text class="mono" x="450" y="98" font-size="11.5" font-weight="700">false</text>
${loopBox(216, 244, 208, 34, "box", "дальше по программе", "")}
<text class="cap" x="320" y="302" font-size="11" text-anchor="middle">условие проверяется 6 раз, тело выполняется 5 — последняя проверка выводит из цикла</text>`;
  return svgWrap("0 0 660 314", slug, "Как выполняется while", inner);
}

function buildDoWhileFlow() {
  const slug = "dowhile-flow";
  const inner = `<defs>${arrowDefs(slug)}</defs>${loopStyle(slug)}
${loopBox(216, 14, 208, 34, "box", "int i = 10;", "")}
<line x1="320" y1="48" x2="320" y2="70" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="440" y="66" font-size="11" fill="var(--accent)">в тело заходим безусловно</text>
${loopBox(216, 74, 208, 52, "body", "println(i);", "тело идёт первым")}
<line x1="320" y1="126" x2="320" y2="150" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
${loopDiamond(320, 186, 116, 36, "i < 5", "проверка после тела")}
<line x1="204" y1="186" x2="150" y2="186" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="150" y1="186" x2="150" y2="100" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="150" y1="100" x2="210" y2="100" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<text class="mono" x="168" y="152" font-size="11.5" font-weight="700">true</text>
<line x1="436" y1="186" x2="520" y2="186" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="520" y1="186" x2="520" y2="262" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="520" y1="262" x2="424" y2="262" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<text class="mono" x="450" y="178" font-size="11.5" font-weight="700">false</text>
${loopBox(216, 244, 208, 34, "box", "дальше по программе", "")}
<text class="cap" x="320" y="302" font-size="11" text-anchor="middle">условие 10 &lt; 5 ложно — но тело уже выполнилось: у do while минимум одна итерация</text>`;
  return svgWrap("0 0 660 314", slug, "Как выполняется do while", inner);
}

function buildForParts() {
  const slug = "for-parts";
  const inner = `<defs>${arrowDefs(slug)}</defs>${loopStyle(slug)}
<text class="mono" x="30" y="40" font-size="17" font-weight="700">for (int i = 1; i &lt;= 5; i++) {</text>
<line x1="112" y1="50" x2="112" y2="72" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3"/>
<line x1="216" y1="50" x2="216" y2="72" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3"/>
<line x1="296" y1="50" x2="296" y2="72" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3"/>
<text class="cap" x="112" y="88" font-size="11" text-anchor="middle">подготовка</text>
<text class="cap" x="112" y="102" font-size="10.5" text-anchor="middle">один раз</text>
<text class="cap" x="216" y="88" font-size="11" text-anchor="middle">условие</text>
<text class="cap" x="216" y="102" font-size="10.5" text-anchor="middle">перед каждой</text>
<text class="cap" x="296" y="88" font-size="11" text-anchor="middle">шаг</text>
<text class="cap" x="296" y="102" font-size="10.5" text-anchor="middle">после каждой</text>

<line x1="30" y1="124" x2="640" y2="124" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="30" y="148" font-size="11.5">порядок выполнения не совпадает с порядком записи:</text>

${[["1", "подготовка", 30], ["2", "условие", 158], ["3", "тело", 274], ["4", "шаг", 366]]
    .map(([n, label, x]) => `
<circle cx="${Number(x) + 22}" cy="188" r="13" fill="var(--accent)"/>
<text x="${Number(x) + 22}" y="193" font-size="12" font-weight="700" text-anchor="middle" fill="var(--paper)">${n}</text>
<text class="mono" x="${Number(x) + 44}" y="193" font-size="13" font-weight="700">${label}</text>`).join("")}
<line x1="452" y1="188" x2="490" y2="188" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="500" y="192" font-size="11">и снова к пункту 2</text>
<line x1="474" y1="202" x2="474" y2="220" stroke="var(--muted)" stroke-width="1.2"/>
<line x1="474" y1="220" x2="180" y2="220" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>

<text class="cap" x="30" y="252" font-size="11.5">шаг записан вторым, а выполняется последним — это единственное неочевидное место конструкции</text>`;
  return svgWrap("0 0 660 264", slug, "Три части шапки for и порядок их выполнения", inner);
}

/* ---------------------------------------------------------------- 2.32 */

// Куда именно прыгают break и continue. Обе стрелки нарисованы на одном и том же
// теле цикла, потому что путаница ровно в этом: людям кажется, что continue тоже
// куда-то «выходит», а он возвращается внутрь.
function buildBreakContinue() {
  const slug = "break-continue";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="230" y="46" width="250" height="38" rx="9" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="355" y="70" font-size="12.5" text-anchor="middle">for (i = 1; i &lt;= 5; i++)</text>

<rect x="250" y="100" width="210" height="96" rx="10" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.5"/>
<text class="mono" x="268" y="126" font-size="12">начало тела</text>
<text class="mono" x="268" y="152" font-size="12.5" font-weight="700">…</text>
<text class="mono" x="268" y="180" font-size="12">конец тела</text>

<rect x="230" y="228" width="250" height="36" rx="9" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="cap" x="355" y="251" font-size="11" text-anchor="middle">строка после цикла</text>

<line x1="250" y1="148" x2="170" y2="148" stroke="var(--bad)" stroke-width="1.7"/>
<line x1="170" y1="148" x2="170" y2="246" stroke="var(--bad)" stroke-width="1.7"/>
<line x1="170" y1="246" x2="224" y2="246" stroke="var(--bad)" stroke-width="1.7" marker-end="url(#${slug}-arrow)"/>
<text class="mono" x="26" y="140" font-size="13" font-weight="700" fill="var(--bad)">break</text>
<text class="cap" x="26" y="160" font-size="11">выйти из цикла:</text>
<text class="cap" x="26" y="176" font-size="11">мимо шага</text>
<text class="cap" x="26" y="192" font-size="11">и мимо проверки</text>

<line x1="460" y1="148" x2="546" y2="148" stroke="var(--accent)" stroke-width="1.7"/>
<line x1="546" y1="148" x2="546" y2="65" stroke="var(--accent)" stroke-width="1.7"/>
<line x1="546" y1="65" x2="486" y2="65" stroke="var(--accent)" stroke-width="1.7" marker-end="url(#${slug}-arrow-accent)"/>
<text class="mono" x="562" y="140" font-size="13" font-weight="700" fill="var(--accent)">continue</text>
<text class="cap" x="562" y="160" font-size="11">следующая итерация:</text>
<text class="cap" x="562" y="176" font-size="11">в for — на шаг,</text>
<text class="cap" x="562" y="192" font-size="11">потом на проверку</text>

<text class="cap" x="26" y="290" font-size="11.5">в while шага нет: continue прыгает сразу на проверку — если счётчик менялся ниже, он больше не изменится</text>`;
  return svgWrap("0 0 720 302", slug, "Куда прыгают break и continue", inner);
}

/* ---------------------------------------------------------------- 2.33 */

// Вложенные циклы как таблица посещений. Номера в клетках — порядок выполнения
// внутреннего тела; из него сразу видно, что внутренний счётчик быстрее и что
// итераций получается произведение, а не сумма.
function buildNestedLoops() {
  const slug = "nested-loops";
  const x0 = 150, y0 = 66, cell = 64;
  let grid = "";
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const n = i * 3 + j + 1;
      grid += `<rect x="${x0 + j * cell}" y="${y0 + i * cell}" width="${cell - 6}" height="${cell - 6}" rx="8" fill="var(--sunk, var(--paper))" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="${x0 + j * cell + (cell - 6) / 2}" y="${y0 + i * cell + 28}" font-size="15" font-weight="700" text-anchor="middle">${n}</text>
<text class="cap" x="${x0 + j * cell + (cell - 6) / 2}" y="${y0 + i * cell + 45}" font-size="10" text-anchor="middle">i=${i + 1} j=${j + 1}</text>`;
    }
    grid += `<text class="mono cap" x="${x0 - 16}" y="${y0 + i * cell + 34}" font-size="12" text-anchor="end">i = ${i + 1}</text>`;
    grid += `<line x1="${x0 - 6}" y1="${y0 + i * cell + 29}" x2="${x0 + 3 * cell - 12}" y2="${y0 + i * cell + 29}" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.5"/>`;
  }
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="26" y="26" font-size="11.5">номер в клетке — какой по счёту раз выполнилось тело внутреннего цикла</text>
<text class="mono cap" x="${x0 + cell / 2 - 3}" y="52" font-size="12" text-anchor="middle">j = 1</text>
<text class="mono cap" x="${x0 + cell + cell / 2 - 3}" y="52" font-size="12" text-anchor="middle">j = 2</text>
<text class="mono cap" x="${x0 + 2 * cell + cell / 2 - 3}" y="52" font-size="12" text-anchor="middle">j = 3</text>
${grid}
<text class="cap" x="${x0 + 3 * cell + 4}" y="${y0 + 34}" font-size="11">строка целиком,</text>
<text class="cap" x="${x0 + 3 * cell + 4}" y="${y0 + 48}" font-size="11">потом println()</text>
<text class="cap" x="26" y="${y0 + 3 * cell + 24}" font-size="11.5">внутренний счётчик пробегает весь диапазон на каждый шаг внешнего и стартует заново</text>
<text class="cap" x="26" y="${y0 + 3 * cell + 42}" font-size="11.5">итераций получается 3 × 3 = 9 — вложенность умножает работу, а не складывает</text>`;
  return svgWrap("0 0 660 320", slug, "Порядок обхода во вложенных циклах", inner);
}

/* ---------------------------------------------------------------- 2.34 */

// Метка. Три стрелки на одной картинке: обычный break возвращает управление
// внешнему циклу, break с меткой уносит наружу, continue с меткой — на следующий
// шаг внешнего. Именно эти три исхода люди и путают между собой.
function buildLabeledBreak() {
  const slug = "labeled-break";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="60" y="34" font-size="13" font-weight="700" fill="var(--accent)">outer:</text>
<rect x="60" y="44" width="360" height="196" rx="12" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono" x="78" y="70" font-size="12.5">for (int i = 1; i &lt;= 3; i++) {</text>

<rect x="96" y="86" width="304" height="128" rx="10" fill="var(--sunk, var(--paper))" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="112" y="112" font-size="12.5">for (int j = 1; j &lt;= 3; j++) {</text>
<text class="mono" x="130" y="146" font-size="12.5" font-weight="700">break;</text>
<text class="mono" x="130" y="176" font-size="12.5" font-weight="700" fill="var(--accent)">break outer;</text>
<text class="mono" x="130" y="206" font-size="12.5" font-weight="700">continue outer;</text>

<line x1="212" y1="142" x2="452" y2="142" stroke="var(--muted)" stroke-width="1.4"/>
<line x1="452" y1="142" x2="452" y2="222" stroke="var(--muted)" stroke-width="1.4"/>
<line x1="452" y1="222" x2="406" y2="222" stroke="var(--muted)" stroke-width="1.4" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="468" y="132" font-size="10.5">наружу только из внутреннего —</text>
<text class="cap" x="468" y="146" font-size="10.5">внешний тут же зайдёт снова</text>

<line x1="252" y1="172" x2="614" y2="172" stroke="var(--accent)" stroke-width="1.6"/>
<line x1="614" y1="172" x2="614" y2="278" stroke="var(--accent)" stroke-width="1.6"/>
<line x1="614" y1="278" x2="326" y2="278" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="630" y="176" font-size="10.5" fill="var(--accent)">сразу из обоих</text>

<line x1="126" y1="202" x2="34" y2="202" stroke="var(--muted)" stroke-width="1.4" stroke-dasharray="5 4"/>
<line x1="34" y1="202" x2="34" y2="64" stroke="var(--muted)" stroke-width="1.4" stroke-dasharray="5 4"/>
<line x1="34" y1="64" x2="72" y2="64" stroke="var(--muted)" stroke-width="1.4" stroke-dasharray="5 4" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="34" y="230" font-size="10.5">на следующий шаг i</text>

<rect x="60" y="262" width="256" height="32" rx="9" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="cap" x="188" y="283" font-size="11" text-anchor="middle">строка после помеченного цикла</text>`;
  return svgWrap("0 0 780 306", slug, "Куда уводит break с меткой", inner);
}

/* ---------------------------------------------------------------- 2.35 */

// Шесть скелетов одной таблицей. Смысл картинки — не перечислить их, а показать,
// что различаются они всего двумя ячейками: стартовым значением и строкой внутри
// цикла. Всё остальное у них общее, и это главное, что должно остаться в голове.
function buildLoopPatterns() {
  const slug = "loop-patterns";
  const rows = [
    ["аккумулятор", "sum = 0", "sum += x", "одно число"],
    ["счётчик", "count = 0", "count++", "сколько раз"],
    ["экстремум", "max = MIN_VALUE", "if (x > max) max = x", "самое большое"],
    ["флаг", "found = false", "found = true", "да или нет"],
    ["поиск", "at = -1", "at = i; break", "где именно"],
    ["построение", 'line = ""', "line += x", "строка"],
  ];
  const body = rows.map(([name, start, step, out], i) => {
    const y = 96 + i * 34;
    return `<text class="cap" x="26" y="${y}" font-size="11.5">${esc(name)}</text>
<text class="mono" x="150" y="${y}" font-size="12" font-weight="700" fill="var(--accent)">${esc(start)}</text>
<text class="mono" x="330" y="${y}" font-size="12" font-weight="700">${esc(step)}</text>
<text class="cap" x="540" y="${y}" font-size="11">${esc(out)}</text>
<line x1="26" y1="${y + 10}" x2="660" y2="${y + 10}" stroke="var(--line)" stroke-width="0.8" opacity="0.5"/>`;
  }).join("");
  const inner = `
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="140" y="30" width="180" height="${96 + 6 * 34 - 24}" rx="10" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.4"/>
<text class="cap" x="26" y="52" font-size="11">скелет</text>
<text class="cap" x="150" y="52" font-size="11" fill="var(--accent)">до цикла</text>
<text class="cap" x="330" y="52" font-size="11">внутри цикла</text>
<text class="cap" x="540" y="52" font-size="11">что останется после</text>
<line x1="26" y1="62" x2="660" y2="62" stroke="var(--line)" stroke-width="1"/>
${body}
<text class="cap" x="26" y="${96 + 6 * 34 + 22}" font-size="11.5">одинаково у всех: переменная до цикла, одна строка внутри, печать после</text>
<text class="cap" x="26" y="${96 + 6 * 34 + 40}" font-size="11.5">различаются только двумя ячейками — стартом и действием</text>`;
  return svgWrap(`0 0 690 ${96 + 6 * 34 + 54}`, slug, "Шесть скелетов цикла", inner);
}

/* ---------------------------------------------------------------- 2.36 */

// Валидация. Отдельно вынесено то, на чём спотыкаются: условие цикла описывает
// ПЛОХОЙ случай, и hasNextInt только смотрит — забрать мусор надо самому.
function buildValidateLoop() {
  const slug = "validate-loop";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="220" y="20" width="220" height="38" rx="9" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.5"/>
<text class="mono" x="330" y="44" font-size="12.5" text-anchor="middle">age = sc.nextInt();</text>
<text class="cap" x="456" y="43" font-size="11">спросить надо в любом случае</text>

<line x1="330" y1="58" x2="330" y2="80" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>

<path d="M330,84 L470,132 L330,180 L190,132 Z" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono" x="330" y="128" font-size="12" font-weight="700" text-anchor="middle">age &lt; 0 || age &gt; 120</text>
<text class="cap" x="330" y="146" font-size="10" text-anchor="middle">условие описывает ПЛОХОЙ случай</text>

<line x1="190" y1="132" x2="120" y2="132" stroke="var(--bad)" stroke-width="1.5"/>
<line x1="120" y1="132" x2="120" y2="39" stroke="var(--bad)" stroke-width="1.5"/>
<line x1="120" y1="39" x2="214" y2="39" stroke="var(--bad)" stroke-width="1.5" marker-end="url(#${slug}-arrow)"/>
<text class="mono" x="132" y="98" font-size="11.5" font-weight="700" fill="var(--bad)">true</text>
<text class="cap" x="26" y="168" font-size="10.5">значение не подошло —</text>
<text class="cap" x="26" y="182" font-size="10.5">спрашиваем снова</text>

<line x1="470" y1="132" x2="540" y2="132" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="540" y1="132" x2="540" y2="206" stroke="var(--muted)" stroke-width="1.3"/>
<line x1="540" y1="206" x2="444" y2="206" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<text class="mono" x="484" y="124" font-size="11.5" font-weight="700">false</text>
<rect x="220" y="188" width="220" height="36" rx="9" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="cap" x="330" y="211" font-size="11" text-anchor="middle">работаем с принятым значением</text>

<line x1="26" y1="248" x2="660" y2="248" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="274" font-size="11.5">если во вводе вообще не число:</text>
<text class="mono" x="238" y="275" font-size="12" font-weight="700">hasNextInt()</text>
<text class="cap" x="336" y="274" font-size="11.5">только смотрит —</text>
<text class="mono" x="446" y="275" font-size="12" font-weight="700">sc.next()</text>
<text class="cap" x="520" y="274" font-size="11.5">забирает мусор</text>
<text class="cap" x="26" y="292" font-size="11">забыл забрать — проверка снова даст false, и это вечный цикл</text>`;
  return svgWrap("0 0 690 304", slug, "Цикл валидации ввода", inner);
}

/* ---------------------------------------------------------------- 2.38 */

// Формула диапазона по шагам. Отрезок рисуется четыре раза, каждый раз после
// одного преобразования, — тогда видно, что каст не «портит» число, а именно
// схлопывает отрезок в целые точки, и почему верхняя граница не убегает.
function buildRandomRange() {
  const slug = "random-range";
  const bar = (y, x1, x2, label, right) => `
<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="var(--accent)" stroke-width="3.4" stroke-linecap="round"/>
<circle cx="${x1}" cy="${y}" r="5" fill="var(--accent)"/>
<circle cx="${x2}" cy="${y}" r="5" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.8"/>
<text class="mono cap" x="${x1}" y="${y + 22}" font-size="11" text-anchor="middle">${esc(label)}</text>
<text class="mono cap" x="${x2}" y="${y + 22}" font-size="11" text-anchor="middle">${esc(right)}</text>`;
  const dots = (y, from, step, n, first) => Array.from({ length: n }, (_, i) => `
<circle cx="${from + i * step}" cy="${y}" r="5" fill="var(--accent)"/>
<text class="mono cap" x="${from + i * step}" y="${y + 22}" font-size="11" text-anchor="middle">${first + i}</text>`).join("");
  const inner = `
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="26" y="34" font-size="13" font-weight="700">Math.random()</text>
<text class="cap" x="26" y="50" font-size="10.5">дробное, единица не входит</text>
${bar(34, 260, 620, "0.0", "1.0")}

<text class="mono" x="26" y="104" font-size="13" font-weight="700">* 6</text>
<text class="cap" x="26" y="120" font-size="10.5">растянули отрезок</text>
${bar(104, 260, 620, "0.0", "6.0")}

<text class="mono" x="26" y="174" font-size="13" font-weight="700">(int)</text>
<text class="cap" x="26" y="190" font-size="10.5">отрезали дробь — остались точки</text>
${dots(174, 260, 60, 6, 0)}

<text class="mono" x="26" y="244" font-size="13" font-weight="700">+ 1</text>
<text class="cap" x="26" y="260" font-size="10.5">сдвинули весь диапазон</text>
${dots(244, 260, 60, 6, 1)}

<line x1="26" y1="286" x2="660" y2="286" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="26" y="310" font-size="11.5">шестёрка не убегает именно потому, что каст отрезает: 5.999 становится 5, а не 6</text>
<text class="cap" x="26" y="328" font-size="11.5">для диапазона min…max множитель — это количество значений: max − min + 1</text>`;
  return svgWrap("0 0 690 340", slug, "Как из Math.random получается число от 1 до 6", inner);
}

/* ---------------------------------------------------------------- 2.43 */

// for each против индексного. Картинка отвечает на единственный вопрос, который
// тут задают: почему присваивание внутри for each ничего не меняет. Ответ —
// стрелка ведёт в отдельную коробочку-копию, а не в ячейку массива.
function buildForeachVsIndex() {
  const slug = "foreach-vs-index";
  const cells = (x, y, vals, hot) => vals.map((v, i) => `
<rect x="${x + i * 46}" y="${y}" width="42" height="38" rx="7" fill="${hot === i ? "var(--sunk, var(--paper))" : "var(--paper)"}" stroke="${hot === i ? "var(--accent)" : "var(--line)"}" stroke-width="${hot === i ? 1.7 : 1.2}"/>
<text class="mono" x="${x + i * 46 + 21}" y="${y + 25}" font-size="14" font-weight="700" text-anchor="middle">${v}</text>
<text class="mono cap" x="${x + i * 46 + 21}" y="${y + 52}" font-size="10" text-anchor="middle">${i}</text>`).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="26" y="28" font-size="13" font-weight="700">for (int i = 0; i &lt; a.length; i++)</text>
<text class="cap" x="26" y="46" font-size="11">счётчик указывает на саму ячейку</text>
${cells(300, 16, [4, 8, 15, 16], 2)}
<line x1="386" y1="90" x2="386" y2="106" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="mono" x="386" y="122" font-size="12" font-weight="700" text-anchor="middle" fill="var(--accent)">a[i] = 0</text>
<text class="cap" x="420" y="122" font-size="10.5">меняет массив</text>

<line x1="26" y1="150" x2="660" y2="150" stroke="var(--line)" stroke-width="1"/>

<text class="mono" x="26" y="182" font-size="13" font-weight="700">for (int x : a)</text>
<text class="cap" x="26" y="200" font-size="11">в x кладётся копия значения</text>
${cells(300, 170, [4, 8, 15, 16], 2)}
<line x1="386" y1="244" x2="386" y2="264" stroke="var(--muted)" stroke-width="1.4" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="386" y="264" font-size="10.5" text-anchor="middle">отдельная переменная-копия</text>
<rect x="356" y="272" width="60" height="34" rx="8" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3" stroke-dasharray="5 4"/>
<text class="mono" x="386" y="294" font-size="13" font-weight="700" text-anchor="middle">x</text>
<line x1="422" y1="289" x2="464" y2="289" stroke="var(--bad)" stroke-width="1.4" stroke-dasharray="4 3"/>
<text class="mono" x="476" y="285" font-size="12" font-weight="700" fill="var(--bad)">x = 0</text>
<text class="cap" x="476" y="301" font-size="10.5" fill="var(--bad)">массив не тронут</text>
<text class="cap" x="26" y="326" font-size="11.5">поэтому for each только читает: записывать в массив можно лишь через индекс</text>`;
  return svgWrap("0 0 690 338", slug, "for each против индексного обхода", inner);
}

/* ---------------------------------------------------------------- 2.45 */

// Линейный поиск и метка -1. Показаны обе развилки сразу: с break получаем первое
// вхождение, без break — последнее. Именно это различие в тексте приходится
// объяснять дважды, а на картинке оно видно за один взгляд.
function buildLinearSearch() {
  const slug = "linear-search";
  const cells = (y, vals, hits) => vals.map((v, i) => `
<rect x="${180 + i * 52}" y="${y}" width="46" height="38" rx="7" fill="${hits.includes(i) ? "var(--sunk, var(--paper))" : "var(--paper)"}" stroke="${hits.includes(i) ? "var(--accent)" : "var(--line)"}" stroke-width="${hits.includes(i) ? 1.7 : 1.2}"/>
<text class="mono" x="${180 + i * 52 + 23}" y="${y + 25}" font-size="14" font-weight="700" text-anchor="middle">${v}</text>
<text class="mono cap" x="${180 + i * 52 + 23}" y="${y + 52}" font-size="10" text-anchor="middle">${i}</text>`).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="26" y="26" font-size="11.5">ищем семёрку в массиве, где она встречается трижды</text>

<text class="mono" x="26" y="52" font-size="12.5" font-weight="700" fill="var(--accent)">с break</text>
<text class="cap" x="26" y="68" font-size="10.5">останавливаемся</text>
<text class="cap" x="26" y="82" font-size="10.5">на первом совпадении</text>
${cells(40, [7, 3, 7, 1, 7], [0])}
<line x1="203" y1="94" x2="203" y2="110" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="mono" x="203" y="126" font-size="13" font-weight="700" text-anchor="middle" fill="var(--accent)">idx = 0</text>
<line x1="255" y1="104" x2="430" y2="104" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="4 3"/>
<text class="cap" x="442" y="108" font-size="10.5">дальше не смотрим</text>

<line x1="26" y1="150" x2="660" y2="150" stroke="var(--line)" stroke-width="1"/>

<text class="mono" x="26" y="178" font-size="12.5" font-weight="700">без break</text>
<text class="cap" x="26" y="194" font-size="10.5">переменная</text>
<text class="cap" x="26" y="208" font-size="10.5">перезаписывается</text>
${cells(166, [7, 3, 7, 1, 7], [0, 2, 4])}
<line x1="411" y1="220" x2="411" y2="236" stroke="var(--muted)" stroke-width="1.4" marker-end="url(#${slug}-arrow)"/>
<text class="mono" x="411" y="252" font-size="13" font-weight="700" text-anchor="middle">idx = 4</text>
<text class="cap" x="452" y="252" font-size="10.5">остаётся последнее</text>

<line x1="26" y1="276" x2="660" y2="276" stroke="var(--line)" stroke-width="1"/>
<text class="mono" x="26" y="304" font-size="13" font-weight="700" fill="var(--bad)">idx = -1</text>
<text class="cap" x="112" y="304" font-size="11.5">стартовое значение и одновременно ответ «не нашли»:</text>
<text class="cap" x="112" y="320" font-size="11.5">отрицательных индексов не бывает, спутать с настоящим невозможно</text>`;
  return svgWrap("0 0 690 332", slug, "Линейный поиск и метка минус один", inner);
}

/* ---------------------------------------------------------------- 2.48 */

// Порядок обхода матрицы. Стрелка змейкой по клеткам плюс отдельные подписи,
// что именно даёт каждый цикл, — тогда «внешний по строкам» перестаёт быть
// заклинанием и становится видимым маршрутом.
function buildMatrixWalk() {
  const slug = "matrix-walk";
  const x0 = 210, y0 = 58, cw = 60, rh = 80;
  let grid = "";
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      grid += `<rect x="${x0 + j * cw}" y="${y0 + i * rh}" width="${cw - 8}" height="46" rx="7" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono cap" x="${x0 + j * cw + (cw - 8) / 2}" y="${y0 + i * rh + 29}" font-size="11" text-anchor="middle">[${i}][${j}]</text>`;
    }
    const ay = y0 + i * rh + 60;
    grid += `<line x1="${x0 + 8}" y1="${ay}" x2="${x0 + 2 * cw + 44}" y2="${ay}" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#${slug}-arrow-accent)"/>`;
    if (i < 2) {
      grid += `<path d="M${x0 + 2 * cw + 48},${ay + 2} q16,10 -${2 * cw + 40},${rh - 18}" fill="none" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="4 3"/>`;
    }
  }
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="${x0}" y="40" font-size="11.5">внутренний цикл — вдоль строки</text>
${grid}
<text class="mono cap" x="${x0 - 16}" y="${y0 + 29}" font-size="11" text-anchor="end">i = 0</text>
<text class="mono cap" x="${x0 - 16}" y="${y0 + rh + 29}" font-size="11" text-anchor="end">i = 1</text>
<text class="mono cap" x="${x0 - 16}" y="${y0 + 2 * rh + 29}" font-size="11" text-anchor="end">i = 2</text>
<line x1="${x0 - 76}" y1="${y0 + 10}" x2="${x0 - 76}" y2="${y0 + 2 * rh + 46}" stroke="var(--muted)" stroke-width="1.4" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="26" y="${y0 + 108}" font-size="11.5">внешний цикл —</text>
<text class="cap" x="26" y="${y0 + 124}" font-size="11.5">по строкам</text>

<text class="mono" x="${x0 + 3 * cw + 14}" y="${y0 + 29}" font-size="12" font-weight="700">println()</text>
<text class="cap" x="${x0 + 3 * cw + 14}" y="${y0 + 45}" font-size="10.5">строка кончилась</text>

<line x1="26" y1="${y0 + 2 * rh + 84}" x2="660" y2="${y0 + 2 * rh + 84}" stroke="var(--line)" stroke-width="1"/>
<text class="mono" x="26" y="${y0 + 2 * rh + 112}" font-size="12.5" font-weight="700">m[i][j]</text>
<text class="cap" x="110" y="${y0 + 2 * rh + 112}" font-size="11.5">порядок индексов не меняется никогда: первый — строка, второй — столбец</text>
<text class="cap" x="26" y="${y0 + 2 * rh + 130}" font-size="11.5">при обходе по столбцам местами меняются циклы, а не индексы</text>`;
  return svgWrap(`0 0 690 ${y0 + 2 * rh + 144}`, slug, "Порядок обхода матрицы", inner);
}

/* ---------------------------------------------------------------- 2.49 */

// Шесть методов Arrays одной карточкой: что было руками и что стало одной строкой.
function buildArraysTools() {
  const slug = "arrays-tools";
  const rows = [
    ["Arrays.toString(a)", "цикл печати", "видно содержимое, а не адрес"],
    ["Arrays.sort(a)", "пузырьком в 6 строк", "меняет массив на месте"],
    ["Arrays.fill(a, 7)", "цикл присваивания", "весь массив одним значением"],
    ["Arrays.copyOf(a, n)", "цикл копирования", "настоящая копия, не ссылка"],
    ["Arrays.equals(a, b)", "цикл сравнения", "== сравнил бы ссылки"],
    ["Arrays.binarySearch(a, x)", "двоичный поиск руками", "только на отсортированном"],
  ];
  const body = rows.map(([call, was, note], i) => {
    const y = 92 + i * 34;
    return `<text class="mono" x="26" y="${y}" font-size="12" font-weight="700" fill="var(--accent)">${esc(call)}</text>
<text class="cap" x="266" y="${y}" font-size="11">${esc(was)}</text>
<text class="cap" x="430" y="${y}" font-size="11">${esc(note)}</text>
<line x1="26" y1="${y + 10}" x2="660" y2="${y + 10}" stroke="var(--line)" stroke-width="0.8" opacity="0.5"/>`;
  }).join("");
  const inner = `
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="26" y="30" font-size="11.5">одна строка вместо того, что ты уже написал руками</text>
<text class="cap" x="26" y="58" font-size="11">готовый вызов</text>
<text class="cap" x="266" y="58" font-size="11">что было раньше</text>
<text class="cap" x="430" y="58" font-size="11">о чём помнить</text>
<line x1="26" y1="68" x2="660" y2="68" stroke="var(--line)" stroke-width="1"/>
${body}
<text class="cap" x="26" y="${92 + 6 * 34 + 20}" font-size="11.5">для матриц нужен deepToString: обычный toString напечатает адреса строк</text>`;
  return svgWrap(`0 0 690 ${92 + 6 * 34 + 34}`, slug, "Готовые операции над массивами", inner);
}

/* ---------------------------------------------------------------- 2.42 */

function buildArrayMemory() {
  const slug = "array-memory";
  const cellsX = [300, 355, 410, 465, 520];
  const cells = cellsX.map((x, i) => `
<rect x="${x}" y="98" width="55" height="60" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="${x + 27.5}" y="134" font-size="13" text-anchor="middle">0</text>
<text class="cap" x="${x + 27.5}" y="174" font-size="11" text-anchor="middle">${i}</text>`).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<line x1="230" y1="20" x2="230" y2="280" stroke="var(--line)" stroke-width="1.2" stroke-dasharray="3 4"/>
<text class="cap" x="115" y="36" font-size="11" text-anchor="middle">стек</text>
<text class="cap" x="430" y="36" font-size="11" text-anchor="middle">куча</text>

<rect x="20" y="64" width="180" height="96" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="cap" x="32" y="84" font-size="11">main()</text>
<rect x="32" y="96" width="156" height="36" rx="8" fill="var(--paper)" stroke="var(--muted)" stroke-width="1.2"/>
<text class="mono" x="42" y="119" font-size="12" font-weight="700">int[] a</text>
<circle cx="176" cy="114" r="4" fill="var(--accent)"/>

<path d="M180,114 C240,114 260,128 298,128" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>

<rect x="300" y="70" width="275" height="26" rx="8" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="437" y="88" font-size="11" text-anchor="middle" font-weight="700">length = 5</text>
${cells}

<text class="cap" x="320" y="230" font-size="12">переменная <tspan class="mono">a</tspan> хранит ссылку — сами данные лежат в куче</text>
<text class="mono cap" x="320" y="250" font-size="11">int[] a = new int[5]; // элементы по умолчанию 0</text>`;
  return svgWrap("0 0 640 268", slug, "Массив в памяти", inner);
}

/* ---------------------------------------------------------------- 2.47 */

function buildArray2dMemory() {
  const slug = "array2d-memory";
  const outerCell = (y, idx) => `
<rect x="210" y="${y}" width="70" height="70" rx="8" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<circle cx="260" cy="${y + 35}" r="4" fill="var(--accent)"/>
<text class="cap" x="220" y="${y + 15}" font-size="11">[${idx}]</text>`;
  const row = (y, x0, n, label) => {
    const cells = Array.from({ length: n }, (_, i) => `<rect x="${x0 + i * 50}" y="${y}" width="50" height="40" fill="var(--paper)" stroke="var(--line)" stroke-width="1.1"/>`).join("");
    const w = n * 50;
    return `<rect x="${x0}" y="${y - 24}" width="${w}" height="20" rx="6" fill="var(--paper)" stroke="var(--line)" stroke-width="1.1"/>
<text class="mono cap" x="${x0 + w / 2}" y="${y - 10}" font-size="11" text-anchor="middle">length = ${n}</text>
${cells}
<text class="cap" x="${x0}" y="${y + 56}" font-size="11">${label}</text>`;
  };
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="150" width="150" height="90" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="cap" x="32" y="170" font-size="11">main()</text>
<rect x="32" y="182" width="126" height="36" rx="8" fill="var(--paper)" stroke="var(--muted)" stroke-width="1.2"/>
<text class="mono" x="42" y="205" font-size="11" font-weight="700">int[][] m</text>
<circle cx="146" cy="200" r="4" fill="var(--accent)"/>
<path d="M170,200 C190,200 190,125 208,125" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>

<text class="mono cap" x="210" y="52" font-size="11" font-weight="700">m.length = 3</text>
${outerCell(70, 0)}
${outerCell(146, 1)}
${outerCell(222, 2)}

<path d="M280,105 C310,105 310,117 328,117" fill="none" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<path d="M280,181 C300,181 300,193 328,193" fill="none" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<path d="M280,257 C300,257 300,269 328,269" fill="none" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>

${row(117, 330, 4, "m[0].length = 4")}
${row(193, 330, 2, "m[1].length = 2")}
${row(269, 330, 5, "m[2].length = 5")}

<text class="cap" x="20" y="356" font-size="12"><tspan class="mono">int[][] m</tspan> — массив из 3 ссылок на три отдельные строки в куче: длины строк разные, это «рваный» (jagged) массив</text>`;
  return svgWrap("0 0 680 380", slug, "Двумерный массив — это массив ссылок", inner);
}
/* ---------------------------------------------------------------- 2.53 */

// Вызов метода: управление уходит и возвращается ровно на ту же строку.
// Нарисовано именно как «ушло и вернулось», потому что новички читают вызов
// как «программа перепрыгнула вниз и осталась там».
function buildMethodCall() {
  const slug = "method-call";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="26" y="24" width="286" height="150" rx="12" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono cap" x="42" y="46" font-size="11.5">main</text>
<text class="mono" x="42" y="78" font-size="12.5">println("до");</text>
<text class="mono" x="42" y="108" font-size="12.5" font-weight="700" fill="var(--accent)">greet();</text>
<text class="mono" x="42" y="140" font-size="12.5">println("после");</text>

<rect x="426" y="46" width="238" height="94" rx="12" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono cap" x="442" y="68" font-size="11.5">greet</text>
<text class="mono" x="442" y="98" font-size="12.5">println("Привет!");</text>
<text class="cap" x="442" y="120" font-size="10.5">тело выполняется целиком</text>

<line x1="316" y1="104" x2="420" y2="76" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#${slug}-arrow-accent)"/>
<line x1="420" y1="126" x2="316" y2="136" stroke="var(--muted)" stroke-width="1.4" stroke-dasharray="5 4" marker-end="url(#${slug}-arrow)"/>

<line x1="26" y1="200" x2="664" y2="200" stroke="var(--line)" stroke-width="1"/>
<line x1="26" y1="224" x2="66" y2="224" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="78" y="228" font-size="11">управление уходит в тело метода</text>
<line x1="306" y1="224" x2="346" y2="224" stroke="var(--muted)" stroke-width="1.4" stroke-dasharray="5 4" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="358" y="228" font-size="11">и возвращается на следующую строку</text>
<text class="cap" x="26" y="252" font-size="11.5">порядок вывода: «до», «Привет!», «после» — вызов не отменяет и не переносит остальные строки</text>`;
  return svgWrap("0 0 690 266", slug, "Что происходит при вызове метода", inner);
}

/* ---------------------------------------------------------------- 2.54 */

// Подпись метода как договор: что заходит, что обязано выйти. Отдельно вынесено
// поведение return — отдаёт и сразу выходит, поэтому нижние строки не читаются.
function buildParamsReturn() {
  const slug = "params-return";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .lead { stroke: var(--line); stroke-width: 1; stroke-dasharray: 3 3; }
</style>
<text class="mono" x="30" y="40" font-size="16" font-weight="700">public static double divide(int a, int b)</text>
<line class="lead" x1="188" y1="50" x2="188" y2="76"/>
<line class="lead" x1="290" y1="50" x2="290" y2="102"/>
<line class="lead" x1="400" y1="50" x2="400" y2="76"/>
<text class="cap" x="188" y="92" font-size="11" text-anchor="middle">что обязан вернуть</text>
<text class="cap" x="290" y="118" font-size="11" text-anchor="middle">как называется</text>
<text class="cap" x="400" y="92" font-size="11" text-anchor="middle">что принимает</text>

<line x1="30" y1="146" x2="660" y2="146" stroke="var(--line)" stroke-width="1"/>

<rect x="30" y="172" width="290" height="126" rx="12" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="46" y="198" font-size="12.5">if (score &gt;= 90) return "отлично";</text>
<text class="mono" x="46" y="224" font-size="12.5" font-weight="700" fill="var(--accent)">if (score &gt;= 75) return "хорошо";</text>
<text class="mono cap" x="46" y="250" font-size="12.5">if (score &gt;= 60) return "удовл";</text>
<text class="mono cap" x="46" y="276" font-size="12.5">return "не сдал";</text>
<line x1="316" y1="219" x2="360" y2="219" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${slug}-arrow-accent)"/>

<rect x="374" y="172" width="286" height="126" rx="12" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.6"/>
<text class="cap" x="390" y="198" font-size="11.5">return делает две вещи разом:</text>
<text class="cap" x="390" y="222" font-size="11.5">1. отдаёт значение наружу</text>
<text class="cap" x="390" y="246" font-size="11.5">2. немедленно завершает метод</text>
<text class="cap" x="390" y="278" font-size="11">нижние строки при score = 82 даже</text>
<text class="cap" x="390" y="292" font-size="11">не проверяются — поэтому else не нужен</text>`;
  return svgWrap("0 0 690 312", slug, "Подпись метода и поведение return", inner);
}

/* ---------------------------------------------------------------- 2.55 */

// Почему массив в методе меняется, а примитив нет. Обе картинки рядом: у int
// копируется значение, у массива — стрелка, и обе стрелки ведут в одно место.
function buildArrayParamAlias() {
  const slug = "array-param-alias";
  const box = (x, y, label, val) => `
<rect x="${x}" y="${y}" width="120" height="46" rx="9" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono cap" x="${x + 12}" y="${y + 18}" font-size="10.5">${label}</text>
<text class="mono" x="${x + 60}" y="${y + 38}" font-size="14" font-weight="700" text-anchor="middle">${val}</text>`;
  const cells = (x, y, vals) => vals.map((v, i) => `
<rect x="${x + i * 44}" y="${y}" width="40" height="36" rx="6" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.4"/>
<text class="mono" x="${x + i * 44 + 20}" y="${y + 24}" font-size="13" font-weight="700" text-anchor="middle">${v}</text>`).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="26" y="24" font-size="11.5">примитив: копируется само значение</text>
${box(26, 34, "x в main", "5")}
${box(206, 34, "v в методе", "5")}
<line x1="150" y1="57" x2="200" y2="57" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>
<text class="mono" x="352" y="52" font-size="12" font-weight="700" fill="var(--bad)">v = 100</text>
<text class="cap" x="352" y="68" font-size="10.5" fill="var(--bad)">меняет только копию</text>

<line x1="26" y1="102" x2="660" y2="102" stroke="var(--line)" stroke-width="1"/>

<text class="cap" x="26" y="128" font-size="11.5">массив: копируется ссылка — обе стрелки ведут в одно место</text>
${box(26, 138, "arr в main", "→")}
${box(206, 138, "a в методе", "→")}
${cells(430, 142, [4, 8, 15])}
<line x1="86" y1="184" x2="140" y2="230" stroke="var(--accent)" stroke-width="1.5"/>
<line x1="140" y1="230" x2="470" y2="230" stroke="var(--accent)" stroke-width="1.5"/>
<line x1="470" y1="230" x2="470" y2="184" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${slug}-arrow-accent)"/>
<line x1="326" y1="161" x2="424" y2="161" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${slug}-arrow-accent)"/>

<text class="mono" x="26" y="264" font-size="12" font-weight="700" fill="var(--accent)">a[0] = 0</text>
<text class="cap" x="112" y="264" font-size="11">меняет тот самый массив — видно и снаружи</text>
<text class="mono" x="26" y="286" font-size="12" font-weight="700" fill="var(--bad)">a = new int[]{…}</text>
<text class="cap" x="176" y="286" font-size="11">переставляет только локальную стрелку — снаружи ничего не изменилось</text>`;
  return svgWrap("0 0 690 300", slug, "Что копируется при передаче массива в метод", inner);
}

/* ---------------------------------------------------------------- 2.56 */

// Разрешение перегрузки: сначала точное совпадение, потом расширение по лестнице.
function buildOverloadPick() {
  const slug = "overload-pick";
  const cand = (y, sig, mark, note) => `
<rect x="220" y="${y}" width="200" height="38" rx="9" fill="${mark === "hit" ? "var(--sunk, var(--paper))" : "var(--paper)"}" stroke="${mark === "hit" ? "var(--accent)" : "var(--line)"}" stroke-width="${mark === "hit" ? 1.7 : 1.2}" ${mark === "skip" ? 'stroke-dasharray="5 4"' : ""}/>
<text class="mono" x="320" y="${y + 24}" font-size="12.5" font-weight="700" text-anchor="middle" fill="${mark === "skip" ? "var(--muted)" : "var(--ink)"}">${esc(sig)}</text>
<text class="cap" x="436" y="${y + 23}" font-size="11" fill="${mark === "hit" ? "var(--accent)" : "var(--muted)"}">${esc(note)}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="26" y="42" font-size="15" font-weight="700">show(5)</text>
<text class="cap" x="26" y="60" font-size="10.5">аргумент типа int</text>
<line x1="130" y1="37" x2="214" y2="37" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
${cand(22, "show(int)", "hit", "точное совпадение — берём")}
${cand(70, "show(long)", "skip", "подошло бы расширением")}
${cand(118, "show(double)", "skip", "тоже подошло бы, но дальше")}

<line x1="26" y1="176" x2="664" y2="176" stroke="var(--line)" stroke-width="1"/>

<text class="mono" x="26" y="216" font-size="15" font-weight="700">show('a')</text>
<text class="cap" x="26" y="234" font-size="10.5">аргумент типа char</text>
<line x1="130" y1="211" x2="214" y2="211" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
${cand(196, "show(int)", "hit", "ближайшее расширение char → int")}
${cand(244, "show(double)", "skip", "дальше по лестнице")}

<text class="cap" x="26" y="316" font-size="11.5">по типу результата перегрузки не различаются: при вызове компилятор смотрит только на аргументы</text>`;
  return svgWrap("0 0 690 330", slug, "Как выбирается перегрузка", inner);
}

/* ---------------------------------------------------------------- 2.57 */

// Область видимости вложенными рамками. Изнутри видно наружу, снаружи внутрь нет.
function buildScopeBlocks() {
  const slug = "scope-blocks";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="26" y="20" width="420" height="252" rx="14" fill="var(--paper)" stroke="var(--line)" stroke-width="1.4"/>
<text class="mono cap" x="42" y="42" font-size="11.5">метод main { }</text>
<text class="mono" x="42" y="70" font-size="12.5" font-weight="700">int outer = 1;</text>

<rect x="58" y="88" width="372" height="112" rx="12" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.5"/>
<text class="mono cap" x="74" y="110" font-size="11.5">for (int i = 0; …) { }</text>
<text class="mono" x="74" y="136" font-size="12.5" font-weight="700">i</text>
<text class="cap" x="92" y="136" font-size="11">живёт только здесь</text>

<rect x="90" y="150" width="322" height="38" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="106" y="174" font-size="12.5" font-weight="700">int inner = 2;</text>
<text class="cap" x="240" y="174" font-size="11">видит и outer, и i</text>

<text class="mono" x="42" y="230" font-size="12.5">System.out.println(outer);</text>
<text class="cap" x="240" y="230" font-size="11">видит только outer</text>
<text class="mono cap" x="42" y="254" font-size="12.5">System.out.println(i);</text>
<text class="cap" x="240" y="254" font-size="11" fill="var(--bad)">cannot find symbol</text>

<line x1="480" y1="170" x2="480" y2="70" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="496" y="120" font-size="11" fill="var(--accent)">изнутри</text>
<text class="cap" x="496" y="134" font-size="11" fill="var(--accent)">видно наружу</text>
<line x1="560" y1="70" x2="560" y2="170" stroke="var(--bad)" stroke-width="1.6" stroke-dasharray="5 4"/>
<line x1="548" y1="158" x2="572" y2="182" stroke="var(--bad)" stroke-width="1.8"/>
<line x1="572" y1="158" x2="548" y2="182" stroke="var(--bad)" stroke-width="1.8"/>
<text class="cap" x="576" y="120" font-size="11" fill="var(--bad)">снаружи</text>
<text class="cap" x="576" y="134" font-size="11" fill="var(--bad)">внутрь — нет</text>

<text class="cap" x="26" y="298" font-size="11.5">переменная живёт от объявления до закрывающей скобки своего блока — из этого следуют все случаи</text>`;
  return svgWrap("0 0 690 312", slug, "Области видимости вложенными блоками", inner);
}

/* ---------------------------------------------------------------- 2.59 */

// Один и тот же код до и после разбиения. Слева сплошная лента, справа main из
// трёх строк и три коробочки под ним — видно, что строк стало больше, а читать
// стало меньше.
function buildDecompose() {
  const slug = "decompose";
  const line = (x, y, w, dim) =>
    `<rect x="${x}" y="${y}" width="${w}" height="7" rx="3.5" fill="${dim ? "var(--line)" : "var(--muted)"}" opacity="${dim ? 0.7 : 0.5}"/>`;
  let dense = "";
  [210, 176, 198, 160, 205, 188, 170, 200, 182, 192, 165, 195].forEach((w, i) => {
    dense += line(42, 62 + i * 15, w, true);
  });
  const chunk = (x, y, title, lines) => {
    let out = `<rect x="${x}" y="${y}" width="228" height="${28 + lines * 15}" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="${x + 14}" y="${y + 20}" font-size="11.5" font-weight="700" fill="var(--accent)">${esc(title)}</text>`;
    for (let i = 0; i < lines; i++) out += line(x + 14, y + 30 + i * 15, 150 - i * 8, true);
    return out;
  };
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="26" y="30" font-size="11.5">один сплошной main</text>
<rect x="26" y="42" width="256" height="200" rx="12" fill="var(--sunk, var(--paper))" stroke="var(--line)" stroke-width="1.3"/>
${dense}
<text class="cap" x="26" y="264" font-size="11">чтобы понять, что делает программа,</text>
<text class="cap" x="26" y="280" font-size="11">надо прочитать всё</text>

<line x1="304" y1="140" x2="344" y2="140" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#${slug}-arrow-accent)"/>

<text class="cap" x="366" y="30" font-size="11.5">main как оглавление</text>
<rect x="366" y="42" width="228" height="66" rx="12" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono" x="380" y="64" font-size="11.5">readData();</text>
<text class="mono" x="380" y="82" font-size="11.5">sortCopy();</text>
<text class="mono" x="380" y="100" font-size="11.5">printReport();</text>
${chunk(366, 122, "readData", 2)}
${chunk(366, 194, "sortCopy", 2)}
<text class="cap" x="366" y="264" font-size="11">строк стало больше,</text>
<text class="cap" x="366" y="280" font-size="11">а читать — меньше</text>`;
  return svgWrap("0 0 640 292", slug, "Один main против разбиения на методы", inner);
}

/* ---------------------------------------------------------------- 2.61 */

// База и шаг. Спуск до базы и сборка ответа на обратном пути — на одной картинке,
// потому что именно связку «вниз до базы, вверх со значениями» и не удерживают в
// голове с первого раза.
function buildRecursionBase() {
  const slug = "recursion-base";
  const level = (i, n, val) => {
    const y = 52 + i * 46;
    const x = 80 + i * 30;
    return `
<rect x="${x}" y="${y}" width="290" height="34" rx="9" fill="${n === 1 ? "var(--sunk, var(--paper))" : "var(--paper)"}" stroke="${n === 1 ? "var(--accent)" : "var(--line)"}" stroke-width="${n === 1 ? 1.7 : 1.2}"/>
<text class="mono" x="${x + 14}" y="${y + 22}" font-size="12.5" font-weight="700">factorial(${n})</text>
<text class="cap" x="${x + 120}" y="${y + 22}" font-size="10.5">${n === 1 ? "база — ответ известен сразу" : `= ${n} × factorial(${n - 1})`}</text>
<text class="mono" x="512" y="${y + 22}" font-size="13" font-weight="700" fill="var(--accent)">${val}</text>`;
  };
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="26" y="30" font-size="11.5">шаг: спускаемся, уменьшая аргумент</text>
<text class="cap" x="500" y="30" font-size="11.5" fill="var(--accent)">что вернулось</text>
${level(0, 4, "24")}
${level(1, 3, "6")}
${level(2, 2, "2")}
${level(3, 1, "1")}
<line x1="50" y1="58" x2="50" y2="228" stroke="var(--muted)" stroke-width="1.4" marker-end="url(#${slug}-arrow)"/>
<line x1="566" y1="228" x2="566" y2="64" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="582" y="150" font-size="10.5" fill="var(--accent)">обратный</text>
<text class="cap" x="582" y="164" font-size="10.5" fill="var(--accent)">путь</text>
<text class="cap" x="26" y="262" font-size="11.5">без базы спуск не останавливается, и стек кончается — StackOverflowError</text>
<text class="cap" x="26" y="280" font-size="11.5">если шаг не уменьшает аргумент, база недостижима, и это то же самое</text>`;
  return svgWrap("0 0 700 294", slug, "База и шаг рекурсии", inner);
}

/* ---------------------------------------------------------------- 2.66 */

// Четыре соглашения об именах одной карточкой: по виду имени сразу видно, что это.
function buildNamingCases() {
  const slug = "naming-cases";
  const rows = [
    ["класс", "PascalCase", "OrderTotal", "существительное с заглавной"],
    ["метод", "camelCase", "applyDiscount", "глагол со строчной"],
    ["переменная", "camelCase", "orderTotal", "существительное со строчной"],
    ["константа", "UPPER_SNAKE", "DISCOUNT_LIMIT", "заглавные через подчёркивание"],
    ["пакет", "lowercase", "java.util", "всё строчными"],
  ];
  const body = rows.map(([what, style, example, note], i) => {
    const y = 86 + i * 36;
    return `<text class="cap" x="26" y="${y}" font-size="11.5">${esc(what)}</text>
<text class="mono" x="140" y="${y}" font-size="12" font-weight="700">${esc(style)}</text>
<text class="mono" x="300" y="${y}" font-size="12.5" font-weight="700" fill="var(--accent)">${esc(example)}</text>
<text class="cap" x="470" y="${y}" font-size="11">${esc(note)}</text>
<line x1="26" y1="${y + 10}" x2="660" y2="${y + 10}" stroke="var(--line)" stroke-width="0.8" opacity="0.5"/>`;
  }).join("");
  const inner = `
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="26" y="28" font-size="11.5">по виду имени сразу видно, что это за сущность</text>
<text class="cap" x="26" y="56" font-size="11">что</text>
<text class="cap" x="140" y="56" font-size="11">регистр</text>
<text class="cap" x="300" y="56" font-size="11">пример</text>
<text class="cap" x="470" y="56" font-size="11">правило</text>
<line x1="26" y1="66" x2="660" y2="66" stroke="var(--line)" stroke-width="1"/>
${body}
<text class="cap" x="26" y="${86 + 5 * 36 + 18}" font-size="11.5">имя с заглавной — класс; ЗАГЛАВНЫЕ_С_ПОДЧЁРКИВАНИЕМ — константа. Это подсказка при чтении чужого кода</text>`;
  return svgWrap(`0 0 690 ${86 + 5 * 36 + 32}`, slug, "Четыре соглашения об именах", inner);
}

/* ---------------------------------------------------------------- 2.67 */

// Панель отладчика: где что находится и что делает каждая кнопка. Картинка
// нужна затем, чтобы человек узнал элементы, когда откроет IDE, — словами их
// описывать бесполезно.
function buildDebuggerPanel() {
  const slug = "debugger-panel";
  const codeLine = (i, text, stopped) => {
    const y = 62 + i * 24;
    return `${stopped ? `<rect x="40" y="${y - 15}" width="320" height="21" rx="4" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.3"/>` : ""}
${i === 2 ? `<circle cx="32" cy="${y - 5}" r="6" fill="var(--bad)"/>` : ""}
<text class="mono cap" x="46" y="${y}" font-size="11.5" fill="${stopped ? "var(--ink)" : "var(--muted)"}">${esc(text)}</text>`;
  };
  const varRow = (i, name, val) => {
    const y = 62 + i * 24;
    return `<text class="mono" x="416" y="${y}" font-size="11.5" font-weight="700">${esc(name)}</text>
<text class="mono" x="530" y="${y}" font-size="11.5" fill="var(--accent)">${esc(val)}</text>`;
  };
  const key = (x, label, what) => `
<rect x="${x}" y="196" width="150" height="46" rx="9" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="${x + 14}" y="${x === 26 ? 216 : 216}" font-size="12" font-weight="700">${esc(label)}</text>
<text class="cap" x="${x + 14}" y="232" font-size="10.5">${esc(what)}</text>`;
  const inner = `
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="26" y="30" font-size="11.5">редактор с точкой останова</text>
<rect x="20" y="40" width="356" height="136" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
${codeLine(0, "int[] a = {4, 8, 15, 16};", false)}
${codeLine(1, "int sum = 0;", false)}
${codeLine(2, "    sum += a[i];", true)}
${codeLine(3, "    if (sum > 20) sum = 0;", false)}
${codeLine(4, "System.out.println(sum);", false)}

<text class="cap" x="404" y="30" font-size="11.5">панель переменных</text>
<rect x="398" y="40" width="266" height="136" rx="10" fill="var(--sunk, var(--paper))" stroke="var(--accent)" stroke-width="1.4"/>
${varRow(0, "i", "2")}
${varRow(1, "sum", "12")}
${varRow(2, "a", "{4, 8, 15, 16}")}
<text class="cap" x="416" y="158" font-size="10.5">видно всё сразу, без единого println</text>

${key(26, "F8  Step Over", "выполнить строку целиком")}
${key(190, "F7  Step Into", "зайти внутрь метода")}
${key(354, "F9  Resume", "до следующей точки")}
<text class="cap" x="518" y="216" font-size="11">красная точка слева —</text>
<text class="cap" x="518" y="232" font-size="11">программа замрёт перед строкой</text>`;
  return svgWrap("0 0 700 256", slug, "Панель отладчика: что где находится", inner);
}

/* ---------------------------------------------------------------- 2.62 */

function buildCallStack() {
  const slug = "call-stack";
  const frames = [
    { n: 0, y: 20, body: "return 0 — базовый случай" },
    { n: 1, y: 100, body: "return 1 + sumTo(0)" },
    { n: 2, y: 180, body: "return 2 + sumTo(1)" },
    { n: 3, y: 260, body: "return 3 + sumTo(2)" },
  ];
  const frameHtml = frames.map((f) => `
<rect x="40" y="${f.y}" width="280" height="70" rx="10" fill="var(--paper)" stroke="${f.n === 0 ? "var(--accent)" : "var(--line)"}" stroke-width="${f.n === 0 ? 1.5 : 1.2}"/>
<text class="mono" x="56" y="${f.y + 26}" font-size="13" font-weight="700">sumTo(${f.n})</text>
<text class="mono cap" x="56" y="${f.y + 44}" font-size="11">n = ${f.n}</text>
<text class="cap" x="56" y="${f.y + 60}" font-size="11">${f.body}</text>`).join("");
  const chips = [
    { y: 20, t: "0" }, { y: 100, t: "1 + 0 = 1" }, { y: 180, t: "2 + 1 = 3" }, { y: 260, t: "3 + 3 = 6" },
  ];
  const chipHtml = chips.map((c, i) => `
<rect x="340" y="${c.y + 20}" width="130" height="30" rx="8" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.2"/>
<text class="mono" x="405" y="${c.y + 40}" font-size="11" text-anchor="middle" fill="var(--accent)">${c.t}</text>
${i < 3 ? `<line x1="405" y1="${c.y + 50}" x2="405" y2="${c.y + 90}" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>` : ""}`).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="40" y="12" font-size="11">стек растёт вверх — новый вызов сверху</text>
${frameHtml}
${chipHtml}
<line x1="405" y1="310" x2="405" y2="336" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<rect x="340" y="336" width="130" height="30" rx="8" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.3"/>
<text x="405" y="356" font-size="12" text-anchor="middle" fill="var(--ok)" font-weight="700">итог: 6</text>

<rect x="20" y="380" width="450" height="34" rx="10" fill="var(--paper)" stroke="var(--gold)" stroke-width="1.2"/>
<text class="cap" x="245" y="401" font-size="11" text-anchor="middle">без базового случая фреймы копились бы, пока не кончится память — StackOverflowError</text>`;
  return svgWrap("0 0 560 424", slug, "Стек вызовов при рекурсии", inner);
}

/* ---------------------------------------------------------------- 3.01 */

// Класс — чертёж, объекты — то, что по нему собрали. Слева одно описание,
// справа три штуки, у каждой свои значения в одинаковых по имени полях.
function buildClassBlueprint() {
  const slug = "class-blueprint";
  const objs = [
    { y: 30, id: "Item@1a2b", name: '"винт"', price: "12" },
    { y: 132, id: "Item@3c4d", name: '"гайка"', price: "8" },
    { y: 234, id: "Item@5e6f", name: '"шайба"', price: "3" },
  ];
  const objHtml = objs.map((o) => `
<rect x="352" y="${o.y}" width="248" height="84" rx="12" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.4"/>
<text class="mono cap" x="366" y="${o.y + 20}" font-size="10.5">${o.id}</text>
<text class="mono" x="366" y="${o.y + 44}" font-size="12" font-weight="700">name = ${esc(o.name)}</text>
<text class="mono" x="366" y="${o.y + 66}" font-size="12" font-weight="700">price = ${o.price}</text>
<path d="M312,${o.y + 42} L348,${o.y + 42}" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="mono cap" x="318" y="${o.y + 32}" font-size="10.5">new</text>`).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="150" y="16" font-size="11" text-anchor="middle">пишется один раз</text>
<text class="cap" x="476" y="16" font-size="11" text-anchor="middle">создаётся сколько угодно раз</text>

<rect x="20" y="30" width="264" height="152" rx="12" fill="var(--paper)" stroke="var(--line)" stroke-width="1.6" stroke-dasharray="6 4"/>
<text class="mono" x="36" y="56" font-size="12.5" font-weight="700">class Item {</text>
<text class="mono" x="52" y="82" font-size="12.5">String name;</text>
<text class="mono" x="52" y="106" font-size="12.5">int price;</text>
<text class="mono" x="36" y="132" font-size="12.5" font-weight="700">}</text>
<text class="cap" x="36" y="162" font-size="11">памяти под данные — ноль</text>
<path d="M284,106 L312,106 L312,276" fill="none" stroke="var(--accent)" stroke-width="1.4"/>

<line x1="20" y1="330" x2="600" y2="330" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="352" font-size="12">чертёж задаёт <tspan font-weight="700">какие</tspan> поля будут; сколько их физически — решает число вызовов <tspan class="mono" font-weight="700">new</tspan></text>
${objHtml}`;
  return svgWrap("0 0 620 366", slug, "Класс и объекты", inner);
}

/* ---------------------------------------------------------------- 3.03 */

// У каждого объекта свой комплект полей. Плюс таблица значений по умолчанию:
// это то, чем поле отличается от локальной переменной сильнее всего.
function buildFieldsPerObject() {
  const slug = "fields-per-object";
  const cell = (x, y, w, label, val, accent) => `
<rect x="${x}" y="${y}" width="${w}" height="30" rx="7" fill="var(--paper)" stroke="var(--${accent ? "accent" : "line"})" stroke-width="1.2"/>
<text class="mono cap" x="${x + 10}" y="${y + 20}" font-size="10.5">${label}</text>
<text class="mono" x="${x + w - 10}" y="${y + 20}" font-size="12" font-weight="700" text-anchor="end">${esc(val)}</text>`;
  const box = (x, title, vals, accent) => `
<rect x="${x}" y="46" width="176" height="112" rx="12" fill="none" stroke="var(--${accent ? "accent" : "line"})" stroke-width="1.4"/>
<text class="mono cap" x="${x + 12}" y="66" font-size="10.5">${title}</text>
${cell(x + 12, 76, 152, "count", vals[0], accent)}
${cell(x + 12, 116, 152, "name", vals[1], accent)}`;
  const rowsDefault = [
    ["int, long", "0"], ["double", "0.0"], ["boolean", "false"], ["String, массив", "null"],
  ];
  const defHtml = rowsDefault.map(([t, v], i) => `
<text class="mono cap" x="34" y="${262 + i * 26}" font-size="11.5">${t}</text>
<text class="mono" x="230" y="${262 + i * 26}" font-size="11.5" font-weight="700" text-anchor="end">${v}</text>`).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="20" y="18" font-size="11">одно объявление в классе — свой комплект в каждом объекте</text>
<text class="mono cap" x="20" y="38" font-size="11">int count;  String name;</text>

${box(20, "Item@1a2b", ["400", '"винт"'], true)}
${box(212, "Item@3c4d", ["950", '"гайка"'], true)}
${box(404, "Item@5e6f", ["0", "null"], false)}
<text class="cap" x="492" y="176" font-size="10.5" text-anchor="middle">полям ничего не присвоили</text>

<line x1="20" y1="198" x2="580" y2="198" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="220" font-size="12" font-weight="700">значения по умолчанию</text>
<text class="cap" x="20" y="238" font-size="11">их получает любое поле до первого присваивания</text>
${defHtml}
<rect x="300" y="252" width="280" height="90" rx="10" fill="var(--paper)" stroke="var(--gold)" stroke-width="1.2"/>
<text class="cap" x="316" y="276" font-size="11">у локальной переменной значения</text>
<text class="cap" x="316" y="294" font-size="11">по умолчанию нет: компилятор</text>
<text class="cap" x="316" y="312" font-size="11">потребует присвоить до чтения</text>
<text class="mono cap" x="316" y="333" font-size="10.5">might not have been initialized</text>`;
  return svgWrap("0 0 600 356", slug, "Поля принадлежат объекту", inner);
}

/* ---------------------------------------------------------------- 3.04 */

// Код метода один на всех, а поле — у каждого своё. Схема отвечает на вопрос
// «какое именно value меняет value++», который и есть суть методов экземпляра.
function buildMethodOnObject() {
  const slug = "method-on-object";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="300" y="14" font-size="11" text-anchor="middle">код один, написан в классе</text>
<rect x="180" y="24" width="240" height="86" rx="12" fill="var(--paper)" stroke="var(--line)" stroke-width="1.6" stroke-dasharray="6 4"/>
<text class="mono" x="196" y="48" font-size="12.5" font-weight="700">void inc() {</text>
<text class="mono" x="212" y="72" font-size="12.5">value++;</text>
<text class="mono" x="196" y="94" font-size="12.5" font-weight="700">}</text>

<rect x="20" y="180" width="230" height="104" rx="12" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.4"/>
<text class="mono cap" x="34" y="202" font-size="10.5">Counter@1a2b</text>
<text class="mono" x="34" y="228" font-size="13" font-weight="700">value = 2</text>
<text class="mono cap" x="34" y="252" font-size="11">a.inc();  a.inc();</text>
<text class="cap" x="34" y="272" font-size="11">два раза позвали у a</text>

<rect x="350" y="180" width="230" height="104" rx="12" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.4"/>
<text class="mono cap" x="364" y="202" font-size="10.5">Counter@3c4d</text>
<text class="mono" x="364" y="228" font-size="13" font-weight="700">value = 1</text>
<text class="mono cap" x="364" y="252" font-size="11">b.inc();</text>
<text class="cap" x="364" y="272" font-size="11">один раз позвали у b</text>

<path d="M240,114 C200,140 170,154 136,176" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M360,114 C400,140 430,154 464,176" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="mono cap" x="150" y="148" font-size="11" text-anchor="end">a.inc()</text>
<text class="mono cap" x="452" y="148" font-size="11">b.inc()</text>

<line x1="20" y1="306" x2="580" y2="306" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="328" font-size="12">имя <tspan class="mono" font-weight="700">value</tspan> внутри метода означает поле <tspan font-weight="700">того объекта</tspan>, у которого метод позвали</text>
<text class="cap" x="20" y="348" font-size="12">поэтому <tspan class="mono" font-weight="700">Counter.inc()</tspan> без объекта не собирается: непонятно, чьё <tspan class="mono">value</tspan> трогать</text>`;
  return svgWrap("0 0 600 364", slug, "Метод объекта: код один, поля разные", inner);
}

/* ---------------------------------------------------------------- 3.05 */

// Пять шагов new. Ценность схемы в том, что тело конструктора идёт последним:
// отсюда видно, почему оно перебивает инициализацию в объявлении поля.
function buildCtorFlow() {
  const slug = "ctor-flow";
  const steps = [
    ["1", "выделить память", "объект есть, полей ещё нет"],
    ["2", "значения по умолчанию", "name = null,  price = 0"],
    ["3", "инициализаторы полей", "то, что написано через = у поля"],
    ["4", "тело конструктора", "сюда попадают твои аргументы"],
    ["5", "вернуть ссылку", "объект готов, отдаём в переменную"],
  ];
  const rows = steps.map(([n, title, note], i) => {
    const y = 44 + i * 60;
    const last = i === steps.length - 1;
    const accent = i === 3;
    return `
<circle cx="44" cy="${y + 22}" r="15" fill="var(--paper)" stroke="var(--${accent ? "accent" : "line"})" stroke-width="1.4"/>
<text x="44" y="${y + 27}" font-size="12.5" font-weight="700" text-anchor="middle" fill="var(--${accent ? "accent" : "muted"})">${n}</text>
<rect x="76" y="${y}" width="470" height="44" rx="10" fill="var(--paper)" stroke="var(--${accent ? "accent" : "line"})" stroke-width="${accent ? 1.5 : 1.2}"/>
<text x="92" y="${y + 20}" font-size="12.5" font-weight="700">${title}</text>
<text class="mono cap" x="92" y="${y + 37}" font-size="11">${esc(note)}</text>
${last ? "" : `<line x1="44" y1="${y + 38}" x2="44" y2="${y + 58}" stroke="var(--line)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>`}`;
  }).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="20" y="24" font-size="12.5" font-weight="700">new Item("винт", 12)</text>
${rows}
<line x1="20" y1="368" x2="560" y2="368" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="390" font-size="12">тело конструктора идёт <tspan font-weight="700">последним</tspan> — поэтому оно перебивает шаги 2 и 3</text>`;
  return svgWrap("0 0 580 406", slug, "Что происходит при new", inner);
}

/* ---------------------------------------------------------------- 3.06 */

// this.name = name — единственная строка, ради которой существует нода.
// Схема разводит две стороны присваивания и показывает, что без this
// обе стороны означают параметр.
function buildThisArrow() {
  const slug = "this-arrow";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .bad { fill: var(--bad); }
</style>
<text class="mono cap" x="20" y="18" font-size="11">Item(String name, int price) {</text>

<rect x="20" y="34" width="560" height="120" rx="12" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.4"/>
<text class="mono" x="150" y="70" font-size="17" font-weight="700">this.name</text>
<text class="mono" x="290" y="70" font-size="17">=</text>
<text class="mono" x="330" y="70" font-size="17" font-weight="700">name;</text>

<path d="M186,84 L186,110" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="186" y="128" font-size="11.5" text-anchor="middle">поле объекта</text>
<text class="cap" x="186" y="144" font-size="11" text-anchor="middle">this — вот этот, текущий</text>

<path d="M360,84 L360,110" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="360" y="128" font-size="11.5" text-anchor="middle">параметр конструктора</text>
<text class="cap" x="360" y="144" font-size="11" text-anchor="middle">простое имя — побеждает местное</text>

<rect x="20" y="176" width="270" height="104" rx="12" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.3"/>
<text class="mono bad" x="36" y="204" font-size="14" font-weight="700">name = name;</text>
<text class="cap" x="36" y="228" font-size="11">обе стороны — параметр</text>
<text class="cap" x="36" y="246" font-size="11">поле остаётся null</text>
<text class="cap" x="36" y="266" font-size="11">не падает, не ругается, не работает</text>

<rect x="310" y="176" width="270" height="104" rx="12" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.3"/>
<text class="mono" x="326" y="204" font-size="14" font-weight="700">this.name = name;</text>
<text class="cap" x="326" y="228" font-size="11">слева поле, справа параметр</text>
<text class="cap" x="326" y="246" font-size="11">имена совпадают — и хорошо</text>
<text class="cap" x="326" y="266" font-size="11">подсказка IDEA читается по-человечески</text>

<line x1="20" y1="302" x2="580" y2="302" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="324" font-size="12">в остальных методах <tspan class="mono" font-weight="700">this.</tspan> подставляется сам — писать его надо только там, где имя перекрыто</text>`;
  return svgWrap("0 0 600 340", slug, "this.name = name", inner);
}

/* ---------------------------------------------------------------- 3.02 */

function buildStackHeapRefs() {
  const slug = "stack-heap-refs";
  const slot = (y, name) => `
<rect x="20" y="${y}" width="180" height="50" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="34" y="${y + 31}" font-size="12" font-weight="700">${name}</text>
<circle cx="184" cy="${y + 25}" r="4" fill="var(--accent)"/>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<line x1="230" y1="16" x2="230" y2="270" stroke="var(--line)" stroke-width="1.2" stroke-dasharray="3 4"/>
<text class="cap" x="115" y="32" font-size="11" text-anchor="middle">стек</text>
<text class="cap" x="430" y="32" font-size="11" text-anchor="middle">куча</text>

${slot(50, "Dog a")}
${slot(112, "Dog b")}
${slot(174, "Dog d = null")}

<rect x="380" y="50" width="220" height="80" rx="12" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.4"/>
<text class="mono cap" x="392" y="70" font-size="11">Dog@1a2b3c</text>
<text class="mono" x="392" y="92" font-size="12" font-weight="700">name = "Рекс"</text>
<text class="cap" x="392" y="112" font-size="11">на этот объект смотрят оба</text>

<rect x="380" y="160" width="220" height="80" rx="12" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono cap" x="392" y="180" font-size="11">Dog@3f4c9d</text>
<text class="mono" x="392" y="202" font-size="12" font-weight="700">name = "Барсик"</text>
<text class="cap" x="392" y="222" font-size="11">никто не ссылается → под GC</text>

<path d="M200,63 C280,63 300,80 378,84" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M200,125 C260,125 320,98 378,96" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>

<path d="M200,192 C216,192 216,214 216,214" fill="none" stroke="var(--bad)" stroke-width="1.4" marker-end="url(#${slug}-arrow)"/>
<circle cx="230" cy="222" r="12" fill="none" stroke="var(--bad)" stroke-width="1.3"/>
<text x="230" y="226" font-size="11" text-anchor="middle" fill="var(--bad)">∅</text>
<text class="cap" x="230" y="250" font-size="11" text-anchor="middle" fill="var(--bad)">d.bark() → NPE</text>

<line x1="20" y1="290" x2="600" y2="290" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="310" font-size="12"><tspan class="mono" font-weight="700">a == b</tspan> — сравнивает стрелки: <tspan fill="var(--ok)">true</tspan>, ссылка одна и та же</text>
<text class="cap" x="20" y="328" font-size="12"><tspan class="mono" font-weight="700">a.equals(new Dog("Рекс"))</tspan> — сравнивает содержимое полей</text>`;
  return svgWrap("0 0 620 340", slug, "Стек, куча и ссылки", inner);
}

/* ---------------------------------------------------------------- 3.08 */

// Что принадлежит классу, а что объекту. Слева коробка класса с одним общим
// счётчиком, справа объекты со своими полями; обращение идёт по разным адресам.
function buildStaticVsInstance() {
  const slug = "static-vs-instance";
  const obj = (x, id, name, num) => `
<rect x="${x}" y="176" width="164" height="86" rx="12" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono cap" x="${x + 12}" y="196" font-size="10.5">${id}</text>
<text class="mono" x="${x + 12}" y="220" font-size="12" font-weight="700">name = ${esc(name)}</text>
<text class="mono" x="${x + 12}" y="242" font-size="12" font-weight="700">number = ${num}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="34" width="560" height="98" rx="14" fill="none" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono" x="36" y="26" font-size="12" font-weight="700">class Ticket</text>
<text class="cap" x="576" y="26" font-size="11" text-anchor="end">живёт с загрузки класса, до всякого new</text>

<rect x="40" y="56" width="240" height="56" rx="10" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.4"/>
<text class="mono cap" x="54" y="76" font-size="10.5">static int lastNumber</text>
<text class="mono" x="54" y="100" font-size="15" font-weight="700">3</text>
<text class="cap" x="300" y="80" font-size="11.5">одно значение на весь класс</text>
<text class="mono cap" x="300" y="100" font-size="11">доступ: Ticket.lastNumber</text>

${obj(20, "Ticket@1a2b", '"первый"', "1")}
${obj(206, "Ticket@3c4d", '"второй"', "2")}
${obj(392, "Ticket@5e6f", '"третий"', "3")}
<path d="M102,132 L102,172" fill="none" stroke="var(--line)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<path d="M288,132 L288,172" fill="none" stroke="var(--line)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<path d="M474,132 L474,172" fill="none" stroke="var(--line)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="20" y="284" font-size="11">у каждого объекта свой комплект обычных полей — доступ через объект</text>

<line x1="20" y1="300" x2="580" y2="300" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="322" font-size="12">детектор: если у двух объектов значение <tspan font-weight="700">должно различаться</tspan> — поле не static</text>
<text class="cap" x="20" y="342" font-size="12">у статического метода объекта нет — отсюда <tspan class="mono">non-static variable …</tspan></text>`;
  return svgWrap("0 0 600 358", slug, "Что принадлежит классу, а что объекту", inner);
}

/* ---------------------------------------------------------------- 3.09 */

// Два слова — два разных запрета. И главное: final замораживает переменную,
// а не объект по ссылке; на этом спотыкаются все.
function buildConstFinal() {
  const slug = "const-final";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="20" y="30" font-size="15" font-weight="700">static final int MAX_SIZE = 100;</text>
<path d="M56,42 L56,66" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M152,42 L152,66" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M300,42 L300,66" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="20" y="82" font-size="11">одно на класс</text>
<text class="cap" x="112" y="82" font-size="11">присвоить один раз</text>
<text class="cap" x="258" y="82" font-size="11">КАПС — значит константа</text>

<line x1="20" y1="104" x2="580" y2="104" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="126" font-size="12" font-weight="700">final замораживает переменную, а не объект по ссылке</text>

<rect x="20" y="140" width="270" height="118" rx="12" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.3"/>
<text class="mono" x="36" y="166" font-size="12.5" font-weight="700">final int[] arr = {1, 2, 3};</text>
<text class="mono" x="36" y="192" font-size="12.5">arr[0] = 99;</text>
${checkIcon(232, 180, 15)}
<text class="cap" x="36" y="214" font-size="11">содержимое меняется свободно</text>
<text class="cap" x="36" y="234" font-size="11">final про него ничего не говорил</text>

<rect x="310" y="140" width="270" height="118" rx="12" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.3"/>
<text class="mono" x="326" y="166" font-size="12.5" font-weight="700">final int[] arr = {1, 2, 3};</text>
<text class="mono" x="326" y="192" font-size="12.5">arr = new int[]{9};</text>
${crossIcon(524, 181, 13)}
<text class="cap" x="326" y="214" font-size="11">адрес переписать нельзя</text>
<text class="mono cap" x="326" y="234" font-size="10.5">cannot assign a value to</text>
<text class="mono cap" x="326" y="250" font-size="10.5">final variable arr</text>

<line x1="20" y1="282" x2="580" y2="282" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="304" font-size="12">поэтому <tspan class="mono" font-weight="700">static final int[] SIZES</tspan> — константа только на вид: элементы правит кто угодно</text>`;
  return svgWrap("0 0 600 320", slug, "static final: два слова, два запрета", inner);
}

/* ---------------------------------------------------------------- 3.10 */

// Таймлайн рождения объекта: разовая статическая часть слева, повторяемая
// часть объекта справа. Видно, что при втором new первые два шага пропущены.
function buildInitOrder() {
  const slug = "init-order";
  const step = (x, y, w, n, text, accent) => `
<rect x="${x}" y="${y}" width="${w}" height="34" rx="9" fill="var(--paper)" stroke="var(--${accent ? "accent" : "line"})" stroke-width="1.3"/>
<text class="mono cap" x="${x + 10}" y="${y + 22}" font-size="10.5">${n}</text>
<text x="${x + 30}" y="${y + 22}" font-size="11.5">${text}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="34" width="266" height="126" rx="12" fill="none" stroke="var(--gold)" stroke-width="1.4"/>
<text class="cap" x="30" y="26" font-size="11" font-weight="700">один раз за программу</text>
<text class="cap" x="286" y="26" font-size="11" text-anchor="end">при загрузке класса</text>
${step(34, 52, 238, "1", "статические поля", false)}
${step(34, 96, 238, "2", "статические блоки", false)}
<text class="cap" x="153" y="150" font-size="10.5" text-anchor="middle">сверху вниз по тексту класса</text>

<rect x="314" y="34" width="266" height="216" rx="12" fill="none" stroke="var(--accent)" stroke-width="1.4"/>
<text class="cap" x="324" y="26" font-size="11" font-weight="700">на каждый new</text>
${step(328, 52, 238, "3", "память + значения по умолчанию", false)}
${step(328, 96, 238, "4", "инициализаторы полей", false)}
${step(328, 140, 238, "5", "блоки инициализации", false)}
${step(328, 184, 238, "6", "тело конструктора", true)}
<text class="cap" x="447" y="240" font-size="10.5" text-anchor="middle">тоже сверху вниз по тексту</text>

<path d="M286,97 L310,97" fill="none" stroke="var(--muted)" stroke-width="1.3" marker-end="url(#${slug}-arrow)"/>

<line x1="20" y1="272" x2="580" y2="272" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="294" font-size="12">второй <tspan class="mono" font-weight="700">new</tspan> начинается сразу с шага 3 — левая часть уже отработала</text>
<text class="cap" x="20" y="314" font-size="12">пока не дошли до шага 6, объект неполон: не читай его поля из инициализаторов</text>`;
  return svgWrap("0 0 600 330", slug, "Порядок инициализации", inner);
}

/* ---------------------------------------------------------------- 3.11 */

// Оболочка: поля внутри, наружу торчат только осмысленные операции.
// Показаны и то, что дырка остаётся, если наружу отдать ссылку на объект.
function buildEncapsulationShell() {
  const slug = "encapsulation-shell";
  const btn = (y, name, note) => `
<rect x="300" y="${y}" width="196" height="34" rx="9" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.3"/>
<text class="mono" x="312" y="${y + 22}" font-size="12" font-weight="700">${esc(name)}</text>
<text class="cap" x="506" y="${y + 22}" font-size="10.5">${note}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="34" width="250" height="150" rx="14" fill="var(--sunk)" stroke="var(--line)" stroke-width="1.4"/>
<text class="cap" x="34" y="26" font-size="11">внутри, видно только своему классу</text>
<text class="mono" x="36" y="66" font-size="12.5" font-weight="700">private int balance;</text>
<text class="mono" x="36" y="92" font-size="12.5" font-weight="700">private boolean blocked;</text>
<text class="mono cap" x="36" y="126" font-size="11.5">private boolean check(int)</text>
<text class="cap" x="36" y="156" font-size="11">инвариант: баланс ≥ 0</text>
<text class="cap" x="36" y="174" font-size="11">держится сам, обойти неоткуда</text>

<text class="cap" x="300" y="26" font-size="11">наружу — только осмысленные операции</text>
${btn(34, "client_esit(int)", "с проверкой")}
${btn(78, "withdraw(int)", "с проверкой")}
${btn(122, "getBalance()", "только чтение")}

<rect x="300" y="166" width="196" height="34" rx="9" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.3"/>
<text class="mono" x="312" y="188" font-size="12" font-weight="700">acc.balance = -100</text>
${crossIcon(506, 175, 14)}

<line x1="20" y1="220" x2="580" y2="220" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="242" font-size="12">рецепт: <tspan font-weight="700">поля private по умолчанию</tspan>, открыто только то, ради чего класс написан</text>
<text class="cap" x="20" y="262" font-size="12" fill="var(--bad)">дырка: геттер, отдающий ссылку на изменяемый объект, — стена с открытым окном</text>`;
  return svgWrap("0 0 600 278", slug, "Инкапсуляция: закрытое внутри, кнопки снаружи", inner);
}

/* ---------------------------------------------------------------- 3.12 */

// Соглашение об именах и главная мысль: снаружи видно свойства, а не поля.
// Поле без геттера и геттер без поля стоят рядом нарочно.
function buildGetterSetter() {
  const slug = "getter-setter";
  const row = (y, sig, note, kind) => `
<rect x="300" y="${y}" width="280" height="32" rx="8" fill="var(--paper)" stroke="var(--${kind})" stroke-width="1.2"/>
<text class="mono" x="312" y="${y + 21}" font-size="11.5" font-weight="700">${esc(sig)}</text>
<text class="cap" x="570" y="${y + 21}" font-size="10.5" text-anchor="end">${note}</text>`;
  const fld = (y, sig, note) => `
<rect x="20" y="${y}" width="252" height="32" rx="8" fill="var(--sunk)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="32" y="${y + 21}" font-size="11.5">${esc(sig)}</text>
<text class="cap" x="262" y="${y + 21}" font-size="10.5" text-anchor="end">${note}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="20" y="24" font-size="11" font-weight="700">поля внутри</text>
<text class="cap" x="300" y="24" font-size="11" font-weight="700">свойства снаружи</text>
${fld(34, "private int w, h;", "")}
${fld(74, "private int attempts;", "")}
${fld(114, "поля area нет", "")}

${row(34, "getWidth() : int", "прямо из поля")}
${row(74, "isBlocked() : boolean", "по счётчику")}
${row(114, "getArea() : int", "считается на месте")}
${row(158, "setW(int)", "с проверкой — нужен", "ok")}
${row(198, "setBalance(int)", "без проверки — зря", "bad")}

<path d="M276,50 L296,50" fill="none" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<path d="M276,90 L296,90" fill="none" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<path d="M276,130 L296,130" fill="none" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="3 3" marker-end="url(#${slug}-arrow)"/>

<line x1="20" y1="244" x2="580" y2="244" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="266" font-size="12">имена по соглашению: <tspan class="mono" font-weight="700">getИмя</tspan> · <tspan class="mono" font-weight="700">isИмя</tspan> для boolean · <tspan class="mono" font-weight="700">setИмя</tspan> и всегда void</text>
<text class="cap" x="20" y="286" font-size="12">поле и пара методов — частый случай, а не закон: бывает поле без геттера и геттер без поля</text>`;
  return svgWrap("0 0 600 302", slug, "Геттеры и сеттеры", inner);
}

/* ---------------------------------------------------------------- 3.13 */

// Две защитные копии — на входе и на выходе. Без любой из них остаётся
// лазейка, и схема показывает ровно эти две точки.
function buildImmutableCopy() {
  const slug = "immutable-copy";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="212" y="60" width="176" height="120" rx="14" fill="var(--sunk)" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono cap" x="226" y="82" font-size="10.5">final class Order</text>
<text class="mono" x="226" y="108" font-size="11.5" font-weight="700">private final</text>
<text class="mono" x="226" y="126" font-size="11.5" font-weight="700">int[] prices</text>
<text class="mono" x="226" y="152" font-size="12" font-weight="700">{100, 200}</text>
<text class="cap" x="226" y="172" font-size="10.5">сеттеров нет ни одного</text>

<rect x="20" y="86" width="140" height="62" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono cap" x="32" y="106" font-size="10.5">чужой массив</text>
<text class="mono" x="32" y="128" font-size="12" font-weight="700">int[] src</text>
<text class="cap" x="32" y="144" font-size="10.5">его правят снаружи</text>

<rect x="440" y="86" width="140" height="62" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono cap" x="452" y="106" font-size="10.5">то, что отдали</text>
<text class="mono" x="452" y="128" font-size="12" font-weight="700">getPrices()</text>
<text class="cap" x="452" y="144" font-size="10.5">его тоже правят</text>

<path d="M164,110 L206,110" fill="none" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M394,110 L436,110" fill="none" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${slug}-arrow-accent)"/>

<circle cx="185" cy="110" r="14" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.5"/>
${checkIcon(178.5, 103.5, 13)}
<circle cx="415" cy="110" r="14" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.5"/>
${checkIcon(408.5, 103.5, 13)}

<text class="cap" x="185" y="46" font-size="11" text-anchor="middle">копия на входе</text>
<text class="mono cap" x="185" y="30" font-size="10.5" text-anchor="middle">в конструкторе</text>
<text class="cap" x="415" y="46" font-size="11" text-anchor="middle">копия на выходе</text>
<text class="mono cap" x="415" y="30" font-size="10.5" text-anchor="middle">в геттере</text>

<text class="cap" x="185" y="206" font-size="10.5" text-anchor="middle">забыл — правки снаружи</text>
<text class="cap" x="185" y="222" font-size="10.5" text-anchor="middle">доходят до поля</text>
<text class="cap" x="415" y="206" font-size="10.5" text-anchor="middle">забыл — отдал ключи</text>
<text class="cap" x="415" y="222" font-size="10.5" text-anchor="middle">от своего массива</text>

<line x1="20" y1="244" x2="580" y2="244" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="266" font-size="12">копировать надо только <tspan font-weight="700">изменяемое</tspan>: <tspan class="mono">String</tspan> и другие immutable — как есть</text>
<text class="cap" x="20" y="286" font-size="12">изменение делается новым объектом: <tspan class="mono" font-weight="700">Money plus(Money)</tspan>, а не <tspan class="mono">void plus(Money)</tspan></text>`;
  return svgWrap("0 0 600 302", slug, "Две защитные копии", inner);
}

/* ---------------------------------------------------------------- 3.14 */

// Пакет = папка на диске + строка package в файле. Схема связывает три вещи,
// которые обязаны совпасть: путь, объявление и полное имя класса.
function buildPackageTree() {
  const slug = "package-tree";
  const node = (x, y, text, kind) => `
<rect x="${x}" y="${y}" width="${kind === "file" ? 176 : 120}" height="30" rx="7" fill="var(--paper)" stroke="var(--${kind === "file" ? "accent" : "line"})" stroke-width="1.2"/>
<text class="mono" x="${x + 12}" y="${y + 20}" font-size="11.5" ${kind === "file" ? 'font-weight="700"' : ''}>${esc(text)}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="20" y="22" font-size="11" font-weight="700">папки на диске</text>
${node(20, 32, "src/", "dir")}
${node(44, 74, "ru/", "dir")}
${node(68, 116, "shop/", "dir")}
${node(92, 158, "model/", "dir")}
${node(116, 200, "Item.java", "file")}
<path d="M32,62 L32,89 L40,89" fill="none" stroke="var(--line)" stroke-width="1.1"/>
<path d="M56,104 L56,131 L64,131" fill="none" stroke="var(--line)" stroke-width="1.1"/>
<path d="M80,146 L80,173 L88,173" fill="none" stroke="var(--line)" stroke-width="1.1"/>
<path d="M104,188 L104,215 L112,215" fill="none" stroke="var(--line)" stroke-width="1.1"/>

<text class="cap" x="330" y="22" font-size="11" font-weight="700">первая строка файла</text>
<rect x="330" y="32" width="250" height="34" rx="8" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.3"/>
<text class="mono" x="342" y="54" font-size="12.5" font-weight="700">package ru.shop.model;</text>

<text class="cap" x="330" y="98" font-size="11" font-weight="700">полное имя класса</text>
<rect x="330" y="108" width="250" height="34" rx="8" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.3"/>
<text class="mono" x="342" y="130" font-size="12.5" font-weight="700">ru.shop.model.Item</text>

<text class="cap" x="330" y="174" font-size="11" font-weight="700">короткое имя — только с импортом</text>
<rect x="330" y="184" width="250" height="34" rx="8" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="342" y="206" font-size="12" >import ru.shop.model.Item;</text>

<path d="M306,49 L326,49" fill="none" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<path d="M562,70 L562,104" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M562,146 L562,180" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="230" y="44" font-size="10.5" text-anchor="middle">путь и package</text>
<text class="cap" x="230" y="58" font-size="10.5" text-anchor="middle">обязаны совпасть</text>

<line x1="20" y1="248" x2="580" y2="248" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="270" font-size="12"><tspan class="mono" font-weight="700">import</tspan> ничего не подключает — он лишь разрешает писать короткое имя вместо полного</text>
<text class="cap" x="20" y="290" font-size="12"><tspan class="mono">java.lang</tspan> и свой собственный пакет импортируются сами</text>`;
  return svgWrap("0 0 600 306", slug, "Пакет: папка, package и полное имя", inner);
}

/* ---------------------------------------------------------------- 3.15 */

function buildAccessMatrix() {
  const slug = "access-matrix";
  const cols = [
    ["тот же", "класс"], ["тот же", "пакет"], ["подкласс", "в др. пакете"], ["любой", "другой класс"],
  ];
  const colX = [170, 285, 400, 515];
  const rows = [
    { label: "private", vals: [true, false, false, false] },
    { label: "package-private", vals: [true, true, false, false] },
    { label: "protected", vals: [true, true, true, false] },
    { label: "public", vals: [true, true, true, true] },
  ];
  const rowY = [64, 154, 244, 334];
  const header = cols.map((c, i) => `
<text class="cap" x="${colX[i] + 57.5}" y="40" font-size="11" text-anchor="middle">${c[0]}</text>
<text class="cap" x="${colX[i] + 57.5}" y="54" font-size="11" text-anchor="middle">${c[1]}</text>`).join("");
  const vlines = [20, 170, 285, 400, 515, 630].map((x) => `<line x1="${x}" y1="20" x2="${x}" y2="424" stroke="var(--line)" stroke-width="1"/>`).join("");
  const hlines = [20, 64, 154, 244, 334, 424].map((y) => `<line x1="20" y1="${y}" x2="630" y2="${y}" stroke="var(--line)" stroke-width="1"/>`).join("");
  const body = rows.map((r, ri) => {
    const label = `<text class="mono" x="30" y="${rowY[ri] + 49}" font-size="${r.label.length > 10 ? 11 : 12.5}" font-weight="700">${r.label}</text>`;
    const icons = r.vals.map((v, ci) => {
      const cx = colX[ci] + 57.5, cy = rowY[ri] + 45;
      return v ? checkIcon(cx - 8, cy - 8, 16) : crossIcon(cx - 7, cy - 7, 14);
    }).join("");
    return `<g class="row"><rect class="hit" x="20" y="${rowY[ri]}" width="610" height="90" fill="var(--accent)" fill-opacity="0"/>${label}${icons}</g>`;
  }).join("");
  const legend = [
    ["private", "только свой класс"],
    ["package-private", "плюс свой пакет"],
    ["protected", "плюс подклассы в других пакетах"],
    ["public", "видно отовсюду"],
  ].map((l, i) => `
<circle cx="350" cy="${466 + i * 38}" r="7" fill="none" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="368" y="${470 + i * 38}" font-size="11" font-weight="700">${l[0]}</text>
<text class="cap" x="368" y="${470 + i * 38 + 14}" font-size="11">${l[1]}</text>`).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .row:hover .hit { fill-opacity: .06; }
</style>
${vlines}${hlines}
${header}
${body}

<text class="cap" x="330" y="450" font-size="11" text-anchor="middle">область видимости — каждый следующий уровень включает предыдущий</text>
<circle cx="190" cy="538" r="88" fill="none" stroke="var(--line)" stroke-width="1.4"/>
<circle cx="190" cy="538" r="64" fill="none" stroke="var(--line)" stroke-width="1.3"/>
<circle cx="190" cy="538" r="40" fill="none" stroke="var(--line)" stroke-width="1.2"/>
<circle cx="190" cy="538" r="18" fill="none" stroke="var(--accent)" stroke-width="1.4"/>
${legend}`;
  return svgWrap("0 0 640 630", slug, "Матрица видимости", inner);
}
// ---BUILDERS-END---

/* ---------------------------------------------------------------- 3.20 */

// Что наследник получает, а что нет. Дерево слева, список справа — потому что
// главный вопрос ноды не «как выглядит иерархия», а «что именно достаётся».
function buildInheritTree() {
  const slug = "inherit-tree";
  const got = [
    ["да", "все поля родителя — физически, в объекте", true],
    ["да", "все открытые и package-private методы", true],
    ["нет", "доступ к private — наследник другой класс", false],
    ["нет", "конструкторы — их пишут заново", false],
  ];
  const rows = got.map(([mark, text, ok], i) => {
    const y = 46 + i * 40;
    return `
<rect x="256" y="${y}" width="324" height="32" rx="8" fill="var(--paper)" stroke="var(--${ok ? "ok" : "bad"})" stroke-width="1.2"/>
${ok ? checkIcon(268, y + 9, 14) : crossIcon(269, y + 10, 13)}
<text x="292" y="${y + 21}" font-size="11.5">${text}</text>`;
  }).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="46" y="46" width="164" height="46" rx="10" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.5"/>
<text class="mono" x="60" y="68" font-size="12.5" font-weight="700">Account</text>
<text class="cap" x="60" y="84" font-size="10.5">родитель, superclass</text>

<rect x="20" y="146" width="102" height="46" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="32" y="168" font-size="11.5" font-weight="700">client_esit</text>
<text class="cap" x="32" y="184" font-size="10.5">наследник</text>

<rect x="134" y="146" width="102" height="46" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="146" y="168" font-size="11.5" font-weight="700">Credit</text>
<text class="cap" x="146" y="184" font-size="10.5">наследник</text>

<path d="M71,142 L71,120 L128,120 L128,96" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M185,142 L185,120 L128,120" fill="none" stroke="var(--accent)" stroke-width="1.3"/>
<text class="mono cap" x="128" y="114" font-size="10.5" text-anchor="middle">extends</text>

<text class="cap" x="256" y="34" font-size="11" font-weight="700">что достаётся наследнику</text>
${rows}

<line x1="20" y1="222" x2="580" y2="222" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="244" font-size="12">стрелка читается «является»: <tspan class="mono" font-weight="700">client_esit</tspan> является <tspan class="mono" font-weight="700">Account</tspan>, значит годится везде, где ждут счёт</text>
<text class="cap" x="20" y="264" font-size="12">не звучит фраза «является» — нужно поле, а не <tspan class="mono">extends</tspan></text>`;
  return svgWrap("0 0 600 280", slug, "Что даёт extends", inner);
}

/* ---------------------------------------------------------------- 3.21 */

// Порядок сборки по цепочке. Ценность в том, что видно направление: вниз идёт
// вызов super, вверх — фактическое выполнение конструкторов.
function buildSuperChain() {
  const slug = "super-chain";
  const level = (y, name, note) => `
<rect x="150" y="${y}" width="300" height="42" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="166" y="${y + 20}" font-size="12" font-weight="700">${name}</text>
<text class="cap" x="166" y="${y + 35}" font-size="10.5">${note}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="mono" x="20" y="22" font-size="12.5" font-weight="700">new C()</text>

${level(34, "Object", "корень всей иерархии Java")}
${level(96, "A", "конструктор A")}
${level(158, "B", "super(...) первым, потом своё")}
${level(220, "C", "super(...) первым, потом своё")}

<path d="M120,262 L120,52" fill="none" stroke="var(--muted)" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="110" y="160" font-size="10.5" text-anchor="middle" transform="rotate(-90 110 160)">вызов super идёт вверх</text>

<path d="M480,52 L480,262" fill="none" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="492" y="160" font-size="10.5" text-anchor="middle" transform="rotate(-90 492 160)">тела выполняются сверху вниз</text>

<line x1="20" y1="288" x2="580" y2="288" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="310" font-size="12">родительская часть собирается <tspan font-weight="700">раньше</tspan>: конструктор наследника может её читать</text>
<text class="cap" x="20" y="330" font-size="12">не написал <tspan class="mono" font-weight="700">super(...)</tspan> — Java подставит <tspan class="mono">super()</tspan>; вместе с <tspan class="mono">this(...)</tspan> не бывает</text>`;
  return svgWrap("0 0 600 346", slug, "Порядок сборки по цепочке", inner);
}

/* ---------------------------------------------------------------- 3.22 */

// Правила переопределения одной таблицей плюс главный факт: решает объект.
function buildOverrideTable() {
  const slug = "override-table";
  const rules = [
    ["имя и типы параметров", "совпадают точно", true],
    ["тип результата", "тот же или уже", true],
    ["доступ", "шире можно, уже нельзя", true],
    ["static, private, final", "не переопределяются", false],
  ];
  const rows = rules.map(([a, b, ok], i) => {
    const y = 40 + i * 34;
    return `
<text class="mono" x="34" y="${y + 20}" font-size="11.5" font-weight="700">${esc(a)}</text>
<text class="cap" x="300" y="${y + 20}" font-size="11.5">${b}</text>
${ok ? checkIcon(276, y + 9, 13) : crossIcon(277, y + 10, 12)}
<line x1="20" y1="${y + 30}" x2="440" y2="${y + 30}" stroke="var(--line)" stroke-width="1"/>`;
  }).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="20" y="28" font-size="11" font-weight="700">правила переопределения</text>
<line x1="20" y1="34" x2="440" y2="34" stroke="var(--line)" stroke-width="1"/>
${rows}

<rect x="460" y="40" width="120" height="132" rx="12" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.4"/>
<text class="mono" x="474" y="62" font-size="11.5" font-weight="700">@Override</text>
<text class="cap" x="474" y="84" font-size="10.5">ставится всегда</text>
<text class="cap" x="474" y="104" font-size="10.5">компилятор</text>
<text class="cap" x="474" y="120" font-size="10.5">проверит подпись</text>
<text class="cap" x="474" y="142" font-size="10.5">опечатка станет</text>
<text class="cap" x="474" y="158" font-size="10.5">ошибкой сборки</text>

<line x1="20" y1="196" x2="580" y2="196" stroke="var(--line)" stroke-width="1"/>
<text class="mono" x="20" y="222" font-size="13" font-weight="700">Account a = new client_esit();  a.hello();</text>
<text class="cap" x="20" y="246" font-size="12">тип переменной решает, <tspan font-weight="700">что можно звать</tspan> — метод должен быть у <tspan class="mono">Account</tspan></text>
<text class="cap" x="20" y="266" font-size="12">класс объекта решает, <tspan font-weight="700">что выполнится</tspan> — сработает <tspan class="mono">client_esit.hello()</tspan></text>`;
  return svgWrap("0 0 600 282", slug, "Переопределение: правила и выбор", inner);
}

/* ---------------------------------------------------------------- 3.23 */

// Две колонки, различающиеся ровно в двух строках: параметры и момент выбора.
// Всё остальное в теме — следствия этих двух.
function buildOverrideVsOverload() {
  const slug = "override-vs-overload";
  const rows = [
    ["где живут методы", "в одном классе", "родитель и наследник"],
    ["параметры", "обязаны различаться", "обязаны совпадать"],
    ["кто выбирает", "компилятор", "JVM на запуске"],
    ["по чему выбирает", "по типу переменной", "по классу объекта"],
    ["@Override", "не ставится", "ставится всегда"],
  ];
  const body = rows.map(([label, a, b], i) => {
    const y = 62 + i * 36;
    const hot = i === 1 || i === 3;
    return `
<text class="cap" x="20" y="${y + 20}" font-size="11">${label}</text>
<rect x="180" y="${y}" width="190" height="30" rx="7" fill="var(--paper)" stroke="var(--${hot ? "gold" : "line"})" stroke-width="1.2"/>
<text x="192" y="${y + 20}" font-size="11.5" ${hot ? 'font-weight="700"' : ''}>${a}</text>
<rect x="384" y="${y}" width="196" height="30" rx="7" fill="var(--paper)" stroke="var(--${hot ? "accent" : "line"})" stroke-width="1.2"/>
<text x="396" y="${y + 20}" font-size="11.5" ${hot ? 'font-weight="700"' : ''}>${b}</text>`;
  }).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text x="275" y="34" font-size="13" font-weight="700" text-anchor="middle" fill="var(--gold)">перегрузка</text>
<text class="cap" x="275" y="50" font-size="10.5" text-anchor="middle">overload</text>
<text x="482" y="34" font-size="13" font-weight="700" text-anchor="middle" fill="var(--accent)">переопределение</text>
<text class="cap" x="482" y="50" font-size="10.5" text-anchor="middle">override</text>
${body}

<line x1="20" y1="256" x2="580" y2="256" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="278" font-size="12">выделены две строки, из которых следует всё остальное</text>
<text class="cap" x="20" y="298" font-size="12">зависит от <tspan font-weight="700">типа данных</tspan> — перегрузка; от <tspan font-weight="700">того, что за объект</tspan> — переопределение</text>`;
  return svgWrap("0 0 600 314", slug, "Перегрузка против переопределения", inner);
}

/* ---------------------------------------------------------------- 3.24 */

// Один вызов — три реализации. Слева цикл, который ничего не знает о видах,
// справа классы, которые ничего не знают о цикле.
function buildPolymorphCall() {
  const slug = "polymorph-call";
  const impl = (y, cls, body, res) => `
<rect x="300" y="${y}" width="280" height="46" rx="10" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.3"/>
<text class="mono" x="314" y="${y + 20}" font-size="11.5" font-weight="700">${cls}.area()</text>
<text class="mono cap" x="314" y="${y + 36}" font-size="10.5">${esc(body)}</text>
<text class="mono" x="566" y="${y + 28}" font-size="13" font-weight="700" text-anchor="end">${res}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="46" width="230" height="110" rx="12" fill="var(--sunk)" stroke="var(--line)" stroke-width="1.4"/>
<text class="cap" x="20" y="34" font-size="11" font-weight="700">код, который не знает видов</text>
<text class="mono" x="34" y="74" font-size="11.5">for (Shape s : all) {</text>
<text class="mono" x="48" y="98" font-size="12.5" font-weight="700">total += s.area();</text>
<text class="mono" x="34" y="122" font-size="11.5">}</text>
<text class="cap" x="34" y="146" font-size="10.5">новый вид фигуры — правок ноль</text>

<text class="cap" x="300" y="34" font-size="11" font-weight="700">куда попадает вызов</text>
${impl(46, "Square", "side * side", "16")}
${impl(102, "Circle", "3 * r * r", "27")}
${impl(158, "Rect", "w * h", "10")}

<path d="M254,90 C276,90 276,68 296,68" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M254,96 L296,124" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M254,102 C276,102 276,180 296,180" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>

<line x1="20" y1="228" x2="580" y2="228" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="250" font-size="12">детектор: если метод придётся править при добавлении класса — там прячется цепочка <tspan class="mono">if</tspan></text>
<text class="cap" x="20" y="270" font-size="12">поля так <tspan font-weight="700">не</tspan> работают: одноимённое поле наследника прячет родительское, а не заменяет</text>`;
  return svgWrap("0 0 600 286", slug, "Один вызов, разные реализации", inner);
}

/* ---------------------------------------------------------------- 3.25 */

// Два направления и их цена. Каст объекта ничего не превращает — это
// единственная мысль, которую тут надо унести.
function buildUpcastDowncast() {
  const slug = "upcast-downcast";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="216" y="34" width="168" height="42" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.4"/>
<text class="mono" x="300" y="60" font-size="13" font-weight="700" text-anchor="middle">Shape</text>

<rect x="120" y="164" width="150" height="42" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="195" y="190" font-size="12.5" font-weight="700" text-anchor="middle">Square</text>

<rect x="330" y="164" width="150" height="42" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="405" y="190" font-size="12.5" font-weight="700" text-anchor="middle">Circle</text>

<path d="M170,160 L236,80" fill="none" stroke="var(--ok)" stroke-width="1.6" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="34" y="112" font-size="12" font-weight="700" fill="var(--ok)">upcasting</text>
<text class="mono cap" x="34" y="130" font-size="11">Shape s = sq;</text>
<text class="cap" x="34" y="148" font-size="10.5">без скобок, всегда безопасен</text>

<path d="M364,80 L430,160" fill="none" stroke="var(--bad)" stroke-width="1.6" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="566" y="112" font-size="12" font-weight="700" text-anchor="end" fill="var(--bad)">downcasting</text>
<text class="mono cap" x="566" y="130" font-size="11" text-anchor="end">(Circle) s</text>
<text class="cap" x="566" y="148" font-size="10.5" text-anchor="end">со скобками, риск</text>

<rect x="20" y="228" width="270" height="72" rx="10" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.2"/>
<text class="mono cap" x="34" y="250" font-size="11">Shape s = new Circle();</text>
<text class="mono" x="34" y="270" font-size="12" font-weight="700">(Square) s</text>
${crossIcon(258, 258, 14)}
<text class="mono cap" x="34" y="290" font-size="10.5">ClassCastException на запуске</text>

<rect x="310" y="228" width="270" height="72" rx="10" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.2"/>
<text class="mono cap" x="324" y="250" font-size="11">if (s instanceof Square sq)</text>
<text class="mono" x="324" y="270" font-size="12" font-weight="700">sq.getSide()</text>
${checkIcon(548, 257, 15)}
<text class="cap" x="324" y="290" font-size="10.5">проверка и приведение одним движением</text>

<line x1="20" y1="320" x2="580" y2="320" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="342" font-size="12">каст объекта <tspan font-weight="700">ничего не превращает</tspan> — он меняет только взгляд компилятора</text>
<text class="cap" x="20" y="362" font-size="12">понадобился downcasting — сперва проверь, не должен ли этот метод жить у родителя</text>`;
  return svgWrap("0 0 600 378", slug, "Вверх и вниз по иерархии", inner);
}

/* ---------------------------------------------------------------- 3.26 */

// Три строки схлопываются в одну, и отдельно — где видна новая переменная.
// Область видимости здесь единственное, что вправду неочевидно.
function buildInstanceofPattern() {
  const slug = "instanceof-pattern";
  const scope = (y, code, ok, note) => `
<rect x="20" y="${y}" width="440" height="30" rx="7" fill="var(--paper)" stroke="var(--${ok ? "ok" : "bad"})" stroke-width="1.2"/>
<text class="mono" x="34" y="${y + 20}" font-size="11">${esc(code)}</text>
${ok ? checkIcon(472, y + 8, 14) : crossIcon(473, y + 9, 13)}
<text class="cap" x="496" y="${y + 20}" font-size="10.5">${note}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="30" width="250" height="88" rx="10" fill="var(--sunk)" stroke="var(--line)" stroke-width="1.2"/>
<text class="cap" x="20" y="22" font-size="11">было: имя типа трижды</text>
<text class="mono" x="32" y="54" font-size="11">if (s instanceof Square) {</text>
<text class="mono" x="46" y="76" font-size="11">Square sq = (Square) s;</text>
<text class="mono" x="46" y="98" font-size="11">sq.getSide();</text>

<rect x="310" y="30" width="270" height="88" rx="10" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.4"/>
<text class="cap" x="310" y="22" font-size="11">стало: один раз</text>
<text class="mono" x="322" y="60" font-size="11.5" font-weight="700">if (s instanceof Square sq) {</text>
<text class="mono" x="336" y="86" font-size="11.5">sq.getSide();</text>
<text class="cap" x="322" y="108" font-size="10.5">появляется, только если проверка прошла</text>

<path d="M276,74 L304,74" fill="none" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>

<text class="cap" x="20" y="146" font-size="11" font-weight="700">где видна новая переменная</text>
${scope(156, "if (s instanceof Square sq) { … }", true, "внутри if")}
${scope(194, "s instanceof Square sq && sq.getSide() > 3", true, "справа от &&")}
${scope(232, "if (!(s instanceof Square sq)) return;  …", true, "после return")}
${scope(270, "s instanceof Square sq || sq.getSide() > 3", false, "cannot find symbol")}

<line x1="20" y1="316" x2="580" y2="316" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="338" font-size="12"><tspan class="mono" font-weight="700">null instanceof X</tspan> — всегда <tspan class="mono">false</tspan>, отдельная проверка на null не нужна</text>
<text class="cap" x="20" y="358" font-size="12">цепочка проверок типа — почти всегда признак недостающего метода в иерархии</text>`;
  return svgWrap("0 0 600 374", slug, "instanceof с именем переменной", inner);
}

/* ---------------------------------------------------------------- 3.27 */

// Одно слово, три места, три разных запрета. Плюс главное недоразумение:
// final у ссылки не защищает объект.
function buildFinalLock() {
  const slug = "final-lock";
  const card = (x, where, code, forbids) => `
<rect x="${x}" y="46" width="180" height="108" rx="12" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.4"/>
<text class="cap" x="${x + 14}" y="68" font-size="11">${where}</text>
<text class="mono" x="${x + 14}" y="94" font-size="11.5" font-weight="700">${esc(code)}</text>
<text class="cap" x="${x + 14}" y="120" font-size="11">${forbids[0]}</text>
<text class="cap" x="${x + 14}" y="138" font-size="11">${forbids[1]}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="20" y="30" font-size="11" font-weight="700">одно слово, три места, три запрета</text>
${card(20, "у поля", "final int x = 5;", ["присвоить второй раз", "нельзя"])}
${card(210, "у метода", "final void pay()", ["переопределить", "нельзя"])}
${card(400, "у класса", "final class Money", ["наследоваться", "нельзя"])}

<rect x="20" y="180" width="560" height="80" rx="12" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.3"/>
<text class="cap" x="34" y="202" font-size="11" font-weight="700" fill="var(--bad)">чего final НЕ делает</text>
<text class="mono" x="34" y="226" font-size="12" font-weight="700">private final int[] prices</text>
<text class="cap" x="300" y="226" font-size="11.5">адрес заморожен, массив — нет</text>
<text class="cap" x="34" y="248" font-size="11">и <tspan class="mono" font-weight="700">final class</tspan> запрещает наследование, но не мешает менять свои же поля</text>

<line x1="20" y1="284" x2="580" y2="284" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="306" font-size="12">закрывай <tspan font-weight="700">метод</tspan>, если от него зависит правильность класса — дешевле, чем весь класс</text>
<text class="cap" x="20" y="326" font-size="12">закрывай <tspan font-weight="700">класс</tspan>, если он неизменяем или не рассчитан на расширение</text>`;
  return svgWrap("0 0 600 342", slug, "Три места для final", inner);
}

/* ---------------------------------------------------------------- 3.28 */

// Формула protected и правило «только через свой тип» — единственное,
// что вправду неочевидно и что даёт непонятную ошибку компиляции.
function buildProtectedReach() {
  const slug = "protected-reach";
  const line = (y, code, ok, note) => `
<rect x="20" y="${y}" width="400" height="30" rx="7" fill="var(--paper)" stroke="var(--${ok ? "ok" : "bad"})" stroke-width="1.2"/>
<text class="mono" x="34" y="${y + 20}" font-size="11">${esc(code)}</text>
${ok ? checkIcon(432, y + 8, 14) : crossIcon(433, y + 9, 13)}
<text class="cap" x="456" y="${y + 20}" font-size="10.5">${note}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="20" y="24" font-size="11" font-weight="700">формула</text>
<rect x="20" y="34" width="180" height="34" rx="8" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="110" y="56" font-size="12" text-anchor="middle">package-private</text>
<text x="216" y="56" font-size="15" font-weight="700" fill="var(--muted)">+</text>
<rect x="240" y="34" width="220" height="34" rx="8" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text x="350" y="56" font-size="12" text-anchor="middle">наследники в других пакетах</text>
<text x="478" y="56" font-size="15" font-weight="700" fill="var(--muted)">=</text>
<rect x="500" y="34" width="80" height="34" rx="8" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.4"/>
<text class="mono" x="540" y="56" font-size="12" font-weight="700" text-anchor="middle">protected</text>

<text class="cap" x="20" y="98" font-size="11" font-weight="700">наследник из ДРУГОГО пакета: только через свой тип</text>
${line(108, "this.balance += 100;", true, "через себя")}
${line(146, "other.balance += 100;   // client_esit other", true, "свой тип")}
${line(184, "other.balance += 100;   // Account other", false, "protected access")}
<text class="cap" x="20" y="234" font-size="10.5">в своём пакете этого ограничения нет — там работает package-private часть формулы</text>

<line x1="20" y1="252" x2="580" y2="252" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="274" font-size="12"><tspan font-weight="700">поле</tspan> protected — дырка в инкапсуляции и часть договора класса: держи поля private</text>
<text class="cap" x="20" y="294" font-size="12"><tspan font-weight="700">метод</tspan> protected — точка расширения для наследников: ровно то, ради чего слово придумано</text>`;
  return svgWrap("0 0 600 310", slug, "Что даёт protected", inner);
}

/* ---------------------------------------------------------------- 3.32 */

// Абстрактный класс = общая часть + дырки. Схема показывает, что обычный метод
// родителя спокойно зовёт метод без тела — вызов уйдёт в реализацию.
function buildAbstractGap() {
  const slug = "abstract-DEMO_PROJECT";
  const impl = (x, cls, body) => `
<rect x="${x}" y="196" width="176" height="70" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono cap" x="${x + 12}" y="216" font-size="10.5">${cls}</text>
<text class="mono" x="${x + 12}" y="240" font-size="11.5" font-weight="700">int area()</text>
<text class="mono cap" x="${x + 12}" y="258" font-size="10.5">${esc(body)}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="34" width="560" height="128" rx="14" fill="none" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono" x="34" y="26" font-size="12" font-weight="700">abstract class Shape</text>
<text class="cap" x="576" y="26" font-size="11" text-anchor="end">объект создать нельзя, тип использовать можно</text>

<rect x="36" y="52" width="256" height="94" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="cap" x="48" y="72" font-size="10.5">общая часть — написана один раз</text>
<text class="mono" x="48" y="96" font-size="11.5">private final String name;</text>
<text class="mono" x="48" y="118" font-size="11.5" font-weight="700">String label() {</text>
<text class="mono" x="48" y="136" font-size="11.5" font-weight="700">  return name + ": " + area();</text>

<rect x="308" y="52" width="256" height="94" rx="10" fill="var(--sunk)" stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="6 4"/>
<text class="cap" x="320" y="72" font-size="10.5">дырка — наследник обязан заполнить</text>
<text class="mono" x="320" y="100" font-size="13" font-weight="700">abstract int area();</text>
<text class="cap" x="320" y="126" font-size="10.5">не написал — не соберётся:</text>
<text class="mono cap" x="320" y="142" font-size="10">does not override abstract method</text>

<path d="M292,116 L304,116" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="20" y="184" font-size="11">вызов из общей части уходит в реализацию наследника — объекта самого Shape не бывает</text>
${impl(20, "Square", "return side * side;")}
${impl(212, "Rect", "return w * h;")}
${impl(404, "Triangle", "…")}
<path d="M436,190 L436,192" fill="none" stroke="var(--line)" stroke-width="1"/>

<line x1="20" y1="286" x2="580" y2="286" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="308" font-size="12">у абстрактного класса есть поля, конструктор и обычные методы — он класс во всём остальном</text>`;
  return svgWrap("0 0 600 324", slug, "Абстрактный класс: общая часть и дырки", inner);
}

/* ---------------------------------------------------------------- 3.33 */

// Интерфейс даёт общий тип классам без общего предка — то, чего наследование
// дать не может в принципе.
function buildInterfaceContract() {
  const slug = "interface-contract";
  const cls = (x, name) => `
<rect x="${x}" y="150" width="150" height="52" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="${x + 75}" y="172" font-size="12" font-weight="700" text-anchor="middle">${name}</text>
<text class="cap" x="${x + 75}" y="190" font-size="10" text-anchor="middle">своя иерархия</text>
<path d="M${x + 75},146 L${x + 75},112" fill="none" stroke="var(--accent)" stroke-width="1.3" stroke-dasharray="5 3" marker-end="url(#${slug}-arrow-accent)"/>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="180" y="40" width="240" height="68" rx="12" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono" x="300" y="66" font-size="13" font-weight="700" text-anchor="middle">interface Printable</text>
<text class="mono cap" x="300" y="90" font-size="11.5" text-anchor="middle">String print();</text>
<text class="cap" x="300" y="28" font-size="11" text-anchor="middle">список того, что класс обязан уметь</text>

${cls(20, "Document")}
${cls(225, "Photo")}
${cls(430, "Receipt")}
<text class="mono cap" x="300" y="128" font-size="10.5" text-anchor="middle">implements</text>

<text class="cap" x="20" y="228" font-size="11">общего предка у трёх классов нет и быть не должно — а общий тип есть</text>
<rect x="20" y="240" width="560" height="34" rx="8" fill="var(--sunk)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="34" y="262" font-size="12" font-weight="700">static void printAll(Printable[] items)</text>
<text class="cap" x="566" y="262" font-size="10.5" text-anchor="end">один метод на все три</text>

<line x1="20" y1="294" x2="580" y2="294" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="316" font-size="12">методы интерфейса <tspan class="mono" font-weight="700">public abstract</tspan> по умолчанию — реализация обязана быть public</text>
<text class="cap" x="20" y="336" font-size="12">полей с данными нет, только константы: состояния у интерфейса не бывает</text>`;
  return svgWrap("0 0 600 352", slug, "Интерфейс: общее умение без общего предка", inner);
}

/* ---------------------------------------------------------------- 3.34 */

// Один родитель против многих интерфейсов — и что из этого следует для типов
// одного и того же объекта.
function buildMultiInterface() {
  const slug = "multi-interface";
  const chip = (x, y, name, kind) => `
<rect x="${x}" y="${y}" width="140" height="30" rx="8" fill="var(--paper)" stroke="var(--${kind})" stroke-width="1.3"/>
<text class="mono" x="${x + 70}" y="${y + 20}" font-size="11.5" font-weight="700" text-anchor="middle">${name}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="220" y="128" width="170" height="52" rx="12" fill="var(--sunk)" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono" x="305" y="150" font-size="12.5" font-weight="700" text-anchor="middle">Square</text>
<text class="cap" x="305" y="168" font-size="10.5" text-anchor="middle">один объект</text>

${chip(235, 34, "Shape", "line")}
<text class="mono cap" x="305" y="26" font-size="10.5" text-anchor="middle">extends — ровно один</text>
<path d="M305,124 L305,68" fill="none" stroke="var(--line)" stroke-width="1.4" marker-end="url(#${slug}-arrow)"/>

${chip(20, 224, "Printable", "accent")}
${chip(230, 224, "Comparable", "accent")}
${chip(440, 224, "Drawable", "accent")}
<text class="cap" x="576" y="200" font-size="10.5" text-anchor="end">implements — сколько угодно</text>
<path d="M270,184 L100,220" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M305,184 L305,220" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M340,184 L505,220" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>

<text class="cap" x="20" y="288" font-size="11">у объекта столько типов, сколько интерфейсов, плюс класс и все его предки</text>

<line x1="20" y1="304" x2="580" y2="304" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="326" font-size="12">порядок слов жёсткий: <tspan class="mono" font-weight="700">extends</tspan> первым, <tspan class="mono" font-weight="700">implements</tspan> вторым</text>
<text class="cap" x="20" y="346" font-size="12">в параметрах проси <tspan font-weight="700">самый узкий</tspan> договор, которого достаточно для работы</text>`;
  return svgWrap("0 0 600 362", slug, "Один родитель, много интерфейсов", inner);
}

/* ---------------------------------------------------------------- 3.35 */

// Зачем вообще default: добавить метод, не сломав готовые реализации.
// Плюс правило разрешения конфликтов.
function buildDefausupportethod() {
  const slug = "defausupportethod";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="34" width="270" height="104" rx="12" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.5"/>
<text class="mono cap" x="34" y="26" font-size="11">interface Printable</text>
<text class="mono" x="34" y="60" font-size="11.5" font-weight="700">String print();</text>
<text class="cap" x="34" y="78" font-size="10.5">обязателен для всех</text>
<text class="mono" x="34" y="104" font-size="11.5" font-weight="700">default String printTwice()</text>
<text class="cap" x="34" y="122" font-size="10.5">достаётся бесплатно, зовёт print()</text>

<rect x="330" y="34" width="250" height="48" rx="10" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.3"/>
<text class="mono" x="344" y="54" font-size="11.5" font-weight="700">Document</text>
<text class="cap" x="344" y="72" font-size="10.5">не менялся — printTwice() уже работает</text>

<rect x="330" y="94" width="250" height="48" rx="10" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="344" y="114" font-size="11.5" font-weight="700">Poster</text>
<text class="cap" x="344" y="132" font-size="10.5">переопределил — победила его версия</text>

<path d="M294,66 L326,58" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M294,100 L326,114" fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#${slug}-arrow-accent)"/>

<line x1="20" y1="160" x2="580" y2="160" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="182" font-size="11" font-weight="700">когда default конфликтуют</text>
<rect x="20" y="194" width="270" height="66" rx="10" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.2"/>
<text class="mono" x="34" y="216" font-size="11.5" font-weight="700">class C implements A, B</text>
<text class="cap" x="34" y="234" font-size="10.5">оба дают default hello()</text>
<text class="mono cap" x="34" y="252" font-size="10">inherits unrelated defaults</text>

<rect x="310" y="194" width="270" height="66" rx="10" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.2"/>
<text class="cap" x="324" y="216" font-size="10.5">выбираешь ты, в самом классе:</text>
<text class="mono" x="324" y="238" font-size="12" font-weight="700">A.super.hello()</text>
<text class="cap" x="324" y="254" font-size="10.5">а спор класса с интерфейсом класс выигрывает</text>

<line x1="20" y1="278" x2="580" y2="278" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="300" font-size="12">детектор: <tspan class="mono" font-weight="700">default</tspan> обязан выражаться через абстрактные методы того же интерфейса</text>
<text class="cap" x="20" y="320" font-size="12">не выражается — значит, ему нужно состояние, и это работа для класса</text>`;
  return svgWrap("0 0 600 336", slug, "default и static в интерфейсе", inner);
}

/* ---------------------------------------------------------------- 3.36 */

// Два настоящих отличия, всё остальное — следствия. И типовая связка «оба сразу».
function buildIfaceVsAbstract() {
  const slug = "iface-vs-abstract";
  const rows = [
    ["поля с данными", "есть", "нет, только константы", true],
    ["сколько у класса", "один", "сколько угодно", true],
    ["конструктор", "есть", "нет", false],
    ["protected-методы", "можно", "нельзя", false],
    ["отвечает на вопрос", "что это такое", "что это умеет", false],
  ];
  const body = rows.map(([label, a, b, hot], i) => {
    const y = 60 + i * 32;
    return `
<text class="cap" x="20" y="${y + 20}" font-size="11">${label}</text>
<rect x="180" y="${y}" width="180" height="26" rx="6" fill="var(--paper)" stroke="var(--${hot ? "gold" : "line"})" stroke-width="1.1"/>
<text x="192" y="${y + 18}" font-size="11" ${hot ? 'font-weight="700"' : ''}>${a}</text>
<rect x="374" y="${y}" width="206" height="26" rx="6" fill="var(--paper)" stroke="var(--${hot ? "accent" : "line"})" stroke-width="1.1"/>
<text x="386" y="${y + 18}" font-size="11" ${hot ? 'font-weight="700"' : ''}>${b}</text>`;
  }).join("");
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text x="270" y="34" font-size="12.5" font-weight="700" text-anchor="middle" fill="var(--gold)">абстрактный класс</text>
<text x="477" y="34" font-size="12.5" font-weight="700" text-anchor="middle" fill="var(--accent)">интерфейс</text>
<text class="cap" x="20" y="34" font-size="10.5">выделены два</text>
<text class="cap" x="20" y="48" font-size="10.5">настоящих отличия</text>
${body}

<line x1="20" y1="234" x2="580" y2="234" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="256" font-size="11" font-weight="700">типовая связка: оба сразу</text>
<rect x="20" y="268" width="170" height="34" rx="8" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.3"/>
<text class="mono" x="105" y="290" font-size="11.5" font-weight="700" text-anchor="middle">interface Counter</text>
<rect x="220" y="268" width="180" height="34" rx="8" fill="var(--paper)" stroke="var(--gold)" stroke-width="1.3"/>
<text class="mono" x="310" y="290" font-size="11" font-weight="700" text-anchor="middle">AbstractCounter</text>
<rect x="430" y="268" width="150" height="34" rx="8" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="505" y="290" font-size="11.5" text-anchor="middle">ByOne, Weird</text>
<path d="M194,285 L216,285" fill="none" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<path d="M404,285 L426,285" fill="none" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="20" y="322" font-size="11">интерфейс задаёт договор, AbstractXxx даёт готовую основу тем, кому удобно</text>
<text class="cap" x="20" y="340" font-size="11">кому не удобно — реализует интерфейс напрямую; так устроены коллекции Java</text>`;
  return svgWrap("0 0 600 356", slug, "Интерфейс против абстрактного класса", inner);
}

/* ---------------------------------------------------------------- 3.38 */

// enum как класс с готовым набором объектов. Отсюда и == вместо equals,
// и невозможность придумать новое значение.
function buildEnumInstances() {
  const slug = "enum-instances";
  const box = (x, name, n) => `
<rect x="${x}" y="86" width="126" height="60" rx="10" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.4"/>
<text class="mono" x="${x + 63}" y="110" font-size="12.5" font-weight="700" text-anchor="middle">${name}</text>
<text class="mono cap" x="${x + 63}" y="130" font-size="10.5" text-anchor="middle">ordinal ${n}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="60" width="560" height="102" rx="14" fill="none" stroke="var(--line)" stroke-width="1.5"/>
<text class="mono" x="34" y="52" font-size="12.5" font-weight="700">enum Status { NEW, PAID, SHIPPED, DELIVERED }</text>
<text class="cap" x="34" y="30" font-size="11">класс с заранее объявленным набором объектов</text>
${box(34, "NEW", 0)}
${box(174, "PAID", 1)}
${box(314, "SHIPPED", 2)}
${box(454, "DELIVERED", 3)}

<text class="cap" x="20" y="186" font-size="11">каждое значение создаётся один раз при загрузке класса — второго такого объекта не бывает</text>

<rect x="20" y="200" width="270" height="76" rx="10" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.2"/>
<text class="mono" x="34" y="222" font-size="12" font-weight="700">s == Status.PAID</text>
${checkIcon(258, 211, 15)}
<text class="cap" x="34" y="244" font-size="10.5">сравнение ссылок и есть сравнение значений</text>
<text class="cap" x="34" y="262" font-size="10.5">и на null не падает, в отличие от equals</text>

<rect x="310" y="200" width="270" height="76" rx="10" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.2"/>
<text class="mono" x="324" y="222" font-size="12" font-weight="700">new Status()</text>
${crossIcon(548, 212, 14)}
<text class="mono cap" x="324" y="244" font-size="10">enum classes may not be instantiated</text>
<text class="cap" x="324" y="262" font-size="10.5">множество значений задано раз и навсегда</text>

<line x1="20" y1="296" x2="580" y2="296" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="318" font-size="12">из коробки: <tspan class="mono">values()</tspan> · <tspan class="mono">name()</tspan> · <tspan class="mono">ordinal()</tspan> · <tspan class="mono">valueOf()</tspan> · <tspan class="mono">compareTo</tspan></text>
<text class="cap" x="20" y="338" font-size="12"><tspan class="mono" font-weight="700">ordinal()</tspan> годится для отладки и сортировки, но не для решений в коде</text>`;
  return svgWrap("0 0 600 354", slug, "enum: фиксированный набор объектов", inner);
}

/* ---------------------------------------------------------------- 3.39 */

// Данные о значении живут внутри значения. Плюс жёсткий порядок в теле enum,
// на котором спотыкаются при письме от руки.
function buildEnumFields() {
  const slug = "enum-fields";
  const row = (y, name, ru, can) => `
<rect x="20" y="${y}" width="330" height="30" rx="7" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.2"/>
<text class="mono" x="34" y="${y + 20}" font-size="11.5" font-weight="700">${name}</text>
<text class="cap" x="150" y="${y + 20}" font-size="11">${ru}</text>
<text class="cap" x="336" y="${y + 20}" font-size="11" text-anchor="end">${can}</text>`;
  const step = (y, n, text, note) => `
<text class="mono cap" x="378" y="${y}" font-size="11">${n}</text>
<text x="398" y="${y}" font-size="11.5" ${note ? 'font-weight="700"' : ''}>${text}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="20" y="24" font-size="11" font-weight="700">данные о значении — внутри значения</text>
<text class="mono cap" x="20" y="42" font-size="10.5">NEW("Новый", false)</text>
${row(52, "NEW", "Новый", "отменить нельзя")}
${row(90, "PAID", "Оплачен", "можно")}
${row(128, "SHIPPED", "Отправлен", "можно")}
${row(166, "DELIVERED", "Доставлен", "нельзя")}
<text class="cap" x="20" y="216" font-size="10.5">никакой таблицы соответствий снаружи — и править её при добавлении значения не надо</text>

<rect x="366" y="34" width="214" height="164" rx="10" fill="var(--sunk)" stroke="var(--gold)" stroke-width="1.3"/>
<text class="cap" x="378" y="24" font-size="11" font-weight="700">порядок в теле enum</text>
${step(58, "1", "список значений", false)}
${step(84, "2", "точка с запятой", true)}
${step(110, "3", "поля, лучше final", false)}
${step(136, "4", "конструктор, закрытый", false)}
${step(162, "5", "методы", false)}
<text class="cap" x="378" y="186" font-size="10">забыл шаг 2 — ошибка на строке ниже</text>

<line x1="20" y1="234" x2="580" y2="234" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="256" font-size="12">у каждого значения может быть <tspan font-weight="700">своя реализация</tspan> метода — в фигурных скобках после него</text>
<text class="cap" x="20" y="276" font-size="12">сам <tspan class="mono">enum</tspan> может реализовать интерфейс; наследовать класс — нет, родитель уже занят</text>`;
  return svgWrap("0 0 600 292", slug, "enum с полями и методами", inner);
}

/* ---------------------------------------------------------------- 3.40 */

// Ради чего switch по enum: пропущенное значение становится ошибкой сборки.
// И как эту проверку случайно выключают словом default.
function buildEnumSwitch() {
  const slug = "enum-switch";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="34" width="270" height="128" rx="12" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.4"/>
<text class="cap" x="20" y="26" font-size="11" font-weight="700">все значения разобраны</text>
<text class="mono" x="34" y="58" font-size="11.5">switch (s) {</text>
<text class="mono" x="48" y="80" font-size="11.5">case NEW -> …</text>
<text class="mono" x="48" y="100" font-size="11.5">case PAID -> …</text>
<text class="mono" x="48" y="120" font-size="11.5">case SHIPPED -> …</text>
<text class="mono" x="34" y="140" font-size="11.5">}</text>
${checkIcon(258, 46, 15)}
<text class="cap" x="34" y="156" font-size="10.5">default не нужен</text>

<rect x="310" y="34" width="270" height="128" rx="12" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.4"/>
<text class="cap" x="310" y="26" font-size="11" font-weight="700">одно значение забыли</text>
<text class="mono" x="324" y="58" font-size="11.5">switch (s) {</text>
<text class="mono" x="338" y="80" font-size="11.5">case NEW -> …</text>
<text class="mono" x="338" y="100" font-size="11.5">case PAID -> …</text>
<text class="mono" x="324" y="120" font-size="11.5">}</text>
${crossIcon(549, 47, 14)}
<text class="mono cap" x="324" y="142" font-size="10">does not cover all possible</text>
<text class="mono cap" x="324" y="156" font-size="10">input values</text>

<text class="cap" x="300" y="186" font-size="11.5" text-anchor="middle" font-weight="700">ради этой ошибки всё и затевалось</text>

<rect x="20" y="204" width="560" height="60" rx="10" fill="var(--sunk)" stroke="var(--gold)" stroke-width="1.2"/>
<text class="mono" x="34" y="226" font-size="12" font-weight="700">default -> …</text>
<text class="cap" x="150" y="226" font-size="11">выключает проверку полноты своими руками</text>
<text class="cap" x="34" y="248" font-size="11">и то же самое делает <tspan class="mono">switch</tspan>-инструкция: у неё полноту не проверяют вовсе</text>

<line x1="20" y1="284" x2="580" y2="284" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="306" font-size="12">имена значений пишутся <tspan font-weight="700">без имени типа</tspan>: <tspan class="mono">case NEW</tspan>, а не <tspan class="mono">case Status.NEW</tspan></text>`;
  return svgWrap("0 0 600 322", slug, "switch по enum и проверка полноты", inner);
}

/* ---------------------------------------------------------------- 3.41 */

// Одна строка слева, шесть сгенерированных вещей справа.
function buildRecordGenerated() {
  const slug = "record-generated";
  const gen = (y, sig, note) => `
<rect x="230" y="${y}" width="350" height="30" rx="7" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.2"/>
<text class="mono" x="242" y="${y + 20}" font-size="11" font-weight="700">${esc(sig)}</text>
<text class="cap" x="570" y="${y + 20}" font-size="10" text-anchor="end">${note}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="80" width="190" height="60" rx="12" fill="var(--sunk)" stroke="var(--accent)" stroke-width="1.6"/>
<text class="mono" x="34" y="106" font-size="12" font-weight="700">record Point(</text>
<text class="mono" x="34" y="126" font-size="12" font-weight="700">  int x, int y) {}</text>
<text class="cap" x="20" y="70" font-size="11" font-weight="700">ты пишешь это</text>
<text class="cap" x="20" y="160" font-size="10.5">список в скобках —</text>
<text class="cap" x="20" y="176" font-size="10.5">компоненты записи</text>

<text class="cap" x="230" y="24" font-size="11" font-weight="700">компилятор пишет это</text>
${gen(34, "private final int x, y;", "поля")}
${gen(72, "Point(int x, int y)", "канонический конструктор")}
${gen(110, "int x()   int y()", "методы доступа, без get")}
${gen(148, "boolean equals(Object)", "по всем компонентам")}
${gen(186, "int hashCode()", "согласован с equals")}
${gen(224, "String toString()", "Point[x=3, y=4]")}
<path d="M214,110 L226,110" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>

<line x1="20" y1="272" x2="580" y2="272" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="294" font-size="12">плюс сама запись <tspan font-weight="700">неизменяема и final</tspan> — это готовый рецепт immutable-класса</text>
<text class="cap" x="20" y="314" font-size="12">своих полей у записи нет: компоненты — всё её состояние, иначе equals врал бы</text>`;
  return svgWrap("0 0 600 330", slug, "Что record пишет за тебя", inner);
}

/* ---------------------------------------------------------------- 3.42 */

// Главная неочевидность: правишь параметр, а присваивание полям дописывает
// компилятор — поэтому this.amount = … не работает.
function buildCompactCtor() {
  const slug = "compact-ctor";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="34" width="330" height="150" rx="12" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.5"/>
<text class="cap" x="20" y="26" font-size="11" font-weight="700">компактный конструктор — без скобок</text>
<text class="mono" x="34" y="58" font-size="12" font-weight="700">Money {</text>
<text class="mono cap" x="48" y="80" font-size="11">if (amount &lt; 0) {</text>
<text class="mono" x="62" y="100" font-size="12" font-weight="700">amount = 0;</text>
<text class="mono cap" x="48" y="120" font-size="11">}</text>
<text class="mono" x="34" y="142" font-size="12" font-weight="700">}</text>
<text class="cap" x="34" y="168" font-size="10.5">правишь параметр, а не поле</text>

<text class="cap" x="376" y="26" font-size="11" font-weight="700">что происходит на самом деле</text>
<rect x="376" y="34" width="204" height="30" rx="7" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono cap" x="388" y="54" font-size="10.5">1. параметры уже объявлены</text>
<rect x="376" y="72" width="204" height="30" rx="7" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono cap" x="388" y="92" font-size="10.5">2. выполняется твоё тело</text>
<rect x="376" y="110" width="204" height="46" rx="7" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.4"/>
<text class="mono cap" x="388" y="128" font-size="10.5">3. компилятор дописывает</text>
<text class="mono" x="388" y="146" font-size="11" font-weight="700">this.amount = amount;</text>
<path d="M354,110 L372,110" fill="none" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#${slug}-arrow)"/>

<rect x="20" y="200" width="560" height="40" rx="9" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.2"/>
<text class="mono" x="34" y="224" font-size="12" font-weight="700">this.amount = 0;</text>
${crossIcon(180, 213, 13)}
<text class="mono cap" x="212" y="224" font-size="10.5">cannot assign a value to final variable amount — поля ещё нет</text>

<line x1="20" y1="260" x2="580" y2="260" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="282" font-size="12">нужен для трёх вещей: проверка, нормализация, защитная копия изменяемого компонента</text>
<text class="cap" x="20" y="302" font-size="12">всё это происходит <tspan font-weight="700">до</tspan> того, как equals начнёт сравнивать поля</text>`;
  return svgWrap("0 0 600 318", slug, "Компактный конструктор", inner);
}

/* ---------------------------------------------------------------- 3.43 */

// Третье состояние иерархии между «открыта» и «закрыта».
function buildSealedPermits() {
  const slug = "sealed-permits";
  const state = (x, title, code, note, kind) => `
<rect x="${x}" y="42" width="180" height="86" rx="12" fill="var(--paper)" stroke="var(--${kind})" stroke-width="1.4"/>
<text class="cap" x="${x + 14}" y="64" font-size="11" font-weight="700">${title}</text>
<text class="mono" x="${x + 14}" y="90" font-size="11.5" font-weight="700">${esc(code)}</text>
<text class="cap" x="${x + 14}" y="112" font-size="10.5">${note}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="20" y="30" font-size="11" font-weight="700">три состояния иерархии</text>
${state(20, "открыта", "class Shape", "наследуйте кто хотите", "line")}
${state(210, "по списку", "sealed … permits", "только названные", "accent")}
${state(400, "закрыта", "final class", "нельзя никому", "line")}

<text class="cap" x="20" y="158" font-size="11" font-weight="700">каждый наследник обязан объявить, что дальше</text>
<rect x="20" y="170" width="176" height="30" rx="7" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="34" y="190" font-size="11.5" font-weight="700">final</text>
<text class="cap" x="186" y="190" font-size="10.5" text-anchor="end">ветка кончается</text>
<rect x="212" y="170" width="176" height="30" rx="7" fill="var(--paper)" stroke="var(--line)" stroke-width="1.2"/>
<text class="mono" x="226" y="190" font-size="11.5" font-weight="700">sealed</text>
<text class="cap" x="378" y="190" font-size="10.5" text-anchor="end">дальше по списку</text>
<rect x="404" y="170" width="176" height="30" rx="7" fill="var(--paper)" stroke="var(--gold)" stroke-width="1.2"/>
<text class="mono" x="418" y="190" font-size="11.5" font-weight="700">non-sealed</text>
<text class="cap" x="570" y="190" font-size="10.5" text-anchor="end">снова открыта</text>
<text class="mono cap" x="20" y="220" font-size="10">забыл — sealed, non-sealed or final modifiers expected</text>

<line x1="20" y1="238" x2="580" y2="238" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="260" font-size="12">выгода одна и большая: <tspan class="mono" font-weight="700">switch</tspan> по такой иерархии <tspan font-weight="700">проверяется на полноту</tspan></text>
<text class="cap" x="20" y="280" font-size="12">наследники должны лежать в том же файле или пакете — иначе список не проверить</text>
<text class="cap" x="20" y="300" font-size="12">в одном файле <tspan class="mono">permits</tspan> можно не писать: компилятор найдёт наследников сам</text>`;
  return svgWrap("0 0 600 316", slug, "sealed: наследование по списку", inner);
}

/* ---------------------------------------------------------------- 3.44 */

// sealed + record = честная подпись метода. Слева три способа соврать,
// справа — способ сказать правду.
function buildTaggedUnion() {
  const slug = "tagged-union";
  const bad = (y, code, why) => `
<rect x="20" y="${y}" width="270" height="42" rx="9" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.2"/>
<text class="mono" x="34" y="${y + 20}" font-size="11" font-weight="700">${esc(code)}</text>
<text class="cap" x="34" y="${y + 36}" font-size="10">${why}</text>`;
  const variant = (y, code, note) => `
<rect x="310" y="${y}" width="270" height="34" rx="8" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.2"/>
<text class="mono" x="322" y="${y + 22}" font-size="11" font-weight="700">${esc(code)}</text>
<text class="cap" x="570" y="${y + 22}" font-size="10" text-anchor="end">${note}</text>`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="20" y="26" font-size="11" font-weight="700">подпись врёт</text>
${bad(34, "User find(int id) → null", "тип обещает объект, а даёт «ничего»")}
${bad(86, "int divide(a, b) → -1", "не отличить от честного ответа −1")}
${bad(138, "boolean ok + getLastResult()", "два вызова и состояние между ними")}

<text class="cap" x="310" y="26" font-size="11" font-weight="700">подпись говорит правду</text>
<text class="mono cap" x="310" y="44" font-size="10.5">sealed interface Result permits …</text>
${variant(52, "record Ok(String name, int age)", "")}
${variant(94, "record NotFound(int id)", "")}
${variant(136, "record Invalid(String reason)", "")}
<text class="cap" x="310" y="192" font-size="10.5">вернётся ровно одно из трёх — проверит компилятор</text>

<line x1="20" y1="206" x2="580" y2="206" stroke="var(--line)" stroke-width="1"/>
<text class="mono" x="20" y="232" font-size="12" font-weight="700">case Ok(String name, int age) -> …</text>
<text class="cap" x="20" y="252" font-size="11">шаблон записи: проверяет тип и сразу раскладывает компоненты по переменным</text>

<line x1="20" y1="268" x2="580" y2="268" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="290" font-size="12"><tspan class="mono" font-weight="700">sealed</tspan>: дёшево добавить операцию, дорого — вариант (править все switch)</text>
<text class="cap" x="20" y="310" font-size="12">обычная иерархия: дёшево добавить класс, дорого — операцию (править каждый класс)</text>`;
  return svgWrap("0 0 600 326", slug, "sealed + record: честная подпись", inner);
}

/* ---------------------------------------------------------------- 3.53 */

// Две стрелки от одного класса к одному интерфейсу — узор декоратора.
// Слева цена наследования, справа цена композиции.
function buildCompositionVsInherit() {
  const slug = "composition-vs-inherit";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="150" y="24" font-size="11.5" font-weight="700" text-anchor="middle">наследование: «является»</text>
<rect x="80" y="34" width="140" height="34" rx="8" fill="var(--paper)" stroke="var(--line)" stroke-width="1.3"/>
<text class="mono" x="150" y="56" font-size="11.5" font-weight="700" text-anchor="middle">ArrayList</text>
<rect x="80" y="122" width="140" height="34" rx="8" fill="var(--paper)" stroke="var(--gold)" stroke-width="1.4"/>
<text class="mono" x="150" y="144" font-size="11.5" font-weight="700" text-anchor="middle">CountingList</text>
<path d="M150,118 L150,72" fill="none" stroke="var(--gold)" stroke-width="1.5" marker-end="url(#${slug}-arrow)"/>
<text class="cap" x="30" y="184" font-size="10.5">достаётся всё: remove, clear, set…</text>
<text class="cap" x="30" y="202" font-size="10.5">связь с реализацией родителя</text>
<text class="cap" x="30" y="220" font-size="10.5">addAll внутри зовёт add — счёт двойной</text>

<line x1="300" y1="20" x2="300" y2="240" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 4"/>

<text class="cap" x="450" y="24" font-size="11.5" font-weight="700" text-anchor="middle">композиция: «имеет»</text>
<rect x="380" y="34" width="140" height="34" rx="8" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.3"/>
<text class="mono" x="450" y="56" font-size="11.5" font-weight="700" text-anchor="middle">Box</text>
<text class="cap" x="536" y="56" font-size="10">интерфейс</text>
<rect x="380" y="122" width="140" height="34" rx="8" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.4"/>
<text class="mono" x="450" y="144" font-size="11.5" font-weight="700" text-anchor="middle">CountingBox</text>
<path d="M424,118 L424,72" fill="none" stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="5 3" marker-end="url(#${slug}-arrow-accent)"/>
<path d="M486,118 C540,118 540,72 486,68" fill="none" stroke="var(--accent)" stroke-width="1.4" marker-end="url(#${slug}-arrow-accent)"/>
<text class="cap" x="352" y="106" font-size="10">реализует</text>
<text class="cap" x="548" y="106" font-size="10">держит</text>
<text class="cap" x="330" y="184" font-size="10.5">достаётся то, что позвал сам</text>
<text class="cap" x="330" y="202" font-size="10.5">связь только с публичным договором</text>
<text class="cap" x="330" y="220" font-size="10.5">внутренние вызовы чужого объекта не долетают</text>

<line x1="20" y1="252" x2="580" y2="252" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="274" font-size="12">две стрелки от одного класса к одному интерфейсу — характерный узор <tspan font-weight="700">обёртки</tspan></text>
<text class="cap" x="20" y="294" font-size="12">проверка выбора: произнеси «X является Y». Не звучит — значит, поле</text>`;
  return svgWrap("0 0 600 310", slug, "Наследование против композиции", inner);
}

/* ---------------------------------------------------------------- 3.54 */

// Два приёма вместе: тип — интерфейс, объект — снаружи. Отсюда тестируемость.
function buildProgramToInterface() {
  const slug = "program-to-interface";
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<rect x="20" y="34" width="270" height="104" rx="12" fill="var(--paper)" stroke="var(--bad)" stroke-width="1.3"/>
<text class="cap" x="20" y="26" font-size="11" font-weight="700">так проверить нельзя</text>
<text class="mono" x="34" y="60" font-size="11">class UserService {</text>
<text class="mono" x="48" y="84" font-size="11.5" font-weight="700">new FileStorage(…)</text>
<text class="mono" x="48" y="104" font-size="11.5" font-weight="700">new SmtpMailer(…)</text>
<text class="mono" x="34" y="126" font-size="11">}</text>
<text class="cap" x="20" y="156" font-size="10.5">каждый прогон пишет в файл и шлёт письмо</text>

<rect x="310" y="34" width="270" height="104" rx="12" fill="var(--paper)" stroke="var(--ok)" stroke-width="1.4"/>
<text class="cap" x="310" y="26" font-size="11" font-weight="700">так можно</text>
<text class="mono" x="324" y="60" font-size="11">UserService(</text>
<text class="mono" x="338" y="84" font-size="11.5" font-weight="700">Storage storage,</text>
<text class="mono" x="338" y="104" font-size="11.5" font-weight="700">Mailer mailer)</text>
<text class="mono" x="324" y="126" font-size="11">{ … }</text>
<text class="cap" x="310" y="156" font-size="10.5">подставил память вместо диска — и проверяй</text>

<line x1="20" y1="176" x2="580" y2="176" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="198" font-size="11" font-weight="700">два приёма, порознь не работают</text>
<rect x="20" y="210" width="270" height="34" rx="8" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.2"/>
<text class="mono" x="34" y="232" font-size="11.5" font-weight="700">тип — интерфейс</text>
<text class="cap" x="280" y="232" font-size="10" text-anchor="end">реализацию можно сменить</text>
<rect x="310" y="210" width="270" height="34" rx="8" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.2"/>
<text class="mono" x="324" y="232" font-size="11.5" font-weight="700">объект — снаружи</text>
<text class="cap" x="570" y="232" font-size="10" text-anchor="end">решает тот, кто создаёт</text>

<line x1="20" y1="262" x2="580" y2="262" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="284" font-size="12">конструктор становится честным списком требований — семь параметров видно сразу</text>
<text class="cap" x="20" y="304" font-size="12">интерфейс оправдан, когда реализаций две или когда одна из них поддельная, для проверки</text>`;
  return svgWrap("0 0 600 320", slug, "Зависимость от договора, а не от класса", inner);
}

/* ---------------------------------------------------------------- 3.55 */

// Легенда: коробка класса и пять стрелок. То, что надо держать в голове,
// чтобы прочитать чужую схему.
function buildUmlClassbox() {
  const slug = "uml-classbox";
  const arrow = (y, draw, name, java) => `
${draw}
<text x="150" y="${y + 5}" font-size="11.5" font-weight="700">${name}</text>
<text class="mono cap" x="420" y="${y + 5}" font-size="11">${esc(java)}</text>`;
  const inner = `<defs>
<marker id="${slug}-tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.2"/></marker>
<marker id="${slug}-dia" viewBox="0 0 14 10" refX="13" refY="5" markerWidth="12" markerHeight="10" orient="auto"><path d="M0,5 L7,0 L14,5 L7,10 Z" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.2"/></marker>
<marker id="${slug}-diaf" viewBox="0 0 14 10" refX="13" refY="5" markerWidth="12" markerHeight="10" orient="auto"><path d="M0,5 L7,0 L14,5 L7,10 Z" fill="var(--ink)"/></marker>
<marker id="${slug}-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10" fill="none" stroke="var(--ink)" stroke-width="1.4"/></marker>
</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .ln { stroke: var(--ink); stroke-width: 1.4; fill: none; }
</style>
<rect x="20" y="34" width="230" height="126" rx="4" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.4"/>
<line x1="20" y1="76" x2="250" y2="76" stroke="var(--ink)" stroke-width="1.2"/>
<line x1="20" y1="118" x2="250" y2="118" stroke="var(--ink)" stroke-width="1.2"/>
<text class="mono cap" x="135" y="50" font-size="10.5" text-anchor="middle">&lt;&lt;abstract&gt;&gt;</text>
<text class="mono" x="135" y="68" font-size="13" font-weight="700" text-anchor="middle">Shape</text>
<text class="mono" x="32" y="94" font-size="11">- String name</text>
<text class="mono" x="32" y="110" font-size="11">- int size</text>
<text class="mono" x="32" y="136" font-size="11">+ area()* double</text>
<text class="mono" x="32" y="152" font-size="11"># getName() String</text>
<text class="cap" x="20" y="26" font-size="11" font-weight="700">коробка класса</text>

<text class="cap" x="286" y="50" font-size="11"><tspan class="mono" font-weight="700">+</tspan> public &nbsp; <tspan class="mono" font-weight="700">-</tspan> private</text>
<text class="cap" x="286" y="70" font-size="11"><tspan class="mono" font-weight="700">#</tspan> protected &nbsp; <tspan class="mono" font-weight="700">~</tspan> пакет</text>
<text class="cap" x="286" y="96" font-size="11">тип пишется справа от имени</text>
<text class="cap" x="286" y="116" font-size="11">звёздочка у метода — он абстрактный</text>
<text class="cap" x="286" y="140" font-size="11">стереотип уточняет вид коробки:</text>
<text class="mono cap" x="286" y="158" font-size="10.5">interface · abstract · enum · record</text>

<line x1="20" y1="178" x2="580" y2="178" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="198" font-size="11" font-weight="700">пять стрелок</text>
${arrow(220, `<line class="ln" x1="30" y1="220" x2="130" y2="220" marker-end="url(#${slug}-tri)"/>`, "наследование", "extends")}
${arrow(252, `<line class="ln" x1="30" y1="252" x2="130" y2="252" stroke-dasharray="6 4" marker-end="url(#${slug}-tri)"/>`, "реализация", "implements")}
${arrow(284, `<line class="ln" x1="130" y1="284" x2="30" y2="284" marker-end="url(#${slug}-dia)"/>`, "агрегация — имеет", "поле")}
${arrow(316, `<line class="ln" x1="130" y1="316" x2="30" y2="316" marker-end="url(#${slug}-diaf)"/>`, "композиция — часть целого", "поле")}
${arrow(348, `<line class="ln" x1="30" y1="348" x2="130" y2="348" stroke-dasharray="6 4" marker-end="url(#${slug}-open)"/>`, "зависимость — пользуется", "параметр")}

<line x1="20" y1="370" x2="580" y2="370" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="392" font-size="12">треугольник — иерархия, ромб — «имеет»; линия сплошная у класса, пунктирная у договора</text>
<text class="cap" x="20" y="412" font-size="12">стрелка идёт <tspan font-weight="700">от того, кто зависит</tspan>, к тому, от кого: наследник указывает на родителя</text>`;
  return svgWrap("0 0 600 428", slug, "Обозначения диаграммы классов", inner);
}

// Тот же сервис, что в ноде: узор декоратора и отсутствие стрелок
// к конкретным классам видны сразу.
function buildUmlService() {
  const slug = "uml-service";
  const box = (x, y, w, name, stereo, kind) => `
<rect x="${x}" y="${y}" width="${w}" height="${stereo ? 48 : 34}" rx="4" fill="var(--paper)" stroke="var(--${kind})" stroke-width="1.4"/>
${stereo ? `<text class="mono cap" x="${x + w / 2}" y="${y + 18}" font-size="10" text-anchor="middle">&lt;&lt;interface&gt;&gt;</text>` : ""}
<text class="mono" x="${x + w / 2}" y="${y + (stereo ? 38 : 22)}" font-size="12" font-weight="700" text-anchor="middle">${name}</text>`;
  const inner = `<defs>
<marker id="${slug}-tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.2"/></marker>
<marker id="${slug}-dia" viewBox="0 0 14 10" refX="13" refY="5" markerWidth="11" markerHeight="9" orient="auto"><path d="M0,5 L7,0 L14,5 L7,10 Z" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.2"/></marker>
</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .ln { stroke: var(--ink); stroke-width: 1.3; fill: none; }
</style>
${box(210, 24, 180, "UserService", false, "accent")}
${box(40, 132, 180, "Storage", true, "line")}
${box(380, 132, 180, "Mailer", true, "line")}
${box(20, 250, 150, "MemoryStorage", false, "line")}
${box(196, 250, 150, "Logging", false, "gold")}

<line class="ln" x1="150" y1="128" x2="256" y2="60" marker-end="url(#${slug}-dia)"/>
<line class="ln" x1="450" y1="128" x2="344" y2="60" marker-end="url(#${slug}-dia)"/>

<line class="ln" x1="95" y1="246" x2="110" y2="184" stroke-dasharray="6 4" marker-end="url(#${slug}-tri)"/>
<line class="ln" x1="255" y1="246" x2="160" y2="184" stroke-dasharray="6 4" marker-end="url(#${slug}-tri)"/>
<path class="ln" d="M224,158 C420,170 420,262 350,266" marker-end="url(#${slug}-dia)"/>
<text class="cap" x="428" y="220" font-size="10.5" text-anchor="middle">Logging держит</text>
<text class="cap" x="428" y="236" font-size="10.5" text-anchor="middle">Storage полем</text>

<line x1="20" y1="308" x2="580" y2="308" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="330" font-size="12">две стрелки от <tspan class="mono" font-weight="700">Logging</tspan> к <tspan class="mono" font-weight="700">Storage</tspan> — реализует и держит: это обёртка</text>
<text class="cap" x="20" y="350" font-size="12">у <tspan class="mono" font-weight="700">UserService</tspan> стрелки только к интерфейсам — он не знает ни одной реализации</text>
<text class="cap" x="20" y="370" font-size="12">сплошных линий с треугольником нет вовсе: наследования в этой конструкции ноль</text>`;
  return svgWrap("0 0 600 386", slug, "Схема сервиса: что из неё видно", inner);
}

/* ---------------------------------------------------------------- 3.58 */

// Схема итогового проекта: наследования нет вообще, вся конструкция на
// композиции и одном интерфейсе. Ровно это и надо увидеть.
function buildTrackerDesign() {
  const slug = "tracker-design";
  const box = (x, y, w, h, name, stereo, kind, lines) => `
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="var(--paper)" stroke="var(--${kind})" stroke-width="1.4"/>
${stereo ? `<text class="mono cap" x="${x + w / 2}" y="${y + 16}" font-size="9.5" text-anchor="middle">&lt;&lt;${stereo}&gt;&gt;</text>` : ""}
<text class="mono" x="${x + w / 2}" y="${y + (stereo ? 34 : 22)}" font-size="12" font-weight="700" text-anchor="middle">${name}</text>
${(lines || []).map((t, i) => `<text class="mono cap" x="${x + 10}" y="${y + (stereo ? 52 : 40) + i * 15}" font-size="9.5">${esc(t)}</text>`).join("")}`;
  const inner = `<defs>
<marker id="${slug}-tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.2"/></marker>
<marker id="${slug}-dia" viewBox="0 0 14 10" refX="13" refY="5" markerWidth="11" markerHeight="9" orient="auto"><path d="M0,5 L7,0 L14,5 L7,10 Z" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.2"/></marker>
</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
.dg-${slug} .ln { stroke: var(--ink); stroke-width: 1.3; fill: none; }
</style>
${box(200, 20, 200, 58, "Tracker", "", "accent", ["- Task[] tasks", "- Reporter reporter"])}
${box(20, 128, 170, 74, "Task", "", "line", ["- Priority priority", "- Status status", "- String assignee"])}
${box(400, 128, 180, 58, "Reporter", "interface", "line", ["+ render(Task[]) String"])}
${box(20, 250, 130, 64, "Priority", "enum", "gold", ["метка, вес"])}
${box(170, 250, 130, 64, "Status", "enum", "gold", ["+ next()"])}
${box(400, 236, 180, 34, "ShortReporter", "", "line", [])}
${box(400, 288, 180, 34, "TitlesReporter", "", "line", [])}

<line class="ln" x1="120" y1="124" x2="240" y2="82" marker-end="url(#${slug}-dia)"/>
<line class="ln" x1="470" y1="124" x2="368" y2="82" marker-end="url(#${slug}-dia)"/>
<line class="ln" x1="70" y1="246" x2="70" y2="206" marker-end="url(#${slug}-dia)"/>
<line class="ln" x1="200" y1="246" x2="140" y2="206" marker-end="url(#${slug}-dia)"/>
<line class="ln" x1="470" y1="232" x2="470" y2="190" stroke-dasharray="6 4" marker-end="url(#${slug}-tri)"/>
<path class="ln" d="M560,284 C596,240 560,206 494,190" stroke-dasharray="6 4" marker-end="url(#${slug}-tri)"/>

<line x1="20" y1="342" x2="580" y2="342" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="364" font-size="12">ни одной сплошной линии с треугольником — <tspan font-weight="700">наследования в проекте нет вовсе</tspan></text>
<text class="cap" x="20" y="384" font-size="12">у <tspan class="mono" font-weight="700">Tracker</tspan> стрелка только к интерфейсу: новый отчёт не потребует править трекер</text>
<text class="cap" x="20" y="404" font-size="12">то, что меняется при жизни объекта (статус, исполнитель), — поля, а не виды задач</text>`;
  return svgWrap("0 0 600 420", slug, "Схема трекера", inner);
}

/* ---------------------------------------------------------------- 3.59 */

// Карта этапа: четыре блока и четыре идеи, к которым всё сводится.
function buildStage3Map() {
  const slug = "stage3-map";
  const block = (y, range, title, items, kind) => `
<rect x="20" y="${y}" width="560" height="52" rx="10" fill="var(--paper)" stroke="var(--${kind})" stroke-width="1.3"/>
<text class="mono cap" x="34" y="${y + 21}" font-size="11">${range}</text>
<text x="122" y="${y + 21}" font-size="12.5" font-weight="700">${title}</text>
<text class="cap" x="34" y="${y + 41}" font-size="10.5">${items}</text>`;
  const idea = (x, n, text) => `
<rect x="${x}" y="294" width="130" height="70" rx="10" fill="var(--sunk)" stroke="var(--gold)" stroke-width="1.2"/>
<text class="mono cap" x="${x + 12}" y="314" font-size="11">${n}</text>
${text.map((t, i) => `<text x="${x + 12}" y="${334 + i * 15}" font-size="10.5">${t}</text>`).join("")}`;
  const inner = `<defs>${arrowDefs(slug)}</defs>
<style>
.dg-${slug} text { font-family: inherit; fill: var(--ink); }
.dg-${slug} .cap { fill: var(--muted); }
.dg-${slug} .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
<text class="cap" x="20" y="22" font-size="11" font-weight="700">четыре блока этапа</text>
${block(32, "3.01–3.19", "класс и объект", "поля · методы · конструкторы · this · static · инкапсуляция · неизменяемость · пакеты", "accent")}
${block(92, "3.20–3.31", "иерархии", "extends · super · переопределение · полиморфизм · касты · final · protected", "accent")}
${block(152, "3.32–3.47", "абстракции", "абстрактные классы · интерфейсы · default · enum · record · sealed", "accent")}
${block(212, "3.48–3.58", "вложенность и дизайн", "четыре формы вложенных · композиция · зависимости через интерфейсы · UML", "accent")}

<text class="cap" x="20" y="286" font-size="11" font-weight="700">и четыре идеи, к которым всё сводится</text>
${idea(20, "1", ["данные и действия", "в одном месте"])}
${idea(164, "2", ["снаружи видно то,", "что открыл автор"])}
${idea(308, "3", ["один вызов —", "разные реализации"])}
${idea(452, "4", ["компилятору можно", "рассказать правду"])}

<line x1="20" y1="382" x2="580" y2="382" stroke="var(--line)" stroke-width="1"/>
<text class="cap" x="20" y="404" font-size="12">всё остальное — механика, которая эти четыре идеи обслуживает</text>`;
  return svgWrap("0 0 600 420", slug, "Карта этапа 3", inner);
}

export const DIAGRAM_INDEX = {
  "1.02": ["front-back"],
  // Этап 1 переразбит на мелкие ноды, схемы разъехались вслед за содержанием:
  // байткод и JVM ушли в 1.033, стандартная библиотека в 1.034, матрёшка осталась
  // в сузившейся 1.03, анатомия main переехала в 1.071.
  "1.033": ["bytecode-jvm"],
  "1.034": ["stdlib-why"],
  "1.03": ["jdk-matryoshka"],
  "1.04": ["compile-pipeline"],
  "1.071": ["main-anatomy"],
  "1.19": ["error-gates"],
  "1.21": ["stack-trace"],
  "2.01": ["var-box"],
  "2.02": ["int-sizes"],
  "2.03": ["double-drift"],
  "2.04": ["char-code"],
  "2.05": ["literal-forms"],
  "2.06": ["widening-ladder", "promotion-floor"],
  "2.07": ["cast-cut"],
  "2.09": ["arith-five"],
  "2.10": ["divmod-split"],
  "2.11": ["int-overflow-ring"],
  "2.12": ["incr-pre-post"],
  "2.13": ["expr-order"],
  "2.17": ["string-plus"],
  "2.18": ["scanner-buffer"],
  "2.19": ["compare-ops"],
  "2.20": ["bool-ops"],
  "2.21": ["if-flow"],
  "2.22": ["elseif-chain"],
  "2.23": ["ternary-parts"],
  "2.25": ["switch-fallthrough"],
  "2.26": ["switch-arrow"],
  "2.29": ["while-flow"],
  "2.30": ["dowhile-flow"],
  "2.31": ["for-parts"],
  "2.32": ["break-continue"],
  "2.33": ["nested-loops"],
  "2.34": ["labeled-break"],
  "2.35": ["loop-patterns"],
  "2.36": ["validate-loop"],
  "2.38": ["random-range"],
  "2.42": ["array-memory"],
  "2.43": ["foreach-vs-index"],
  "2.45": ["linear-search"],
  "2.47": ["array2d-memory"],
  "2.48": ["matrix-walk"],
  "2.49": ["arrays-tools"],
  "2.53": ["method-call"],
  "2.54": ["params-return"],
  "2.55": ["array-param-alias"],
  "2.56": ["overload-pick"],
  "2.57": ["scope-blocks"],
  "2.59": ["decompose"],
  "2.61": ["recursion-base"],
  "2.62": ["call-stack"],
  "2.66": ["naming-cases"],
  "2.67": ["debugger-panel"],
  "3.01": ["class-blueprint"],
  "3.02": ["stack-heap-refs"],
  "3.03": ["fields-per-object"],
  "3.04": ["method-on-object"],
  "3.05": ["ctor-flow"],
  "3.06": ["this-arrow"],
  "3.08": ["static-vs-instance"],
  "3.09": ["const-final"],
  "3.10": ["init-order"],
  "3.11": ["encapsulation-shell"],
  "3.12": ["getter-setter"],
  "3.13": ["immutable-copy"],
  "3.14": ["package-tree"],
  "3.15": ["access-matrix"],
  "3.20": ["inherit-tree"],
  "3.21": ["super-chain"],
  "3.22": ["override-table"],
  "3.23": ["override-vs-overload"],
  "3.24": ["polymorph-call"],
  "3.25": ["upcast-downcast"],
  "3.26": ["instanceof-pattern"],
  "3.27": ["final-lock"],
  "3.28": ["protected-reach"],
  "3.32": ["abstract-DEMO_PROJECT"],
  "3.33": ["interface-contract"],
  "3.34": ["multi-interface"],
  "3.35": ["defausupportethod"],
  "3.36": ["iface-vs-abstract"],
  "3.38": ["enum-instances"],
  "3.39": ["enum-fields"],
  "3.40": ["enum-switch"],
  "3.41": ["record-generated"],
  "3.42": ["compact-ctor"],
  "3.43": ["sealed-permits"],
  "3.44": ["tagged-union"],
  "3.53": ["composition-vs-inherit"],
  "3.54": ["program-to-interface"],
  "3.55": ["uml-service", "uml-classbox"],
  "3.58": ["tracker-design"],
  "3.59": ["stage3-map"],
};

const REGISTRY = {
  "front-back": { id: "front-back", title: "Как фронтенд и бекенд разговаривают", caption: "Телефон только рисует. Данные и решения — на сервере, и туда он ходит запросом.", anchor: "Что происходит, когда ты открываешь приложение банка", svg: buildFrontBack() },
  "bytecode-jvm": { id: "bytecode-jvm", title: "От исходника к байткоду и в JVM", caption: "Слева всё происходит один раз: javac переводит твой текст в байткод. Справа этот же файл выполняет JVM — своя на каждой системе.", anchor: "Что здесь произошло", svg: buildBytecodeJvm() },
  "stdlib-why": { id: "stdlib-why", title: "Зачем нужна стандартная библиотека", caption: "Одно и то же дело: сверху — вручную и на каждой системе по-своему, снизу — одной готовой командой.", anchor: "Что здесь произошло", svg: buildStdlibWhy() },
  "jdk-matryoshka": { id: "jdk-matryoshka", title: "Матрёшка JDK, JRE и JVM", caption: "JDK содержит JRE, а JRE содержит JVM — каждый следующий слой работает внутри предыдущего.", anchor: "Кому что нужно", svg: buildJdkMatryoshka() },
  "compile-pipeline": { id: "compile-pipeline", title: "Путь программы: от исходника до вывода", caption: "На диске лежат только .java и .class — сам процесс JVM и вывод в консоли нигде не сохраняются.", anchor: "Полный цикл, шаг за шагом", svg: buildCompilePipeline() },
  "main-anatomy": { id: "main-anatomy", title: "Анатомия public static void main", caption: "Каждое слово в сигнатуре — отдельное правило, а не украшение.", anchor: "Четыре слова, которые ты пишешь наизусть", svg: buildMainAnatomy() },
  "error-gates": { id: "error-gates", title: "Где ловится какая ошибка", caption: "«Скомпилировалось» — это про javac. «Работает» — отдельная проверка, её делает уже java.", anchor: "Ключевые тезисы", svg: buildErrorGates() },
  "stack-trace": { id: "stack-trace", title: "Как читать stack trace", caption: "Читай сверху вниз, но ищи баг в первой строке, которая — твой код, а не JDK.", anchor: "Ключевые тезисы", svg: buildStackTrace() },
  "var-box": { id: "var-box", title: "Переменная: имя, тип и значение", caption: "Слева разбор записи по частям, справа сама коробка. Новое значение не добавляется рядом со старым — оно его затирает.", anchor: "Что здесь произошло", svg: buildVarBox() },
  "int-sizes": { id: "int-sizes", title: "Четыре целых типа и их диапазоны", caption: "Ширина полосы — сколько чисел влезает. int взят по умолчанию не потому, что средний, а потому что покрывает почти всё.", anchor: "Что здесь произошло", svg: buildIntSizes() },
  "double-drift": { id: "double-drift", title: "Почему 0.1 + 0.2 не равно 0.3", caption: "В памяти лежат не твои десятичные дроби, а ближайшие двоичные. Сумма двух приближений промахивается мимо третьего — на семнадцатом знаке.", anchor: "Что здесь произошло", svg: buildDoubleDrift() },
  "char-code": { id: "char-code", title: "char это номер, а не картинка", caption: "В памяти у буквы лежит её номер. Буква появляется только при печати — поэтому сложение двух char даёт число, а не слово.", anchor: "Что здесь произошло", svg: buildCharCode() },
  "literal-forms": { id: "literal-forms", title: "Одно число, четыре записи", caption: "Форма записи это удобство для человека. В памяти от неё ничего не зависит — кроме ведущего нуля, который молча меняет систему счисления.", anchor: "Что здесь произошло", svg: buildLiteralForms() },
  "promotion-floor": { id: "promotion-floor", title: "Какой тип получится при сложении", caption: "Java берёт самый широкий тип среди операндов, но не ниже int. Отсюда и вопрос «почему byte + byte не byte»: до сложения они оба стали int.", anchor: "Какой тип получится у результата", svg: buildPromotionFloor() },
  "widening-ladder": { id: "widening-ladder", title: "Лестница расширения типов", caption: "Вверх по лестнице JVM ходит сама, вниз — только с твоего явного разрешения (каст).", anchor: "Ключевые тезисы", svg: buildWideningLadder() },
  "cast-cut": { id: "cast-cut", title: "Что отрезает каст", caption: "Сужающий каст не округляет и не спрашивает — он просто отбрасывает лишние биты или дробную часть.", anchor: "Что здесь произошло", svg: buildCastCut() },
  "arith-five": { id: "arith-five", title: "Пять арифметических операторов", caption: "Первые три ведут себя как в тетради. Последние два — нет: над двумя целыми деление тоже целое, а остаток отдаётся отдельной операцией.", anchor: "Что здесь произошло", svg: buildArithFive() },
  "divmod-split": { id: "divmod-split", title: "Деление с остатком: 17 на 5", caption: "Частное и остаток — две части одного разложения. Проверка всегда одна: частное × делитель + остаток = делимое.", anchor: "Что здесь произошло", svg: buildDivmodSplit() },
  "int-overflow-ring": { id: "int-overflow-ring", title: "Числовой круг int", caption: "MAX_VALUE + 1 не бросает исключение — JVM молча перескакивает на MIN_VALUE.", anchor: "Что здесь произошло", svg: buildIntOverflowRing() },
  "incr-pre-post": { id: "incr-pre-post", title: "Постфиксный и префиксный инкремент", caption: "Переменная в обоих случаях увеличивается. Отличается только то, какое значение уходит дальше по строке.", anchor: "Где i++ перестаёт быть равно ++i", svg: buildIncrPrePost() },
  "expr-order": { id: "expr-order", title: "Порядок вычисления выражения", caption: "Одинаковый приоритет — значит просто слева направо, а не «что раньше в уме посчиталось».", anchor: "Что здесь произошло", svg: buildExprOrder() },
  "string-plus": { id: "string-plus", title: "Плюс со строкой читается слева направо", caption: "Роль плюса выбирается по операндам на каждом шаге. Как только слева оказалась строка, дальше идёт только склейка — вернуть сложение можно лишь скобками.", anchor: "Порядок решает всё", svg: buildStringPlus() },
  "scanner-buffer": { id: "scanner-buffer", title: "Буфер ввода: почему nextLine возвращает пустую строку", caption: "nextInt забирает из буфера цифры и оставляет перевод строки. Следующий nextLine находит его первым же символом и честно возвращает пустую строку.", anchor: "Что здесь произошло", svg: buildScannerBuffer() },
  "compare-ops": { id: "compare-ops", title: "Шесть операторов сравнения на числовой оси", caption: "Закрашенная точка — граница входит, полая — нет. Ошибка на единицу видна именно здесь, а не в тексте условия.", anchor: "Что здесь произошло", svg: buildCompareOps() },
  "bool-ops": { id: "bool-ops", title: "Три логические операции и короткое замыкание", caption: "«И» требует обе стороны, «или» хватает одной. Если ответ определился слева, правая сторона не вычисляется вообще — на этом и строят проверку перед опасным действием.", anchor: "Что здесь произошло", svg: buildBoolOps() },
  "if-flow": { id: "if-flow", title: "Как выполняется if else", caption: "Веток две, выполняется ровно одна, и сразу за конструкцией пути снова сходятся в один.", anchor: "Что здесь произошло", svg: buildIfFlow() },
  "elseif-chain": { id: "elseif-chain", title: "Цепочка else if: первое совпадение обрывает очередь", caption: "Нижние условия не «дали false» — их не спрашивали. Поэтому порядок веток в цепочке и есть её логика.", anchor: "Что здесь произошло", svg: buildElseifChain() },
  "ternary-parts": { id: "ternary-parts", title: "Тернарный оператор по частям", caption: "if выполняет действие, тернарник вычисляет значение. Отсюда и правило выбора: выбираешь значение — тернарник, делаешь что-то — if.", anchor: "Что здесь произошло", svg: buildTernaryParts() },
  "switch-fallthrough": { id: "switch-fallthrough", title: "Провал в классическом switch", caption: "Метка — это точка входа, а не граница блока. Без break выполнение идёт дальше сквозь все оставшиеся ветки.", anchor: "Что здесь произошло", svg: buildSwitchFallthrough() },
  "switch-arrow": { id: "switch-arrow", title: "Классический и стрелочный switch рядом", caption: "Стрелка задаёт границы ветки сама, поэтому break не нужен. И вся конструкция получает значение — её можно присвоить.", anchor: "Что здесь произошло", svg: buildSwitchArrow() },
  "while-flow": { id: "while-flow", title: "Как выполняется while", caption: "Проверка стоит перед телом, поэтому итераций может быть и ноль. Последняя проверка — та, что выводит из цикла.", anchor: "Что здесь произошло", svg: buildWhileFlow() },
  "dowhile-flow": { id: "dowhile-flow", title: "Как выполняется do while", caption: "Та же схема, но проверка переехала вниз. Отсюда единственное отличие: тело выполняется минимум один раз.", anchor: "Что здесь произошло", svg: buildDoWhileFlow() },
  "for-parts": { id: "for-parts", title: "Три части шапки for и порядок их выполнения", caption: "Подготовка один раз, условие перед каждой итерацией, шаг после неё. Записан шаг вторым, а выполняется последним.", anchor: "Что здесь произошло", svg: buildForParts() },
  "break-continue": { id: "break-continue", title: "Куда прыгают break и continue", caption: "break уходит наружу мимо шага и проверки. continue возвращается внутрь — в for на шаг, в while сразу на проверку.", anchor: "Что здесь произошло", svg: buildBreakContinue() },
  "nested-loops": { id: "nested-loops", title: "Порядок обхода во вложенных циклах", caption: "Внутренний счётчик пробегает весь диапазон на каждый шаг внешнего. Итераций получается произведение, а не сумма.", anchor: "Что здесь произошло", svg: buildNestedLoops() },
  "labeled-break": { id: "labeled-break", title: "Куда уводит break с меткой", caption: "Обычный break отдаёт управление внешнему циклу, и тот заходит внутрь снова. Метка уносит сразу за пределы обоих.", anchor: "Что здесь произошло", svg: buildLabeledBreak() },
  "loop-patterns": { id: "loop-patterns", title: "Шесть скелетов цикла", caption: "Все шесть устроены одинаково: переменная до цикла, одна строка внутри, ответ после. Различаются только стартом и действием.", anchor: "Что здесь произошло", svg: buildLoopPatterns() },
  "validate-loop": { id: "validate-loop", title: "Цикл валидации ввода", caption: "Условие описывает плохой случай, а не хороший. hasNextInt только смотрит — мусор из буфера надо забрать вручную, иначе цикл вечный.", anchor: "Что здесь произошло", svg: buildValidateLoop() },
  "random-range": { id: "random-range", title: "Как из Math.random получается число от 1 до 6", caption: "Умножение растягивает отрезок, каст схлопывает его в целые точки, сложение сдвигает. Верхняя граница не убегает именно из-за отсечения.", anchor: "Что здесь произошло", svg: buildRandomRange() },
  "foreach-vs-index": { id: "foreach-vs-index", title: "for each против индексного обхода", caption: "В for each переменная — отдельная копия значения. Присваивание ей массива не касается, поэтому записывать можно только через индекс.", anchor: "Что здесь произошло", svg: buildForeachVsIndex() },
  "linear-search": { id: "linear-search", title: "Линейный поиск и метка минус один", caption: "break отвечает на вопрос «первое или последнее совпадение». Минус единица не пересекается с настоящими индексами и потому годится как ответ «не нашли».", anchor: "Что здесь произошло", svg: buildLinearSearch() },
  "matrix-walk": { id: "matrix-walk", title: "Порядок обхода матрицы", caption: "Внешний цикл спускается по строкам, внутренний бежит вдоль строки. Порядок индексов при этом не меняется никогда.", anchor: "Что здесь произошло", svg: buildMatrixWalk() },
  "arrays-tools": { id: "arrays-tools", title: "Готовые операции над массивами", caption: "Всё это ты уже написал руками. Знать, как оно устроено, нужно — но в рабочем коде берут готовое.", anchor: "Что здесь произошло", svg: buildArraysTools() },
  "array-memory": { id: "array-memory", title: "Массив в памяти", caption: "Переменная на стеке — это стрелка. Сам массив, с его length и ячейками, живёт в куче.", anchor: "Ключевые тезисы", svg: buildArrayMemory() },
  "array2d-memory": { id: "array2d-memory", title: "Двумерный массив — это массив ссылок", caption: "«Строки» двумерного массива — независимые объекты в куче, поэтому их длины могут различаться.", anchor: "Ключевые тезисы", svg: buildArray2dMemory() },
  "method-call": { id: "method-call", title: "Что происходит при вызове метода", caption: "Управление уходит в тело метода и возвращается на строку сразу после вызова. Остальные строки никуда не деваются.", anchor: "Что здесь произошло", svg: buildMethodCall() },
  "params-return": { id: "params-return", title: "Подпись метода и поведение return", caption: "Подпись — договор: что принимаем и что обязаны вернуть. return отдаёт значение и сразу выходит, поэтому несколько return вместо else — нормальный стиль.", anchor: "Что здесь произошло", svg: buildParamsReturn() },
  "array-param-alias": { id: "array-param-alias", title: "Что копируется при передаче массива в метод", caption: "Копируется ссылка, а не ячейки. Поэтому менять содержимое можно, а заменить сам массив — нет.", anchor: "Что здесь произошло", svg: buildArrayParamAlias() },
  "overload-pick": { id: "overload-pick", title: "Как выбирается перегрузка", caption: "Сначала ищется точное совпадение типов, потом ближайшее расширение по лестнице. Тип результата в выборе не участвует.", anchor: "Что здесь произошло", svg: buildOverloadPick() },
  "scope-blocks": { id: "scope-blocks", title: "Области видимости вложенными блоками", caption: "Переменная живёт до закрывающей скобки своего блока. Изнутри видно наружу, снаружи внутрь — нет.", anchor: "Что здесь произошло", svg: buildScopeBlocks() },
  "decompose": { id: "decompose", title: "Один main против разбиения на методы", caption: "После разбиения строк становится больше, а читать — меньше: main превращается в оглавление.", anchor: "Что здесь произошло", svg: buildDecompose() },
  "recursion-base": { id: "recursion-base", title: "База и шаг рекурсии", caption: "Вниз идём, уменьшая аргумент, до базы. Вверх поднимаемся, собирая ответ из полученного.", anchor: "Что здесь произошло", svg: buildRecursionBase() },
  "naming-cases": { id: "naming-cases", title: "Четыре соглашения об именах", caption: "Регистр имени — это информация: с заглавной значит класс, ЗАГЛАВНЫЕ_С_ПОДЧЁРКИВАНИЕМ значит константа.", anchor: "Что здесь произошло", svg: buildNamingCases() },
  "debugger-panel": { id: "debugger-panel", title: "Панель отладчика: что где находится", caption: "Точка останова замораживает программу перед строкой, панель показывает все переменные сразу — дописывать println не нужно.", anchor: "Что здесь произошло", svg: buildDebuggerPanel() },
  "call-stack": { id: "call-stack", title: "Стек вызовов при рекурсии", caption: "Каждый вызов — свой фрейм со своими переменными; результаты возвращаются в обратном порядке.", anchor: "Ключевые тезисы", svg: buildCallStack() },
  "class-blueprint": { id: "class-blueprint", title: "Класс и объекты", caption: "Класс пишется один раз и памяти под данные не занимает. Данные появляются на каждый new.", anchor: "Что здесь произошло", svg: buildClassBlueprint() },
  "stack-heap-refs": { id: "stack-heap-refs", title: "Стек, куча и ссылки", caption: "Несколько переменных могут смотреть на один объект; null не смотрит никуда.", anchor: "Что здесь произошло", svg: buildStackHeapRefs() },
  "fields-per-object": { id: "fields-per-object", title: "Поля принадлежат объекту", caption: "Объявление одно, комплектов столько же, сколько объектов — и каждый стартует со значений по умолчанию.", anchor: "Что здесь произошло", svg: buildFieldsPerObject() },
  "method-on-object": { id: "method-on-object", title: "Метод объекта: код один, поля разные", caption: "value++ трогает поле того объекта, у которого метод позвали.", anchor: "Что здесь произошло", svg: buildMethodOnObject() },
  "ctor-flow": { id: "ctor-flow", title: "Что происходит при new", caption: "Тело конструктора выполняется последним — поэтому оно перебивает и умолчания, и инициализаторы полей.", anchor: "Что здесь произошло", svg: buildCtorFlow() },
  "this-arrow": { id: "this-arrow", title: "this.name = name", caption: "Слева поле объекта, справа параметр. Без this обе стороны означают одно и то же.", anchor: "Что здесь произошло", svg: buildThisArrow() },
  "static-vs-instance": { id: "static-vs-instance", title: "Что принадлежит классу, а что объекту", caption: "static-поле одно на весь класс; обычных полей столько же, сколько объектов.", anchor: "Что здесь произошло", svg: buildStaticVsInstance() },
  "const-final": { id: "const-final", title: "static final: два слова, два запрета", caption: "final замораживает переменную, а не объект по ссылке — отсюда «константа», которая меняется.", anchor: "Что здесь произошло", svg: buildConstFinal() },
  "init-order": { id: "init-order", title: "Порядок инициализации", caption: "Статическая часть один раз, часть объекта на каждый new; внутри каждой — сверху вниз по тексту.", anchor: "Что здесь произошло", svg: buildInitOrder() },
  "encapsulation-shell": { id: "encapsulation-shell", title: "Инкапсуляция: закрытое внутри, кнопки снаружи", caption: "Пока изменения идут через методы, инвариант держится сам, а не по договорённости.", anchor: "Что здесь произошло", svg: buildEncapsulationShell() },
  "getter-setter": { id: "getter-setter", title: "Геттеры и сеттеры", caption: "Снаружи видно свойства, а не поля: бывает поле без геттера и геттер без поля.", anchor: "Что здесь произошло", svg: buildGetterSetter() },
  "immutable-copy": { id: "immutable-copy", title: "Две защитные копии", caption: "Копия на входе и копия на выходе. Забыл любую — осталась лазейка.", anchor: "Что здесь произошло", svg: buildImmutableCopy() },
  "package-tree": { id: "package-tree", title: "Пакет: папка, package и полное имя", caption: "Путь к файлу и строка package обязаны совпасть; полное имя класса — это пакет плюс имя.", anchor: "Что здесь произошло", svg: buildPackageTree() },
  "inherit-tree": { id: "inherit-tree", title: "Что даёт extends", caption: "Наследник получает поля и методы, но не доступ к private и не конструкторы.", anchor: "Что здесь произошло", svg: buildInheritTree() },
  "super-chain": { id: "super-chain", title: "Порядок сборки по цепочке", caption: "Один new — вся цепочка конструкторов от корня вниз, родительская часть всегда первой.", anchor: "Что здесь произошло", svg: buildSuperChain() },
  "override-table": { id: "override-table", title: "Переопределение: правила и выбор", caption: "Тип переменной решает, что можно звать; класс объекта — что выполнится.", anchor: "Что здесь произошло", svg: buildOverrideTable() },
  "override-vs-overload": { id: "override-vs-overload", title: "Перегрузка против переопределения", caption: "Различий два: совпадают ли параметры и кто выбирает метод. Остальное — следствия.", anchor: "Что здесь произошло", svg: buildOverrideVsOverload() },
  "polymorph-call": { id: "polymorph-call", title: "Один вызов, разные реализации", caption: "Цикл не знает видов фигур, а фигуры не знают про цикл.", anchor: "Что здесь произошло", svg: buildPolymorphCall() },
  "upcast-downcast": { id: "upcast-downcast", title: "Вверх и вниз по иерархии", caption: "Вверх — само и безопасно, вниз — со скобками и с риском ClassCastException.", anchor: "Что здесь произошло", svg: buildUpcastDowncast() },
  "instanceof-pattern": { id: "instanceof-pattern", title: "instanceof с именем переменной", caption: "Проверка и приведение одним движением; переменная видна там, где проверка прошла.", anchor: "Что здесь произошло", svg: buildInstanceofPattern() },
  "final-lock": { id: "final-lock", title: "Три места для final", caption: "У поля — значение, у метода — поведение, у класса — сама возможность наследования.", anchor: "Что здесь произошло", svg: buildFinalLock() },
  "protected-reach": { id: "protected-reach", title: "Что даёт protected", caption: "Весь свой пакет плюс наследники в чужих — но те только через ссылку своего типа.", anchor: "Что здесь произошло", svg: buildProtectedReach() },
  "abstract-DEMO_PROJECT": { id: "abstract-DEMO_PROJECT", title: "Абстрактный класс: общая часть и дырки", caption: "Общий код написан один раз, обязательные методы наследник заполняет сам.", anchor: "Что здесь произошло", svg: buildAbstractGap() },
  "interface-contract": { id: "interface-contract", title: "Интерфейс: общее умение без общего предка", caption: "Три класса из разных иерархий получают один тип — наследование так не умеет.", anchor: "Что здесь произошло", svg: buildInterfaceContract() },
  "multi-interface": { id: "multi-interface", title: "Один родитель, много интерфейсов", caption: "Класс-родитель ровно один, интерфейсов сколько угодно — и столько же типов у объекта.", anchor: "Что здесь произошло", svg: buildMultiInterface() },
  "defausupportethod": { id: "defausupportethod", title: "default и static в интерфейсе", caption: "Метод добавляется в договор, не ломая готовые реализации; конфликт двух default разрешаешь ты.", anchor: "Что здесь произошло", svg: buildDefausupportethod() },
  "iface-vs-abstract": { id: "iface-vs-abstract", title: "Интерфейс против абстрактного класса", caption: "Настоящих отличий два: состояние и множественность. Остальное — следствия.", anchor: "Что здесь произошло", svg: buildIfaceVsAbstract() },
  "enum-instances": { id: "enum-instances", title: "enum: фиксированный набор объектов", caption: "Каждое значение существует в одном экземпляре — отсюда и == вместо equals.", anchor: "Что здесь произошло", svg: buildEnumInstances() },
  "enum-fields": { id: "enum-fields", title: "enum с полями и методами", caption: "Данные о значении живут внутри значения, а не в таблице снаружи.", anchor: "Что здесь произошло", svg: buildEnumFields() },
  "enum-switch": { id: "enum-switch", title: "switch по enum и проверка полноты", caption: "Пропущенное значение — ошибка сборки; default выключает эту проверку.", anchor: "Что здесь произошло", svg: buildEnumSwitch() },
  "record-generated": { id: "record-generated", title: "Что record пишет за тебя", caption: "Одна строка даёт поля, конструктор, методы доступа, equals, hashCode и toString.", anchor: "Что здесь произошло", svg: buildRecordGenerated() },
  "compact-ctor": { id: "compact-ctor", title: "Компактный конструктор", caption: "Правишь параметр, а присваивание полям дописывает компилятор.", anchor: "Что здесь произошло", svg: buildCompactCtor() },
  "sealed-permits": { id: "sealed-permits", title: "sealed: наследование по списку", caption: "Третье состояние между «открыта» и «закрыта» — и проверка полноты switch в награду.", anchor: "Что здесь произошло", svg: buildSealedPermits() },
  "tagged-union": { id: "tagged-union", title: "sealed + record: честная подпись", caption: "Вернётся ровно одно из перечисленного, каждый вариант со своими данными.", anchor: "Что здесь произошло", svg: buildTaggedUnion() },
  "composition-vs-inherit": { id: "composition-vs-inherit", title: "Наследование против композиции", caption: "Наследование связывает с реализацией родителя, композиция — только с его договором.", anchor: "Что здесь произошло", svg: buildCompositionVsInherit() },
  "program-to-interface": { id: "program-to-interface", title: "Зависимость от договора, а не от класса", caption: "Тип — интерфейс, объект — снаружи. Порознь эти два приёма не работают.", anchor: "Что здесь произошло", svg: buildProgramToInterface() },
  "uml-service": { id: "uml-service", title: "Схема сервиса: что из неё видно", caption: "Узор обёртки и отсутствие стрелок к конкретным классам читаются за пару секунд.", anchor: "Смотри как", svg: buildUmlService() },
  "uml-classbox": { id: "uml-classbox", title: "Обозначения диаграммы классов", caption: "Коробка класса, четыре знака видимости и пять стрелок — этого хватает на любую схему.", anchor: "Что здесь произошло", svg: buildUmlClassbox() },
  "tracker-design": { id: "tracker-design", title: "Схема трекера", caption: "Наследования нет вовсе: всё держится на композиции и одном интерфейсе.", anchor: "Разбиение", svg: buildTrackerDesign() },
  "stage3-map": { id: "stage3-map", title: "Карта этапа 3", caption: "Четыре блока и четыре идеи, к которым сводятся все пятьдесят девять нод.", anchor: "Карта этапа", svg: buildStage3Map() },
  "access-matrix": { id: "access-matrix", title: "Матрица видимости", caption: "Каждый следующий модификатор доступа — это надмножество предыдущего, а не отдельный список правил.", anchor: "Что здесь произошло", svg: buildAccessMatrix() },
};

export function diagramsFor(nodeCode) {
  const ids = DIAGRAM_INDEX[nodeCode] || SQL_INDEX[nodeCode];
  if (!ids) return [];
  return ids.map((id) => REGISTRY[id] || SQL_REGISTRY[id]).filter(Boolean);
}
