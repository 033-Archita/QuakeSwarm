import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import EventMap from '../components/EventMap.jsx'
import StateMessage from '../components/StateMessage.jsx'
import { apiRequest } from '../api.js'
import { CATALOG_END, CATALOG_START, MAGNITUDE_FILTER_OPTIONS, MIN_CATALOG_MAGNITUDE, clampCatalogDate, normalizeDateRange } from '../catalog.js'

const ActivityChart = lazy(() => import('../components/ActivityChart.jsx'))

function formatNumber(value) {
  return typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) : '—'
}

function formatDate(value) {
  if (!value) return null
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
}

function defaultStart(lastTime) {
  const last = new Date(lastTime)
  last.setUTCFullYear(last.getUTCFullYear() - 1)
  const candidate = last.toISOString().slice(0, 10)
  return candidate < CATALOG_START ? CATALOG_START : candidate > CATALOG_END ? CATALOG_END : candidate
}

function wholeUtcMonthRange(start, end) {
  if (!start || !end) return null
  const firstDate = new Date(`${start}T00:00:00Z`)
  const lastDate = new Date(`${end}T00:00:00Z`)
  const firstMonth = new Date(Date.UTC(
    firstDate.getUTCFullYear(),
    firstDate.getUTCMonth() + (firstDate.getUTCDate() === 1 ? 0 : 1),
    1,
  ))
  const lastDayOfMonth = new Date(Date.UTC(
    lastDate.getUTCFullYear(),
    lastDate.getUTCMonth() + 1,
    0,
  )).getUTCDate()
  const lastMonthEnd = lastDate.getUTCDate() === lastDayOfMonth
    ? lastDate
    : new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), 0))

  if (firstMonth > lastMonthEnd) return null
  return {
    start: firstMonth.toISOString().slice(0, 10),
    end: lastMonthEnd.toISOString().slice(0, 10),
  }
}

function hasEventCoordinates(event) {
  return Number.isFinite(event.lat)
    && Number.isFinite(event.lon)
    && Number.isFinite(event.mag)
}

function hasSwarmCoordinates(swarm) {
  const coordinates = swarm.centroid?.coordinates
  return Array.isArray(coordinates)
    && coordinates.length >= 2
    && Number.isFinite(coordinates[0])
    && Number.isFinite(coordinates[1])
}

function DateFilter({ label, value, onChange }) {
  return <label className="filter-control"><span>{label}</span><input type="date" min={CATALOG_START} max={CATALOG_END} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

export default function Overview() {
  const [stats, setStats] = useState(null)
  const [statsError, setStatsError] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [minMag, setMinMag] = useState(4.5)
  const [layer, setLayer] = useState('events')
  const [events, setEvents] = useState(null)
  const [swarms, setSwarms] = useState(null)
  const [activity, setActivity] = useState(null)
  const [dataError, setDataError] = useState(null)
  const [activityError, setActivityError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setStatsLoading(true)
    setStatsError(null)
    apiRequest('/api/stats', {}, { signal: controller.signal })
      .then((value) => {
        setStats(value)
        if (value.last_event_time) {
          setStart((current) => current || defaultStart(value.last_event_time))
          setEnd((current) => current || clampCatalogDate(new Date(value.last_event_time).toISOString().slice(0, 10)))
        }
      })
      .catch((error) => { if (error.name !== 'AbortError') setStatsError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setStatsLoading(false) })
    return () => controller.abort()
  }, [refresh])

  const params = useMemo(() => ({ start, end, min_mag: minMag }), [start, end, minMag])
  const activityRange = useMemo(() => wholeUtcMonthRange(start, end), [start, end])
  function updateDate(field, value) {
    const current = { start, end }
    const proposed = { ...current, [field]: value }
    const normalized = normalizeDateRange(proposed.start, proposed.end, field)
    setStart(normalized.start)
    setEnd(normalized.end)
  }

  const loadActivity = useCallback(async (signal) => {
    if (!activityRange) {
      setActivity([])
      setActivityError(null)
      setActivityLoading(false)
      return
    }
    setActivityLoading(true)
    setActivityError(null)
    try {
      const rows = await apiRequest('/api/timeline', {
        ...params,
        ...activityRange,
        granularity: 'month',
      }, { signal })
      setActivity(rows)
    } catch (error) {
      if (error.name !== 'AbortError') setActivityError(error.message)
    } finally {
      if (!signal.aborted) setActivityLoading(false)
    }
  }, [activityRange, params])

  useEffect(() => {
    const controller = new AbortController()
    loadActivity(controller.signal)
    return () => controller.abort()
  }, [loadActivity, refresh])

  const loadLayer = useCallback(async (signal) => {
    if (!start || !end) return
    setLoading(true)
    setDataError(null)
    setSelected(null)
    setSelectedDetail(null)
    try {
      if (layer === 'events') {
        const result = await apiRequest('/api/events', { ...params, sort: 'time_desc', limit: 2000 }, { signal })
        setEvents(result.events.filter(hasEventCoordinates))
      } else {
        const result = await apiRequest('/api/swarms', { start, end, sort: 'start_desc' }, { signal })
        setSwarms(result.filter(hasSwarmCoordinates))
      }
    } catch (error) {
      if (error.name !== 'AbortError') setDataError(error.message)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [end, layer, params, start])

  useEffect(() => {
    const controller = new AbortController()
    loadLayer(controller.signal)
    return () => controller.abort()
  }, [loadLayer, refresh])

  async function selectMarker(nextSelection) {
    setSelected(nextSelection)
    setSelectedDetail(null)
    setDetailError(null)
    if (nextSelection.type !== 'swarm') return
    setDetailLoading(true)
    try {
      const detail = await apiRequest(`/api/swarms/${encodeURIComponent(nextSelection.data._id)}`)
      setSelectedDetail(detail)
    } catch (error) {
      setDetailError(error.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const eventCount = layer === 'events' ? events?.length : swarms?.length
  const monthCount = activityRange
    ? (new Date(`${activityRange.end}T00:00:00Z`).getUTCFullYear() - new Date(`${activityRange.start}T00:00:00Z`).getUTCFullYear()) * 12
      + new Date(`${activityRange.end}T00:00:00Z`).getUTCMonth()
      - new Date(`${activityRange.start}T00:00:00Z`).getUTCMonth()
      + 1
    : 0

  return (
    <main className="page-shell overview-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">SEISMIC ACTIVITY / STORED CATALOG</p>
          <h1>Earthquake overview</h1>
          <p className="heading-copy">A geographic view of recorded earthquakes and detected clusters.</p>
        </div>
        <div className="catalog-stamp"><span className="status-dot" /> USGS catalog <span className="stamp-divider" /> Updated through {stats?.last_event_time ? formatDate(stats.last_event_time) : '—'}</div>
      </section>

      {statsError ? <StateMessage state="error" title="Summary data could not be loaded." detail={statsError} onRetry={() => setRefresh((value) => value + 1)} /> : null}

      <section className="stat-grid" aria-label="Catalog summary">
        <article className="stat-card stat-primary"><span className="stat-label">EARTHQUAKE RECORDS</span><strong>{statsLoading ? '…' : formatNumber(stats?.total_events)}</strong><span className="stat-foot">USGS events in this database</span></article>
        <article className="stat-card"><span className="stat-label">DETECTED SWARMS</span><strong>{statsLoading ? '…' : formatNumber(stats?.swarm_count)}</strong><span className="stat-foot">Spatial-temporal clusters</span></article>
        <article className="stat-card"><span className="stat-label">MAINSHOCK SEQUENCES</span><strong>{statsLoading ? '…' : formatNumber(stats?.mainshock_sequence_count)}</strong><span className="stat-foot">Classified by magnitude gap</span></article>
        <article className="stat-card"><span className="stat-label">CATALOG WINDOW</span><strong className="stat-date">{statsLoading ? '…' : stats?.first_event_time ? `${formatDate(stats.first_event_time)} — ${formatDate(stats.last_event_time)}` : 'Not available'}</strong><span className="stat-foot">First through latest stored event</span></article>
      </section>

      <section className="overview-grid">
        <article className="panel map-panel">
          <div className="panel-heading map-heading">
            <div><p className="eyebrow">GEOGRAPHIC DISTRIBUTION</p><h2>{layer === 'events' ? 'Earthquake locations' : 'Detected clusters'}</h2></div>
            <div className="layer-toggle" role="group" aria-label="Map data layer">
              <button className={layer === 'events' ? 'active' : ''} onClick={() => setLayer('events')}>Earthquakes</button>
              <button className={layer === 'swarms' ? 'active' : ''} onClick={() => setLayer('swarms')}>Swarms</button>
            </div>
          </div>
          <div className="map-toolbar">
            <DateFilter label="FROM" value={start} onChange={(value) => updateDate('start', value)} />
            <DateFilter label="THROUGH" value={end} onChange={(value) => updateDate('end', value)} />
            {layer === 'events' && <label className="filter-control magnitude-filter"><span>MIN MAGNITUDE</span><select value={minMag} onChange={(event) => setMinMag(Math.max(MIN_CATALOG_MAGNITUDE, Number(event.target.value)))}>{MAGNITUDE_FILTER_OPTIONS.filter((value) => value >= MIN_CATALOG_MAGNITUDE).map((value) => <option key={value} value={value}>{value.toFixed(1)}+</option>)}</select></label>}
            <span className="map-result-count">{loading ? 'Loading…' : eventCount == null ? '— records' : `${formatNumber(eventCount)} ${layer === 'events' ? 'events' : 'clusters'}`}</span>
          </div>
          <div className="map-wrap">
            {dataError ? <StateMessage state="error" title="Map data could not be loaded." detail={dataError} onRetry={() => setRefresh((value) => value + 1)} /> : null}
            {loading ? <div className="map-loading"><StateMessage state="loading" title="Loading catalog locations…" /></div> : null}
            {!loading && !dataError && layer === 'events' && events?.length === 0 ? <div className="map-overlay"><StateMessage state="unavailable" title="No earthquake records in this range." detail="Adjust the dates or lower the minimum magnitude." /></div> : null}
            {!loading && !dataError && layer === 'swarms' && swarms?.length === 0 ? <div className="map-overlay"><StateMessage state="unavailable" title="No detected clusters in this range." detail="Try a wider date range or run swarm detection on the database." /></div> : null}
            <EventMap layer={layer} events={events || []} swarms={swarms || []} highlightEvents={selectedDetail?.events || []} selected={selected} onSelect={selectMarker} />
          </div>
          <div className="map-legend">
            {layer === 'events' ? <><span><i className="legend-dot legend-small" /> M &lt; 3.5</span><span><i className="legend-dot legend-medium" /> M 3.5–4.9</span><span><i className="legend-dot legend-large" /> M 5.0+</span></> : <><span><i className="legend-dot legend-swarm" /> Swarm</span><span><i className="legend-diamond" /> Mainshock sequence</span></>}
            <span className="map-attribution-note">Map tiles © OpenStreetMap</span>
          </div>
        </article>

        <aside className="side-column">
          <article className="panel activity-panel">
            <div className="panel-heading"><div><p className="eyebrow">TEMPORAL SIGNAL</p><h2>Monthly activity</h2></div><span className="period-chip">{monthCount} MONTHS</span></div>
            <p className="panel-copy">Events in complete UTC months within the selected catalog window.</p>
            {activityError ? <StateMessage state="error" title="Activity data could not be loaded." detail={activityError} onRetry={() => setRefresh((value) => value + 1)} /> : null}
            {activityLoading ? <StateMessage state="loading" title="Loading monthly activity…" /> : null}
            {!activityLoading && !activityError && activity?.length === 0 ? <StateMessage state="unavailable" title="Monthly activity is not available." detail={activityRange ? 'There are no events in the selected complete UTC months.' : 'The selected date range contains no complete UTC months.'} /> : null}
            {activity?.length > 0 && !activityError && <Suspense fallback={<StateMessage state="loading" title="Preparing monthly activity chart…" />}><ActivityChart rows={activity} loading={activityLoading} /></Suspense>}
            <div className="activity-foot"><span className="activity-key" /> Monthly event count <span className="activity-range">{activityRange ? `${activityRange.start} — ${activityRange.end} UTC` : 'No complete UTC months'}</span></div>
          </article>

          <article className="panel detail-panel">
            <div className="panel-heading"><div><p className="eyebrow">MAP SELECTION</p><h2>{selected ? (selected.type === 'event' ? 'Earthquake details' : 'Cluster details') : 'Select a map marker'}</h2></div><span className="detail-crosshair" aria-hidden="true">＋</span></div>
            {!selected && <p className="selection-hint">Choose an earthquake or cluster to inspect its recorded details.</p>}
            {selected?.type === 'event' && <div className="detail-content">
              <div className="magnitude-reading"><strong>M {Number(selected.data.mag).toFixed(1)}</strong><span>{selected.data.mag_type || 'Magnitude type not available'}</span></div>
              <dl className="detail-list"><div><dt>PLACE</dt><dd>{selected.data.place || 'Location not available'}</dd></div><div><dt>UTC TIME</dt><dd>{new Date(selected.data.time).toLocaleString('en', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })}</dd></div><div><dt>DEPTH</dt><dd>{selected.data.depth_km == null ? 'Depth data not available' : `${selected.data.depth_km} km`}</dd></div><div><dt>COORDINATES</dt><dd>{selected.data.lat.toFixed(3)}°, {selected.data.lon.toFixed(3)}°</dd></div></dl>
              {selected.data.url && <a className="usgs-link" href={selected.data.url} target="_blank" rel="noreferrer">Open USGS event <span aria-hidden="true">↗</span></a>}
            </div>}
            {selected?.type === 'swarm' && detailLoading && <StateMessage state="loading" title="Loading constituent events…" />}
            {selected?.type === 'swarm' && detailError && <StateMessage state="error" title="Cluster details could not be loaded." detail={detailError} onRetry={() => selectMarker(selected)} />}
            {selected?.type === 'swarm' && selectedDetail && <div className="detail-content">
              <div className="magnitude-reading"><strong>{selectedDetail.kind === 'swarm' ? 'Swarm' : 'Mainshock sequence'}</strong><span>{selectedDetail.n_events} recorded events</span></div>
              <dl className="detail-list"><div><dt>REGION</dt><dd>{selectedDetail.label || 'Place not available'}</dd></div><div><dt>START — END</dt><dd>{formatDate(selectedDetail.start)} — {formatDate(selectedDetail.end)}</dd></div><div><dt>DURATION</dt><dd>{selectedDetail.duration_days == null ? 'Not available' : `${selectedDetail.duration_days.toFixed(1)} days`}</dd></div><div><dt>MAX MAGNITUDE</dt><dd>{selectedDetail.max_mag == null ? 'Magnitude not available' : `M ${selectedDetail.max_mag}`}</dd></div><div><dt>RADIUS</dt><dd>{selectedDetail.radius_km == null ? 'Radius not available' : `${selectedDetail.radius_km.toFixed(1)} km`}</dd></div></dl>
              <div className="event-highlight-list"><span className="stat-label">MEMBER EVENTS · {selectedDetail.events?.length || 0}</span>{selectedDetail.events?.slice(0, 5).map((event) => <div key={event.id}><span>M {Number(event.mag).toFixed(1)}</span><time>{new Date(event.time).toLocaleDateString('en', { timeZone: 'UTC' })}</time></div>)}{selectedDetail.events?.length > 5 && <span className="more-events">+ {selectedDetail.events.length - 5} more on map</span>}</div>
            </div>}
          </article>

          <p className="method-note"><span>METHOD NOTE</span> Cluster labels use a spatial-temporal DBSCAN heuristic; they are not authoritative seismological classifications or predictions.</p>
        </aside>
      </section>
      <footer className="page-footer"><span>QUAKESWARM · ANALYSIS WORKSPACE</span><span>Source: USGS Earthquake Catalog</span></footer>
    </main>
  )
}
