// src/services/historicalBaseline.js
// Reads from Supabase analytics_baseline table (single row id='historical_baseline').
import { supabase } from '../supabaseClient.js'

const CACHE_TTL_MS = 60 * 60 * 1000
let cache = null
let cachedAt = 0

const EMPTY_BASELINE = { distinctDays: 0, avgDailyRevenue: 0, byWeekday: {}, byHour: {} }

export async function getHistoricalBaseline() {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache

  const { data, error } = await supabase
    .from('analytics_baseline')
    .select('*')
    .eq('id', 'historical_baseline')
    .single()

  if (error || !data) {
    cache = EMPTY_BASELINE
  } else {
    cache = {
      distinctDays: data.distinct_days,
      avgDailyRevenue: data.avg_daily_revenue,
      byWeekday: data.by_weekday || {},
      byHour: data.by_hour || {},
    }
  }
  cachedAt = Date.now()
  return cache
}

export function typicalRevenueForWindow(baseline, startHour, windowHours) {
  let total = 0
  for (let i = 0; i < windowHours; i++) {
    const hour = (startHour + i + 24) % 24
    total += baseline.byHour[hour] || 0
  }
  return total
}
