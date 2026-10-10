"""Пути и профили запуска.

Профилей два: prod и dev. Переключение через ARENA_ENV=dev или флаг --sandbox.
Профиль меняет сразу три корня: где лежит база, куда материализуются задачи
и пишем ли мы в волт Obsidian. В песочнице волт не трогаем вообще.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

HOME = Path.home()
PROJECT_ROOT = Path(__file__).resolve().parent.parent

DEFAULT_VAULT = HOME / ".local" / "state" / "arena-dev" / "vault"
ROADMAP_SUBDIR = "Java RoadMap"

# Этапы собеседного минимума (раздел 4 плана): по ним идёт траектория и lookahead.
TRACK_STAGES = tuple(list(range(1, 10)) + [12] + list(range(15, 20)))


@dataclass(frozen=True)
class Track:
    """Раздел сайта: свой роадмап в волте, свой движок задачника.

    Треков в базе два, а таблица нод одна, и код ноды в ней уникален глобально.
    Разводим адреса, а не схему: номер этапа уезжает на `stage_offset`, код ноды
    получает `code_prefix`. Так «2.03» из Java и «2.03» из DBA живут рядом,
    не задевая друг друга, и весь движок прогресса остаётся нетронутым.
    """
    key: str
    title: str
    subtitle: str
    subdir: str
    stage_offset: int
    code_prefix: str
    # Основная траектория, контракт дня и открытие этапов по боссу — это про Java.
    # У второго раздела свободный ход: все ноды сразу доступны.
    in_track: bool
    # Чем гоняется задачник: javac/java или живой SQL-движок.
    lang: str
    # Пускать ли на трек конвейер генерации.
    gen: bool = True
    # Папка со своими промптами внутри prompts/. Пусто — берутся общие (они под
    # Java). У SQL свои: и предметка другая, и главная ценность вопроса часто
    # в том, чем расходятся диалекты.
    prompt_dir: str = ""
    # Жанры, которые конвейер делает для этого трека. Пусто — все.
    # У DBA нет «код-задачи»: её место занял фенс ```запрос``` прямо в конспекте,
    # он гоняется живым движком и проверен эталоном. И нет «конспекта»: все ноды
    # раздела написаны руками, генерить их поверх незачем.
    genres: tuple[str, ...] = ()

    def db_num(self, vault_num: int) -> int:
        return vault_num + self.stage_offset

    def vault_num(self, db_num: int) -> int:
        return db_num - self.stage_offset

    def db_code(self, vault_code: str) -> str:
        return f"{self.code_prefix}{vault_code}"

    def owns_stage(self, db_num: int) -> bool:
        return self.stage_offset < db_num <= self.stage_offset + STAGE_SPAN


# Сколько номеров этапов резервируем под один трек. Java занимает 1..26,
# следующий трек начинается со 101 — запас на рост есть у обоих.
STAGE_SPAN = 100

TRACKS: tuple[Track, ...] = (
    Track(key="java", title="Java", subtitle="путь к джуну",
          subdir=ROADMAP_SUBDIR, stage_offset=0, code_prefix="", in_track=True,
          lang="java", gen=True),
    Track(key="dba", title="DBA", subtitle="SQL Server и PostgreSQL",
          subdir="DBA RoadMap", stage_offset=100, code_prefix="d", in_track=False,
          lang="sql", gen=True, prompt_dir="sql",
          genres=("quiz", "cards", "readcode")),
)

TRACK_BY_KEY = {t.key: t for t in TRACKS}
DEFAULT_TRACK = TRACKS[0]


def track_of_stage(db_num: int) -> Track:
    """Какому треку принадлежит этап с таким номером в базе."""
    for t in TRACKS:
        if t.owns_stage(db_num):
            return t
    return DEFAULT_TRACK


def track_of_code(code: str) -> Track:
    """Какому треку принадлежит нода с таким кодом. Префикс длиннее — проверяем первым."""
    for t in sorted(TRACKS, key=lambda x: -len(x.code_prefix)):
        if t.code_prefix and code.startswith(t.code_prefix):
            return t
    return DEFAULT_TRACK

NODE_KINDS = ("тема", "практика", "тест", "чтение JDK", "рукописная", "проект", "повторение")


@dataclass(frozen=True)
class Config:
    env: str
    state_dir: Path
    db_path: Path
    backup_dir: Path
    vault_root: Path
    roadmap_dir: Path
    tasks_root: Path
    runs_root: Path
    write_vault: bool
    import_archive: Path
    jcards_db: Path
    downloads_dir: Path
    overrides: tuple[str, ...] = ()

    @property
    def is_sandbox(self) -> bool:
        return self.env != "prod"

    def track_dir(self, track: "Track") -> Path:
        """Папка роадмапа трека. У Java она может быть перекрыта ARENA_ROADMAP_DIR,
        остальные треки всегда живут в волте под своим именем."""
        if track.key == DEFAULT_TRACK.key:
            return self.roadmap_dir
        return self.vault_root / track.subdir

    def describe(self) -> str:
        mode = "песочница" if self.is_sandbox else "боевой"
        line = f"профиль {self.env} ({mode}), база {self.db_path}"
        if self.overrides:
            line += "\nпеременные окружения перекрывают профиль: " + ", ".join(self.overrides)
        return line


# /tmp и /var/tmp юниту подменяются свойством PrivateTmp, и рабочая папка прогона
# внутри них перестаёт существовать: systemd не собирает пространство имён и падает
# с кодом 226. Поэтому папки прогонов при таком стейте уезжают в ~/.cache.
PRIVATE_TMP_ROOTS = ("/tmp", "/var/tmp")


def runs_root(state_dir: Path, env: str) -> Path:
    explicit = os.environ.get("ARENA_RUNS_ROOT")
    if explicit:
        return Path(explicit)
    resolved = str(state_dir.resolve() if state_dir.exists() else state_dir)
    if any(resolved == root or resolved.startswith(root + "/") for root in PRIVATE_TMP_ROOTS):
        return HOME / ".cache" / ("arena" if env == "prod" else "arena-dev") / "runs"
    return state_dir / "runs"


def load(env: str | None = None, sandbox: bool = False) -> Config:
    """Собрать конфиг. Явные переменные окружения перекрывают дефолты профиля."""
    if env is None:
        env = "dev" if sandbox else os.environ.get("ARENA_ENV", "dev").strip().lower()
    if env not in ("prod", "dev"):
        raise SystemExit(f"неизвестный ARENA_ENV={env!r}, допустимы prod и dev")

    overrides = tuple(
        name for name in (
            "ARENA_STATE_DIR", "ARENA_VAULT", "ARENA_ROADMAP_DIR", "ARENA_TASKS_ROOT",
            "ARENA_WRITE_VAULT", "ARENA_JCARDS_DB", "ARENA_DOWNLOADS", "ARENA_RUNS_ROOT",
        )
        if os.environ.get(name)
    )

    state_dir = Path(os.environ.get("ARENA_STATE_DIR") or (
        HOME / ".local" / "state" / ("arena" if env == "prod" else "arena-dev")
    ))
    vault_root = Path(os.environ.get("ARENA_VAULT") or DEFAULT_VAULT)
    roadmap_dir = Path(os.environ.get("ARENA_ROADMAP_DIR") or (vault_root / ROADMAP_SUBDIR))

    if env == "prod":
        tasks_root = Path(os.environ.get("ARENA_TASKS_ROOT") or (HOME / "projects" / "java-path"))
        write_vault = os.environ.get("ARENA_WRITE_VAULT", "1") != "0"
    else:
        tasks_root = Path(os.environ.get("ARENA_TASKS_ROOT") or (state_dir / "java-path"))
        write_vault = os.environ.get("ARENA_WRITE_VAULT", "0") == "1"

    return Config(
        env=env,
        state_dir=state_dir,
        db_path=state_dir / "state.db",
        backup_dir=state_dir / "backups",
        vault_root=vault_root,
        roadmap_dir=roadmap_dir,
        tasks_root=tasks_root,
        runs_root=runs_root(state_dir, env),
        write_vault=write_vault,
        import_archive=PROJECT_ROOT / "import",
        jcards_db=Path(os.environ.get("ARENA_JCARDS_DB") or (state_dir / "imports" / "jcards.db")),
        downloads_dir=Path(os.environ.get("ARENA_DOWNLOADS") or (state_dir / "imports")),
        overrides=overrides,
    )
