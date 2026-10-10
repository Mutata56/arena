// diagrams-sql-kit.js
// Общая оснастка схем раздела DBA: обёртка <svg>, наконечники стрелок и пара
// значков. Вынесена отдельно, чтобы схемы каждого этапа жили в своём файле
// и не мешали друг другу при правке.
//
// Правила для всех файлов схем: самодостаточный ES-модуль, цвета только через
// CSS-переменные страницы (--ink --ink-soft --muted --line --line-soft --accent
// --accent-soft --paper --card --sunk --ok --ok-soft --bad --bad-soft --gold
// --gold-soft), никакого JS-рантайма внутри самих SVG.

/* ---------------------------------------------------------------- хелперы */

export function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function svgWrap(viewBox, slug, title, inner) {
  return `<svg viewBox="${viewBox}" width="100%" height="auto" preserveAspectRatio="xMidYMid meet" class="dg-${slug}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
${inner}
</svg>`;
}

export function arrowDefs(slug) {
  return `<marker id="${slug}-arrow" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--muted)"/></marker>
<marker id="${slug}-arrow-accent" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.6,5 Z" fill="var(--accent)"/></marker>`;
}

export function checkIcon(x, y, s) {
  const a = (x + s * 0.02).toFixed(1), b = (y + s * 0.55).toFixed(1);
  const c = (x + s * 0.4).toFixed(1), d = (y + s * 0.86).toFixed(1);
  const e = (x + s * 0.98).toFixed(1), f = (y + s * 0.16).toFixed(1);
  return `<path d="M${a},${b} L${c},${d} L${e},${f}" fill="none" stroke="var(--ok)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`;
}
export function crossIcon(x, y, s) {
  const x1 = x.toFixed(1), y1 = y.toFixed(1), x2 = (x + s).toFixed(1), y2 = (y + s).toFixed(1);
  return `<path d="M${x1},${y1} L${x2},${y2} M${x2},${y1} L${x1},${y2}" fill="none" stroke="var(--bad)" stroke-width="1.9" stroke-linecap="round"/>`;
}
