# QuakeSwarm — Project Brief



---

## 0. What to build

**QuakeSwarm** is a Big Data Analytics project. It downloads historical earthquake data from the official USGS API, stores it in MongoDB, detects earthquake swarms with spatial-temporal DBSCAN clustering, and shows the results in a React web app with 12 Plotly analytics charts and an optional 3D globe page.

It must demonstrate: a real data pipeline, geospatial storage and queries, clustering, analytics, and a MongoDB index benchmark.

Follow the four phases. Do not add features outside this brief.

---

## 1. Stack

**Backend:** Python 3.10+, FastAPI, PyMongo, NumPy, scikit-learn, requests, python-dotenv, pytest. No pandas unless a specific task truly needs it (explain first).
**Database:** MongoDB (local or Atlas free tier).
**Frontend:** React, Vite, React Router, react-leaflet (Leaflet), react-plotly.js (Plotly).
**Globe Lab page only:** react-globe.gl. Do not add Three.js separately.

Rules for dependencies:
- Pin versions. No extra libraries without explaining why.
- Choose the smallest official Plotly bundle that supports the chart types used (bar, scatter, line, pie). If unsure, use the full `plotly.js-dist-min`. Report the resulting bundle size. Lazy-load the Analytics and Globe Lab pages with `React.lazy` so the first page loads fast.
- Configuration lives in `.env`. Provide `.env.example` for backend (`MONGODB_URI`, `DB_NAME`) and frontend (`VITE_API_URL`).

---

## 2. General rules

### Code quality
- Simple, readable, explainable code. I must be able to explain the whole flow in a viva.
- Descriptive names. Short, focused functions. No unnecessary abstractions or design patterns.
- Routes call plain helper functions in a `db_queries.py` module. No separate "service layer".
- No unnecessary files, folders or one-line clever code.

### Comments
Add meaningful comments where they help understanding: purpose and inputs/outputs of important functions, why a calculation is done, how data is transformed, non-obvious decisions. Pay special attention to: USGS parsing, MongoDB upserts and aggregation pipelines, geospatial queries, coordinate conversion and time scaling, DBSCAN, swarm classification, benchmark execution, frontend data fetching.
Do not add comments that restate obvious code (`# return result`).

### Data correctness
1. Use actual USGS data only. No synthetic, placeholder or fabricated records.
2. Every statistic, chart, marker and result comes from real data or real calculations.
3. Never hardcode statistics or benchmark values.
4. Never claim something works unless you ran it.
5. Handle missing fields and invalid records safely (skip and count them; report the skipped count).
6. No secrets in source code.
7. Do not remove working features to simplify. Do not start over in later phases.

### Not Available / Not Applicable / Loading / Error
Use these four states, with context-specific messages. Never use a generic "No data found" everywhere.
- **Not Available:** the data does not exist or cannot be retrieved. Example: "Depth data not available."
- **Not Applicable:** the metric does not apply to this selection. Example: "This analysis is not applicable to the current selection."
- **Loading:** being fetched.
- **Error:** the request failed, with a retry button.

If a value is genuinely 0, show 0. Missing values are `null` in the API and database, never 0, "" or a dummy value. Never show fabricated zeros, dummy markers or placeholder charts.

### Workflow
After each phase report: what was implemented; files created/changed; commands to run; what was tested (with real output); what is incomplete; problems needing attention.
Run what you build. Do not stop after scaffolding.

---

## 3. Documentation (exactly two files)

### README.md
Overview, features, stack, architecture, data source and ingestion, DB structure and indexes, DBSCAN approach and classification logic, setup (Windows and Mac/Linux), env variables, how to start backend and frontend, ingestion and detection commands, how to run tests, actual results, actual benchmark results, how to remove the Globe Lab page, known limitations, credits (USGS catalog, Leaflet, OpenStreetMap tiles, Plotly, globe texture source and license), and a note that the code was built with AI assistance with design and evaluation by the student. Student-friendly.

### FLOW.md
Explains the real code execution flow. Use real file and function names only; never invent names. Include:
- A. Application startup (backend entry point, FastAPI init, DB connection, frontend start, React routing).
- B. Ingestion flow (which file starts it, functions called, USGS requests, parsing, validation, transformation, upserts).
- C. Swarm detection flow (coordinates, time scaling, DBSCAN, cluster characteristics, classification, storage).
- D. Backend API flow for every endpoint (request → route function → helper → query → response).
- E. Frontend flow (pages and components, which page calls which endpoint, how data reaches maps/charts/tables, what happens when a user selects an earthquake or a swarm, how filters work).
- F. Benchmark flow (trigger, functions, indexed vs collection scan, how timings and examined-document counts are collected and displayed).
- G. **Function-call mapping** for every major workflow, e.g. `ingest.py → fetch_chunk() → ...` (illustrative only; use actual names).
- H. Mermaid diagrams (architecture, ingestion, detection, frontend-to-backend), a folder/file responsibility table, backend module relationships, frontend page/component relationships, and key data structures and API response formats.

Update both files as development progresses. At the end of Phase 4, check FLOW.md line by line against the source code.

---

## 4. Data contract (shared by all phases)

### USGS query
Endpoint: `https://earthquake.usgs.gov/fdsnws/event/1/query`. Count endpoint: `https://earthquake.usgs.gov/fdsnws/event/1/count` (same filters).
Defaults: `format=geojson`, `eventtype=earthquake`, `orderby=time-asc`, `minmagnitude=2.5`, start `2015-01-01`, end `2025-12-31`. Date range and min magnitude are configurable (CLI args and config).
USGS returns HTTP 400 if a query would return more than 20000 events.

### `events` collection
`_id` (USGS id), `time` (datetime, UTC), `mag`, `mag_type`, `place`, `depth_km`, `location` (GeoJSON Point `[lon, lat]`), `url`.
Skip records missing id, time, coordinates or magnitude. `depth_km`, `mag_type` and `place` may be `null`.

### `swarms` collection
`_id`, `start`, `end`, `duration_days`, `n_events`, `centroid` (GeoJSON Point), `bbox` `[minlon, minlat, maxlon, maxlat]`, `radius_km` (largest great-circle distance from the centroid to any member event), `max_mag`, `second_mag` (null if it cannot be computed), `mag_gap` (null if it cannot be computed), `kind` (`"swarm"`, `"mainshock_sequence"`, or `"unclassified"` when `mag_gap` is null), `event_ids`, `label` (place of the largest event).
Compute the centroid by averaging the members' 3D unit-sphere vectors and converting back to latitude/longitude (handles the ±180° longitude boundary). Note in the README that `bbox` can be misleading for clusters crossing ±180°.

### Indexes
`events.location` (2dsphere), `events.time` (ascending), `events.mag` (ascending), `swarms.start` (ascending).

---

## 5. API contract

All JSON. Use exactly these field names. CORS enabled for the Vite dev origin. Invalid query parameters return HTTP 422 with a clear message.

| Endpoint | Parameters | Response |
|---|---|---|
| `GET /api/health` | — | `{status, database}` |
| `GET /api/stats` | — | `{total_events, first_event_time, last_event_time, swarm_count, mainshock_sequence_count}` |
| `GET /api/events` | `min_lon, min_lat, max_lon, max_lat, start, end, min_mag, limit, sort` | `{count, events:[{id, time, mag, mag_type, place, depth_km, lat, lon, url}]}` — `sort=mag_desc` (default) or `time_desc`; default limit 2000, max 10000; uses `$geoWithin` + `$box` |
| `GET /api/swarms` | `kind, min_events, start, end, sort` | list without `event_ids` |
| `GET /api/swarms/{id}` | — | the swarm plus its events |
| `GET /api/benchmark` | optional `min_lon, min_lat, max_lon, max_lat, start, end, runs` (runs default 5) | see section 5.2 |

### 5.1 Analytics endpoints (12 charts)

Charts 1–7 accept `start`, `end`, `min_mag`. Charts 8–12 accept `start`, `end`, `kind`.

| # | Chart | Endpoint | Response |
|---|---|---|---|
| 1 | Earthquakes per year (bar) | `GET /api/timeline?granularity=year` | `[{period, count}]` |
| 2 | Earthquakes per month (line) | `GET /api/timeline?granularity=month` | `[{period, count}]` |
| 3 | Magnitude distribution (bar, log-y toggle) | `GET /api/analytics/magnitude-distribution` | `[{bin_start, bin_end, count}]`, 0.5-wide bins |
| 4 | Depth distribution (bar) | `GET /api/analytics/depth-distribution` | `{bins:[{bin_start, bin_end, count}], excluded_null_depth}`, 10 km bins |
| 5 | Magnitude vs depth (scatter) | `GET /api/analytics/magnitude-depth` | `{sample_size, points:[{mag, depth_km}]}` — `$sample` up to 5000, null depths excluded |
| 6 | Top 15 regions by event count (horizontal bar) | `GET /api/analytics/regions` | `[{region, count, avg_mag}]` — region = text after the last comma in `place`, otherwise the full `place`. Document this as a heuristic in the README |
| 7 | Magnitude types (bar) | `GET /api/analytics/magnitude-types` | `[{mag_type, count}]` — null shown as "Not available" |
| 8 | Swarm vs mainshock sequence (bar) | `GET /api/analytics/swarm-summary` | `{by_kind:[{kind, count, avg_duration_days, avg_n_events}]}` |
| 9 | Swarm duration vs event count (scatter, coloured by kind) | `GET /api/analytics/swarm-scatter` | `[{id, kind, duration_days, n_events, max_mag}]` |
| 10 | Swarm activity over time (stacked bar by kind) | `GET /api/analytics/swarm-timeline?granularity=year\|month` | `[{period, kind, count}]` |
| 11 | Swarm radius distribution (bar) | `GET /api/analytics/swarm-radius` | `[{bin_start, bin_end, count}]` of `radius_km` |
| 12 | Inter-event times across all swarms (bar, log-x) | `GET /api/analytics/inter-event-times` | `[{bin_start_hours, bin_end_hours, count}]`, log-spaced bins; gaps between consecutive events inside each swarm |

Each chart: meaningful title, axis labels with units, tooltips, legend where needed, correct handling of the four data states. Use a shared `plotTheme.js` for fonts, colours and layout so all 12 charts look consistent.

### 5.2 Benchmark
Use the same `$geoWithin` + `$box` + time filter for both runs. Run once with the 2dsphere index (`hint` on the index), once with `hint({"$natural": 1})`. Do one warm-up run, then `runs` timed runs. Return for each: `{average_ms, runs_ms:[...], docs_examined, docs_returned}`, with `docs_examined` and `docs_returned` read from `explain("executionStats")`. Default box and time window come from `config.py`; print and return the returned count so the result is meaningful. Real measurements only.

---

## 6. Pages

Five routes, one shared navigation. The globe is isolated so it can be deleted.

1. **Overview** (`/`) — 2D Leaflet map (default home).
2. **Swarm Explorer** (`/swarms`, `/swarms/:id`)
3. **Analytics** (`/analytics`) — 12 Plotly charts
4. **Why MongoDB** (`/mongodb`)
5. **Globe Lab** (`/globe-lab`, labelled "Globe Lab (experimental)") — see 6.5

### 6.1 Overview
- Stat cards (from `/api/stats`) and a small monthly activity chart (Plotly).
- Leaflet map showing either earthquakes or swarms (toggle). Marker size by magnitude. Swarms use their own marker style.
- Default earthquake view: last 12 months **of data in the database** (relative to `last_event_time`, not today), min magnitude 4.5, `sort=mag_desc`, limit 2000.
- Filters: date range, min magnitude.
- Click an earthquake: magnitude, depth, location, date/time, USGS link. Click a swarm: its details and highlight of its constituent events.
- Never load the whole dataset. Use limits, filters, loading states, and avoid repeated requests.

### 6.2 Swarm Explorer
- Filterable, sortable list (kind, date, min events).
- Detail view: regional map of the swarm's real events, centroid and radius, magnitude-vs-time scatter, events-per-day chart, duration and event statistics, chronological event list. Compute these from the event list returned by `/api/swarms/{id}`.
- Basic timeline playback using real timestamps: **optional; implement last, only if everything else works.**

### 6.3 Analytics
The 12 charts from section 5.1, grouped into three sections: "Earthquake activity" (1–7), "Swarm results" (8–10), "Swarm structure" (11–12). Filters at the top of each group.

### 6.4 Why MongoDB
Database structure, actual indexes (read from the database), short explanation of geospatial indexing, a "Run benchmark" button, bar chart of indexed vs collection-scan time, documents examined and returned, short interpretation. Before it has been run: "Benchmark results not available. Run the benchmark to generate results."

### 6.5 Globe Lab (isolated, removable)
- Lives in one file (`src/pages/GlobeLab.jsx`) plus one route and one nav link. No other file may import react-globe.gl or depend on this page.
- Uses existing `/api/events` and `/api/swarms` only. No new endpoints.
- Shows real earthquake markers (size by magnitude, colour by magnitude) and swarm markers, with a click panel like the Overview.
- Before coding, read the current react-globe.gl documentation and verify prop names; do not rely on memory.
- Use a globe texture that suits the light palette (pale ocean, muted land). If no suitable public-domain or openly licensed texture is found, use the library's default texture and say so. Record the texture source and license in the README. No custom shaders, no terrain.
- Limit markers (default 1000) and show a loading state.
- Time-box: if it still does not render correctly after about 3 hours, stop, leave a short note in the README, and move on.
- README must explain how to remove it: delete the file, the route, the nav link and the dependency.

---

## 7. Visual design

A premium light-theme geospatial intelligence interface. Not a generic admin dashboard, SaaS template or Power BI clone. Inspiration: Google Earth and scientific earthquake monitoring tools.

### Design tokens (define once as CSS variables)
| Token | Hex | Use |
|---|---|---|
| `--atlas-white` | `#F5F3ED` | page background |
| `--ocean-mist` | `#DCE9ED` | map and globe water, chart panels |
| `--terrain-sage` | `#A9C2B4` | land, fills (never text) |
| `--sandstone` | `#D9B98C` | small earthquakes (mag below 3.5) |
| `--seismic-orange` | `#E58A52` | medium earthquakes (3.5 to 5) |
| `--activity-red` | `#C75B55` | large earthquakes (5 and above) |
| `--slate-blue` | `#526B78` | swarm markers, secondary text |
| `--graphite` | `#3B4548` | primary text; `mainshock_sequence` outline |

- Swarm vs mainshock sequence must differ by shape or label as well as colour.
- Font: IBM Plex Sans (system-ui fallback). Radius 6px. Borders `1px solid rgba(59,69,72,0.15)`. 8px spacing grid. Subtle shadows only. Generous whitespace.
- No dark mode, black backgrounds, neon, heavy gradients, purple SaaS styling, decorative animations.
- Responsive: no broken layouts at mobile width. Mobile is not a polish target.
- Ensure text contrast is readable on every background.

### Frontend rules
- All API calls go through one `api.js` using `VITE_API_URL`.
- Every request has loading, error and unavailable handling.
- Every visible control works. No fake fallback data.
- Modular but understandable components.

---

## 8. Phases

### Phase 1 — Foundation, database, ingestion
1. Create a simple project structure (backend, backend/scripts, backend/tests, frontend, docs files). No unnecessary folders.
2. Backend: FastAPI, `db.py` (connection and indexes), `config.py`, `/api/health`.
3. `backend/scripts/ingest.py`: CLI args `--start`, `--end`, `--minmag`, `--chunk-days`. Check the count endpoint before each chunk; if over 20000, split the interval recursively. Handle timeouts, HTTP errors, invalid responses and missing fields. Pause between requests, send a User-Agent, print progress. Upsert by USGS id. Print inserted/updated counts, skipped-record count and final MongoDB document count. Avoid re-downloading ranges that are already stored.
4. Verify: backend starts, DB connects, a one-month test range ingests, re-running creates no duplicates, chunk splitting works, bad records are handled. Then start the full ingestion and let it run while Phase 2 begins, provided the environment allows it. Report the actual document count and storage size.

### Phase 2 — Detection, analytics, API
1. `backend/scripts/detect.py`. Load events (time, mag, location, place) from MongoDB.
   - Convert lat/lon to radians, then to 3D km coordinates with Earth radius 6371 km:
     `x = R*cos(lat)*cos(lon)`, `y = R*cos(lat)*sin(lon)`, `z = R*sin(lat)`.
   - `elapsed_days` = days since the first event.
   - `t_scaled = elapsed_days * (SPACE_KM / TIME_DAYS)`.
   - Run DBSCAN on `[x, y, z, t_scaled]` with `eps = SPACE_KM`, `min_samples = MIN_EVENTS`.
   - Defaults in `config.py`, overridable by CLI: `SPACE_KM=15`, `TIME_DAYS=7`, `MIN_EVENTS=20`, `MAG_GAP_THRESHOLD=1.2`.
   - If the full run is too slow or memory-heavy, report the measurements, then process in year windows and document the boundary limitation. Do not silently change the method.
2. For each cluster compute the fields in section 4. `kind = "mainshock_sequence"` if `max_mag - second_mag >= MAG_GAP_THRESHOLD`, otherwise `"swarm"`; `"unclassified"` if `mag_gap` is null. Never invent magnitudes.
3. Replace the `swarms` collection on every run. Print counts per kind.
4. Document clearly: this is a heuristic spatial-temporal clustering method, not an authoritative seismological classification and not prediction.
5. Implement every endpoint in section 5, including the 12 analytics endpoints and the benchmark.
6. Verify: detection on real data, empty and tiny datasets, classification rule, re-run replaces results, every endpoint returns valid responses, filters work, field names and types match the contract.

### Phase 3 — Frontend
Build the five pages in section 6 using real API endpoints only, following sections 2 and 7. Build the Globe Lab page last. Do not rewrite backend code except for bugs found during integration (report each).

### Phase 4 — Testing, debugging, final verification
Run the actual application. Do not just read the code.

1. **Backend pytest tests** covering at least: magnitude-gap classification, USGS chunk splitting, empty dataset handling, basic API responses, data validation/transformation, null handling.
2. **Manual and automated checks:** ingestion duplicates, invalid parameters, geographic/date/magnitude filters, repeated detection runs, benchmark endpoint, all 12 analytics endpoints.
3. **Frontend:** all five pages open; markers and charts show real data; filters change what is displayed; earthquake and swarm selection work; loading, error, Not Available and Not Applicable states appear correctly; no major console errors; desktop and mobile widths. If browser automation is unavailable, say so plainly and list what needs manual checking. Do not claim browser testing that did not happen.
4. **Integration:** `USGS → ingest → MongoDB → DBSCAN → swarms → FastAPI → React`. Statistics match database counts. Analytics match their queries. Frontend and backend agree on field names and types. Selecting a swarm loads its correct events.
5. **Performance:** API response times, number of requests per page, Plotly bundle size and Analytics page load, map and globe responsiveness.
6. **Documentation:** verify README commands actually work and FLOW.md matches the source code.
7. **Final report** with: folder structure; implemented features; run commands; tests and real results; actual database statistics (document count, storage size); actual swarm detection results (counts per kind); actual benchmark numbers; known bugs; tests that could not be run and why; manual testing checklist; summary of execution flow. Separate: implemented and tested / implemented but not fully tested / not implemented.

---

## 9. Priority order (if time runs short)

1. Correct ingestion and storage.
2. Correct swarm detection.
3. Working API.
4. Overview map, Swarm Explorer, Why MongoDB.
5. Analytics (12 charts).
6. Tests and documentation.
7. Globe Lab.
8. Timeline playback.

Simplify visuals before compromising the data pipeline.

## 10. Out of scope (do not add)
K-Means, PCA, Isolation Forest, forecasting or prediction, tectonic plate analysis, anomaly detection, extra ML models, AI-generated reports, user accounts, deployment pipelines, any feature not in this brief.

## 11. Start instructions
1. Inspect the workspace. Identify any existing code to preserve.
2. State the folder structure, shared schemas and API contract (this brief is authoritative).
3. Outline the four phases briefly.
4. Start the phase I name. Do not stop at a plan or scaffolding.

The goal is a working, explainable and demonstrable Big Data Analytics application, not just an impressive prototype.