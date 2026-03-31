import datetime

import pytest

from server.routes.users import row_to_preferences_out


def test_row_to_preferences_out_normalizes_datetime_to_isoformat():
    row = {
        "id": 1,
        "distance_unit": "km",
        "google_cloud_account": None,
        "show_tooltip": 1,
        "show_instructions": 0,
        "route_color_mode": "sync_status",
        "created_at": datetime.datetime(2026, 3, 30, 10, 2, 10, 828686),
        "updated_at": datetime.datetime(2026, 3, 30, 10, 2, 10, 828686),
    }

    out = row_to_preferences_out(row)

    assert out.created_at == row["created_at"].isoformat()
    assert out.updated_at == row["updated_at"].isoformat()

