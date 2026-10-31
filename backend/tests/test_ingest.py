from datetime import timezone

from backend.scripts import ingest


def test_generate_date_chunks_clamps_final_chunk():
    assert ingest._generate_date_chunks("2024-01-01", "2024-01-10", 4) == [
        ("2024-01-01", "2024-01-05"),
        ("2024-01-05", "2024-01-09"),
        ("2024-01-09", "2024-01-10"),
    ]


def test_parse_feature_transforms_valid_record_and_preserves_optional_nulls():
    record = ingest._parse_feature({
        "id": "usgs-1",
        "properties": {"time": 1704067200000, "mag": 2.7, "magType": None, "place": None},
        "geometry": {"coordinates": [-117.5, 34.2, None]},
    })

    assert record["_id"] == "usgs-1"
    assert record["time"].tzinfo == timezone.utc
    assert record["mag"] == 2.7
    assert record["location"] == {"type": "Point", "coordinates": [-117.5, 34.2]}
    assert record["mag_type"] is None
    assert record["place"] is None
    assert record["depth_km"] is None


def test_parse_feature_skips_missing_or_invalid_required_values():
    valid = {"id": "x", "properties": {"time": 1, "mag": 3}, "geometry": {"coordinates": [1, 2]}}
    assert ingest._parse_feature({**valid, "properties": {"mag": 3}}) is None
    assert ingest._parse_feature({**valid, "geometry": {"coordinates": [181, 2]}}) is None
    assert ingest._parse_feature(None) is None


def test_usgs_chunk_splitting_recurses_until_intervals_are_small(monkeypatch):
    counts = {"2024-01-01/2024-01-05": 20_001}

    def count(start, end, _minimum):
        return counts.get(f"{start}/{end}", 5)

    fetched = []
    monkeypatch.setattr(ingest, "_get_usgs_count", count)
    monkeypatch.setattr(ingest, "_fetch_and_upsert", lambda start, end, *_args: fetched.append((start, end)))

    class Collection:
        @staticmethod
        def count_documents(_query):
            return 0

    ingest._split_and_fetch("2024-01-01", "2024-01-05", 2.5, Collection(), {"skipped": 0})
    assert fetched == [("2024-01-01", "2024-01-03"), ("2024-01-03", "2024-01-05")]


def test_complete_existing_chunk_is_skipped(monkeypatch):
    fetched = []
    monkeypatch.setattr(ingest, "_get_usgs_count", lambda *_args: 5)
    monkeypatch.setattr(ingest, "_fetch_and_upsert", lambda *_args: fetched.append(True))

    class Collection:
        @staticmethod
        def count_documents(_query):
            return 5

    ingest._split_and_fetch("2024-01-01", "2024-01-02", 2.5, Collection(), {"skipped": 0})
    assert fetched == []
