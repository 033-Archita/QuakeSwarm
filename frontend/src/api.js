const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiRequest(path, params = {}, options = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  }

  const suffix = query.size ? `?${query.toString()}` : ''
  let response
  try {
    response = await fetch(`${API_BASE}${path}${suffix}`, {
      headers: { Accept: 'application/json' },
      signal: options.signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError('Could not reach the QuakeSwarm API.', 0)
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status}).`
    try {
      const body = await response.json()
      detail = body.detail || detail
    } catch {
      // Keep the HTTP status message when the response body is not JSON.
    }
    throw new ApiError(detail, response.status)
  }
  return response.json()
}

// Static public data still uses this shared request module so page code does
// not introduce a second fetch helper.
export async function assetRequest(path, options = {}) {
  try {
    const response = await fetch(path, { headers: { Accept: 'application/json' }, signal: options.signal })
    if (!response.ok) throw new ApiError(`Static data request failed (${response.status}).`, response.status)
    return response.json()
  } catch (error) {
    if (error.name === 'AbortError') throw error
    if (error instanceof ApiError) throw error
    throw new ApiError('Could not load the country boundary data.', 0)
  }
}
