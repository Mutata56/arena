/* Настройки чтения. Живут в localStorage: своего хранилища у проекта нет и не надо.
   Стиль и тема независимы — оба одобрены заранее, выбор за читателем. */

const KEY = "arena.site.settings";

const DEFAULTS = {
  style: "editorial",   // editorial | clean
  theme: "light",       // light | sepia | dark
  size: "m",            // s | m | l
  width: "normal",      // narrow | normal | wide
  glossary: true,       // подчёркивать термины в тексте
  diagrams: true,       // показывать схемы
  gate: true,           // не пускать к задачам, пока не отвечены вопросы по тексту
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function get() { return { ...state }; }

export function set(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* приватный режим */ }
  apply();
  listeners.forEach((fn) => fn(get()));
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function apply() {
  const root = document.documentElement;
  root.dataset.style = state.style;
  root.dataset.theme = state.theme;
  root.dataset.size = state.size;
  root.dataset.width = state.width;
  root.dataset.glossary = state.glossary ? "on" : "off";
}

/* ---------------------------------------------------------------- панель */

const SEGMENTS = [
  { key: "style", label: "стиль", opts: [["editorial", "книга"], ["clean", "минимал"]] },
  { key: "theme", label: "тема", opts: [["light", "светлая"], ["sepia", "сепия"], ["dark", "тёмная"]] },
  { key: "size", label: "размер текста", opts: [["s", "мельче"], ["m", "обычный"], ["l", "крупнее"]] },
  { key: "width", label: "ширина колонки", opts: [["narrow", "узкая"], ["normal", "обычная"], ["wide", "широкая"]] },
];

const TOGGLES = [
  { key: "glossary", title: "глоссарий", hint: "подчёркивать термины и показывать определение по наведению" },
  { key: "diagrams", title: "схемы", hint: "вставлять наглядные схемы в разбор" },
  { key: "gate", title: "сначала прочитать", hint: "задачи открываются после вопросов по тексту" },
];

export function settingsBody() {
  const segs = SEGMENTS.map((s) => `
    <div class="setrow">
      <label>${s.label}</label>
      <div class="seg" data-seg="${s.key}">
        ${s.opts.map(([v, t]) => `<button type="button" data-v="${v}"
          aria-pressed="${state[s.key] === v}">${t}</button>`).join("")}
      </div>
    </div>`).join("");

  const toggles = TOGGLES.map((t) => `
    <div class="setrow">
      <label class="switch">
        <input type="checkbox" data-toggle="${t.key}" ${state[t.key] ? "checked" : ""}>
        <span class="track"></span>
        <span class="lb">${t.title}<small>${t.hint}</small></span>
      </label>
    </div>`).join("");

  return segs + toggles;
}

export function bindSettings(root) {
  root.querySelectorAll("[data-seg]").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-v]");
      if (!btn) return;
      set({ [seg.dataset.seg]: btn.dataset.v });
      seg.querySelectorAll("button").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === btn)));
    });
  });
  root.querySelectorAll("[data-toggle]").forEach((input) => {
    input.addEventListener("change", () => set({ [input.dataset.toggle]: input.checked }));
  });
}

apply();
