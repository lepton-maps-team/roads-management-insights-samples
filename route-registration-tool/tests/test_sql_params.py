# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.

import pytest

from server.db.common import prepare_text


def test_zero_placeholders():
    q, p = prepare_text("SELECT 1", ())
    assert q == "SELECT 1"
    assert p == {}


def test_three_placeholders():
    q, p = prepare_text("SELECT ? , ? , ?", (1, "a", 3))
    assert ":p0" in q and ":p1" in q and ":p2" in q
    assert p == {"p0": 1, "p1": "a", "p2": 3}


def test_dict_passthrough():
    d = {"id": 5, "name": "x"}
    q, p = prepare_text("SELECT * FROM t WHERE id = :id", d)
    assert q == "SELECT * FROM t WHERE id = :id"
    assert p == d


def test_mismatch_raises():
    with pytest.raises(ValueError, match="Placeholder count"):
        prepare_text("SELECT ?", (1, 2))
