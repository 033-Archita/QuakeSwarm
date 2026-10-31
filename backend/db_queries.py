"""MongoDB query helpers used directly by the FastAPI routes."""

from datetime import datetime, timedelta, timezone
import math

try:  # Support both package imports from the project root and direct backend execution.
    from .config import BENCHMARK_BOX, BENCHMARK_END, BENCHMARK_RUNS, BENCHMARK_START
    from .db import get_db
except ImportError:
    from config import BENCHMARK_BOX, BENCHMARK_END, BENCHMARK_RUNS, BENCHMARK_START
    from db import get_db


def _date(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _date_range(start, end):
    """Build a UTC range; a date-only end includes that whole calendar day."""
    bounds = {}
    if start:
        bounds["$gte"] = _date(start)
    if end:
        parsed_end = _date(end)
        if len(end) == 10:
            bounds["$lt"] = parsed_end + timedelta(days=1)
        else:
            bounds["$lte"] = parsed_end
    return bounds


def _event_doc(doc):
    loc = doc.get("location", {}).get("coordinates", [None, None])
    return {"id": doc["_id"], "time": doc.get("time"), "mag": doc.get("mag"),
            "mag_type": doc.get("mag_type"), "place": doc.get("place"),
            "depth_km": doc.get("depth_km"), "lon": loc[0], "lat": loc[1], "url": doc.get("url")}


def health():
    try:
        get_db().command("ping")
        return {"status": "ok", "database": "connected"}
    except Exception:
        return {"status": "error", "database": "disconnected"}


def indexes():
    """Read index metadata directly from MongoDB for the database explainer."""
    db = get_db()
    collections = []
    for collection_name in ("events", "swarms"):
        definitions = db[collection_name].index_information()
        collection_indexes = []
        for name, definition in definitions.items():
            collection_indexes.append({
                "name": name,
                "keys": [{"field": field, "direction": direction} for field, direction in definition.get("key", [])],
                "unique": definition.get("unique", False),
            })
        collections.append({"collection": collection_name, "indexes": collection_indexes})
    return {"collections": collections}


def stats():
    db = get_db()
    times = list(db.events.aggregate([{"$group": {"_id": None, "first": {"$min": "$time"}, "last": {"$max": "$time"}}}]))
    return {"total_events": db.events.count_documents({}),
            "first_event_time": times[0]["first"] if times else None,
            "last_event_time": times[0]["last"] if times else None,
            "swarm_count": db.swarms.count_documents({"kind": "swarm"}),
            "mainshock_sequence_count": db.swarms.count_documents({"kind": "mainshock_sequence"})}


def events(min_lon=None, min_lat=None, max_lon=None, max_lat=None, start=None, end=None, min_mag=None, limit=2000, sort="mag_desc"):
    query = {}
    if all(v is not None for v in (min_lon, min_lat, max_lon, max_lat)):
        query["location"] = {"$geoWithin": {"$box": [[min_lon, min_lat], [max_lon, max_lat]]}}
    if start or end:
        query["time"] = _date_range(start, end)
    if min_mag is not None: query["mag"] = {"$gte": min_mag}
    order = [("mag", -1), ("time", -1)] if sort == "mag_desc" else [("time", -1)]
    rows = [_event_doc(x) for x in get_db().events.find(query).sort(order).limit(limit)]
    return {"count": len(rows), "events": rows}


def swarms(kind=None, min_events=None, start=None, end=None, sort="start_desc"):
    q = {}
    if kind: q["kind"] = kind
    if min_events is not None: q["n_events"] = {"$gte": min_events}
    if start or end:
        q["start"] = _date_range(start, end)
    direction = -1 if sort == "start_desc" else 1
    return list(get_db().swarms.find(q, {"event_ids": 0}).sort("start", direction))


def swarm_detail(swarm_id):
    swarm = get_db().swarms.find_one({"_id": swarm_id})
    if not swarm:
        return None
    swarm["events"] = [_event_doc(e) for e in get_db().events.find({"_id": {"$in": swarm.get("event_ids", [])}}).sort("time", 1)]
    return swarm


def _date_match(start, end, min_mag=None, swarm=False, kind=None):
    q = {}
    field = "start" if swarm else "time"
    if start or end:
        q[field] = _date_range(start, end)
    if min_mag is not None: q["mag"] = {"$gte": min_mag}
    if kind: q["kind"] = kind
    return q


def timeline(granularity, start=None, end=None, min_mag=None):
    fmt = "%Y" if granularity == "year" else "%Y-%m"
    return list(get_db().events.aggregate([
        {"$match": _date_match(start, end, min_mag)},
        {"$group": {"_id": {"$dateToString": {"format": fmt, "date": "$time", "timezone": "UTC"}}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}, {"$project": {"_id": 0, "period": "$_id", "count": 1}}]))


def magnitude_distribution(start=None, end=None, min_mag=None):
    return list(get_db().events.aggregate([
        {"$match": _date_match(start, end, min_mag)},
        {"$group": {"_id": {"$multiply": [{"$floor": {"$multiply": ["$mag", 2]}}, 0.5]}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
        {"$project": {"_id": 0, "bin_start": "$_id", "bin_end": {"$add": ["$_id", 0.5]}, "count": 1}}]))


def depth_distribution(start=None, end=None, min_mag=None):
    q = _date_match(start, end, min_mag)
    pipeline = [{"$match": q}, {"$facet": {
        "bins": [{"$match": {"depth_km": {"$ne": None}}}, {"$group": {"_id": {"$multiply": [{"$floor": {"$divide": ["$depth_km", 10]}}, 10]}, "count": {"$sum": 1}}}, {"$sort": {"_id": 1}}, {"$project": {"_id": 0, "bin_start": "$_id", "bin_end": {"$add": ["$_id", 10]}, "count": 1}}],
        "excluded": [{"$match": {"depth_km": None}}, {"$count": "count"}]}}]
    res = list(get_db().events.aggregate(pipeline))[0]
    return {"bins": res["bins"], "excluded_null_depth": res["excluded"][0]["count"] if res["excluded"] else 0}


def magnitude_depth(start=None, end=None, min_mag=None):
    q = _date_match(start, end, min_mag); q["depth_km"] = {"$ne": None}
    docs = list(get_db().events.aggregate([{"$match": q}, {"$sample": {"size": 5000}}, {"$project": {"_id": 0, "mag": 1, "depth_km": 1}}]))
    return {"sample_size": len(docs), "points": docs}


def regions(start=None, end=None, min_mag=None):
    return list(get_db().events.aggregate([
        {"$match": {**_date_match(start, end, min_mag), "place": {"$type": "string"}}},
        {"$project": {"region": {"$let": {"vars": {"parts": {"$split": ["$place", ","]}}, "in": {"$trim": {"input": {"$arrayElemAt": ["$$parts", -1]}}}}}, "mag": 1}},
        {"$group": {"_id": "$region", "count": {"$sum": 1}, "avg_mag": {"$avg": "$mag"}}}, {"$sort": {"count": -1}}, {"$limit": 15},
        {"$project": {"_id": 0, "region": "$_id", "count": 1, "avg_mag": 1}}]))


def magnitude_types(start=None, end=None, min_mag=None):
    return list(get_db().events.aggregate([
        {"$match": _date_match(start, end, min_mag)}, {"$group": {"_id": {"$ifNull": ["$mag_type", "Not available"]}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}, {"$project": {"_id": 0, "mag_type": "$_id", "count": 1}}]))


def swarm_summary(start=None, end=None, kind=None):
    q = _date_match(start, end, swarm=True, kind=kind)
    return {"by_kind": list(get_db().swarms.aggregate([
        {"$match": q}, {"$group": {"_id": "$kind", "count": {"$sum": 1}, "avg_duration_days": {"$avg": "$duration_days"}, "avg_n_events": {"$avg": "$n_events"}}},
        {"$project": {"_id": 0, "kind": "$_id", "count": 1, "avg_duration_days": 1, "avg_n_events": 1}}]))}


def swarm_scatter(start=None, end=None, kind=None):
    q = _date_match(start, end, swarm=True, kind=kind)
    return list(get_db().swarms.find(q, {"_id": 1, "kind": 1, "duration_days": 1, "n_events": 1, "max_mag": 1}))


def swarm_timeline(granularity, start=None, end=None, kind=None):
    fmt = "%Y" if granularity == "year" else "%Y-%m"
    return list(get_db().swarms.aggregate([
        {"$match": _date_match(start, end, swarm=True, kind=kind)},
        {"$group": {"_id": {"period": {"$dateToString": {"format": fmt, "date": "$start", "timezone": "UTC"}}, "kind": "$kind"}, "count": {"$sum": 1}}},
        {"$sort": {"_id.period": 1}}, {"$project": {"_id": 0, "period": "$_id.period", "kind": "$_id.kind", "count": 1}}]))


def swarm_radius(start=None, end=None, kind=None):
    docs = list(get_db().swarms.find(_date_match(start, end, swarm=True, kind=kind), {"radius_km": 1}))
    counts = {}
    for d in docs:
        if d.get("radius_km") is not None:
            b = math.floor(d["radius_km"] / 10) * 10
            counts[b] = counts.get(b, 0) + 1
    return [{"bin_start": b, "bin_end": b + 10, "count": counts[b]} for b in sorted(counts)]


def inter_event_times(start=None, end=None, kind=None):
    query = _date_match(start, end, swarm=True, kind=kind)
    bins = [0.01, 0.1, 1, 10, 100, 1000, 10000, 1000000]
    counts = [0] * (len(bins) - 1)
    for swarm in get_db().swarms.find(query, {"event_ids": 1}):
        times = [e["time"] for e in get_db().events.find({"_id": {"$in": swarm.get("event_ids", [])}}, {"time": 1}).sort("time", 1)]
        for a, b in zip(times, times[1:]):
            gap = (b - a).total_seconds() / 3600
            for i in range(len(counts)):
                if bins[i] <= gap < bins[i + 1]: counts[i] += 1; break
    return [{"bin_start_hours": bins[i], "bin_end_hours": bins[i + 1], "count": counts[i]} for i in range(len(counts))]


def benchmark(min_lon=None, min_lat=None, max_lon=None, max_lat=None, start=None, end=None, runs=BENCHMARK_RUNS):
    from time import perf_counter
    from pymongo import ASCENDING
    db = get_db(); box = [min_lon, min_lat, max_lon, max_lat] if min_lon is not None else BENCHMARK_BOX
    start = start or BENCHMARK_START; end = end or BENCHMARK_END
    query = {"location": {"$geoWithin": {"$box": [[box[0], box[1]], [box[2], box[3]]] }}, "time": _date_range(start, end)}
    output = {}
    for name, hint, explain_hint in (
        ("indexed", [("location", "2dsphere")], {"location": "2dsphere"}),
        ("collection_scan", [("$natural", 1)], {"$natural": 1}),
    ):
        # Warm the same query path once; exclude this run from the measurements.
        list(db.events.find(query).hint(hint).limit(1000000))
        timings = []
        for _ in range(runs):
            t0 = perf_counter(); list(db.events.find(query).hint(hint).limit(1000000)); timings.append((perf_counter() - t0) * 1000)
        explain = db.command("explain", {"find": "events", "filter": query, "hint": explain_hint}, verbosity="executionStats")
        exp = explain["executionStats"]
        output[name] = {"average_ms": sum(timings) / len(timings), "runs_ms": timings,
                        "docs_examined": exp["totalDocsExamined"], "docs_returned": exp["nReturned"]}
    output["count"] = output["indexed"]["docs_returned"]
    print(f"Benchmark matched events: {output['count']}")
    return output
