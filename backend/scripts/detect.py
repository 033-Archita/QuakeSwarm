"""Run spatial-temporal DBSCAN over stored events and replace swarm results."""
import argparse
import sys
from datetime import timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from sklearn.cluster import DBSCAN
from config import SPACE_KM, TIME_DAYS, MIN_EVENTS, MAG_GAP_THRESHOLD
from db import get_db

EARTH_RADIUS_KM = 6371.0


def spherical_centroid(points):
    """Average unit-sphere vectors so clusters near ±180° stay geographically close."""
    radians = np.radians(points)
    vectors = np.column_stack((np.cos(radians[:, 1]) * np.cos(radians[:, 0]),
                               np.cos(radians[:, 1]) * np.sin(radians[:, 0]),
                               np.sin(radians[:, 1])))
    mean = vectors.mean(axis=0)
    mean /= np.linalg.norm(mean)
    lon = float(np.degrees(np.arctan2(mean[1], mean[0])))
    lat = float(np.degrees(np.arctan2(mean[2], np.hypot(mean[0], mean[1]))))
    return lon, lat


def classify_magnitudes(magnitudes, threshold=MAG_GAP_THRESHOLD):
    ordered = sorted((float(m) for m in magnitudes if m is not None), reverse=True)
    if len(ordered) < 2:
        return None, None, None, "unclassified"
    gap = ordered[0] - ordered[1]
    return ordered[0], ordered[1], gap, "mainshock_sequence" if gap >= threshold else "swarm"


def build_swarm(cluster_id, members, threshold=MAG_GAP_THRESHOLD):
    points = np.array([[e["location"]["coordinates"][0], e["location"]["coordinates"][1]] for e in members], dtype=float)
    lon, lat = spherical_centroid(points)
    distances = []
    for event in members:
        elon, elat = event["location"]["coordinates"]
        lat1, lat2 = np.radians([lat, elat]); dlat = lat2 - lat1; dlon = np.radians(elon - lon)
        a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
        distances.append(2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(min(1.0, a))))
    max_mag, second_mag, gap, kind = classify_magnitudes([e.get("mag") for e in members], threshold)
    ordered = sorted(members, key=lambda e: e["time"])
    lons, lats = points[:, 0], points[:, 1]
    largest = max(members, key=lambda e: e["mag"])
    duration = max(0.0, (ordered[-1]["time"] - ordered[0]["time"]).total_seconds() / 86400)
    return {"_id": str(cluster_id), "start": ordered[0]["time"], "end": ordered[-1]["time"],
            "duration_days": duration, "n_events": len(members),
            "centroid": {"type": "Point", "coordinates": [lon, lat]},
            "bbox": [float(lons.min()), float(lats.min()), float(lons.max()), float(lats.max())],
            "radius_km": float(max(distances, default=0)), "max_mag": max_mag,
            "second_mag": second_mag, "mag_gap": gap, "kind": kind,
            "event_ids": [e["_id"] for e in ordered], "label": largest.get("place")}


def detect(space_km=SPACE_KM, time_days=TIME_DAYS, min_events=MIN_EVENTS, threshold=MAG_GAP_THRESHOLD):
    collection = get_db().events
    events = list(collection.find({"time": {"$type": "date"}, "mag": {"$type": "number"},
                                   "location.coordinates.0": {"$type": "number"}, "location.coordinates.1": {"$type": "number"}},
                                  {"time": 1, "mag": 1, "location": 1, "place": 1}))
    events.sort(key=lambda e: e["time"])
    db = get_db()
    db.swarms.delete_many({})
    if len(events) < min_events:
        print(f"Only {len(events)} valid events; fewer than min_events={min_events}. Swarms replaced with empty results.")
        return {"events": len(events), "clusters": 0, "by_kind": {}}
    first = events[0]["time"]
    coords = np.empty((len(events), 4), dtype=float)
    for i, event in enumerate(events):
        lon, lat = np.radians(event["location"]["coordinates"][:2])
        coords[i, :3] = [EARTH_RADIUS_KM * np.cos(lat) * np.cos(lon),
                         EARTH_RADIUS_KM * np.cos(lat) * np.sin(lon), EARTH_RADIUS_KM * np.sin(lat)]
        elapsed_days = (event["time"] - first).total_seconds() / 86400
        coords[i, 3] = elapsed_days * (space_km / time_days)
    # One worker avoids joblib's process/thread-pool setup and keeps memory use predictable.
    labels = DBSCAN(eps=space_km, min_samples=min_events, metric="euclidean", n_jobs=1).fit_predict(coords)
    records = []
    for label in sorted(set(labels)):
        if label == -1: continue
        members = [events[i] for i, value in enumerate(labels) if value == label]
        records.append(build_swarm(int(label), members, threshold))
    if records: db.swarms.insert_many(records, ordered=False)
    counts = {kind: sum(1 for item in records if item["kind"] == kind) for kind in ("swarm", "mainshock_sequence", "unclassified")}
    print(f"Processed {len(events)} events; detected {len(records)} clusters: {counts}")
    return {"events": len(events), "clusters": len(records), "by_kind": counts}


def main():
    parser = argparse.ArgumentParser(description="Detect earthquake swarms using spatial-temporal DBSCAN.")
    parser.add_argument("--space-km", type=float, default=SPACE_KM)
    parser.add_argument("--time-days", type=float, default=TIME_DAYS)
    parser.add_argument("--min-events", type=int, default=MIN_EVENTS)
    parser.add_argument("--mag-gap-threshold", type=float, default=MAG_GAP_THRESHOLD)
    args = parser.parse_args()
    if args.space_km <= 0 or args.time_days <= 0 or args.min_events < 1:
        parser.error("space-km and time-days must be positive; min-events must be at least 1")
    detect(args.space_km, args.time_days, args.min_events, args.mag_gap_threshold)


if __name__ == "__main__": main()
