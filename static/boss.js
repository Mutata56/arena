"use strict";

// Экран боя с боссом. Собран точкой монтирования, как экран «Сезон»:
// вкладка в общем каркасе и отдельная страница /boss используют один и тот же код.
//
// Главное отличие от ежедневной петли: во время боя нет мгновенной подсветки
// и объяснений. Это экзамен, итог сообщается один раз и целиком.
(function () {
  const RANK_WORD = {
    S: "безупречно",
    A: "уверенно",
    B: "сдано",
    C: "этап не сдан",
  };

  let timer = null;
  let poll = null;
  let root = null;
  let clock = { left: 0, scale: 1 };
  let stageNum = null;
  let busy = false;
  let fieldList = [];

  function esc(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  // Варианты «что выведет код» отличаются переносами строк, поэтому их нельзя
  // отдавать обычному div: он схлопнет пробелы и все варианты станут одинаковыми.
  function optClass(opts) {
    const raw = opts.map((o) => String(o));
    const collapsed = raw.map((o) => o.split(/\s+/).join(" ").trim());
    return raw.some((o) => o.includes("\n")) || new Set(collapsed).size < collapsed.length
      ? "out"
      : "";
  }

  async function api(path, body) {
    const opts = body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {};
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || res.statusText);
    return data;
  }

  const MONTHS_OF = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];

  function dateWords(iso) {
    const d = new Date(iso.slice(0, 10) + "T00:00:00");
    return `${d.getDate()} ${MONTHS_OF[d.getMonth()]}`;
  }

  function clock_text(sec) {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  /** Признак защиты. null значит «вопрос об этом не спрашивал» — такое вообще
      не показываем, а не рисуем серым «не видно»: раньше под вопросом «расскажи,
      как это работает» висело «альтернатив не видно», хотя альтернатив там
      никто и не просил. */
  function flagTag(value, yes, no) {
    if (value === null || value === undefined) return "";
    return value
      ? `<span class="tag ok">${yes}</span>`
      : `<span class="tag">${no}</span>`;
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function stopPoll() {
    if (poll) clearInterval(poll);
    poll = null;
  }

  /** Опрос состояния в код-части боя.

      Вопросы человек отвечает тут же на странице, и она про них знает. А код он
      сдаёт из терминала командой `arena check`, и узнать про это странице неоткуда:
      она так и висит с «ждёт», пока её не перезагрузят руками. Что и произошло —
      задача была давно зелёной, а на экране «ждёт» у обеих.

      Поэтому в код-части раз в пять секунд спрашиваем состояние и перерисовываем,
      если оно изменилось. В части с вопросами опрос не нужен: там всё в браузере. */
  function runPoll(s) {
    stopPoll();
    if (!s.running || s.running.status !== "code") return;
    const stamp = (st) => {
      const run = st.running || {};
      return JSON.stringify((run.code_items || []).map(
        (e) => [e.item_id, Boolean(e.ok), e.checks || 0])) + "|" + (run.status || "нет");
    };
    let seen = stamp(s);
    poll = setInterval(async () => {
      let next;
      try { next = await api(`/api/boss/stage/${stageNum}`); } catch { return; }
      if (stamp(next) === seen) return;
      stopPoll();
      render();
    }, 5000);
  }

  function runTimer(left, scale) {
    stopTimer();
    clock = { left, scale: scale || 1 };
    const paint = () => {
      const box = document.getElementById("boss-clock");
      if (!box) return stopTimer();
      box.textContent = clock_text(clock.left);
      box.classList.toggle("hot", clock.left <= 300);
    };
    paint();
    timer = setInterval(() => {
      clock.left -= clock.scale;
      if (clock.left <= 0) {
        clock.left = 0;
        stopTimer();
        render();
        return;
      }
      paint();
    }, 1000);
  }

  /* ---------- экраны ---------- */

  function gateScreen(s) {
    const st = s.stage;
    return `
      <div class="panel bosshero locked">
        <div class="bosstag">босс этапа ${st.num}</div>
        <div class="bosstitle">${esc(st.title)}</div>
        <div class="bosslock">закрыто нод ${st.closed} из ${st.total}, босс выходит на ${st.need}</div>
        <div class="bossnote">осталось закрыть нод: ${st.left}</div>
      </div>`;
  }

  function readyScreen(s) {
    const st = s.stage;
    const again = s.attempts > 0;
    return `
      <div class="panel bosshero">
        <div class="bosstag">${again ? "реванш" : "босс этапа"} ${st.num}</div>
        <div class="bosstitle">${esc(st.title)}</div>
        <div class="bossrules">
          <div><b>${s.quiz_count}</b><span>вопросов из банка этапа</span></div>
          <div><b>${Math.round(s.quiz_limit_sec / 60)}</b><span>минут у экрана</span></div>
          <div><b>${Math.round(s.code_limit_sec / 60)}</b><span>минут на код отдельно</span></div>
        </div>
        <div class="bossnote">
          Вопросы взвешены к темам, где ты мазал. Подсветки и объяснений во время боя
          не будет: итог целиком в конце. Ранги: S это чисто и быстро, A и B это сдано,
          C это разведка боем, и она тоже платит.
        </div>
        <button class="act big" id="boss-go">${again ? "взять реванш" : "войти в бой"}</button>
      </div>`;
  }

  function cooldownScreen(s) {
    const last = s.last;
    return `
      <div class="panel bosshero locked">
        <div class="bosstag">реванш этапа ${s.stage.num}</div>
        <div class="bosstitle">${esc(s.stage.title)}</div>
        <div class="bosslock">откроется через ${esc(s.cooldown_text)}</div>
        <div class="bossnote">
          Сутки нужны не для наказание, а чтобы реванш был подготовленным.
          Ниже лежит набор ровно по тем темам, которые бой и подсветил.
        </div>
      </div>
      ${last ? resultPanel(last, true) : ""}`;
  }

  function examScreen(s) {
    const run = s.running;
    const q = run.question || {};
    if (!q.item_id) {
      return `
        <div class="panel bossexam">
          <div class="examtop">
            <span class="examstep">вопросы кончились</span>
            <span class="clock" id="boss-clock">0:00</span>
          </div>
          <button class="act big" id="boss-finish">сдать бой</button>
        </div>`;
    }
    const snippet = q.code ? `<pre class="snippet">${esc(q.code)}</pre>` : "";
    return `
      <div class="panel bossexam">
        <div class="examtop">
          <span class="examstep">вопрос ${q.number} из ${q.total}</span>
          <span class="clock" id="boss-clock">0:00</span>
        </div>
        <div class="exambar"><i style="width:${Math.round((run.quiz_answered / run.quiz_total) * 100)}%"></i></div>
        ${q.topic ? `<div class="tags"><span class="tag">${esc(q.topic)}</span></div>` : ""}
        <p class="question">${esc(q.q)}</p>
        ${snippet}
        <div class="opts" id="boss-opts">
          ${q.opts
            .map(
              (opt, i) => `<button class="opt" data-i="${i}">
                <span class="mark">${i + 1}</span><span class="${optClass(q.opts)}">${esc(opt)}</span></button>`
            )
            .join("")}
        </div>
        <div class="hint">ответ засчитывается сразу и навсегда: переигровок на бою нет</div>
        <button class="ghost" id="boss-finish">сдать вариант как есть</button>
      </div>`;
  }

  function codeScreen(s) {
    const run = s.running;
    const items = run.code_items || [];
    const rows = items
      .map(
        (e) => `<li class="atom${e.ok ? " done" : ""}">
          <span class="tag">${esc(e.node_code)}</span>
          <span class="atext">${esc(e.title)}</span>
          <span class="astate">${e.ok ? "зелёная" : e.checks ? "красная" : "ждёт"}</span>
        </li>`
      )
      .join("");
    return `
      <div class="panel bossexam">
        <div class="examtop">
          <span class="examstep">код-часть, вопросы уже сданы</span>
          <span class="clock" id="boss-clock">0:00</span>
        </div>
        <div class="bossnote">Забери задачи в терминал и гоняй как обычно:</div>
        <pre class="snippet">arena task --boss
cd в папку задачи
arena check</pre>
        <ul class="atoms">${rows}</ul>
        <div class="hint">
          отчёт уходит в бой: обычный XP за код тут не платят, и нода этой сдачей не закрывается
        </div>
        <button class="ghost" id="boss-finish">сдать бой без остатка кода</button>
      </div>`;
  }

  function weakPanel(weak) {
    const topics = (weak && weak.topics) || [];
    const red = (weak && weak.code_red) || [];
    if (!topics.length && !red.length) {
      return '<div class="bossnote">ни одной проваленной темы. Так и запишем</div>';
    }
    const rows = topics
      .map(
        (t) => `<li><span>${esc(t.topic)}</span><b>${t.wrong} из ${t.asked}</b></li>`
      )
      .join("");
    return `
      <h2 class="block">карта дыр</h2>
      <ul class="weak">${rows}</ul>
      ${red.length ? `<div class="bossnote">код красным: ${esc(red.join(", "))}</div>` : ""}`;
  }

  function resultPanel(last, compact) {
    const rank = last.rank || "C";
    return `
      <div class="panel bossresult rank-${esc(rank)}">
        <div class="rankwrap">
          <div class="rankbig">${esc(rank)}</div>
          <div class="rankside">
            <div class="rankword">${esc(RANK_WORD[rank] || "")}</div>
            <div class="rankmeta">
              вопросы ${last.quiz_correct} из ${last.quiz_total}${
                last.code_total ? `, код ${last.code_green} из ${last.code_total}` : ""
              }
            </div>
            <div class="rankmeta">попытка ${last.attempt_no}, время ${clock_text(last.quiz_sec)}${
              last.code_total ? ` плюс ${clock_text(last.code_sec)} на код` : ""
            }</div>
          </div>
          <div class="rankxp">+${last.xp}<span>XP</span></div>
        </div>
        ${last.passed
          ? '<div class="bossnote ok">этап взят. Дальше ТЗ и следующий этап</div>'
          : '<div class="bossnote">это разведка боем: сто XP за карту своих дыр, и она ниже</div>'}
        ${compact ? "" : weakPanel(last.weak)}
      </div>`;
  }

  function minisetPanel(m) {
    if (!m) return "";
    const topics = m.topics.length ? m.topics.join(", ") : "по всему этапу";
    return `
      <div class="panel">
        <h2 class="block">набор к реваншу</h2>
        <div class="bossnote">Темы: ${esc(topics)}. Вопросов ${m.quiz_total},
          разобрано ${m.quiz_done}, карточек ${m.cards}. Разбор идёт по обычным ставкам,
          так что день до реванша не пустой.</div>
        <button class="act" id="boss-mini">${m.quiz_done >= m.quiz_total ? "пройти ещё раз" : "разобрать набор"}</button>
        <div id="mini-stage"></div>
      </div>`;
  }

  function defensePanel(d) {
    if (!d) return "";
    if (d.graded) {
      const g = d.grade;
      const rows = g.grades
        .map(
          (row) => `<li>
            <div class="dq">${esc(row.q)}</div>
            <div class="dmarks">
              <span class="score">${row.score} из 2</span>
              ${flagTag(row.reason, "назвал причину", "причина не названа")}
              ${flagTag(row.alternatives, "видит альтернативы", "альтернатив не видно")}
              ${flagTag(row.edges, "помнит про границы", "границы мимо")}
            </div>
            <div class="exp">${esc(row.comment)}</div>
          </li>`
        )
        .join("");
      return `
        <div class="panel">
          <h2 class="block">защита</h2>
          <div class="bossnote">Оценка ${g.score} из ${g.max}, начислено ${d.xp} XP.</div>
          <ul class="defense">${rows}</ul>
          <div class="exp">${esc(g.summary)}</div>
        </div>`;
    }
    const fields = d.questions
      .map(
        (q, i) => `<div class="dfield">
          <div class="dq">${i + 1}. ${esc(q.q)}</div>
          <div class="hint">${esc(q.hint || "")}</div>
          <textarea data-answer="${i}" rows="5" placeholder="своими словами"></textarea>
        </div>`
      )
      .join("");
    return `
      <div class="panel">
        <h2 class="block">защита</h2>
        <div class="bossnote">
          Два-три вопроса про твои же решения. Отвечай словами, как объяснял бы человеку.
          Оценка щадящая по тону и честная по сути, до ${100} XP.
        </div>
        <div id="defense-form">${fields}</div>
        <button class="act primary" id="defense-send">сдать защиту</button>
        <div class="hint" id="defense-note"></div>
      </div>`;
  }

  function reviewPanel(last) {
    if (!last || !last.defense) return "";
    if (last.review) {
      return `
        <div class="panel">
          <h2 class="block">разобрал с ИИ</h2>
          <div class="exp">${esc(last.review.summary)}</div>
          <div class="bossnote">засчитано, +${last.review.xp} XP</div>
        </div>`;
    }
    return `
      <div class="panel">
        <h2 class="block">разобрал с ИИ</h2>
        <div class="bossnote">
          Разбирать ошибки с ИИ после сдачи можно и нужно. Напиши коротко, что понял,
          и это плюс 30 XP один раз на бой.
        </div>
        <textarea id="review-note" rows="4" placeholder="что разобрал и что понял"></textarea>
        <button class="act" id="review-send">засчитать разбор</button>
        <div class="hint" id="review-hint"></div>
      </div>`;
  }

  // Полевой босс: настоящее собеседование. Платит одинаково, чем бы ни кончилось,
  // а анкета уходит в конвейер и возвращается вопросами по тем же темам.
  function fieldPanel() {
    const rows = fieldList
      .map(
        (f) => `<li>
          <span>${esc(f.place)}${f.failed.length ? `, поплыл на: ${esc(f.failed.join(", "))}` : ""}</span>
          <span class="res">${esc(dateWords(f.ts))}</span>
        </li>`
      )
      .join("");
    return `
      <div class="panel">
        <h2 class="block">полевой босс</h2>
        <div class="bossnote">
          Сходил на собеседование, отметь его здесь. Платит 500 XP независимо от того,
          чем кончилось: платим за поход. Темы, на которых ты поплыл, конвейер возьмёт
          в работу и вернёт их вопросами и карточками.
        </div>
        <div class="dfield">
          <div class="dq">где был</div>
          <input id="field-place" placeholder="компания или «телефонное»">
        </div>
        <div class="dfield">
          <div class="dq">что спрашивали</div>
          <textarea id="field-asked" rows="4" placeholder="по памяти, своими словами"></textarea>
        </div>
        <div class="dfield">
          <div class="dq">что завалил</div>
          <textarea id="field-failed" rows="3" placeholder="по теме на строку, можно через запятую"></textarea>
        </div>
        <div class="dfield">
          <div class="dq">чем кончилось</div>
          <input id="field-outcome" placeholder="необязательно">
        </div>
        <button class="act" id="field-send">отметить собеседование</button>
        <div class="hint" id="field-hint"></div>
        ${rows ? `<ul class="hist">${rows}</ul>` : ""}
      </div>`;
  }

  function historyPanel(s) {
    if (!s.history.length) return "";
    const rows = s.history
      .map(
        (h) => `<li>
          <span>попытка ${h.attempt_no}: вопросы ${h.quiz_correct} из ${h.quiz_total}</span>
          <span class="res ${h.passed ? "win" : "loss"}">${esc(h.rank || "")}</span>
        </li>`
      )
      .join("");
    return `<div class="panel"><h2 class="block">все бои этапа</h2><ul class="hist">${rows}</ul></div>`;
  }

  /* ---------- сборка ---------- */

  function paint(s) {
    const run = s.running;
    document.body.classList.toggle("in-exam", Boolean(run));
    let head = "";
    if (run && run.status === "quiz") head = examScreen(s);
    else if (run) head = codeScreen(s);
    else if (s.stage.total && !s.stage.ready) head = gateScreen(s);
    else if (s.cooldown.locked) head = cooldownScreen(s);
    else head = readyScreen(s);

    const tail = run
      ? ""
      : (s.last ? resultPanel(s.last, false) : "") +
        (s.last ? defensePanel(s.last.defense) : "") +
        (s.last ? reviewPanel(s.last) : "") +
        (s.last && s.last.miniset ? minisetPanel(s.last.miniset) : "") +
        historyPanel(s) +
        fieldPanel();
    root.innerHTML = head + tail;

    if (run) runTimer(run.left_sec, run.scale);
    else stopTimer();
    runPoll(s);
    wire(s);
  }

  function wire(s) {
    const go = document.getElementById("boss-go");
    if (go) {
      go.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        go.disabled = true;
        try {
          await api(`/api/boss/stage/${stageNum}/start`, {});
          await render();
        } catch (err) {
          go.disabled = false;
          note(err.message);
        } finally {
          busy = false;
        }
      });
    }
    document.querySelectorAll("#boss-opts .opt").forEach((btn) =>
      btn.addEventListener("click", () => sendAnswer(s, Number(btn.dataset.i)))
    );
    const fin = document.getElementById("boss-finish");
    if (fin) {
      fin.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        try {
          await api(`/api/boss/attempt/${s.running.id}/finish`, {});
          await render();
        } finally {
          busy = false;
        }
      });
    }
    const send = document.getElementById("defense-send");
    if (send) send.addEventListener("click", () => sendDefense(s));
    const review = document.getElementById("review-send");
    if (review) review.addEventListener("click", () => sendReview(s));
    const mini = document.getElementById("boss-mini");
    if (mini) mini.addEventListener("click", () => playMiniset(s.last.id));
    const walk = document.getElementById("field-send");
    if (walk) walk.addEventListener("click", sendField);
  }

  async function sendField() {
    const hint = document.getElementById("field-hint");
    const btn = document.getElementById("field-send");
    const body = {
      place: document.getElementById("field-place").value,
      asked: document.getElementById("field-asked").value,
      failed: document.getElementById("field-failed").value,
      outcome: document.getElementById("field-outcome").value,
    };
    btn.disabled = true;
    try {
      const res = await api("/api/field", body);
      if (window.arenaToast) window.arenaToast(`+${res.xp} XP за полевого босса`);
      await render();
    } catch (err) {
      btn.disabled = false;
      hint.textContent = err.message;
    }
  }

  function note(text) {
    const box = document.getElementById("defense-note") || document.getElementById("review-hint");
    if (box) box.textContent = text;
    else if (window.arenaToast) window.arenaToast(text);
  }

  async function sendAnswer(s, choice) {
    if (busy) return;
    busy = true;
    document.querySelectorAll("#boss-opts .opt").forEach((b) => (b.disabled = true));
    try {
      const res = await api(`/api/boss/attempt/${s.running.id}/answer`, {
        item_id: s.running.question.item_id,
        choice,
      });
      paint(res.state);
    } catch (err) {
      note(err.message);
      await render();
    } finally {
      busy = false;
    }
  }

  async function sendDefense(s) {
    const boxes = Array.from(document.querySelectorAll("#defense-form textarea"));
    const answers = boxes.map((b) => b.value);
    const btn = document.getElementById("defense-send");
    btn.disabled = true;
    btn.textContent = "оцениваю, это займёт минуту";
    try {
      const res = await api(`/api/defense/${s.last.defense.id}/submit`, { answers });
      if (!res.graded) {
        note(res.message || res.error || "оценить не вышло");
        btn.disabled = false;
        btn.textContent = "сдать защиту";
        return;
      }
      await render();
    } catch (err) {
      note(err.message);
      btn.disabled = false;
      btn.textContent = "сдать защиту";
    }
  }

  async function sendReview(s) {
    const area = document.getElementById("review-note");
    try {
      await api(`/api/boss/attempt/${s.last.id}/review`, { summary: area.value });
      await render();
    } catch (err) {
      const hint = document.getElementById("review-hint");
      if (hint) hint.textContent = err.message;
    }
  }

  async function playMiniset(bossId) {
    const box = document.getElementById("mini-stage");
    const data = await api(`/api/boss/attempt/${bossId}/miniset`);
    let i = 0;
    const step = () => {
      if (i >= data.quiz.length) {
        box.innerHTML = '<div class="bossnote ok">набор разобран. Реванш будет злее</div>';
        return;
      }
      const q = data.quiz[i];
      box.innerHTML = `
        <div class="minicard">
          <div class="tags"><span class="tag">${esc(q.topic || "вопрос")}</span>
            <span class="tag">${i + 1} из ${data.quiz.length}</span></div>
          <p class="question">${esc(q.q)}</p>
          ${q.code ? `<pre class="snippet">${esc(q.code)}</pre>` : ""}
          <div class="opts" id="mini-opts">
            ${q.opts
              .map(
                (opt, n) => `<button class="opt" data-i="${n}">
                  <span class="mark">${n + 1}</span><span>${esc(opt)}</span></button>`
              )
              .join("")}
          </div>
          <div id="mini-after"></div>
        </div>`;
      box.querySelectorAll("#mini-opts .opt").forEach((btn) =>
        btn.addEventListener("click", async () => {
          const choice = Number(btn.dataset.i);
          const res = await api("/api/quiz/answer", { item_id: q.item_id, choice });
          box.querySelectorAll("#mini-opts .opt").forEach((b) => {
            b.disabled = true;
            const n = Number(b.dataset.i);
            if (n === res.ans) b.classList.add("correct");
            else if (n === choice && !res.correct) b.classList.add("wrong");
          });
          document.getElementById("mini-after").innerHTML = `
            <div class="exp">${esc(res.exp)}</div>
            <button class="act" id="mini-next">дальше</button>`;
          document.getElementById("mini-next").addEventListener("click", () => {
            i += 1;
            step();
          });
        })
      );
    };
    step();
  }

  async function render() {
    if (stageNum === null) {
      const over = await api("/api/boss");
      stageNum = over.ready.length ? over.ready[0] : (over.next ? over.next.num : 1);
    }
    fieldList = (await api("/api/field")).items;
    const s = await api(`/api/boss/stage/${stageNum}`);
    const title = document.getElementById("boss-head");
    if (title) title.textContent = `этап ${s.stage.num}. ${s.stage.title}`;
    paint(s);
  }

  window.arenaBoss = {
    mount(el, stage) {
      root = el;
      stageNum = stage == null ? null : stage;
      render();
      return () => {
        stopTimer();
        stopPoll();
        document.body.classList.remove("in-exam");
      };
    },
  };
})();
