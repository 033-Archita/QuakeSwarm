import { useEffect } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet'
import InvalidateMapSize from './InvalidateMapSize.jsx'
import { mapColors } from '../mapColors.js'

const sequenceIcon = L.divIcon({
  className: 'sequence-map-icon',
  html: '<span aria-hidden="true"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function RecenterMap({ selected }) {
  const map = useMap()
  useEffect(() => {
    if (selected?.position) map.flyTo(selected.position, Math.max(map.getZoom(), 4), { duration: 0.5 })
  }, [map, selected])
  return null
}

function LockWorldViewAtMinimumZoom() {
  const map = useMap()

  useEffect(() => {
    const enforceZoomState = () => {
      if (map.getZoom() <= map.getMinZoom()) {
        map.dragging.disable()
        map.setView([18, 8], map.getMinZoom(), { animate: false })
      } else {
        map.dragging.enable()
      }
    }

    map.on('zoomend', enforceZoomState)
    enforceZoomState()
    return () => map.off('zoomend', enforceZoomState)
  }, [map])

  return null
}

function magnitudeColor(magnitude) {
  if (magnitude >= 5) return mapColors.red
  if (magnitude >= 3.5) return mapColors.orange
  return mapColors.sandstone
}

export default function EventMap({ layer, events, swarms, highlightEvents, selected, onSelect }) {
  return (
    <MapContainer
      className="event-map"
      center={[18, 8]}
      zoom={2}
      minZoom={2}
      maxBounds={[[-85, -180], [85, 180]]}
      maxBoundsViscosity={1}
      keyboard={false}
      scrollWheelZoom
      preferCanvas
    >
      <InvalidateMapSize />
      <LockWorldViewAtMinimumZoom />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterMap selected={selected} />
      {layer === 'events' && events.map((event) => (
        <CircleMarker
          key={event.id}
          center={[event.lat, event.lon]}
          radius={Math.max(4, Math.min(13, 3 + event.mag * 1.5))}
          pathOptions={{ color: mapColors.graphite, weight: 1, fillColor: magnitudeColor(event.mag), fillOpacity: 0.82 }}
          eventHandlers={{ click: () => onSelect({ type: 'event', data: event, position: [event.lat, event.lon] }) }}
        >
          <Tooltip>{`M ${event.mag.toFixed(1)} · ${event.place || 'Location not available'}`}</Tooltip>
        </CircleMarker>
      ))}
      {layer === 'swarms' && swarms.map((swarm) => {
        const [lon, lat] = swarm.centroid.coordinates
        const position = [lat, lon]
        const title = swarm.label || 'Earthquake cluster'
        return swarm.kind === 'mainshock_sequence' ? (
          <Marker
            key={swarm._id}
            position={position}
            icon={sequenceIcon}
            eventHandlers={{ click: () => onSelect({ type: 'swarm', data: swarm, position }) }}
          >
            <Tooltip>{`Mainshock sequence · ${title}`}</Tooltip>
          </Marker>
        ) : (
          <CircleMarker
            key={swarm._id}
            center={position}
            radius={Math.max(7, Math.min(16, 5 + Math.sqrt(swarm.n_events)))}
            pathOptions={{ color: mapColors.graphite, weight: 1.5, fillColor: mapColors.slate, fillOpacity: 0.82 }}
            eventHandlers={{ click: () => onSelect({ type: 'swarm', data: swarm, position }) }}
          >
            <Tooltip>{`Swarm · ${title}`}</Tooltip>
          </CircleMarker>
        )
      })}
      {layer === 'swarms' && highlightEvents?.map((event) => (
        <CircleMarker
          key={`member-${event.id}`}
          center={[event.lat, event.lon]}
          radius={5}
          pathOptions={{ color: mapColors.graphite, weight: 1, fillColor: mapColors.orange, fillOpacity: 1 }}
        >
          <Tooltip>{`Cluster event · M ${Number(event.mag).toFixed(1)}`}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
