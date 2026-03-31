# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.

from __future__ import annotations


def init_db_postgres() -> None:
    """Apply Alembic migrations to PostgreSQL.

    Requires `DATABASE_URL` to be a Postgres async driver URL (e.g. `postgresql+asyncpg://...`).
    """

    import os

    from alembic import command
    from alembic.config import Config

    # This file lives at: route-registration-tool/server/db/postgres.py
    # So we need to go 2 levels up (db -> server) to reach:
    # route-registration-tool/ where alembic.ini lives.
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    ini = os.path.join(root, "alembic.ini")
    cfg = Config(ini)
    command.upgrade(cfg, "head")


class PostgresBackend:
    name = "postgres"

    def init_on_startup(self) -> None:
        init_db_postgres()

