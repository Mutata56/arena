/* Задачник: всё проверяемое по ноде в одном месте, отдельным экраном.

   Зачем отдельно. Пока вопросы стояли по ходу статьи, было две беды сразу.
   Первая: место для них выбирал алгоритм по словарю, и регулярно ставил вопрос
   раньше абзаца, который на него отвечает. Вторая, важнее: читать текст,
   спотыкаясь каждые два абзаца о проверку, невозможно — это уже не чтение.

   Поэтому статья теперь только читается, а всё, что надо сделать руками,
   собрано здесь: вопросы из банка, мини-задачи, перестановки и терминалы
   из конспекта, код-задачи. Ядро при этом не изменилось ни на строчку:
   те же записи банка, те же ручки, тот же XP. */

import api from "./api.js";
import { parseNote, renderBlocks, escapeHtml } from "./md.js";
import { renderCheck, bindChecks } from "./quizzes.js";
import {
  DRILL_BLOCKS, ICON, bindMiniTasks, bindReorder, bindScenarios, bindSqlTasks,
  bindTerminal, bindUnfold,
  bindTasks, bindKnow, keepSection, knowHtml, paintCode, plural, tasksHtml, refreshGate,
} from "./article.js";

let live = null;

export function teardown() {
  live = null;
}

export async function drillView(host, code, ctx) {
  teardown();
  host.innerHTML = `<div class="article"><div class="skel" style="height:26px;width:200px;margin:44px 0 14px"></div>
    <div class="skel" style="height:280px"></div></div>`;

  let note, items;
  try {
    [note, items] = await Promise.all([api.note(code), api.nodeItems(code)]);
  } catch (err) {
    host.innerHTML = `<div class="empty"><h2>не открылось</h2><p>${escapeHtml(err.message)}</p>
      <a class="btn" href="#/map">к карте</a></div>`;
    return;
  }

  const node = note.node || {};
  ctx.setCrumb(`этап ${node.stage_shown ?? node.stage_num ?? "?"} · ${node.stage_title || ""}`,
               `${code} задачник`);
  ctx.aside.innerHTML = "";

  const parsed = note.exists ? parseNote(note.markdown) : null;
  const sections = parsed ? parsed.sections.filter((s) => keepSection(s, node)) : [];
  // Задания идут в том порядке, в каком стояли в конспекте: автор писал их
  // по нарастанию сложности, и этот порядок терять незачем.
  const blocks = sections.flatMap((s) => (s.blocks || []).filter((b) => DRILL_BLOCKS.has(b.t)));

  const max = node.kind === "тест" ? 15 : 10;
  const quizzes = (items.quiz || []).filter((q) => !q.suspended);
  // Неотвеченные первыми: банк мог пополниться после того, как человек прошёл ноду.
  const ordered = [...quizzes.filter((q) => !q.done && !q.tried),
                   ...quizzes.filter((q) => !q.done && q.tried),
                   ...quizzes.filter((q) => q.done)].slice(0, max);

  const tasks = items.tasks || [];
  const total = ordered.length + blocks.length + tasks.length;
  // Сколько из показан вопросов человек ещё не видел. На закрытой ноде это
  // добор, появившийся после сдачи, и говорить о нём надо именно так.
  const fresh = ordered.filter((q) => !q.done && !q.tried).length;
  const backHref = `#/n/${encodeURIComponent(code)}`;

  if (!total) {
    host.innerHTML = `<div class="article">
      ${headHtml(code, node, 0, 0)}
      <div class="empty"><h2>здесь пока пусто</h2>
        <p>По этой ноде ещё нет ни вопросов, ни заданий.</p>
        <a class="btn" href="${backHref}">вернуться к статье</a></div>
    </div>`;
    return;
  }

  let n = 0;
  // Колода, а не стопка: на экране одна карточка, остальные ждут своей очереди.
  // Десять вопросов подряд это метр прокрутки, и к пятому уже не помнишь,
  // отвечал ты на третий или нет.
  const checksHtml = ordered.map((item) =>
    `<div class="deck-slide" hidden>${renderCheck(item, ++n, ordered.length)}</div>`).join("");

  host.innerHTML = `<div class="article drill${node.status === "closed" ? " passed" : ""}">
    ${headHtml(code, node, total, fresh)}
    ${ordered.length ? `<section class="drill-part">
      <h2>Проверь себя</h2>
      <p class="sub">${ordered.length} ${plural(ordered.length, "вопрос", "вопроса", "вопросов")}
        по тому, что было в статье. Ответил — сразу видно, верно или нет, и почему.</p>
      <div class="deck" data-deck>${checksHtml}</div>
      <div class="deck-nav" data-deck-nav>
        <button class="btn ghost" data-deck-prev type="button">${ICON.prev} назад</button>
        <span class="deck-dots" data-deck-dots></span>
        <button class="btn primary" data-deck-next type="button">дальше ${ICON.next}</button>
      </div>
    </section>` : ""}
    ${blocks.length ? `<section class="drill-part" id="hands">
      <h2>Сделай руками</h2>
      <p class="sub">${blocks.length} ${plural(blocks.length, "задание", "задания", "заданий")}
        из конспекта: ${node.lang === "sql"
          ? "запросы уходят в настоящий движок и проверяются по результату"
          : "код собирается и запускается прямо здесь"}.</p>
      <div class="prose" id="drill-blocks">${renderBlocks(blocks)}</div>
    </section>` : ""}
    ${tasks.length ? `<section class="drill-part">
      ${tasksHtml(tasks, 0, node)}
    </section>` : ""}
    ${knowHtml(node)}
    <div class="nextbar" data-nextbar>
      <div class="grow"><div class="lbl">когда закончишь</div>
        <b>${escapeHtml(node.title || code)}</b>
        <div class="lbl" data-next-why hidden></div></div>
      <a class="btn ghost" href="${backHref}">к статье</a>
    </div>
  </div>`;

  const art = host.querySelector(".article");
  const prose = art.querySelector("#drill-blocks");
  if (prose) {
    paintCode(prose, node.lang);
    const onSolved = () => paintProgress(art, total);
    bindMiniTasks(prose, code, ctx, onSolved).then(onSolved);
    bindReorder(prose, code, ctx, onSolved);
    bindTerminal(prose, code, ctx, onSolved);
    bindSqlTasks(prose, code, ctx, onSolved).then(onSolved);
    bindScenarios(prose, code, ctx, onSolved).then(onSolved);
    bindUnfold(prose);
  }
  paintCode(art, node.lang);
  bindChecks(art, {
    toast: ctx.toast,
    onAnswered: (res) => {
      ctx.refreshStats?.();
      paintProgress(art, total);
      art.querySelector("[data-deck]")?.dispatchEvent(new CustomEvent("arena:answered"));
      if (res?.node_closed) {
        ctx.toast?.("нода закрыта");
        ctx.refreshRail?.();
      }
    },
  });
  bindDeck(art, ctx);
  bindTasks(art, node, ctx);
  bindKnow(art, node, ctx);
  // Задачи в задачнике не запираются «сначала прочитай»: сюда человек и пришёл
  // из статьи, читать он уже закончил.
  refreshGate(art, 0, { ...node, status: "closed" }, ctx);
  paintProgress(art, total);

  live = { code };
  // Список слева кешируется, и после сдачи ноды галочка там появлялась только
  // после перезагрузки. Раз уж мы здесь, обновим его.
  ctx.refreshRail?.();
  window.scrollTo({ top: 0 });
}


/** Колода вопросов: видна одна карточка, ходим стрелками.

    Отвеченная карточка не исчезает сама — человек читает объяснение и уходит
    дальше сам, когда прочитал. Кнопка «дальше» после ответа становится заметной,
    чтобы не искать, куда жать. */
function bindDeck(art, ctx) {
  const deck = art.querySelector("[data-deck]");
  if (!deck) return;
  const slides = [...deck.querySelectorAll(".deck-slide")];
  const dots = art.querySelector("[data-deck-dots]");
  const prev = art.querySelector("[data-deck-prev]");
  const next = art.querySelector("[data-deck-next]");
  let at = Math.max(0, slides.findIndex((s) => {
    const box = s.querySelector(".check");
    return box && !box.classList.contains("done") && !box.classList.contains("missed");
  }));
  if (at === -1) at = 0;

  function paint() {
    slides.forEach((s, i) => { s.hidden = i !== at; });
    prev.disabled = at === 0;
    // Последнюю кнопку не гасим: с неё уходят к заданиям, а не в никуда.
    const last = at === slides.length - 1;
    next.innerHTML = last ? `к заданиям ${ICON.next}` : `дальше ${ICON.next}`;
    const answered = slides[at].querySelector(".check.done");
    next.classList.toggle("primary", Boolean(answered));
    next.classList.toggle("ghost", !answered);
    dots.innerHTML = slides.map((s, i) => {
      const box = s.querySelector(".check");
      const done = box?.classList.contains("done") ? " done"
        : (box?.classList.contains("missed") ? " missed" : "");
      const here = i === at ? " on" : "";
      return `<button class="deck-dot${done}${here}" type="button" data-deck-go="${i}"
        aria-label="вопрос ${i + 1}"></button>`;
    }).join("");
  }

  function go(to) {
    at = Math.min(slides.length - 1, Math.max(0, to));
    paint();
    const top = window.scrollY + deck.getBoundingClientRect().top - 84;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  art.addEventListener("click", (e) => {
    if (e.target.closest("[data-deck-prev]")) { go(at - 1); return; }
    if (e.target.closest("[data-deck-next]")) {
      if (at === slides.length - 1) {
        ctx.toast?.("это был последний вопрос");
        art.querySelector("#hands")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      go(at + 1);
      return;
    }
    const dot = e.target.closest("[data-deck-go]");
    if (dot) go(Number(dot.dataset.deckGo));
  });
  // Стрелки на клавиатуре: руки уже на клавиатуре, если вопрос с кодом.
  art.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea") || e.target.isContentEditable) return;
    if (e.key === "ArrowRight") go(at + 1);
    if (e.key === "ArrowLeft") go(at - 1);
  });
  deck.addEventListener("arena:answered", paint);
  paint();
}

function headHtml(code, node, total, fresh) {
  // Закрытая нода это не список долгов. Банк со временем пополняется, и человек,
  // который ноду уже сдал, не должен видеть «0 из 20» и думать, что всё сначала.
  const done = node.status === "closed";
  return `<div class="artmeta">
      <span class="chip">${escapeHtml(String(code))}</span>
      <span class="chip">задачник</span>
      ${done ? '<span class="chip ok">нода пройдена</span>' : ""}
      ${total ? `<span class="chip" data-drill-left></span>` : ""}
    </div>
    <h1>Задачник: ${escapeHtml(node.title || code)}</h1>
    <p class="artlead" data-drill-lead>${done
      ? `Ноду ты уже сдал, здесь она открыта для повторения.${fresh
          ? ` С тех пор в банке появилось новых: ${fresh}. Решать их необязательно.`
          : ""}`
      : "Здесь собрано всё, что надо сделать по этой ноде. Статья рядом — если что-то не идёт, вернись и перечитай."}</p>
    <hr class="artrule">`;
}

/** Сколько осталось. Считаем по экрану: отвеченный вопрос, решённое задание,
    сданная код-задача. */
function paintProgress(art, total) {
  // Считаем как ядро: вопрос отвечен, даже если ответ был неверный.
  // Иначе цифра расходится с тем, закрылась нода или нет.
  const doneChecks = art.querySelectorAll(".check.done, .check.missed").length;
  const doneBlocks = art.querySelectorAll(".minitask.solved").length;
  const doneTasks = art.querySelectorAll(".taskcard.passed").length;
  const done = doneChecks + doneBlocks + doneTasks;
  const chip = art.querySelector("[data-drill-left]");
  if (chip) chip.textContent = `${done} из ${total}`;

  // Нода закрывается по квиз-банку, а задания конспекта в этот счёт не входят.
  // Поэтому «ты уже сдал» на закрытой ноде регулярно означало «сдал, но двадцать
  // задач тут даже не открывал». Врать не надо: если задания остались, так и пишем.
  const lead = art.querySelector("[data-drill-lead]");
  if (lead && art.classList.contains("passed") && done < total) {
    const left = total - done;
    lead.textContent = `Ноду ты сдал по вопросам, но задания отсюда ещё не решены: `
      + `${left} ${plural(left, "штука", "штуки", "штук")}. `
      + `На закрытие ноды они не влияют — это тренировка, а не долг.`;
  }

  // На пройденной ноде замок внизу не нужен: она уже сдана, и «осталось N»
  // здесь читается как «ты что-то не доделал», хотя доделывать нечего.
  if (art.classList.contains("passed")) {
    const bar = art.querySelector("[data-nextbar]");
    if (bar) {
      bar.classList.remove("locked");
      const why = bar.querySelector("[data-next-why]");
      if (why) why.hidden = true;
    }
    return;
  }
  const bar = art.querySelector("[data-nextbar]");
  if (!bar) return;
  const why = bar.querySelector("[data-next-why]");
  const left = Math.max(0, total - done);
  bar.classList.toggle("locked", left > 0);
  why.hidden = left === 0;
  if (left > 0) {
    why.textContent = `осталось ${left} ${plural(left, "штука", "штуки", "штук")}`;
  }
}
