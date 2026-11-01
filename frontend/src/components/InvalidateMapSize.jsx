import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

export default function InvalidateMapSize() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    let frame = 0
    const invalidate = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        map.invalidateSize({ pan: false, debounceMoveend: true })
      })
    }
    const observer = new ResizeObserver(invalidate)

    observer.observe(container)
    invalidate()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [map])

  return null
}
