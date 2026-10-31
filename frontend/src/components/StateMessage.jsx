export default function StateMessage({ state, title, detail, onRetry }) {
  const classes = `state-message state-${state}`
  return (
    <div className={classes} role={state === 'error' ? 'alert' : 'status'}>
      <span className="state-mark" aria-hidden="true">{state === 'loading' ? '◌' : state === 'error' ? '!' : '—'}</span>
      <div>
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
        {state === 'error' && onRetry && <button className="text-button" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  )
}
