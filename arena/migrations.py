"""Миграции схемы.

`CREATE TABLE IF NOT EXISTS` молча не замечает новых колонок, поэтому правка схемы
доехала бы до свежей песочницы и не доехала бы до боевой базы. Версия хранится
в PRAGMA user_version, шаги применяются по порядку в одной транзакции.

Добавляя шаг: увеличь TARGET_VERSION и допиши список SQL в STEPS.
Шаги должны быть безопасны для базы с данными: только ALTER, CREATE, UPDATE.
"""

from __future__ import annotations

import sqlite3

TARGET_VERSION = 10

STEPS: dict[int, list[str]] = {
    # 1 -> 2: то, чего не хватило фазам 2, 4, 5 и 8 по итогам ревью фазы 1.
    2: [
        # Какая нода «текущая»: правило 3 раздела 4 плана требует отметку времени входа.
        "ALTER TABLE nodes ADD COLUMN started_at TEXT",
        # Разбор XP по контексту: без node_id и вида попытки не посчитать ни анти-фарм,
        # ни нодовый XP бота для сезонного счёта (раздел 9).
        "ALTER TABLE attempts ADD COLUMN node_id INTEGER REFERENCES nodes(id)",
        "ALTER TABLE attempts ADD COLUMN kind TEXT",
        "CREATE INDEX IF NOT EXISTS idx_attempts_node ON attempts(node_id, ts)",
        "CREATE INDEX IF NOT EXISTS idx_xp_ref ON xp_ledger(ref_type, ref_id)",
        "CREATE INDEX IF NOT EXISTS idx_xp_reason ON xp_ledger(reason, ts)",
        # Очередь генерации: параметры задания, приоритет и защита от дублей.
        # Производителей два (вход в ноду и ночной таймер), дубли иначе гарантированы.
        "ALTER TABLE gen_queue ADD COLUMN params TEXT",
        "ALTER TABLE gen_queue ADD COLUMN priority INTEGER NOT NULL DEFAULT 0",
        # COALESCE обязателен: два NULL в SQLite не конфликтуют, а stage_id у нодовых заданий пуст.
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_gen_queue_pending "
        "ON gen_queue(COALESCE(node_id, -1), COALESCE(stage_id, -1), kind) "
        "WHERE status IN ('pending', 'running', 'deferred')",
        # Полевой босс не привязан к этапу, а его защита это отдельный вид.
        "ALTER TABLE bosses ADD COLUMN kind TEXT NOT NULL DEFAULT 'stage'",
        "ALTER TABLE bosses ADD COLUMN survey TEXT",
        "CREATE TABLE IF NOT EXISTS defenses_new ("
        " id INTEGER PRIMARY KEY,"
        " ref_type TEXT NOT NULL CHECK (ref_type IN ('boss', 'tz', 'field')),"
        " ref_id INTEGER NOT NULL,"
        " questions TEXT, answers TEXT, grade TEXT,"
        " xp INTEGER NOT NULL DEFAULT 0, ts TEXT NOT NULL)",
        "INSERT INTO defenses_new(id, ref_type, ref_id, questions, answers, grade, xp, ts) "
        "SELECT id, ref_type, ref_id, questions, answers, grade, xp, ts FROM defenses",
        "DROP TABLE defenses",
        "ALTER TABLE defenses_new RENAME TO defenses",
        # bosses.stage_id был NOT NULL: полевому боссу этап не нужен.
        "CREATE TABLE IF NOT EXISTS bosses_new ("
        " id INTEGER PRIMARY KEY,"
        " stage_id INTEGER REFERENCES stages(id),"
        " kind TEXT NOT NULL DEFAULT 'stage',"
        " attempt_no INTEGER NOT NULL,"
        " ts TEXT NOT NULL, questions TEXT, score REAL, time_sec INTEGER,"
        " rank TEXT, passed INTEGER NOT NULL DEFAULT 0, survey TEXT)",
        "INSERT INTO bosses_new(id, stage_id, kind, attempt_no, ts, questions, score, time_sec, rank, passed, survey) "
        "SELECT id, stage_id, kind, attempt_no, ts, questions, score, time_sec, rank, passed, survey FROM bosses",
        "DROP TABLE bosses",
        "ALTER TABLE bosses_new RENAME TO bosses",
    ],
    # 2 -> 3: колонка называется по смыслу. Это время последнего входа в ноду,
    # по нему правило 3 раздела 4 выбирает текущую ноду, когда открыто несколько.
    3: [
        "ALTER TABLE nodes RENAME COLUMN started_at TO entered_at",
    ],
    # С третьей версии на четвёртую: чем именно закрыта нода и что ученик написал.
    # closed_by различает честное прохождение банка и самоотметку, а среди самоотметок
    # отдельно помечает случай пустого банка: такую ноду фаза 4 может добить вопросами.
    # Тип пишем голым TEXT без DEFAULT и NOT NULL: в schema.sql ровно так же,
    # иначе приёмка фазы 1 поймает расхождение формы свежей и мигрированной базы.
    4: [
        "ALTER TABLE nodes ADD COLUMN closed_by TEXT",
        "ALTER TABLE nodes ADD COLUMN close_note TEXT",
    ],
    # 4 -> 5: код-задачи фазы 3.
    5: [
        "CREATE TABLE IF NOT EXISTS code_tasks ("
        " item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,"
        " node_id INTEGER REFERENCES nodes(id),"
        " dir_path TEXT, issued_at TEXT,"
        " checks INTEGER NOT NULL DEFAULT 0,"
        " passed_at TEXT, last_ts TEXT, last_result TEXT)",
        "CREATE INDEX IF NOT EXISTS idx_code_tasks_node ON code_tasks(node_id)",
    ],
    # 5 -> 6: соперник, сезоны и кампания (фаза 5, раздел 9 плана).
    6: [
        # Миграции идут ДО schema.sql, поэтому таблицы, которых в старой базе
        # ещё нет, надо поднять в дошестом виде: иначе ALTER падает на пустоте.
        # На боевой базе это no-op, там таблицы созданы схемой первой фазы.
        "CREATE TABLE IF NOT EXISTS bot_state ("
        " id INTEGER PRIMARY KEY CHECK (id = 1),"
        " rate REAL NOT NULL DEFAULT 1.0, mood TEXT,"
        " nodes_closed INTEGER NOT NULL DEFAULT 0,"
        " last_tick TEXT, vacation_until TEXT)",
        "CREATE TABLE IF NOT EXISTS seasons ("
        " id INTEGER PRIMARY KEY, num INTEGER NOT NULL UNIQUE,"
        " start TEXT NOT NULL, end TEXT NOT NULL, bot_plan_rate REAL,"
        " user_xp INTEGER NOT NULL DEFAULT 0, bot_xp INTEGER NOT NULL DEFAULT 0,"
        " outcome TEXT CHECK (outcome IN ('win', 'loss', 'aborted')), summary TEXT)",
        "CREATE TABLE IF NOT EXISTS campaign ("
        " id INTEGER PRIMARY KEY CHECK (id = 1), start_date TEXT,"
        " target_days INTEGER NOT NULL DEFAULT 180, checkpoint_at TEXT,"
        " renegotiated INTEGER NOT NULL DEFAULT 0)",
        # Темп ученика и накопитель дробных нод бота держим рядом с ботом:
        # это его внутренняя кухня, а не статистика ученика.
        "ALTER TABLE bot_state ADD COLUMN user_rate REAL NOT NULL DEFAULT 0.5",
        "ALTER TABLE bot_state ADD COLUMN carry REAL NOT NULL DEFAULT 0",
        "ALTER TABLE bot_state ADD COLUMN last_day TEXT",
        "ALTER TABLE bot_state ADD COLUMN losses INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE bot_state ADD COLUMN vacation_reason TEXT",
        # Сезон хранит и множитель плана, и то, из чего сложился счёт:
        # без этого историю сезона нельзя объяснить задним числом.
        "ALTER TABLE seasons ADD COLUMN mult REAL",
        "ALTER TABLE seasons ADD COLUMN bot_nodes INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE seasons ADD COLUMN user_nodes INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE seasons ADD COLUMN avg_node_xp REAL",
        "ALTER TABLE seasons ADD COLUMN closed_at TEXT",
        # Ветка горизонта, выбранная на чекпоинте 60-го дня.
        "ALTER TABLE campaign ADD COLUMN branch_months INTEGER",
        "ALTER TABLE campaign ADD COLUMN checkpoint_seen_at TEXT",
        "CREATE TABLE IF NOT EXISTS bot_days ("
        " date TEXT PRIMARY KEY,"
        " plan REAL NOT NULL DEFAULT 0,"
        " target INTEGER NOT NULL DEFAULT 0,"
        " done INTEGER NOT NULL DEFAULT 0,"
        " schedule TEXT,"
        " season_id INTEGER REFERENCES seasons(id))",
        "CREATE TABLE IF NOT EXISTS taunts ("
        " id INTEGER PRIMARY KEY,"
        " kind TEXT NOT NULL,"
        " text TEXT NOT NULL,"
        " source TEXT NOT NULL,"
        " created TEXT NOT NULL,"
        " used_at TEXT,"
        " used_count INTEGER NOT NULL DEFAULT 0)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_taunts_uniq ON taunts(kind, text)",
        "CREATE INDEX IF NOT EXISTS idx_taunts_pick ON taunts(kind, used_count, used_at)",
        "CREATE TABLE IF NOT EXISTS rollout ("
        " id INTEGER PRIMARY KEY CHECK (id = 1),"
        " since TEXT,"
        " until TEXT,"
        " gap_days INTEGER NOT NULL DEFAULT 0)",
    ],
    # 6 -> 7: конвейер генерации (заход 4а).
    # Ему нужны две вещи: отметка времени, когда задание ушло в работу
    # (по ней подбираются задания, брошенные упавшим процессом), и журнал вызовов
    # с сырым ответом модели. Сырой ответ обязателен по разделу 11: невалид уходит
    # в failed «с логом сырого ответа», иначе разбирать нечего.
    7: [
        "ALTER TABLE gen_queue ADD COLUMN started_at TEXT",
        "CREATE TABLE IF NOT EXISTS gen_log ("
        " id INTEGER PRIMARY KEY,"
        " queue_id INTEGER,"
        " node_id INTEGER REFERENCES nodes(id),"
        " stage_id INTEGER REFERENCES stages(id),"
        " kind TEXT NOT NULL,"
        " ts TEXT NOT NULL,"
        " status TEXT NOT NULL,"
        " model TEXT,"
        " seconds REAL,"
        " cost REAL,"
        " produced INTEGER NOT NULL DEFAULT 0,"
        " rejected INTEGER NOT NULL DEFAULT 0,"
        " prompt TEXT,"
        " raw TEXT,"
        " error TEXT)",
        "CREATE INDEX IF NOT EXISTS idx_gen_log_ts ON gen_log(ts)",
        "CREATE INDEX IF NOT EXISTS idx_gen_log_target ON gen_log(node_id, kind, ts)",
    ],
    # 7 -> 8: боссы и защита (фаза 6, разделы 7 и 8 плана).
    # Типы колонок повторяют schema.sql слово в слово: приёмка фазы 1 сверяет
    # форму свежей и мигрированной базы по типу, notnull, default и pk.
    8: [
        "ALTER TABLE bosses ADD COLUMN status TEXT NOT NULL DEFAULT 'quiz'",
        "ALTER TABLE bosses ADD COLUMN started_at TEXT",
        "ALTER TABLE bosses ADD COLUMN quiz_done_at TEXT",
        "ALTER TABLE bosses ADD COLUMN finished_at TEXT",
        "ALTER TABLE bosses ADD COLUMN answers TEXT",
        "ALTER TABLE bosses ADD COLUMN code_items TEXT",
        "ALTER TABLE bosses ADD COLUMN weak TEXT",
        "ALTER TABLE bosses ADD COLUMN quiz_total INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE bosses ADD COLUMN quiz_correct INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE bosses ADD COLUMN code_total INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE bosses ADD COLUMN code_green INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE bosses ADD COLUMN quiz_sec INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE bosses ADD COLUMN code_sec INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE bosses ADD COLUMN xp INTEGER NOT NULL DEFAULT 0",
        "CREATE INDEX IF NOT EXISTS idx_bosses_stage ON bosses(stage_id, attempt_no)",
        "CREATE TABLE IF NOT EXISTS boss_minisets ("
        " id INTEGER PRIMARY KEY,"
        " boss_id INTEGER NOT NULL REFERENCES bosses(id),"
        " stage_id INTEGER REFERENCES stages(id),"
        " topics TEXT, quiz_ids TEXT, card_ids TEXT,"
        " created TEXT NOT NULL, done_at TEXT)",
        "CREATE INDEX IF NOT EXISTS idx_minisets_boss ON boss_minisets(boss_id)",
        "CREATE TABLE IF NOT EXISTS reviews ("
        " id INTEGER PRIMARY KEY,"
        " ref_type TEXT NOT NULL CHECK (ref_type IN ('boss', 'tz')),"
        " ref_id INTEGER NOT NULL,"
        " summary TEXT NOT NULL,"
        " xp INTEGER NOT NULL DEFAULT 0,"
        " ts TEXT NOT NULL)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_ref ON reviews(ref_type, ref_id)",
    ],
    # 8 -> 9: ТЗ-цех (фаза 7, раздел 10 плана). Номер девять освободился при слиянии:
    # заходу 4б миграция не понадобилась, пустая заглушка убрана вместе с дырой.
    # tz_specs это банк постановок: в него принимается только то, у чего эталон
    # прогнан и зелёный. tz_projects это выданное ученику: где лежит папка,
    # сколько раз сдавал, что сказало ревью.
    # Типы колонок повторяют schema.sql слово в слово: приёмка фазы 1 сверяет
    # форму свежей и мигрированной базы по типу, notnull, default и pk.
    9: [
        "CREATE TABLE IF NOT EXISTS tz_specs ("
        " id INTEGER PRIMARY KEY,"
        " stage_id INTEGER NOT NULL REFERENCES stages(id),"
        " slug TEXT NOT NULL UNIQUE,"
        " title TEXT NOT NULL,"
        " spec_md TEXT NOT NULL,"
        " payload TEXT NOT NULL,"
        " source TEXT NOT NULL DEFAULT 'gen',"
        " verified_at TEXT,"
        " active INTEGER NOT NULL DEFAULT 1,"
        " created TEXT NOT NULL)",
        "CREATE INDEX IF NOT EXISTS idx_tz_specs_stage ON tz_specs(stage_id, active)",
        # Миграции идут ДО schema.sql, поэтому таблицу, которой в старой базе
        # ещё нет, поднимаем в додесятом виде: иначе ALTER падает на пустоте.
        # На боевой базе это no-op, там она создана схемой первой фазы.
        "CREATE TABLE IF NOT EXISTS tz_projects ("
        " id INTEGER PRIMARY KEY,"
        " stage_id INTEGER NOT NULL REFERENCES stages(id),"
        " title TEXT NOT NULL,"
        " spec_md TEXT,"
        " dir_path TEXT,"
        " status TEXT NOT NULL DEFAULT 'issued'"
        "  CHECK (status IN ('issued', 'submitted', 'accepted', 'rework')),"
        " review TEXT,"
        " ts TEXT NOT NULL)",
        "ALTER TABLE tz_projects ADD COLUMN spec_id INTEGER REFERENCES tz_specs(id)",
        "ALTER TABLE tz_projects ADD COLUMN submitted_at TEXT",
        "ALTER TABLE tz_projects ADD COLUMN accepted_at TEXT",
        "ALTER TABLE tz_projects ADD COLUMN checks INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE tz_projects ADD COLUMN xp INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE tz_projects ADD COLUMN last_result TEXT",
        "CREATE INDEX IF NOT EXISTS idx_tz_projects_stage ON tz_projects(stage_id, status)",
    ],
    # 9 -> 10: второй раздел сайта. Треков стало два (Java и DBA), а таблица этапов
    # одна. Колонка нужна не для уникальности — её обеспечивает смещение номеров, —
    # а чтобы карта могла показать один раздел, не показывая чужой.
    10: [
        "ALTER TABLE stages ADD COLUMN track TEXT NOT NULL DEFAULT 'java'",
        "CREATE INDEX IF NOT EXISTS idx_stages_track ON stages(track, num)",
    ],
}


def current_version(conn: sqlite3.Connection) -> int:
    return conn.execute("PRAGMA user_version").fetchone()[0]


def apply(conn: sqlite3.Connection) -> list[int]:
    """Догнать схему до TARGET_VERSION. Возвращает список применённых версий."""
    version = current_version(conn)
    if version >= TARGET_VERSION:
        return []
    # Первая версия это базовая схема из schema.sql, шага у неё нет по определению.
    missing = [s for s in range(max(version + 1, 2), TARGET_VERSION + 1) if s not in STEPS]
    if missing:
        # Мина параллельной разработки: раньше пропущенный шаг молча считался
        # выполненным, и база уезжала на версию вперёд без чужих таблиц. Теперь
        # это громкая ошибка, а не тихая порча данных.
        raise SystemExit(
            f"в STEPS нет шагов {missing}, а версия базы {version} из {TARGET_VERSION}. "
            f"Похоже, ветки фаз не сведены: слей их и повтори"
        )
    applied: list[int] = []
    for step in range(version + 1, TARGET_VERSION + 1):
        statements = STEPS.get(step, [])
        conn.execute("BEGIN")
        try:
            for sql in statements:
                conn.execute(sql)
            conn.execute(f"PRAGMA user_version = {step}")
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        applied.append(step)
    return applied
