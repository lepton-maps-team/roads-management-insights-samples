# MARKET-163 Postgres migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SQLite as the production datastore in `route-registration-tool` with PostgreSQL behind a single configurable `DATABASE_URL`, while keeping SQLite available for tests/dev via the same façade (`query_db`, `get_db_transaction`, SQLAlchemy engines).

**Architecture:** Parse `DATABASE_URL` once; build **async** SQLAlchemy engine for FastAPI handlers and **sync** engine for `RouteStatusChecker` / sync helpers using dialect-appropriate URLs (`postgresql+asyncpg` + `postgresql+psycopg`, or `sqlite+aiosqlite` + `sqlite`). Centralize execution in `server/db/`; add **Alembic** migrations for Postgres DDL; gate GCS file backup to SQLite-only paths.

**Tech Stack:** Python 3.12+, FastAPI, SQLAlchemy 2.x, Alembic, asyncpg, psycopg3 (sync), existing `aiosqlite` for SQLite tests.

**Spec:** [`docs/superpowers/specs/2026-03-30-postgres-migration-design.md`](../specs/2026-03-30-postgres-migration-design.md)

---

## File structure (create / modify)

| Path | Responsibility |
|------|----------------|
| `route-registration-tool/pyproject.toml` | Add `asyncpg`, `psycopg[binary]`, `alembic`, `pytest`, `pytest-asyncio` (dev). |
| `route-registration-tool/server/db/config.py` | Load `DATABASE_URL`; expose `is_sqlite_file`; derive sync URL from async URL. |
| `route-registration-tool/server/db/database.py` | Replace `aiosqlite` with SQLAlchemy async connection pool; implement `query_db` / `get_db_transaction` using `text()` + bound params. |
| `route-registration-tool/server/db/sql_params.py` | Helpers: `?` → named binds (`:p0`, `:p1`) + dict from tuple args for portability. |
| `route-registration-tool/server/utils/create_engine.py` | Build sync `engine` from `server.db.config` (no import of raw `DB` path string). |
| `route-registration-tool/server/core/db_setup.py` | Split: SQLite-only `init_db_sqlite()` (current DDL + migrations); Postgres path = Alembic upgrade (or call from lifespan). |
| `route-registration-tool/alembic/` + `alembic.ini` | Postgres schema versioned; initial revision matches current `init_db` tables. |
| `route-registration-tool/server/main.py` | Lifespan: if SQLite file → GCS restore + `init_db_sqlite`; if Postgres → run Alembic, skip GCS restore/backup thread. |
| `route-registration-tool/server/utils/db_gcs.py` | No-op restore/backup when `DATABASE_URL` is not a SQLite file URL. |
| `route-registration-tool/server/utils/listening_to_pub_sub.py` | Replace raw `sqlite3` cursor + `?` with SQLAlchemy `connection.execute(text(...), params)` (or dialect-safe executemany). |
| `route-registration-tool/server/utils/polygon_roads_api.py` | Rename `create_roads_sqlite` → `create_roads_batch` (same implementation; uses shared sync `engine`). |
| `route-registration-tool/server/routes/polygon_routes_api.py` | Fix mixed `:id` / `?` calls to single param style via `sql_params` or named dicts. |
| All files importing `query_db` | No import changes if façade signature preserved; update any raw SQL that is dialect-specific (see task list). |
| `route-registration-tool/.env.example` | Document `DATABASE_URL` for Postgres and example SQLite test URL. |
| `route-registration-tool/README.md` (if exists) or repo root note | Postgres provisioning + `alembic upgrade head`. |
| `route-registration-tool/tests/` | New: config smoke + `query_db` round-trip (SQLite memory). |

**Consumers of `query_db` today (verify after façade change):**  
`server/routes/routes.py`, `projects_list.py`, `projects.py`, `users.py`, `tiles.py`, `sync.py`, `segmentation.py`, `roads_connectivity.py`, `roads.py`, `polygon_routes_api.py`, `batch_save.py`, `server/utils/sql_connectivity.py`, `server/utils/compute_parent_sync_status.py`.

**Direct `sqlite3` / `DB` path:** `server/core/db_setup.py`, `server/main.py`, `server/db/database.py`, `server/utils/create_engine.py`.

**Sync `engine` users:** `server/utils/check_routes_status.py`, `server/utils/polygon_roads_api.py`, `listening_to_pub_sub.py` (via session/engine — confirm imports).

---

### Task 1: Dependencies and test harness

**Files:**
- Modify: `route-registration-tool/pyproject.toml`
- Create: `route-registration-tool/pytest.ini` (or `[tool.pytest.ini_options]` in `pyproject.toml`)
- Create: `route-registration-tool/tests/conftest.py`
- Create: `route-registration-tool/tests/test_db_config_smoke.py`

- [ ] **Step 1.1:** Add dependencies to `pyproject.toml`:

```toml
# under [project] dependencies, add:
"asyncpg (>=0.30.0)",
"psycopg[binary] (>=3.2.0)",
"alembic (>=1.14.0)",

# add dev group if not present — e.g. [tool.poetry.group.dev.dependencies] for Poetry:
pytest = ">=8.0.0"
pytest-asyncio = ">=0.25.0"
```

(Adjust to match your actual `pyproject.toml` layout — project uses Poetry-style metadata.)

- [ ] **Step 1.2:** Install:

```bash
cd route-registration-tool && poetry lock && poetry install
```

Expected: lock updates with new packages.

- [ ] **Step 1.3:** Add a smoke test that imports `server.db.config` (created in Task 2) — **skip until Task 2** or use `pytest.importorskip` after Task 2 lands.

- [ ] **Step 1.4:** Commit:

```bash
git add route-registration-tool/pyproject.toml route-registration-tool/poetry.lock route-registration-tool/pytest.ini
git commit -m "chore: add Postgres drivers, Alembic, pytest for MARKET-163"
```

---

### Task 2: `DATABASE_URL` config and URL derivation

**Files:**
- Create: `route-registration-tool/server/db/config.py`
- Create: `route-registration-tool/tests/test_db_config.py`

- [ ] **Step 2.1:** Implement `get_database_urls()` returning `(async_url: str, sync_url: str)`:

- If async URL starts with `postgresql+asyncpg://`, sync URL = same components with `postgresql+psycopg://`.
- If async URL uses `sqlite+aiosqlite:///`, sync URL = `sqlite:///...` (file path preserved).
- Raise `ValueError` with clear message for unsupported schemes.

- [ ] **Step 2.2:** Write failing test:

```python
# route-registration-tool/tests/test_db_config.py
import os
import pytest

def test_postgres_urls_derived(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:pass@localhost:5432/appdb",
    )
    from server.db.config import get_database_urls
    async_u, sync_u = get_database_urls()
    assert "asyncpg" in async_u
    assert sync_u.startswith("postgresql+psycopg://")
```

- [ ] **Step 2.3:** Run: `cd route-registration-tool && poetry run pytest tests/test_db_config.py -v`  
  Expected: PASS after implementation.

- [ ] **Step 2.4:** Commit: `git add server/db/config.py tests/test_db_config.py && git commit -m "feat(db): add DATABASE_URL parsing and sync/async URL pairs"`

---

### Task 3: `?` placeholder normalization helper

**Files:**
- Create: `route-registration-tool/server/db/sql_params.py`
- Create: `route-registration-tool/tests/test_sql_params.py`

- [ ] **Step 3.1:** Implement `prepare_text(query: str, args: tuple | list | dict)`:

- If `args` is already a `dict`, return `(query, args)` unchanged (caller uses `:name` style).
- If `args` is tuple/list, replace each `?` in order with `:p0`, `:p1`, … and return `(new_query, {"p0": v0, ...})`.
- If counts mismatch, raise `ValueError`.

- [ ] **Step 3.2:** Tests for: zero `?`, three `?`, dict passthrough, mismatch error.

- [ ] **Step 3.3:** `poetry run pytest tests/test_sql_params.py -v` → PASS.

- [ ] **Step 3.4:** Commit: `feat(db): add SQL ? to named bind helper for SQLAlchemy`

---

### Task 4: Async engine + rewrite `query_db` / `get_db_transaction`

**Files:**
- Modify: `route-registration-tool/server/db/database.py`
- Create: `route-registration-tool/tests/test_query_db_sqlite_memory.py`

- [ ] **Step 4.1:** In `database.py`, create module-level `async_engine` from `get_database_urls()[0]` using `create_async_engine(..., pool_pre_ping=True)`.

- [ ] **Step 4.2:** Reimplement `get_db_transaction` as:

```python
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy import text
from server.db.sql_params import prepare_text

@asynccontextmanager
async def get_db_transaction():
    async with async_engine.connect() as conn:
        async with conn.begin():
            yield conn
```

- [ ] **Step 4.3:** Reimplement `query_db(query, args=(), one=False, commit=False, conn=None)`:

- Use `prepare_text(query, args)` when `args` is not a dict; when dict, use `text(query)` bindparams as SQLAlchemy expects.
- If `conn` is `AsyncConnection`, use it; else `async with async_engine.connect() as conn:` and commit if `commit=True`.
- Map rows to list of Row-like objects: `result.mappings().all()` or fetchall with compatibility for existing code that uses `row["col"]` (aiosqlite Row). **Verify** call sites: many use indexing — use `result.mappings().fetchone()` / `fetchall()` returning dict-like rows, or SQLAlchemy `Row` with keys.

- [ ] **Step 4.4:** Integration test with `DATABASE_URL=sqlite+aiosqlite:///:memory:` (set in test via `monkeypatch`), run `init` schema — **minimal** `CREATE TABLE` in fixture or call sqlite init — then `await query_db("SELECT 1", ())` returns one row.

- [ ] **Step 4.5:** Run full pytest for new tests; fix any import cycles.

- [ ] **Step 4.6:** Commit: `feat(db): implement query_db on SQLAlchemy async engine`

---

### Task 5: Sync engine from config (remove hardcoded `DB` import)

**Files:**
- Modify: `route-registration-tool/server/utils/create_engine.py`

- [ ] **Step 5.1:** Replace:

```python
from server.db.database import DB
engine = create_engine(f"sqlite:///{DB}", ...)
```

with:

```python
from server.db.config import get_database_urls
_, sync_url = get_database_urls()
engine = create_engine(sync_url, pool_pre_ping=True)
```

- [ ] **Step 5.2:** Export `DB` for backward compatibility only if still needed — prefer removing `DB` from `main.py` and `db_setup.py` in favor of `get_database_urls()` + `is_sqlite_file()`. If `main.py` still needs a path for GCS, derive from URL parsing for SQLite file mode only.

- [ ] **Step 5.3:** Manual smoke: `cd route-registration-tool && DATABASE_URL=sqlite+aiosqlite:///./tmp_test.db poetry run uvicorn server.main:app` (or project’s start command) — app starts.

- [ ] **Step 5.4:** Commit: `refactor(db): build sync SQLAlchemy engine from DATABASE_URL`

---

### Task 6: Split `init_db` — SQLite DDL vs Postgres migrations

**Files:**
- Modify: `route-registration-tool/server/core/db_setup.py`
- Create: `route-registration-tool/alembic.ini`, `route-registration-tool/alembic/env.py`, `route-registration-tool/alembic/versions/001_initial.py` (name as appropriate)

- [ ] **Step 6.1:** Rename `init_db` → `init_db_sqlite()`; keep body using `sqlite3` + `DB` path **only** when config says SQLite file (import `DB` from a single place: e.g. `server/db/paths.py` that parses file path from `DATABASE_URL`).

- [ ] **Step 6.2:** Add `init_db_postgres()` that runs `alembic upgrade head` via subprocess or `command.upgrade` API from Alembic (preferred: programmatic in `env.py`).

- [ ] **Step 6.3:** Generate initial Alembic revision from current schema (compare `db_setup.py` CREATE TABLEs to Alembic autogenerate, then hand-fix Postgres types: `SERIAL`/`BIGSERIAL`, `BOOLEAN`, `TIMESTAMP`).

- [ ] **Step 6.4:** Commit migration skeleton: `feat(db): add Alembic and initial Postgres schema`

---

### Task 7: Lifespan, GCS, backup thread

**Files:**
- Modify: `route-registration-tool/server/main.py`
- Modify: `route-registration-tool/server/utils/db_gcs.py`

- [ ] **Step 7.1:** In `lifespan`, before DB init:

```python
from server.db.config import is_sqlite_file_database, get_database_urls
async_url, _ = get_database_urls()
if is_sqlite_file_database(async_url):
    restore_db_from_gcs(path_from_url)
    init_db_sqlite()
else:
    init_db_postgres()
```

- [ ] **Step 7.2:** Start `start_backup_thread` only for SQLite file DB.

- [ ] **Step 7.3:** On shutdown, `dispose()` async engine if exposed from `database.py` (add `async_engine.dispose()` in lifespan shutdown).

- [ ] **Step 7.4:** Commit: `feat(db): wire lifespan to SQLite vs Postgres init and gated GCS backup`

---

### Task 8: Fix dialect-sensitive call sites

**Files:**
- Modify: `route-registration-tool/server/routes/polygon_routes_api.py` (mixed `?` and dict)
- Modify: `route-registration-tool/server/utils/listening_to_pub_sub.py` (raw sqlite cursor)

- [ ] **Step 8.1:** `polygon_routes_api.py` — use one style, e.g. `prepare_text` or dict with `:project_id` for DELETE.

- [ ] **Step 8.2:** `listening_to_pub_sub.py` — replace `cursor.executemany` with SQLAlchemy `conn.execute(text(update_stmt), batch)` in a loop or use `executemany` via driver — for Postgres use named params in statement.

- [ ] **Step 8.3:** Grep for remaining `?` in SQL strings under `server/`: fix or confirm handled by `prepare_text`.

```bash
cd route-registration-tool && rg "'[^']*\?[^']*'" server/ --glob '*.py'
```

- [ ] **Step 8.4:** Commit: `fix(db): remove SQLite-only raw SQL paths for Postgres compatibility`

---

### Task 9: Rename `create_roads_sqlite` and update callers

**Files:**
- Modify: `route-registration-tool/server/utils/polygon_roads_api.py`
- Modify: `route-registration-tool/server/routes/polygon_routes_api.py`

- [ ] **Step 9.1:** Rename function to `create_roads_batch` (or `insert_roads_bulk`).

- [ ] **Step 9.2:** Update imports/callers.

- [ ] **Step 9.3:** Commit: `refactor: rename create_roads_sqlite to dialect-neutral name`

---

### Task 10: Documentation and `.env.example`

**Files:**
- Modify: `route-registration-tool/.env.example`

- [ ] **Step 10.1:** Add:

```bash
# Required in production: PostgreSQL (async driver)
# DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:5432/DBNAME

# Local / CI tests (example)
# DATABASE_URL=sqlite+aiosqlite:///./my_database.db
```

- [ ] **Step 10.2:** Document `alembic upgrade head` and connection pool tuning in README.

- [ ] **Step 10.3:** Commit: `docs: document DATABASE_URL and migrations for MARKET-163`

---

### Task 11: Final verification

- [ ] **Step 11.1:** Run formatter/linter if project uses them.

- [ ] **Step 11.2:** `poetry run pytest route-registration-tool/tests -v` — all pass.

- [ ] **Step 11.3:** Manual: Postgres Docker:

```bash
docker run --rm -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=appdb -p 5432:5432 postgres:16
export DATABASE_URL=postgresql+asyncpg://postgres:pass@localhost:5432/appdb
cd route-registration-tool && poetry run alembic upgrade head && poetry run uvicorn server.main:app --host 0.0.0.0 --port 8000
```

Expected: app boots; hit a health or list endpoint if available.

- [ ] **Step 11.4:** Commit any fixes: `fix: address Postgres smoke test findings`

---

## Notes for implementers

- **`compute_parent_sync_status.py`** documents compatibility with aiosqlite vs SQLAlchemy — update comments after `query_db` returns SQLAlchemy Row/mapping objects consistently.
- **`sync.py`** uses dynamic `DELETE FROM {table}` — ensure `table` is allowlisted only (already implied); Postgres identifiers may need quoting if ever case-sensitive.
- **Dual pools:** set `pool_size` / `max_overflow` conservatively on async and sync engines so total ≤ Postgres `max_connections`.

---

## Plan review

- **Spec:** [`docs/superpowers/specs/2026-03-30-postgres-migration-design.md`](../specs/2026-03-30-postgres-migration-design.md)
- **Plan:** this file.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-03-30-postgres-migration.md`. Two execution options:**

1. **Subagent-driven (recommended)** — Dispatch a fresh subagent per task; review between tasks. **REQUIRED SUB-SKILL:** `superpowers:subagent-driven-development`.

2. **Inline execution** — Execute tasks in one session with checkpoints. **REQUIRED SUB-SKILL:** `superpowers:executing-plans`.

**Which approach?**
