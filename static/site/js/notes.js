/* Выделения и заметки на полях.

   Храним не DOM-диапазон, а смещения в тексте блока: разметка блока может
   поменяться (схема, вопрос, глоссарий), а сам текст — нет. Поэтому выделение
   переживает перерисовку, пока цел абзац. */

const KEY = (code) => `arena.site.notes.${code}`;

export function load(code) {
  try { return JSON.parse(localStorage.getItem(KEY(code)) || "[]"); } catch { return []; }
}

export function save(code, list) {
  try { localStorage.setItem(KEY(code), JSON.stringify(list)); } catch { /* приватный режим */ }
}

/* ---------------------------------------------------------------- смещения */

function textNodes(root) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement.closest("script, style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const out = [];
  let node = walk.nextNode();
  while (node) { out.push(node); node = walk.nextNode(); }
  return out;
}

function offsetOf(root, node, offset) {
  let total = 0;
  for (const text of textNodes(root)) {
    if (text === node) return total + offset;
    total += text.nodeValue.length;
  }
  return -1;
}

function rangeAt(root, start, end) {
  const range = document.createRange();
  let seen = 0;
  let started = false;
  for (const text of textNodes(root)) {
    const len = text.nodeValue.length;
    if (!started && start <= seen + len) {
      range.setStart(text, Math.max(0, start - seen));
      started = true;
    }
    if (started && end <= seen + len) {
      range.setEnd(text, Math.max(0, end - seen));
      return range;
    }
    seen += len;
  }
  return started ? range : null;
}

function wrap(range, id, hasNote) {
  const mark = document.createElement("mark");
  mark.className = `hl${hasNote ? " note" : ""}`;
  mark.dataset.hl = id;
  try {
    range.surroundContents(mark);
  } catch {
    // Выделение пересекло границу тега — тогда переносим содержимое внутрь.
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
  }
  return mark;
}

/* ---------------------------------------------------------------- API */

export function mount(prose, code, { toast, onChange } = {}) {
  let list = load(code);
  const bar = document.createElement("div");
  bar.className = "selbar";
  bar.innerHTML = `
    <button type="button" data-act="hl">выделить</button>
    <button type="button" data-act="note">заметка</button>`;
  document.body.appendChild(bar);

  let pending = null;

  const blocks = () => [...prose.children];

  function paint() {
    prose.querySelectorAll("mark.hl").forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
    const all = blocks();
    [...list].sort((a, b) => a.b - b.b || a.s - b.s).forEach((item) => {
      const host = all[item.b];
      if (!host) return;
      const range = rangeAt(host, item.s, item.e);
      if (range) wrap(range, item.id, Boolean(item.note));
    });
  }

  function hide() { bar.classList.remove("on"); pending = null; }

  function onSelect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { hide(); return; }
    const range = sel.getRangeAt(0);
    const host = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const block = host && host.closest(".prose > *");
    if (!block || !prose.contains(block)) { hide(); return; }
    const quote = sel.toString().trim();
    if (quote.length < 3) { hide(); return; }

    const index = blocks().indexOf(block);
    const s = offsetOf(block, range.startContainer, range.startOffset);
    const e = offsetOf(block, range.endContainer, range.endOffset);
    if (index < 0 || s < 0 || e <= s) { hide(); return; }
    pending = { b: index, s, e, quote };

    const rect = range.getBoundingClientRect();
    bar.style.left = `${Math.max(12, rect.left + rect.width / 2 + window.scrollX - 70)}px`;
    bar.style.top = `${rect.top + window.scrollY - 46}px`;
    bar.classList.add("on");
  }

  function add(note) {
    if (!pending) return;
    const item = { id: `h${Date.now().toString(36)}`, ...pending, note: note || "" };
    list.push(item);
    save(code, list);
    window.getSelection()?.removeAllRanges();
    hide();
    paint();
    onChange?.(list);
    toast?.(note ? "заметка сохранена" : "выделено");
  }

  bar.addEventListener("mousedown", (e) => e.preventDefault());
  bar.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "hl") return add("");
    const text = window.prompt("заметка к выделенному:");
    if (text !== null) add(text.trim());
  });

  // Слушатели документа снимаются в destroy: иначе на каждой открытой статье
  // копился бы ещё один обработчик выделения.
  let selTimer = null;
  const onSelectionChange = () => {
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    clearTimeout(selTimer);
    selTimer = setTimeout(onSelect, 90);
  };
  const onKeyDown = (e) => { if (e.key === "Escape") hide(); };
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("keydown", onKeyDown);

  prose.addEventListener("click", (e) => {
    const mark = e.target.closest("mark.hl");
    if (!mark) return;
    const item = list.find((it) => it.id === mark.dataset.hl);
    if (!item) return;
    const next = window.prompt(
      "заметка (пусто — убрать выделение):", item.note || "");
    if (next === null) return;
    if (next.trim() === "" && !item.note) {
      list = list.filter((it) => it.id !== item.id);
    } else if (next.trim() === "") {
      list = list.filter((it) => it.id !== item.id);
    } else {
      item.note = next.trim();
    }
    save(code, list);
    paint();
    onChange?.(list);
  });

  paint();

  return {
    list: () => list,
    remove(id) {
      list = list.filter((it) => it.id !== id);
      save(code, list);
      paint();
      onChange?.(list);
    },
    repaint: paint,
    destroy() {
      clearTimeout(selTimer);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("keydown", onKeyDown);
      bar.remove();
    },
  };
}

export function notesBody(list) {
  if (!list.length) {
    return `<p style="color:var(--muted);font-size:13.5px;line-height:1.6">
      Пока пусто. Выдели любой кусок текста в статье — появится кнопка «выделить» и «заметка».</p>`;
  }
  return `<div class="notelist">${list.map((it) => `
    <div class="noteitem" data-note="${it.id}">
      <button class="btn ghost rm" type="button" data-rm="${it.id}">убрать</button>
      <q>${it.quote.replace(/</g, "&lt;")}</q>
      ${it.note ? `<div class="txt">${it.note.replace(/</g, "&lt;")}</div>` : ""}
    </div>`).join("")}</div>`;
}
