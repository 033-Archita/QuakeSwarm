import StateMessage from './StateMessage.jsx'

export default function ChartPanel({ title, subtitle, state, error, onRetry, emptyMessage, children, note }) {
  return (
    <article className="panel analytics-card">
      <div className="panel-heading"><div><p className="eyebrow">QUAKE SWARM ANALYTICS</p><h2>{title}</h2></div></div>
      {subtitle && <p className="panel-copy">{subtitle}</p>}
      {state === 'loading' && <StateMessage state="loading" title={`Loading ${title.toLowerCase()}…`} />}
      {state === 'error' && <StateMessage state="error" title={`${title} could not be loaded.`} detail={error} onRetry={onRetry} />}
      {state === 'empty' && <StateMessage state="unavailable" title={emptyMessage || `${title} data is not available for this selection.`} />}
      {state === 'ready' && children}
      {note && <p className="chart-note">{note}</p>}
    </article>
  )
}
