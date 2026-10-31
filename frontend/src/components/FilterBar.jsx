import { CATALOG_END, CATALOG_START, MAGNITUDE_FILTER_OPTIONS, MIN_CATALOG_MAGNITUDE, normalizeDateRange } from '../catalog.js'

export default function FilterBar({ value, onChange, includeMagnitude = false, includeKind = false, includeSort = false, includeClusterRanges = false }) {
  const set = (field, next) => onChange((current) => ({ ...current, [field]: next }))
  const setDate = (field, next) => onChange((current) => {
    const proposed = { ...current, [field]: next }
    return { ...current, ...normalizeDateRange(proposed.start, proposed.end, field) }
  })
  const setNumeric = (field, event) => {
    const raw = event.target.value === '' ? '' : Number(event.target.value)
    set(field, raw === '' ? '' : field === 'min_events' || field === 'max_events' ? Math.max(1, raw) : field === 'min_mag' || field === 'max_mag' ? Math.max(MIN_CATALOG_MAGNITUDE, raw) : raw)
  }
  return (
    <div className="filter-bar">
      <label className="filter-control"><span>FROM</span><input type="date" min={CATALOG_START} max={CATALOG_END} value={value.start || CATALOG_START} onChange={(event) => setDate('start', event.target.value)} /></label>
      <label className="filter-control"><span>THROUGH</span><input type="date" min={CATALOG_START} max={CATALOG_END} value={value.end || CATALOG_END} onChange={(event) => setDate('end', event.target.value)} /></label>
      {includeMagnitude && <label className="filter-control"><span>MIN MAG</span><select value={Math.max(MIN_CATALOG_MAGNITUDE, Number(value.min_mag ?? MIN_CATALOG_MAGNITUDE))} onChange={(event) => set('min_mag', Number(event.target.value))}>{MAGNITUDE_FILTER_OPTIONS.filter((mag) => mag >= MIN_CATALOG_MAGNITUDE).map((mag) => <option key={mag} value={mag}>{mag.toFixed(1)}+</option>)}</select></label>}
      {includeKind && <label className="filter-control"><span>KIND</span><select value={value.kind || ''} onChange={(event) => set('kind', event.target.value)}><option value="">All kinds</option><option value="swarm">Swarm</option><option value="mainshock_sequence">Mainshock sequence</option><option value="unclassified">Unclassified</option></select></label>}
      {includeClusterRanges && <>
        <details className="filter-detail-group"><summary>Event, magnitude and duration limits</summary><div className="filter-detail-grid">
          <label className="filter-control"><span>MIN EVENTS</span><input type="number" min="1" max="10000" value={value.min_events || ''} placeholder="Any" onChange={(event) => setNumeric('min_events', event)} /></label>
          <label className="filter-control"><span>MAX EVENTS</span><input type="number" min="1" max="10000" value={value.max_events ?? ''} placeholder="Any" onChange={(event) => setNumeric('max_events', event)} /></label>
          <label className="filter-control"><span>MIN CLUSTER MAG</span><select value={value.min_mag ?? ''} onChange={(event) => set('min_mag', event.target.value)}><option value="">Any</option>{MAGNITUDE_FILTER_OPTIONS.filter((mag) => mag >= MIN_CATALOG_MAGNITUDE).map((mag) => <option key={mag} value={mag}>{mag.toFixed(1)}+</option>)}</select></label>
          <label className="filter-control"><span>MAX CLUSTER MAG</span><select value={value.max_mag ?? ''} onChange={(event) => set('max_mag', event.target.value)}><option value="">Any</option>{MAGNITUDE_FILTER_OPTIONS.filter((mag) => mag >= MIN_CATALOG_MAGNITUDE).map((mag) => <option key={mag} value={mag}>{mag.toFixed(1)}</option>)}</select></label>
          <label className="filter-control"><span>MIN DURATION (D)</span><input type="number" min="0" step="1" value={value.min_duration ?? ''} placeholder="Any" onChange={(event) => setNumeric('min_duration', event)} /></label>
          <label className="filter-control"><span>MAX DURATION (D)</span><input type="number" min="0" step="1" value={value.max_duration ?? ''} placeholder="Any" onChange={(event) => setNumeric('max_duration', event)} /></label>
        </div></details>
      </>}
      {includeSort && <label className="filter-control"><span>SORT</span><select value={value.sort || 'start_desc'} onChange={(event) => set('sort', event.target.value)}><option value="start_desc">Newest first</option><option value="start_asc">Oldest first</option></select></label>}
    </div>
  )
}
