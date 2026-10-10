"use strict";

// Экран ТЗ. Точка монтирования, как у боя и гонки: вкладка в общем каркасе
// и отдельная страница /tz используют один и тот же код.
//
// Постановка это главное на экране, поэтому она рисуется целиком и сразу,
// а не прячется под кнопку. Ниже статус, разбор ревью, защита и разбор с ИИ.
(function () {
  const STATUS_WORD = {
    issued: "выдано",
    submitted: "на проверке",
    accepted: "принято",
    rework: "на доработку",
  };

  let root = null;
  let busy = false;
  let current = null;

  function esc(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  async function api(path, body, opts) {
    const init = body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {};
    const res = await fetch(path, Object.assign(init, opts || {}));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || res.statusText);
    return data;
  }

  /* ---------- разметка постановки ---------- */

  function inline(text) {
    return esc(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  }

  function markdown(src) {
    const out = [];
    let list = null;
    let fence = null;
    const closeList = () => {
      if (list) {
        out.push(`</${list}>`);
        list = null;
      }
    };
    (src || "").split("\n").forEach((line) => {
      if (line.trim().startsWith("```")) {
        if (fence === null) {
          closeList();
          fence = [];
        } else {
          out.push(`<pre class="snippet">${esc(fence.join("\n"))}</pre>`);
          fence = null;
        }
        return;
      }
      if (fence !== null) {
        fence.push(line);
        return;
      }
      const head = line.match(/^(#{1,4})\s+(.*)$/);
      if (head) {
        closeList();
        const level = Math.min(4, head[1].length + 1);
        out.push(`<h${level} class="spech">${inline(head[2])}</h${level}>`);
        return;
      }
      const bullet = line.match(/^\s*[-*]\s+(.*)$/);
      if (bullet) {
        if (list !== "ul") {
          closeList();
          out.push("<ul>");
          list = "ul";
        }
        out.push(`<li>${inline(bullet[1])}</li>`);
        return;
      }
      const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
      if (numbered) {
        if (list !== "ol") {
          closeList();
          out.push("<ol>");
          list = "ol";
        }
        out.push(`<li>${inline(numbered[1])}</li>`);
        return;
      }
      if (!line.trim()) {
        closeList();
        return;
      }
      if (list) {
        // Продолжение пункта списка на следующей строке.
        out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, " " + inline(line.trim()) + "</li>");
        return;
      }
      out.push(`<p>${inline(line.trim())}</p>`);
    });
    closeList();
    if (fence !== null) out.push(`<pre class="snippet">${esc(fence.join("\n"))}</pre>`);
    return out.join("\n");
  }

  /* ---------- экраны ---------- */

  function emptyScreen(board) {
    if (board.ready.length) {
      const stage = board.ready[0];
      const has = stage.bank > 0;
      return `
        <div class="panel bosshero">
          <div class="bosstag">ТЗ этапа ${stage.num}</div>
          <div class="bosstitle">${esc(stage.title)}</div>
          <div class="bossnote">
            ${service1.example.invalid
              ? "Гейт босса обойдён dev-флагом, это песочница. В боевом профиле ТЗ выдаётся только после взятого босса."
              : "Босс этапа взят, значит пора собрать из этого этапа проект в портфель."}
            Постановка в духе рабочей задачи, приёмка по скрытым тестам и код-ревью.
          </div>
          <button class="act big" id="tz-go" data-stage="${stage.num}" data-gen="${has ? 0 : 1}">
            ${has ? "получить ТЗ" : "подготовить постановку"}
          </button>
          ${has ? "" : '<div class="hint">постановку пишет модель, это пара минут</div>'}
        </div>`;
    }
    const next = board.next;
    return `
      <div class="panel bosshero locked">
        <div class="bosstag">ТЗ этапа</div>
        <div class="bosstitle">${next ? esc(next.title) : "пока нечего сдавать"}</div>
        <div class="bosslock">
          ${next
            ? `ТЗ выдаётся после взятого босса этапа ${next.num}. Нод закрыто ${next.closed} из ${next.need}`
            : "ТЗ появится, когда будет взят первый босс этапа"}
        </div>
        <div class="bossnote">
          Мини-проект этапа это то, что потом ляжет в портфель на GitHub.
          <a href="/github" target="_blank">как публиковать</a>
        </div>
      </div>`;
  }

  function headPanel(p) {
    const cls = p.status === "accepted" ? "ok" : p.status === "rework" ? "work" : "";
    return `
      <div class="panel tzhead ${cls}">
        <div class="tags">
          <span class="tag">этап ${p.stage_num}</span>
          <span class="tag state">${esc(STATUS_WORD[p.status] || p.status)}</span>
          ${p.checks ? `<span class="tag">сдач ${p.checks}</span>` : ""}
          ${p.xp ? `<span class="tag">+${p.xp} XP</span>` : ""}
        </div>
        <div class="bosstitle">${esc(p.title)}</div>
        ${p.dir_path ? `<div class="hint">папка проекта: <code>${esc(p.dir_path)}</code></div>` : ""}
        <div class="hint">
          сдавать из терминала: <code>arena tz submit</code>. Решение рядом с README.md,
          свои тесты в подпапке tests
        </div>
        ${p.status === "accepted"
          ? '<div class="hint">принято. Проект можно класть в портфель: <a href="/github" target="_blank">как опубликовать на GitHub</a></div>'
          : ""}
      </div>`;
  }

  function specPanel(p) {
    return `
      <div class="panel spec">
        <h2 class="block">постановка</h2>
        ${markdown(p.spec_md)}
      </div>`;
  }

  function runPanel(p) {
    const last = p.last_result;
    if (!last) return "";
    const cases = (last.hidden || [])
      .map((c) => `<li class="${c.ok ? "ok" : "bad"}">${esc(c.name)}</li>`)
      .join("");
    return `
      <div class="panel">
        <h2 class="block">последний прогон</h2>
        <div class="hint">
          твои тесты: ${last.tests_green} из ${last.tests_total}
          (${last.tests_files} файлов). ${esc(last.message || "")}
        </div>
        ${cases ? `<div class="cases"><div class="hint">скрытые случаи</div><ul>${cases}</ul></div>` : ""}
      </div>`;
  }

  function reviewPanel(p) {
    const r = p.review;
    if (!r) return "";
    const marks = (r.criteria || [])
      .map(
        (c) => `<li>
          <div class="dq">${esc(c.title)}<span class="score">${c.score} из 2</span></div>
          <div class="exp">${esc(c.comment)}</div>
        </li>`
      )
      .join("");
    const fixes = (r.fixes || [])
      .map(
        (f) => `<li>
          <div class="fixwhat">${esc(f.what)}</div>
          ${f.fix ? `<div class="exp">${esc(f.fix)}</div>` : ""}
          ${f.ref ? `<div class="hint">пункт ${esc(f.ref)}: ${esc(f.point)}</div>` : ""}
        </li>`
      )
      .join("");
    const advice = (r.advice || [])
      .map((a) => `<li>${esc(a.what)}</li>`)
      .join("");
    return `
      <div class="panel">
        <h2 class="block">ревью</h2>
        ${r.praise ? `<div class="bossnote ok">${esc(r.praise)}</div>` : ""}
        ${r.summary ? `<div class="exp">${esc(r.summary)}</div>` : ""}
        <ul class="defense">${marks}</ul>
        ${fixes ? `<h2 class="block">что поправить</h2><ol class="fixes">${fixes}</ol>` : ""}
        ${advice ? `<h2 class="block">на будущее, приёмке не мешает</h2><ul class="advice">${advice}</ul>` : ""}
      </div>`;
  }

  function defensePanel(p) {
    const d = p.defense;
    if (!d) return "";
    if (d.graded) {
      const g = d.grade;
      const rows = g.grades
        .map(
          (row) => `<li>
            <div class="dq">${esc(row.q)}</div>
            <div class="dmarks">
              <span class="score">${row.score} из 2</span>
              ${row.reason ? '<span class="tag ok">назвал причину</span>' : '<span class="tag">причина не названа</span>'}
              ${row.alternatives ? '<span class="tag ok">видит альтернативы</span>' : '<span class="tag">альтернатив не видно</span>'}
              ${row.edges ? '<span class="tag ok">помнит про границы</span>' : '<span class="tag">границы мимо</span>'}
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
          Проект принят, остался разговор про него. Два-три вопроса о твоих же решениях,
          отвечай словами, как объяснял бы коллеге. До 100 XP.
        </div>
        <div id="tz-defense-form">${fields}</div>
        <button class="act primary" id="tz-defense-send">сдать защиту</button>
        <div class="hint" id="tz-defense-note"></div>
      </div>`;
  }

  function notePanel(p) {
    if (p.status !== "accepted") return "";
    if (p.note) {
      return `
        <div class="panel">
          <h2 class="block">разобрал с ИИ</h2>
          <div class="exp">${esc(p.note.summary)}</div>
          <div class="bossnote">засчитано, +${p.note.xp} XP</div>
        </div>`;
    }
    return `
      <div class="panel">
        <h2 class="block">разобрал с ИИ</h2>
        <div class="bossnote">
          Разобрать проект с ИИ после сдачи можно и нужно. Напиши коротко, что понял,
          и это плюс 30 XP один раз на проект.
        </div>
        <textarea id="tz-note" rows="4" placeholder="что разобрал и что понял"></textarea>
        <button class="act" id="tz-note-send">засчитать разбор</button>
        <div class="hint" id="tz-note-hint"></div>
      </div>`;
  }

  function historyPanel(board, currentId) {
    const rest = board.projects.filter((p) => p.id !== currentId);
    if (!rest.length) return "";
    const rows = rest
      .map(
        (p) => `<li>
          <span>этап ${p.stage_num}: ${esc(p.title)}</span>
          <span class="res ${p.status === "accepted" ? "win" : "loss"}">${esc(STATUS_WORD[p.status] || p.status)}</span>
        </li>`
      )
      .join("");
    return `<div class="panel"><h2 class="block">другие проекты</h2><ul class="hist">${rows}</ul></div>`;
  }

  /* ---------- сборка ---------- */

  function paint(board) {
    const p = board.projects[0];
    current = p || null;
    if (!p) {
      root.innerHTML = emptyScreen(board);
    } else {
      root.innerHTML =
        headPanel(p) +
        reviewPanel(p) +
        runPanel(p) +
        defensePanel(p) +
        notePanel(p) +
        specPanel(p) +
        historyPanel(board, p.id);
    }
    wire(board);
  }

  function wire(board) {
    const go = document.getElementById("tz-go");
    if (go) {
      go.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        const stage = go.dataset.stage;
        const gen = go.dataset.gen === "1";
        go.disabled = true;
        go.textContent = gen ? "пишу постановку, это пара минут" : "выдаю";
        try {
          if (gen) await api(`/api/tz/stage/${stage}/gen`, {});
          await api(`/api/tz/stage/${stage}/start`, {});
          await render();
        } catch (err) {
          go.disabled = false;
          go.textContent = gen ? "подготовить постановку" : "получить ТЗ";
          say(err.message);
        } finally {
          busy = false;
        }
      });
    }
    const send = document.getElementById("tz-defense-send");
    if (send) send.addEventListener("click", () => sendDefense());
    const note = document.getElementById("tz-note-send");
    if (note) note.addEventListener("click", () => sendNote());
  }

  function say(text) {
    const box = document.getElementById("tz-defense-note") || document.getElementById("tz-note-hint");
    if (box) box.textContent = text;
    else if (window.arenaToast) window.arenaToast(text);
    else alert(text);
  }

  async function sendDefense() {
    const boxes = Array.from(document.querySelectorAll("#tz-defense-form textarea"));
    const answers = boxes.map((b) => b.value);
    const btn = document.getElementById("tz-defense-send");
    btn.disabled = true;
    btn.textContent = "оцениваю, это займёт минуту";
    try {
      const res = await api(`/api/defense/${current.defense.id}/submit`, { answers });
      if (!res.graded) {
        say(res.message || res.error || "оценить не вышло");
        btn.disabled = false;
        btn.textContent = "сдать защиту";
        return;
      }
      await render();
    } catch (err) {
      say(err.message);
      btn.disabled = false;
      btn.textContent = "сдать защиту";
    }
  }

  async function sendNote() {
    const area = document.getElementById("tz-note");
    try {
      await api(`/api/tz/${current.id}/note`, { summary: area.value });
      await render();
    } catch (err) {
      const hint = document.getElementById("tz-note-hint");
      if (hint) hint.textContent = err.message;
    }
  }

  async function render() {
    const board = await api("/api/tz");
    paint(board);
  }

  window.arenaTz = {
    mount(el) {
      root = el;
      render();
      return () => {
        current = null;
      };
    },
  };
})();
