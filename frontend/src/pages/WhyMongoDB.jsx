import { useState } from 'react'
import PlotlyChart from '../components/PlotlyChart.jsx'
import StateMessage from '../components/StateMessage.jsx'
import useApiResource from '../hooks/useApiResource.js'
import { apiRequest } from '../api.js'
import { chartColors, plotTheme } from '../plotTheme.js'

function indexKeys(keys) {
  return keys.map(({ field, direction }) => `${field}: ${direction}`).join(', ')
}

function benchmarkInterpretation(result) {
  const indexed = result.indexed
  const scan = result.collection_scan
  const timeRelation = indexed.average_ms <= scan.average_ms ? 'faster' : 'slower'
  if (indexed.docs_examined === scan.docs_examined) {
    return `Both plans examined ${indexed.docs_examined.toLocaleString()} documents for this selection. The indexed plan was ${timeRelation} in this run, but the global default box is not selective enough to reduce document examination.`
  }
  return `The indexed plan examined ${(scan.docs_examined - indexed.docs_examined).toLocaleString()} fewer documents and was ${timeRelation} in this run. Timings vary with cache state and the chosen area and date range.`
}

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
        <div className="benchmark-heading"><div><p className="eyebrow">LIVE QUERY PLAN COMPARISON</p><h2>Indexed query vs. collection scan</h2><p>Both use the same spatial box and UTC time filter. MongoDB runs a warm-up, then five timed queries per plan.</p></div>
          <button className="primary-button" onClick={runBenchmark} disabled={benchmarkLoading}>{benchmarkLoading ? 'Running benchmark…' : benchmark ? 'Run benchmark again' : 'Run benchmark'}</button>
        </div>
        {!benchmark && !benchmarkLoading && !benchmarkError && <StateMessage state="unavailable" title="Benchmark results not available. Run the benchmark to generate results." />}
        {benchmarkError && <StateMessage state="error" title="Benchmark failed." detail={benchmarkError} onRetry={runBenchmark} />}
        {benchmarkLoading && <StateMessage state="loading" title="Running real MongoDB queries and collecting execution statistics…" />}
        {benchmark && !benchmarkLoading && <>
          <div className="benchmark-result-grid">
            <article className="panel benchmark-chart-panel"><div className="panel-heading"><div><p className="eyebrow">AVERAGE OF FIVE RUNS</p><h2>Wall-clock query time</h2></div><span className="period-chip">MILLISECONDS</span></div>
              <PlotlyChart data={[{ type: 'bar', x: ['2dsphere index', 'Collection scan'], y: [benchmark.indexed.average_ms, benchmark.collection_scan.average_ms], marker: { color: [chartColors.slate, '#D9B98C'] }, customdata: [benchmark.indexed.docs_examined, benchmark.collection_scan.docs_examined], hovertemplate: '%{x}<br>%{y:.1f} ms<br>%{customdata:,} docs examined<extra></extra>' }]} layout={{ ...plotTheme, height: 310, xaxis: { ...plotTheme.xaxis, title: { text: 'Query plan' } }, yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', title: { text: 'Average time (ms)' } } }} config={{ displayModeBar: false, responsive: true }} useResizeHandler style={{ width: '100%', height: 310 }} />
            </article>
            <article className="panel benchmark-count-panel"><div className="panel-heading"><div><p className="eyebrow">EXECUTION STATISTICS</p><h2>Documents examined</h2></div></div>
              <div className="benchmark-counts"><div><span>2dsphere index</span><strong>{benchmark.indexed.docs_examined.toLocaleString()}</strong><small>examined · {benchmark.indexed.docs_returned.toLocaleString()} returned</small></div><div><span>Collection scan</span><strong>{benchmark.collection_scan.docs_examined.toLocaleString()}</strong><small>examined · {benchmark.collection_scan.docs_returned.toLocaleString()} returned</small></div><div className="returned-count"><span>Matched events</span><strong>{benchmark.count.toLocaleString()}</strong><small>same query result count for both plans</small></div></div>
              <div className="run-timings"><span className="stat-label">INDIVIDUAL RUN TIMES (MS)</span><p><strong>Indexed</strong> {benchmark.indexed.runs_ms.map((value) => value.toFixed(1)).join(' · ')}</p><p><strong>Collection scan</strong> {benchmark.collection_scan.runs_ms.map((value) => value.toFixed(1)).join(' · ')}</p></div>
            </article>
          </div>
          <div className="benchmark-interpretation"><span>INTERPRETATION</span><p>{benchmarkInterpretation(benchmark)}</p></div>
        </>}
      </section>
      <footer className="page-footer"><span>QUAKESWARM · DATABASE STUDY</span><span>Measurements are generated from the current MongoDB dataset.</span></footer>
    </main>
  )
}
