import { Link } from 'react-router-dom'
import { CATALOG_END, CATALOG_START, CLUSTER_MAG_GAP_THRESHOLD, CLUSTER_MIN_EVENTS, CLUSTER_SPACE_KM, CLUSTER_TIME_DAYS, MIN_CATALOG_MAGNITUDE } from '../catalog.js'

export default function AboutSwarms() {
  return (
    <main className="page-shell about-swarms-page">
      <section className="page-heading"><div><p className="eyebrow">GUIDE / DATA AND METHOD</p><h1>What is an earthquake swarm?</h1><p className="heading-copy">How QuakeSwarm selects catalog events, groups them, and labels the resulting clusters.</p></div><Link className="learn-link" to="/swarms">Open Swarm Explorer <span aria-hidden="true">→</span></Link></section>
      <section className="about-hero panel"><div className="about-hero-mark" aria-hidden="true">≈</div><div><p className="eyebrow">A CLUSTER, NOT A PREDICTION</p><h2>Many nearby earthquakes over a short period</h2><p>In seismology, a swarm describes a concentration of earthquakes in space and time without one event clearly dominating as the mainshock. QuakeSwarm finds candidate clusters with a transparent DBSCAN heuristic. The resulting labels are for exploration; they are not an authoritative seismological classification and do not predict future earthquakes.</p></div></section>
      <section className="about-facts-grid">
        <article className="panel about-fact"><span className="about-number">01</span><p className="eyebrow">CATALOG FLOOR</p><h2>Magnitude 2.5 and above</h2><p>Ingestion starts at M {MIN_CATALOG_MAGNITUDE.toFixed(1)}. The app limits dates to {CATALOG_START} through {CATALOG_END}, matching the configured historical catalog window.</p></article>
        <article className="panel about-fact"><span className="about-number">02</span><p className="eyebrow">SPATIAL NEIGHBORHOOD</p><h2>{CLUSTER_SPACE_KM} km</h2><p>Event coordinates are converted to Earth-centered kilometers so distance behaves consistently across longitude and latitude.</p></article>
        <article className="panel about-fact"><span className="about-number">03</span><p className="eyebrow">TIME WINDOW</p><h2>{CLUSTER_TIME_DAYS} days</h2><p>Elapsed time is scaled against the spatial radius before DBSCAN evaluates a cluster’s four-dimensional distance.</p></article>
        <article className="panel about-fact"><span className="about-number">04</span><p className="eyebrow">MINIMUM CLUSTER SIZE</p><h2>{CLUSTER_MIN_EVENTS} events</h2><p>A candidate group must meet the configured DBSCAN minimum sample count. Unclustered events are treated as noise and omitted from swarm results.</p></article>
      </section>
      <section className="about-method-grid">
        <article className="panel about-method"><p className="eyebrow">HOW LABELS ARE ASSIGNED</p><h2>Compare the two largest magnitudes</h2><p>For each cluster, QuakeSwarm computes the difference between its largest and second-largest event magnitudes. A difference of at least {CLUSTER_MAG_GAP_THRESHOLD.toFixed(1)} labels it a <strong>mainshock sequence</strong>. Otherwise it is labeled a <strong>swarm</strong>. If the gap cannot be computed, the cluster is <strong>unclassified</strong>.</p></article>
        <article className="panel about-method"><p className="eyebrow">LIMITS TO KEEP IN MIND</p><h2>A useful view of this catalog</h2><ul><li>The output depends on the configured distance, time, size, and magnitude-gap thresholds.</li><li>Events near the edge of a cluster may be assigned differently with another parameter choice.</li><li>Catalog coverage, event locations, and magnitude estimates have uncertainty.</li><li>This analysis describes historical records; it does not provide hazard forecasts.</li></ul></article>
      </section>
      <footer className="page-footer"><span>QUAKESWARM · METHOD GUIDE</span><span>Configuration values are read from backend/config.py.</span></footer>
    </main>
  )
}
