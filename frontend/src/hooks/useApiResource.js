import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../api.js'

export default function useApiResource(path, params, enabled = true) {
  const queryKey = JSON.stringify(params)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setData(null)
      setLoading(false)
      setError(null)
      return undefined
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    apiRequest(path, JSON.parse(queryKey), { signal: controller.signal })
      .then(setData)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [enabled, path, queryKey, retryCount])

  const retry = useCallback(() => setRetryCount((count) => count + 1), [])
  return { data, loading, error, retry }
}
