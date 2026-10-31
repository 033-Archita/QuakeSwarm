from backend import db_queries


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.used_hint = None

    def hint(self, value):
        self.used_hint = value
        return self

    def __iter__(self):
        return iter(self.rows)


class FakeEvents:
    def __init__(self):
        self.find_calls = []

    def count_documents(self, query):
        assert query == {}
        return 1000

    def find(self, query, projection):
        cursor = FakeCursor([{"_id": "a"}, {"_id": "b"}, {"_id": "c"}])
        self.find_calls.append((query, projection, cursor))
        return cursor


class FakeDatabase:
    def __init__(self):
        self.events = FakeEvents()
        self.explain_calls = []

    def command(self, command, specification, verbosity):
        assert command == "explain"
        assert verbosity == "executionStats"
        self.explain_calls.append(specification)
        hint = specification["hint"]
        examined = 3 if hint == "location_2dsphere" else 20 if hint == "time_1" else 1000
        return {"executionStats": {"totalDocsExamined": examined, "nReturned": 3}}


def test_benchmark_runs_all_hints_for_both_cases_and_uses_explain_stats(monkeypatch):
    database = FakeDatabase()
    monkeypatch.setattr(db_queries, "get_db", lambda: database)

    result = db_queries.benchmark(runs=2)

    assert result["total_events"] == 1000
    assert result["runs"] == 2
    assert set(result["cases"]) == {"regional", "global"}
    assert result["cases"]["regional"]["returned_count"] == 3
    assert result["cases"]["regional"]["catalog_percent"] == 0.3
    assert len(database.events.find_calls) == 2 * 3 * (2 + 1)  # warm-up plus two measured reads
    assert len(database.explain_calls) == 2 * 3
    assert {str(call["hint"]) for call in database.explain_calls} == {"location_2dsphere", "time_1", "{'$natural': 1}"}
    assert {str(call[2].used_hint) for call in database.events.find_calls} == {"location_2dsphere", "time_1", "{'$natural': 1}"}
    for case in result["cases"].values():
        assert set(case["plans"]) == {"2dsphere", "time_index", "collection_scan"}
        for plan in case["plans"].values():
            assert len(plan["runs_ms"]) == 2
            assert plan["docs_returned"] == 3
            assert plan["docs_examined"] >= plan["docs_returned"]
            assert plan["average_ms"] >= 0


def test_benchmark_rejects_zero_runs(monkeypatch):
    monkeypatch.setattr(db_queries, "get_db", lambda: FakeDatabase())
    try:
        db_queries.benchmark(runs=0)
    except ValueError as error:
        assert "at least 1" in str(error)
    else:
        raise AssertionError("Expected zero benchmark runs to be rejected")
