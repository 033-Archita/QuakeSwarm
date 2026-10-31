# QuakeSwarm

QuakeSwarm downloads real earthquake events from the USGS FDSN catalog, stores them in MongoDB, detects spatial-temporal clusters with DBSCAN, and presents live records through a FastAPI and React application. The frontend has an Overview, Swarm Explorer, three focused Analytics pages, a combined About / Info area, and an experimental 3D Globe Lab.

## Stack and layout

- Python 3.10+, FastAPI, PyMongo, NumPy, scikit-learn, requests, python-dotenv
- MongoDB, with `events` and `swarms` collections
- `backend/config.py`: environment and algorithm defaults
- `backend/db.py`: shared MongoDB client and indexes
- `backend/scripts/ingest.py`: USGS fetch, validation and idempotent upsert
- `backend/scripts/detect.py`: DBSCAN clustering and swarm document generation
- `backend/db_queries.py`: MongoDB read/query helpers used by the routes
- `backend/main.py`: FastAPI routes
- `frontend/src/api.js`: shared frontend API client
- `frontend/src/pages/Overview.jsx`: live-data Overview page
- `frontend/src/components/EventMap.jsx`: Leaflet earthquake and swarm map
- `frontend/src/pages/SwarmExplorer.jsx`: filterable cluster catalog and event-level detail
- `frontend/src/pages/Analytics.jsx`: 12 live Plotly charts across three groups
- `frontend/src/pages/WhyMongoDB.jsx`: live index metadata and on-demand benchmark
- `frontend/src/pages/GlobeLab.jsx`: isolated, lazy-loaded 3D view using `react-globe.gl`
- `frontend/src/pages/AboutSwarms.jsx`: explanation of the catalog floor and detection thresholds
- `frontend/src/catalog.js`: shared date/magnitude limits and displayed detection defaults
- `frontend/src/geography.js` and `frontend/public/countries.json`: centroid-to-country/continent lookup for Swarm Explorer using Natural Earth boundaries

## Setup and run

Install MongoDB locally or use an Atlas connection string. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` and `DB_NAME`. From the repository root, install pinned dependencies and start the backend:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn main:app --reload
```

The root `main.py` forwards to `backend.main`, so this command also works from the `backend` directory: `python -m uvicorn main:app --reload`.

Mac/Linux uses the same commands with `python3` in place of `python` where needed. The API defaults to `http://127.0.0.1:8000`; Swagger UI is at `/docs`.

In another terminal from the repository root, install pinned frontend packages and start Vite:

```powershell
cd frontend
npm install
npm run dev
```

The app opens at `http://127.0.0.1:5173` and reads the API URL from `frontend/.env` (`frontend/.env.example` supplies the default). The Overview API connection indicator calls `/api/health` and can be clicked to retry.

In a second terminal from the repository root, ingest a date interval or run the default range (2015-01-01 through 2025-12-31, magnitude 2.5+):

```powershell
python -m backend.scripts.ingest --start 2024-01-01 --end 2024-02-01 --minmag 2.5 --chunk-days 30
python -m backend.scripts.ingest
python -m backend.scripts.detect
```

## Tests and frontend

Run the backend test suite from the repository root with `python -m pytest backend/tests`. There are no pytest test cases yet; the Phase 1–2 data and API checks were run directly, and automated coverage is Phase 4 work. All frontend pages are implemented. Analytics, Swarm Explorer, Why MongoDB, About Swarms, and Globe Lab are lazy-loaded, and requests use the shared `frontend/src/api.js` client.

The interface limits date filters to 2015-01-01 through 2025-12-31 and magnitude controls to M 2.5 and above, matching ingestion defaults. Swarm Explorer filters by kind, date, country, continent, event count, maximum event magnitude, duration, and sort order. Country and continent are estimated from each cluster centroid using Natural Earth boundaries; the 1:110m data is intentionally generalized for globe-scale filtering.

Globe Lab uses at most 800 earthquake markers plus 200 cluster markers by default. It requests the existing `/api/events` and `/api/swarms` routes and does not load the full event collection. The NASA Blue Marble Next Generation January topography JPEG is included at `frontend/public/earth-blue-marble.jpg`; CSS brightens and softens its colors in the displayed globe, which starts centered on North America. NASA imagery is generally available for reuse under [NASA's media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). To remove Globe Lab, delete `frontend/src/pages/GlobeLab.jsx`, remove its lazy import, route and navigation link from `frontend/src/App.jsx`, and remove `react-globe.gl` from `frontend/package.json` and its lockfile.

Detection defaults are `SPACE_KM=15`, `TIME_DAYS=7`, `MIN_EVENTS=20`, and `MAG_GAP_THRESHOLD=1.2`; CLI flags can override them. Detection replaces `swarms` on every run.

## Data and method

USGS requests use `https://earthquake.usgs.gov/fdsnws/event/1/query` and its `/count` endpoint. Ingestion checks counts, recursively bisects requests over 20,000 events, validates required id/time/magnitude/coordinates, and upserts by USGS event id. Missing optional depth, magnitude type, place, or URL remains null. Invalid records are skipped and counted. Existing date chunks with matching event counts are skipped to avoid routine re-downloads.

`events._id` is the USGS id. Event documents include UTC `time`, magnitude fields, optional place/depth, GeoJSON `location` in `[longitude, latitude]` order, and URL. Indexes are `events.location` (2dsphere), `events.time`, `events.mag`, and `swarms.start`.

Detection converts geographic coordinates to 3D Earth-centered kilometers and scales elapsed days by `SPACE_KM / TIME_DAYS`, then runs Euclidean DBSCAN with `eps=SPACE_KM` and `min_samples=MIN_EVENTS`. A cluster is a `mainshock_sequence` when its largest-minus-second-largest magnitude is at least 1.2 by default; otherwise it is a `swarm`. A cluster with fewer than two magnitudes is `unclassified`. This is a heuristic spatial-temporal clustering method, not an authoritative seismological classification or a prediction. The centroid averages 3D unit-sphere vectors; the stored `bbox` can look misleading for clusters crossing ±180° longitude.

The region chart helper uses the text after the last comma in USGS `place` as a region, or the full place when there is no comma. This is a text heuristic.

## API

All routes return JSON. `GET /api/health` and `/api/stats` provide status and counts; `GET /api/indexes` reads current index metadata from MongoDB. `GET /api/events` supports bounding box, date, magnitude, sort, and limit filters; its spatial filter uses `$geoWithin` + `$box`. `GET /api/swarms` lists clusters and `GET /api/swarms/{id}` returns the cluster and its events. Analytics routes are `/api/timeline`, `/api/analytics/magnitude-distribution`, `/api/analytics/depth-distribution`, `/api/analytics/magnitude-depth`, `/api/analytics/regions`, `/api/analytics/magnitude-types`, `/api/analytics/swarm-summary`, `/api/analytics/swarm-scatter`, `/api/analytics/swarm-timeline`, `/api/analytics/swarm-radius`, and `/api/analytics/inter-event-times`. `GET /api/benchmark` compares an indexed geospatial query with a natural collection scan. Query parameter validation errors use HTTP 422.

## Results and limitations

Verified against the configured local MongoDB and live USGS API:

- The one-month check (2025-01-01 to 2025-02-01, magnitude 4.5+) stored 655 events with 0 skipped. Re-running it skipped the complete interval and added no duplicates.
- The default historical ingestion (2015-01-01 to 2025-12-31, magnitude 2.5+) finished with 310,333 event documents and 0 invalid records skipped. `collStats` reported 83,279,944 bytes of event document storage (about 79.4 MiB; excludes indexes).
- Whole-dataset DBSCAN processed 310,333 events and detected 425 clusters: 356 `swarm`, 69 `mainshock_sequence`, 0 `unclassified`. A second full run replaced and reproduced those results.
- Benchmark query (one timed run after one warm-up, default 2020–2023 box/time filters) returned 114,353 events. The 2dsphere-hinted run averaged 4,112.8 ms and examined 310,333 documents; the natural collection scan averaged 1,740.7 ms and examined 310,333. These are single-run measurements on this local MongoDB. The global default box makes the geospatial index nonselective, so it did not reduce documents examined in this measurement.
- Phase 2 API smoke checks returned HTTP 200 for the 17 original endpoints, including all 12 analytics routes and the benchmark; invalid event limits and reversed dates returned 422. A swarm detail request returned 20 matching events. Phase 3b separately verified `/api/indexes` and the five data routes used by the frontend.
- Phase 3a production build passed with Vite 8.3.5. The initial app JavaScript was 416.66 kB (127.27 kB gzip); the lazy Plotly activity-chart chunk was 1,161.09 kB (385.09 kB gzip). The Plotly chunk uses the official basic bundle for bar, scatter and pie traces; line charts use scatter traces in line mode. [Bundle details](https://www.npmjs.com/package/plotly.js-basic-dist-min)
- Phase 3b UI refinement build passed with Vite 8.3.5 before the Analytics routes were split into activity, clusters, and structure pages and the guide/database views were combined under About / Info. The initial JavaScript bundle is 409.77 kB (125.17 kB gzip), the shared Plotly bundle is 1,160.60 kB (384.81 kB gzip), and the lazy Globe Lab bundle is 1,985.58 kB (557.54 kB gzip). The Swarm Explorer page chunk is 16.08 kB (5.21 kB gzip); the 839 kB Natural Earth boundary file is fetched as a static asset only on that page. Vite reports Plotly and Globe Lab chunks above its 500 kB advisory threshold.
- After the UI updates, Vite served the document, About Swarms page, Swarm Explorer page, Globe Lab page, and Natural Earth boundary asset with HTTP 200. Visual layout and WebGL behavior still need manual review in a browser.
- During Phase 3b, `/api/health`, `/api/indexes`, `/api/stats`, `/api/events?limit=2`, and `/api/swarms` returned successfully against the configured database; the index endpoint returned two collection definitions and the swarm list returned 425 records. Vite served the document, entry module, and all four implemented page modules with HTTP 200. Browser-based visual checks were not available; visual layout, interaction, and WebGL rendering still need manual review with both servers running.

The configured date span is about 11 years, so full detection loads all events into memory and its runtime depends on hardware. In this run it completed in under one minute after changing DBSCAN to one worker to avoid a Windows worker-pool permission error. Results remain heuristic and must not be presented as seismological ground truth. Phase 4 verification remains. The installed Requests/urllib3 combination emitted a dependency warning, and FastAPI TestClient emitted a Starlette deprecation warning; requests still completed. npm reported two moderate dependency advisories during installation.

## Credits

Data source: [USGS Earthquake Catalog](https://earthquake.usgs.gov/earthquakes/feed/v1.0/). The map uses [Leaflet](https://leafletjs.com/) (BSD 2-Clause license) and [OpenStreetMap tiles](https://www.openstreetmap.org/copyright) (© OpenStreetMap contributors; ODbL). The charts use [Plotly's basic distribution](https://www.npmjs.com/package/plotly.js-basic-dist-min) (MIT license). Typography uses [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans). Globe Lab uses [NASA Blue Marble Next Generation topography](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/) (January 2004, 5400×2700); see [NASA's image and media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) for reuse terms. The Swarm Explorer's [Natural Earth country data](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson) is public domain under [Natural Earth's terms](https://www.naturalearthdata.com/about/terms-of-use/). `react-globe.gl` is MIT licensed ([package](https://www.npmjs.com/package/react-globe.gl)). The project was built with AI assistance; design choices and evaluation are the student's responsibility.
