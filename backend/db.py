"""
Database helpers — connection management and index setup.
Every other module should import `get_db()` from here instead of
creating its own MongoClient.
"""

from pymongo import MongoClient, ASCENDING
try:  # Support both `uvicorn main:app` from backend/ and package imports from root.
    from .config import MONGODB_URI, DB_NAME
except ImportError:
    from config import MONGODB_URI, DB_NAME

# Module-level cache so we reuse a single MongoClient across the app
# (MongoClient already pools connections internally).
_client: MongoClient | None = None


def get_client() -> MongoClient:
    """Return a cached MongoClient, creating one on first call."""
    global _client
    if _client is None:
        _client = MongoClient(MONGODB_URI)
    return _client


def get_db():
    """Return the project database handle."""
    return get_client()[DB_NAME]


def ensure_indexes() -> None:
    """
    Create indexes that the app relies on for query performance.
    Safe to call repeatedly — MongoDB skips indexes that already exist.
    """
    db = get_db()

    # ── events collection ─────────────────────────────────────────
    # 2dsphere on location lets us run $geoNear / $geoWithin queries
    events_indexes = [
        ("location", "2dsphere"),
        ("time", ASCENDING),
        ("mag", ASCENDING),
    ]

    for field, kind in events_indexes:
        result = db.events.create_index([(field, kind)])
        print(f"  events.{field} ({kind}) -> index name: {result}")

    # ── swarms collection ─────────────────────────────────────────
    result = db.swarms.create_index([("start", ASCENDING)])
    print(f"  swarms.start (ascending) -> index name: {result}")
