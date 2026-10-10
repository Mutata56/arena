#!/bin/bash
# Держать банк вопросов раздела DBA в ногу с конспектами.
#
# Конвейер сам ставит задания при входе ученика в ноду, но раздел пишется
# пачками и заходить в каждую ноду руками некому. Цикл раз в несколько минут
# смотрит, у каких переписанных нод банк неполон, доставляет задания и разбирает
# очередь. Останавливается, когда доставлять стало нечего.
cd "$(dirname "$0")/.." || exit 1
export ARENA_STATE_DIR="${ARENA_STATE_DIR:-$HOME/projects/arena/state}"
export ARENA_CLAUDE_BIN="${ARENA_CLAUDE_BIN:-$HOME/.local/bin/claude}"
idle=0
while [ "$idle" -lt 3 ]; do
  queued=$(.venv/bin/python - <<'PY'
import sqlite3
from arena import config, db
from arena.gen import plan
cfg = config.load(); conn = db.init(cfg); conn.row_factory = sqlite3.Row
rows = conn.execute(
    "SELECT n.* FROM nodes n JOIN stages s ON s.id = n.stage_id "
    "WHERE s.track = 'dba' AND n.obsidian_path IS NOT NULL ORDER BY n.code").fetchall()
n = 0
for row in rows:
    p = cfg.vault_root / row["obsidian_path"]
    if not p.is_file():
        continue
    # По конспекту старого формата генерить нечего: в нём нет ни примеров, ни задач.
    if "\n## Цель" in p.read_text(encoding="utf-8", errors="replace"):
        continue
    n += len(plan.plan_node(conn, row, distance=0)["queued"])
conn.commit(); conn.close()
print(n)
PY
)
  echo "$(date +%H:%M:%S) доставлено заданий: $queued"
  if [ "$queued" = "0" ]; then idle=$((idle + 1)); else idle=0; fi
  .venv/bin/python -m arena gen --drain --limit 200 >> /tmp/dba-gen-loop.log 2>&1
  sleep 60
done
echo "$(date +%H:%M:%S) доставлять больше нечего, цикл завершён"
