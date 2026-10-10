/* Экран код-задачи: решать и сдавать не выходя из браузера.

   Раскладка привычная: слева проект, в центре код, справа условие, видимые тесты
   и результат прогона. Кнопка «проверить» гоняет ровно то же, что `arena check`
   в терминале, тем же кодом в той же песочнице. Отладчика нет намеренно:
   он тут не нужен, а сделать его честно нельзя.

   Черновик решения лежит в localStorage: закрыл вкладку — код на месте. */

import api from "./api.js";
import { parseNote, renderBlocks, escapeHtml, escapeAttr } from "./md.js";

const DRAFT = (id) => `arena.site.draft.${id}`;

const ICO = {
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
  test: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 3h6M10 3v6.5L5.5 18a2 2 0 0 0 1.8 3h9.4a2 2 0 0 0 1.8-3L14 9.5V3"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 4.5v15l12-7.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 12.5 5 5L20 6.5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M19 12H6M11 6l-6 6 6 6"/></svg>',
};

const sec = (n) => `${Math.round((Number(n) || 0) * 100) / 100}s`;

const JAVAC_ERR = /^(?:.*[/\\])?([\w$]+\.java):(\d+):\s*(?:error|ошибка):\s*(.*)$/gm;

let handle = null;   // активный редактор

export function teardown() {
  handle?.destroy?.();
  handle = null;
}

export async function taskView(host, itemId, ctx, from) {
  teardown();
  host.innerHTML = `<div class="ide"><div class="ide-top"></div>
    <div class="ide-grid"><div class="ide-files skel"></div>
    <div class="ide-main skel"></div><div class="ide-side skel"></div></div></div>`;

  let task;
  try {
    task = await api.task(itemId);
  } catch (err) {
    host.innerHTML = `<div class="empty"><h2>задача не открылась</h2>
      <p>${escapeHtml(err.message)}</p><a class="btn" href="#/map">к карте</a></div>`;
    return;
  }

  ctx.setCrumb(`нода ${task.node_code}`, task.title);
  ctx.setChrome(false);

  // В дереве только свои файлы. Тестовый класс новичку в проекте не нужен:
  // читать JUnit он не умеет, а что именно проверяется — написано словами
  // на вкладке «что проверяется».
  const draft = loadDraft(itemId);
  const files = new Map();
  Object.entries(task.starter_files || {}).forEach(([name, source]) => {
    files.set(name, { name, source: draft[name] ?? source, initial: source, edit: true });
  });

  const state = {
    open: [...files.keys()][0],
    tabs: [[...files.keys()][0]],
    side: "task",
    verdict: null,
    running: false,
    // Ручной запуск: аргументы командной строки и то, что программа прочитает
    // с клавиатуры. Тесты сюда не лезут, это отдельная кнопка «попробовать».
    runArgs: "",
    runStdin: "",
    runOut: null,
  };

  host.innerHTML = shell(task);
  const els = {
    files: host.querySelector(".ide-files"),
    tabs: host.querySelector(".ide-tabs"),
    edit: host.querySelector(".ide-edit"),
    side: host.querySelector(".sidebody"),
    sidetabs: host.querySelector(".sidetabs"),
    run: host.querySelector("[data-go-run]"),
    check: host.querySelector("[data-go-check]"),
    reset: host.querySelector("[data-go-reset]"),
    back: host.querySelector("[data-go-back]"),
  };

  /* ------------------------------------------------------------ редактор */

  let editor = null;
  try {
    const mod = await import("./editor.js");
    editor = mod.createEditor(els.edit, {
      value: files.get(state.open).source,
      readOnly: !files.get(state.open).edit,
      onChange: (value) => {
        const file = files.get(state.open);
        if (!file.edit) return;
        file.source = value;
        saveDraft(itemId, files);
        paintTabs();
      },
      onRun: () => run(),
      onSave: () => { saveDraft(itemId, files); ctx.toast("черновик сохранён"); },
    });
  } catch {
    // Редактора нет — оставляем честную textarea, задача всё равно решается.
    editor = fallbackEditor(els.edit, files.get(state.open).source, (value) => {
      const file = files.get(state.open);
      if (!file.edit) return;
      file.source = value;
      saveDraft(itemId, files);
      paintTabs();
    });
  }
  handle = editor;

  // У редактора режим чтения задаётся при создании, менять его на лету нечем.
  // Атрибут textarea делает ровно то же самое и переживает смену файла.
  function setReadOnly(ro) {
    if (editor.setReadOnly) { editor.setReadOnly(ro); return; }
    const area = els.edit.querySelector("textarea");
    if (area) area.readOnly = ro;
    els.edit.classList.toggle("is-ro", ro);
  }

  function openFile(name) {
    if (!files.has(name)) return;
    state.open = name;
    if (!state.tabs.includes(name)) state.tabs.push(name);
    const file = files.get(name);
    editor.setValue(file.source);
    setReadOnly(!file.edit);
    editor.clearErrors?.();
    paintFiles();
    paintTabs();
  }

  /* ------------------------------------------------------------ отрисовка */

  function paintFiles() {
    els.files.innerHTML = `
      <div class="grp">твоё решение</div>
      ${[...files.values()].map((f) => row(f)).join("")}
      <div class="grp">по задаче</div>
      <button class="filerow" data-side="task">${ICO.doc}<span>условие</span></button>
      <button class="filerow" data-side="checks">${ICO.check}<span>что проверяется</span></button>`;
    els.files.querySelectorAll("[data-file]").forEach((btn) =>
      btn.addEventListener("click", () => openFile(btn.dataset.file)));
    els.files.querySelectorAll("[data-side]").forEach((btn) =>
      btn.addEventListener("click", () => setSide(btn.dataset.side)));
  }

  function row(file) {
    return `<button class="filerow" data-file="${escapeHtml(file.name)}"
      aria-current="${state.open === file.name}">
      ${ICO.file}<span>${escapeHtml(file.name)}</span></button>`;
  }

  function paintTabs() {
    els.tabs.innerHTML = state.tabs.map((name) => {
      const file = files.get(name);
      const dirty = file.edit && file.source !== file.initial;
      return `<button class="ide-tab" data-tab="${escapeHtml(name)}"
        aria-current="${state.open === name}">${escapeHtml(name)}
        ${dirty ? '<span class="dirty"></span>' : ""}</button>`;
    }).join("");
    els.tabs.querySelectorAll("[data-tab]").forEach((btn) =>
      btn.addEventListener("click", () => openFile(btn.dataset.tab)));
  }

  function setSide(which) {
    state.side = which;
    els.sidetabs.querySelectorAll("[data-st]").forEach((b) =>
      b.setAttribute("aria-current", String(b.dataset.st === which)));
    els.side.innerHTML = which === "task" ? statementHtml(task)
      : which === "checks" ? checksHtml(task, state.verdict)
      : which === "run" ? runPanelHtml(state)
      : verdictHtml(state.verdict, task);
    els.side.scrollTop = 0;
    if (which === "run") bindRunPanel();
    import("./article.js").then((m) => m.paintCode(els.side)).catch(() => {});
    els.side.querySelector("[data-showtests]")?.addEventListener("click", (e) => {
      e.currentTarget.nextElementSibling.hidden = !e.currentTarget.nextElementSibling.hidden;
    });
  }

  els.sidetabs.querySelectorAll("[data-st]").forEach((btn) =>
    btn.addEventListener("click", () => setSide(btn.dataset.st)));

  /* ------------------------------------------------------------ ручной запуск */

  function bindRunPanel() {
    const argsInput = els.side.querySelector("[data-run-args]");
    const stdinInput = els.side.querySelector("[data-run-stdin]");
    const go = els.side.querySelector("[data-run-go]");
    if (!go) return;
    argsInput.addEventListener("input", () => { state.runArgs = argsInput.value; });
    stdinInput.addEventListener("input", () => { state.runStdin = stdinInput.value; });
    go.addEventListener("click", async () => {
      go.disabled = true;
      state.runOut = { pending: true };
      const keep = { args: argsInput.value, stdin: stdinInput.value };
      setSide("run");
      try {
        const res = await api.run(solution(), null, splitArgs(keep.args), keep.stdin);
        state.runOut = res;
      } catch (err) {
        state.runOut = { ok: false, message: err.message };
      } finally {
        setSide("run");
      }
    });
  }

  /* ------------------------------------------------------------ прогон */

  function solution() {
    const out = {};
    files.forEach((file) => { if (file.edit) out[file.name] = file.source; });
    return out;
  }

  function showErrors(text) {
    const perFile = new Map();
    let m;
    JAVAC_ERR.lastIndex = 0;
    while ((m = JAVAC_ERR.exec(text || ""))) {
      const list = perFile.get(m[1]) || [];
      list.push({ line: Number(m[2]), message: m[3] });
      perFile.set(m[1], list);
    }
    const mine = perFile.get(state.open);
    if (mine && editor.markErrors) editor.markErrors(mine);
    else editor.clearErrors?.();
    // Если ошибка в другом файле — открываем тот, где она.
    if (!mine && perFile.size) {
      const [name] = [...perFile.keys()];
      if (files.has(name)) { openFile(name); editor.markErrors?.(perFile.get(name)); }
    }
  }

  /** Обе кнопки гоняют одни и те же тесты. Разница одна: сдача пишет результат. */
  async function runTests(submit) {
    if (state.running) return;
    state.running = true;
    els.run.disabled = true;
    els.check.disabled = true;
    setSide("out");
    els.side.innerHTML = `<div class="verdict"><div class="vhead">
      <svg class="spin" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
        stroke-width="2"><path d="M12 3a9 9 0 1 0 9 9" stroke-linecap="round"/></svg>
      ${submit ? "сдаю решение" : "гоняю тесты"}…</div>
      <div class="vbody">собираю код и проверяю случай за случаем</div></div>`;
    try {
      const res = submit
        ? await api.checkTask(itemId, solution())
        : await api.tryTask(itemId, solution());
      state.verdict = { submit, ...res };
      setSide("out");
      if (res.compile_out) showErrors(res.compile_out);
      else editor.clearErrors?.();
      if (submit && res.verdict.ok) {
        ctx.toast(res.result?.first_green ? `сдано, +${res.result.xp} XP` : "снова зелёное");
        ctx.refreshStats?.();
        if (res.task) { task.status = res.task.status; task.checks = res.task.checks; paintTop(); }
      }
      if (!submit && res.verdict.ok) ctx.toast("все проверки прошли, можно сдавать");
      if (res.result?.node_closed) ctx.toast("нода закрыта");
    } catch (err) {
      ctx.toast(err.message);
      state.verdict = { submit, error: err.message };
      setSide("out");
    } finally {
      state.running = false;
      els.run.disabled = false;
      els.check.disabled = false;
    }
  }

  const run = () => runTests(false);
  const check = () => runTests(true);

  function paintTop() {
    const nm = host.querySelector(".ide-top .nm span");
    if (nm) {
      nm.textContent = `${task.node_code} · ${task.xp} XP`
        + (task.status === "passed" ? " · сдана" : "")
        + (task.checks ? ` · попыток: ${task.checks}` : "");
    }
  }

  els.run.addEventListener("click", run);
  els.check.addEventListener("click", check);
  els.reset.addEventListener("click", () => {
    if (!window.confirm("вернуть стартовый файл? твой код в этом файле пропадёт")) return;
    const file = files.get(state.open);
    if (!file?.edit) return;
    file.source = file.initial;
    editor.setValue(file.initial);
    saveDraft(itemId, files);
    paintTabs();
  });
  els.back.addEventListener("click", () => {
    location.hash = from ? `#/n/${encodeURIComponent(from)}` : `#/n/${task.node_code}`;
  });

  setSide("task");
  openFile(state.open);   // он же расставит файлы, вкладки и текст в редакторе
  editor.focus?.();
}

/* ---------------------------------------------------------------- разметка */

function shell(task) {
  return `<div class="ide">
    <div class="ide-top">
      <button class="iconbtn" data-go-back title="к статье">${ICO.back}</button>
      <div class="nm"><b>${escapeHtml(task.title)}</b>
        <span>${escapeHtml(task.node_code)} · ${task.xp} XP${task.status === "passed" ? " · сдана" : ""}${task.checks ? ` · попыток: ${task.checks}` : ""}</span></div>
      <div class="sp"></div>
      <button class="btn" data-go-reset type="button">сбросить файл</button>
      <button class="btn" data-go-run type="button">${ICO.play} запустить тесты</button>
      <button class="btn primary" data-go-check type="button">${ICO.check} сдать</button>
    </div>
    <div class="ide-grid">
      <aside class="ide-files"></aside>
      <section class="ide-main">
        <div class="ide-tabs"></div>
        <div class="ide-edit"></div>
      </section>
      <aside class="ide-side">
        <div class="sidetabs">
          <button class="sidetab" data-st="task" aria-current="true">условие</button>
          <button class="sidetab" data-st="checks">что проверяется</button>
          <button class="sidetab" data-st="run">запуск</button>
          <button class="sidetab" data-st="out">результат</button>
        </div>
        <div class="sidebody"></div>
      </aside>
    </div>
  </div>`;
}

/** Разбить строку аргументов как это делает оболочка: кавычки склеивают слова. */
function splitArgs(text) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(text || "")))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function runPanelHtml(state) {
  const res = state.runOut;
  let out = '<p style="color:var(--muted);font-size:12.5px">Здесь программа запускается '
    + 'как из терминала: с аргументами и с тем, что ты «набрал с клавиатуры». '
    + 'Результат никуда не записывается.</p>';
  if (res?.pending) {
    out = '<div class="verdict"><div class="vhead">запускаю…</div></div>';
  } else if (res) {
    const body = res.ok ? (res.stdout || "(программа ничего не вывела)")
      : (res.compile_out || res.stderr || res.message || "");
    out = `<div class="verdict ${res.ok ? "ok" : "bad"}">
        <div class="vhead">${escapeHtml(says(res.message) || (res.ok ? "готово" : "не вышло"))}
          ${res.seconds ? `<span style="margin-left:auto;font-weight:400;color:var(--muted)">${sec(res.seconds)}</span>` : ""}</div>
        <div class="vbody"><pre>${escapeHtml(cleanCompile(body))}</pre></div>
      </div>`;
  }
  return `<h3>Запустить программу</h3>
    <label class="runfield"><span>аргументы командной строки</span>
      <input type="text" data-run-args value="${escapeAttr(state.runArgs || "")}"
        placeholder="ЯЧЕЙКА A-01" autocomplete="off"></label>
    <p class="runhint">Попадут в <code>args</code> у <code>main</code>. Слова через пробел,
      а если внутри аргумента пробел — возьми его в кавычки.</p>
    <label class="runfield"><span>ввод с клавиатуры</span>
      <textarea data-run-stdin rows="3" placeholder="то, что читает Scanner">${escapeHtml(state.runStdin || "")}</textarea></label>
    <p class="runhint">Каждая строка — один ответ на запрос программы.</p>
    <button class="btn primary" data-run-go type="button" style="margin-bottom:14px">
      запустить main</button>
    ${out}`;
}

function statementHtml(task) {
  const parsed = parseNote(`# ${task.title}\n\n${task.statement_md || ""}`);
  const hints = (task.hints || []).map((h) => `<li>${escapeHtml(h)}</li>`).join("");
  return `<h3>${escapeHtml(task.title)}</h3>
    <div class="prose">${renderBlocks(parsed.blocks)}</div>
    ${hints ? `<h3 style="margin-top:20px">На что посмотреть в своём коде</h3><ul>${hints}</ul>` : ""}
    <p style="color:var(--muted);font-size:12.5px;margin-top:18px">
      Скрытых тестов ты не увидишь: в этом и смысл проверки. После прогона будут видны
      имена скрытых случаев и то, какие из них красные.</p>`;
}

function checksHtml(task, state) {
  const done = state && !state.error ? (state.verdict || {}) : null;
  const cases = (task.visible_cases || []);

  const ran = new Map((done?.visible || []).map((c) => [c.name, c]));
  const list = cases.length
    ? cases.map((c) => {
        const result = ran.get(c.name);
        if (result) return caseRow(result);
        return `<div class="case"><div class="case-head">
          <span class="st" style="background:var(--line)"></span>${escapeHtml(c.name)}
          <span class="case-mark">—</span></div></div>`;
      }).join("")
    : '<p style="color:var(--muted)">У этой задачи проверки без названий — их видно только после прогона.</p>';

  return `<h3>Что проверяется</h3>
    <p style="color:var(--muted);font-size:13px">Вот случаи, которые прогоняются по кнопке
      «запустить тесты». Пройдут все — решение можно сдавать.</p>
    <div class="caselist">${list}</div>
    <p style="color:var(--muted);font-size:12.5px;margin-top:16px">
      Кроме этих есть ещё скрытые случаи: их названия появятся в «результате» после сдачи,
      а на каких данных они гоняются — не покажу, в этом и смысл проверки.</p>
    <button class="btn ghost" data-showtests type="button" style="margin-top:14px">
      показать код тестов</button>
    <div hidden>
      <p style="color:var(--muted);font-size:12.5px;margin-top:10px">Это JUnit. Знать его сейчас
        не нужно, но если любопытно — вот файл ${escapeHtml(task.tests_file)}:</p>
      <pre><code>${escapeHtml(task.visible_tests)}</code></pre>
    </div>`;
}

// Ядро формулирует вердикт для терминала. На экране новичка «видимые тесты
// красные» ничего не объясняет, поэтому переводим на человеческий.
const SAYS = {
  "решение не компилируется": "код не собрался",
  "видимые тесты красные": "не все проверки прошли",
  "скрытые тесты красные": "скрытые проверки не прошли",
  "скрытые тесты не собрались с твоим решением": "скрытые проверки не собрались с твоим кодом",
};

function says(text) {
  const key = String(text || "").trim();
  for (const [from, to] of Object.entries(SAYS)) {
    if (key.startsWith(from)) return to + key.slice(from.length);
  }
  return key;
}

/** Строка проверки. У видимых кейсов ядро отдаёт ещё и расхождение —
    показываем его прямо тут: «красный тест» без ожидаемого ничего не объясняет. */
function caseRow(c) {
  let diff = "";
  if (c.want !== undefined || c.got !== undefined) {
    diff = `<div class="case-diff">
      <div><b>ожидалось</b><code>${escapeHtml(c.want ?? "")}</code></div>
      <div><b>получилось</b><code>${escapeHtml(c.got ?? "")}</code></div>
    </div>`;
  } else if (c.why) {
    diff = `<div class="case-diff"><div><b>что не так</b><code>${escapeHtml(c.why)}</code></div></div>`;
  }
  return `<div class="case ${c.ok ? "" : "bad"}${diff ? " has-diff" : ""}">
    <div class="case-head"><span class="st"></span>${escapeHtml(c.name)}
      <span class="case-mark">${c.ok ? "✓" : "×"}</span></div>${diff}</div>`;
}

/** Путь папки прогона наружу не нужен: ученик видит своё имя файла, а не visible/src. */
function cleanCompile(text) {
  return String(text || "").replace(/(?:^|(?<=\s))(?:visible|hidden)\/src\//g, "");
}

function verdictHtml(state, task) {
  if (!state) {
    return `<p style="color:var(--muted)">Пока пусто. <b>Запустить тесты</b> прогонит проверки
      и ничего никуда не запишет. <b>Сдать</b> — то же самое, но результат идёт в прогресс.</p>`;
  }
  if (state.error) {
    return `<div class="verdict bad"><div class="vhead">не получилось</div>
      <div class="vbody">${escapeHtml(state.error)}</div></div>`;
  }

  const v = state.verdict || {};
  const submit = Boolean(state.submit);
  const head = v.ok
    ? (submit ? "решение принято" : "все проверки прошли")
    : escapeHtml(says(v.message) || "не прошло");

  const steps = [
    { label: "код собрался", ok: v.phase !== "compile" },
    { label: "проверки из условия", ok: v.visible_ok, skip: v.phase === "compile" },
    { label: "скрытые проверки", ok: v.hidden_ok, skip: !v.visible_ok },
  ].map((x) => `<li class="${x.skip ? "skip" : x.ok ? "ok" : "bad"}">
      <span class="st">${x.skip ? "" : x.ok ? "✓" : "×"}</span>${x.label}</li>`).join("");

  const visible = (v.visible || []).map(caseRow).join("");
  const hidden = (v.hidden || []).map(caseRow).join("");
  const gain = state.result?.first_green
    ? `<div class="vbody"><b style="color:var(--ok)">+${state.result.xp} XP за первую сдачу</b></div>`
    : "";
  const nudge = v.ok && !submit
    ? `<div class="vbody" style="color:var(--muted)">Ничего не записано: это был прогон.
        Жми «сдать», чтобы результат пошёл в прогресс.</div>`
    : "";

  return `<div class="verdict ${v.ok ? "ok" : "bad"}">
      <div class="vhead">${head}
        ${v.seconds ? `<span style="margin-left:auto;font-weight:400;color:var(--muted)">${sec(v.seconds)}</span>` : ""}</div>
      <div class="vbody"><ul class="steps">${steps}</ul></div>
      ${gain}${nudge}
    </div>
    ${state.compile_out ? `<h3>Код не собрался</h3>
      <p style="color:var(--muted);font-size:12.5px">Компилятор назвал файл, строку и место.
        Поправь и запусти снова.</p>
      <pre>${escapeHtml(cleanCompile(state.compile_out))}</pre>` : ""}
    ${visible ? `<h3>Проверки из условия</h3><div class="caselist">${visible}</div>` : ""}
    ${hidden ? `<h3 style="margin-top:18px">Скрытые проверки</h3><div class="caselist">${hidden}</div>
      ${v.hidden_ok ? "" : `<p style="color:var(--muted);font-size:12.5px;margin-top:10px">
      На каких данных они гоняются, не покажу: в этом и смысл. Подумай, какие случаи ты не разобрал.</p>`}` : ""}`;
}

/* ---------------------------------------------------------------- черновик */

function loadDraft(id) {
  try { return JSON.parse(localStorage.getItem(DRAFT(id)) || "{}"); } catch { return {}; }
}
function saveDraft(id, files) {
  const out = {};
  files.forEach((file) => { if (file.edit) out[file.name] = file.source; });
  try { localStorage.setItem(DRAFT(id), JSON.stringify(out)); } catch { /**/ }
}

/* ---------------------------------------------------------------- запасной редактор */

function fallbackEditor(host, value, onChange) {
  host.innerHTML = `<textarea spellcheck="false" style="width:100%;height:100%;border:0;
    padding:14px 16px;background:var(--code-bg);color:var(--code-ink);
    font-family:var(--font-mono);font-size:13.5px;line-height:1.6;resize:none;outline:none"></textarea>`;
  const area = host.querySelector("textarea");
  area.value = value || "";
  area.addEventListener("input", () => onChange(area.value));
  return {
    getValue: () => area.value,
    setValue: (v) => { area.value = v; },
    setReadOnly: (ro) => { area.readOnly = ro; },
    focus: () => area.focus(),
    destroy: () => { host.innerHTML = ""; },
    clearErrors() {}, markErrors() {},
  };
}
