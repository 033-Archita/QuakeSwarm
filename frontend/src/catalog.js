export const CATALOG_START = '2015-01-01'
export const CATALOG_END = '2025-12-31'
export const MIN_CATALOG_MAGNITUDE = 2.5
export const MAGNITUDE_FILTER_OPTIONS = [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
// These display values mirror backend/config.py's detection defaults.
export const CLUSTER_SPACE_KM = 15
export const CLUSTER_TIME_DAYS = 7
export const CLUSTER_MIN_EVENTS = 20
export const CLUSTER_MAG_GAP_THRESHOLD = 1.2

export function clampCatalogDate(value) {
  if (!value) return CATALOG_START
  return value < CATALOG_START ? CATALOG_START : value > CATALOG_END ? CATALOG_END : value
}

export function normalizeDateRange(start, end, changedField) {
  let safeStart = clampCatalogDate(start)
  let safeEnd = clampCatalogDate(end)
  if (safeStart > safeEnd) {
    if (changedField === 'start') safeEnd = safeStart
    else safeStart = safeEnd
  }
  return { start: safeStart, end: safeEnd }
}
