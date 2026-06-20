// One-off precompute: scans the historical (pre-today) served orders ONCE
// and stores the resulting baseline in a single Firestore doc, so live
// requests don't re-scan the entire orders collection on every call.
// Re-run this manually if more historical data is loaded later.
import 'dotenv/config'
import { db } from '../firebaseAdmin.js'

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const cutoff = startOfToday()
const ordersSnap = await db
  .collection('orders')
  .where('served_at', '<', cutoff)
  .get()

const dayRevenue = new Map()
const dayCountByWeekday = new Map()
const weekdayRevenue = new Map()
const hourRevenue = new Map()
const hourDayCount = new Map()

for (const doc of ordersSnap.docs) {
  const order = doc.data()
  if (order.status !== 'served') continue
  const servedAt = order.served_at?.toDate ? order.served_at.toDate() : new Date(order.served_at)

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

const baseline = { distinctDays, avgDailyRevenue, byWeekday, byHour, computed_at: new Date() }

await db.collection('analytics').doc('historical_baseline').set(baseline)
console.log(`Computed baseline from ${ordersSnap.size} historical orders across ${distinctDays} days.`)
console.log('avgDailyRevenue:', avgDailyRevenue)
process.exit(0)
