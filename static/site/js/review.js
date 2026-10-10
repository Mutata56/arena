/* Повторение пройденного. Тот же банк и тот же SM-2, что и в ядре: сайт только
   показывает очередь и отдаёт ответы в те же ручки.

   Сессия устроена как колода, а не простыня: на экране один вопрос, ответ —
   цифрами 1–4, дальше — Enter. Клик по плитке запускает категорию ЦЕЛИКОМ:
   ручка отдаёт максимум 60 за раз, поэтому добираем пачками, пока категория
   не кончится. Уже показан в этой сессии второй раз не приходит: вопрос
   с сегодняшним промахом сервер из очереди «промахов» не убирает, и без
   фильтра сессия крутилась бы по кругу. */

import api from "./api.js";
import { escapeHtml, inline } from "./md.js";
import { renderCheck, bindChecks } from "./quizzes.js";
import { paintCode } from "./article.js";

const GRADES = [
  ["again", "снова", "again"],
  ["hard", "трудно", ""],
  ["good", "хорошо", ""],
  ["easy", "легко", "easy"],
];

const KIND_TITLES = { cards: "карточки", weak: "промахи", stale: "давнее" };
// Потолок ручки /api/review/queue. Больше просить бессмысленно: сервер обрежет.
const FETCH = 60;

export async function reviewView(host, ctx) {
  ctx.setCrumb("повторение", "то, что просело");
  host.innerHTML = '<div class="article"><div class="skel" style="height:220px;margin-top:44px"></div></div>';

  let plan;
  try { plan = await api.reviewPlan(); }
  catch (err) { host.innerHTML = `<div class="empty"><h2>не открылось</h2><p>${escapeHtml(err.message)}</p></div>`; return; }

  const cats = [
    { kind: "cards", n: plan.cards_due, title: "карточек созрело" },
    { kind: "weak", n: plan.weak, title: "с промахами" },
    { kind: "stale", n: plan.stale, title: "давно не попадались" },
  ];

  host.innerHTML = `<div class="article">
    <div class="artmeta"><span class="chip">повторение</span>
      <span class="chip">${plan.closed_nodes} нод закрыто</span></div>
    <h1>Повторение пройденного</h1>
    <p class="artlead">Сюда попадает только материал закрытых нод: то, где был промах,
      и то, что давно не попадалось. Клик по плитке — сессия до конца категории:
      1–4 отвечают, пробел — «знаю», Enter листает.</p>
    <hr class="artrule">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);DEMO_PROJECT:10px;margin-bottom:22px">
      ${cats.map((c) => `<button class="taskcard" data-kind="${c.kind}" ${c.n ? "" : "disabled"}
        style="flex-direction:column;align-items:flex-start;DEMO_PROJECT:4px">
        <b style="font-size:26px;font-variant-numeric:tabular-nums">${c.n}</b>
        <span style="font-size:12.5px;color:var(--muted)">${c.title}</span></button>`).join("")}
    </div>
    ${plan.forecast?.length ? `<p style="color:var(--muted);font-size:13.5px">
      Ближайшее: ${escapeHtml(plan.forecast[0].date)} — ${plan.forecast[0].cards} карточек.</p>` : ""}
    <div id="queue"></div>
  </div>`;

  const queue = host.querySelector("#queue");
  // Плитку можно нажать посреди идущей сессии: старая обязана замолчать,
  // иначе два обработчика на одном #queue листают наперегонки.
  let sessionToken = 0;
  host.querySelectorAll("[data-kind]").forEach((btn) =>
    btn.addEventListener("click", () => {
      startSession(btn.dataset.kind, Number(btn.querySelector("b")?.textContent) || 0);
      queue.scrollIntoView({ behavior: "smooth", block: "start" });
    }));

  async function startSession(kind, planTotal) {
    const token = ++sessionToken;
    const stale = () => token !== sessionToken || !queue.isConnected;
    const seen = new Set();     // что уже показывали в этой сессии
    const counted = new Set();  // что уже засчитано в счёт (страховка от двойного onAnswered)
    const buffer = [];
    let okCount = 0;
    let doneCount = 0;
    let dry = false;            // сервер больше ничего нового не отдаёт
    let current = null;
    let checks = null;          // ручка answer текущего вопроса: пробел зовёт через неё «знаю»

    async function fetchMore() {
      if (dry) return;
      let data;
      try { data = await api.reviewQueue(FETCH, kind); }
      catch (err) { ctx.toast(err.message); dry = true; return; }
      const fresh = (data.items || []).filter((it) => !seen.has(it.item_id));
      if (!fresh.length) { dry = true; return; }
      fresh.forEach((it) => { seen.add(it.item_id); buffer.push(it); });
    }

    // Плитка обещает planTotal, но жизнь богаче: категория могла дорасти,
    // пока шла сессия. Показываем большее из обещанного и уже увиденного.
    const total = () => Math.max(planTotal, doneCount + buffer.length + (current ? 1 : 0));

    async function next() {
      current = null;
      if (!buffer.length) {
        queue.innerHTML = '<div class="skel" style="height:180px"></div>';
        await fetchMore();
        if (stale()) return;
      }
      const item = buffer.shift();
      if (!item) { renderFinish(); return; }
      current = item;
      renderOne(item);
    }

    function renderOne(item) {
      const idx = doneCount + 1;
      queue.innerHTML = `<div data-rev-session>
        <div class="artmeta" style="justify-content:space-between">
          <span class="chip">${KIND_TITLES[kind] || "повторение"}</span>
          <span class="chip" data-rev-score style="font-variant-numeric:tabular-nums">верно ${okCount} · мимо ${doneCount - okCount}</span>
        </div>
        ${item.kind === "card" ? cardHtml(item, idx, total()) : renderCheck(item, idx, total())}
        <div class="ck-row" style="justify-content:space-between;align-items:center;margin-top:12px">
          <span class="lbl">1–4 — ответ · пробел — знаю · Enter — дальше</span>
          <button class="btn ghost" data-rev-next type="button">дальше →</button>
        </div>
      </div>`;
      paintCode(queue);
      checks = null;
      if (item.kind === "card") bindCards(queue, ctx, onDone);
      // Ядро отдаёт объект ответа; в счёт сессии идёт только «был ли промах».
      // Отметка «уже знаю» приходит с correct=true и промахом не считается.
      else checks = bindChecks(queue, { toast: ctx.toast, onAnswered: (res, id) => onDone(Boolean(res?.correct), id) });
    }

    // Общий приёмник и для вопроса, и для карточки. ok — не было ли промаха:
    // у вопроса это correct (или «уже знаю»), у карточки — любая оценка кроме «снова».
    function onDone(ok, itemId) {
      if (counted.has(itemId)) return;
      counted.add(itemId);
      doneCount += 1;
      if (ok) okCount += 1;
      ctx.refreshStats?.();
      const score = queue.querySelector("[data-rev-score]");
      if (score) score.textContent = `верно ${okCount} · мимо ${doneCount - okCount}`;
      const nextBtn = queue.querySelector("[data-rev-next]");
      if (nextBtn) { nextBtn.classList.remove("ghost"); nextBtn.classList.add("primary"); }
    }

    function renderFinish() {
      if (!doneCount) {
        queue.innerHTML = '<div class="gate">на сегодня тут пусто</div>';
        return;
      }
      const missed = doneCount - okCount;
      queue.innerHTML = `<div class="gate">
        <b>${KIND_TITLES[kind] || "категория"}: пройдено всё.</b>
        Отвечено ${doneCount}, верных ${okCount}${missed ? `, промахов ${missed}` : ", без единого промаха"}.
        <div class="ck-row" style="margin-top:12px">
          <button class="btn primary" data-rev-back type="button">к категориям</button>
        </div>
      </div>`;
      ctx.refreshStats?.();
    }

    queue.addEventListener("click", (e) => {
      if (stale()) return;
      if (e.target.closest("[data-rev-back]")) { reviewView(host, ctx); return; }
      if (e.target.closest("[data-rev-next]")) {
        if (current && !counted.has(current.item_id)) {
          ctx.toast("сначала ответь — или жми «это я уже знаю»");
          return;
        }
        next();
      }
    });

    // Клавиатура живёт на документе и сама отписывается, когда сессии больше
    // нет на экране: у роутера нет teardown для этого экрана, и висящий
    // обработчик иначе пережил бы уход на другую страницу.
    const onKey = (e) => {
      if (stale()) { document.removeEventListener("keydown", onKey); return; }
      if (!queue.querySelector("[data-rev-session]") && !queue.querySelector("[data-rev-back]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target?.matches?.("input, textarea, select") || e.target?.isContentEditable) return;

      if (e.key >= "1" && e.key <= "4") {
        const k = Number(e.key) - 1;
        const grades = queue.querySelector("[data-grades]:not([hidden])");
        if (grades) { grades.querySelectorAll("[data-grade]")[k]?.click(); e.preventDefault(); return; }
        const opts = queue.querySelectorAll(".check .opt");
        if (opts[k] && !opts[k].disabled) { opts[k].click(); e.preventDefault(); }
        return;
      }
      const know = e.key === " " || e.code === "KeyR";
      if (e.key === "Enter" || know) {
        const show = queue.querySelector("[data-show]");
        if (show && !show.parentElement.hidden) { show.click(); e.preventDefault(); return; }
        // Пробел (и r, как на старом дашборде) на неотвеченном вопросе — «знаю»:
        // ядро засчитывает верно, платит как за обычный ответ и раскрывает разбор.
        // Это честный self-report для прогона знакомого, а не кнопка «изучил» без XP.
        if (know && current && !counted.has(current.item_id) && checks) {
          const box = queue.querySelector(".check[data-item]");
          if (box && !box.classList.contains("done")) { e.preventDefault(); checks.answer(box, -1); return; }
        }
        if (current && counted.has(current.item_id)) { e.preventDefault(); next(); return; }
        if (!current && queue.querySelector("[data-rev-back]") && e.key === "Enter") {
          e.preventDefault();
          reviewView(host, ctx);
        }
      }
    };
    document.addEventListener("keydown", onKey);

    queue.innerHTML = '<div class="skel" style="height:180px"></div>';
    await fetchMore();
    if (stale()) return;
    next();
  }
}

function cardHtml(item, index, total) {
  return `<section class="check" data-card="${item.item_id}">
    <div class="ck-top">карточка${item.src ? ` · ${escapeHtml(item.src)}` : ""}
      <span class="ck-n">${index} из ${total}</span></div>
    <div class="ck-body">
      <p class="ck-q">${inline(item.front)}</p>
      <div data-back hidden><div class="explain">${inline(item.back)}</div></div>
      <div class="ck-row">
        <button class="btn primary" data-show type="button">показать ответ <span class="key">Enter</span></button>
      </div>
      <div class="ck-row" data-grades hidden>
        ${GRADES.map(([g, label], i) => `<button class="btn"
          data-grade="${g}" type="button">${label} <span class="key">${i + 1}</span></button>`).join("")}
      </div>
    </div>
  </section>`;
}

function bindCards(root, ctx, onGraded) {
  root.querySelectorAll("[data-card]").forEach((box) => {
    const show = box.querySelector("[data-show]");
    show?.addEventListener("click", () => {
      box.querySelector("[data-back]").hidden = false;
      box.querySelector("[data-grades]").hidden = false;
      show.parentElement.hidden = true;
    });
    box.querySelectorAll("[data-grade]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const buttons = [...box.querySelectorAll("[data-grade]")];
        buttons.forEach((b) => { b.disabled = true; });
        try {
          const res = await api.answerCard(Number(box.dataset.card), btn.dataset.grade);
          box.classList.add("done");
          if (res.xp) ctx.toast(`+${res.xp} XP`);
          if (res.contract_xp) setTimeout(() => ctx.toast(`+${res.contract_xp} XP, контракт дня закрыт`), 800);
          onGraded?.(btn.dataset.grade !== "again", Number(box.dataset.card));
        } catch (err) {
          // Сеть моргнула — оценки возвращаются, карточка не «сгорает».
          buttons.forEach((b) => { b.disabled = false; });
          ctx.toast(err.message);
        }
      }));
  });
}
