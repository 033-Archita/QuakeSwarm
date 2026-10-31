import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import Overview from './pages/Overview.jsx'
import FuturePage from './pages/FuturePage.jsx'
import StateMessage from './components/StateMessage.jsx'
import { apiRequest } from './api.js'

const Analytics = lazy(() => import('./pages/Analytics.jsx'))
const SwarmExplorer = lazy(() => import('./pages/SwarmExplorer.jsx'))
const AboutInfo = lazy(() => import('./pages/AboutInfo.jsx'))
const GlobeLab = lazy(() => import('./pages/GlobeLab.jsx'))

const navigation = [
  { to: '/', label: 'Overview', end: true },
  { to: '/swarms', label: 'Swarm Explorer' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/about', label: 'About / Info' },
]

export default function App() {
  const [connection, setConnection] = useState('loading')
  const checkConnection = useCallback(async () => {
    setConnection('loading')
    try {
      const result = await apiRequest('/api/health')
      setConnection(result.status === 'ok' && result.database === 'connected' ? 'connected' : 'error')
    } catch {
      setConnection('error')
    }
  }, [])

  useEffect(() => { checkConnection() }, [checkConnection])

  return (
    <div className="app-frame">
      <header className="site-header">
        <NavLink to="/" className="brand" aria-label="QuakeSwarm home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>Quake<span>Swarm</span></strong><small>SEISMIC INTELLIGENCE</small></span>
        </NavLink>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end}>{item.label}</NavLink>)}
          <NavLink to="/globe-lab" className="globe-nav">Globe Lab <span>EXPERIMENTAL</span></NavLink>
        </nav>
        <button className={`header-status header-status-${connection}`} onClick={checkConnection} title="Check API and database connection">
          <span className="status-dot" /> {connection === 'connected' ? 'DATA CONNECTED' : connection === 'loading' ? 'CHECKING DATA' : 'DATA UNAVAILABLE'}
        </button>
      </header>
      <Suspense fallback={<main className="page-shell"><StateMessage state="loading" title="Opening view…" /></main>}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/swarms" element={<SwarmExplorer />} />
          <Route path="/swarms/:id" element={<SwarmExplorer />} />
          <Route path="/analytics" element={<Navigate to="/analytics/activity" replace />} />
          <Route path="/analytics/:section" element={<Analytics />} />
          <Route path="/about" element={<AboutInfo />} />
          <Route path="/mongodb" element={<Navigate to="/about" replace />} />
          <Route path="/about-swarms" element={<Navigate to="/about" replace />} />
          <Route path="/globe-lab" element={<GlobeLab />} />
          <Route path="*" element={<FuturePage title="Page not found" section="QUAKESWARM" />} />
        </Routes>
      </Suspense>
    </div>
  )
}
