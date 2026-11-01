"""MongoDB query helpers used directly by the FastAPI routes."""

from datetime import datetime, timedelta, timezone
import math

try:  # Support package imports from the root and direct execution from backend/.
    from .db import get_db
except ImportError:
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
    location = doc.get("location", {}).get("coordinates", [None, None])
    return {
        "id": doc["_id"],
        "time": doc.get("time"),
        "mag": doc.get("mag"),
        "mag_type": doc.get("mag_type"),
        "place": doc.get("place"),
        "depth_km": doc.get("depth_km"),
        "lon": location[0],
        "lat": location[1],
        "url": doc.get("url"),
    }


def health():
    try:
        get_db().command("ping")
        return {"status": "ok", "database": "connected"}
    except Exception:
        return {"status": "error", "database": "disconnected"}


def indexes():
    """Read index metadata directly from MongoDB for the database guide."""
    db = get_db()
    collections = []
    for collection_name in ("events", "swarms"):
        definitions = db[collection_name].index_information()
        collection_indexes = []
        for name, definition in definitions.items():
            keys = [
                {"field": field, "direction": direction}
                for field, direction in definition.get("key", [])
            ]
            collection_indexes.append({
                "name": name,
                "keys": keys,
                "unique": definition.get("unique", False),
            })
        collections.append({
            "collection": collection_name,
            "indexes": collection_indexes,
        })
    return {"collections": collections}


def stats():
    db = get_db()
    # Read the event time bounds in MongoDB instead of loading all events.
    time_summary = list(db.events.aggregate([
        {
            "$group": {
                "_id": None,
                "first": {"$min": "$time"},
                "last": {"$max": "$time"},
            }
        }
    ]))
    first_time = time_summary[0]["first"] if time_summary else None
    last_time = time_summary[0]["last"] if time_summary else None
    return {
        "total_events": db.events.count_documents({}),
        "first_event_time": first_time,
        "last_event_time": last_time,
        "swarm_count": db.swarms.count_documents({"kind": "swarm"}),
        "mainshock_sequence_count": db.swarms.count_documents({"kind": "mainshock_sequence"}),
    }


def events(
    min_lon=None,
    min_lat=None,
    max_lon=None,
    max_lat=None,
    start=None,
    end=None,
    min_mag=None,
    limit=2000,
    sort="mag_desc",
):
    query = {}
    coordinates = (min_lon, min_lat, max_lon, max_lat)
    if all(value is not None for value in coordinates):
        query["location"] = {
            "$geoWithin": {
                "$box": [[min_lon, min_lat], [max_lon, max_lat]],
            }
        }
    if start or end:
        query["time"] = _date_range(start, end)
    if min_mag is not None:
        query["mag"] = {"$gte": min_mag}

    if sort == "mag_desc":
        order = [("mag", -1), ("time", -1)]
    else:
        order = [("time", -1)]

    rows = [
        _event_doc(document)
        for document in get_db().events.find(query).sort(order).limit(limit)
    ]
    return {"count": len(rows), "events": rows}


def swarms(kind=None, min_events=None, start=None, end=None, sort="start_desc"):
    query = {}
    if kind:
        query["kind"] = kind
    if min_events is not None:
        query["n_events"] = {"$gte": min_events}
    if start or end:
        query["start"] = _date_range(start, end)

    direction = -1 if sort == "start_desc" else 1
    return list(
        get_db().swarms.find(query, {"event_ids": 0}).sort("start", direction)
    )


def swarm_detail(swarm_id):
    db = get_db()
    swarm = db.swarms.find_one({"_id": swarm_id})
    if not swarm:
        return None

    member_query = {"_id": {"$in": swarm.get("event_ids", [])}}
    member_events = db.events.find(member_query).sort("time", 1)
    swarm["events"] = [_event_doc(event) for event in member_events]
    return swarm


def _date_match(start, end, min_mag=None, swarm=False, kind=None):
    query = {}
    date_field = "start" if swarm else "time"
    if start or end:
        query[date_field] = _date_range(start, end)
    if min_mag is not None:
        query["mag"] = {"$gte": min_mag}
    if kind:
        query["kind"] = kind
    return query


def timeline(granularity, start=None, end=None, min_mag=None):
    date_format = "%Y" if granularity == "year" else "%Y-%m"
    # Group matching event timestamps into UTC calendar periods.
    pipeline = [
        {"$match": _date_match(start, end, min_mag)},
        {
            "$group": {
                "_id": {
                    "$dateToString": {
                        "format": date_format,
                        "date": "$time",
                        "timezone": "UTC",
                    }
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
        {"$project": {"_id": 0, "period": "$_id", "count": 1}},
    ]
    return list(get_db().events.aggregate(pipeline))


def magnitude_distribution(start=None, end=None, min_mag=None):
    # Floor magnitudes to half-unit buckets, then expose their bounds.
    pipeline = [
        {"$match": _date_match(start, end, min_mag)},
        {
            "$group": {
                "_id": {
                    "$multiply": [
                        {"$floor": {"$multiply": ["$mag", 2]}},
                        0.5,
                    ]
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
        {
            "$project": {
                "_id": 0,
                "bin_start": "$_id",
                "bin_end": {"$add": ["$_id", 0.5]},
                "count": 1,
            }
        },
    ]
    return list(get_db().events.aggregate(pipeline))


def depth_distribution(start=None, end=None, min_mag=None):
    # The facet keeps null-depth totals alongside the actual depth bins.
    pipeline = [
        {"$match": _date_match(start, end, min_mag)},
        {
            "$facet": {
                "bins": [
                    {"$match": {"depth_km": {"$ne": None}}},
                    {
                        "$group": {
                            "_id": {
                                "$multiply": [
                                    {"$floor": {"$divide": ["$depth_km", 10]}},
                                    10,
                                ]
                            },
                            "count": {"$sum": 1},
                        }
                    },
                    {"$sort": {"_id": 1}},
                    {
                        "$project": {
                            "_id": 0,
                            "bin_start": "$_id",
                            "bin_end": {"$add": ["$_id", 10]},
                            "count": 1,
                        }
                    },
                ],
                "excluded": [
                    {"$match": {"depth_km": None}},
                    {"$count": "count"},
                ],
            }
        },
    ]
    result = list(get_db().events.aggregate(pipeline))[0]
    excluded = result["excluded"][0]["count"] if result["excluded"] else 0
    return {"bins": result["bins"], "excluded_null_depth": excluded}


def magnitude_depth(start=None, end=None, min_mag=None):
    query = _date_match(start, end, min_mag)
    query["depth_km"] = {"$ne": None}
    # Sample a bounded number of records for the scatter plot.
    pipeline = [
        {"$match": query},
        {"$sample": {"size": 5000}},
        {"$project": {"_id": 0, "mag": 1, "depth_km": 1}},
    ]
    points = list(get_db().events.aggregate(pipeline))
    return {"sample_size": len(points), "points": points}


def regions(start=None, end=None, min_mag=None):
    # Region labels use the suffix of USGS place text after its final comma.
    pipeline = [
        {
            "$match": {
                **_date_match(start, end, min_mag),
                "place": {"$type": "string"},
            }
        },
        {
            "$project": {
                "region": {
                    "$let": {
                        "vars": {"parts": {"$split": ["$place", ","]}},
                        "in": {
                            "$trim": {
                                "input": {"$arrayElemAt": ["$$parts", -1]}
                            }
                        },
                    }
                },
                "mag": 1,
            }
        },
        {
            "$group": {
                "_id": "$region",
                "count": {"$sum": 1},
                "avg_mag": {"$avg": "$mag"},
            }
        },
        {"$sort": {"count": -1}},
        {"$limit": 15},
        {
            "$project": {
                "_id": 0,
                "region": "$_id",
                "count": 1,
                "avg_mag": 1,
            }
        },
    ]
    return list(get_db().events.aggregate(pipeline))


def magnitude_types(start=None, end=None, min_mag=None):
    # Keep missing magnitude-type values visible as a named category.
    pipeline = [
        {"$match": _date_match(start, end, min_mag)},
        {
            "$group": {
                "_id": {"$ifNull": ["$mag_type", "Not available"]},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"count": -1}},
        {"$project": {"_id": 0, "mag_type": "$_id", "count": 1}},
    ]
    return list(get_db().events.aggregate(pipeline))


def swarm_summary(start=None, end=None, kind=None):
    # Summarize cluster counts and means by stored classification.
    pipeline = [
        {"$match": _date_match(start, end, swarm=True, kind=kind)},
        {
            "$group": {
                "_id": "$kind",
                "count": {"$sum": 1},
                "avg_duration_days": {"$avg": "$duration_days"},
                "avg_n_events": {"$avg": "$n_events"},
            }
        },
        {
            "$project": {
                "_id": 0,
                "kind": "$_id",
                "count": 1,
                "avg_duration_days": 1,
                "avg_n_events": 1,
            }
        },
    ]
    return {"by_kind": list(get_db().swarms.aggregate(pipeline))}


def swarm_scatter(start=None, end=None, kind=None):
    query = _date_match(start, end, swarm=True, kind=kind)
    projection = {
        "_id": 1,
        "kind": 1,
        "duration_days": 1,
        "n_events": 1,
        "max_mag": 1,
    }
    return list(get_db().swarms.find(query, projection))


def swarm_timeline(granularity, start=None, end=None, kind=None):
    date_format = "%Y" if granularity == "year" else "%Y-%m"
    # Group cluster start dates by period and classification.
    pipeline = [
        {"$match": _date_match(start, end, swarm=True, kind=kind)},
        {
            "$group": {
                "_id": {
                    "period": {
                        "$dateToString": {
                            "format": date_format,
                            "date": "$start",
                            "timezone": "UTC",
                        }
                    },
                    "kind": "$kind",
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id.period": 1}},
        {
            "$project": {
                "_id": 0,
                "period": "$_id.period",
                "kind": "$_id.kind",
                "count": 1,
            }
        },
    ]
    return list(get_db().swarms.aggregate(pipeline))


def swarm_radius(start=None, end=None, kind=None):
    query = _date_match(start, end, swarm=True, kind=kind)
    documents = get_db().swarms.find(query, {"radius_km": 1})
    counts = {}
    for document in documents:
        radius = document.get("radius_km")
        if radius is None:
            continue
        bin_start = math.floor(radius / 10) * 10
        counts[bin_start] = counts.get(bin_start, 0) + 1

    return [
        {"bin_start": start, "bin_end": start + 10, "count": counts[start]}
        for start in sorted(counts)
    ]


def inter_event_times(start=None, end=None, kind=None):
    query = _date_match(start, end, swarm=True, kind=kind)
    bins = [
        {"start": 0.0, "end": 0.01, "label": "<0.01"},
        {"start": 0.01, "end": 0.1, "label": "0.01–0.1"},
        {"start": 0.1, "end": 1.0, "label": "0.1–1"},
        {"start": 1.0, "end": 10.0, "label": "1–10"},
        {"start": 10.0, "end": 100.0, "label": "10–100"},
        {"start": 100.0, "end": 1000.0, "label": "100–1,000"},
        {"start": 1000.0, "end": 10000.0, "label": "1,000–10,000"},
        {"start": 10000.0, "end": None, "label": "10,000+"},
    ]
    counts = [0] * len(bins)
    swarms_query = get_db().swarms.find(query, {"event_ids": 1})

    for swarm in swarms_query:
        event_query = {"_id": {"$in": swarm.get("event_ids", [])}}
        event_projection = {"time": 1}
        event_cursor = get_db().events.find(event_query, event_projection).sort("time", 1)
        times = [event["time"] for event in event_cursor]

        for earlier, later in zip(times, times[1:]):
            gap_hours = (later - earlier).total_seconds() / 3600
            for index, time_bin in enumerate(bins):
                lower_bound = time_bin["start"]
                upper_bound = time_bin["end"]
                is_in_bin = gap_hours >= lower_bound
                if upper_bound is not None:
                    is_in_bin = is_in_bin and gap_hours < upper_bound
                if is_in_bin:
                    counts[index] += 1
                    break

    return [
        {
            "bin_start_hours": time_bin["start"],
            "bin_end_hours": time_bin["end"],
            "label": time_bin["label"],
            "count": counts[index],
        }
        for index, time_bin in enumerate(bins)
    ]
