function ringContains([longitude, latitude], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const crossesLatitude = (yi > latitude) !== (yj > latitude)
    if (crossesLatitude && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function geometryContains(feature, point) {
  const { type, coordinates } = feature.geometry
  const polygons = type === 'Polygon' ? [coordinates] : type === 'MultiPolygon' ? coordinates : []
  return polygons.some((polygon) => ringContains(point, polygon[0]) && !polygon.slice(1).some((hole) => ringContains(point, hole)))
}

export function createGeographyLookup(geojson) {
  const features = geojson?.features || []
  const continentNames = [...new Set(features.map((feature) => feature.properties.CONTINENT).filter((name) => name && name !== 'Seven seas (open ocean)'))].sort()
  return {
    continents: continentNames,
    findCountry(longitude, latitude) {
      const point = [longitude, latitude]
      return features.find((feature) => geometryContains(feature, point))?.properties || null
    },
  }
}
