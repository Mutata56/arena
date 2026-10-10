/* Карта и левая навигация. Один источник — ручки ядра /api/map и /api/map/stage/N. */

import api from "./api.js";
import { escapeHtml } from "./md.js";

const KIND_DOT = {
  "тема": "var(--accent)", "практика": "var(--ok)", "тест": "var(--gold)",
  "проект": "var(--bad)", "рукописная": "var(--muted)", "повторение": "var(--muted)",
  "чтение JDK": "var(--muted)",
};

let cache = { maps: new Map(), stages: new Map() };

export function invalidate() { cache = { maps: new Map(), stages: new Map() }; }

/* ---------------------------------------------------------------- разделы

   Разделов на сайте два: Java и DBA. В базе они разведены смещением номеров
   этапов и префиксом кода ноды, поэтому «2.03» из Java и «d2.03» из DBA живут
   рядом. Здесь мы этим смещением и пользуемся: по коду ноды всегда понятно,
   в каком разделе она лежит и какой номер этапа показывать человеку. */

const TRACK_KEY = "arena.site.track";
let tracksCache = null;
let current = "java";
try { current = localStorage.getItem(TRACK_KEY) || "java"; } catch { /* приватный режим */ }

async function tracks() {
  if (!tracksCache) {
    const data = await api.tracks();
    tracksCache = data.tracks || [];
    if (!tracksCache.some((t) => t.key === current)) current = data.default || "java";
    paintBrand();
  }
  return tracksCache;
}

export function currentTrack() { return current; }

export async function setTrack(key) {
  current = key;
  try { localStorage.setItem(TRACK_KEY, key); } catch { /**/ }
  paintBrand();
}

/** Подпись в шапке говорит, в каком разделе ты сейчас. Без неё переключение
    разделов заметно только на карте, и человек, зашедший по ссылке на ноду
    DBA, видит над собой «Java по шагам». */
function paintBrand() {
  const el = document.querySelector("[data-brand-sub]");
  if (!el) return;
  const t = (tracksCache || []).find((x) => x.key === current);
  el.textContent = t ? `${t.title} · ${t.subtitle}` : "Java по шагам";
}

/** Какому разделу принадлежит код ноды. Префикс длиннее — проверяем первым,
    иначе пустой префикс Java поглотил бы вообще всё. */
function trackOfCode(code) {
  const list = [...(tracksCache || [])].sort((a, b) => b.prefix.length - a.prefix.length);
  return list.find((t) => t.prefix && String(code).startsWith(t.prefix))
    || list.find((t) => !t.prefix) || null;
}

/** Номер этапа в базе по коду ноды: «d2.03» -> 102. */
function stageNumOfCode(code) {
  const t = trackOfCode(code);
  if (!t) return null;
  const bare = String(code).slice(t.prefix.length);
  const num = Number(bare.split(".")[0]);
  return Number.isFinite(num) ? num + t.offset : null;
}

async function mapData(key) {
  await tracks();
  const t = key || current;
  if (!cache.maps.has(t)) cache.maps.set(t, await api.mapTrack(t));
  return cache.maps.get(t);
}
async function stageData(num) {
  if (!cache.stages.has(num)) cache.stages.set(num, await api.stage(num));
  return cache.stages.get(num);
}

/* ---------------------------------------------------------------- левая колонка */

export async function renderRail(rail, currentCode) {
  await tracks();
  // Открыли ноду чужого раздела по прямой ссылке — переезжаем туда сами,
  // иначе колонка показывала бы список этапов, к которому нода не относится.
  if (currentCode) {
    const owner = trackOfCode(currentCode);
    if (owner && owner.key !== current) { await setTrack(owner.key); rail.dataset.stage = ""; }
    else paintBrand();
  }
  const data = await mapData();
  // Имя намеренно не `current`: так зовётся ключ текущего раздела на уровне
  // модуля, и локальная константа с тем же именем роняла всю функцию
  // в мёртвую зону — колонка просто переставала рисоваться.
  const headStage = data.stages.find((s) => s.current)
    || data.stages.find((s) => !s.locked && !s.done)
    || data.stages[0];
  const stageNum = Number(rail.dataset.stage || 0) || currentStageOf(data, currentCode) || headStage?.num;
  if (!stageNum) { rail.innerHTML = ""; return; }
  rail.dataset.stage = String(stageNum);

  const stage = await stageData(stageNum);
  const options = data.stages.map((s) =>
    `<option value="${s.num}" ${s.num === stageNum ? "selected" : ""} ${s.locked ? "disabled" : ""}>
      ${s.shown ?? s.num}. ${escapeHtml(s.title)}${s.locked ? " — закрыт" : ""}</option>`).join("");

  rail.innerHTML = `
    <select class="stagepick" data-stagepick>${options}</select>
    <div class="railhead">ноды этапа · ${stage.nodes.filter((n) => n.status === "closed").length} из ${stage.nodes.length}</div>
    ${stage.nodes.map((n) => `
      <button class="railitem ${n.status === "locked" ? "locked" : ""}"
        data-node="${escapeHtml(n.code)}" aria-current="${n.code === currentCode}"
        ${n.status === "locked" ? "disabled" : ""}>
        <span class="num" style="color:${n.status === "closed" ? "var(--ok)" : ""}">${escapeHtml(n.code)}</span>
        <span class="nm" title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</span>
        ${n.status === "closed" ? '<span class="tick">✓</span>' : ""}
        ${n.status === "in_progress" ? '<span class="tick" style="color:var(--accent)">•</span>' : ""}
      </button>` + drillRow(n, currentCode)).join("")}
    <div class="railhead">разделы</div>
    <button class="railitem" data-go="#/map"><span class="num">карта</span><span class="nm">все этапы</span></button>
    <button class="railitem" data-go="#/review"><span class="num">повтор</span><span class="nm">повторение</span></button>
    <a class="railitem" href="/classic" target="_blank"><span class="num">petля</span><span class="nm">прежний дашборд</span></a>`;

  rail.querySelector("[data-stagepick]").addEventListener("change", (e) => {
    rail.dataset.stage = e.target.value;
    renderRail(rail, currentCode);
  });
  rail.querySelectorAll("[data-node]").forEach((btn) =>
    btn.addEventListener("click", () => { location.hash = `#/n/${encodeURIComponent(btn.dataset.node)}`; }));
  rail.querySelectorAll("[data-drill]").forEach((btn) =>
    btn.addEventListener("click", () => { location.hash = `#/drill/${encodeURIComponent(btn.dataset.drill)}`; }));
  rail.querySelectorAll("[data-go]").forEach((btn) =>
    btn.addEventListener("click", () => { location.hash = btn.dataset.go; }));
}

/** Строка задачника под нодой.

    В роадмапе такой ноды нет и заводить её нельзя: коды нод это ключ, к которому
    привязаны прогресс, банк и пороги босса, а количество нод в этапе считает
    босс. Поэтому задачник живёт как второй шаг той же ноды и рисуется рядом
    с ней — виден как отдельная строка, а ядру про него знать незачем. */
/** Подпись про босса в строке этапа. Побеждённый босс должен выглядеть
    побеждённым: раньше тут вечно висело «босс ждёт», потому что флаг считался
    только по числу закрытых нод и про сам бой ничего не знал. */
function bossNote(s) {
  if (s.boss_passed) return ` · босс побеждён${s.boss_rank ? `, ранг ${escapeHtml(s.boss_rank)}` : ""}`;
  return s.boss_ready ? " · босс ждёт" : "";
}

/** Сколько заданий конспекта решено. Их прогресс живёт в браузере, а не в БД:
    ядро про мини-задачи не знает и знать не обязано. Ключи заводит article.js. */
function noteTasksDone(code) {
  const prefixes = [`arena.site.mini.${code}.`, `arena.site.reorder.${code}.`,
                    `arena.site.term.${code}.`, `arena.site.sql.${code}.`];
  let done = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!prefixes.some((p) => key.startsWith(p))) continue;
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      // У терминала done это набор выполненных команд, у остальных флаг.
      if (Array.isArray(saved.done) ? saved.done.length : saved.done) done += 1;
    }
  } catch { /* приватный режим или битый ключ — считаем, что не решено */ }
  return done;
}

function drillRow(n, currentCode) {
  // Считаем и банк из БД, и задания в самом конспекте: после перехода на новый
  // формат лекций основная часть заданий живёт фенсами в тексте, и по одному
  // только банку нода с двадцатью задачами выглядела бы пустой. Старое поле
  // оставлено запасным на случай ответа сервера без drill.
  const has = n.drill ?? n.bank;
  if (n.status === "locked" || !has) return "";
  const here = String(location.hash).startsWith(`#/drill/${n.code}`);
  // Галочку ставим по задачнику, а не по статусу ноды. Нода закрывается по
  // квиз-банку, и на закрытой ноде с двадцатью нерешёнными задачами галочка
  // читалась как «тут всё сделано» — из-за неё в задачник и не заходили.
  // На незакрытой ноде не пишем ничего: рельс с числом у каждой из семидесяти
  // строк перестаёт читаться, а «не сделано» и так видно по отсутствию галочки.
  const left = Math.max(0, (n.note_tasks ?? 0) - noteTasksDone(n.code));
  const closed = n.status === "closed";
  const mark = closed
    ? (left ? `<span class="tick left">${left}</span>` : '<span class="tick">✓</span>')
    : "";
  return `<button class="railitem drillitem ${here ? "on" : ""}" data-drill="${escapeHtml(n.code)}"
    ${closed && left ? `title="нода сдана по вопросам, но заданий не решено: ${left}"` : ""}>
    <span class="num">↳</span>
    <span class="nm">задачник</span>
    ${mark}
  </button>`;
}

function currentStageOf(data, code) {
  if (!code) return null;
  const num = stageNumOfCode(code);
  return num !== null && data.stages.some((s) => s.num === num) ? num : null;
}

/* ---------------------------------------------------------------- экран карты */

export async function mapView(host, ctx) {
  host.innerHTML = '<div class="mapwrap"><div class="skel" style="height:300px"></div></div>';
  const list = await tracks();
  const data = await mapData();
  ctx.setCrumb("карта", `${data.trackTitle || "Java"} · ${data.stages.length} этапов`);

  const picker = list.length > 1 ? `<div class="trackpick">${list.map((t) => `
    <button data-track="${escapeHtml(t.key)}" aria-current="${t.key === current}">
      ${escapeHtml(t.title)}
      <span class="tp-sub">${escapeHtml(t.subtitle)} · ${t.closed} из ${t.nodes}</span>
    </button>`).join("")}</div>` : "";

  const rows = data.stages.map((s) => {
    const pct = s.total ? Math.round((s.closed / s.total) * 100) : 0;
    return `<button class="stagerow ${s.locked ? "locked" : ""} ${s.current ? "current" : ""}
      ${s.done ? "done" : ""}" data-stage="${s.num}" ${s.locked ? "disabled" : ""}>
      <span class="no">${s.shown ?? s.num}</span>
      <span class="nm"><b>${escapeHtml(s.title)}</b>
        <span>${s.closed} из ${s.total} нод${s.in_track ? " · собесный минимум" : ""}${bossNote(s)}</span></span>
      <span class="bar"><i style="width:${pct}%"></i></span>
    </button>`;
  }).join("");

  const sub = data.inTrack
    ? `Пройдено ${data.track.closed} из ${data.track.total} нод собесного минимума.
       ${data.eta?.text ? escapeHtml(data.eta.text) : ""}`
    : `Пройдено ${data.track.closed} из ${data.track.total} нод. Раздел идётся свободно:
       порядок этапов подсказано, но ничего не заперто.`;

  host.innerHTML = `<div class="mapwrap">
    <h1>Карта</h1>
    ${picker}
    <p class="sub">${sub}</p>
    ${rows}
  </div>`;
  host.querySelectorAll("[data-stage]").forEach((btn) =>
    btn.addEventListener("click", () => stageView(host, Number(btn.dataset.stage), ctx)));
  host.querySelectorAll("[data-track]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await setTrack(btn.dataset.track);
      document.querySelector(".rail")?.setAttribute("data-stage", "");
      mapView(host, ctx);
      ctx.reload?.();
    }));
}

/* --------------------------------------------- выделение нод: «эти я знаю» */

// Отметить можно только то, что реально закрывается: запертую ноду ядро не
// пустит, закрытую закрывать нечего. Список статусов один и тот же на экране
// и на сервере, чтобы галочка не обещала того, чего не будет.
const CAN_PICK = new Set(["available", "in_progress"]);

export async function stageView(host, num, ctx) {
  const stage = await stageData(num);
  ctx.setCrumb(`этап ${stage.shown ?? num}`, stage.title);

  const pickable = stage.nodes.filter((n) => CAN_PICK.has(n.status)).map((n) => n.code);
  const chosen = new Set();
  let picking = false;
  let armed = 0;

  const nodes = stage.nodes.map((n) => `
    <button class="stagerow ${n.status === "locked" ? "locked" : ""}
      ${n.status === "closed" ? "done" : ""} ${n.status === "in_progress" ? "current" : ""}"
      data-node="${escapeHtml(n.code)}" ${CAN_PICK.has(n.status) ? "data-pickable" : ""}
      ${n.status === "locked" ? "disabled" : ""}>
      <span class="tick" aria-hidden="true"></span>
      <span class="no" style="font-size:12.5px">${escapeHtml(n.code)}</span>
      <span class="nm"><b>${escapeHtml(n.title)}</b>
        <span><i style="display:inline-block;width:7px;height:7px;border-radius:50%;
          background:${KIND_DOT[n.kind] || "var(--muted)"};margin-right:6px"></i>${escapeHtml(n.kind)}
          ${n.bank ? ` · ${n.bank} в банке` : " · банк пуст"}${(n.drill ?? 0) > n.bank
            ? ` · ${n.drill - n.bank} в конспекте` : ""}${n.has_note ? " · конспект есть" : ""}</span></span>
      ${n.gen ? '<span class="chip">генерится</span>' : ""}
    </button>`).join("");

  // Босс живёт на отдельной странице (/boss, старый экран экзамена). Из карты
  // на него не было ни одной ссылки: видно «открывается на 27», а как прийти —
  // непонятно. Ссылка нужна ровно тогда, когда бой доступен.
  const boss = stage.boss.passed
    ? `<div class="bossbar done">Босс этапа побеждён.
         <a class="btn ghost" href="/boss">реванш</a></div>`
    : stage.boss.ready
      ? `<div class="bossbar">Босс этапа открыт: закрыто ${stage.boss.closed} нод,
           нужно было ${stage.boss.need}.
           <a class="btn primary" href="/boss">выйти на босса</a></div>`
      : "";

  host.innerHTML = `<div class="mapwrap">
    <div class="stagehead">
      <button class="btn ghost" data-back type="button">← все этапы</button>
      ${pickable.length
        ? '<button class="btn ghost" data-pick-mode type="button">выделить</button>' : ""}
    </div>
    <h1 style="margin-top:14px">${num}. ${escapeHtml(stage.title)}</h1>
    <p class="sub">${stage.boss.closed} из ${stage.nodes.length} нод закрыто.
      Босс открывается на ${stage.boss.need}.</p>
    ${boss}
    ${nodes}
    ${pickable.length ? `<div class="pickbar" data-pickbar hidden>
      <span class="grow"><b data-pick-n>ни одной</b>
        <span class="lbl">закроются без XP</span></span>
      <button class="btn ghost" data-pick-all type="button">все</button>
      <button class="btn ghost" data-pick-none type="button" hidden>снять</button>
      <button class="btn ghost" data-pick-off type="button">отмена</button>
      <button class="btn primary" data-pick-go type="button" disabled>знаю, закрыть</button>
    </div>` : ""}
  </div>`;

  const wrap = host.querySelector(".mapwrap");
  const bar = wrap.querySelector("[data-pickbar]");
  const counter = wrap.querySelector("[data-pick-n]");
  const go = wrap.querySelector("[data-pick-go]");
  const none = wrap.querySelector("[data-pick-none]");

  wrap.querySelector("[data-back]").addEventListener("click", () => mapView(host, ctx));

  function disarm() {
    if (armed) window.clearTimeout(armed);
    armed = 0;
    if (go) go.textContent = "знаю, закрыть";
    bar?.classList.remove("armed");
  }

  function repaint() {
    if (!bar) return;
    const n = chosen.size;
    counter.textContent = n
      ? `выбрано ${n} ${plural(n, "нода", "ноды", "нод")}` : "ни одной ноды не отмечено";
    go.disabled = !n;
    none.hidden = !n;
    disarm();
  }

  function setPicking(on) {
    picking = on;
    wrap.classList.toggle("picking", on);
    if (bar) bar.hidden = !on;
    const btn = wrap.querySelector("[data-pick-mode]");
    if (btn) btn.textContent = on ? "выйти из выделения" : "выделить";
    if (!on) { chosen.clear(); wrap.querySelectorAll(".picked").forEach((r) => r.classList.remove("picked")); }
    repaint();
  }

  wrap.querySelector("[data-pick-mode]")?.addEventListener("click", () => setPicking(!picking));
  wrap.querySelector("[data-pick-off]")?.addEventListener("click", () => setPicking(false));
  wrap.querySelector("[data-pick-all]")?.addEventListener("click", () => {
    pickable.forEach((code) => chosen.add(code));
    wrap.querySelectorAll("[data-pickable]").forEach((r) => r.classList.add("picked"));
    repaint();
  });
  none?.addEventListener("click", () => {
    chosen.clear();
    wrap.querySelectorAll(".picked").forEach((r) => r.classList.remove("picked"));
    repaint();
  });

  wrap.querySelectorAll("[data-node]").forEach((btn) => btn.addEventListener("click", () => {
    const code = btn.dataset.node;
    if (!picking) { location.hash = `#/n/${encodeURIComponent(code)}`; return; }
    // В режиме выделения клик по неотмечаемой ноде не должен молча ничего не
    // делать: человек жмёт и не понимает, сломалось или так задумано.
    if (!btn.hasAttribute("data-pickable")) {
      ctx.toast?.(btn.classList.contains("done")
        ? "эта нода уже закрыта" : "до этой ноды ещё не дошли, её не закрыть");
      return;
    }
    if (chosen.has(code)) chosen.delete(code); else chosen.add(code);
    btn.classList.toggle("picked", chosen.has(code));
    repaint();
  }));

  go?.addEventListener("click", async () => {
    if (!chosen.size) return;
    if (!armed) {
      // Второй клик, как и на самой ноде: закрыть десяток нод одним движением
      // мыши и заметить это постфактум — так себе сюрприз.
      bar.classList.add("armed");
      go.textContent = `точно? закроется ${chosen.size}`;
      armed = window.setTimeout(disarm, 5000);
      return;
    }
    disarm();
    go.disabled = true;
    // Пачка из трёх десятков нод закрывается заметные секунды: каждая ставит
    // галочку в хабе волта. Без числа на кнопке это выглядит как зависший экран.
    go.textContent = `закрываю ${chosen.size}…`;
    try {
      const res = await api.knowNodes([...chosen]);
      const ok = (res.results || []).filter((r) => r.ok);
      const bad = (res.results || []).filter((r) => !r.ok);
      const marked = ok.reduce((sum, r) => sum + (r.marked || 0), 0);
      const tasks = ok.reduce((sum, r) => sum + (r.tasks_left || 0), 0);
      const parts = [`закрыто ${ok.length} ${plural(ok.length, "нода", "ноды", "нод")} без XP`];
      if (marked) parts.push(`${marked} ${plural(marked, "вопрос", "вопроса", "вопросов")} отмечено`);
      if (tasks) parts.push(`${tasks} ${plural(tasks, "код-задача", "код-задачи", "код-задач")} осталась несданной`);
      if (bad.length) parts.push(`не вышло: ${bad.map((r) => r.code).join(", ")}`);
      ctx.toast?.(parts.join(", "));
      invalidate();
      ctx.refreshStats?.();
      ctx.refreshRail?.();
      await stageView(host, num, ctx);
    } catch (err) {
      ctx.toast?.(err.message);
      go.disabled = false;
      go.textContent = "знаю, закрыть";
    }
  });
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
}
