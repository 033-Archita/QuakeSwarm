import { useState } from 'react'
import { Navigate, NavLink, useLocation } from 'react-router-dom'
import PlotlyChart from '../components/PlotlyChart.jsx'
import ChartPanel from '../components/ChartPanel.jsx'
import FilterBar from '../components/FilterBar.jsx'
import useApiResource from '../hooks/useApiResource.js'
import { chartColors, plotTheme } from '../plotTheme.js'
import { CATALOG_END, CATALOG_START, MIN_CATALOG_MAGNITUDE } from '../catalog.js'

const initialEarthquakeFilters = { start: CATALOG_START, end: CATALOG_END, min_mag: MIN_CATALOG_MAGNITUDE }
const initialSwarmFilters = { start: CATALOG_START, end: CATALOG_END, kind: '' }
const kindColors = { swarm: chartColors.slate, mainshock_sequence: chartColors.red, unclassified: chartColors.orange }
const kindNames = { swarm: 'Swarm', mainshock_sequence: 'Mainshock sequence', unclassified: 'Unclassified' }

function Plot({ data, layout, height = 280 }) {
  return <PlotlyChart data={data} layout={{ ...plotTheme, height, ...layout }} config={{ displayModeBar: false, responsive: true }} useResizeHandler style={{ width: '100%', height }} />
}

function ChartQuery({ path, params, title, subtitle, emptyMessage, emptyCheck, note, children }) {
  const enabled = Boolean(params.start && params.end)
  const resource = useApiResource(path, params, enabled)
  const empty = resource.data != null && (emptyCheck ? emptyCheck(resource.data) : Array.isArray(resource.data) && resource.data.length === 0)
  const state = !enabled || resource.loading ? 'loading' : resource.error ? 'error' : empty ? 'empty' : 'ready'
  return <ChartPanel title={title} subtitle={subtitle} state={state} error={resource.error} onRetry={resource.retry} emptyMessage={emptyMessage} note={note}>{resource.data != null && children(resource.data)}</ChartPanel>
}

function ChartSection({ id, number, title, description, children, filters, onFilters, filterProps }) {
  return (
    <section className="analytics-section" id={id}>
      <div className="analytics-section-heading"><div><p className="eyebrow">CHARTS {number}</p><h2>{title}</h2><p>{description}</p></div></div>
      <FilterBar value={filters} onChange={onFilters} {...filterProps} />
      <div className="analytics-grid">{children}</div>
    </section>
  )
}

export default function Analytics() {
  const location = useLocation()
  const section = location.pathname.split('/')[2] || 'activity'
  if (!['activity', 'clusters', 'structure'].includes(section)) return <Navigate to="/analytics/activity" replace />
  const [earthquakeFilters, setEarthquakeFilters] = useState(initialEarthquakeFilters)
  const [swarmFilters, setSwarmFilters] = useState(initialSwarmFilters)
  const [structureFilters, setStructureFilters] = useState(initialSwarmFilters)
  const [logMagnitude, setLogMagnitude] = useState(false)

  const earthquake = earthquakeFilters
  const swarm = { start: swarmFilters.start, end: swarmFilters.end, ...(swarmFilters.kind ? { kind: swarmFilters.kind } : {}) }
  const structure = { start: structureFilters.start, end: structureFilters.end, ...(structureFilters.kind ? { kind: structureFilters.kind } : {}) }

  return (
    <main className="page-shell analytics-page">
      <section className="page-heading">
        <div><p className="eyebrow">CATALOG / DISTRIBUTIONS / CLUSTER STRUCTURE</p><h1>Seismic analytics</h1><p className="heading-copy">Explore earthquake activity, detected clusters, and their internal structure.</p></div>
      </section>
      <nav className="analytics-subnav" aria-label="Analytics pages">
        <NavLink to="/analytics/activity">Earthquake activity</NavLink><NavLink to="/analytics/clusters">Swarm results</NavLink><NavLink to="/analytics/structure">Swarm structure</NavLink>
      </nav>
      {section === 'activity' && <ChartSection id="earthquake-activity" number="01 — 07" title="Earthquake activity" description="Magnitude and depth distributions, event timing, and regions represented in the selected catalog range." filters={earthquakeFilters} onFilters={setEarthquakeFilters} filterProps={{ includeMagnitude: true }}>
        <ChartQuery path="/api/timeline" params={{ ...earthquake, granularity: 'year' }} title="Earthquakes per year" subtitle="Count of catalog events by UTC calendar year." emptyMessage="No earthquakes match this date and magnitude selection.">
          {(rows) => <Plot data={[{ type: 'bar', x: rows.map((r) => r.period), y: rows.map((r) => r.count), marker: { color: chartColors.slate }, hovertemplate: '%{x}<br>%{y:,} events<extra></extra>' }]} layout={{ xaxis: { ...plotTheme.xaxis, title: { text: 'Year' } }, yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', title: { text: 'Events' } } }} />}
        </ChartQuery>

        <ChartQuery path="/api/timeline" params={{ ...earthquake, granularity: 'month' }} title="Earthquakes per month" subtitle="Monthly event counts; the horizontal axis follows UTC calendar time." emptyMessage="No monthly earthquake activity is available for these filters.">
          {(rows) => <Plot data={[{ type: 'scatter', mode: 'lines+markers', x: rows.map((r) => r.period), y: rows.map((r) => r.count), line: { color: chartColors.slate, width: 2 }, marker: { color: chartColors.orange, size: 5 }, hovertemplate: '%{x}<br>%{y:,} events<extra></extra>' }]} layout={{ xaxis: { ...plotTheme.xaxis, title: { text: 'Month (UTC)' } }, yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', title: { text: 'Events' } } }} />}
        </ChartQuery>

        <ChartQuery path="/api/analytics/magnitude-distribution" params={earthquake} title="Magnitude distribution" subtitle="Half-magnitude bins across qualifying events." emptyMessage="Magnitude data is not available for this selection." note="The optional logarithmic y-axis helps reveal lower-frequency high-magnitude events.">
          {(rows) => <><label className="chart-toggle"><input type="checkbox" checked={logMagnitude} onChange={(event) => setLogMagnitude(event.target.checked)} /> Logarithmic count axis</label><Plot data={[{ type: 'bar', x: rows.map((r) => `${Number(r.bin_start).toFixed(1)}–${Number(r.bin_end).toFixed(1)}`), y: rows.map((r) => r.count), marker: { color: chartColors.orange }, hovertemplate: 'M %{x}<br>%{y:,} events<extra></extra>' }]} layout={{ xaxis: { ...plotTheme.xaxis, title: { text: 'Magnitude (M)' } }, yaxis: { ...plotTheme.yaxis, type: logMagnitude ? 'log' : 'linear', rangemode: logMagnitude ? undefined : 'tozero', title: { text: 'Events' } } }} /></>}
        </ChartQuery>

        <ChartQuery path="/api/analytics/depth-distribution" params={earthquake} title="Depth distribution" subtitle="Depth values grouped in 10 km intervals." emptyMessage="Depth data is not available for the selected events." emptyCheck={(data) => data.bins.length === 0}>
          {(data) => {
            const bins = data.bins
            const labels = bins.map((row) => `${row.bin_start}–${row.bin_end}`)
            const tickStep = Math.max(1, Math.ceil(labels.length / 8))
            const tickValues = labels.filter((_, index) => index % tickStep === 0)
            return <Plot
              data={[{ type: 'bar', x: labels, y: bins.map((row) => row.count), marker: { color: chartColors.sage }, hovertemplate: '%{x} km<br>%{y:,} events<extra></extra>' }]}
              layout={{
                margin: { l: 48, r: 16, t: 18, b: 88 },
                xaxis: { ...plotTheme.xaxis, title: { text: 'Depth (km)', standoff: 18 }, tickmode: 'array', tickvals: tickValues, tickangle: -45, tickfont: { size: 8 }, automargin: true },
                yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', title: { text: 'Events', standoff: 12 } },
              }}
              height={320}
            />
          }}
        </ChartQuery>

        <ChartQuery path="/api/analytics/magnitude-depth" params={earthquake} title="Magnitude vs. depth" subtitle="Up to 5,000 sampled events; records with null depth are excluded." emptyMessage="This analysis is not applicable because the selection has no events with depth values." emptyCheck={(data) => data.sample_size === 0}>
          {(data) => <Plot data={[{ type: 'scatter', mode: 'markers', x: data.points.map((r) => r.depth_km), y: data.points.map((r) => r.mag), marker: { color: chartColors.red, size: 5, opacity: 0.58 }, hovertemplate: 'Depth %{x} km<br>Magnitude %{y}<extra></extra>' }]} layout={{ xaxis: { ...plotTheme.xaxis, title: { text: 'Depth (km)' } }, yaxis: { ...plotTheme.yaxis, title: { text: 'Magnitude (M)' } } }} />}
        </ChartQuery>

        <ChartQuery path="/api/analytics/regions" params={earthquake} title="Top 15 regions by event count" subtitle="Region is derived from the text after the last comma in USGS place." emptyMessage="Place-region data is not available for this selection.">
          {(rows) => <Plot data={[{ type: 'bar', orientation: 'h', y: rows.map((r) => r.region).reverse(), x: rows.map((r) => r.count).reverse(), marker: { color: chartColors.slate }, customdata: rows.map((r) => r.avg_mag).reverse(), hovertemplate: '%{y}<br>%{x:,} events<br>Average magnitude %{customdata:.2f}<extra></extra>' }]} layout={{ margin: { l: 100, r: 16, t: 16, b: 38 }, xaxis: { ...plotTheme.xaxis, rangemode: 'tozero', title: { text: 'Events' } }, yaxis: { ...plotTheme.yaxis, automargin: true, title: { text: 'Region' } } }} height={330} />}
        </ChartQuery>

        <ChartQuery path="/api/analytics/magnitude-types" params={earthquake} title="Magnitude types" subtitle="Null type values are labeled Not available." emptyMessage="Magnitude-type data is not available for this selection.">
          {(rows) => {
            const tickStep = Math.max(1, Math.ceil(rows.length / 7))
            const tickRows = rows.filter((_, index) => index % tickStep === 0)
            return <Plot
              data={[{ type: 'bar', x: rows.map((row) => row.mag_type), y: rows.map((row) => row.count), marker: { color: chartColors.sage }, hovertemplate: '%{x}<br>%{y:,} events<extra></extra>' }]}
              layout={{
                margin: { l: 48, r: 16, t: 18, b: 92 },
                xaxis: { ...plotTheme.xaxis, title: { text: 'Magnitude type', standoff: 18 }, tickmode: 'array', tickvals: tickRows.map((row) => row.mag_type), tickangle: -40, tickfont: { size: 8 }, automargin: true },
                yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', title: { text: 'Events', standoff: 12 } },
              }}
              height={325}
            />
          }}
        </ChartQuery>
      </ChartSection>}

      {section === 'clusters' && <ChartSection id="swarm-results" number="08 — 10" title="Swarm results" description="Counts, duration relationships, and the timing of detected clusters." filters={swarmFilters} onFilters={setSwarmFilters} filterProps={{ includeKind: true }}>
        <ChartQuery path="/api/analytics/swarm-summary" params={swarm} title="Swarm vs. mainshock sequence" subtitle="Detected cluster counts by heuristic classification." emptyMessage="No detected clusters match this date and kind selection." emptyCheck={(data) => data.by_kind.length === 0}>
          {(data) => <><Plot data={[{ type: 'bar', x: data.by_kind.map((r) => kindNames[r.kind] || r.kind), y: data.by_kind.map((r) => r.count), marker: { color: data.by_kind.map((r) => kindColors[r.kind] || chartColors.sage) }, hovertemplate: '%{x}<br>%{y:,} clusters<extra></extra>' }]} layout={{ xaxis: { ...plotTheme.xaxis, title: { text: 'Classification' } }, yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', title: { text: 'Clusters' } } }} /><div className="summary-values">{data.by_kind.map((r) => <div key={r.kind}><strong>{kindNames[r.kind] || r.kind}</strong><span className="summary-average">Avg. {r.avg_duration_days == null ? '—' : `${r.avg_duration_days.toFixed(1)} days`} · {r.avg_n_events == null ? '—' : r.avg_n_events.toFixed(1)} events</span></div>)}</div></>}
        </ChartQuery>

        <ChartQuery path="/api/analytics/swarm-scatter" params={swarm} title="Cluster duration vs. event count" subtitle="Each point is one detected cluster; color indicates kind." emptyMessage="Cluster scatter data is not available for this selection.">
          {(rows) => <Plot data={Object.keys(kindNames).map((kind) => ({ type: 'scatter', mode: 'markers', name: kindNames[kind], x: rows.filter((r) => r.kind === kind).map((r) => r.duration_days), y: rows.filter((r) => r.kind === kind).map((r) => r.n_events), marker: { color: kindColors[kind], size: 8, opacity: 0.72 }, customdata: rows.filter((r) => r.kind === kind).map((r) => r.max_mag), hovertemplate: `${kindNames[kind]}<br>%{x:.1f} days<br>%{y} events<br>Maximum M %{customdata}<extra></extra>` })).filter((trace) => trace.x.length > 0)} layout={{ showlegend: true, legend: { orientation: 'h', y: 1.12 }, xaxis: { ...plotTheme.xaxis, type: 'log', title: { text: 'Duration (days)' } }, yaxis: { ...plotTheme.yaxis, type: 'log', title: { text: 'Events in cluster' } } }} />}
        </ChartQuery>

        <ChartQuery path="/api/analytics/swarm-timeline" params={{ ...swarm, granularity: 'year' }} title="Swarm activity over time" subtitle="Cluster start year, stacked by kind." emptyMessage="No detected clusters occur in the selected date range.">
          {(rows) => <Plot data={Object.keys(kindNames).map((kind) => ({ type: 'bar', name: kindNames[kind], x: rows.filter((r) => r.kind === kind).map((r) => r.period), y: rows.filter((r) => r.kind === kind).map((r) => r.count), marker: { color: kindColors[kind] }, hovertemplate: `${kindNames[kind]}<br>%{x}<br>%{y} clusters<extra></extra>` })).filter((trace) => trace.x.length > 0)} layout={{ barmode: 'stack', showlegend: true, legend: { orientation: 'h', y: 1.12 }, xaxis: { ...plotTheme.xaxis, title: { text: 'Year' } }, yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', title: { text: 'Clusters' } } }} />}
        </ChartQuery>
      </ChartSection>}

      {section === 'structure' && <ChartSection id="swarm-structure" number="11 — 12" title="Swarm structure" description="Spatial extent and gaps between successive events within each detected cluster." filters={structureFilters} onFilters={setStructureFilters} filterProps={{ includeKind: true }}>
        <ChartQuery path="/api/analytics/swarm-radius" params={structure} title="Swarm radius distribution" subtitle="Largest great-circle distance from cluster centroid to a member event." emptyMessage="Radius data is not available for this selection.">
          {(rows) => <Plot data={[{ type: 'bar', x: rows.map((row) => row.bin_start + 5), width: rows.map(() => 9), y: rows.map((row) => row.count), marker: { color: chartColors.sage }, customdata: rows.map((row) => [row.bin_start, row.bin_end]), hovertemplate: '%{customdata[0]}–%{customdata[1]} km<br>%{y} clusters<extra></extra>' }]} layout={{ xaxis: { ...plotTheme.xaxis, type: 'linear', rangemode: 'tozero', title: { text: 'Swarm radius (km)' } }, yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', title: { text: 'Clusters' } } }} />}
        </ChartQuery>

        <ChartQuery path="/api/analytics/inter-event-times" params={structure} title="Inter-event times within clusters" subtitle="UTC gaps grouped by time interval; every bin remains visible, including empty bins." emptyMessage="Inter-event intervals are not available for this selection." emptyCheck={(rows) => rows.every((r) => r.count === 0)}>
          {(rows) => <Plot data={[{ type: 'bar', x: rows.map((row) => row.label), y: rows.map((row) => row.count), customdata: rows.map((row) => row.label), marker: { color: chartColors.orange, line: { color: '#C87540', width: 0.6 } }, hovertemplate: '%{customdata} hours<br>%{y} gaps<extra></extra>' }]} layout={{ margin: { l: 48, r: 16, t: 18, b: 66 }, bargap: 0.16, xaxis: { ...plotTheme.xaxis, type: 'category', title: { text: 'Gap between events (hours)' }, tickangle: -20, tickfont: { size: 8 } }, yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', title: { text: 'Gaps', standoff: 12 } } }} height={320} />}
        </ChartQuery>
      </ChartSection>}
      <footer className="page-footer"><span>QUAKESWARM · ANALYTICS</span><span>All chart values are calculated from MongoDB records.</span></footer>
    </main>
  )
}
