"""FastAPI routes for the QuakeSwarm data and analytics API."""

from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

try:  # Also allow `uvicorn backend.main:app` from the project root.
    from . import db_queries as queries
    from .db import ensure_indexes, get_client
except ImportError:
    import db_queries as queries
    from db import ensure_indexes, get_client


app = FastAPI(
    title="QuakeSwarm API",
    description="Big-data analytics for earthquake swarm detection",
    version="0.2.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    get_client().admin.command("ping")
    ensure_indexes()


def validate_dates(start, end):
    """Reject invalid ISO dates and ranges ordered from end to start."""
    try:
        start_date = datetime.fromisoformat(start.replace("Z", "+00:00")) if start else None
        end_date = datetime.fromisoformat(end.replace("Z", "+00:00")) if end else None

        if start_date and start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
        if end_date and end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        if start_date and end_date and start_date > end_date:
            raise ValueError("start must be earlier than or equal to end")
    except ValueError as exc:
        raise HTTPException(422, f"Invalid date parameter: {exc}") from exc


def check_box(min_lon, min_lat, max_lon, max_lat):
    """Require complete, ordered geographic boxes for spatial event queries."""
    values = (min_lon, min_lat, max_lon, max_lat)
    supplied = [value is not None for value in values]

    if any(supplied) and not all(supplied):
        raise HTTPException(422, "Provide min_lon, min_lat, max_lon and max_lat together")
    if all(supplied) and (min_lon >= max_lon or min_lat >= max_lat):
        raise HTTPException(422, "Bounding box minimums must be less than maximums")
    if all(supplied) and (
        min_lon < -180 or max_lon > 180 or min_lat < -90 or max_lat > 90
    ):
        raise HTTPException(422, "Longitude must be within [-180, 180] and latitude within [-90, 90]")


def analytics_dates(start, end):
    validate_dates(start, end)


@app.get("/api/health")
def health():
    return queries.health()


@app.get("/api/indexes")
def indexes():
    return queries.indexes()


@app.get("/api/stats")
def stats():
    return queries.stats()


@app.get("/api/events")
def events(
    min_lon: float | None = Query(None, ge=-180, le=180),
    min_lat: float | None = Query(None, ge=-90, le=90),
    max_lon: float | None = Query(None, ge=-180, le=180),
    max_lat: float | None = Query(None, ge=-90, le=90),
    start: str | None = None,
    end: str | None = None,
    min_mag: float | None = Query(None, ge=-2, le=10),
    limit: int = Query(2000, ge=1, le=10000),
    sort: Literal["mag_desc", "time_desc"] = "mag_desc",
):
    validate_dates(start, end)
    check_box(min_lon, min_lat, max_lon, max_lat)
    return queries.events(min_lon, min_lat, max_lon, max_lat, start, end, min_mag, limit, sort)


@app.get("/api/swarms")
def swarms(
    kind: Literal["swarm", "mainshock_sequence", "unclassified"] | None = None,
    min_events: int | None = Query(None, ge=1),
    start: str | None = None,
    end: str | None = None,
    sort: Literal["start_asc", "start_desc"] = "start_desc",
):
    validate_dates(start, end)
    return queries.swarms(kind, min_events, start, end, sort)


@app.get("/api/swarms/{swarm_id}")
def swarm_detail(swarm_id: str):
    row = queries.swarm_detail(swarm_id)
    if row is None:
        raise HTTPException(404, "Swarm not found")
    return row


@app.get("/api/timeline")
def timeline(
    granularity: Literal["year", "month"] = "year",
    start: str | None = None,
    end: str | None = None,
    min_mag: float | None = None,
):
    analytics_dates(start, end)
    return queries.timeline(granularity, start, end, min_mag)


@app.get("/api/analytics/magnitude-distribution")
def magnitude_distribution(
    start: str | None = None,
    end: str | None = None,
    min_mag: float | None = None,
):
    analytics_dates(start, end)
    return queries.magnitude_distribution(start, end, min_mag)


@app.get("/api/analytics/depth-distribution")
def depth_distribution(
    start: str | None = None,
    end: str | None = None,
    min_mag: float | None = None,
):
    analytics_dates(start, end)
    return queries.depth_distribution(start, end, min_mag)


@app.get("/api/analytics/magnitude-depth")
def magnitude_depth(
    start: str | None = None,
    end: str | None = None,
    min_mag: float | None = None,
):
    analytics_dates(start, end)
    return queries.magnitude_depth(start, end, min_mag)


@app.get("/api/analytics/regions")
def regions(
    start: str | None = None,
    end: str | None = None,
    min_mag: float | None = None,
):
    analytics_dates(start, end)
    return queries.regions(start, end, min_mag)


@app.get("/api/analytics/magnitude-types")
def magnitude_types(
    start: str | None = None,
    end: str | None = None,
    min_mag: float | None = None,
):
    analytics_dates(start, end)
    return queries.magnitude_types(start, end, min_mag)


@app.get("/api/analytics/swarm-summary")
def swarm_summary(
    start: str | None = None,
    end: str | None = None,
    kind: Literal["swarm", "mainshock_sequence", "unclassified"] | None = None,
):
    analytics_dates(start, end)
    return queries.swarm_summary(start, end, kind)


@app.get("/api/analytics/swarm-scatter")
def swarm_scatter(
    start: str | None = None,
    end: str | None = None,
    kind: Literal["swarm", "mainshock_sequence", "unclassified"] | None = None,
):
    analytics_dates(start, end)
    return queries.swarm_scatter(start, end, kind)


@app.get("/api/analytics/swarm-timeline")
def swarm_timeline(
    granularity: Literal["year", "month"] = "year",
    start: str | None = None,
    end: str | None = None,
    kind: Literal["swarm", "mainshock_sequence", "unclassified"] | None = None,
):
    analytics_dates(start, end)
    return queries.swarm_timeline(granularity, start, end, kind)


@app.get("/api/analytics/swarm-radius")
def swarm_radius(
    start: str | None = None,
    end: str | None = None,
    kind: Literal["swarm", "mainshock_sequence", "unclassified"] | None = None,
):
    analytics_dates(start, end)
    return queries.swarm_radius(start, end, kind)


@app.get("/api/analytics/inter-event-times")
def inter_event_times(
    start: str | None = None,
    end: str | None = None,
    kind: Literal["swarm", "mainshock_sequence", "unclassified"] | None = None,
):
    analytics_dates(start, end)
    return queries.inter_event_times(start, end, kind)
