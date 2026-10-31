import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'

function eventColor(magnitude) {
  if (magnitude >= 5) return 'var(--activity-red)'
  if (magnitude >= 3.5) return 'var(--seismic-orange)'
  return 'var(--sandstone)'
}

export default function RegionalSwarmMap({ swarm, events }) {
  const [lon, lat] = swarm.centroid.coordinates
  const center = [lat, lon]
  return (
    <MapContainer className="swarm-region-map" center={center} zoom={7} scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {swarm.radius_km != null && <Circle center={center} radius={swarm.radius_km * 1000} pathOptions={{ color: 'var(--slate-blue)', weight: 1.3, fillColor: 'var(--ocean-mist)', fillOpacity: 0.18, dashArray: '5 5' }} />}
      <CircleMarker center={center} radius={8} pathOptions={{ color: 'var(--graphite)', weight: 2, fillColor: 'var(--slate-blue)', fillOpacity: 0.95 }}>
        <Tooltip>Cluster centroid</Tooltip>
      </CircleMarker>
      {events.map((event) => <CircleMarker key={event.id} center={[event.lat, event.lon]} radius={Math.max(4, Math.min(10, 3 + event.mag * 1.1))} pathOptions={{ color: 'var(--graphite)', weight: 1, fillColor: eventColor(event.mag), fillOpacity: 0.8 }}>
        <Tooltip>{`M ${Number(event.mag).toFixed(1)} · ${event.place || 'Place not available'}`}</Tooltip>
      </CircleMarker>)}
    </MapContainer>
  )
}
