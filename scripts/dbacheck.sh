#!/bin/bash
# Проверить все уже переписанные ноды DBA по живой базе.
# Признак «переписана» простой: в старом формате был раздел «## Цель», в новом его нет.
cd "$(dirname "$0")/.." || exit 1
V="$HOME/Документы/Obsidian Vault/DBA RoadMap"
grep -L '^## Цель' "$V"/*/[0-9]*.md > /tmp/dba-new-notes.txt
python3 - "$@" <<'PY'
import subprocess, sys, os
files = [l.rstrip("\n") for l in open("/tmp/dba-new-notes.txt") if l.strip()]
if not files:
    print("переписанных нод пока нет"); raise SystemExit(0)
root = os.getcwd()
r = subprocess.run([".venv/bin/python", "scripts/dbatool.py", "check", *files],
                   capture_output=True, text=True, cwd=root)
sys.stdout.write(r.stdout)
sys.stderr.write(r.stderr)
raise SystemExit(r.returncode)
PY
