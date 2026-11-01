from datetime import datetime, timedelta, timezone

from backend.scripts import detect


def test_magnitude_gap_classification_and_null_values():
    mainshock = detect.classify_magnitudes([5.2, 3.9, None], threshold=1.2)
    swarm = detect.classify_magnitudes([4.1, 3.8], threshold=1.2)
    unclassified = detect.classify_magnitudes([4.1, None])
    unavailable_gap = detect.classify_magnitudes([4.1, float("nan")])

    assert mainshock[0:2] == (5.2, 3.9)
    assert mainshock[2] >= 1.2
    assert mainshock[3] == "mainshock_sequence"
    assert swarm[0:2] == (4.1, 3.8)
    assert swarm[2] < 1.2
    assert swarm[3] == "swarm"
    assert unclassified == (None, None, None, "unclassified")
    assert unavailable_gap == (None, None, None, "unclassified")


def test_early_large_mainshock_uses_time_fraction_when_gap_is_small():
    early = detect.classify_magnitudes(
        [6.2, 5.4],
        threshold=1.2,
        largest_event_fraction=0.1,
    )
    late = detect.classify_magnitudes(
        [6.2, 5.4],
        threshold=1.2,
        largest_event_fraction=0.5,
    )

    assert early[2] < 1.2
    assert early[3] == "mainshock_sequence"
    assert late[3] == "swarm"


def test_build_swarm_finds_early_mainshock_by_cluster_time_span():
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    members = [
        {"_id": "large", "time": start, "mag": 6.2, "place": "Example", "location": {"coordinates": [-118.0, 34.0]}},
        {"_id": "second", "time": start + timedelta(days=10), "mag": 5.4, "place": "Example", "location": {"coordinates": [-118.1, 34.1]}},
    ]

    record = detect.build_swarm("cluster", members)

    assert record["mag_gap"] < 1.2
    assert record["kind"] == "mainshock_sequence"


def test_spherical_centroid_handles_dateline():
    import numpy as np

    longitude, latitude = detect.spherical_centroid(np.array([[179.5, 10.0], [-179.5, 10.0]]))
    assert abs(abs(longitude) - 180) < 1e-6
    assert abs(latitude - 10) < 1e-3


def test_empty_detection_clears_old_results(monkeypatch):
    class Events:
        @staticmethod
        def find(*_args):
            return []

    class Swarms:
        deleted = False

        def delete_many(self, _query):
            self.deleted = True

    class Database:
        events = Events()
        swarms = Swarms()

    database = Database()
    monkeypatch.setattr(detect, "get_db", lambda: database)
    assert detect.detect(min_events=2) == {"events": 0, "clusters": 0, "by_kind": {}}
    assert database.swarms.deleted


def test_tiny_detection_clears_old_results_without_fitting(monkeypatch):
    class Events:
        @staticmethod
        def find(*_args):
            return [{"_id": "e1", "time": None, "mag": 2.5, "location": {"coordinates": [0, 0]}}]

    class Swarms:
        def delete_many(self, _query):
            self.deleted = True

    class Database:
        events = Events()
        swarms = Swarms()

    database = Database()
    monkeypatch.setattr(detect, "get_db", lambda: database)
    result = detect.detect(min_events=2)
    assert result == {"events": 1, "clusters": 0, "by_kind": {}}
    assert database.swarms.deleted
