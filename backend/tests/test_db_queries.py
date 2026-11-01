from datetime import datetime, timedelta, timezone

from backend import db_queries


def test_inter_event_times_keep_sub_hundredth_and_open_ended_gaps(monkeypatch):
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    offsets_hours = [0, 0.005, 0.015, 0.5, 10001.0]
    event_rows = [
        {"_id": f"e{index}", "time": start + timedelta(hours=offset)}
        for index, offset in enumerate(offsets_hours)
    ]

    class Cursor(list):
        def sort(self, *_args):
            return self

    class Events:
        def find(self, *_args):
            return Cursor(event_rows)

    class Swarms:
        def find(self, *_args):
            return [{"event_ids": [row["_id"] for row in event_rows]}]

    class Database:
        events = Events()
        swarms = Swarms()

    monkeypatch.setattr(db_queries, "get_db", lambda: Database())

    rows = db_queries.inter_event_times()
    counts = {row["label"]: row["count"] for row in rows}

    assert counts["<0.01"] == 1
    assert counts["0.01–0.1"] == 1
    assert counts["0.1–1"] == 1
    assert counts["10,000+"] == 1
    assert sum(counts.values()) == len(offsets_hours) - 1
