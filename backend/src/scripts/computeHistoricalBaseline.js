// src/scripts/computeHistoricalBaseline.js
// One-off precompute: scans pre-today served orders and stores a baseline in
// Supabase analytics_baseline. Re-run if more historical data is added.
import 'dotenv/config'
import { supabase } from '../supabaseClient.js'

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const cutoff = startOfToday()
const { data: allOrders, error } = await supabase
  .from('orders')
  .select('served_at, total_amount, status')
  .eq('status', 'served')
  .lt('served_at', cutoff.toISOString())
if (error) { console.error(error.message); process.exit(1) }

const dayRevenue = new Map()
const dayCountByWeekday = new Map()
const weekdayRevenue = new Map()
const hourRevenue = new Map()
const hourDayCount = new Map()

for (const order of allOrders) {
  if (order.status !== 'served') continue
  const servedAt = new Date(order.served_at)

  const dateKey = servedAt.toDateString()
  const weekday = servedAt.getDay()
  const hour = servedAt.getHours()
  const amount = order.total_amount || 0

  dayRevenue.set(dateKey, (dayRevenue.get(dateKey) || 0) + amount)
  weekdayRevenue.set(weekday, (weekdayRevenue.get(weekday) || 0) + amount)
  hourRevenue.set(hour, (hourRevenue.get(hour) || 0) + amount)

  if (!dayCountByWeekday.has(weekday)) dayCountByWeekday.set(weekday, new Set())
  dayCountByWeekday.get(weekday).add(dateKey)

  if (!hourDayCount.has(hour)) hourDayCount.set(hour, new Set())
  hourDayCount.get(hour).add(dateKey)
}

const distinctDays = dayRevenue.size
const avgDailyRevenue = distinctDays > 0
  ? Math.round([...dayRevenue.values()].reduce((s, v) => s + v, 0) / distinctDays)
  : 0

const byWeekday = {}
for (let w = 0; w < 7; w++) {
  const days = dayCountByWeekday.get(w)?.size || 0
  byWeekday[w] = days > 0 ? Math.round((weekdayRevenue.get(w) || 0) / days) : 0
}

const byHour = {}
for (let h = 0; h < 24; h++) {
  const days = hourDayCount.get(h)?.size || 0
  byHour[h] = days > 0 ? Math.round((hourRevenue.get(h) || 0) / days) : 0
}

const { error: upsertErr } = await supabase
  .from('analytics_baseline')
  .upsert({
    id: 'historical_baseline',
    distinct_days: distinctDays,
    avg_daily_revenue: avgDailyRevenue,
    by_weekday: byWeekday,
    by_hour: byHour,
    computed_at: new Date().toISOString(),
  })
if (upsertErr) { console.error(upsertErr.message); process.exit(1) }

console.log(`Computed baseline from ${allOrders.length} historical orders across ${distinctDays} days.`)
console.log('avgDailyRevenue:', avgDailyRevenue)
process.exit(0)
