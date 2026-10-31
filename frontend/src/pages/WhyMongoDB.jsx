import { useState } from 'react'
import PlotlyChart from '../components/PlotlyChart.jsx'
import StateMessage from '../components/StateMessage.jsx'
import useApiResource from '../hooks/useApiResource.js'
import { apiRequest } from '../api.js'
import { chartColors, plotTheme } from '../plotTheme.js'

function indexKeys(keys) {
  return keys.map(({ field, direction }) => `${field}: ${direction}`).join(', ')
}

const planLabels = { '2dsphere': '2dsphere hint', time_index: 'Time index hint', collection_scan: 'Natural collection scan' }

export default function WhyMongoDB() {
  const { data: indexData, loading: indexesLoading, error: indexesError, retry: retryIndexes } = useApiResource('/api/indexes', {}, true)
  const [benchmark, setBenchmark] = useState(null)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [benchmarkError, setBenchmarkError] = useState(null)

  async function runBenchmark() {
    setBenchmarkLoading(true)
    setBenchmarkError(null)
    try {
      const result = await apiRequest('/api/benchmark', { runs: 5 })
      setBenchmark(result)
    } catch (error) {
      setBenchmarkError(error.message)
    } finally {
      setBenchmarkLoading(false)
    }
  }

  return (
    <main className="page-shell mongodb-page">
      <section className="page-heading"><div><p className="eyebrow">DATABASE DESIGN / PERFORMANCE</p><h1>Why MongoDB</h1><p className="heading-copy">Document records, a geospatial index, and a benchmark using real query plans.</p></div><span className="database-mark">MONGODB · DOCUMENT STORE</span></section>

      <section className="database-intro-grid">
        <article className="panel database-copy-panel"><p className="eyebrow">EVENT DOCUMENTS</p><h2>One event, one GeoJSON point</h2><p>Each USGS record is stored by event ID. Its coordinates use GeoJSON longitude/latitude order, so MongoDB can apply the 2dsphere index to spatial filters alongside event time and magnitude.</p><div className="schema-block"><code>{'{'} _id: USGS id, time: UTC date, mag, mag_type, place, depth_km, location: {'{'} type: "Point", coordinates: [lon, lat] {'}'}, url {'}'}</code></div></article>
        <article className="panel database-copy-panel"><p className="eyebrow">DETECTED CLUSTERS</p><h2>Computed results stay queryable</h2><p>Each swarm document records its interval, centroid, bounding box, radius, classification, and member event IDs. Detail requests join those IDs to the original event documents.</p><div className="schema-block"><code>{'{'} _id, start, end, duration_days, n_events, centroid, bbox, radius_km, max_mag, mag_gap, kind, event_ids {'}'}</code></div></article>
      </section>

      <section className="panel index-panel"><div className="panel-heading"><div><p className="eyebrow">LIVE DATABASE METADATA</p><h2>Indexes currently present</h2></div><span className="period-chip">READ FROM MONGODB</span></div>
        {indexesLoading && <StateMessage state="loading" title="Reading collection indexes…" />}
        {indexesError && <StateMessage state="error" title="Index metadata could not be loaded." detail={indexesError} onRetry={retryIndexes} />}
        {indexData && <div className="index-collection-grid">{indexData.collections.map((collection) => <article className="index-collection" key={collection.collection}><h3><span className="collection-icon">{collection.collection === 'events' ? 'E' : 'S'}</span>{collection.collection}</h3>
          {collection.indexes.length === 0 ? <p className="index-empty">No index metadata is available.</p> : collection.indexes.map((index) => <div className="index-row" key={index.name}><div><strong>{index.name}</strong><code>{indexKeys(index.keys)}</code></div>{index.unique && <span className="index-tag">UNIQUE</span>}</div>)}
        </article>)}</div>}
      </section>

      <section className="benchmark-section">
        <div className="benchmark-heading"><div><p className="eyebrow">LIVE QUERY PLAN COMPARISON</p><h2>Regional sample and global baseline</h2><p>Each case compares the same geographic and UTC time filters with three forced query plans.</p></div>
          <button className="primary-button" onClick={runBenchmark} disabled={benchmarkLoading}>{benchmarkLoading ? 'Running benchmark…' : benchmark ? 'Run benchmark again' : 'Run benchmark'}</button>
        </div>
        {!benchmark && !benchmarkLoading && !benchmarkError && <StateMessage state="unavailable" title="Benchmark results not available. Run the benchmark to generate results." />}
        {benchmarkError && <StateMessage state="error" title="Benchmark failed." detail={benchmarkError} onRetry={runBenchmark} />}
        {benchmarkLoading && <StateMessage state="loading" title="Running real MongoDB queries and collecting execution statistics…" />}
        {benchmark && !benchmarkLoading && <>
          <p className="benchmark-method-note">The regional default is {benchmark.cases.regional.start} through {benchmark.cases.regional.end} in a small configured area; it matched {benchmark.cases.regional.returned_count.toLocaleString()} of {benchmark.total_events.toLocaleString()} catalog events ({benchmark.cases.regional.catalog_percent == null ? 'share unavailable for an empty catalog' : `${benchmark.cases.regional.catalog_percent.toFixed(3)}%`}). The global case retains the original four-year date window. Each plan has one unreported warm-up, then {benchmark.runs} timed cursor reads. Document counts come from MongoDB <code>explain("executionStats")</code>; wall-clock time includes returning matching IDs to this API process.</p>
          <div className="benchmark-cases">{Object.entries(benchmark.cases).map(([caseKey, result]) => {
            const entries = Object.entries(result.plans)
            return <section className="panel benchmark-case" key={caseKey}>
              <div className="panel-heading"><div><p className="eyebrow">{caseKey === 'regional' ? 'SELECTIVE REGIONAL FILTER' : 'ORIGINAL GLOBAL FILTER'}</p><h2>{result.label}</h2><p>{result.start} — {result.end} · box [{result.box.join(', ')}]</p></div><span className="period-chip">{result.returned_count.toLocaleString()} EVENTS</span></div>
              <PlotlyChart data={[{ type: 'bar', x: entries.map(([key]) => planLabels[key]), y: entries.map(([, plan]) => plan.average_ms), marker: { color: [chartColors.slate, chartColors.sage, '#D9B98C'] }, customdata: entries.map(([, plan]) => [plan.docs_examined, plan.docs_returned]), hovertemplate: '%{x}<br>%{y:.1f} ms average<br>%{customdata[0]:,} examined · %{customdata[1]:,} returned<extra></extra>' }]} layout={{ ...plotTheme, height: 300, xaxis: { ...plotTheme.xaxis, title: { text: 'Forced query plan' }, tickangle: -12 }, yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', title: { text: 'Average wall-clock time (ms)' } } }} config={{ displayModeBar: false, responsive: true }} useResizeHandler style={{ width: '100%', height: 300 }} />
              <div className="benchmark-plan-grid">{entries.map(([key, plan]) => <article className="benchmark-plan" key={key}><h3>{planLabels[key]}</h3><dl><div><dt>Average time</dt><dd>{plan.average_ms.toFixed(2)} ms</dd></div><div><dt>Documents examined</dt><dd>{plan.docs_examined.toLocaleString()}</dd></div><div><dt>Documents returned</dt><dd>{plan.docs_returned.toLocaleString()}</dd></div></dl><p><span>Timed runs (ms)</span>{plan.runs_ms.map((value) => value.toFixed(2)).join(' · ')}</p></article>)}</div>
            </section>
          })}</div>
          <div className="benchmark-interpretation"><span>HOW TO READ THIS</span><p>For the regional case, the 2dsphere hint examined {benchmark.cases.regional.plans['2dsphere'].docs_examined.toLocaleString()} documents and the time index examined {benchmark.cases.regional.plans.time_index.docs_examined.toLocaleString()} to return {benchmark.cases.regional.returned_count.toLocaleString()}. The counts show the work MongoDB actually reports for this query and hint; forcing an index does not guarantee a narrow scan or lower wall-clock time. Timings are from this run and vary with cache state, database load, and machine performance.</p></div>
        </>}
      </section>
      <footer className="page-footer"><span>QUAKESWARM · DATABASE STUDY</span><span>Measurements are generated from the current MongoDB dataset.</span></footer>
    </main>
  )
}
