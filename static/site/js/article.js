/* Страница статьи. Это главный экран сайта: сюда попадает человек, открывший
   сайт, и отсюда он никуда не уходит, пока не прочитает.

   Порядок сборки: конспект из волта -> блоки -> между секциями встают схемы и
   вопросы -> в конце задачи. Вопросы и задачи это тот же банк, что и в ядре,
   XP пишется теми же ручками. Меняется только то, где человек их встречает. */

import api from "./api.js";
import { parseNote, renderBlocks, sectionsOf, escapeHtml, plain } from "./md.js";
import { placeQuizzes, renderCheck, bindChecks } from "./quizzes.js";
import * as settings from "./settings.js";
import * as notes from "./notes.js";

const READ_KEY = (code) => `arena.site.read.${code}`;

/* Блоки-задания: мини-задача, перестановка, терминал. В статье их больше нет —
   они уехали в задачник. Причина простая: пока они стояли по ходу текста, чтение
   каждые два абзаца превращалось в работу, а место для них приходилось угадывать
   алгоритмом, и он регулярно угадывал мимо. */
export const DRILL_BLOCKS = new Set(["minitask", "reorder", "terminal", "sqltask", "sqlscenario"]);

let live = null;   // то, что нужно снять при уходе со страницы

export const ICON = {
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 4.5v15l12-7.5z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 8-5 4 5 4M15 8l5 4-5 4"/></svg>',
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 12.5 5 5L20 6.5"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M19 12H6M11 6l-6 6 6 6"/></svg>',
};

const TYPE_HINT = {
  "тема": "разбор",
  "практика": "практика",
  "рукописная": "от руки",
  "тест": "контрольная",
  "проект": "проект",
  "повторение": "повторение",
  "чтение JDK": "чтение JDK",
};

/* ---------------------------------------------------------------- вспомогательное */

function readSet(code) {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY(code)) || "[]")); }
  catch { return new Set(); }
}
function saveRead(code, set) {
  try { localStorage.setItem(READ_KEY(code), JSON.stringify([...set])); } catch { /**/ }
}

function classOf(source) {
  const pub = /public\s+(?:final\s+|abstract\s+)*(?:class|record|enum)\s+(\w+)/.exec(source);
  if (pub) return pub[1];
  const any = /(?:class|record|enum)\s+(\w+)/.exec(source);
  return any ? any[1] : "Main";
}

function stars(n) { return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n)); }

/* ---------------------------------------------------------------- экран */

export async function articleView(host, code, ctx) {
  teardown();
  host.innerHTML = `<div class="article"><div class="skel" style="height:26px;width:180px;margin:44px 0 14px"></div>
    <div class="skel" style="height:44px;margin-bottom:12px"></div>
    <div class="skel" style="height:340px"></div></div>`;

  let note, items;
  try {
    [note, items] = await Promise.all([api.note(code), api.nodeItems(code)]);
  } catch (err) {
    host.innerHTML = `<div class="empty"><h2>не открылось</h2><p>${escapeHtml(err.message)}</p>
      <a class="btn" href="#/map">к карте</a></div>`;
    return;
  }

  const node = note.node || {};
  ctx.setCrumb(`этап ${node.stage_shown ?? node.stage_num ?? "?"} · ${node.stage_title || ""}`, `${code} ${node.title || ""}`);

  const parsed = note.exists ? parseNote(note.markdown) : null;
  const sections = parsed ? parsed.sections : [];
  const cfg = settings.get();

  // Схемы. Модуль необязателен: если его нет, статья просто без картинок.
  let diagrams = null;
  if (cfg.diagrams) {
    try { diagrams = (await import("./diagrams.js")).diagramsFor(code) || []; }
    catch { diagrams = []; }
  }

  // Потолок ровно такой же, какой ядро требует на квиз-блок ноды: ответил на
  // всё, что встретил по тексту — блок ноды закрыт, нода закрывается сама.
  // Расставляем вопросы по тем секциям, которые человек реально увидит:
  // вырезанные при отрисовке в словарь прочитанного попадать не должны.
  const shown = sections.filter((s) => keepSection(s, node));
  const max = node.kind === "тест" ? 15 : 10;
  // У ноды-теста весь конспект это вопросы с ответами в спойлере, и после чистки
  // от него ничего не остаётся. Тогда страница и есть тест: одни проверяемые блоки.
  const testMode = !shown.some((s) => s.heading) && (items.quiz || []).length > 0;
  // Вопросы в статью больше не встраиваются: они собраны в задачнике сразу за ней.
  // Нода-тест это исключение — там весь смысл ноды в вопросах, и текста нет вовсе.
  const plan = testMode
    ? new Map([[0, (items.quiz || []).filter((q) => !q.suspended).slice(0, max)]])
    : new Map();
  const totalChecks = [...plan.values()].reduce((sum, list) => sum + list.length, 0);
  // Сколько всего проверок ждёт в задачнике: вопросы плюс задания из конспекта
  // плюс код-задачи. Число нужно на кнопке внизу статьи.
  const drillBlocks = sections.reduce(
    (sum, s) => sum + (s.blocks || []).filter((b) => DRILL_BLOCKS.has(b.t)).length, 0);
  const drillCount = (testMode ? 0 : Math.min(max, (items.quiz || []).filter((q) => !q.suspended).length))
    + drillBlocks + (items.tasks || []).length;

  host.innerHTML = `<div class="article">
    ${headerHtml(code, node, parsed, note)}
    <div class="prose" id="prose">${testMode ? testHtml(plan, totalChecks) : bodyHtml(parsed, shown, plan, diagrams, totalChecks, note, node)}</div>
    ${emptyBankHtml(parsed, items, totalChecks, node)}
    ${relatedHtml(parsed)}
    ${testMode ? "" : drillHtml(code, node, drillCount)}
    ${knowHtml(node)}
    ${closeHtml(node)}
    ${nextHtml(node, parsed)}
  </div>`;

  // ВАЖНО: слушатели вешаются на .article, а не на host. host живёт всю сессию,
  // и обработчик, повешенный на него, переживает переход на другую ноду. Через
  // шесть открытых статей один клик по ответу писал шесть попыток и платил XP
  // шесть раз. .article создаётся заново на каждый рендер и уносит слушателей с собой.
  const art = host.querySelector(".article");
  const prose = art.querySelector("#prose");
  [...prose.children].forEach((el, i) => { el.dataset.b = String(i); });

  const counted = new Set([...art.querySelectorAll(".check.done")].map((c) => Number(c.dataset.item)));

  buildToc(ctx.aside, art, code, shown, node);
  paintCode(prose, node.lang);
  // Мини-задачи привязываются асинхронно (ждут редактор), и решённые получают
  // свой класс уже после первого пересчёта. Поэтому считаем ещё раз, когда
  // привязка закончилась, иначе счётчик держал бы старое число до первого клика.
  bindProse(prose, ctx);
  bindChecks(art, {
    toast: ctx.toast,
    onAnswered: () => { ctx.refreshStats?.(); },
  });
  bindClose(art, node, ctx);
  bindKnow(art, node, ctx);
  bindNext(art, node, ctx);
  refreshNext(art, node);

  // Глоссарий и заметки — независимые надстройки над готовым текстом.
  if (cfg.glossary) {
    try {
      const gl = await import("./glossary.js");
      const off = gl.attachGlossary(prose, {
        enabled: true,
        onOpenNode: (target) => { location.hash = `#/n/${target}`; },
      });
      live = { ...(live || {}), gloss: off, glossary: gl };
      ctx.setGlossary?.(gl);
    } catch { /* модуля нет — не беда */ }
  }
  const marks = notes.mount(prose, code, { toast: ctx.toast, onChange: () => ctx.refreshNotes?.() });
  live = { ...(live || {}), marks };
  ctx.setNotes?.(marks);

  window.scrollTo({ top: 0 });
}

export function teardown() {
  if (!live) return;
  live.gloss?.();
  live.marks?.destroy?.();
  live.spy?.();
  live = null;
}

/* ---------------------------------------------------------------- шапка статьи */

function headerHtml(code, node, parsed, note) {
  const type = parsed?.meta.type || node.kind || "";
  const diff = parsed?.meta.difficulty || 0;
  const status = {
    closed: '<span class="chip ok">пройдено</span>',
    in_progress: '<span class="chip accent">в работе</span>',
    available: '<span class="chip">открыта</span>',
    locked: '<span class="chip">закрыта</span>',
  }[node.status] || "";
  return `<div class="artmeta">
      <span class="chip">${escapeHtml(String(code))}</span>
      ${type ? `<span class="chip">${escapeHtml(TYPE_HINT[type] || type)}</span>` : ""}
      ${diff ? `<span class="chip"><span class="stars">${stars(diff)}</span></span>` : ""}
      ${status}
      ${node.status === "available"
        ? '<button class="btn primary" data-enter type="button">взять ноду</button>' : ""}
    </div>
    <h1>${escapeHtml(parsed?.title || node.title || code)}</h1>
    ${node.descr ? `<p class="artlead">${escapeHtml(node.descr)}</p>` : ""}
    ${note.exists ? "" : ""}
    <hr class="artrule">`;
}

/** Страница-тест: никакого текста, только проверяемые вопросы подряд. */
function testHtml(plan, total) {
  const list = plan.get(0) || [];
  let n = 0;
  return `<p class="artlead" style="margin-bottom:1.4em">Здесь только вопросы: ${total}
    ${plural(total, "штука", "штуки", "штук")}. Отвечаешь - сразу видно, верно или нет,
    и почему. Порог тот же, что и был: 80 процентов.</p>
    ${list.map((item) => renderCheck(item, ++n, total)).join("")}`;
}

/* ---------------------------------------------------------------- тело */

// Секции, которые на сайте не нужны: проверка теперь живая, а не «прочитал ответ».
// Конспекты в волте переписываются постепенно, поэтому чистим на отрисовке —
// иначе пришлось бы разом править полторы сотни файлов.
const DROP_SECTIONS = ["цель", "карточки", "критерий зачёта", "критерии приёмки", "тест",
                       "если провалил", "самопроверка", "правила"];
// Свёрнутые спойлеры с готовыми ответами: то же самое, только внутри секции.
const DROP_CALLOUTS = ["эталон", "ответы", "решени"];

// В нодах-тестах вопросы лежат текстом со свёрнутыми ответами. Это ровно то,
// что на сайте заменено проверяемыми блоками, поэтому их тоже не показываем.
const DROP_IN_TESTS = ["вопросы", "сводные задачи", "чек закрытия"];

export function keepSection(section, node) {
  const head = (section.heading || "").toLowerCase().trim();
  if (!head) return true;
  const drop = node.kind === "тест" || node.kind === "повторение"
    ? [...DROP_SECTIONS, ...DROP_IN_TESTS]
    : DROP_SECTIONS;
  return !drop.some((word) => head.startsWith(word));
}

export function stripSpoilers(blocks) {
  return blocks.filter((b) => {
    if (b.t !== "callout") return true;
    const title = (b.title || "").toLowerCase();
    return !DROP_CALLOUTS.some((word) => title.includes(word));
  }).map((b) => (b.blocks ? { ...b, blocks: stripSpoilers(b.blocks) } : b));
}

function bodyHtml(parsed, sections, plan, diagrams, totalChecks, note, node) {
  if (!parsed) {
    return `<div class="empty"><h2>конспекта ещё нет</h2>
      <p>Ночная генерация пишет конспект при входе в ноду. Возьми ноду — и он появится
      здесь, вместе с вопросами по тексту.</p>
      <button class="btn primary" data-kick type="button">поставить в очередь сейчас</button></div>`;
  }
  const byAnchor = new Map();
  const byId = new Map();
  (diagrams || []).forEach((d) => {
    const key = (d.anchor || "").toLowerCase();
    byAnchor.set(key, [...(byAnchor.get(key) || []), d]);
    byId.set(d.id, d);
  });
  // height="auto" в атрибуте SVG невалиден (auto понимает только CSS) и сыплет
  // ошибкой в консоль. Высоту всё равно задаёт .figure svg { height: auto }.
  const figHtml = (d) => `<figure class="figure" id="fig-${d.id}">
        <div class="fig-title">${escapeHtml(d.title)}</div>
        ${String(d.svg).replace(/\sheight="auto"/g, "")}
        ${d.caption ? `<figcaption>${escapeHtml(d.caption)}</figcaption>` : ""}
      </figure>`;
  // Схемы, которые автор поставил вручную через %%схема: id%%. Такие не дублируются
  // в конце секции: место выбрано осознанно.
  const placed = new Set();

  let counter = 0;
  return sections.map((section, i) => {
    if (!keepSection(section, node)) return "";
    const inner = [];
    if (section.heading) {
      inner.push(`<h2 id="${section.id}">${escapeHtml(section.heading)}</h2>`);
    }
    inner.push(renderBlocks(stripSpoilers(section.blocks).filter((b) => !DRILL_BLOCKS.has(b.t)))
      .replace(/<div data-diagram="([^"]+)"><\/div>/g, (_, id) => {
        const d = byId.get(id);
        if (!d) return "";
        placed.add(id);
        return figHtml(d);
      }));

    const figs = (byAnchor.get((section.heading || "").toLowerCase()) || [])
      .filter((d) => !placed.has(d.id));
    figs.forEach((d) => inner.push(figHtml(d)));

    (plan.get(i) || []).forEach((item) => {
      counter += 1;
      inner.push(renderCheck(item, counter, totalChecks));
    });
    return inner.join("");
  }).join("");
}

/* ---------------------------------------------------------------- пустой банк */

function emptyBankHtml(parsed, items, totalChecks, node) {
  if (!parsed || totalChecks || node.status === "closed") return "";
  if ((items.quiz || []).length) return "";
  return `<div class="gate" style="margin-top:2.6em">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9.2"/><path d="M12 7.5v5M12 16v.4"/></svg>
    <div>Вопросов по этой ноде в банке пока нет — конвейер до неё не дошёл.
      <button class="btn ghost" data-kick type="button" style="margin-left:8px">сгенерировать</button></div>
  </div>`;
}

/* ---------------------------------------------------------------- связи */

function relatedHtml(parsed) {
  const links = parsed?.related || [];
  if (!links.length) return "";
  const items = links.map((name) => {
    const head = name.split(" ")[0];
    const isNode = /^\d+\.\d+$/.test(head);
    const href = isNode ? `#/n/${encodeURIComponent(head)}` : `#/wiki/${encodeURIComponent(name)}`;
    const label = isNode ? name.replace(/^\S+\s/, "") : name;
    return `<a class="chip" href="${href}">${isNode ? `<b style="color:var(--accent);font-family:var(--font-mono);font-weight:500">${escapeHtml(head)}</b>` : ""}${escapeHtml(label)}</a>`;
  }).join("");
  return `<div class="tasksblock" style="margin-top:2.6em">
    <h2 style="font-size:calc(var(--text-size) * 1.1)">Рядом по теме</h2>
    <div class="artmeta" style="margin-top:10px">${items}</div>
  </div>`;
}

/* ---------------------------------------------------------------- задачи */

export function tasksHtml(tasks, totalChecks, node) {
  if (!tasks.length) return "";
  const cards = tasks.map((t) => `
    <button class="taskcard${t.passed ? " passed" : ""}" type="button" data-task="${t.item_id}">
      <span class="ic">${t.passed ? ICON.done : ICON.code}</span>
      <span class="nm"><b>${escapeHtml(t.title)}</b>
        <span>${t.passed ? "решена" : (t.checks ? `попыток: ${t.checks}` : "не начата")}</span></span>
      <span class="rt">${t.passed ? "решить заново" : `${stars(t.difficulty)}<br>${t.xp} XP`}</span>
    </button>`).join("");
  return `<div class="tasksblock" id="tasks">
    <h2>Задачи</h2>
    <p class="sub">Решаются здесь же: слева файлы, справа код, кнопка «проверить» гоняет тесты.</p>
    <div data-gate></div>
    <div data-tasklist>${cards}</div>
  </div>`;
}

/** Неотвеченные вопросы страницы, в порядке появления в тексте. */
function pending(host) {
  return [...host.querySelectorAll(".check")].filter((c) => !c.classList.contains("done"));
}

/** Кнопки-номера: по одной на каждый неотвеченный вопрос.
    Число на кнопке то же, что человек видит в шапке вопроса («3 из 10»),
    иначе пришлось бы сверять два разных счёта. */
function qnavHtml(list) {
  if (!list.length) return "";
  const chips = list.map((box) => {
    const n = (box.querySelector(".ck-n")?.textContent || "").split(" ")[0] || "?";
    return `<button class="qchip" type="button" data-goto="${box.id}">${escapeHtml(n)}</button>`;
  }).join("");
  return `<div class="qnav"><span>перейти к вопросу:</span>${chips}</div>`;
}

/** Подсветить в оглавлении разделы, где остались неотвеченные вопросы. */
function markToc(host, aside) {
  if (!aside) return;
  const inSection = new Set();
  let current = null;
  [...(host.querySelector("#prose")?.children || [])].forEach((el) => {
    if (el.tagName === "H2") current = el.id;
    else if (el.classList?.contains("check") && !el.classList.contains("done") && current) {
      inSection.add(current);
    }
  });
  aside.querySelectorAll("[data-sec]").forEach((a) => {
    a.classList.toggle("has-q", inSection.has(a.dataset.sec));
  });
}

export function refreshGate(host, totalChecks, node, ctx) {
  const left = pending(host);
  markToc(host, ctx?.aside);
  const gate = host.querySelector("[data-gate]");
  if (!gate) return;
  const cfg = settings.get();
  const locked = cfg.gate && left.length > 0 && node.status !== "closed";
  host.querySelectorAll("[data-task]").forEach((btn) => { btn.disabled = locked; btn.style.opacity = locked ? ".45" : ""; });
  // Пока замок на задачах показывает своё число вопросов, блок «чтобы нода
  // закрылась» молчит: два счётчика рядом считают разное (этот — что осталось
  // на странице, тот — что засчитывает ядро) и читаются как противоречие.
  const ready = host.querySelector("[data-readyhost]");
  if (ready) ready.hidden = locked;
  gate.innerHTML = locked
    ? `<div class="gate">${ICON.lock}<div>Сначала текст. Осталось ответить на
        <b>${left.length}</b> ${plural(left.length, "вопрос", "вопроса", "вопросов")} по ходу
        статьи — после этого задачи откроются.${qnavHtml(left)}</div></div>`
    : "";
}

/** «уже умею»: пометить задание сделанным, не прогоняя его.

    Кнопка нужна там, где человек пришёл с готовым знанием. Заставлять его
    набирать println, чтобы страница разрешила листать дальше, это турникет,
    а не обучение. На закрытие ноды задания конспекта и так не влияют — считает
    его ядро по банку вопросов, — поэтому цена такой отметки только одна:
    задание перестаёт числиться в «осталось N».

    Возвращает setter: снять отметку надо всюду, где человек всё-таки взялся
    решать сам — на сбросе и на честном прогоне. */
function knowMark(box, { save, onSolved, note } = {}) {
  const chip = box.querySelector("[data-mt-chip]");
  const paint = () => {
    if (chip) {
      chip.textContent = box.classList.contains("known") ? "уже умею" : chip.dataset.mtDone;
    }
  };
  const set = (on, { fold = false } = {}) => {
    box.classList.toggle("known", on);
    if (on) {
      box.classList.add("solved");
      box.classList.remove("failed");
      if (fold) box.classList.add("folded");
      if (note) note.textContent = "уже умею";
    }
    paint();
  };
  box.querySelector("[data-mt-know]")?.addEventListener("click", () => {
    set(true, { fold: true });
    save?.();
    onSolved?.();
  });
  paint();
  return set;
}


/** Развернуть свёрнутую решённую задачу. Прогресс не сбрасываем: решённой она
    и остаётся, просто снова видно редактор и кнопки. */
export function bindUnfold(root) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mt-open]");
    if (btn) btn.closest(".minitask")?.classList.remove("folded");
  });
}

/** Прыжок к вопросу: доскроллить и мигнуть рамкой, чтобы глаз его нашёл. */
export function bindQnav(host, ctx) {
  const jump = (box) => {
    // Не scrollIntoView({block:"center"}): блок вопроса выше экрана, и центровка
    // уводит его шапку с вариантами наверх, за пределы окна. Целимся под шапку сайта.
    const top = window.scrollY + box.getBoundingClientRect().top - 84;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    box.classList.remove("flash");
    void box.offsetWidth;
    box.classList.add("flash");
    setTimeout(() => box.classList.remove("flash"), 1600);
  };
  host.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-goto]");
    if (chip) { jump(host.querySelector(`#${CSS.escape(chip.dataset.goto)}`)); return; }
    const first = e.target.closest("[data-goto-first]");
    if (first) {
      const list = pending(host);
      if (list.length) jump(list[0]);
      else ctx.toast?.("на этой странице всё отвечено");
    }
  });
}

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function bindTasks(host, node, ctx) {
  host.querySelectorAll("[data-task]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      location.hash = `#/task/${btn.dataset.task}?from=${encodeURIComponent(node.code || "")}`;
    });
  });
}

/* ---------------------------------------------------------------- закрытие ноды */

function closeHtml(node) {
  const mode = node.close?.mode;
  if (node.status === "closed" || !mode || mode === "atoms") return "";
  return `<div class="tasksblock" id="selfmark">
    <h2>Закрыть ноду</h2>
    <p class="sub">${escapeHtml(node.close.hint || "Своими словами: что понял.")}</p>
    <textarea data-note rows="4" style="width:100%;padding:12px 14px;border:1px solid var(--line);
      border-radius:12px;background:var(--card);color:var(--ink);font:inherit;resize:vertical"
      placeholder="минимум ${node.close.note_min || 60} символов"></textarea>
    <div class="ck-row"><button class="btn primary" data-close type="button">закрыть, +100 XP</button>
      <span class="chip" data-count>0</span></div>
  </div>`;
}

function bindClose(host, node, ctx) {
  const area = host.querySelector("[data-note]");
  if (!area) return;
  const count = host.querySelector("[data-count]");
  const min = node.close?.note_min || 60;
  area.addEventListener("input", () => {
    count.textContent = `${area.value.trim().length} из ${min}`;
  });
  host.querySelector("[data-close]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await api.closeNode(node.code, area.value.trim());
      ctx.toast(`нода закрыта, +${res.xp} XP`);
      ctx.refreshStats?.();
      ctx.refreshRail?.();
      location.hash = res.unlocked_node ? `#/n/${res.unlocked_node}` : "#/map";
    } catch (err) {
      ctx.toast(err.message);
      btn.disabled = false;
    }
  });
}

/* ------------------------------------------------------- чего не хватает для галочки */

/** Почему на карте у ноды точка, а не галочка.

    Считает это ядро (`progress.evaluate`), здесь только пересказ: человек, который
    ответил на всё, что видел, имеет право знать, что банк с тех пор пополнился. */
export function readyHtml(node) {
  const r = node.ready;
  if (!r || node.status === "closed" || r.ready || r.self_mark) return "";
  const left = [];
  const q = r.quiz;
  if (q && !q.ok) {
    const need = Math.max(0, q.need - q.answered);
    if (need) left.push(`ответить ещё на <b>${need}</b> ${plural(need, "вопрос", "вопроса", "вопросов")}`);
    else left.push(`поднять долю верных: ${q.correct} из ${q.answered}`);
  }
  const codeLeft = (r.code_total || 0) - (r.code_green || 0);
  if (codeLeft > 0) left.push(`сдать <b>${codeLeft}</b> ${plural(codeLeft, "код-задачу", "код-задачи", "код-задач")}`);
  if (!left.length) return "";
  const jump = q && !q.ok && q.answered < q.need
    ? '<button class="btn ghost" data-goto-first type="button">показать неотвеченный</button>' : "";
  return `<div class="readybar">
    <div class="lbl">чтобы нода закрылась</div>
    <div>Осталось ${left.join(" и ")} - и галочка на карте появится сама.</div>
    ${jump}
  </div>`;
}

/** Пересчитать этот блок после ответа. Закрытие ноды считает ядро и присылает
    его в ответе, остальное досчитываем от чисел, с которыми страница пришла. */
export function refreshReady(host, node, ctx, res, itemId, counted) {
  const slot = host.querySelector("[data-readyhost]");
  if (!slot) return;
  if (res?.node_closed) {
    node.status = "closed";
    slot.innerHTML = `<div class="readybar"><div class="lbl">нода закрыта</div>
      <div>Всё зелёное: галочка на карте уже стоит.</div></div>`;
    ctx.toast?.("нода закрыта");
    ctx.refreshRail?.();
    refreshNext(host, node);
    return;
  }
  const q = node.ready?.quiz;
  if (!q || counted.has(itemId)) return;
  counted.add(itemId);
  q.answered = Math.min(q.need, q.answered + 1);
  if (res?.correct) q.correct = Math.min(q.answered, q.correct + 1);
  q.ok = q.answered >= q.need && q.correct / q.answered >= 0.8;
  slot.innerHTML = readyHtml(node);
}

/* ---------------------------------------------------------------- дальше */

function nextHtml(node, parsed) {
  const next = parsed?.meta.next;
  if (!next) return "";
  const code = next.split(" ")[0];
  // Кнопка, а не ссылка: пока задачи ноды не решены, переход не должен состояться,
  // а ссылку браузер увёл бы раньше, чем мы успели что-то сказать.
  return `<div class="nextbar" data-nextbar>
    <div class="grow"><div class="lbl">дальше</div><b>${escapeHtml(next.replace(/^\S+\s/, ""))}</b>
      <div class="lbl" data-next-why hidden></div></div>
    <button class="btn primary" data-next="${escapeHtml(code)}" type="button">продолжить ${ICON.next}</button>
  </div>`;
}

/** Сколько задач ноды осталось: мини-задачи в тексте плюс код-задачи в конце. */
/** Полоса «дальше в задачник» внизу статьи.

    Раньше вопросы стояли по ходу текста, а задачи в конце. Теперь читать можно
    подряд, а всё проверяемое собрано в одном месте следующим шагом. */
function drillHtml(code, node, count) {
  if (!count) return "";
  const done = node.ready && node.ready.ready;
  return `<div class="drillbar${done ? " done" : ""}">
    <div class="grow">
      <div class="lbl">${done ? "задачник пройден" : "дальше практика"}</div>
      <b>Задачник: ${count} ${plural(count, "проверка", "проверки", "проверок")}</b>
      <div class="lbl sub">вопросы, мини-задачи и код — всё, что было по этой теме</div>
    </div>
    <a class="btn primary" href="#/drill/${encodeURIComponent(code)}">${done ? "повторить" : "открыть задачник"}</a>
  </div>`;
}

/* ------------------------------------------------------------- «я это знаю» */

/** Закрыть ноду целиком отметкой «знаю».

    Тот же принцип, что у кнопки «изучил» на одном вопросе, только на всю тему:
    человек, пришедший с готовым знанием, не должен перебирать тридцать вопросов,
    чтобы система разрешила ему идти дальше. Плата за это — ноль XP: закрытие
    оплачивается работой, а не нажатием.

    Кнопка требует второго клика. Действие необратимое: нода закроется, вопросы
    получат отметку и перестанут всплывать в задачнике и повторениях. */
export function knowHtml(node) {
  if (!node || node.status === "closed" || node.status === "locked") return "";
  return `<div class="knowbar" data-knowbar>
    <div class="grow">
      <div class="lbl">знакомая тема</div>
      <b>Я это уже знаю</b>
      <div class="lbl sub">Закроет ноду и откроет следующую. Без XP и без цели дня:
        платим за сделанную работу, а не за нажатую кнопку.</div>
    </div>
    <button class="btn ghost" data-know type="button">знаю, закрыть ноду</button>
  </div>`;
}

export function bindKnow(host, node, ctx) {
  const bar = host.querySelector("[data-knowbar]");
  if (!bar) return;
  const btn = bar.querySelector("[data-know]");
  const idle = btn.textContent;
  let armed = 0;

  const disarm = () => { armed = 0; btn.textContent = idle; bar.classList.remove("armed"); };
  btn.addEventListener("click", async () => {
    if (!armed) {
      // Второй клик, а не confirm(): системное окно посреди чтения выбивает
      // из текста сильнее, чем сама отметка.
      bar.classList.add("armed");
      btn.textContent = "точно? жми ещё раз";
      armed = window.setTimeout(disarm, 5000);
      return;
    }
    window.clearTimeout(armed);
    armed = 0;
    btn.disabled = true;
    btn.textContent = "закрываю…";
    try {
      const res = await api.knowNode(node.code);
      node.status = "closed";
      const parts = [];
      if (res.marked) {
        parts.push(`${res.marked} ${plural(res.marked, "вопрос", "вопроса", "вопросов")} отмечено`);
      }
      if (res.tasks_left) {
        parts.push(`${res.tasks_left} ${plural(res.tasks_left, "код-задача осталась",
          "код-задачи остались", "код-задач осталось")} несданной`);
      }
      ctx.toast?.(`нода закрыта без XP${parts.length ? `: ${parts.join(", ")}` : ""}`);
      ctx.refreshStats?.();
      ctx.refreshRail?.();
      location.hash = res.unlocked_node
        ? `#/n/${encodeURIComponent(res.unlocked_node)}` : "#/map";
    } catch (err) {
      ctx.toast?.(err.message);
      btn.disabled = false;
      disarm();
    }
  });
}

/** Дальше пускаем, когда ядро считает ноду сданной: вопросы отвечены,
    код-задачи зелёные. Сам счёт живёт в progress.evaluate, здесь только замок. */
function refreshNext(host, node) {
  const bar = host.querySelector("[data-nextbar]");
  if (!bar) return;
  const btn = bar.querySelector("[data-next]");
  const why = bar.querySelector("[data-next-why]");
  const locked = node.status !== "closed" && node.ready && !node.ready.ready;
  bar.classList.toggle("locked", Boolean(locked));
  btn.innerHTML = locked ? `${ICON.lock} продолжить` : `продолжить ${ICON.next}`;
  why.hidden = !locked;
  if (locked) why.textContent = "сначала задачник этой ноды";
}

function bindNext(host, node, ctx) {
  const btn = host.querySelector("[data-next]");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const locked = node.status !== "closed" && node.ready && !node.ready.ready;
    if (locked) {
      ctx.toast?.("Сначала задачник этой ноды");
      host.querySelector(".drillbar")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    location.hash = `#/n/${encodeURIComponent(btn.dataset.next)}`;
  });
}

/* ---------------------------------------------------------------- оглавление */

function buildToc(aside, host, code, sections, node) {
  const heads = sections.filter((s) => s.heading && keepSection(s, node || {}));
  if (!heads.length) { aside.innerHTML = ""; return; }
  const read = readSet(code);

  aside.innerHTML = `
    <div class="readout">
      <svg class="ring" viewBox="0 0 36 36">
        <circle class="bg" cx="18" cy="18" r="15.5"></circle>
        <circle class="fg" cx="18" cy="18" r="15.5" stroke-dasharray="0 97.4"></circle>
      </svg>
      <div><b data-pct>0%</b><br>прочитано</div>
    </div>
    <nav class="toc">${heads.map((s) =>
      `<a href="#${s.id}" data-sec="${s.id}" class="${read.has(s.id) ? "read" : ""}">${escapeHtml(s.heading)}</a>`
    ).join("")}</nav>`;

  const links = new Map([...aside.querySelectorAll("[data-sec]")].map((a) => [a.dataset.sec, a]));
  const ring = aside.querySelector(".ring .fg");
  const pct = aside.querySelector("[data-pct]");

  function paintPct() {
    // Считаем только те секции, что реально на экране: в сохранённом наборе
    // могут лежать id вырезанных разделов, и процент уезжал за сотню.
    const mine = heads.filter((h) => read.has(h.id)).length;
    const done = Math.round((mine / heads.length) * 100);
    pct.textContent = `${done}%`;
    ring.setAttribute("stroke-dasharray", `${(97.4 * done) / 100} 97.4`);
  }
  paintPct();

  // Считаем на скролле, а не через IntersectionObserver: он сообщает только о
  // смене состояния, и быстрый скролл через полстраницы секции просто перепрыгивает.
  const targets = heads.map((s) => host.querySelector(`#${s.id}`));
  const ACTIVE_AT = 140;   // граница «сейчас читаю»
  let last = 0;
  let timer = null;

  function scan() {
    last = performance.now();
    let active = 0;
    let changed = false;
    const bottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 40;
    targets.forEach((el, i) => {
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top < ACTIVE_AT) active = i;
      // Секция прочитана, когда началась следующая. Доскроллил до конца страницы —
      // прочитано всё: последние секции короче экрана и «начаться» уже не успевают.
      const next = targets[i + 1];
      const done = bottom || (next ? next.getBoundingClientRect().top < ACTIVE_AT : false);
      if (done && !read.has(heads[i].id)) {
        read.add(heads[i].id);
        links.get(heads[i].id)?.classList.add("read");
        changed = true;
      }
    });
    links.forEach((el) => el.classList.remove("on"));
    links.get(heads[active].id)?.classList.add("on");
    if (changed) { saveRead(code, read); paintPct(); }
  }

  // Троттлинг по времени, а не по requestAnimationFrame: в фоновой вкладке rAF
  // придерживают, и последний скролл остаётся неучтённым — прогресс замирает.
  function onScroll() {
    clearTimeout(timer);
    if (performance.now() - last > 100) scan();
    else timer = setTimeout(scan, 110);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  scan();

  aside.addEventListener("click", (e) => {
    const link = e.target.closest("[data-sec]");
    if (!link) return;
    e.preventDefault();
    host.querySelector(`#${link.dataset.sec}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  live = {
    ...(live || {}),
    spy: () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    },
  };
}

/* ---------------------------------------------------------------- поведение текста */

/** Дописать строки проверки в конец main.

    Нужно для задач без вывода: ученик объявляет переменные, а печатает их уже
    проверка, которую он не пишет и не видит. Ищем закрывающую скобку main —
    это предпоследняя `}` в файле из одного класса, а других у нас и не бывает. */
function withProbe(source, probe) {
  if (!probe) return source;
  const last = source.lastIndexOf("}");
  if (last < 0) return source;
  const mainClose = source.lastIndexOf("}", last - 1);
  if (mainClose < 0) return source;
  const body = probe.split("\n").map((l) => "        " + l).join("\n");
  return source.slice(0, mainClose) + body + "\n    " + source.slice(mainClose);
}

const MINI_KEY = (code, id) => `arena.site.mini.${code}.${id}`;

/** Вывод программы и ожидаемый приводим к одному виду: пустые строки и хвостовые
    пробелы к делу не относятся, а вот сами строки сравниваются точно. */
function normalizeOut(text) {
  return String(text || "").replace(/\r\n/g, "\n").split("\n")
    .map((line) => line.trim()).filter(Boolean).join("\n");
}

/** Мини-задачи прямо в тексте: свой редактор, запуск и проверка по выводу. */
export async function bindMiniTasks(root, code, ctx, onSolved) {
  const boxes = [...root.querySelectorAll(".minitask")];
  if (!boxes.length) return;
  let createEditor = null;
  try { createEditor = (await import("./editor.js")).createEditor; } catch { /* textarea */ }

  boxes.forEach((box) => {
    const payload = JSON.parse(box.dataset.payload || "{}");
    const id = box.dataset.mini;
    const name = Object.keys(payload.files || {})[0];
    if (!name) return;
    const initial = payload.files[name];
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(MINI_KEY(code, id)) || "{}"); } catch { /**/ }

    const host = box.querySelector(".mt-editor");
    const note = box.querySelector(".mt-note");
    const out = box.querySelector(".mt-out");
    const goBtn = box.querySelector("[data-mt-run]");
    const resetBtn = box.querySelector("[data-mt-reset]");
    let value = saved.code ?? initial;

    const save = () => {
      try {
        localStorage.setItem(MINI_KEY(code, id), JSON.stringify({
          code: value, done: box.classList.contains("solved"),
          known: box.classList.contains("known"),
        }));
      } catch { /**/ }
    };
    const setKnown = knowMark(box, { save, onSolved, note });

    // Высота под содержимое: пятнадцать задач подряд с редактором в 240px
    // превратили бы страницу в бесконечную ленту.
    const rows = Math.max(6, Math.min(18, initial.split("\n").length + 2));
    host.style.height = `${rows * 22 + 24}px`;

    let editor;
    if (createEditor) {
      editor = createEditor(host, { value, onChange: (v) => { value = v; save(); } });
    } else {
      host.innerHTML = '<textarea spellcheck="false"></textarea>';
      const area = host.querySelector("textarea");
      area.value = value;
      area.addEventListener("input", () => { value = area.value; save(); });
      editor = { setValue: (v) => { area.value = v; }, getValue: () => area.value };
    }

    // Свёрнута только та задача, что была решена в прошлый заход. Решённая
    // только что остаётся открытой: человек смотрит на свой вывод.
    if (saved.done) { box.classList.add("solved", "folded"); note.textContent = "решено"; }
    if (saved.known) setKnown(true, { fold: true });

    resetBtn.addEventListener("click", () => {
      value = initial;
      editor.setValue(initial);
      setKnown(false);
      box.classList.remove("solved", "failed");
      note.textContent = "";
      out.innerHTML = "";
      save();
      onSolved?.();
    });

    goBtn.addEventListener("click", async () => {
      goBtn.disabled = true;
      // Взялся решать сам — отметка «уже умею» больше не при делах, дальше
      // говорит прогон.
      setKnown(false);
      note.textContent = "собираю и запускаю…";
      out.innerHTML = "";
      try {
        const res = await api.run({ [name]: withProbe(value, payload.probe) }, null,
                                  payload.args, payload.stdin);
        // Задача на ошибку: успех это когда компилятор сказал то, что просили.
        if (payload.wantError) {
          const said = `${res.compile_out || ""}${res.stderr || ""}`;
          const ok = !res.ok && said.includes(payload.wantError);
          box.classList.toggle("solved", ok);
          box.classList.toggle("failed", !ok);
          note.textContent = ok ? "та самая ошибка" : "не та ошибка";
          out.innerHTML = said
            ? `<pre class="${ok ? "mt-ok" : "mt-fail"}">${escapeHtml(said)}</pre>`
            : `<div class="mt-diff"><div><b>ожидалось</b><pre>${escapeHtml(payload.wantError)}</pre></div>
               <div><b>получилось</b><pre>код собрался без ошибок</pre></div></div>`;
          if (ok) ctx.toast?.("задача решена");
          save();
          onSolved?.();
          return;
        }
        if (!res.ok) {
          box.classList.add("failed");
          box.classList.remove("solved");
          note.textContent = res.message || "не собралось";
          out.innerHTML = `<pre class="mt-fail">${escapeHtml(res.compile_out || res.stderr || res.message)}</pre>`;
        } else {
          const got = normalizeOut(res.stdout);
          const want = normalizeOut(payload.expect);
          const ok = !want || got === want;
          box.classList.toggle("solved", ok);
          box.classList.toggle("failed", !ok);
          note.textContent = ok ? "решено" : "вывод не совпал";
          out.innerHTML = ok
            ? `<pre class="mt-ok">${escapeHtml(res.stdout || "(пусто)")}</pre>`
            : `<div class="mt-diff">
                 <div><b>получилось</b><pre>${escapeHtml(res.stdout || "(пусто)")}</pre></div>
                 <div><b>ожидалось</b><pre>${escapeHtml(payload.expect)}</pre></div>
               </div>`;
          if (ok) ctx.toast?.("задача решена");
          save();
          onSolved?.();
        }
      } catch (err) {
        note.textContent = err.message;
      } finally {
        goBtn.disabled = false;
      }
    });
  });
}


const SQL_KEY = (code, id) => `arena.site.sql.${code}.${id}`;

/** Идентификатор персональной базы. Один на конспект: внутри одной ноды задачи
    про транзакции идут подряд и должны видеть работу друг друга. */
const SQL_SID = (code) => `n${String(code).replace(/[^\w-]/g, "")}`;

/** Таблица результата. Рисуем ровно то, что вернул движок: NULL отдельным
    значком, а не пустой ячейкой — иначе первая же тема про трёхзначную логику
    развалится о собственное оформление. */
function sqlTable(set) {
  if (!set || !set.cols?.length) return "";
  const head = set.cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = set.rows.map((r) => `<tr>${r.map((c) =>
    c === null ? '<td class="sq-null">NULL</td>' : `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  const tail = set.truncated
    ? '<div class="sq-more">показан первые 200 строк</div>' : "";
  return `<div class="sq-tablewrap"><table class="sq-table">
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${tail}`;
}

/** Ответ движка целиком: наборы результатов, статусы команд и заметки сервера. */
function sqlResult(res) {
  if (!res.ok && res.error) {
    const e = res.error;
    const extra = [
      e.detail ? `ПОДРОБНО: ${e.detail}` : "",
      e.hint ? `ПОДСКАЗКА: ${e.hint}` : "",
    ].filter(Boolean).join("\n");
    return `<pre class="mt-fail">${escapeHtml(e.raw || e.message)}${extra ? "\n" + escapeHtml(extra) : ""}</pre>
      ${e.sqlstate ? `<div class="sq-state">SQLSTATE ${escapeHtml(e.sqlstate)}</div>` : ""}`;
  }
  const parts = (res.sets || []).map((set) => set.cols?.length
    ? sqlTable(set)
    : `<div class="sq-status">${escapeHtml(set.status || "выполнено")}</div>`);
  const notes = (res.notices || []).length
    ? `<pre class="sq-notice">${escapeHtml(res.notices.join("\n"))}</pre>` : "";
  return (parts.join("") || '<div class="sq-status">выполнено</div>') + notes
    + `<div class="sq-time">${res.elapsed_ms} мс${res.mode === "session" ? " · своя база" : ""}</div>`;
}

/** Задачи на SQL: редактор, живой движок и сверка результата с эталоном. */
export async function bindSqlTasks(root, code, ctx, onSolved) {
  const boxes = [...root.querySelectorAll(".sqltask")];
  if (!boxes.length) return;
  let createEditor = null;
  try { createEditor = (await import("./editor.js")).createEditor; } catch { /* textarea */ }

  // Спрашиваем движок один раз на страницу, а не на каждую задачу.
  let engine = { up: true, hint: "" };
  try { engine = await api.sqlStatus(); } catch { /**/ }

  boxes.forEach((box) => {
    const payload = JSON.parse(box.dataset.payload || "{}");
    const id = box.dataset.sql;
    const initial = payload.start || "";
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SQL_KEY(code, id)) || "{}"); } catch { /**/ }

    const host = box.querySelector(".mt-editor");
    const note = box.querySelector(".mt-note");
    const out = box.querySelector(".mt-out");
    const goBtn = box.querySelector("[data-sq-run]");
    const resetBtn = box.querySelector("[data-sq-reset]");
    const hintBtn = box.querySelector("[data-sq-hint]");
    const hintBox = box.querySelector(".sq-hint");
    let value = saved.code ?? initial;

    const save = () => {
      try {
        localStorage.setItem(SQL_KEY(code, id), JSON.stringify({
          code: value, done: box.classList.contains("solved"),
          known: box.classList.contains("known"),
        }));
      } catch { /**/ }
    };
    const setKnown = knowMark(box, { save, onSolved, note });

    const rows = Math.max(5, Math.min(16, (initial || " ").split("\n").length + 3));
    host.style.height = `${rows * 22 + 24}px`;

    let editor;
    if (createEditor) {
      editor = createEditor(host, { value, lang: "sql", onChange: (v) => { value = v; save(); } });
    } else {
      host.innerHTML = '<textarea spellcheck="false"></textarea>';
      const area = host.querySelector("textarea");
      area.value = value;
      area.addEventListener("input", () => { value = area.value; save(); });
      editor = { setValue: (v) => { area.value = v; }, getValue: () => area.value };
    }

    if (saved.done) { box.classList.add("solved", "folded"); note.textContent = "решено"; }
    if (saved.known) setKnown(true, { fold: true });
    if (!engine.up) note.textContent = `движок не отвечает — ${engine.hint}`;

    hintBtn?.addEventListener("click", () => { hintBox.hidden = !hintBox.hidden; });

    resetBtn.addEventListener("click", () => {
      value = initial;
      editor.setValue(initial);
      setKnown(false);
      box.classList.remove("solved", "failed");
      note.textContent = "";
      out.innerHTML = "";
      save();
      onSolved?.();
    });

    goBtn.addEventListener("click", async () => {
      goBtn.disabled = true;
      setKnown(false);
      note.textContent = "выполняю…";
      out.innerHTML = "";
      try {
        // Спрашиваем редактор напрямую, а не ждём отложенный onChange: между
        // последним нажатием и кликом по кнопке может пройти меньше его паузы,
        // и тогда на сервер уехал бы предыдущий текст.
        value = editor.getValue();
        const res = await api.sql(value, payload.dataset, payload.mode, SQL_SID(code));
        out.innerHTML = sqlResult(res);

        // Задача на ошибку: успех это когда движок ответил ровно тем SQLSTATE.
        if (payload.wantState) {
          const got = res.error?.sqlstate || "";
          const ok = !res.ok && got === payload.wantState;
          box.classList.toggle("solved", ok);
          box.classList.toggle("failed", !ok);
          note.textContent = ok ? "та самая ошибка"
            : res.ok ? "запрос отработал, а должен был упасть"
            : `ошибка не та: ждали ${payload.wantState}, пришла ${got || "без кода"}`;
        } else if (payload.free) {
          // Песочница: засчитываем любой успешный прогон, тут нечего «угадывать».
          box.classList.toggle("solved", res.ok);
          box.classList.toggle("failed", !res.ok);
          note.textContent = res.ok ? "выполнено" : "не выполнилось";
        } else if (!res.ok) {
          box.classList.add("failed");
          box.classList.remove("solved");
          note.textContent = res.error?.message || "не выполнилось";
        } else {
          const verdict = sqlMatch(res, payload);
          box.classList.toggle("solved", verdict.match);
          box.classList.toggle("failed", !verdict.match);
          note.textContent = verdict.match ? "решено" : verdict.why;
          if (!verdict.match) out.innerHTML += sqlExpected(payload);
        }
        if (box.classList.contains("solved")) ctx.toast?.("задача решена");
        save();
        onSolved?.();
      } catch (err) {
        note.textContent = err.status === 503
          ? "движок SQL не поднят: brew services start postgresql@17"
          : err.message;
      } finally {
        goBtn.disabled = false;
      }
    });
  });
}

/** Эталон рядом с ответом: без него «не сошлось» ничему не учит. */
function sqlExpected(payload) {
  const head = payload.expectCols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = payload.expectRows.map((r) => `<tr>${r.map((c) =>
    `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  return `<div class="sq-want"><b>ожидалось</b><div class="sq-tablewrap">
    <table class="sq-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </div></div>`;
}

/** Сверка результата с эталоном. Сравниваем значения, а не картинку: ширина
    колонок и выравнивание к делу не относятся. */
function sqlMatch(res, payload) {
  const sets = (res.sets || []).filter((s) => s.cols?.length);
  const last = sets[sets.length - 1];
  if (!last) return { match: false, why: "запрос ничего не выбрал" };

  const norm = (v) => v === null ? "NULL" : String(v).trim().replace(/\s+/g, " ");
  const want = payload.expectRows.map((r) => r.map(norm));
  const got = last.rows.map((r) => r.map(norm));

  if (last.cols.length !== payload.expectCols.length) {
    return { match: false,
             why: `колонок ${last.cols.length}, а ждали ${payload.expectCols.length}` };
  }
  if (got.length !== want.length) {
    return { match: false, why: `строк ${got.length}, а ждали ${want.length}` };
  }
  const key = (rows) => rows.map((r) => r.join("")).sort();
  if (!payload.ordered) {
    const a = key(got), b = key(want);
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return { match: false, why: "набор строк не тот" };
    }
    return { match: true, why: "" };
  }
  for (let i = 0; i < got.length; i++) {
    for (let j = 0; j < got[i].length; j++) {
      if (got[i][j] !== want[i][j]) {
        return { match: false,
                 why: `строка ${i + 1}, колонка «${last.cols[j]}»: пришло «${got[i][j]}», ждали «${want[i][j]}»` };
      }
    }
  }
  return { match: true, why: "" };
}


const SCEN_KEY = (code, id) => `arena.site.scen.${code}.${id}`;

/** Сценарии на нескольких сессиях: блокировки и взаимоблокировки.

    Здесь нет редактора и нечего писать: шаги записаны автором и важен их
    порядок, а не текст. Ученик нажимает «разыграть» и видит ленту — кто когда
    ждал и чем всё кончилось. Одним соединением такое не покажешь, поэтому
    сценарий целиком уходит на сервер. */
export async function bindScenarios(root, code, ctx, onSolved) {
  const boxes = [...root.querySelectorAll(".sqlscenario")];
  if (!boxes.length) return;

  boxes.forEach((box) => {
    const payload = JSON.parse(box.dataset.payload || "{}");
    const id = box.dataset.scenario;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SCEN_KEY(code, id)) || "{}"); } catch { /**/ }

    const note = box.querySelector(".mt-note");
    const goBtn = box.querySelector("[data-sc-run]");
    const hintBtn = box.querySelector("[data-sc-hint]");
    const hintBox = box.querySelector(".sq-hint");
    const outs = [...box.querySelectorAll(".sc-out")];

    const save = () => {
      try {
        localStorage.setItem(SCEN_KEY(code, id), JSON.stringify({
          done: box.classList.contains("solved"),
          known: box.classList.contains("known"),
        }));
      } catch { /**/ }
    };
    const setKnown = knowMark(box, { save, onSolved, note });

    if (saved.done) { box.classList.add("solved", "folded"); note.textContent = "разобрано"; }
    if (saved.known) setKnown(true, { fold: true });

    hintBtn?.addEventListener("click", () => { hintBox.hidden = !hintBox.hidden; });

    goBtn.addEventListener("click", async () => {
      goBtn.disabled = true;
      setKnown(false);
      note.textContent = "разыгрываю…";
      outs.forEach((o) => { o.innerHTML = ""; });
      box.classList.remove("solved", "failed");
      try {
        // Имена полей на проводе змеиные, в разметке верблюжьи. Переклад тут,
        // а не в парсере: парсер про сервер знать не обязан.
        const wire = (payload.steps || []).map((s) => ({
          slot: s.slot, sql: s.sql, expect_wait: Boolean(s.expectWait),
        }));
        const res = await api.sqlScenario(wire, payload.dataset);
        let mismatch = "";
        (res.steps || []).forEach((st, i) => {
          const out = outs[i];
          if (!out) return;
          const parts = [];
          if (st.waited) {
            parts.push(`<div class="sc-waited">ждал ${st.ms} мс — сессия была занята</div>`);
          }
          if (st.error) {
            parts.push(`<pre class="mt-fail">${escapeHtml(st.error.raw || st.error.message)}</pre>`);
            if (st.error.detail) {
              parts.push(`<pre class="sc-detail">${escapeHtml(st.error.detail)}</pre>`);
            }
            if (st.error.sqlstate) {
              parts.push(`<div class="sq-state">SQLSTATE ${escapeHtml(st.error.sqlstate)}</div>`);
            }
          }
          (st.sets || []).forEach((set) => {
            parts.push(set.cols?.length
              ? sqlTable(set)
              : `<div class="sq-status">${escapeHtml(set.status || "выполнено")}</div>`);
          });
          // Пометка «упрётся в блокировку» это утверждение автора, и его надо
          // проверять: не упёрся там, где обещано, — сценарий врёт ученику.
          if (st.expect_wait && !st.waited) {
            mismatch = `шаг ${i + 1}: обещали блокировку, а её не было`;
            out.classList.add("sc-bad");
          } else if (!st.expect_wait && st.waited) {
            mismatch = `шаг ${i + 1}: блокировка там, где её не ждали`;
            out.classList.add("sc-bad");
          } else {
            out.classList.remove("sc-bad");
          }
          out.innerHTML = parts.join("");
        });

        const verdict = mismatch ? { match: false, why: mismatch }
          : payload.expectRows?.length ? scenarioMatch(res, payload)
          : { match: true, why: "" };
        box.classList.toggle("solved", verdict.match);
        box.classList.toggle("failed", !verdict.match);
        note.textContent = verdict.match
          ? `разобрано · ${res.elapsed_ms} мс`
          : verdict.why;
        if (verdict.match) ctx.toast?.("сценарий разыгран");
        save();
        onSolved?.();
      } catch (err) {
        note.textContent = err.status === 503
          ? "движок SQL не поднят: brew services start postgresql@17"
          : err.message;
      } finally {
        goBtn.disabled = false;
      }
    });
  });
}

/** Сверка итога сценария: смотрим последний набор с колонками во всей ленте. */
function scenarioMatch(res, payload) {
  let last = null;
  for (const st of res.steps || []) {
    for (const set of st.sets || []) {
      if (set.cols?.length) last = set;
    }
  }
  if (!last) return { match: false, why: "ни один шаг ничего не выбрал" };
  const norm = (v) => v === null ? "NULL" : String(v).trim().replace(/\s+/g, " ");
  const want = payload.expectRows.map((r) => r.map(norm));
  const got = last.rows.map((r) => r.map(norm));
  if (got.length !== want.length) {
    return { match: false, why: `в итоге строк ${got.length}, а ждали ${want.length}` };
  }
  for (let i = 0; i < got.length; i++) {
    for (let j = 0; j < got[i].length; j++) {
      if (got[i][j] !== want[i][j]) {
        return { match: false,
                 why: `итог, строка ${i + 1}: пришло «${got[i][j]}», ждали «${want[i][j]}»` };
      }
    }
  }
  return { match: true, why: "" };
}


const TERM_KEY = (code, id) => `arena.site.term.${code}.${id}`;

/** Терминал внутри статьи: javac и java двумя отдельными шагами.

    Вся суть ноды «Первая программа из терминала» в том, что между этими шагами
    на диске появляется .class. Поэтому здесь не кнопка «запустить», а настоящая
    командная строка: человек набирает команды сам, а папка на сервере живёт
    между ними и честно показывает, что в ней лежит. */
export async function bindTerminal(root, code, ctx, onSolved) {
  const boxes = [...root.querySelectorAll("[data-terminal]")];
  if (!boxes.length) return;
  let createEditor = null;
  try { createEditor = (await import("./editor.js")).createEditor; } catch { /* textarea */ }

  boxes.forEach((box) => {
    const id = box.dataset.terminal;
    const need = JSON.parse(box.dataset.need || "[]");
    // Команды из «попробуй» обязаны падать: задание в том, чтобы увидеть ошибку.
    // Считать их выполненными по коду возврата значит сделать задание невыполнимым.
    const probe = JSON.parse(box.dataset.probe || "[]");
    const all = [...need, ...probe];
    const log = box.querySelector("[data-tm-log]");
    const input = box.querySelector("[data-tm-input]");
    const lsBox = box.querySelector("[data-tm-ls]");
    const note = box.querySelector(".mt-note");
    const key = TERM_KEY(code, id);

    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch { /**/ }
    // Номер папки на сервере. Свой у каждого блока и живёт вместе с заметками:
    // вернулся через день — файлы на месте.
    const sid = saved.sid || Math.random().toString(36).slice(2, 12).replace(/[^a-z0-9]/g, "x");
    const done = new Set(saved.done || []);

    const files = {};
    const editors = {};
    box.querySelectorAll("[data-tm-file]").forEach((holder) => {
      const name = holder.dataset.tmFile;
      const initial = holder.dataset.tmInit;
      const value = (saved.files || {})[name] ?? initial;
      files[name] = value;
      const host = holder.querySelector(".tm-editor");
      host.style.height = `${Math.max(6, Math.min(16, initial.split("\n").length + 1)) * 22 + 20}px`;
      if (createEditor) {
        editors[name] = createEditor(host, { value, onChange: (v) => { files[name] = v; save(); } });
      } else {
        host.innerHTML = '<textarea spellcheck="false"></textarea>';
        const area = host.querySelector("textarea");
        area.value = value;
        area.addEventListener("input", () => { files[name] = area.value; save(); });
        editors[name] = { setValue: (v) => { area.value = v; }, getValue: () => area.value };
      }
    });

    const save = () => {
      try {
        localStorage.setItem(key, JSON.stringify({
          sid, files, done: [...done], log: log.innerHTML.slice(0, 20000),
          known: box.classList.contains("known"),
        }));
      } catch { /**/ }
    };
    const setKnown = knowMark(box, { save, onSolved, note });

    const paintLs = (list) => {
      lsBox.innerHTML = (list || []).map((name) => {
        const cls = name.endsWith(".class") ? "cls" : "src";
        return `<li class="${cls}">${escapeHtml(name)}</li>`;
      }).join("") || '<li class="empty">пусто</li>';
    };

    const paintNeed = () => {
      box.querySelectorAll("[data-tm-cmd]").forEach((chip) => {
        chip.classList.toggle("done", done.has(chip.dataset.tmCmd));
      });
      const ready = all.length && all.every((c) => done.has(c));
      box.classList.toggle("solved", ready || box.classList.contains("known"));
      if (ready) note.textContent = "сделано";
      onSolved?.();
    };

    const push = (html) => {
      log.insertAdjacentHTML("beforeend", html);
      log.scrollTop = log.scrollHeight;
    };

    async function runCmd(cmd, quiet) {
      const clean = String(cmd || "").trim();
      if (!clean) return;
      // Стартовый ls в лог не пишем: иначе при каждом заходе на ноду история
      // прирастает командой, которую человек не набирал.
      if (!quiet) push(`<div class="tm-cmd"><span class="tm-prompt">$</span>${escapeHtml(clean)}</div>`);
      input.disabled = true;
      try {
        const res = await api.term(sid, files, clean);
        if (res.out && !quiet) {
          push(`<pre class="tm-out${res.rc ? " bad" : ""}">${escapeHtml(res.out)}</pre>`);
        }
        paintLs(res.files);
        // Успех обязателен только для «нужно». «Попробуй» засчитывается по запуску.
        if ((!res.rc && need.includes(clean)) || probe.includes(clean)) {
          done.add(clean);
          paintNeed();
        }
        save();
      } catch (err) {
        push(`<pre class="tm-out bad">${escapeHtml(err.message)}</pre>`);
      } finally {
        input.disabled = false;
        input.focus();
      }
    }

    if (saved.log) log.innerHTML = saved.log;
    if (done.size) paintNeed();
    if (saved.done && all.length && all.every((c) => done.has(c))) box.classList.add("folded");
    if (saved.known) setKnown(true, { fold: true });
    paintLs(saved.ls || Object.keys(files));

    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const value = input.value;
      input.value = "";
      runCmd(value);
    });
    box.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-tm-cmd]");
      if (chip) { input.value = chip.dataset.tmCmd; input.focus(); return; }
      if (e.target.closest("[data-tm-reset]")) {
        log.innerHTML = "";
        done.clear();
        setKnown(false);
        box.classList.remove("solved");
        note.textContent = "";
        paintNeed();
        runCmd("reset");
      }
    });
    // Первый ls делаем молча: он нужен только чтобы нарисовать список файлов.
    runCmd("ls", true);
  });
}

const RO_KEY = (code, id) => `arena.site.reorder.${code}.${id}`;

/** Задачи на порядок: строки таскаются мышкой, стрелками или кнопками.
    Клавиатура и кнопки тут не украшение: перетаскивание не работает пальцем
    на тачскрине и недоступно с клавиатуры, а задача должна решаться всегда. */
export function bindReorder(root, code, ctx, onSolved) {
  root.querySelectorAll("[data-reorder]").forEach((box) => {
    const id = box.dataset.reorder;
    const answer = JSON.parse(box.dataset.answer || "[]");
    const list = box.querySelector(".ro-list");
    const note = box.querySelector(".mt-note");
    let dragged = null;

    const order = () => [...list.children].map((li) => Number(li.dataset.at));
    const save = () => {
      try {
        localStorage.setItem(RO_KEY(code, id), JSON.stringify({
          order: order(), done: box.classList.contains("solved"),
          known: box.classList.contains("known"),
        }));
      } catch { /**/ }
    };
    const setKnown = knowMark(box, { save, onSolved, note });
    const reset = () => {
      setKnown(false);
      box.classList.remove("solved", "failed");
      note.textContent = "";
    };

    // восстановление сохранённого порядка
    try {
      const saved = JSON.parse(localStorage.getItem(RO_KEY(code, id)) || "null");
      if (saved && Array.isArray(saved.order) && saved.order.length === list.children.length) {
        const byAt = new Map([...list.children].map((li) => [Number(li.dataset.at), li]));
        saved.order.forEach((at) => { const li = byAt.get(at); if (li) list.appendChild(li); });
        if (saved.done) { box.classList.add("solved", "folded"); note.textContent = "верно"; }
      }
      if (saved && saved.known) setKnown(true, { fold: true });
    } catch { /**/ }

    list.addEventListener("dragstart", (e) => {
      dragged = e.target.closest(".ro-row");
      if (!dragged) return;
      dragged.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      // Safari не начнёт перетаскивание без данных в буфере.
      e.dataTransfer.setData("text/plain", dragged.dataset.at);
    });
    list.addEventListener("dragend", () => {
      dragged?.classList.remove("dragging");
      dragged = null;
      reset();
      save();
    });
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dragged) return;
      const over = e.target.closest(".ro-row");
      if (!over || over === dragged) return;
      const rect = over.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      list.insertBefore(dragged, after ? over.nextSibling : over);
    });
    list.addEventListener("drop", (e) => e.preventDefault());

    list.addEventListener("click", (e) => {
      const up = e.target.closest("[data-ro-up]");
      const down = e.target.closest("[data-ro-down]");
      const row = (up || down)?.closest(".ro-row");
      if (!row) return;
      if (up && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
      if (down && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
      reset();
      save();
      (up || down).focus();
    });

    box.querySelector("[data-ro-check]").addEventListener("click", () => {
      const now = order();
      const ok = now.every((at, i) => at === i);
      setKnown(false);
      box.classList.toggle("solved", ok);
      box.classList.toggle("failed", !ok);
      if (ok) {
        note.textContent = "верно";
        ctx.toast?.("порядок правильный");
      } else {
        const first = now.findIndex((at, i) => at !== i);
        note.textContent = `не сходится начиная со строки ${first + 1}`;
      }
      save();
      onSolved?.();
    });

    box.querySelector("[data-ro-reset]").addEventListener("click", () => {
      const rows = [...list.children];
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        list.insertBefore(rows[i], rows[j]);
      }
      reset();
      save();
      onSolved?.();
    });
  });
}

/** Подсветка и номера строк во всех код-блоках: тем же движком, что и в редакторе.
    Сюда же попадают сниппеты внутри вопросов — там код ровно такой же, и читать
    его без подсветки ничем не легче, чем в статье. */
export async function paintCode(root, lang0) {
  const blocks = [...root.querySelectorAll("pre.code, pre.snippet")];
  if (!blocks.length) return;
  let paintJava = null;
  let paintSql = null;
  try {
    const ed = await import("./editor.js");
    paintJava = ed.highlightJava;
    paintSql = ed.highlightSql;
  } catch { return; }
  // Язык сниппета внутри вопроса берём у ноды: в разделе DBA там SQL, и красить
  // его джавовским лексером значит показывать SELECT как имя класса.
  const snippetLang = lang0 === "sql" ? "sql" : "java";
  blocks.forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code || pre.dataset.painted) return;
    const text = code.textContent.replace(/\n$/, "");
    const lang = pre.dataset.lang || (pre.classList.contains("snippet") ? snippetLang : "");
    const lines = text.split("\n");
    const gutter = lines.map((_, i) => i + 1).join("\n");
    code.innerHTML = lang === "java" ? paintJava(text)
      : (lang === "sql" || lang === "tsql") ? paintSql(text)
      : escapeHtml(text);
    pre.dataset.painted = "1";
    pre.classList.add("hl");
    const rail = document.createElement("span");
    rail.className = "linenos";
    rail.setAttribute("aria-hidden", "true");
    rail.textContent = gutter;
    pre.insertBefore(rail, code);
  });
}

const SNIP_KEY = (code, i) => `arena.site.snippet.${code}.${i}`;

/** Примеры в статье редактируемые: поменял строку, нажал «запустить», увидел,
    что вышло. «Вернуть как было» возвращает авторский вариант. */
async function bindRunnable(prose, ctx) {
  const boxes = [...prose.querySelectorAll("[data-run]")];
  if (!boxes.length) return;
  const code = location.hash.split("/")[2] ? decodeURIComponent(location.hash.split("/")[2]) : "x";
  let createEditor = null;
  try { createEditor = (await import("./editor.js")).createEditor; } catch { /* останется pre */ }

  boxes.forEach((box, index) => {
    const pre = box.querySelector("pre");
    const initial = pre.querySelector("code").textContent.replace(/\n$/, "");
    const go = box.querySelector("[data-run-go]");
    const resetBtn = box.querySelector("[data-run-reset]");
    const note = box.querySelector("[data-run-note]");
    let saved = null;
    try { saved = localStorage.getItem(SNIP_KEY(code, index)); } catch { /**/ }
    let value = saved ?? initial;

    const store = () => {
      try {
        if (value === initial) localStorage.removeItem(SNIP_KEY(code, index));
        else localStorage.setItem(SNIP_KEY(code, index), value);
      } catch { /**/ }
      resetBtn.hidden = value === initial;
    };

    let editor = null;
    if (createEditor) {
      const host = document.createElement("div");
      host.className = "run-edit";
      host.style.height = `${Math.min(22, initial.split("\n").length + 1) * 22 + 20}px`;
      pre.replaceWith(host);
      editor = createEditor(host, { value, onChange: (v) => { value = v; store(); } });
    }
    store();

    resetBtn.addEventListener("click", () => {
      value = initial;
      editor?.setValue(initial);
      store();
      box.querySelector(".runout")?.remove();
      note.textContent = "код можно менять прямо здесь и запускать";
    });

    go.addEventListener("click", async () => {
      const source = editor ? editor.getValue() : initial;
      go.disabled = true;
      note.textContent = "собираю и запускаю…";
      box.querySelector(".runout")?.remove();
      try {
        const res = await api.run({ [`${classOf(source)}.java`]: source });
        const out = document.createElement("pre");
        out.className = `runout${res.ok ? "" : " err"}`;
        const body = res.ok
          ? (res.stdout || "(программа ничего не вывела)")
          : (res.compile_out || res.stderr || res.message);
        out.innerHTML = `<span class="lbl">${res.ok ? "твой запуск" : res.message}</span>${escapeHtml(body)}`;
        box.appendChild(out);
        note.textContent = `${Math.round((res.seconds || 0) * 100) / 100}s`;
      } catch (err) {
        ctx.toast(err.message);
        note.textContent = "не получилось";
      } finally {
        go.disabled = false;
      }
    });
  });
}

function bindProse(prose, ctx) {
  // спойлеры
  prose.addEventListener("click", (e) => {
    const head = e.target.closest(".callout.fold > .co-head");
    if (head) head.parentElement.classList.toggle("open");
    const flip = e.target.closest(".flip");
    if (flip) flip.classList.toggle("on");
  });

  // запуск примеров: код в статье живой, его можно править и гонять
  bindRunnable(prose, ctx);

  // взять ноду и пинок генерации
  document.querySelectorAll("[data-enter]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const code = location.hash.split("/")[2];
        await api.enterNode(decodeURIComponent(code));
        ctx.toast("нода взята, генерация пошла");
        ctx.refreshStats?.();
        ctx.reload?.();
      } catch (err) { ctx.toast(err.message); btn.disabled = false; }
    });
  });
  document.querySelectorAll("[data-kick]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const code = decodeURIComponent(location.hash.split("/")[2] || "");
        await api.genKick(code);
        ctx.toast("поставил в очередь генерации");
      } catch (err) { ctx.toast(err.message); btn.disabled = false; }
    });
  });
}

export { plain };
