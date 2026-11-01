"""
QuakeSwarm configuration — all tuneable settings live here.
Values are read from .env (for secrets) or hardcoded (for app defaults).
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the backend directory so the app works
# regardless of where the process is started from.
_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")

# ── MongoDB connection ────────────────────────────────────────────────
MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME: str = os.getenv("DB_NAME", "quakeswarm")

# ── USGS Earthquake API ──────────────────────────────────────────────
# Base URL for the USGS FDSN event web-service (v1).
USGS_BASE_URL: str = "https://earthquake.usgs.gov/fdsnws/event/1"

# ── Data-ingestion defaults ──────────────────────────────────────────
# Date window and magnitude floor used when fetching historical quakes.
DEFAULT_START: str = "2015-01-01"
DEFAULT_END: str = "2025-12-31"
DEFAULT_MIN_MAG: float = 2.5

# The USGS API caps results at 20 000 per request, so we split the
# date range into chunks of this many days to stay under the limit.
DEFAULT_CHUNK_DAYS: int = 60

# Polite pause (seconds) between consecutive USGS requests to avoid
# hammering the public API.
REQUEST_PAUSE_SEC: float = 0.5

# ── Swarm-detection parameters ───────────────────────────────────────
# Spatial radius (km) — events within this distance may belong to the
# same swarm.
SPACE_KM: float = 15

# Temporal window (days) — events within this many days may belong to
# the same swarm.
TIME_DAYS: int = 7

# A cluster must contain at least this many events to be labelled a
# swarm (filters out random noise).
MIN_EVENTS: int = 20

# If the gap between the largest and second-largest magnitude in a
# cluster exceeds this threshold, the cluster looks more like a
# mainshock-aftershock sequence than a swarm.
MAG_GAP_THRESHOLD: float = 1.2

# A large event near the beginning of a cluster can indicate a mainshock
# sequence even when its lead over the second-largest event is below 1.2.
EARLY_MAINSHOCK_MAGNITUDE: float = 6.0
EARLY_MAINSHOCK_FRACTION: float = 0.25
