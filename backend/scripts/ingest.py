"""
QuakeSwarm — USGS Earthquake Data Ingestion Script
===================================================
Downloads historical earthquake data from the USGS GeoJSON API and upserts
it into MongoDB.  Handles the USGS 20 000-event-per-query limit by checking
the count endpoint first and recursively splitting time windows when needed.

Usage:
    python -m backend.scripts.ingest --start 2015-01-01 --end 2025-12-31
    python -m backend.scripts.ingest --start 2024-01-01 --end 2024-03-01 --minmag 4.0
"""

# ---------------------------------------------------------------------------
# Path setup — allow imports from the backend package when running as a script
# ---------------------------------------------------------------------------
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import math
import time
from datetime import datetime, timedelta, timezone

import requests
from pymongo import UpdateOne

from config import (
    DEFAULT_CHUNK_DAYS,
    DEFAULT_END,
    DEFAULT_MIN_MAG,
    DEFAULT_START,
    REQUEST_PAUSE_SEC,
    USGS_BASE_URL,
)
from db import ensure_indexes, get_db

# ── Constants ──────────────────────────────────────────────────────────────
USGS_COUNT_URL = f"{USGS_BASE_URL}/count"
USGS_QUERY_URL = f"{USGS_BASE_URL}/query"

# USGS rejects queries that would return more than 20 000 events
USGS_MAX_EVENTS = 20_000

# HTTP retry settings — exponential backoff keeps us polite if USGS is slow
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = [2, 4, 8]

REQUEST_HEADERS = {"User-Agent": "QuakeSwarm/1.0 (student-project)"}
REQUEST_TIMEOUT = 60  # seconds


# ── HTTP helpers ───────────────────────────────────────────────────────────

def _usgs_get(url: str, params: dict) -> requests.Response:
    """
    Send a GET request to USGS with automatic retry + exponential backoff.

    Why retry?  The USGS API occasionally returns 503 or times out during
    peak usage.  We retry up to MAX_RETRIES times, waiting progressively
    longer between attempts so we don't hammer the service.
    """
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(
                url,
                params=params,
                headers=REQUEST_HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            # Pace both the count and event endpoints, not only downloads.
            time.sleep(REQUEST_PAUSE_SEC)
            return resp
        except (requests.RequestException, requests.Timeout) as exc:
            last_error = exc
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_BACKOFF_SECONDS[attempt]
                print(f"  Request failed ({exc}), retrying in {wait}s ...")
                time.sleep(wait)

    # All retries exhausted
    raise RuntimeError(
        f"USGS request failed after {MAX_RETRIES} retries: {last_error}"
    ) from last_error


def _build_params(start: str, end: str, min_mag: float) -> dict:
    """Return the shared query-string parameters for USGS requests."""
    return {
        "format": "geojson",
        "eventtype": "earthquake",
        "orderby": "time-asc",
        "minmagnitude": min_mag,
        "starttime": start,
        "endtime": end,
    }


# ── Counting / smart chunking ─────────────────────────────────────────────

def _get_usgs_count(start: str, end: str, min_mag: float) -> int:
    """
    Ask USGS how many events match the query *without* downloading them.

    Why check first?  Downloading the full payload only to find the server
    returns HTTP 400 (>20 000 events) wastes bandwidth and time.  Checking
    the count endpoint is very cheap and lets us decide whether to split.
    """
    params = _build_params(start, end, min_mag)
    resp = _usgs_get(USGS_COUNT_URL, params)
    # The count service has returned both a plain integer and a JSON object
    # across API versions; accept either documented response shape.
    try:
        return int(resp.text.strip())
    except ValueError:
        try:
            payload = resp.json()
            return int(payload["count"])
        except (ValueError, KeyError, TypeError) as exc:
            raise RuntimeError("USGS count endpoint returned an invalid response") from exc


def _generate_date_chunks(
    start: str, end: str, chunk_days: int
) -> list[tuple[str, str]]:
    """
    Split [start, end] into fixed-size windows of *chunk_days* each.

    The last window is clamped to *end* so we never request beyond the
    user-specified range.
    """
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    chunks = []
    cursor = start_dt
    while cursor < end_dt:
        chunk_end = min(cursor + timedelta(days=chunk_days), end_dt)
        chunks.append((cursor.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d")))
        cursor = chunk_end
    return chunks


def _split_and_fetch(
    start: str, end: str, min_mag: float, collection, counters: dict
) -> None:
    """
    Recursively split a time window until USGS can serve it (≤20 000 events),
    then download and upsert.

    Algorithm:
      1. Call the count endpoint for [start, end].
      2. If the count is 0 → nothing to do.
      3. If the count ≤ 20 000 → safe to download in one request.
         a. But first check MongoDB: if we already have exactly that many
            events in this range, skip the download (idempotent re-runs).
         b. Otherwise download, parse, and upsert.
      4. If the count > 20 000 → split the interval at the midpoint and
         recurse into each half.  This guarantees termination because the
         interval shrinks every level (minimum 1 day).
    """
    count = _get_usgs_count(start, end, min_mag)

    if count == 0:
        print(f"  No events in [{start} ... {end}]")
        return

    if count > USGS_MAX_EVENTS:
        # Interval too large for USGS — split at the midpoint and recurse
        start_dt = datetime.strptime(start, "%Y-%m-%d")
        end_dt = datetime.strptime(end, "%Y-%m-%d")
        mid_dt = start_dt + (end_dt - start_dt) / 2

        # Avoid infinite recursion when the interval is already 1 day
        if (end_dt - start_dt).days <= 1:
            print(
                f"  Cannot split [{start} ... {end}] further "
                f"({count} events in a single day). Skipping."
            )
            return

        mid = mid_dt.strftime("%Y-%m-%d")
        print(
            f"  Count {count} > {USGS_MAX_EVENTS} for [{start} ... {end}] "
            f"- splitting at {mid}"
        )
        _split_and_fetch(start, mid, min_mag, collection, counters)
        _split_and_fetch(mid, end, min_mag, collection, counters)
        return

    # ── Duplicate avoidance ────────────────────────────────────────────
    # If MongoDB already has exactly the same number of events for this
    # time range, the data was already ingested — skip re-downloading.
    start_dt_utc = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_dt_utc = datetime.strptime(end, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    existing_count = collection.count_documents(
        {"time": {"$gte": start_dt_utc, "$lt": end_dt_utc}, "mag": {"$gte": min_mag}}
    )
    if existing_count == count:
        print(
            f"  Skipping chunk [{start} ... {end}]: "
            f"already have {existing_count} events"
        )
        return

    # ── Download the events ────────────────────────────────────────────
    _fetch_and_upsert(start, end, min_mag, count, collection, counters)


# ── Parsing & validation ──────────────────────────────────────────────────

def _parse_feature(feature: dict) -> dict | None:
    """
    Convert one USGS GeoJSON feature into a MongoDB document.

    Returns None when a required field is missing so the caller can count
    and skip bad records.  Required: id, time, coordinates, magnitude.
    Optional (may be null): depth_km, mag_type, place.
    """
    # ── Required fields ────────────────────────────────────────────────
    if not isinstance(feature, dict):
        return None
    usgs_id = feature.get("id")
    if not usgs_id:
        return None

    props = feature.get("properties") or {}
    if not isinstance(props, dict):
        return None
    raw_time = props.get("time")  # milliseconds since epoch
    raw_mag = props.get("mag")
    if not isinstance(raw_time, (int, float)) or not isinstance(raw_mag, (int, float)):
        return None
    if not math.isfinite(raw_time) or not math.isfinite(raw_mag):
        return None

    geometry = feature.get("geometry") or {}
    if not isinstance(geometry, dict):
        return None
    coords = geometry.get("coordinates")  # [lon, lat, depth_km]
    if not isinstance(coords, (list, tuple)) or len(coords) < 2:
        return None

    lon, lat = coords[0], coords[1]
    if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
        return None
    if not math.isfinite(lon) or not math.isfinite(lat):
        return None

    # Basic sanity: lon ∈ [-180, 180], lat ∈ [-90, 90]
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return None

    # ── Build the document ─────────────────────────────────────────────
    try:
        event_time = datetime.fromtimestamp(raw_time / 1000.0, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None

    # depth_km is the third coordinate — may be null or absent
    depth_km = coords[2] if len(coords) >= 3 and isinstance(coords[2], (int, float)) and math.isfinite(coords[2]) else None

    return {
        "_id": usgs_id,
        "time": event_time,
        "mag": raw_mag,
        "mag_type": props.get("magType"),   # can be null
        "place": props.get("place"),        # can be null
        "depth_km": depth_km,               # can be null
        "location": {                       # GeoJSON Point for 2dsphere index
            "type": "Point",
            "coordinates": [lon, lat],
        },
        "url": props.get("url"),
    }


# ── Download + upsert ─────────────────────────────────────────────────────

def _fetch_and_upsert(
    start: str,
    end: str,
    min_mag: float,
    expected_count: int,
    collection,
    counters: dict,
) -> None:
    """
    Download a single chunk from USGS, parse every feature, and bulk-upsert
    into MongoDB.

    Why upsert (not insert)?  If the script is interrupted and re-run, or if
    USGS corrects a record, we want the latest version without crashing on
    duplicate _id errors.  `update_one` with `upsert=True` handles both
    inserts and updates cleanly.
    """
    print(f"  Fetching [{start} ... {end}] - expecting {expected_count} events")

    params = _build_params(start, end, min_mag)
    resp = _usgs_get(USGS_QUERY_URL, params)
    try:
        data = resp.json()
    except requests.exceptions.JSONDecodeError as exc:
        raise RuntimeError(f"USGS returned invalid JSON for [{start} … {end}]") from exc
    if not isinstance(data, dict) or not isinstance(data.get("features"), list):
        raise RuntimeError(f"USGS returned an invalid GeoJSON response for [{start} … {end}]")
    features = data["features"]

    # ── Parse and validate each feature ────────────────────────────────
    operations: list[UpdateOne] = []
    skipped = 0
    for feature in features:
        doc = _parse_feature(feature)
        if doc is None:
            skipped += 1
            continue
        # Upsert keyed on _id (USGS event id) — replaces all fields
        operations.append(
            UpdateOne({"_id": doc["_id"]}, {"$set": doc}, upsert=True)
        )

    counters["skipped"] += skipped

    # ── Bulk write for performance ─────────────────────────────────────
    if operations:
        result = collection.bulk_write(operations, ordered=False)
        inserted = result.upserted_count
        # matched_count includes both no-op matches and actual modifications
        updated = result.modified_count
        counters["inserted"] += inserted
        counters["updated"] += updated
        counters["processed"] += len(operations)
        print(
            f"    {len(operations)} valid events - "
            f"{inserted} inserted, {updated} updated, {skipped} skipped"
        )
    else:
        print(f"    No valid events in chunk (all {skipped} skipped)")

# ── Main entry point ──────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest USGS earthquake data into MongoDB."
    )
    parser.add_argument(
        "--start",
        default=DEFAULT_START,
        help=f"Start date YYYY-MM-DD (default: {DEFAULT_START})",
    )
    parser.add_argument(
        "--end",
        default=DEFAULT_END,
        help=f"End date YYYY-MM-DD (default: {DEFAULT_END})",
    )
    parser.add_argument(
        "--minmag",
        type=float,
        default=DEFAULT_MIN_MAG,
        help=f"Minimum magnitude (default: {DEFAULT_MIN_MAG})",
    )
    parser.add_argument(
        "--chunk-days",
        type=int,
        default=DEFAULT_CHUNK_DAYS,
        help=f"Days per chunk (default: {DEFAULT_CHUNK_DAYS})",
    )
    args = parser.parse_args()

    try:
        start_dt = datetime.strptime(args.start, "%Y-%m-%d")
        end_dt = datetime.strptime(args.end, "%Y-%m-%d")
    except ValueError:
        parser.error("--start and --end must use YYYY-MM-DD")
    if start_dt >= end_dt:
        parser.error("--start must be earlier than --end")
    if args.chunk_days < 1:
        parser.error("--chunk-days must be at least 1")
    if args.minmag < -2 or args.minmag > 10:
        parser.error("--minmag must be between -2 and 10")

    print("=" * 60)
    print("QuakeSwarm - USGS Earthquake Ingestion")
    print("=" * 60)
    print(f"  Range     : {args.start} to {args.end}")
    print(f"  Min mag   : {args.minmag}")
    print(f"  Chunk size: {args.chunk_days} days")
    print()

    # ── Database setup ─────────────────────────────────────────────────
    db = get_db()
    collection = db["events"]
    ensure_indexes()
    print("Connected to MongoDB - indexes ensured\n")

    # ── Chunk loop ─────────────────────────────────────────────────────
    chunks = _generate_date_chunks(args.start, args.end, args.chunk_days)
    counters = {"processed": 0, "inserted": 0, "updated": 0, "skipped": 0}

    for i, (chunk_start, chunk_end) in enumerate(chunks, 1):
        print(f"[{i}/{len(chunks)}] Chunk {chunk_start} to {chunk_end}")
        _split_and_fetch(
            chunk_start, chunk_end, args.minmag, collection, counters
        )
        print()

    # ── Summary ────────────────────────────────────────────────────────
    final_count = collection.count_documents({})
    print("=" * 60)
    print("Ingestion complete")
    print("=" * 60)
    print(f"  Total processed : {counters['processed']}")
    print(f"  Total inserted  : {counters['inserted']}")
    print(f"  Total updated   : {counters['updated']}")
    print(f"  Total skipped   : {counters['skipped']}")
    print(f"  MongoDB docs    : {final_count}")
    print("=" * 60)


if __name__ == "__main__":
    main()
