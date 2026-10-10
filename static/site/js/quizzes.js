/* Вопросы по ходу текста.

   Главное здесь не разметка, а РАССТАНОВКА. Вопрос имеет право появиться только
   после того, как текст успел объяснить то, о чём спрашивает. Поэтому идём по
   секциям сверху вниз, копим словарь уже прочитанного и ставим вопрос в первую
   секцию, после которой он покрыт. Если тема будет позже, вопрос уедет позже.
   Что не покрылось нигде, уходит в конец, перед задачами. */

import api from "./api.js";
import { escapeHtml, inline, sectionText } from "./md.js";

// Доля терминов вопроса, которую текст должен успеть объяснить.
const COVERAGE = 0.6;
// Больше двух вопросов подряд после одной секции — это уже допрос, а не чтение.
const PER_SECTION = 2;
// На добивке потолок выше: у типичного конспекта всего три содержательные секции
// (тезисы, разбор, ДЗ), и при жёсткой двойке весь остаток сваливался в последнюю.
const FILL_PER_SECTION = 4;
// На добивке порог мягче, чем на основном проходе: там важна не точность
// попадания, а запрет ставить вопрос раньше объяснения.
const FILL_COVERAGE = 0.4;

const STOP = new Set([
  "который", "которая", "которое", "которые", "чтобы", "потому", "поэтому", "этого",
  "этот", "эта", "это", "тот", "там", "тут", "как", "что", "для", "при", "над", "под",
  "если", "или", "но", "так", "уже", "ещё", "еще", "все", "всё", "всех", "быть", "есть",
  "надо", "нужно", "можно", "нельзя", "будет", "было", "были", "один", "одна", "два",
  "три", "code", "java", "выведет", "выведи", "напиши", "сколько", "почему", "какой",
  "какая", "какое", "какие", "верно", "неверно", "правда", "ложь", "ответ", "вопрос",
  "пример", "примера", "случае", "значение", "значения",
]);

const LAT = /^[a-z_$][\w$]*$/i;

/** Грубая нормализация: русским словам режем окончание, латинские берём как есть. */
function stems(text) {
  const out = new Set();
  String(text || "").toLowerCase().replace(/ё/g, "е")
    .split(/[^0-9a-zA-Zа-я_$]+/)
    .forEach((word) => {
      if (!word || STOP.has(word)) return;
      if (LAT.test(word)) { if (word.length >= 2) out.add(word); return; }
      if (word.length >= 4) out.add(word.slice(0, 6));
    });
  return out;
}

function quizTerms(item) {
  const set = stems(`${item.q || ""} ${item.topic || ""}`);
  stems(item.code || "").forEach((s) => set.add(s));
  return set;
}

/** Где кончается «повествование»: вопросы после этих секций не ставим. */
const TAIL = ["тест", "карточки", "критерий", "ответы", "если провалил",
              "самопроверка", "задачи", "дз",
              // Хвост нового формата лекции: «Проверь себя» это авторские вопросы,
              // «Коротко» это выжимка. Ставить туда сгенерённый вопрос значит
              // спрашивать уже после того, как человек закончил читать.
              "проверь себя", "коротко"];
/** Вступление: обещание разобрать тему, а не сам разбор. Спрашивать тут не о чем,
    но слова отсюда в словарь прочитанного идут — они и правда прозвучали. */
const PREFACE = ["цель", "правила", "зачем", "что строим", "пререквизиты"];

function isPreface(section) {
  const head = (section.heading || "").toLowerCase();
  return PREFACE.some((word) => head.startsWith(word));
}

function tailIndex(sections) {
  const at = sections.findIndex((s) =>
    TAIL.some((word) => s.heading.toLowerCase().startsWith(word)));
  return at === -1 ? sections.length : at;
}

/**
 * Разложить вопросы по секциям.
 * @returns Map<number, item[]> — ключ это индекс секции, после которой ставим.
 */
export function placeQuizzes(sections, items, { max = 10 } = {}) {
  const plan = new Map();
  if (!sections.length || !items.length) return plan;

  const limit = Math.max(1, tailIndex(sections));
  const texts = sections.map((s) => stems(sectionText(s)));
  // Уровни чередуем, а не сортируем по возрастанию. При обычной сортировке
  // до потолка в десять вопросов доходили только нулевой и первый уровень,
  // а подвохи (второй) не показывались никогда — хотя они и есть самое ценное.
  const interleave = (list) => {
    const byLvl = [[], [], []];
    list.forEach((entry) => byLvl[Math.min(2, Math.max(0, entry.item.lvl || 0))].push(entry));
    const out = [];
    for (let i = 0; ; i++) {
      const round = byLvl.map((group) => group[i]).filter(Boolean);
      if (!round.length) break;
      out.push(...round);
    }
    return out;
  };

  const all = items.filter((it) => !it.suspended)
    .map((it) => ({ item: it, terms: quizTerms(it) }))
    .sort((a, b) => a.item.item_id - b.item.item_id);
  // Неотвеченные идут первыми. Иначе выходило так: банк ноды пополнился, потолок
  // в десять вопросов заняли уже решённые, и человек честно отвечал на всё, что
  // видел, а нода не закрывалась — новых вопросов страница ему просто не показывала.
  const pool = [...interleave(all.filter((e) => !e.item.done)),
                ...interleave(all.filter((e) => e.item.done))];

  const seen = new Set();
  const taken = new Set();

  // Якоря автора сильнее любого подсчёта покрытия. Автоматика смотрит на словарь,
  // а словарь врёт: подпись main целиком напечатана уже в первой секции, хотя
  // разбирают её во второй. Там, где автор знает лучше, он ставит %%вопросы: …%%.
  const pinned = new Map();
  sections.forEach((section, i) => {
    const keys = (section.blocks || [])
      .filter((b) => b.t === "qanchor").flatMap((b) => b.keys || []);
    if (!keys.length) return;
    const here = [];
    for (const entry of pool) {
      if (taken.has(entry.item.item_id) || taken.size >= max) continue;
      // Только формулировка и тема: варианты ответов это отвлекающие, и слово
      // из третьего варианта не должно утаскивать вопрос в чужую секцию.
      const hay = `${entry.item.q || entry.item.question || ""} ${entry.item.topic || ""}`
        .toLowerCase().replace(/ё/g, "е");
      if (!keys.some((k) => hay.includes(k))) continue;
      here.push(entry.item);
      taken.add(entry.item.item_id);
    }
    if (here.length) pinned.set(i, here);
  });

  for (let i = 0; i < limit; i++) {
    const fresh = texts[i];
    fresh.forEach((s) => seen.add(s));
    if (isPreface(sections[i])) continue;
    const here = [];
    for (const entry of pool) {
      if (taken.size >= max) break;
      if (taken.has(entry.item.item_id) || here.length >= PER_SECTION) continue;
      const total = entry.terms.size;
      if (!total) continue;
      let hit = 0;
      let fromHere = 0;
      entry.terms.forEach((term) => {
        if (seen.has(term)) hit += 1;
        if (fresh.has(term)) fromHere += 1;
      });
      // Секция должна не просто «не мешать», а реально что-то дать по этому вопросу.
      if (hit / total >= COVERAGE && fromHere > 0) { here.push(entry.item); taken.add(entry.item.item_id); }
    }
    const merged = [...(pinned.get(i) || []), ...here];
    if (merged.length) plan.set(i, merged);
  }
  // Якорь мог попасть в секцию за пределами повествования (хвост, вступление) —
  // такое место основной цикл не проходит, доложим руками.
  pinned.forEach((items, i) => { if (!plan.has(i)) plan.set(i, items); });

  // Хвост добираем до потолка: столько же вопросов, сколько ядро требует на
  // квиз-блок ноды. Остальное останется банку и всплывёт в повторении.
  const rest = pool.filter((e) => !taken.has(e.item.item_id))
    .slice(0, Math.max(0, max - taken.size)).map((e) => e.item);
  if (!rest.length) return plan;

  // Раскладываем остаток по секциям, где ещё есть место, а не сваливаем кучей
  // в конец: шесть вопросов подряд это уже не чтение с проверками, а экзамен.
  const spots = [];
  for (let i = 0; i < limit; i++) {
    if (isPreface(sections[i])) continue;
    const free = FILL_PER_SECTION - (plan.get(i) || []).length;
    for (let k = 0; k < free; k++) spots.push(i);
  }
  spots.sort((a, b) => a - b);

  // Но и на добивке вопрос не имеет права встать раньше, чем текст хоть что-то
  // о нём сказал. Иначе вопросы про «написал один раз, запускай где угодно»
  // оказывались до раздела, который это и объясняет.
  const cumulative = [];
  const acc = new Set();
  for (let i = 0; i < limit; i++) {
    texts[i].forEach((t) => acc.add(t));
    cumulative.push(new Set(acc));
  }
  const earliest = (item) => {
    const terms = quizTerms(item);
    if (!terms.size) return 0;
    for (let i = 0; i < cumulative.length; i++) {
      let hit = 0;
      terms.forEach((t) => { if (cumulative[i].has(t)) hit += 1; });
      if (hit / terms.size >= FILL_COVERAGE) return i;
    }
    return Math.max(0, limit - 1);
  };

  const used = new Set();
  rest.forEach((item) => {
    const from = earliest(item);
    const slot = spots.findIndex((at, idx) => at >= from && !used.has(idx));
    const at = slot === -1 ? limit - 1 : spots[slot];
    if (slot !== -1) used.add(slot);
    plan.set(at, [...(plan.get(at) || []), item]);
  });
  return plan;
}

/* ---------------------------------------------------------------- разметка */

function optClass(opts) {
  const many = opts.some((o) => String(o).includes("\n"));
  const same = new Set(opts.map((o) => String(o).replace(/\s+/g, " ").trim())).size !== opts.length;
  return many || same ? "txt out" : "txt";
}

/** Перестановка вариантов, своя у каждого вопроса и всегда одна и та же.

    Модель кладёт Клиент A ответ куда попало только на словах: по банку 66 процентов
    правильных стояли вторыми и 4 процента четвёртыми, и это видно глазом уже
    на второй ноде. Тасуем при показе — чинится сразу весь банк, а не только то,
    что сгенерится дальше. Порядок детерминированный: перерешивание и повтор
    должны показывать ту же картинку, иначе человек решает, что ответы «поплыли».

    Возвращает массив, где индекс это место на экране, а значение — номер варианта
    в банке. Наружу (в ядро) уходит именно номер из банка. */
function permFor(id, n) {
  const idx = [...Array(n).keys()];
  let seed = ((Number(id) || 1) * 2654435761) % 4294967296;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export function renderCheck(item, index, total) {
  const cls = optClass(item.opts || []);
  const raw = item.opts || [];
  const perm = permFor(item.item_id, raw.length);
  const opts = perm.map((orig, i) => `
    <button class="opt" type="button" data-i="${i}">
      <span class="mark">${i + 1}</span><span class="${cls}">${escapeHtml(raw[orig])}</span>
    </button>`).join("");
  const label = item.kind === "readcode" ? "чужой код" : "проверь себя";
  // Уже отвеченный вопрос не притворяется новым: он свёрнут и подписан.
  // Захотел перерешать — кнопка возвращает варианты в рабочее состояние.
  const solved = Boolean(item.done);
  // Четвёртое состояние: человек знал тему до нас и отметил вопрос изученным.
  // Для ноды это Клиент A ответ, но подписывать его «ответ засчитан» нельзя —
  // он ничего не отвечал, и через месяц эта подпись врала бы ему в лицо.
  const known = solved && Boolean(item.known);
  // Третье состояние: отвечал и не угадал. Раньше такой вопрос выглядел
  // нетронутым, и после перезагрузки человек не понимал, отвечал он или нет.
  const missed = !solved && Boolean(item.tried);
  return `<section class="check${solved ? " done solved" : ""}${known ? " known" : ""}${missed ? " missed" : ""}" data-item="${item.item_id}"
      data-perm="${perm.join(",")}" id="ck-${item.item_id}">
    <div class="ck-top">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <path d="${solved ? "m4 12.5 5 5L20 6.5" : "M13 2 4.2 12.6h6.3L11 22l8.8-10.6h-6.3z"}"/></svg>
      <span data-label>${known ? "отмечено: уже знаю"
        : (solved ? "уже решено" : (missed ? "отвечал, не сошлось" : label))}</span>
      <span class="ck-n">${index} из ${total}</span>
    </div>
    <div class="ck-body">
      <p class="ck-q">${inline(item.q || "")}</p>
      ${item.code ? `<pre class="snippet"><code>${escapeHtml(item.code)}</code></pre>` : ""}
      <div class="opts"${solved ? " hidden" : ""}>${opts}</div>
      ${missed ? `<div class="ck-row"><span class="chip">попыток: ${item.tries}, Клиент A пока нет</span>
        <span class="chip">попробуй ещё раз</span></div>` : ""}
      ${solved ? `<div class="ck-row" data-again-row>
        <span class="chip ok">${known ? "это ты уже знаешь"
          : `ответ засчитан${item.tries > 1 ? `, попыток: ${item.tries}` : ""}`}</span>
        <button class="btn ghost" data-again type="button">решить заново</button>
      </div>` : ""}
      <div class="ck-row ck-skip">
        <button class="btn ghost" data-learned type="button">это я уже знаю</button>
        <span class="lbl">без XP: вопрос закроется как разобранный</span>
      </div>
      <div class="ck-after"></div>
    </div>
  </section>`;
}

/* ---------------------------------------------------------------- поведение */

export function bindChecks(root, { onAnswered, toast } = {}) {
  const busy = new Set();

  // choice === -2 это «уже знаю»: ядро засчитает вопрос разобранным и не заплатит.
  async function answer(box, choice) {
    const itemId = Number(box.dataset.item);
    if (busy.has(itemId) || box.classList.contains("done")) return;
    busy.add(itemId);
    // На экране варианты переставлены, в банке лежат в исходном порядке.
    // Наружу уходит номер из банка, обратно приходит тоже он — и место
    // на экране приходится искать по перестановке.
    const perm = (box.dataset.perm || "").split(",").filter((s) => s !== "").map(Number);
    const toBank = (shown) => (shown >= 0 && perm.length ? perm[shown] : shown);
    const toScreen = (bank) => (perm.length ? perm.indexOf(bank) : bank);
    let res;
    try {
      res = await api.answerQuiz(itemId, toBank(choice));
    } catch (err) {
      busy.delete(itemId);
      toast?.(err.message);
      return;
    }
    box.classList.add("done");
    const opts = [...box.querySelectorAll(".opt")];
    opts.forEach((o) => { o.disabled = true; });
    const rightAt = toScreen(res.ans);
    if (opts[rightAt]) opts[rightAt].classList.add("correct");
    if (!res.correct && choice >= 0 && opts[choice]) opts[choice].classList.add("wrong");

    if (res.known) box.classList.add("known");
    const lb = box.querySelector(".ck-top [data-label]");
    if (lb && res.known) lb.textContent = "отмечено: уже знаю";
    const after = box.querySelector(".ck-after");
    after.innerHTML = `
      <div class="explain">${res.known ? "" : (res.correct ? '<b class="v">верно.</b> ' : "")}${inline(res.exp || "")}</div>
      <div class="ck-row">
        <span class="chip ${res.correct && !res.known ? "ok" : ""}">${
          res.known ? "отмечено как изученное, без XP" : (res.xp ? `+${res.xp} XP` : "без XP")}</span>
        <button class="btn ghost" data-bad type="button">сообщить о неточности</button>
      </div>`;
    after.querySelector("[data-bad]").addEventListener("click", async () => {
      try {
        await api.suspend(itemId);
        box.remove();
        onAnswered?.(res, itemId);
        toast?.("спасибо, вопрос убран из показа");
      } catch (err) { toast?.(err.message); }
    });
    if (res.xp) toast?.(`+${res.xp} XP`);
    else if (res.known) toast?.("отмечено как изученное");
    if (res.contract_xp) setTimeout(() => toast?.(`+${res.contract_xp} XP, контракт дня закрыт`), 1000);
    busy.delete(itemId);
    onAnswered?.(res, itemId);
  }

  root.addEventListener("click", (e) => {
    const again = e.target.closest(".check [data-again]");
    if (again) {
      const box = again.closest(".check");
      box.classList.remove("done", "solved", "known");
      box.querySelector(".opts").hidden = false;
      box.querySelectorAll(".opt").forEach((o) => {
        o.disabled = false;
        o.classList.remove("correct", "wrong");
      });
      box.querySelector("[data-again-row]")?.remove();
      box.querySelector(".ck-after").innerHTML = "";
      const lb = box.querySelector(".ck-top [data-label]");
      if (lb) lb.textContent = "проверь себя";
      return;
    }
    const opt = e.target.closest(".check .opt");
    if (opt && !opt.disabled) {
      answer(opt.closest(".check"), Number(opt.dataset.i));
      return;
    }
    const know = e.target.closest(".check [data-know]");
    if (know) { answer(know.closest(".check"), -1); return; }
    const learned = e.target.closest(".check [data-learned]");
    if (learned) answer(learned.closest(".check"), -2);
  });

  return { answer };
}
