"use strict";

// Экран «Сезон». Собран точкой монтирования, чтобы заход с вкладками мог
// вставить его в общий каркас одной строкой, не переписывая разметку.
(function () {
  const KIND_WHO = {
    bot_node: "Опус",
    user_node: "Опус",
    season_start: "сезон",
    season_win: "сезон",
    season_loss: "сезон",
    season_abort: "сезон",
    vacation: "Опус",
    return: "Опус",
    user_ahead: "Опус",
    bot_ahead: "Опус",
    boost: "Опус",
  };

  const OUTCOME = { win: "твой", loss: "Опуса", aborted: "без счёта" };

  function esc(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  async function api(path, body) {
    const opts = body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {};
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }

  function bar(el, value, top) {
    const share = top > 0 ? Math.max(2, Math.min(100, Math.round((value / top) * 100))) : 2;
    el.style.setProperty("--p", share);
  }

  function scorePanel(board) {
    const s = board.season;
    if (!s) {
      const off = board.offseason || {};
      const b = board.bot || {};
      const u = board.user || {};
      const head = off.warmup ? "разминка перед гонкой" : "межсезонье";
      // В разминку показываем живой счёт: соперник существует с первого дня,
      // просто пока присматривается к темпу.
      const score = `
        <div class="scoreline">
          <div class="side"><b>${u.nodes || 0}</b><span>твои ноды</span></div>
          <div class="side"><b>${b.nodes || 0}</b><span>ноды Опуса</span></div>
        </div>
        <div class="note">твой темп ${(u.rate || 0).toFixed(2)} нод в день,
          его план ${(b.rate || 0).toFixed(2)}</div>`;
      return `
        <div class="panel">
          <div class="seasonhead"><div class="big">${head}</div></div>
          <div class="note">${esc(off.text || "")}</div>
          ${off.days_left ? `<div class="note">осталось дней: ${off.days_left}</div>` : ""}
          ${score}
        </div>`;
    }
    const ahead = s.user_xp >= s.bot_xp;
    return `
      <div class="panel">
        <div class="seasonhead">
          <div class="big">сезон ${s.num}</div>
          <div class="when">день ${s.day_num} из 14, до ${esc(s.end)}</div>
        </div>
        <div class="scoreline">
          <div class="side me">
            <div class="who">ты<small>нод закрыто ${s.user_nodes}</small></div>
            <div class="track" id="bar-me"><i></i></div>
            <div class="val">${s.user_xp}<em>XP</em></div>
          </div>
          <div class="side rival">
            <div class="who">Опус<small>нод закрыто ${s.bot_nodes}</small></div>
            <div class="track" id="bar-rival"><i></i></div>
            <div class="val">${s.bot_xp}<em>XP</em></div>
          </div>
        </div>
        <div class="note">счёт в XP. У Опуса это его ноды по твоей средней цене ноды:
          ${s.bot_nodes} на ${Math.round(s.avg_node_xp || 0)}</div>
        <div class="verdict${ahead ? "" : " behind"}">
          ${ahead
            ? "<b>счёт за тобой.</b> Держи так, сезон закроется сам"
            : "<b>счёт у Опуса.</b> Он считает только закрытые темы, а тебе платят ещё и за контракт"}
        </div>
      </div>`;
  }

  function statusPanel(board) {
    const bits = [];
    if (board.rollout) {
      bits.push(`<div class="note warm">${esc(board.rollout.text)}: сегодня ${board.rollout.quiz}
        вопросов и ${board.rollout.cards} карточек</div>`);
    }
    if (board.bot.on_vacation) {
      bits.push(`<div class="note">Опус взял паузу до ${esc(board.bot.vacation_until)}.
        ${esc(board.bot.vacation_reason || "")}</div>`);
    }
    if (!bits.length) return "";
    return `<div class="panel">${bits.join("")}</div>`;
  }

  function feedPanel(board) {
    if (!board.feed || !board.feed.length) return "";
    const rows = board.feed
      .map(
        (e) => `<li>
          <span class="when">${esc((e.ts || "").slice(5, 16).replace("T", " "))}</span>
          <span><span class="who">${esc(KIND_WHO[e.kind] || "Опус")}:</span> ${esc(e.text)}</span>
        </li>`
      )
      .join("");
    return `<div class="panel"><h2 class="block">лента гонки</h2><ul class="feed">${rows}</ul></div>`;
  }

  function historyPanel(board) {
    if (!board.history || !board.history.length) return "";
    const rows = board.history
      .map(
        (h) => `<li>
          <span>сезон ${h.num}: ${esc(h.summary || "")}</span>
          <span class="res ${esc(h.outcome)}">${esc(OUTCOME[h.outcome] || "")}</span>
        </li>`
      )
      .join("");
    return `<div class="panel"><h2 class="block">прошлые сезоны</h2><ul class="hist">${rows}</ul></div>`;
  }

  function checkpointPanel(cp) {
    if (!cp || !cp.due) return "";
    const b = cp.built;
    const bosses = b.bosses.length
      ? b.bosses.map((x) => `этап ${x.stage} ранг ${esc(x.rank)}`).join(", ")
      : "ещё впереди";
    const branches = cp.branches
      .map(
        (br) => `<button class="branch${br.selected ? " chosen" : ""}" data-months="${br.months}">
          <span>
            <span class="name">${esc(br.title)}</span>
            <span class="cost">по ${br.need_rate} ноды в день до финиша траектории</span>
          </span>
          <span class="pick">${br.selected ? "твой темп" : "выбрать"}</span>
        </button>`
      )
      .join("");
    return `
      <div class="panel">
        <div class="seasonhead"><div class="big">чекпоинт: день ${cp.day_num}</div></div>
        <div class="note">${esc(cp.lead_in)}</div>
        <div class="built">
          <div><b>${b.nodes_closed}</b><span>тем закрыто</span></div>
          <div><b>${b.xp_total}</b><span>XP всего</span></div>
          <div><b>${b.green_days}</b><span>зелёных дней</span></div>
          <div><b>${b.streak}</b><span>дней подряд</span></div>
          <div><b>${b.seasons_won}/${b.seasons_played}</b><span>сезонов взято</span></div>
          <div><b>${esc(bosses)}</b><span>боссы</span></div>
        </div>
      </div>
      <div class="panel">
        <h2 class="block">три ветки, все нормальные</h2>
        <div class="note">${esc(cp.frame)}</div>
        <div class="branches" id="branches">${branches}</div>
        <div class="note">${esc(cp.eta.text)}</div>
        <div class="note">Выбор двигает только срок. XP, история и сезоны остаются как есть.</div>
      </div>`;
  }

  async function render(root) {
    const [board, campaign] = await Promise.all([api("/api/season"), api("/api/campaign")]);
    const title = document.getElementById("season-title");
    if (title) {
      title.textContent = board.season ? `сезон ${board.season.num}` : "межсезонье";
    }
    root.innerHTML =
      checkpointPanel(campaign.checkpoint) +
      scorePanel(board) +
      statusPanel(board) +
      feedPanel(board) +
      historyPanel(board);

    if (board.season) {
      const top = Math.max(board.season.user_xp, board.season.bot_xp, 1);
      bar(document.getElementById("bar-me"), board.season.user_xp, top);
      bar(document.getElementById("bar-rival"), board.season.bot_xp, top);
    }
    const box = document.getElementById("branches");
    if (box) {
      box.querySelectorAll(".branch").forEach((btn) =>
        btn.addEventListener("click", async () => {
          await api("/api/campaign/branch", { months: Number(btn.dataset.months) });
          render(root);
        })
      );
    }
  }

  window.arenaSeason = {
    mount(root) {
      render(root);
      return () => {};
    },
  };
})();
