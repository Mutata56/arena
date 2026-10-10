/* Оболочка сайта: шапка, роутер, панели. Логики обучения тут нет — только сборка. */

import api from "./api.js";
import * as settings from "./settings.js";
import * as article from "./article.js";
import * as drill from "./drill.js";
import * as ide from "./ide.js";
import * as mapui from "./map.js";
import * as notes from "./notes.js";
import { reviewView } from "./review.js";
import { escapeHtml, parseNote, renderBlocks } from "./md.js";

const el = {
  crumbStage: document.getElementById("crumb-stage"),
  crumbNode: document.getElementById("crumb-node"),
  view: document.getElementById("view"),
  rail: document.getElementById("rail"),
  aside: document.getElementById("aside"),
  toast: document.getElementById("toast"),
  xpToday: document.getElementById("xp-today"),
  xpTotal: document.getElementById("xp-total"),
  streak: document.getElementById("streak"),
  contract: document.getElementById("contract"),
  gen: document.getElementById("genline"),
  scrim: document.getElementById("scrim"),
  sheet: document.getElementById("sheet"),
  sheetTitle: document.getElementById("sheet-title"),
  sheetBody: document.getElementById("sheet-body"),
};

let glossary = null;
let marks = null;
let toastTimer = null;

/* ---------------------------------------------------------------- мелочи */

function toast(text) {
  el.toast.textContent = text;
  el.toast.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("on"), 2400);
}

function setCrumb(stage, node) {
  el.crumbStage.textContent = stage || "";
  el.crumbNode.textContent = node || "";
}

function setChrome(on) {
  document.body.classList.toggle("bare", !on);
}

async function refreshStats() {
  try {
    const day = await api.today();
    el.xpToday.textContent = day.xp.today;
    el.xpTotal.textContent = day.xp.total;
    el.streak.textContent = day.streak;
    el.streak.parentElement.hidden = day.streak < 2;
    paintContract(day.contract);
    return day;
  } catch { return null; }
}

/** Контракт дня в шапке: сколько вопросов и карточек осталось до нормы. */
function paintContract(c) {
  if (!c || !el.contract) return;
  const done = c.done || c.closed;
  el.contract.classList.toggle("ok", Boolean(done));
  el.contract.innerHTML = done
    ? "контракт <b>закрыт</b>"
    : `контракт <b>${c.quiz_done}/${c.quiz_target}</b> вопросов`
      + (c.cards_target ? ` · <b>${c.cards_done}/${c.cards_target}</b> карточек` : "");
}

async function refreshGen() {
  try {
    const gen = await api.genNow();
    if (gen.running) {
      el.gen.hidden = false;
      el.gen.textContent = `генерю: ${gen.running.title}${gen.running.node ? ` · ${gen.running.node}` : ""}`;
    } else if (gen.waiting) {
      el.gen.hidden = false;
      el.gen.textContent = `в очереди генерации: ${gen.waiting}`;
    } else {
      el.gen.hidden = true;
    }
  } catch { el.gen.hidden = true; }
}

/* ---------------------------------------------------------------- панели */

function openSheet(title, html, bind) {
  el.sheetTitle.textContent = title;
  el.sheetBody.innerHTML = html;
  // Сначала показать, потом на следующем кадре включить класс: иначе анимация
  // выезда стартует с display:none и не проигрывается.
  el.scrim.hidden = false;
  el.sheet.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    el.scrim.classList.add("on");
    el.sheet.classList.add("on");
  });
  bind?.(el.sheetBody);
}

function closeSheet() {
  el.sheet.classList.remove("on");
  el.scrim.classList.remove("on");
  el.sheet.setAttribute("aria-hidden", "true");
  setTimeout(() => { el.scrim.hidden = true; }, 240);
}

el.scrim.addEventListener("click", closeSheet);
document.getElementById("sheet-close").addEventListener("click", closeSheet);

document.getElementById("btn-settings").addEventListener("click", () =>
  openSheet("Настройки чтения", settings.settingsBody(), (root) => settings.bindSettings(root)));

document.getElementById("btn-notes").addEventListener("click", () => {
  const list = marks?.list() || [];
  openSheet("Заметки", notes.notesBody(list), (root) => {
    root.querySelectorAll("[data-rm]").forEach((btn) =>
      btn.addEventListener("click", () => {
        marks?.remove(btn.dataset.rm);
        root.innerHTML = notes.notesBody(marks?.list() || []);
      }));
  });
});

document.getElementById("btn-gloss").addEventListener("click", () => {
  if (glossary?.openGlossaryPanel) {
    glossary.openGlossaryPanel({ onOpenNode: (code) => { location.hash = `#/n/${code}`; } });
  } else {
    toast("глоссарий появится на странице статьи");
  }
});

document.getElementById("btn-rail").addEventListener("click", () =>
  el.rail.classList.toggle("on"));

/* ---------------------------------------------------------------- роутер */

const ctx = {
  toast, setCrumb, setChrome, refreshStats,
  aside: el.aside,
  refreshRail: () => { mapui.invalidate(); renderRail(); },
  reload: () => route(true),
  setGlossary: (mod) => { glossary = mod; },
  setNotes: (m) => { marks = m; },
  refreshNotes: () => {},
};

let currentCode = null;

async function renderRail() {
  try { await mapui.renderRail(el.rail, currentCode); } catch { /* карта подождёт */ }
}

async function route(force) {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query || "");

  article.teardown();
  drill.teardown();
  ide.teardown();
  setChrome(true);
  el.aside.innerHTML = "";

  if (!parts.length) {
    const day = await refreshStats();
    const code = day?.node?.code;
    location.replace(`#/n/${encodeURIComponent(code || "1.01")}`);
    return;
  }

  const [screen, arg] = parts;

  if (screen === "n") {
    currentCode = arg;
    await article.articleView(el.view, arg, ctx);
    renderRail();
    return;
  }
  if (screen === "drill") {
    currentCode = arg;
    await drill.drillView(el.view, arg, ctx);
    renderRail();
    return;
  }
  if (screen === "task") {
    await ide.taskView(el.view, Number(arg), ctx, params.get("from"));
    return;
  }
  if (screen === "map") {
    await mapui.mapView(el.view, ctx);
    renderRail();
    return;
  }
  if (screen === "review") {
    await reviewView(el.view, ctx);
    renderRail();
    return;
  }
  if (screen === "wiki") {
    await wikiView(arg);
    renderRail();
    return;
  }
  location.replace("#/");
}

/* ---------------------------------------------------------------- заметка волта */

async function wikiView(name) {
  el.view.innerHTML = '<div class="article"><div class="skel" style="height:300px;margin-top:44px"></div></div>';
  let data;
  try { data = await api.wiki(name); } catch (err) { data = { exists: false, error: err.message }; }
  if (data.code) { location.replace(`#/n/${encodeURIComponent(data.code)}`); return; }
  if (!data.exists) {
    setCrumb("волт", name);
    el.view.innerHTML = `<div class="empty"><h2>такой заметки ещё нет</h2>
      <p>«${escapeHtml(name)}» — ссылка на конспект, который пока не написан.</p>
      <a class="btn" href="#/map">к карте</a></div>`;
    return;
  }
  const parsed = parseNote(data.markdown);
  setCrumb("конспект", parsed.title || name);
  el.view.innerHTML = `<div class="article">
    <div class="artmeta"><span class="chip">конспект волта</span></div>
    <h1>${escapeHtml(parsed.title || name)}</h1><hr class="artrule">
    <div class="prose" id="prose">${renderBlocks(parsed.blocks)}</div></div>`;
  const prose = el.view.querySelector("#prose");
  prose.addEventListener("click", (e) => {
    const head = e.target.closest(".callout.fold > .co-head");
    if (head) head.parentElement.classList.toggle("open");
    const flip = e.target.closest(".flip");
    if (flip) flip.classList.toggle("on");
  });
  window.scrollTo({ top: 0 });
}

/* ---------------------------------------------------------------- клавиатура */

document.addEventListener("keydown", (e) => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Escape") { closeSheet(); el.rail.classList.remove("on"); return; }

  // Цифрами отвечаем на тот вопрос, который сейчас на экране.
  const n = Number(e.key);
  if (n >= 1 && n <= 4) {
    const box = [...document.querySelectorAll(".check:not(.done)")].find((c) => {
      const rect = c.getBoundingClientRect();
      return rect.top < window.innerHeight * 0.9 && rect.bottom > 0;
    });
    const opt = box?.querySelectorAll(".opt")[n - 1];
    if (opt) { e.preventDefault(); opt.click(); }
  }
});

/* ---------------------------------------------------------------- старт */

settings.apply();
// Тема и размер применяются переменными, страницу перерисовывать не за чем.
// А вот глоссарий, схемы и гейт меняют саму сборку статьи.
let lastCfg = settings.get();
settings.onChange((cfg) => {
  const rebuild = ["glossary", "diagrams", "gate"].some((key) => cfg[key] !== lastCfg[key]);
  lastCfg = cfg;
  if (rebuild && location.hash.startsWith("#/n/")) route(true);
});
window.addEventListener("hashchange", () => route());
route();
refreshStats();
refreshGen();
setInterval(refreshGen, 20000);
