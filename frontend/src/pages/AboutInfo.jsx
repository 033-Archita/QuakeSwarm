import { useState } from 'react'
import AboutSwarms from './AboutSwarms.jsx'
import WhyMongoDB from './WhyMongoDB.jsx'

export default function AboutInfo() {
  const [section, setSection] = useState('swarms')
  return <>
    <nav className="info-subnav" aria-label="About and information">
      <button className={section === 'swarms' ? 'active' : ''} onClick={() => setSection('swarms')}>About swarms</button>
      <button className={section === 'database' ? 'active' : ''} onClick={() => setSection('database')}>Why MongoDB</button>
    </nav>
    {section === 'swarms' ? <AboutSwarms /> : <WhyMongoDB />}
  </>
}
