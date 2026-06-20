// Reads the historical revenue baseline precomputed by
// backend/src/scripts/computeHistoricalBaseline.js (stored at
// analytics/historical_baseline) instead of re-scanning the entire
// orders collection on every request — the orders collection now holds
// 10,000+ historical rows, so a live full-collection scan on every
// request/scheduler tick would blow through the Firestore free-tier
// read quota in minutes.
import { db } from '../firebaseAdmin.js'

const CACHE_TTL_MS = 60 * 60 * 1000
let cache = null
let cachedAt = 0

const EMPTY_BASELINE = { distinctDays: 0, avgDailyRevenue: 0, byWeekday: {}, byHour: {} }

export async function getHistoricalBaseline() {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache

  const doc = await db.collection('analytics').doc('historical_baseline').get()
  cache = doc.exists ? doc.data() : EMPTY_BASELINE
  cachedAt = Date.now()
  return cache
}

// Typical revenue for an [hour, hour+windowHours) span of the day, based on
// historical per-hour averages — used as the "expected" comparison point
// for a given recent window instead of a naive same-day prior-window check.
export function typicalRevenueForWindow(baseline, startHour, windowHours) {
  let total = 0
  for (let i = 0; i < windowHours; i++) {
    const hour = (startHour + i + 24) % 24
    total += baseline.byHour[hour] || 0
  }
  return total
}
