# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.

"""Database URL configuration from DATABASE_URL."""

from __future__ import annotations

import os

from sqlalchemy.engine import make_url

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _default_sqlite_async_url() -> str:
    db_path = os.path.join(_PROJECT_ROOT, "my_database.db")
    return f"sqlite+aiosqlite:///{db_path}"


def get_database_urls() -> tuple[str, str]:
    """Return (async_sqlalchemy_url, sync_sqlalchemy_url)."""
    raw = os.environ.get("DATABASE_URL", _default_sqlite_async_url())
    u = make_url(raw)
    if u.drivername == "postgresql+asyncpg":
        sync = u.set(drivername="postgresql+psycopg")
        return str(u), str(sync)
    if u.drivername == "sqlite+aiosqlite":
        sync = u.set(drivername="sqlite")
        return str(u), str(sync)
    raise ValueError(
        f"Unsupported DATABASE_URL driver {u.drivername!r}; "
        "use postgresql+asyncpg:// or sqlite+aiosqlite://"
    )


def is_sqlite_file_database(async_url: str | None = None) -> bool:
    """True when using on-disk SQLite (not in-memory)."""
    if async_url is None:
        async_url = get_database_urls()[0]
    u = make_url(async_url)
    if u.drivername != "sqlite+aiosqlite":
        return False
    database = u.database or ""
    if database in ("", ":memory:") or database.startswith("file::memory"):
        return False
    return True


def get_sqlite_filesystem_path(async_url: str | None = None) -> str | None:
    """Absolute path for SQLite file DB, or None for in-memory / non-sqlite."""
    if async_url is None:
        async_url = get_database_urls()[0]
    u = make_url(async_url)
    if u.drivername != "sqlite+aiosqlite":
        return None
    database = u.database or ""
    if database in ("", ":memory:") or database.startswith("file::memory"):
        return None
    if os.path.isabs(database):
        return database
    return os.path.abspath(os.path.join(_PROJECT_ROOT, database))


def get_database_path() -> str:
    """Legacy filesystem path used when SQLite file mode is active.

    For non-SQLite URLs, returns the historical default path (callers should use
    :func:`is_sqlite_file_database` before treating this as a real file).
    """
    p = get_sqlite_filesystem_path()
    if p is not None:
        return p
    return os.path.join(_PROJECT_ROOT, "my_database.db")
