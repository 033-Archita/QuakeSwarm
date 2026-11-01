"""Run spatial-temporal DBSCAN over stored events and replace swarm results."""

import argparse
from math import isfinite
import sys
from pathlib import Path

import numpy as np
from sklearn.cluster import DBSCAN

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    EARLY_MAINSHOCK_FRACTION,
    EARLY_MAINSHOCK_MAGNITUDE,
    MAG_GAP_THRESHOLD,
    MIN_EVENTS,
    SPACE_KM,
    TIME_DAYS,
)
from db import get_db


EARTH_RADIUS_KM = 6371.0


def spherical_centroid(points):
    """Average unit-sphere vectors so clusters near ±180° stay close."""
    radians = np.radians(points)
    vectors = np.column_stack((
        np.cos(radians[:, 1]) * np.cos(radians[:, 0]),
        np.cos(radians[:, 1]) * np.sin(radians[:, 0]),
        np.sin(radians[:, 1]),
    ))
    mean_vector = vectors.mean(axis=0)
    mean_vector /= np.linalg.norm(mean_vector)
    longitude = float(np.degrees(np.arctan2(mean_vector[1], mean_vector[0])))
    latitude = float(np.degrees(np.arctan2(
        mean_vector[2], np.hypot(mean_vector[0], mean_vector[1])
    )))
    return longitude, latitude


def classify_magnitudes(
    magnitudes,
    threshold=MAG_GAP_THRESHOLD,
    largest_event_fraction=None,
    early_mainshock_magnitude=EARLY_MAINSHOCK_MAGNITUDE,
    early_mainshock_fraction=EARLY_MAINSHOCK_FRACTION,
):
    """Classify using the magnitude gap or a large, early mainshock."""
    valid_magnitudes = []
    for magnitude in magnitudes:
        if magnitude is None:
            continue
        try:
            numeric_magnitude = float(magnitude)
        except (TypeError, ValueError):
            continue
        if isfinite(numeric_magnitude):
            valid_magnitudes.append(numeric_magnitude)

    ordered_magnitudes = sorted(valid_magnitudes, reverse=True)
    if len(ordered_magnitudes) < 2:
        return None, None, None, "unclassified"

    max_magnitude, second_magnitude = ordered_magnitudes[:2]
    magnitude_gap = max_magnitude - second_magnitude
    gap_marks_mainshock = magnitude_gap >= threshold
    early_large_event = (
        max_magnitude >= early_mainshock_magnitude
        and largest_event_fraction is not None
        and 0 <= largest_event_fraction <= early_mainshock_fraction
    )
    kind = "mainshock_sequence" if gap_marks_mainshock or early_large_event else "swarm"
    return max_magnitude, second_magnitude, magnitude_gap, kind


def _great_circle_distance_km(longitude_a, latitude_a, longitude_b, latitude_b):
    lat_a, lat_b = np.radians([latitude_a, latitude_b])
    delta_latitude = lat_b - lat_a
    delta_longitude = np.radians(longitude_b - longitude_a)
    haversine = (
        np.sin(delta_latitude / 2) ** 2
        + np.cos(lat_a) * np.cos(lat_b) * np.sin(delta_longitude / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(min(1.0, haversine)))


def build_swarm(
    cluster_id,
    members,
    threshold=MAG_GAP_THRESHOLD,
    early_mainshock_magnitude=EARLY_MAINSHOCK_MAGNITUDE,
    early_mainshock_fraction=EARLY_MAINSHOCK_FRACTION,
):
    """Build one stored swarm record from its member earthquake documents."""
    ordered_members = sorted(members, key=lambda event: event["time"])
    points = np.array([
        [
            event["location"]["coordinates"][0],
            event["location"]["coordinates"][1],
        ]
        for event in ordered_members
    ], dtype=float)
    longitude, latitude = spherical_centroid(points)
    distances = [
        _great_circle_distance_km(
            longitude,
            latitude,
            event["location"]["coordinates"][0],
            event["location"]["coordinates"][1],
        )
        for event in ordered_members
    ]

    largest_event = max(ordered_members, key=lambda event: event["mag"])
    start_time = ordered_members[0]["time"]
    end_time = ordered_members[-1]["time"]
    duration_seconds = (end_time - start_time).total_seconds()
    if duration_seconds == 0:
        largest_event_fraction = 0.0
    else:
        largest_event_offset = (largest_event["time"] - start_time).total_seconds()
        largest_event_fraction = largest_event_offset / duration_seconds

    max_magnitude, second_magnitude, gap, kind = classify_magnitudes(
        [event.get("mag") for event in ordered_members],
        threshold=threshold,
        largest_event_fraction=largest_event_fraction,
        early_mainshock_magnitude=early_mainshock_magnitude,
        early_mainshock_fraction=early_mainshock_fraction,
    )
    longitude_values = points[:, 0]
    latitude_values = points[:, 1]

    return {
        "_id": str(cluster_id),
        "start": start_time,
        "end": end_time,
        "duration_days": max(0.0, duration_seconds / 86400),
        "n_events": len(ordered_members),
        "centroid": {
            "type": "Point",
            "coordinates": [longitude, latitude],
        },
        "bbox": [
            float(longitude_values.min()),
            float(latitude_values.min()),
            float(longitude_values.max()),
            float(latitude_values.max()),
        ],
        "radius_km": float(max(distances, default=0)),
        "max_mag": max_magnitude,
        "second_mag": second_magnitude,
        "mag_gap": gap,
        "kind": kind,
        "event_ids": [event["_id"] for event in ordered_members],
        "label": largest_event.get("place"),
    }


def _event_coordinates(event, first_time, space_km, time_days):
    longitude, latitude = np.radians(event["location"]["coordinates"][:2])
    elapsed_days = (event["time"] - first_time).total_seconds() / 86400
    scaled_elapsed_days = elapsed_days * (space_km / time_days)
    return [
        EARTH_RADIUS_KM * np.cos(latitude) * np.cos(longitude),
        EARTH_RADIUS_KM * np.cos(latitude) * np.sin(longitude),
        EARTH_RADIUS_KM * np.sin(latitude),
        scaled_elapsed_days,
    ]


def detect(
    space_km=SPACE_KM,
    time_days=TIME_DAYS,
    min_events=MIN_EVENTS,
    threshold=MAG_GAP_THRESHOLD,
    early_mainshock_magnitude=EARLY_MAINSHOCK_MAGNITUDE,
    early_mainshock_fraction=EARLY_MAINSHOCK_FRACTION,
):
    """Cluster valid catalog events, then replace old records after success."""
    db = get_db()
    event_query = {
        "time": {"$type": "date"},
        "mag": {"$type": "number"},
        "location.coordinates.0": {"$type": "number"},
        "location.coordinates.1": {"$type": "number"},
    }
    event_projection = {"time": 1, "mag": 1, "location": 1, "place": 1}
    events = list(db.events.find(event_query, event_projection))
    events.sort(key=lambda event: event["time"])

    if len(events) < min_events:
        db.swarms.delete_many({})
        print(
            f"Only {len(events)} valid events; fewer than min_events={min_events}. "
            "Swarms replaced with empty results."
        )
        return {"events": len(events), "clusters": 0, "by_kind": {}}

    first_time = events[0]["time"]
    coordinates = np.array([
        _event_coordinates(event, first_time, space_km, time_days)
        for event in events
    ], dtype=float)
    labels = DBSCAN(
        eps=space_km,
        min_samples=min_events,
        metric="euclidean",
        n_jobs=1,
    ).fit_predict(coordinates)

    members_by_label = {}
    for event, label in zip(events, labels):
        if label == -1:
            continue
        members_by_label.setdefault(int(label), []).append(event)

    # Prepare all replacement documents first so a failed run preserves old data.
    records = [
        build_swarm(
            cluster_id,
            members,
            threshold,
            early_mainshock_magnitude,
            early_mainshock_fraction,
        )
        for cluster_id, members in sorted(members_by_label.items())
    ]
    db.swarms.delete_many({})
    if records:
        db.swarms.insert_many(records, ordered=False)

    kinds = ("swarm", "mainshock_sequence", "unclassified")
    counts = {
        kind: sum(record["kind"] == kind for record in records)
        for kind in kinds
    }
    print(f"Processed {len(events)} events; detected {len(records)} clusters: {counts}")
    return {"events": len(events), "clusters": len(records), "by_kind": counts}


def main():
    parser = argparse.ArgumentParser(
        description="Detect earthquake swarms using spatial-temporal DBSCAN."
    )
    parser.add_argument("--space-km", type=float, default=SPACE_KM)
    parser.add_argument("--time-days", type=float, default=TIME_DAYS)
    parser.add_argument("--min-events", type=int, default=MIN_EVENTS)
    parser.add_argument("--mag-gap-threshold", type=float, default=MAG_GAP_THRESHOLD)
    parser.add_argument(
        "--early-mainshock-magnitude",
        type=float,
        default=EARLY_MAINSHOCK_MAGNITUDE,
    )
    parser.add_argument(
        "--early-mainshock-fraction",
        type=float,
        default=EARLY_MAINSHOCK_FRACTION,
    )
    args = parser.parse_args()
    if args.space_km <= 0 or args.time_days <= 0 or args.min_events < 1:
        parser.error("space-km and time-days must be positive; min-events must be at least 1")
    if args.early_mainshock_magnitude < -2 or args.early_mainshock_fraction < 0:
        parser.error("early-mainshock magnitude must be at least -2 and fraction cannot be negative")
    if args.early_mainshock_fraction > 1:
        parser.error("early-mainshock fraction cannot exceed 1")

    detect(
        args.space_km,
        args.time_days,
        args.min_events,
        args.mag_gap_threshold,
        args.early_mainshock_magnitude,
        args.early_mainshock_fraction,
    )


if __name__ == "__main__":
    main()
