/* Тонкая обёртка над ядром. Никакой своей логики: только запрос и разбор ошибки. */

async function call(path, body, method) {
  const opts = body === undefined
    ? { method: method || "GET" }
    : {
        method: method || "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      };
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.detail) || res.statusText || "запрос не прошёл");
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  today: () => call("/api/today"),
  map: () => call("/api/map"),
  stage: (num) => call(`/api/map/stage/${num}`),
  node: (code) => call(`/api/node/${encodeURIComponent(code)}`),
  enterNode: (code) => call(`/api/node/${encodeURIComponent(code)}/enter`, {}),
  closeNode: (code, note) => call(`/api/node/${encodeURIComponent(code)}/close`, { note }),
  knowNode: (code) => call(`/api/node/${encodeURIComponent(code)}/know`, {}),
  knowNodes: (codes) => call("/api/nodes/know", { codes }),
  answerQuiz: (itemId, choice) => call("/api/quiz/answer", { item_id: itemId, choice }),
  answerCard: (itemId, grade) => call("/api/cards/answer", { item_id: itemId, grade }),
  suspend: (itemId) => call(`/api/items/${itemId}/suspend`, {}),
  reviewPlan: () => call("/api/review/plan"),
  reviewQueue: (limit = 20, kind) =>
    call(`/api/review/queue?limit=${limit}${kind ? `&kind=${kind}` : ""}`),
  genNow: () => call("/api/gen/now"),
  genKick: (code) => call(`/api/gen/kick${code ? `?code=${encodeURIComponent(code)}` : ""}`, {}),

  // прослойка сайта
  note: (code) => call(`/api/site/note/${encodeURIComponent(code)}`),
  wiki: (name) => call(`/api/site/wiki?name=${encodeURIComponent(name)}`),
  nodeItems: (code) => call(`/api/site/node/${encodeURIComponent(code)}/items`),
  task: (itemId) => call(`/api/site/task/${itemId}`),
  tryTask: (itemId, files) => call(`/api/site/task/${itemId}/try`, { files }),
  checkTask: (itemId, files) => call(`/api/site/task/${itemId}/check`, { files }),
  run: (files, main, args, stdin) =>
    call("/api/site/run", { files, main, args: args || [], stdin: stdin || "" }),
  term: (sid, files, cmd) => call("/api/site/term", { sid, files, cmd }),

  // задачник SQL
  tracks: () => call("/api/tracks"),
  mapTrack: (track) => call(`/api/map?track=${encodeURIComponent(track || "java")}`),
  sqlStatus: () => call("/api/site/sql/status"),
  sql: (sql, dataset, mode, sid) =>
    call("/api/site/sql", { sql, dataset: dataset || "wms", mode: mode || "rollback", sid }),
  sqlReset: (sid, dataset) => call("/api/site/sql/reset", { sid, dataset: dataset || "wms" }),
  sqlScenario: (steps, dataset) =>
    call("/api/site/sql/scenario", { steps, dataset: dataset || "wms" }),
};

export default api;
