"use strict";

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const GRADES = [
  { key: "again", title: "снова", cls: "again" },
  { key: "hard", title: "трудно", cls: "" },
  { key: "good", title: "хорошо", cls: "" },
  { key: "easy", title: "легко", cls: "easy" },
];
const KIND_HINT = {
  "рукописная": "переписать код рукой на бумаге",
  "чтение JDK": "читаем исходники JDK",
  "тест": "проверочный блок по этапу",
  "повторение": "смешанный блок по пройденному",
  "проект": "задача крупнее обычной",
};

let today = null;
let current = null;
let locked = false;
let tab = "today";
let openStageNum = null;
let bossStage = null;

async function api(path, body) {
  const opts = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {};
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
}

function escape(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

// В карточках jcards разметка простая: **жирный**, *курсив* и `код`.
function markup(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/\n/g, "<br>");
}

function toast(text) {
  const box = $("toast");
  box.textContent = text;
  box.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove("show"), 1600);
}

function countUp(el, to) {
  const from = Number(el.textContent) || 0;
  if (from === to) return;
  const started = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - started) / 420);
    el.textContent = Math.round(from + (to - from) * k);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function paintHeader() {
  const c = today.contract;
  const node = today.node;
  $("where").textContent = node
    ? `этап ${node.stage_num}. ${node.stage_title}`
    : "роадмап пройден";
  $("node-title").textContent = node ? `${node.code} ${node.title}` : "";
  const link = $("note-link");
  if (node && node.obsidian_url) {
    link.href = node.obsidian_url;
    link.hidden = false;
  } else {
    link.hidden = true;
  }

  paintNodeLine();
  countUp($("xp-today"), today.xp.today);
  countUp($("xp-total"), today.xp.total);
  if (today.streak >= 2) {
    $("streak-box").hidden = false;
    $("streak").textContent = today.streak;
  }

  const bar = (barId, labelId, done, target) => {
    const pct = target ? Math.min(100, Math.round((done / target) * 100)) : 0;
    $(barId).querySelector("i").style.width = pct + "%";
    $(barId).classList.toggle("full", target > 0 && done >= target);
    $(labelId).textContent = target ? `${done} из ${target}` : "нет на сегодня";
  };
  bar("quiz-bar", "quiz-count", c.quiz_done, c.quiz_target);
  bar("cards-bar", "cards-count", c.cards_done, c.cards_target);
}

const GEN_BADGE = {
  running: '<span class="tag gen">наполняется</span>',
  pending: '<span class="tag gen">в очереди</span>',
  deferred: '<span class="tag gen">ждёт лимитов</span>',
};

function genBadge(n) {
  if (n.gen) return GEN_BADGE[n.gen] || "";
  if (!n.bank && n.status !== "closed") return '<span class="tag empty">материала нет</span>';
  return "";
}

async function paintGenLine() {
  const box = $("genline");
  try {
    const g = await api("/api/gen/now");
    const parts = [];
    if (g.running) {
      parts.push(`<span class="dot"></span>генератор пишет ${escape(g.running.title)}` +
        (g.running.node ? ` для ноды ${escape(g.running.node)}` : ""));
    }
    if (g.waiting) parts.push(`в очереди ${g.waiting}`);
    if (!parts.length && g.today.jobs) {
      parts.push(`генератор отдыхает, за сегодня сделал ${g.today.items} записей ` +
        `за ${g.today.minutes} минут`);
    }
    if (!parts.length && !g.worker) parts.push("генератор выключен");
    box.hidden = !parts.length;
    box.innerHTML = parts.join(", ");
  } catch (e) {
    box.hidden = true;
  }
}

let reviewQueue = [];

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function humanDate(iso) {
  const d = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d - today) / 86400000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "завтра";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} (через ${days} дн.)`;
}

async function paintReview() {
  const box = $("review-box");
  const p = await api("/api/review/plan");
  if (!p.closed_nodes) { box.hidden = true; return; }
  box.hidden = false;
  const when = p.forecast.length
    ? `дальше созреет: ${p.forecast.slice(0, 3)
        .map((f) => `${humanDate(f.date)} ${f.cards}`).join(", ")}`
    : "новых сроков пока нет: карточки появятся после первых повторов";
  box.innerHTML = `
    <h2>повторение пройденного</h2>
    <div class="nums">
      <div class="rev-cat" data-kind="cards" data-n="${p.cards_due}" title="пройти только созревшие карточки"><b>${p.cards_due}</b><span>карточек созрело</span></div>
      <div class="rev-cat" data-kind="weak" data-n="${p.weak}" title="пройти только вопросы с прошлым промахом"><b>${p.weak}</b><span>вопросов с промахом</span></div>
      <div class="rev-cat" data-kind="stale" data-n="${p.stale}" title="пройти только давно не попадавшиеся"><b>${p.stale}</b><span>давно не попадались</span></div>
      <div class="rev-cat" data-nav="map" data-n="${p.closed_nodes}" title="открыть карту закрытых нод"><b>${p.closed_nodes}</b><span>нод закрыто</span></div>
    </div>
    <div class="when">${escape(when)}</div>
    <div class="row">
      <button class="act primary" id="start-review" ${p.session ? "" : "disabled"}>
        повторить ${p.session} заданий</button>
    </div>`;
  const btn = $("start-review");
  if (btn && p.session) btn.addEventListener("click", () => startReview());
  // клик по счётчику → сессия ТОЛЬКО этой категории
  box.querySelectorAll(".rev-cat[data-kind]").forEach((el) => {
    if (+el.dataset.n > 0) {
      el.classList.add("clickable");
      el.addEventListener("click", () => startReview(el.dataset.kind, +el.dataset.n));
    }
  });
  // «нод закрыто» — не подборка заданий, а метрика → ведём на карту
  const navCell = box.querySelector(".rev-cat[data-nav]");
  if (navCell && +navCell.dataset.n > 0) {
    navCell.classList.add("clickable");
    navCell.addEventListener("click", () => showTab("map"));
  }
}

async function startReview(kind, limit) {
  const qs = new URLSearchParams({ limit: limit || 20 });
  if (kind) qs.set("kind", kind);
  const data = await api(`/api/review/queue?${qs}`);
  reviewQueue = data.items || [];
  if (!reviewQueue.length) { toast("повторять пока нечего"); return; }
  const label = { cards: "карточки", weak: "промахи", stale: "давние" }[kind] || "";
  toast(`сессия повторения${label ? ` (${label})` : ""}: ${reviewQueue.length} заданий`);
  nextReviewAtom();
}

function nextReviewAtom() {
  locked = false;
  const item = reviewQueue.shift();
  if (!item) {
    current = null;
    toast("повторение закончено");
    paintReview();
    nextAtom();
    return;
  }
  current = item;
  paintLeft();
  if (item.kind === "card") {
    cardFace(item);
  } else {
    quizCard({ ...item, source_title: item.why });
  }
}

function paintNodeLine() {
  const box = $("nodeline");
  const np = today.node_progress;
  const nxt = today.next_node;
  if (!np) { box.textContent = ""; return; }
  const tail = nxt ? ` Дальше: <b>${escape(nxt.code)} ${escape(nxt.title)}</b>.` : "";
  if (np.ready) {
    box.innerHTML = `<span class="ready">нода готова, закроется сама</span>.${tail}`;
    return;
  }
  const left = [];
  if (np.quiz && !np.quiz.ok) {
    const need = Math.max(0, np.quiz.need - np.quiz.correct);
    left.push(`верных ответов ещё ${need} из ${np.quiz.need}`);
  }
  if ((np.code_total || 0) > (np.code_green || 0)) {
    left.push(`код-задач сдать ${np.code_total - np.code_green}`);
  }
  if (np.self_mark) left.push("нужна самоотметка с конспектом на карте");
  box.innerHTML = (left.length ? `до закрытия ноды: <b>${left.join(", ")}</b>.` : "нода почти готова.") + tail;
}

async function paintLedger() {
  const rows = await api("/api/ledger?limit=6");
  document.querySelector(".ledger").hidden = rows.length === 0;
  $("ledger").innerHTML = rows
    .map((r) => `<li><span>${escape(r.title)}</span><b>+${r.amount}</b></li>`)
    .join("");
}

// В вопросах «что выведет код» варианты различаются только переносами строк и
// пробелами. Обычный div их съедает, и все четыре выглядят одинаково, поэтому
// такие варианты показываем как вывод программы: моно и с сохранением пробелов.
function optClass(opts) {
  const raw = opts.map((o) => String(o));
  const collapsed = raw.map((o) => o.split(/\s+/).join(" ").trim());
  const same = new Set(collapsed).size < collapsed.length;
  return raw.some((o) => o.includes("\n")) || same ? "out" : "";
}

function quizCard(item) {
  const lvl = item.lvl ? `<span class="tag lvl${item.lvl}">${item.lvl === 1 ? "средний" : "сложный"}</span>` : "";
  const snippet = item.code ? `<pre class="snippet">${escape(item.code)}</pre>` : "";
  stage.innerHTML = `
    <div class="panel">
      <div class="tags">
        <span class="tag">${escape(item.source_title || "вопрос")}</span>
        ${item.topic ? `<span class="tag">${escape(item.topic)}</span>` : ""}
        ${lvl}
      </div>
      <p class="question">${escape(item.q)}</p>
      ${snippet}
      <div class="opts" id="opts">
        ${item.opts
          .map(
            (opt, i) => `<button class="opt" data-i="${i}">
              <span class="mark">${i + 1}</span><span class="${optClass(item.opts)}">${escape(opt)}</span></button>`
          )
          .join("")}
      </div>
      <div id="after"></div>
      <div class="hint">клавиши 1-4 отвечают, <b>r</b> — знаю ответ, Enter идёт дальше</div>
    </div>`;
  document.querySelectorAll(".opt").forEach((btn) =>
    btn.addEventListener("click", () => answerQuiz(Number(btn.dataset.i)))
  );
}

async function answerQuiz(choice) {
  if (locked || !current) return;
  locked = true;
  const res = await api("/api/quiz/answer", { item_id: current.item_id, choice });
  document.querySelectorAll(".opt").forEach((btn) => {
    btn.disabled = true;
    const i = Number(btn.dataset.i);
    if (i === res.ans) btn.classList.add("correct");
    else if (i === choice && !res.correct) btn.classList.add("wrong");
  });
  $("after").innerHTML = `
    <div class="exp">${res.correct ? "<b>верно.</b> " : ""}${markup(res.exp)}</div>
    <div class="row">
      <button class="act primary" id="next">дальше<span class="key">Enter</span></button>
      <button class="ghost" id="bad">вопрос кривой, убрать его</button>
    </div>`;
  // Без обёртки браузер передаст сюда событие клика, а первый аргумент
  // nextAtom это force: петля навсегда осталась бы на вопросах.
  $("next").addEventListener("click", () =>
    reviewQueue.length ? nextReviewAtom() : nextAtom());
  $("bad").addEventListener("click", async () => {
    const dropped = await api(`/api/items/${current.item_id}/suspend`, {});
    toast("убрал из банка");
    if (dropped.contract_xp) {
      today = await api("/api/today");
      paintHeader();
      paintLedger();
      setTimeout(() => toast(`+${dropped.contract_xp} XP, контракт закрыт`), 1200);
    }
    nextAtom();
  });
  if (res.xp) toast(`+${res.xp} XP`);
  if (res.bonus) setTimeout(() => toast(`+${res.bonus} XP за блок`), 900);
  if (res.contract_xp) setTimeout(() => toast(`+${res.contract_xp} XP, контракт закрыт`), 1200);
  today = res.state;
  paintHeader();
  paintLedger();
  // Перерисовываем после ответа, а не после показа: промах оставляет вопрос
  // неотвеченным, и он обязан остаться в списке.
  paintLeft();
  paintReview();   // счётчики «повторения пройденного» пересчитываются после каждого ответа
}

function cardFace(item) {
  stage.innerHTML = `
    <div class="panel">
      <div class="tags">
        <span class="tag">карточка</span>
        ${item.is_new ? '<span class="tag">новая</span>' : ""}
      </div>
      <div class="cardface">${markup(item.front)}</div>
      <div class="cardsrc">${escape(item.src || "")}</div>
      <div id="reveal">
        <div class="row">
          <button class="act primary" id="show">вспомнил, показать ответ<span class="key">пробел</span></button>
        </div>
      </div>
      <div class="hint">сначала вспомни сам, потом проверь. Оценки 1-4</div>
      ${today.contract.quiz_target === 0
        ? '<div class="hint">вопросов по этой ноде в банке пока нет, поэтому сегодня день карточек</div>'
        : ""}
    </div>`;
  $("show").addEventListener("click", revealCard);
}

function revealCard() {
  if (!current) return;
  $("reveal").innerHTML = `
    <div class="cardback">${markup(current.back)}</div>
    <div class="row">
      ${GRADES.map(
        (g, i) =>
          `<button class="act ${g.cls}" data-grade="${g.key}">${g.title}<span class="key">${i + 1}</span></button>`
      ).join("")}
    </div>`;
  document.querySelectorAll("[data-grade]").forEach((btn) =>
    btn.addEventListener("click", () => gradeCard(btn.dataset.grade))
  );
}

async function gradeCard(grade) {
  if (locked || !current) return;
  locked = true;
  const res = await api("/api/cards/answer", { item_id: current.item_id, grade });
  if (res.xp) toast(`+${res.xp} XP`);
  if (res.contract_xp) setTimeout(() => toast(`+${res.contract_xp} XP, контракт закрыт`), 900);
  today = res.state;
  paintHeader();
  paintLedger();
  paintLeft();
  paintReview();   // счётчики «повторения пройденного» пересчитываются после каждого ответа
  if (reviewQueue.length) { nextReviewAtom(); return; }
  nextAtom();
}

// Что ещё не отвечено по ноде текущего задания. Нода берётся именно у атома на
// экране: поток отдаёт и вопросы пула этапа, и повторение, и тогда шапка с
// заданием говорят о разных нодах.
const LEFT_PLAYABLE = ["quiz", "card", "readcode", "code"];
const ATOM_WORDS = {
  quiz: "вопросы", card: "карточки", readcode: "чужой код", code: "код-задача",
};

async function paintLeft() {
  const box = $("left-box");
  const code = (current && current.node_code) || (today.node && today.node.code);
  if (!code) { box.hidden = true; return; }
  let node;
  try {
    node = await api(`/api/node/${code}`);
  } catch (err) {
    box.hidden = true;
    return;
  }
  const left = (node.atoms || []).filter(
    (a) => !a.done && !a.suspended && !(current && a.id === current.item_id)
  );
  const kinds = LEFT_PLAYABLE.filter((t) => left.some((a) => a.type === t));
  box.hidden = false;
  box.innerHTML = `
    <div class="lefttop">
      <h2>осталось по ноде</h2>
      ${left.length ? `<span class="count">${left.length}</span>` : ""}
    </div>
    <div class="sub">${escape(node.code)} ${escape(node.title)}</div>
    ${left.length === 0
      ? '<div class="empty">нету неотвеченных</div>'
      : `<ul>${left
          .map((a) => {
            const play = LEFT_PLAYABLE.includes(a.type);
            const tag = play ? "button" : "span";
            const hook = play ? ` data-play="${a.id}"` : "";
            return `<li><${tag} class="atom t-${a.type}${play ? "" : " flat"}"${hook}>
              <span class="dot"></span>
              <span class="what">${escape(a.title)}</span></${tag}></li>`;
          })
          .join("")}</ul>
        <div class="legend">${kinds
          .map((t) => `<span class="l-${t}"><i></i>${escape(ATOM_WORDS[t])}</span>`)
          .join("")}</div>`}`;
  bindPlayable(box);
}

async function doneScreen() {
  paintLeft();
  const np = today.node_progress;
  const nxt = today.next_node;
  let rest = "";
  if (today.node) {
    // Показать, что на ноде осталось взять руками: карточки сверх дневной нормы
    // новых и код-задача не приходят сами, но они никуда не делись.
    const node = await api(`/api/node/${today.node.code}`);
    const left = (node.atoms || []).filter((a) => !a.done && !a.suspended);
    if (left.length) {
      rest = `<h3>на этой ноде осталось</h3><ul class="atoms">${left.map(atomRow).join("")}</ul>`;
    }
  }
  const blocked = np && !np.ready
    ? `<div class="sub">Нода закроется, когда ${escape(np.why || "будет сделано остальное")}.</div>`
    : "";
  const after = nxt
    ? `<div class="sub">Дальше по карте: ${escape(nxt.code)} ${escape(nxt.title)}.</div>`
    : "";
  stage.innerHTML = `
    <div class="panel done">
      <div class="big">материал кончился</div>
      ${blocked}
      ${after}
      ${rest}
      <div class="sub">Дальше по роадмапу заданий пока нет: генератор наполнит следующие ноды,
        ночью или прямо сейчас командой <code>arena gen</code>.</div>
      <div class="row" style="justify-content:center">
        <button class="act" id="tomap">открыть карту</button>
      </div>
    </div>`;
  $("tomap").addEventListener("click", () => showTab("map"));
  bindPlayable(stage);
}

function bindPlayable(root) {
  // Вешать обработчики можно только после того, как разметка попала в документ.
  (root || document).querySelectorAll("[data-play]").forEach((el) => {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", () => playAtom(Number(el.dataset.play)));
  });
}

async function playAtom(itemId) {
  // Явный выбор атома с экрана ноды: показываем его на вкладке «сегодня».
  const item = await api(`/api/item/${itemId}`);
  showTab("today");
  locked = false;
  current = item;
  paintLeft();
  if (item.kind === "card") {
    cardFace(item);
    return;
  }
  if (item.kind === "code") {
    stage.innerHTML = `
      <div class="panel">
        <div class="tags"><span class="tag">код-задача</span></div>
        <div class="cardface">${escape(item.title)}</div>
        <div class="exp">Эта задача решается в терминале: команда выдаёт её в портфель,
          ты пишешь код в файле и проверяешь его второй командой.</div>
        <pre class="snippet">${escape(item.command)}
arena check</pre>
        <div class="row"><button class="act primary" id="back-to-day">вернуться к занятию</button></div>
      </div>`;
    $("back-to-day").addEventListener("click", () => nextAtom());
    return;
  }
  quizCard(item);
}

async function nextAtom() {
  // Очередь целиком на стороне сервера: сначала материал текущей ноды,
  // потом пул этапа, потом повторение, а карточки вклиниваются каждым пятым.
  locked = false;
  current = null;
  const item = await api("/api/next");
  if (!item.item_id) {
    await doneScreen();
    return;
  }
  if (item.node_code && today.node && item.node_code !== today.node.code) {
    // Поток сам взял в работу следующую ноду: шапка должна показать её.
    today = await api("/api/today");
    paintHeader();
    toast(`дальше нода ${item.node_code}`);
  }
  current = item;
  paintLeft();
  if (item.kind === "card") {
    cardFace(item);
    return;
  }
  quizCard(item);
}

/* ---------- карта ---------- */

function stageCard(s) {
  const track = s.in_track
    ? '<span class="tag track">траектория</span>'
    : '<span class="tag">необязательная ветка</span>';
  const state = s.done
    ? '<span class="tag ok">этап пройден</span>'
    : s.locked
      ? '<span class="tag">заперт</span>'
      : s.boss_ready
        ? '<span class="tag gold">босс ждёт</span>'
        : "";
  const pct = s.total ? Math.min(100, (s.closed / s.total) * 100) : 0;
  return `
    <button class="stagecard${s.current ? " here" : ""}${s.locked ? " off" : ""}" data-stage="${s.num}">
      <div class="tags">${track}${state}${s.current ? '<span class="tag here">ты здесь</span>' : ""}</div>
      <div class="stagename">этап ${s.num}. ${escape(s.title)}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="stagemeta">${s.closed} из ${s.total} нод${
        s.total && !s.done ? `, босс на ${s.boss_at}` : ""
      }</div>
    </button>`;
}

async function renderMap() {
  const data = await api("/api/map");
  const eta = data.eta.ready
    ? `<b>${escape(data.eta.text)}</b>`
    : escape(data.eta.text);
  $("view-map").innerHTML = `
    <div class="panel eta">
      <div>${eta}</div>
      <div class="sub">собесный минимум: ${data.track.closed} из ${data.track.total} нод</div>
    </div>
    <div class="stages" id="stages">${data.stages.map(stageCard).join("")}</div>`;
  document.querySelectorAll("[data-stage]").forEach((btn) =>
    btn.addEventListener("click", () => openStage(Number(btn.dataset.stage)))
  );
  if (openStageNum) {
    const num = openStageNum;
    openStageNum = null;
    openStage(num);
  }
}

const NODE_STATE = {
  locked: "заперта",
  available: "открыта",
  in_progress: "в работе",
  closed: "закрыта",
};

function bossRow(data) {
  const b = data.boss || {};
  if (b.passed) return '<div class="hint">босс этапа взят</div>';
  if (b.ready) {
    return `<div class="row"><button class="act" id="to-boss">босс ждёт, войти в бой</button></div>`;
  }
  return `<div class="hint">босс выходит, когда закрыто нод ${b.need}, сейчас ${b.closed}</div>`;
}

async function openStage(num) {
  const data = await api(`/api/map/stage/${num}`);
  $("view-map").innerHTML = `
    <div class="panel">
      <button class="ghost" id="back">назад к карте</button>
      <div class="stagename big">этап ${data.num}. ${escape(data.title)}</div>
      <div class="tags">${
        data.in_track
          ? '<span class="tag track">траектория</span>'
          : '<span class="tag">необязательная ветка</span>'
      }</div>
      ${bossRow(data)}
      <ul class="nodelist">
        ${data.nodes
          .map(
            (n) => `<li class="noderow ${n.status}" data-node="${escape(n.code)}">
              <span class="code">${escape(n.code)}</span>
              <span class="nname">${escape(n.title)}</span>
              <span class="tag">${escape(n.kind)}</span>
              ${genBadge(n)}
              <span class="nstate">${NODE_STATE[n.status] || n.status}</span>
            </li>`
          )
          .join("")}
      </ul>
    </div>`;
  $("back").addEventListener("click", renderMap);
  if ($("to-boss")) {
    $("to-boss").addEventListener("click", () => {
      bossStage = num;
      showTab("boss");
    });
  }
  document.querySelectorAll("[data-node]").forEach((row) =>
    row.addEventListener("click", () => {
      openStageNum = num;
      openNode(row.dataset.node);
    })
  );
}

function atomRow(a) {
  const playable = !a.suspended && ["quiz", "readcode", "card", "code"].includes(a.type);
  return `<li class="atom${a.done ? " done" : ""}${a.suspended ? " off" : ""}"
    ${playable ? `data-play="${a.id}" title="взять в работу"` : ""}>
    <span class="tag">${escape(a.type_title)}</span>
    <span class="atext">${escape(a.title)}</span>
    <span class="astate ${a.suspended ? "off" : a.done ? "done" : "take"}">${
      a.suspended ? "снят" : a.done ? "готово" : "взять"}</span>
  </li>`;
}

async function openNode(code) {
  const n = await api(`/api/node/${code}`);
  const hint = KIND_HINT[n.kind] ? `<div class="hint">${KIND_HINT[n.kind]}</div>` : "";
  const link = n.obsidian_url
    ? `<a class="notelink" href="${escape(n.obsidian_url)}">открыть конспект в Obsidian</a>`
    : '<div class="hint">конспекта по этой ноде ещё нет: его напишет ночная генерация</div>';
  const atomsHtml = n.atoms.length
    ? `<ul class="atoms">${n.atoms.map(atomRow).join("")}</ul>`
    : '<div class="empty">своего материала у ноды пока нет</div>';
  const pool = n.stage_pool
    ? `<div class="hint">плюс общий пул этапа: ${n.stage_pool} вопросов</div>`
    : "";

  $("view-map").innerHTML = `
    <div class="panel">
      <button class="ghost" id="back">назад к этапу</button>
      <div class="tags">
        <span class="tag">этап ${n.stage_num}. ${escape(n.stage_title)}</span>
        <span class="tag">${escape(n.kind)}</span>
        <span class="tag ${n.status === "closed" ? "ok" : ""}">${NODE_STATE[n.status] || n.status}</span>
      </div>
      <div class="stagename big">${escape(n.code)} ${escape(n.title)}</div>
      ${n.descr ? `<p class="ndescr">${escape(n.descr)}</p>` : ""}
      ${hint}
      ${link}
      <h3>атомы ноды</h3>
      ${atomsHtml}
      ${pool}
      <div id="nodeact"></div>
    </div>`;
  $("back").addEventListener("click", () => openStage(n.stage_num));
  bindPlayable();
  renderNodeActions(n);
}

function renderNodeActions(n) {
  const box = $("nodeact");
  if (n.status === "closed") {
    box.innerHTML = `
      <div class="closed-note">
        <div class="sub">закрыта ${escape((n.closed_at || "").slice(0, 10))}${
          n.closed_by === "note_empty" ? ", по конспекту, банк был пуст" : ""
        }${n.closed_by === "note" ? ", по конспекту" : ""}${
          n.closed_by === "known" ? ", отмечена как знакомая" : ""}</div>
        ${n.close_note ? `<div class="exp">${markup(n.close_note)}</div>` : ""}
      </div>`;
    return;
  }
  if (n.status === "locked") {
    box.innerHTML = '<div class="hint">нода откроется, когда дойдёшь до неё по этапу</div>';
    return;
  }

  const enterBtn = n.status === "available"
    ? '<button class="act primary" id="enter">взяться за ноду</button>'
    : "";
  if (n.close.mode === "atoms") {
    box.innerHTML = `
      <div class="row">${enterBtn}</div>
      <div class="hint">${escape(n.close.hint)}</div>`;
  } else {
    box.innerHTML = `
      <div class="row">${enterBtn}</div>
      <div class="selfmark">
        <h3>закрыть ноду</h3>
        <div class="hint">${escape(n.close.hint)}</div>
        <textarea id="note" rows="6" placeholder="что понял, своими словами"></textarea>
        <div class="row">
          <button class="act primary" id="close-node" disabled>закрыть ноду, +100 XP</button>
          <span class="counter-note" id="notelen"></span>
        </div>
      </div>`;
    const area = $("note");
    const btn = $("close-node");
    const len = $("notelen");
    const update = () => {
      const left = n.close.note_min - area.value.trim().length;
      btn.disabled = left > 0;
      len.textContent = left > 0 ? `ещё ${left} символов` : "можно закрывать";
    };
    area.addEventListener("input", update);
    update();
    btn.addEventListener("click", () => closeNode(n, area.value));
  }
  if ($("enter")) $("enter").addEventListener("click", () => enterNode(n.code));
}

async function enterNode(code) {
  const res = await api(`/api/node/${code}/enter`, {});
  today = res.state;
  paintHeader();
  toast("нода в работе");
  if (res.contract_xp) {
    paintLedger();
    setTimeout(() => toast(`+${res.contract_xp} XP, контракт закрыт`), 1700);
  }
  openNode(code);
}

async function closeNode(n, note) {
  let res;
  try {
    res = await api(`/api/node/${n.code}/close`, { note });
  } catch (err) {
    toast(err.message);
    return;
  }
  today = res.state;
  paintHeader();
  paintLedger();
  toast(`+${res.xp} XP, нода закрыта`);
  if (res.contract_xp) {
    setTimeout(() => toast(`+${res.contract_xp} XP, контракт закрыт`), 1700);
  } else if (res.opened_stages && res.opened_stages.length) {
    setTimeout(() => toast(`открылся этап ${res.opened_stages.join(", ")}`), 1700);
  }
  openNode(n.code);
}

/* ---------- лента и статистика ---------- */

async function renderFeed() {
  const days = await api("/api/feed");
  if (!days.length) {
    $("view-feed").innerHTML = `
      <div class="panel empty-day">
        <div class="big">лента пустая</div>
        <div class="sub">пройди контракт, и первый день появится здесь</div>
      </div>`;
    return;
  }
  $("view-feed").innerHTML = days
    .map(
      (d) => `
      <div class="panel day">
        <div class="dayhead">
          <span class="daylabel">${escape(d.label)}${
            d.green ? '<span class="dot"></span>' : ""
          }</span>
          <span class="dayxp">${d.xp} XP</span>
        </div>
        <ul class="events">
          ${d.events
            .map(
              (e) => `<li class="ev ${escape(e.kind)}">
                <span>${escape(e.text)}</span>
                ${e.xp ? `<b>+${e.xp}</b>` : ""}
              </li>`
            )
            .join("")}
        </ul>
      </div>`
    )
    .join("");
}

const MONTHS_OF = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function dayLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${MONTHS_OF[d.getMonth()]}`;
}

// График XP по дням. День без занятий это пустое место, а не красный столбик:
// продукт показывает сделанное и не считает несделанное.
function xpChart(days) {
  const W = 720;
  const H = 150;
  const max = Math.max(...days.map((d) => d.xp), 1);
  const step = W / days.length;
  const bars = days
    .map((d, i) => {
      if (!d.xp) return "";
      const h = Math.max(2, Math.round((d.xp / max) * (H - 20)));
      const x = Math.round(i * step) + 1;
      const w = Math.max(3, Math.round(step) - 2);
      return `<rect class="xpbar${d.green ? " green" : ""}" x="${x}" y="${H - h}"
        width="${w}" height="${h}"><title>${dayLabel(d.date)}: ${d.xp} XP</title></rect>`;
    })
    .join("");
  const first = days[0];
  const last = days[days.length - 1];
  const best = days.reduce((a, b) => (b.xp > a.xp ? b : a), days[0]);
  const middle = best.xp
    ? `лучший день: ${best.xp} XP`
    : "первые столбики появятся после первого занятия";
  return `
    <div class="panel">
      <h2 class="block">XP по дням</h2>
      <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <line class="axis" x1="0" y1="${H - 0.5}" x2="${W}" y2="${H - 0.5}"></line>
        ${bars}
      </svg>
      <div class="chartfoot">
        <span>${escape(dayLabel(first.date))}</span>
        <span>${escape(middle)}</span>
        <span>${escape(dayLabel(last.date))}</span>
      </div>
    </div>`;
}

// Теплокарта. Пустой день не подсвечен ничем: ни красным, ни счётчиком.
function heatmap(heat) {
  const cells = heat.weeks
    .map((week) => {
      const column = week
        .map((cell) => {
          if (!cell) return '<i class="heat none"></i>';
          const parts = [];
          if (cell.quiz) parts.push(`вопросов ${cell.quiz}`);
          if (cell.cards) parts.push(`карточек ${cell.cards}`);
          if (cell.code) parts.push(`задач ${cell.code}`);
          if (cell.nodes) parts.push(`нод закрыто ${cell.nodes}`);
          const tail = parts.length ? `: ${parts.join(", ")}` : "";
          return `<i class="heat lvl${cell.level}${cell.green ? " green" : ""}"
            title="${escape(dayLabel(cell.date) + tail)}"></i>`;
        })
        .join("");
      return `<div class="heatweek">${column}</div>`;
    })
    .join("");
  return `
    <div class="panel">
      <h2 class="block">когда занимался</h2>
      <div class="heatwrap">
        <div class="heatdays"><span>пн</span><span>ср</span><span>пт</span></div>
        <div class="heatgrid">${cells}</div>
      </div>
      <div class="chartfoot">
        <span>${escape(dayLabel(heat.from))}</span>
        <span>дней с занятиями: ${heat.busy_days}</span>
        <span>${escape(dayLabel(heat.to))}</span>
      </div>
    </div>`;
}

function topicsPanel(rows) {
  if (!rows.length) return "";
  const list = rows
    .map(
      (t) => `<li>
        <span class="tname">${escape(t.topic)}</span>
        <span class="tbar"><i style="width:${Math.round((t.right / t.total) * 100)}%"></i></span>
        <b>${t.right} из ${t.total}</b>
      </li>`
    )
    .join("");
  return `
    <div class="panel">
      <h2 class="block">точность по темам</h2>
      <div class="hint">верных ответов из отвеченных. Сверху то, где чаще мажешь: туда и целится генератор</div>
      <ul class="topics">${list}</ul>
    </div>`;
}

const SEASON_WORD = { win: "сезон за тобой", loss: "сезон за Опусом", aborted: "без счёта" };

function seasonsPanel(rows) {
  if (!rows.length) return "";
  const list = rows
    .map(
      (s) => `<li>
        <span>сезон ${s.num}</span>
        <span class="sscore">${s.outcome === "aborted" ? "" : `ты ${s.user_xp}, Опус ${s.bot_xp}`}</span>
        <span class="res ${s.outcome === "win" ? "win" : "loss"}">${SEASON_WORD[s.outcome] || ""}</span>
      </li>`
    )
    .join("");
  return `<div class="panel"><h2 class="block">сезоны</h2><ul class="hist">${list}</ul></div>`;
}

function bossesPanel(rows, field) {
  if (!rows.length && !field.length) return "";
  const bosses = rows
    .map(
      (b) => `<li>
        <span>этап ${b.stage_num}, попытка ${b.attempt_no}: вопросы ${b.quiz_correct} из ${b.quiz_total}${
          b.code_total ? `, код ${b.code_green} из ${b.code_total}` : ""
        }</span>
        <span class="res ${b.passed ? "win" : "loss"}">${escape(b.rank || "")}</span>
        <b>+${b.xp}</b>
      </li>`
    )
    .join("");
  const walks = field
    .map(
      (f) => `<li>
        <span>${escape(f.place)}${f.failed.length ? `, поплыл на: ${escape(f.failed.join(", "))}` : ""}</span>
        <span class="sscore">${escape(dayLabel(f.ts.slice(0, 10)))}</span>
        <b>+${f.xp}</b>
      </li>`
    )
    .join("");
  return `
    <div class="panel">
      <h2 class="block">бои</h2>
      ${bosses ? `<ul class="hist">${bosses}</ul>` : '<div class="hint">боссов пока не было</div>'}
      ${walks ? `<h2 class="block">собеседования</h2><ul class="hist">${walks}</ul>` : ""}
    </div>`;
}

async function renderStats() {
  const s = await api("/api/stats");
  // Считаем в штуках, а не в долях: доли в этом продукте наружу не выходят.
  const acc = s.quiz_answered
    ? `верных ответов ${s.quiz_right} из ${s.quiz_answered}`
    : "ответов пока не было";
  const tile = (value, label) => `<div class="tile"><b>${value}</b><span>${label}</span></div>`;
  $("view-stats").innerHTML = `
    <div class="panel">
      <div class="tiles">
        ${tile(s.xp_total, "XP всего")}
        ${tile(s.nodes_closed, "нод закрыто")}
        ${tile(s.green_days, "зелёных дней")}
        ${tile(s.streak, "дней подряд")}
        ${tile(s.cards_reviewed, "повторов карточек")}
        ${tile(s.quiz_answered, "ответов на вопросы")}
        ${s.code_done ? tile(s.code_done, "задач сдано") : ""}
        ${s.tz_accepted ? tile(s.tz_accepted, "ТЗ принято") : ""}
      </div>
      <div class="sub">${escape(acc)}. Собесный минимум: ${s.track.closed} из ${s.track.total} нод</div>
    </div>
    ${xpChart(s.chart)}
    ${heatmap(s.heat)}
    ${topicsPanel(s.topics)}
    ${seasonsPanel(s.seasons)}
    ${bossesPanel(s.bosses, s.field)}`;
}

/* ---------- внешний подвиг ---------- */

async function paintDeed() {
  const box = $("deed-box");
  const state = await api("/api/deed/javarush");
  box.hidden = false;
  $("deed-btn").disabled = state.left <= 0;
  $("deed-btn").textContent = state.left > 0 ? `засчитать, +${state.xp} XP` : "на сегодня хватит";
  $("deed-left").textContent = state.done
    ? `сегодня зачтено ${state.done} из ${state.limit}`
    : "JavaRush и всё, что ты решал сегодня не здесь";
}

async function markDeed() {
  try {
    const res = await api("/api/deed/javarush", {});
    toast(`+${res.gained} XP за внешний подвиг`);
    today = await api("/api/today");
    paintHeader();
    await paintLedger();
  } catch (err) {
    toast(err.message);
  }
  paintDeed();
}

/* ---------- вкладки ---------- */

const TABS = ["today", "map", "boss", "tz", "season", "feed", "stats"];
// Экраны боя и гонки собраны точками монтирования (boss.js и season.js).
// Их надо не только вставить, но и снять: у боя тикает таймер, и уходя
// со вкладки его нужно остановить.
const mounted = {};

function unmount(name) {
  if (mounted[name]) {
    mounted[name]();
    delete mounted[name];
  }
}

function showTab(name) {
  if (!TABS.includes(name)) name = "today";
  if (tab !== name) unmount(tab);
  tab = name;
  if (location.hash.slice(1) !== name) location.hash = name;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  TABS.forEach((t) => {
    $("view-" + t).hidden = t !== name;
  });
  document.querySelector(".bars").hidden = name !== "today";
  if (name === "map") renderMap();
  if (name === "feed") renderFeed();
  if (name === "stats") renderStats();
  if (name === "boss" && window.arenaBoss) {
    mounted.boss = window.arenaBoss.mount($("view-boss"), bossStage);
    bossStage = null;
  }
  if (name === "tz" && window.arenaTz) {
    mounted.tz = window.arenaTz.mount($("view-tz"));
  }
  if (name === "season" && window.arenaSeason) {
    mounted.season = window.arenaSeason.mount($("view-season"));
  }
}

// Экранам, которые живут в своих файлах, нужен общий способ сказать слово вслух.
window.arenaToast = toast;

document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => showTab(btn.dataset.tab))
);

document.addEventListener("keydown", (e) => {
  const el = e.target;
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return;
  if (tab !== "today") return;
  // ⌘/⌃/⌥-комбинации (в т.ч. ⌘⇧R hard reload от skhd) — НЕ наши хоткеи ответов,
  // иначе ⌘X «отвечал» на вопрос перед перезагрузкой.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Enter") {
    const next = $("next") || $("more");
    if (next) { e.preventDefault(); next.click(); }
    return;
  }
  if (e.code === "Space" && $("show")) { e.preventDefault(); $("show").click(); return; }
  // r — «знаю»: на вопросе засчитывает верно и раскрывает ответ; повторное r — дальше.
  // e.code (не e.key) — работает в любой раскладке (лат r и рус к на одной клавише).
  if (e.code === "KeyR") {
    if (current && current.opts && !locked) { e.preventDefault(); answerQuiz(-1); return; }
    const nx = $("next");
    if (nx) { e.preventDefault(); nx.click(); }
    return;
  }
  const n = Number(e.key);
  if (!n || n < 1 || n > 4) return;
  if (current && current.opts && !locked) { answerQuiz(n - 1); return; }
  const grades = document.querySelectorAll("[data-grade]");
  if (grades.length >= n) grades[n - 1].click();
});

window.addEventListener("hashchange", () => {
  const name = location.hash.slice(1);
  if (name !== tab) showTab(name);
});

$("deed-btn").addEventListener("click", markDeed);

(async function start() {
  today = await api("/api/today");
  paintHeader();
  paintGenLine();
  paintReview();
  setInterval(paintGenLine, 20000);
  await paintLedger();
  await paintDeed();
  await nextAtom();
  // Ссылку на конкретную вкладку можно положить в закладки: /#map открывает карту.
  const wanted = location.hash.slice(1);
  if (wanted && wanted !== "today") showTab(wanted);
})();
