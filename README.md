# QuakeSwarm

QuakeSwarm retrieves real earthquake events from the USGS FDSN catalog, stores them in MongoDB, detects spatial-temporal clusters with DBSCAN, and displays the records in a FastAPI and React application. The interface includes Overview, Swarm Explorer, three focused Analytics pages, About / Info, and an optional 3D Globe Lab.

## Data and method

The configured catalog covers 2015-01-01 through 2025-12-31 with a minimum magnitude of 2.5. Ingestion validates USGS records and upserts them by event ID. Detection converts longitude, latitude, and elapsed time to scaled coordinates and applies DBSCAN using the configured 15 km spatial scale, 7 day temporal scale, and 20-event minimum. A cluster is classified as `mainshock_sequence` when its largest event leads the second-largest by at least 1.2 magnitude units, or when its largest event is at least M6.0 and falls within the first 25% of the cluster time span. Otherwise it is `swarm`; if the magnitude gap cannot be computed, it is `unclassified`. This is a data exploration heuristic, not a seismological determination.

**Catalog coverage caveat:** USGS publishes M2.5+ events for the United States but roughly M4.0+ elsewhere. Low-magnitude results, including top regions and the 3.5–4.0 magnitude-distribution dip, therefore over-represent US areas. The project does not alter the catalog to compensate for this coverage difference.

MongoDB stores source events in `events` with a GeoJSON Point `[longitude, latitude]` and cluster summaries in `swarms` with member event IDs. The configured indexes are `events.location` (2dsphere), `events.time` (ascending), `events.mag` (ascending), and `swarms.start` (ascending); `/api/indexes` reads the actual definitions from the connected database. The About / Info page describes the collection model, live index list, and how geospatial/time queries and aggregation pipelines fit this data. The region chart derives its region from text after the final comma in USGS `place`, which is a display heuristic. A cluster `bbox` may be misleading for a cluster crossing the ±180° longitude boundary; the centroid calculation uses unit-sphere vectors to handle that boundary.

### Current local data snapshot

The configured local MongoDB currently contains 310,333 USGS events (83,279,944 bytes of document data) and 425 detected clusters (1,374,771 bytes of document data). Running `python -m backend.scripts.detect` on those events produced 293 `swarm`, 132 `mainshock_sequence`, and 0 `unclassified` records with the classification rule above. These are database measurements from the current local run, not constants in the application; rerunning ingestion or detection may change them.

## Project structure

- `backend/config.py`: connection, ingestion, and detection defaults
- `backend/db.py`: MongoDB client and index setup
- `backend/scripts/ingest.py`: USGS fetch, validation, and idempotent upsert
- `backend/scripts/detect.py`: clustering and swarm document generation
- `backend/db_queries.py`: MongoDB read and aggregation helpers
- `backend/main.py`: FastAPI routes and request validation
- `frontend/src/pages/Overview.jsx`: live event and swarm overview
- `frontend/src/pages/SwarmExplorer.jsx`: filterable cluster catalog and detail
- `frontend/src/pages/Analytics.jsx`: event, cluster, and structure charts
- `frontend/src/pages/AboutInfo.jsx`: combined swarm guide and database information
- `frontend/src/pages/WhyMongoDB.jsx`: collection model and live index metadata
- `frontend/src/pages/GlobeLab.jsx`: isolated lazy-loaded 3D view

## Setup

Use Python 3.10+, Node.js, and a running MongoDB instance or Atlas database. Copy `backend/.env.example` to `backend/.env`, then set `MONGODB_URI` and `DB_NAME`. Copy `frontend/.env.example` to `frontend/.env` if you need to set `VITE_API_URL`.

From the repository root:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn main:app --reload
```

The root `main.py` forwards to `backend.main`, so the same Uvicorn command also works from the `backend` directory. The API is available at `http://127.0.0.1:8000`; interactive API documentation is at `/docs`. On macOS/Linux, use `python3` instead of `python` if needed.

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

The frontend opens at `http://127.0.0.1:5173`. It reads its API URL from `frontend/.env`; `.env.example` supplies the default.

To ingest the configured catalog and generate cluster records, run from the repository root:

```powershell
python -m backend.scripts.ingest
python -m backend.scripts.detect
```

A smaller ingestion interval can be supplied with `--start`, `--end`, `--minmag`, and `--chunk-days`. Detection options are listed by `python -m backend.scripts.detect --help`.

## API

All endpoints return JSON. `/api/health`, `/api/stats`, and `/api/indexes` report database state and metadata. `/api/events` accepts bounding-box, date, magnitude, sorting, and limit filters. `/api/swarms` lists detected clusters, and `/api/swarms/{id}` returns a cluster with its event records.

Analytics endpoints are `/api/timeline`, `/api/analytics/magnitude-distribution`, `/api/analytics/depth-distribution`, `/api/analytics/magnitude-depth`, `/api/analytics/regions`, `/api/analytics/magnitude-types`, `/api/analytics/swarm-summary`, `/api/analytics/swarm-scatter`, `/api/analytics/swarm-timeline`, `/api/analytics/swarm-radius`, and `/api/analytics/inter-event-times`. Invalid dates, bounds, and typed query values return HTTP 422; an unknown swarm ID returns 404.

## Verification

Run backend tests from the repository root with:

```powershell
python -m pytest -p no:cacheprovider backend/tests
```

Build the frontend with:

```powershell
cd frontend
npm run build
```

Interactive layout, browser console behavior, and WebGL rendering should be checked in a browser with the API and frontend running.

## Known limitations

DBSCAN processes the valid catalog events in memory. The cluster labels depend on the configured distance, time, sample-count, and magnitude thresholds. Region parsing uses USGS place text as described above. The USGS catalog has uneven geographic magnitude coverage, so low-magnitude maps and summaries over-represent US areas. Globe Lab is optional and its large WebGL bundle is lazy-loaded.

To remove Globe Lab, remove its route and navigation link from `frontend/src/App.jsx`, delete `frontend/src/pages/GlobeLab.jsx`, and remove `react-globe.gl` from `frontend/package.json` (then update the lockfile with the package manager).

## Credits

Data source: [USGS Earthquake Catalog](https://earthquake.usgs.gov/earthquakes/feed/v1.0/). The map uses [Leaflet](https://leafletjs.com/) and [OpenStreetMap tiles](https://www.openstreetmap.org/copyright). Charts use [Plotly basic distribution](https://www.npmjs.com/package/plotly.js-basic-dist-min). Globe Lab uses [NASA Blue Marble Next Generation topography](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/). Country boundaries in Swarm Explorer come from [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/). The project was built with AI assistance; design choices and evaluation are the student's responsibility.
