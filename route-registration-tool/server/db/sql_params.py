# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.

"""Convert SQLite-style ? placeholders to SQLAlchemy named binds."""

from __future__ import annotations

from typing import Any


def prepare_text(query: str, args: tuple[Any, ...] | list[Any] | dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Return (query, bind dict) for SQLAlchemy ``text()``.

    If ``args`` is a dict, the query must use ``:name`` placeholders and is
    returned unchanged. If ``args`` is a tuple or list, each ``?`` is replaced
    by ``:p0``, ``:p1``, ...
    """
    if isinstance(args, dict):
        return query, dict(args)
    if not isinstance(args, (tuple, list)):
        raise TypeError(f"args must be dict, tuple, or list, got {type(args).__name__}")
    tup = tuple(args)
    qmarks = query.count("?")
    if qmarks != len(tup):
        raise ValueError(
            f"Placeholder count mismatch: {qmarks} '?' in query, {len(tup)} parameters"
        )
    if qmarks == 0:
        return query, {}
    parts = query.split("?")
    out: list[str] = []
    params: dict[str, Any] = {}
    for i, part in enumerate(parts[:-1]):
        out.append(part)
        pname = f"p{i}"
        out.append(f":{pname}")
        params[pname] = tup[i]
    out.append(parts[-1])
    return "".join(out), params
