import StateMessage from '../components/StateMessage.jsx'
import useApiResource from '../hooks/useApiResource.js'

function indexKeys(keys) {
  return keys.map(({ field, direction }) => `${field}: ${direction}`).join(', ')
}

export default function WhyMongoDB() {
  const { data, loading, error, retry } = useApiResource('/api/indexes', {}, true)

  return (
    <main className="page-shell mongodb-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">DATA MODEL / DATABASE</p>
          <h1>Why MongoDB?</h1>
          <p className="heading-copy">
            Earthquakes and detected clusters are stored as documents with their
            location, time, measurements, and optional descriptive fields.
          </p>
        </div>
        <span className="database-mark">DOCUMENT + GEOJSON</span>
      </section>

      <section className="database-intro-grid">
        <article className="panel database-copy-panel">
          <p className="eyebrow">EVENT DOCUMENTS</p>
          <h2>One event, one GeoJSON point</h2>
          <p>
            A USGS event is stored by its event ID. Its coordinates use GeoJSON
            longitude/latitude order, and optional depth, magnitude type, and
            place values remain null when the source does not provide them.
          </p>
          <div className="schema-block">
            <code>
              {'{'} _id, time, mag, mag_type, place, depth_km, location: {'{'} type:
              "Point", coordinates: [lon, lat] {'}'}, url {'}'}
            </code>
          </div>
        </article>

        <article className="panel database-copy-panel">
          <p className="eyebrow">DETECTED CLUSTERS</p>
          <h2>Cluster records stay together</h2>
          <p>
            Each detected cluster stores its time span, centroid, radius,
            classification, and member event IDs. The detail route uses those
            IDs to retrieve the source event documents.
          </p>
          <div className="schema-block">
            <code>
              {'{'} _id, start, end, duration_days, n_events, centroid, radius_km,
              kind, event_ids {'}'}
            </code>
          </div>
        </article>
      </section>

      <section className="panel database-explanation">
        <p className="eyebrow">HOW QUERIES USE THE DATA</p>
        <h2>Spatial filters and summaries fit the catalog</h2>
        <p>
          The 2dsphere index supports queries over earthquake coordinates, while
          the time index supports date-range selection. The magnitude index
          supports magnitude filters. MongoDB aggregation pipelines group events
          into timelines, distributions, and regional summaries near the data,
          returning chart-ready values to the app.
        </p>
      </section>

      <section className="panel index-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">LIVE DATABASE METADATA</p>
            <h2>Indexes currently present</h2>
          </div>
          <span className="period-chip">READ FROM MONGODB</span>
        </div>
        {loading && <StateMessage state="loading" title="Reading collection indexes…" />}
        {error && (
          <StateMessage
            state="error"
            title="Index metadata could not be loaded."
            detail={error}
            onRetry={retry}
          />
        )}
        {data && data.collections.length === 0 && (
          <StateMessage state="unavailable" title="No collection index metadata is available." />
        )}
        {data && data.collections.length > 0 && (
          <div className="index-collection-grid">
            {data.collections.map((collection) => (
              <article className="index-collection" key={collection.collection}>
                <h3>
                  <span className="collection-icon">
                    {collection.collection === 'events' ? 'E' : 'S'}
                  </span>
                  {collection.collection}
                </h3>
                {collection.indexes.length === 0 ? (
                  <p className="index-empty">No indexes are defined for this collection.</p>
                ) : collection.indexes.map((index) => (
                  <div className="index-row" key={index.name}>
                    <div>
                      <strong>{index.name}</strong>
                      <code>{indexKeys(index.keys)}</code>
                    </div>
                    {index.unique && <span className="index-tag">UNIQUE</span>}
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="page-footer">
        <span>QUAKESWARM · DATABASE GUIDE</span>
        <span>Index metadata is read from the connected MongoDB database.</span>
      </footer>
    </main>
  )
}
