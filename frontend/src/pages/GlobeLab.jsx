import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import { apiRequest } from '../api.js'
import StateMessage from '../components/StateMessage.jsx'
import { CATALOG_END, CATALOG_START, MAGNITUDE_FILTER_OPTIONS, MIN_CATALOG_MAGNITUDE, normalizeDateRange } from '../catalog.js'

const eventCap = 800
const swarmCap = 200

function magnitudeColor(magnitude) {
  if (magnitude >= 5) return '#C75B55'
  if (magnitude >= 3.5) return '#E58A52'
  return '#D9B98C'
}

function formatTime(value) {
  return value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC' : 'Not available'
}

export default function GlobeLab() {
  const [filters, setFilters] = useState({ start: CATALOG_START, end: CATALOG_END, min_mag: String(MIN_CATALOG_MAGNITUDE) })
  const [resource, setResource] = useState({ loading: true, events: [], swarms: [], error: null })
  const [selected, setSelected] = useState(null)
  const [size, setSize] = useState({ width: 760, height: 520 })
  const stageRef = useRef(null)
  const globeRef = useRef(null)

  const load = useCallback(async () => {
    setResource((current) => ({ ...current, loading: true, error: null }))
    try {
      const [eventResult, swarmResult] = await Promise.all([
        apiRequest('/api/events', { start: filters.start, end: filters.end, min_mag: filters.min_mag, sort: 'mag_desc', limit: eventCap }),
        apiRequest('/api/swarms', { start: filters.start, end: filters.end, sort: 'start_desc' }),
      ])
      setResource({ loading: false, events: eventResult.events || [], swarms: swarmResult || [], error: null })
      setSelected(null)
    } catch (error) {
      setResource((current) => ({ ...current, loading: false, error: error.message }))
    }
  }, [filters])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!stageRef.current) return undefined
    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.floor(entry.contentRect.width))
      setSize({ width, height: width < 600 ? 350 : 520 })
    })
    resizeObserver.observe(stageRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  const points = useMemo(() => {
    const earthquakePoints = resource.events.filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lon)).map((event) => ({
      kind: 'earthquake', lat: event.lat, lng: event.lon, radius: Math.max(0.08, Math.min(0.34, 0.07 + (event.mag + 1) * 0.035)), altitude: 0.012,
      color: magnitudeColor(event.mag), label: `M ${Number(event.mag).toFixed(1)} · ${event.place || 'Place not available'}`, source: event,
    }))
    const swarmPoints = resource.swarms.slice(0, swarmCap).flatMap((swarm) => {
      const coordinates = swarm.centroid?.coordinates
      if (!Array.isArray(coordinates) || coordinates.length < 2) return []
      const sequence = swarm.kind === 'mainshock_sequence'
      return [{ kind: 'swarm', lat: coordinates[1], lng: coordinates[0], radius: Math.min(0.44, 0.15 + Math.sqrt(swarm.n_events || 1) * 0.012), altitude: 0.025,
        color: sequence ? '#C75B55' : '#526B78', label: `${sequence ? 'Mainshock sequence' : swarm.kind === 'unclassified' ? 'Unclassified cluster' : 'Swarm'} · ${swarm.label || 'Region not available'}`, source: swarm }]
    })
    return [...earthquakePoints, ...swarmPoints]
  }, [resource.events, resource.swarms])

  const setDate = (field, value) => setFilters((current) => {
    const proposed = { ...current, [field]: value }
    return { ...current, ...normalizeDateRange(proposed.start, proposed.end, field) }
  })
  const setFilter = (name, value) => setFilters((current) => ({ ...current, [name]: name === 'min_mag' ? String(Math.max(MIN_CATALOG_MAGNITUDE, Number(value) || MIN_CATALOG_MAGNITUDE)) : value }))

  return (
    <main className="page-shell globe-page">
      <section className="page-heading"><div><p className="eyebrow">EXPERIMENTAL / SPHERICAL VIEW</p><h1>Globe Lab</h1><p className="heading-copy">USGS earthquakes and detected cluster centroids on a rotatable 3D globe.</p></div><span className="catalog-stamp">LIMITED LIVE CATALOG · MAX 1,000 MARKERS</span></section>
      <section className="panel globe-panel">
        <div className="globe-toolbar">
          <label className="filter-control"><span>START</span><input type="date" min={CATALOG_START} max={CATALOG_END} value={filters.start} onChange={(event) => setDate('start', event.target.value)} /></label>
          <label className="filter-control"><span>END</span><input type="date" min={CATALOG_START} max={CATALOG_END} value={filters.end} onChange={(event) => setDate('end', event.target.value)} /></label>
          <label className="filter-control"><span>MIN MAGNITUDE</span><select value={filters.min_mag} onChange={(event) => setFilter('min_mag', event.target.value)}>{MAGNITUDE_FILTER_OPTIONS.filter((value) => value >= MIN_CATALOG_MAGNITUDE).map((value) => <option key={value} value={value}>{value.toFixed(1)}+</option>)}</select></label>
          <span className="globe-count">{resource.loading ? 'Loading markers…' : `${points.length.toLocaleString()} / 1,000 markers`}</span>
        </div>
        {resource.error && <StateMessage state="error" title="Globe data could not be loaded." detail={resource.error} onRetry={load} />}
        {resource.loading && <StateMessage state="loading" title="Loading bounded earthquake and cluster records…" />}
        {!resource.loading && !resource.error && points.length === 0 && <StateMessage state="unavailable" title="No catalog markers are available for these filters." detail="Adjust the date range or minimum magnitude." />}
        <div className="globe-content-grid">
          <div className="globe-map-column">
            <div className="globe-stage" ref={stageRef} aria-label="Interactive 3D earthquake and swarm globe">
              <Globe ref={globeRef} width={size.width} height={size.height} backgroundColor="#101C27" globeImageUrl="/earth-blue-marble.jpg" showAtmosphere atmosphereColor="#8BC4D4" atmosphereAltitude={0.2}
                pointsData={points} pointLat="lat" pointLng="lng" pointAltitude="altitude" pointRadius="radius" pointColor="color" pointLabel="label" pointsMerge={false}
                onGlobeReady={() => globeRef.current?.pointOfView({ lat: 18, lng: -98, altitude: 1.75 }, 0)} onPointClick={(point) => setSelected(point)} />
            </div>
            <div className="globe-legend"><span><i className="legend-dot legend-small" /> M &lt; 3.5</span><span><i className="legend-dot legend-medium" /> M 3.5–4.9</span><span><i className="legend-dot legend-large" /> M 5+</span><span><i className="legend-dot legend-swarm" /> Swarm</span><span><i className="legend-diamond" /> Mainshock sequence</span></div>
          </div>
          <aside className="panel globe-detail-panel">
            <div className="panel-heading"><div><p className="eyebrow">SELECTED RECORD</p><h2>{selected ? (selected.kind === 'earthquake' ? `Earthquake · M ${Number(selected.source.mag).toFixed(1)}` : selected.source.label || 'Detected cluster') : 'Marker details'}</h2></div>{selected && <button className="text-button" onClick={() => setSelected(null)}>Clear</button>}</div>
            {!selected && <p className="selection-hint">Click a marker to see its recorded details here.</p>}
            {selected?.kind === 'earthquake' && <dl className="globe-detail-list"><div><dt>PLACE</dt><dd>{selected.source.place || 'Not available'}</dd></div><div><dt>TIME</dt><dd>{formatTime(selected.source.time)}</dd></div><div><dt>DEPTH</dt><dd>{selected.source.depth_km == null ? 'Not available' : `${selected.source.depth_km} km`}</dd></div><div><dt>COORDINATES</dt><dd>{selected.source.lat.toFixed(3)}°, {selected.source.lon.toFixed(3)}°</dd></div>{selected.source.url && <div><dt>USGS CATALOG</dt><dd><a href={selected.source.url} target="_blank" rel="noreferrer">Open event ↗</a></dd></div>}</dl>}
            {selected?.kind === 'swarm' && <dl className="globe-detail-list"><div><dt>CLASSIFICATION</dt><dd>{selected.source.kind === 'mainshock_sequence' ? 'Mainshock sequence' : selected.source.kind === 'unclassified' ? 'Unclassified' : 'Swarm'}</dd></div><div><dt>TIME RANGE</dt><dd>{formatTime(selected.source.start)} – {formatTime(selected.source.end)}</dd></div><div><dt>EVENTS</dt><dd>{selected.source.n_events}</dd></div><div><dt>MAX MAGNITUDE</dt><dd>{selected.source.max_mag == null ? 'Not available' : `M ${Number(selected.source.max_mag).toFixed(1)}`}</dd></div><div><dt>RADIUS</dt><dd>{selected.source.radius_km == null ? 'Not available' : `${Number(selected.source.radius_km).toFixed(1)} km`}</dd></div></dl>}
          </aside>
        </div>
      </section>
      <p className="method-note"><span>TEXTURE</span> NASA Blue Marble Next Generation January topography image, brightened in the globe display. Camera opens toward the North American plate in a slightly tilted view.</p>
      <footer className="page-footer"><span>QUAKESWARM · GLOBE LAB</span><span>Markers come from the bounded live API response; the map does not load the full event catalog.</span></footer>
    </main>
  )
}
