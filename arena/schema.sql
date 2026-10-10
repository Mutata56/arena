-- Схема arena. Раздел 3 плана.
-- Таблицы будущих фаз заводим сразу, чтобы не мигрировать базу на каждом шаге.

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stages (
    id       INTEGER PRIMARY KEY,
    num      INTEGER NOT NULL UNIQUE,
    title    TEXT NOT NULL,
    hub_path TEXT NOT NULL,
    in_track INTEGER NOT NULL DEFAULT 0,
    -- Раздел сайта: java или dba. Номера этапов разведены смещением (см. config.Track),
    -- колонка нужна карте, чтобы не мешать разделы в одном списке.
    track    TEXT NOT NULL DEFAULT 'java'
);
CREATE INDEX IF NOT EXISTS idx_stages_track ON stages(track, num);

CREATE TABLE IF NOT EXISTS nodes (
    id            INTEGER PRIMARY KEY,
    stage_id      INTEGER NOT NULL REFERENCES stages(id),
    code          TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    kind          TEXT NOT NULL,
    obsidian_path TEXT,
    descr         TEXT,
    seq           INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'locked'
                  CHECK (status IN ('locked', 'available', 'in_progress', 'closed')),
    entered_at    TEXT,  -- время ПОСЛЕДНЕГО входа в ноду, обновляется на каждом входе
    closed_at     TEXT,
    -- Чем закрыта нода: atoms (прошёл банк), note (самоотметка с конспектом для
    -- рукописных и чтения JDK), note_empty (самоотметка там, где банк был пуст).
    -- note_empty это метка для фазы 4: такую ноду есть смысл добить вопросами.
    closed_by     TEXT,
    close_note    TEXT
);
CREATE INDEX IF NOT EXISTS idx_nodes_stage  ON nodes(stage_id, seq);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);

CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY,
    node_id    INTEGER REFERENCES nodes(id),
    stage_id   INTEGER REFERENCES stages(id),
    type       TEXT NOT NULL CHECK (type IN ('quiz', 'code', 'readcode', 'card', 'article')),
    payload    TEXT NOT NULL,
    difficulty INTEGER NOT NULL DEFAULT 0,
    source     TEXT NOT NULL CHECK (source IN ('import', 'gen', 'jcards', 'manual')),
    source_key TEXT,
    active     INTEGER NOT NULL DEFAULT 1,
    suspended  INTEGER NOT NULL DEFAULT 0,
    created    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_key ON items(source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_node  ON items(node_id, type, active);
CREATE INDEX IF NOT EXISTS idx_items_stage ON items(stage_id, type, active);

-- SM-2 отдельной таблицей: очередь по due выбирается индексом, а не json_extract.
CREATE TABLE IF NOT EXISTS card_state (
    item_id  INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    ease     REAL    NOT NULL DEFAULT 2.5,
    interval INTEGER NOT NULL DEFAULT 0,
    reps     INTEGER NOT NULL DEFAULT 0,
    lapses   INTEGER NOT NULL DEFAULT 0,
    due      TEXT,
    last     TEXT
);
CREATE INDEX IF NOT EXISTS idx_card_due ON card_state(due);

CREATE TABLE IF NOT EXISTS attempts (
    id      INTEGER PRIMARY KEY,
    item_id INTEGER REFERENCES items(id),
    node_id INTEGER REFERENCES nodes(id),
    kind    TEXT,
    ts      TEXT NOT NULL,
    correct INTEGER,
    result  TEXT,
    xp      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_attempts_item ON attempts(item_id, ts);
CREATE INDEX IF NOT EXISTS idx_attempts_ts   ON attempts(ts);
CREATE INDEX IF NOT EXISTS idx_attempts_node ON attempts(node_id, ts);

CREATE TABLE IF NOT EXISTS xp_ledger (
    id       INTEGER PRIMARY KEY,
    ts       TEXT NOT NULL,
    amount   INTEGER NOT NULL,
    reason   TEXT NOT NULL,
    ref_type TEXT,
    ref_id   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_xp_ts     ON xp_ledger(ts);
CREATE INDEX IF NOT EXISTS idx_xp_ref    ON xp_ledger(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_xp_reason ON xp_ledger(reason, ts);

CREATE TABLE IF NOT EXISTS days (
    date          TEXT PRIMARY KEY,
    contract_done INTEGER NOT NULL DEFAULT 0,
    quiz_count    INTEGER NOT NULL DEFAULT 0,
    cards_count   INTEGER NOT NULL DEFAULT 0,
    code_count    INTEGER NOT NULL DEFAULT 0,
    minutes       REAL    NOT NULL DEFAULT 0,
    xp            INTEGER NOT NULL DEFAULT 0,
    nodes_closed  INTEGER NOT NULL DEFAULT 0
);

-- Состояние код-задачи у ученика: где лежит папка решения, сколько раз он гонял
-- проверку и когда она впервые стала зелёной. Сама задача (постановка, тесты,
-- эталон) живёт в items.payload, здесь только прогресс.
CREATE TABLE IF NOT EXISTS code_tasks (
    item_id     INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    node_id     INTEGER REFERENCES nodes(id),
    dir_path    TEXT,
    issued_at   TEXT,
    checks      INTEGER NOT NULL DEFAULT 0,
    passed_at   TEXT,
    last_ts     TEXT,
    last_result TEXT
);
CREATE INDEX IF NOT EXISTS idx_code_tasks_node ON code_tasks(node_id);

-- outcome NULL это идущий сезон. mult и avg_node_xp хранятся, чтобы счёт
-- прошлого сезона можно было объяснить задним числом, а не поверить на слово.
CREATE TABLE IF NOT EXISTS seasons (
    id            INTEGER PRIMARY KEY,
    num           INTEGER NOT NULL UNIQUE,
    start         TEXT NOT NULL,
    end           TEXT NOT NULL,
    bot_plan_rate REAL,
    user_xp       INTEGER NOT NULL DEFAULT 0,
    bot_xp        INTEGER NOT NULL DEFAULT 0,
    outcome       TEXT CHECK (outcome IN ('win', 'loss', 'aborted')),
    summary       TEXT,
    mult          REAL,
    bot_nodes     INTEGER NOT NULL DEFAULT 0,
    user_nodes    INTEGER NOT NULL DEFAULT 0,
    avg_node_xp   REAL,
    closed_at     TEXT
);

CREATE TABLE IF NOT EXISTS bot_state (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    rate           REAL NOT NULL DEFAULT 1.0,
    mood           TEXT,
    nodes_closed   INTEGER NOT NULL DEFAULT 0,
    last_tick      TEXT,
    vacation_until TEXT,
    user_rate      REAL NOT NULL DEFAULT 0.5,
    carry          REAL NOT NULL DEFAULT 0,
    last_day       TEXT,
    losses         INTEGER NOT NULL DEFAULT 0,
    vacation_reason TEXT
);

-- Дневник бота: план на день, сколько нод он себе назначил и сколько уже закрыл.
-- schedule это список тиков (час и сколько нод), чтобы бот тикал в течение дня,
-- а не вываливал дневную норму одним куском в полночь.
CREATE TABLE IF NOT EXISTS bot_days (
    date      TEXT PRIMARY KEY,
    plan      REAL NOT NULL DEFAULT 0,
    target    INTEGER NOT NULL DEFAULT 0,
    done      INTEGER NOT NULL DEFAULT 0,
    schedule  TEXT,
    season_id INTEGER REFERENCES seasons(id)
);

-- Пачка реплик Опуса. Генерится раз в неделю, при пустой пачке работают шаблоны.
CREATE TABLE IF NOT EXISTS taunts (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL,
    text       TEXT NOT NULL,
    source     TEXT NOT NULL,
    created    TEXT NOT NULL,
    used_at    TEXT,
    used_count INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_taunts_uniq ON taunts(kind, text);
CREATE INDEX IF NOT EXISTS idx_taunts_pick ON taunts(kind, used_count, used_at);

-- Раскатка после паузы (раздел 6): пониженный контракт на пару дней.
CREATE TABLE IF NOT EXISTS rollout (
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    since     TEXT,
    until     TEXT,
    gap_days  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bot_events (
    id   INTEGER PRIMARY KEY,
    ts   TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    xp   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bot_events_ts ON bot_events(ts);

-- kind='stage' это босс этапа, kind='field' это полевой босс (реальное собеседование),
-- у него нет этапа, зато есть анкета разбора.
-- status ведёт живую попытку: quiz (идёт квиз-часть), code (квизы сданы, идёт код-часть),
-- done (посчитан ранг). questions это список id вопросов варианта, answers это ответы,
-- weak это карта проваленных тем, из которой собирается мини-сет к реваншу.
CREATE TABLE IF NOT EXISTS bosses (
    id         INTEGER PRIMARY KEY,
    stage_id   INTEGER REFERENCES stages(id),
    kind       TEXT NOT NULL DEFAULT 'stage',
    attempt_no INTEGER NOT NULL,
    ts         TEXT NOT NULL,
    questions  TEXT,
    score      REAL,
    time_sec   INTEGER,
    rank       TEXT,
    passed     INTEGER NOT NULL DEFAULT 0,
    survey     TEXT,
    status       TEXT NOT NULL DEFAULT 'quiz',
    started_at   TEXT,
    quiz_done_at TEXT,
    finished_at  TEXT,
    answers      TEXT,
    code_items   TEXT,
    weak         TEXT,
    quiz_total   INTEGER NOT NULL DEFAULT 0,
    quiz_correct INTEGER NOT NULL DEFAULT 0,
    code_total   INTEGER NOT NULL DEFAULT 0,
    code_green   INTEGER NOT NULL DEFAULT 0,
    quiz_sec     INTEGER NOT NULL DEFAULT 0,
    code_sec     INTEGER NOT NULL DEFAULT 0,
    xp           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bosses_stage ON bosses(stage_id, attempt_no);

-- Мини-сет по проваленным темам: то, чем занят день до реванша (раздел 7).
-- Вопросы и карточки лежат ссылками на items, отдельного контента у мини-сета нет.
CREATE TABLE IF NOT EXISTS boss_minisets (
    id       INTEGER PRIMARY KEY,
    boss_id  INTEGER NOT NULL REFERENCES bosses(id),
    stage_id INTEGER REFERENCES stages(id),
    topics   TEXT,
    quiz_ids TEXT,
    card_ids TEXT,
    created  TEXT NOT NULL,
    done_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_minisets_boss ON boss_minisets(boss_id);

-- Кнопка «разобрал с ИИ» после сдачи: короткое резюме и 30 XP один раз на сдачу.
-- ref_type пока boss, фаза 7 подключит сюда же ТЗ.
CREATE TABLE IF NOT EXISTS reviews (
    id       INTEGER PRIMARY KEY,
    ref_type TEXT NOT NULL CHECK (ref_type IN ('boss', 'tz')),
    ref_id   INTEGER NOT NULL,
    summary  TEXT NOT NULL,
    xp       INTEGER NOT NULL DEFAULT 0,
    ts       TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_ref ON reviews(ref_type, ref_id);

CREATE TABLE IF NOT EXISTS defenses (
    id        INTEGER PRIMARY KEY,
    ref_type  TEXT NOT NULL CHECK (ref_type IN ('boss', 'tz', 'field')),
    ref_id    INTEGER NOT NULL,
    questions TEXT,
    answers   TEXT,
    grade     TEXT,
    xp        INTEGER NOT NULL DEFAULT 0,
    ts        TEXT NOT NULL
);

-- Банк постановок ТЗ. Правило раздела 10 и 11: в банк попадает только то,
-- у чего эталонное решение прогнано против скрытых тестов и зелёное.
-- payload это JSON: стартовые файлы, скрытые тесты, эталон, темы этапа,
-- обязательные конструкции и машинные проверки к ним.
CREATE TABLE IF NOT EXISTS tz_specs (
    id          INTEGER PRIMARY KEY,
    stage_id    INTEGER NOT NULL REFERENCES stages(id),
    slug        TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    spec_md     TEXT NOT NULL,
    payload     TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT 'gen',
    verified_at TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    created     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tz_specs_stage ON tz_specs(stage_id, active);

-- Выданное ученику ТЗ: где лежит папка, сколько раз он сдавал, что сказало ревью.
CREATE TABLE IF NOT EXISTS tz_projects (
    id       INTEGER PRIMARY KEY,
    stage_id INTEGER NOT NULL REFERENCES stages(id),
    title    TEXT NOT NULL,
    spec_md  TEXT,
    dir_path TEXT,
    status   TEXT NOT NULL DEFAULT 'issued'
             CHECK (status IN ('issued', 'submitted', 'accepted', 'rework')),
    review   TEXT,
    ts       TEXT NOT NULL,
    spec_id      INTEGER REFERENCES tz_specs(id),
    submitted_at TEXT,
    accepted_at  TEXT,
    checks       INTEGER NOT NULL DEFAULT 0,
    xp           INTEGER NOT NULL DEFAULT 0,
    last_result  TEXT
);
CREATE INDEX IF NOT EXISTS idx_tz_projects_stage ON tz_projects(stage_id, status);

CREATE TABLE IF NOT EXISTS gen_queue (
    id          INTEGER PRIMARY KEY,
    node_id     INTEGER REFERENCES nodes(id),
    stage_id    INTEGER REFERENCES stages(id),
    kind        TEXT NOT NULL,
    params      TEXT,
    priority    INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'done', 'failed', 'deferred')),
    attempts    INTEGER NOT NULL DEFAULT 0,
    retry_after TEXT,
    created     TEXT NOT NULL,
    -- Когда задание ушло в работу. По этой отметке подбираются задания, брошенные
    -- упавшим процессом: сбрасывать все running подряд нельзя, соседний процесс
    -- может прямо сейчас держать вызов модели.
    started_at  TEXT,
    done_at     TEXT,
    error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_gen_queue_status ON gen_queue(status, retry_after);
-- Производителей у очереди два (вход в ноду и ночной таймер), поэтому живое задание
-- на одну и ту же работу может быть только одно.
-- COALESCE обязателен: в SQLite два NULL не конфликтуют, а stage_id у нодовых заданий пуст.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gen_queue_pending
    ON gen_queue(COALESCE(node_id, -1), COALESCE(stage_id, -1), kind)
    WHERE status IN ('pending', 'running', 'deferred');

-- Журнал вызовов модели. Хранит промпт и сырой ответ: раздел 11 требует, чтобы
-- невалидный ответ уходил в failed «с логом сырого ответа», иначе разбирать нечего.
-- Промпт лежит рядом по той же причине: по нему видно, какие слабые места ученика
-- реально доехали до генератора.
CREATE TABLE IF NOT EXISTS gen_log (
    id       INTEGER PRIMARY KEY,
    queue_id INTEGER,
    node_id  INTEGER REFERENCES nodes(id),
    stage_id INTEGER REFERENCES stages(id),
    kind     TEXT NOT NULL,
    ts       TEXT NOT NULL,
    status   TEXT NOT NULL,
    model    TEXT,
    seconds  REAL,
    cost     REAL,
    produced INTEGER NOT NULL DEFAULT 0,
    rejected INTEGER NOT NULL DEFAULT 0,
    prompt   TEXT,
    raw      TEXT,
    error    TEXT
);
CREATE INDEX IF NOT EXISTS idx_gen_log_ts     ON gen_log(ts);
CREATE INDEX IF NOT EXISTS idx_gen_log_target ON gen_log(node_id, kind, ts);

CREATE TABLE IF NOT EXISTS campaign (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    start_date   TEXT,
    target_days  INTEGER NOT NULL DEFAULT 180,
    checkpoint_at TEXT,
    renegotiated INTEGER NOT NULL DEFAULT 0,
    branch_months INTEGER,
    checkpoint_seen_at TEXT
);
