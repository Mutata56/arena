"""Конвейер генерации контента. Раздел 11 плана.

Заход 4а: очередь, воркер и лёгкие жанры (вопросы, карточки, чужой код, статьи).
Заход 4б: код-задачи с прогоном эталона, объективная проверка «что выведет»
и конспекты Obsidian для нод без своего файла.

Точки входа наружу:

- gen.trigger(conn, node_id) ставит задания при входе в ноду плюс опережение
  на пять нод по траектории;
- gen.worker.loop(cfg, stop) фоновая задача сервера;
- gen.worker.drain(cfg) разовый проход, его зовут CLI и ночной таймер.
"""

from __future__ import annotations

import sqlite3

from . import (claude, notes, plan, prompts, queue, runtime, selfcheck, validate,
               weak, worker)

__all__ = [
    "claude", "notes", "plan", "prompts", "queue", "runtime", "selfcheck", "validate",
    "weak", "worker", "trigger", "LOOKAHEAD",
]

LOOKAHEAD = plan.LOOKAHEAD


def trigger(conn: sqlite3.Connection, node_id: int, lookahead: int = plan.LOOKAHEAD) -> dict:
    """Вход в ноду: наполнить её и следующие пять по траектории.

    Ошибку глотаем намеренно. Эта функция висит на пути открытия экрана «Сегодня»,
    и споткнувшийся планировщик не имеет права уронить ежедневную петлю.
    """
    try:
        return plan.on_node_entered(conn, node_id, lookahead=lookahead)
    except Exception as exc:  # noqa: BLE001
        print(f"планировщик генерации споткнулся на ноде {node_id}: {exc}")
        return {"queued": [], "reserved": [], "nodes": 0, "error": str(exc)}
