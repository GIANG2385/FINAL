// src/controllers/profitController.js
import { supabase } from '../supabaseClient.js'
import { getHistoricalBaseline } from '../services/historicalBaseline.js'

// Profit snapshot — rule-based estimate, not real cost accounting.
// food_cost is assumed as a flat % of revenue (no per-ingredient cost data
// in the MVP data model); labor_cost is shift hours × role-based hourly wage.
// Wages derived from monthly salary midpoints ÷ 208 working hours/month:
//   chef 15M → ~72,000  |  kitchen_assistant 8M → ~38,500
//   server 7M → ~33,700  |  cleaner 6.25M → ~30,000  |  manager 20M → ~96,200
const ASSUMED_FOOD_COST_PCT = 0.32
const HOURLY_WAGE_BY_ROLE = {
  chef:              72000,
  kitchen_assistant: 38500,
  server:            33700,
  cleaner:           30000,
  manager:           96200,
}
const DEFAULT_HOURLY_WAGE = 35000

const RANGE_DAYS = { day: 1, week: 7, month: 30 }

function startOfRange(range) {
  const days = RANGE_DAYS[range] ?? 1
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (days - 1))
  return cutoff
}

export async function getProfitSummary(req, res) {
  const range = ['day', 'week', 'month'].includes(req.query.range) ? req.query.range : 'day'
  const cutoff = startOfRange(range)

  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('total_amount, status')
    .eq('status', 'served')
    .gte('served_at', cutoff.toISOString())
  if (ordersErr) return res.status(500).json({ error: ordersErr.message })

  const revenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)

  // Historical daily average (from pre-today data) scaled to this range's
  // length, so the live figure can be compared against a real benchmark
  // instead of reported in isolation.
  const baseline = await getHistoricalBaseline()
  const historical_avg_revenue = baseline.avgDailyRevenue * RANGE_DAYS[range]

  const { data: shifts, error: shiftsErr } = await supabase
    .from('staff_shifts')
    .select('shift_start, shift_end, role')
  if (shiftsErr) return res.status(500).json({ error: shiftsErr.message })

  const labor_cost = (shifts || []).reduce((sum, shift) => {
    const start = new Date(shift.shift_start)
    const end = new Date(shift.shift_end)
    const hours = Math.max(0, (end - start) / (1000 * 60 * 60))
    const wage = HOURLY_WAGE_BY_ROLE[shift.role] ?? DEFAULT_HOURLY_WAGE
    return sum + hours * wage
  }, 0)

  const food_cost = Math.round(revenue * ASSUMED_FOOD_COST_PCT)
  const profit = revenue - food_cost - labor_cost

  res.json({
    range,
    revenue,
    food_cost,
    labor_cost: Math.round(labor_cost),
    profit: Math.round(profit),
    historical_avg_revenue,
  })
}
