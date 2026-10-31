export default function FuturePage({ title, section }) {
  return (
    <main className="page-shell future-page">
      <p className="eyebrow">{section}</p>
      <h1>{title}</h1>
      <div className="panel future-panel">
        <span className="future-index">03A</span>
        <div><h2>This view is planned for the next frontend slice.</h2><p>Phase 3a establishes the application shell and Overview. This route will be implemented in a later Phase 3 increment.</p></div>
      </div>
    </main>
  )
}
