import { db } from '../firebaseAdmin.js'

// Profit snapshot — rule-based estimate, not real cost accounting.
// food_cost is assumed as a flat % of revenue (no per-ingredient cost data
// in the MVP data model); labor_cost is shift hours × an assumed hourly
// wage. See PangPang_SmartOps_AI_Build_Instructions.md §6 for the
// "simulated AI / rule-based" framing this mirrors.
const ASSUMED_FOOD_COST_PCT = 0.32
const ASSUMED_HOURLY_WAGE_VND = 25000

function isToday(date) {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export async function getProfitSummary(req, res) {
  // 'week' isn't meaningfully different yet — the MVP only has "today's"
  // seeded data, so both ranges report the same window for now.
  const range = req.query.range === 'week' ? 'week' : 'day'

  const ordersSnap = await db.collection('orders').where('status', '==', 'served').get()
  const revenue = ordersSnap.docs.reduce((sum, doc) => {
    const order = doc.data()
    const servedAt = order.served_at?.toDate ? order.served_at.toDate() : order.served_at ? new Date(order.served_at) : null
    if (servedAt && isToday(servedAt)) return sum + (order.total_amount || 0)
    return sum
  }, 0)

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
  })
}
