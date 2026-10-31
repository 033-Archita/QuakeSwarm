from backend.scripts import detect


def test_magnitude_gap_classification_and_null_values():
    assert detect.classify_magnitudes([5.2, 3.9, None], threshold=1.2) == (5.2, 3.9, 1.3000000000000003, "mainshock_sequence")
    assert detect.classify_magnitudes([4.1, 3.8], threshold=1.2) == (4.1, 3.8, 0.2999999999999998, "swarm")
    assert detect.classify_magnitudes([4.1, None]) == (None, None, None, "unclassified")


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
