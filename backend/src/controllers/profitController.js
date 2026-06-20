import { db } from '../firebaseAdmin.js'
import { getHistoricalBaseline } from '../services/historicalBaseline.js'

// Profit snapshot — rule-based estimate, not real cost accounting.
// food_cost is assumed as a flat % of revenue (no per-ingredient cost data
// in the MVP data model); labor_cost is shift hours × an assumed hourly
// wage. See PangPang_SmartOps_AI_Build_Instructions.md §6 for the
// "simulated AI / rule-based" framing this mirrors.
const ASSUMED_FOOD_COST_PCT = 0.32
const ASSUMED_HOURLY_WAGE_VND = 25000

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

  // Range-filtered server-side (not status-filtered, to avoid needing a
  // composite index) — the orders collection holds 10,000+ historical rows,
  // so an unfiltered full-collection scan here would be extremely costly.
  const ordersSnap = await db.collection('orders').where('served_at', '>=', cutoff).get()
  const revenue = ordersSnap.docs.reduce((sum, doc) => {
    const order = doc.data()
    if (order.status !== 'served') return sum
    return sum + (order.total_amount || 0)
  }, 0)

  // Historical daily average (from pre-today data) scaled to this range's
  // length, so the live figure can be compared against a real benchmark
  // instead of reported in isolation.
  const baseline = await getHistoricalBaseline()
  const historical_avg_revenue = baseline.avgDailyRevenue * RANGE_DAYS[range]

  const shiftsSnap = await db.collection('staff_shifts').get()
  const labor_cost = shiftsSnap.docs.reduce((sum, doc) => {
    const shift = doc.data()
    const start = shift.shift_start?.toDate ? shift.shift_start.toDate() : new Date(shift.shift_start)
    const end = shift.shift_end?.toDate ? shift.shift_end.toDate() : new Date(shift.shift_end)
    const hours = Math.max(0, (end - start) / (1000 * 60 * 60))
    return sum + hours * ASSUMED_HOURLY_WAGE_VND
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
