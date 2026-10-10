"use strict";

const $ = (id) => document.getElementById(id);

function escape(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

const LEVELS = ["база", "средняя", "сложная"];

function card(task) {
  const cls = task.status === "passed" ? "ok" : task.status === "issued" ? "work" : "";
  const cases = (task.hidden || [])
    .map((c) => `<li class="${c.ok ? "ok" : "bad"}">${escape(c.name)}</li>`)
    .join("");
  const hidden = cases
    ? `<div class="cases"><div class="hint">скрытые кейсы последнего прогона</div><ul>${cases}</ul></div>`
    : "";
  const where = task.dir_path
    ? `<div class="hint">папка решения: <code>${escape(task.dir_path)}</code></div>`
    : `<div class="hint">выдать: <code>arena task ${escape(task.node_code)}</code></div>`;
  return `
    <div class="panel task ${cls}">
      <div class="tags">
        <span class="tag">${escape(task.node_code)} ${escape(task.node_title)}</span>
        <span class="tag">${escape(LEVELS[task.difficulty] || "база")}</span>
        <span class="tag">${task.xp} XP</span>
        <span class="tag state">${escape(task.status_title)}</span>
      </div>
      <p class="question">${escape(task.title)}</p>
      ${where}
      ${task.checks ? `<div class="hint">проверок: ${task.checks}${task.last_message ? ", последняя: " + escape(task.last_message) : ""}</div>` : ""}
      ${hidden}
    </div>`;
}

(async function start() {
  const res = await fetch("/api/tasks");
  const data = await res.json();
  const tasks = data.tasks || [];
  $("total").textContent = tasks.length;
  $("passed").textContent = tasks.filter((t) => t.status === "passed").length;
  $("head").textContent = tasks.length
    ? "проверяются командой arena check"
    : "задач в банке пока нет";
  $("list").innerHTML = tasks.length
    ? tasks.map(card).join("")
    : `<div class="panel"><p class="question">Код-задач пока нет.</p>
       <div class="hint">Их кладёт в банк конвейер генерации, а руками засеяны только
       демо-задачи первых этапов: <code>arena import --code</code></div></div>`;
})();
