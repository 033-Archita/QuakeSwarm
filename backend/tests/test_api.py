from fastapi.testclient import TestClient

from backend import main


def test_health_and_stats_api_responses(monkeypatch):
    monkeypatch.setattr(main.queries, "health", lambda: {"status": "ok", "database": "connected"})
    monkeypatch.setattr(main.queries, "stats", lambda: {
        "total_events": 3, "first_event_time": None, "last_event_time": None,
        "swarm_count": 0, "mainshock_sequence_count": 0,
    })
    client = TestClient(main.app)
    assert client.get("/api/health").json() == {"status": "ok", "database": "connected"}
    assert client.get("/api/stats").json()["total_events"] == 3


def test_invalid_event_limit_and_partial_box_return_422():
    client = TestClient(main.app)
    assert client.get("/api/events?limit=0").status_code == 422
    response = client.get("/api/events?min_lon=-120")
    assert response.status_code == 422
    assert "Provide min_lon" in response.json()["detail"]


def test_reversed_dates_return_422():
    response = TestClient(main.app).get("/api/events?start=2025-01-02&end=2025-01-01")
    assert response.status_code == 422
    assert "start must be earlier" in response.json()["detail"]


def test_benchmark_route_returns_query_helper_result(monkeypatch):
    expected = {"total_events": 100, "runs": 1, "cases": {}}
    monkeypatch.setattr(main.queries, "benchmark", lambda *args: expected)
    response = TestClient(main.app).get("/api/benchmark?runs=1")
    assert response.status_code == 200
    assert response.json() == expected
