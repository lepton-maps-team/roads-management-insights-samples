# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.


import asyncio
import logging
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from server.db.config import get_database_path, get_database_urls
from server.db.sql_params import prepare_text

logger = logging.getLogger(__name__)

_async_url, _ = get_database_urls()
async_engine = create_async_engine(_async_url, pool_pre_ping=True)

# Legacy: path to SQLite file when using default SQLite URL (see server.db.config)
DB = get_database_path()


@asynccontextmanager
async def get_db_transaction():
    """Async connection with an open transaction (commit/rollback on exit)."""
    async with async_engine.connect() as conn:
        async with conn.begin():
            yield conn


async def query_db(query, args=(), one=False, commit=False, conn=None):
    """Run SQL via SQLAlchemy async; tuple/list args use ``?`` → named binds."""
    try:
        if isinstance(args, dict):
            stmt = text(query)
            bind_params = args
        else:
            q, bind_params = prepare_text(query, args)
            stmt = text(q)

        async def _execute(c: AsyncConnection):
            result = await c.execute(stmt, bind_params)
            if commit:
                lr = getattr(result, "lastrowid", None)
                if lr is not None:
                    return lr
                ipk = result.inserted_primary_key
                if ipk is not None and len(ipk) == 1 and ipk[0] is not None:
                    return ipk[0]
                return None
            rows = result.fetchall()
            if one:
                return rows[0] if rows else None
            return list(rows)

        if conn is not None:
            return await _execute(conn)

        if commit:
            async with async_engine.begin() as c:
                return await _execute(c)

        async with async_engine.connect() as c:
            return await _execute(c)

    except (RuntimeError, asyncio.CancelledError) as e:
        if "Event loop is closed" not in str(e) and "CancelledError" not in str(
            type(e).__name__
        ):
            logger.warning(f"Database query error during shutdown: {e}")
        if one:
            return None
        return []
    except Exception as e:
        logger.error(f"Database query error: {e}")
        raise


async def dispose_async_engine() -> None:
    await async_engine.dispose()
