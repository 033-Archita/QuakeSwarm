import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PlotlyChart from '../components/PlotlyChart.jsx'
import ChartPanel from '../components/ChartPanel.jsx'
import FilterBar from '../components/FilterBar.jsx'
import RegionalSwarmMap from '../components/RegionalSwarmMap.jsx'
import StateMessage from '../components/StateMessage.jsx'
import useApiResource from '../hooks/useApiResource.js'
import { assetRequest } from '../api.js'
import { chartColors, plotTheme } from '../plotTheme.js'
import { CATALOG_END, CATALOG_START } from '../catalog.js'
import { createGeographyLookup } from '../geography.js'

const initialFilters = { start: CATALOG_START, end: CATALOG_END, kind: '', min_events: '', max_events: '', min_mag: '', max_mag: '', min_duration: '', max_duration: '', continent: '', country: '', sort: 'start_desc' }

function formatDate(value, includeTime = false) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en', { timeZone: 'UTC', dateStyle: 'medium', ...(includeTime ? { timeStyle: 'short' } : {}) }).format(new Date(value))
}

function swarmKind(kind) {
  return kind === 'mainshock_sequence' ? 'Mainshock sequence' : kind === 'unclassified' ? 'Unclassified' : 'Swarm'
}

function makeEventsPerDay(events) {
  const counts = new Map()
  for (const event of events) {
    const day = new Date(event.time).toISOString().slice(0, 10)
    counts.set(day, (counts.get(day) || 0) + 1)
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, count]) => ({ period, count }))
}

function SwarmList({ filters, setFilters }) {
  const params = useMemo(() => ({ start: filters.start, end: filters.end, kind: filters.kind, min_events: filters.min_events, sort: filters.sort }), [filters])
  const { data, loading, error, retry } = useApiResource('/api/swarms', params, true)
  const [page, setPage] = useState(1)
  const [geographyState, setGeographyState] = useState({ loading: true, error: null, lookup: null })
  const [geographyRetry, setGeographyRetry] = useState(0)
  const pageSize = 12
  useEffect(() => {
    const controller = new AbortController()
    setGeographyState((current) => ({ ...current, loading: true, error: null }))
    assetRequest('/countries.json', { signal: controller.signal }).then((geojson) => {
      if (!controller.signal.aborted) setGeographyState({ loading: false, error: null, lookup: createGeographyLookup(geojson) })
    }).catch((loadError) => {
      if (loadError.name !== 'AbortError') setGeographyState({ loading: false, error: loadError.message, lookup: null })
    })
    return () => controller.abort()
  }, [geographyRetry])
  const updateFilters = (updater) => {
    setFilters((current) => typeof updater === 'function' ? updater(current) : updater)
    setPage(1)
  }
  const locatedRows = useMemo(() => (data || []).map((swarm) => {
    const coordinates = swarm.centroid?.coordinates || []
    const geography = coordinates.length === 2 ? geographyState.lookup?.findCountry(coordinates[0], coordinates[1]) : null
    return { ...swarm, _country: geography?.ADMIN || null, _continent: geography?.CONTINENT || null }
  }), [data, geographyState.lookup])
  const countryChoices = [...new Set(locatedRows.filter((swarm) => !filters.continent || swarm._continent === filters.continent).map((swarm) => swarm._country).filter(Boolean))].sort()
  const filteredRows = locatedRows.filter((swarm) =>
    (!filters.max_events || swarm.n_events <= Number(filters.max_events)) &&
    (!filters.min_mag || (swarm.max_mag != null && swarm.max_mag >= Number(filters.min_mag))) &&
    (!filters.max_mag || (swarm.max_mag != null && swarm.max_mag <= Number(filters.max_mag))) &&
    (!filters.min_duration || (swarm.duration_days != null && swarm.duration_days >= Number(filters.min_duration))) &&
    (!filters.max_duration || (swarm.duration_days != null && swarm.duration_days <= Number(filters.max_duration))) &&
    (!filters.continent || swarm._continent === filters.continent) &&
    (!filters.country || swarm._country === filters.country))
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])
  return (
    <main className="page-shell swarm-page">
      <section className="page-heading"><div><p className="eyebrow">DETECTED CLUSTERS / DATABASE RESULTS</p><h1>Swarm Explorer</h1><p className="heading-copy">Narrow the catalog by place and cluster characteristics, then open a cluster for its map and event sequence.</p></div><Link className="learn-link" to="/about-swarms">How swarms are detected <span aria-hidden="true">↗</span></Link></section>
      <div className="explorer-layout">
        <aside className="panel explorer-filters">
          <div className="panel-heading"><div><p className="eyebrow">REFINE RESULTS</p><h2>Filters</h2></div><button className="reset-filters" onClick={() => updateFilters(initialFilters)}>Reset</button></div>
          <FilterBar value={filters} onChange={updateFilters} includeKind includeSort includeClusterRanges />
          <div className="geography-filters">
            <label className="filter-control"><span>CONTINENT</span><select value={filters.continent} disabled={!geographyState.lookup} onChange={(event) => updateFilters((current) => ({ ...current, continent: event.target.value, country: '' }))}><option value="">All continents</option>{(geographyState.lookup?.continents || []).map((continent) => <option key={continent}>{continent}</option>)}</select></label>
            <label className="filter-control"><span>COUNTRY</span><select value={filters.country} disabled={!countryChoices.length} onChange={(event) => updateFilters((current) => ({ ...current, country: event.target.value }))}><option value="">All countries</option>{countryChoices.map((country) => <option key={country}>{country}</option>)}</select></label>
          </div>
          {geographyState.loading && <p className="filter-hint">Loading country boundaries…</p>}
          {geographyState.error && <StateMessage state="error" title="Place filters are unavailable." detail={geographyState.error} onRetry={() => setGeographyRetry((value) => value + 1)} />}
          {!geographyState.error && <p className="filter-hint">Country and continent use each cluster centroid and generalized Natural Earth boundaries.</p>}
        </aside>
        <section className="panel explorer-results">
          <div className="panel-heading results-heading"><div><p className="eyebrow">CLUSTER CATALOG</p><h2>{loading ? 'Loading clusters…' : `${filteredRows.length.toLocaleString()} matching clusters`}</h2></div><span className="period-chip">PAGE {page} / {pageCount}</span></div>
          {error && <StateMessage state="error" title="Cluster list could not be loaded." detail={error} onRetry={retry} />}
          {loading && <StateMessage state="loading" title="Fetching matching clusters…" />}
          {!loading && !error && filteredRows.length === 0 && <StateMessage state="unavailable" title="No detected clusters match these filters." detail="Widen the date or value ranges, or reset the place filters." />}
          {!loading && !error && visibleRows.length > 0 && <div className="swarm-result-list">{visibleRows.map((swarm) => <Link className="swarm-result-card" key={swarm._id} to={`/swarms/${encodeURIComponent(swarm._id)}`}>
            <div className="swarm-result-main"><span className={`kind-badge kind-${swarm.kind}`}>{swarmKind(swarm.kind)}</span><h3>{swarm.label || 'Place not available'}</h3><p>{swarm._country ? `${swarm._country} · ${swarm._continent}` : 'Country not available'} · {formatDate(swarm.start)}</p></div>
            <div className="swarm-result-metrics"><span><strong>{swarm.n_events.toLocaleString()}</strong> events</span><span><strong>{swarm.max_mag == null ? '—' : `M ${Number(swarm.max_mag).toFixed(1)}`}</strong> maximum</span><span><strong>{swarm.duration_days == null ? '—' : `${Number(swarm.duration_days).toFixed(1)} d`}</strong> duration</span><span><strong>{swarm.radius_km == null ? '—' : `${Number(swarm.radius_km).toFixed(1)} km`}</strong> radius</span></div>
            <span className="swarm-card-arrow" aria-hidden="true">→</span>
          </Link>)}</div>}
          {filteredRows.length > pageSize && <nav className="result-pagination" aria-label="Cluster result pages"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length}</span><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next →</button></nav>}
        </section>
      </div>
      <p className="method-note swarm-method-note"><span>CLASSIFICATION</span> Mainshock sequences meet the configured magnitude-gap rule, or contain an M 6.0+ largest event in the first quarter of the cluster’s time span. Other classifiable clusters are swarms; a cluster without two magnitudes is unclassified. These heuristic labels are not authoritative seismology.</p>
      <footer className="page-footer"><span>QUAKESWARM · SWARM EXPLORER</span><span>Rows are retrieved from the MongoDB swarms collection.</span></footer>
    </main>
  )
}

function SwarmDetail({ id }) {
  const navigate = useNavigate()
  const { data, loading, error, retry } = useApiResource(`/api/swarms/${encodeURIComponent(id)}`, {}, Boolean(id))
  if (loading) return <main className="page-shell"><StateMessage state="loading" title="Loading cluster and member events…" /></main>
  if (error) return <main className="page-shell"><button className="back-link" onClick={() => navigate('/swarms')}>← Cluster catalog</button><StateMessage state="error" title="Cluster details could not be loaded." detail={error} onRetry={retry} /></main>
  if (!data) return <main className="page-shell"><StateMessage state="unavailable" title="Cluster data is not available." detail="The requested cluster may have been replaced by a later detection run." /></main>

  const events = data.events || []
  const perDay = makeEventsPerDay(events)
  const points = events.filter((event) => event.time && event.mag != null)
  const kindColor = data.kind === 'mainshock_sequence' ? chartColors.red : chartColors.slate
  return (
    <main className="page-shell swarm-detail-page">
      <button className="back-link" onClick={() => navigate('/swarms')}>← Cluster catalog</button>
      <section className="page-heading detail-page-heading"><div><p className="eyebrow">SWARM EXPLORER / CLUSTER DETAIL</p><h1>{data.label || 'Earthquake cluster'}</h1><p className="heading-copy">{swarmKind(data.kind)} · {formatDate(data.start)} through {formatDate(data.end)}</p></div><span className={`kind-badge kind-${data.kind}`}>{swarmKind(data.kind)}</span></section>
      <section className="detail-stat-grid">
        <article className="stat-card"><span className="stat-label">MEMBER EVENTS</span><strong>{data.n_events}</strong><span className="stat-foot">Events returned: {events.length}</span></article>
        <article className="stat-card"><span className="stat-label">DURATION</span><strong>{data.duration_days == null ? 'Not available' : `${Number(data.duration_days).toFixed(1)} d`}</strong><span className="stat-foot">From first to last event</span></article>
        <article className="stat-card"><span className="stat-label">MAXIMUM MAGNITUDE</span><strong>{data.max_mag == null ? 'Not available' : `M ${Number(data.max_mag).toFixed(1)}`}</strong><span className="stat-foot">Second magnitude {data.second_mag == null ? 'not available' : `M ${Number(data.second_mag).toFixed(1)}`}</span></article>
        <article className="stat-card"><span className="stat-label">CLUSTER RADIUS</span><strong>{data.radius_km == null ? 'Not available' : `${Number(data.radius_km).toFixed(1)} km`}</strong><span className="stat-foot">Largest distance from centroid</span></article>
      </section>
      <section className="swarm-detail-grid">
        <article className="panel region-panel"><div className="panel-heading"><div><p className="eyebrow">SPATIAL FOOTPRINT</p><h2>Member events and centroid</h2></div></div>
          {events.length ? <RegionalSwarmMap swarm={data} events={events} /> : <StateMessage state="unavailable" title="Member event locations are not available." detail="This cluster has no event records to place on the regional map." />}
          <div className="map-legend"><span><i className="legend-dot legend-medium" /> Member event</span><span><i className="legend-dot legend-swarm" /> Centroid</span><span className="map-attribution-note">Circle shows stored radius</span></div>
        </article>
        <div className="swarm-chart-column">
          <ChartPanel title="Magnitude vs. time" subtitle="Magnitude of each member event at its UTC timestamp." state={points.length ? 'ready' : 'empty'} emptyMessage="Magnitude-time analysis is not applicable because member-event data is unavailable.">
            <PlotlyChart data={[{ type: 'scatter', mode: 'markers', x: points.map((event) => event.time), y: points.map((event) => event.mag), marker: { color: kindColor, size: 8, opacity: 0.8 }, customdata: points.map((event) => event.place || 'Place not available'), hovertemplate: '%{x|%Y-%m-%d %H:%M} UTC<br>M %{y}<br>%{customdata}<extra></extra>' }]} layout={{ ...plotTheme, height: 280, xaxis: { ...plotTheme.xaxis, title: { text: 'Time (UTC)' } }, yaxis: { ...plotTheme.yaxis, title: { text: 'Magnitude (M)' } } }} config={{ displayModeBar: false, responsive: true }} useResizeHandler style={{ width: '100%', height: 280 }} />
          </ChartPanel>
          <ChartPanel title="Events per day" subtitle="Counts computed from this cluster’s event list by UTC date." state={perDay.length ? 'ready' : 'empty'} emptyMessage="Daily activity is not applicable because no member event timestamps are available.">
            <PlotlyChart data={[{ type: 'bar', x: perDay.map((row) => row.period), y: perDay.map((row) => row.count), marker: { color: chartColors.sage }, hovertemplate: '%{x}<br>%{y} events<extra></extra>' }]} layout={{ ...plotTheme, height: 250, xaxis: { ...plotTheme.xaxis, title: { text: 'Date (UTC)' } }, yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', title: { text: 'Events per day' } } }} config={{ displayModeBar: false, responsive: true }} useResizeHandler style={{ width: '100%', height: 250 }} />
          </ChartPanel>
        </div>
      </section>
      <section className="panel event-list-panel"><div className="panel-heading"><div><p className="eyebrow">CHRONOLOGICAL CATALOG RECORDS</p><h2>Cluster events</h2></div><span className="period-chip">{events.length} EVENTS</span></div>
        {events.length === 0 ? <StateMessage state="unavailable" title="The cluster event list is not available." detail="No associated event records were returned." /> : <div className="swarm-table-wrap"><table className="swarm-table member-event-table"><thead><tr><th>UTC TIME</th><th>MAGNITUDE</th><th>DEPTH</th><th>PLACE</th><th>COORDINATES</th><th>USGS</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDate(event.time, true)}</td><td>M {Number(event.mag).toFixed(1)} <small>{event.mag_type || 'Type not available'}</small></td><td>{event.depth_km == null ? 'Not available' : `${event.depth_km} km`}</td><td>{event.place || 'Place not available'}</td><td>{event.lat.toFixed(3)}°, {event.lon.toFixed(3)}°</td><td>{event.url ? <a href={event.url} target="_blank" rel="noreferrer">Open ↗</a> : 'Not available'}</td></tr>)}</tbody></table></div>}
      </section>
      <footer className="page-footer"><span>QUAKESWARM · SWARM DETAIL</span><span>Cluster ID: {data._id}</span></footer>
    </main>
  )
}

export default function SwarmExplorer() {
  const { id } = useParams()
  const [filters, setFilters] = useState(initialFilters)
  return id ? <SwarmDetail id={id} /> : <SwarmList filters={filters} setFilters={setFilters} />
}
