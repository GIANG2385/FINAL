import { db } from '../firebaseAdmin.js'
import { getChatCompletion } from '../services/cohereClient.js'
import { getHistoricalBaseline } from '../services/historicalBaseline.js'

const HISTORY_LIMIT = 10

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

// Static representative data for collections not yet in Firestore.
// Mirrors the sample data shown in the frontend UI (BackOfHouse.jsx).
const STATIC_SUPPLIERS = [
  { name: 'Chị Lan — Chợ Hôm', reliability: 95, nextShortfall: 'Thịt bò (~1.5 ngày)' },
  { name: 'Anh Tuấn — Chợ Đồng Xuân', reliability: 82, nextShortfall: null },
  { name: 'Cty Minh Tâm', reliability: 68, nextShortfall: 'Bánh phở (~3 ngày)' },
]

const STATIC_CHANNELS = [
  { name: 'Dine-in', orders: 48, revenue: 6240000 },
  { name: 'Takeaway', orders: 15, revenue: 1350000 },
  { name: 'GrabFood', orders: 22, revenue: 2090000 },
  { name: 'ShopeeFood', orders: 9, revenue: 855000 },
]

async function buildDataSnapshot() {
  const today = startOfToday()
  const now = new Date()

  // ── Revenue (today's served orders) ──────────────────────────────────────
  // Server-side range filter (not status-filtered, to avoid needing a
  // composite index) — orders holds 10,000+ historical rows.
  const ordersSnap = await db.collection('orders').where('served_at', '>=', today).get()
  const todayOrders = ordersSnap.docs.map((d) => d.data())
  const revenue = todayOrders.reduce((sum, o) => (o.status === 'served' ? sum + (o.total_amount || 0) : sum), 0)
  const covers = todayOrders.filter((o) => o.status === 'served').length
  const avgTicket = covers > 0 ? Math.round(revenue / covers) : 0

  // Top items by quantity sold today
  const itemCounts = {}
  for (const order of todayOrders) {
    if (order.status !== 'served') continue
    for (const item of order.items || []) {
      const key = item.name_en || item.sku || 'unknown'
      itemCounts[key] = (itemCounts[key] || 0) + (item.qty || 1)
    }
  }
  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, sold]) => ({ name, sold }))

  // ── Historical baseline ───────────────────────────────────────────────────
  const baseline = await getHistoricalBaseline()
  const weekday = now.getDay()
  const typicalToday = baseline.byWeekday[weekday] || 0
  const vsTypical = typicalToday > 0 ? Math.round(((revenue - typicalToday) / typicalToday) * 100) : null

  // ── Inventory ─────────────────────────────────────────────────────────────
  const inventorySnap = await db.collection('inventory').get()
  const inventory = inventorySnap.docs.map((d) => {
    const item = d.data()
    const hourlyConsumption = (item.avg_daily_consumption || 0) / 24
    const hoursRemaining = hourlyConsumption > 0 ? item.current_stock / hourlyConsumption : null
    return {
      name: item.name_en,
      stock: item.current_stock,
      unit: item.unit,
      threshold: item.par_level,
      status: hoursRemaining !== null && hoursRemaining <= 6 ? 'at_risk' : 'ok',
      hoursRemaining: hoursRemaining !== null ? Math.round(hoursRemaining) : null,
    }
  })

  // ── Tables ────────────────────────────────────────────────────────────────
  const tablesSnap = await db.collection('tables').get()
  const tables = tablesSnap.docs.map((d) => {
    const t = d.data()
    return { id: t.table_id, status: t.status }
  })
  const occupiedCount = tables.filter((t) => t.status === 'dining' || t.status === 'reserved').length

  // ── Kitchen queue (active orders) ─────────────────────────────────────────
  const queueSnap = await db.collection('kitchen_queue').get()
  const queueItems = queueSnap.docs.map((d) => d.data())
  const pendingCount = queueItems.filter((q) => q.status === 'pending').length
  const inKitchenItems = queueItems.filter((q) => q.status === 'in_progress' || q.status === 'in_kitchen')
  const delayedCount = inKitchenItems.filter((q) => {
    const queuedAt = toDate(q.queued_at)
    return queuedAt && (now - queuedAt) / 60000 > 20
  }).length

  // ── Staff shifts ──────────────────────────────────────────────────────────
  const shiftsSnap = await db.collection('staff_shifts').get()
  const allShifts = shiftsSnap.docs.map((d) => d.data())
  const onShiftNow = allShifts.filter((s) => {
    const start = toDate(s.shift_start)
    const end = toDate(s.shift_end)
    return start && end && start <= now && now <= end
  })

  // ── Reservations (today) ──────────────────────────────────────────────────
  const reservationsSnap = await db.collection('reservations').get()
  const todayReservations = reservationsSnap.docs
    .map((d) => d.data())
    .filter((r) => {
      const t = toDate(r.reservation_time)
      return t && t >= today
    })
  const confirmedToday = todayReservations.filter((r) => r.status === 'confirmed')
  const nextArrival = confirmedToday
    .map((r) => toDate(r.reservation_time))
    .filter((t) => t && t > now)
    .sort((a, b) => a - b)[0]

  // ── Loyalty (derived from all reservations) ───────────────────────────────
  const allReservationsSnap = await db.collection('reservations').get()
  const guestVisits = {}
  for (const doc of allReservationsSnap.docs) {
    const r = doc.data()
    if (r.status === 'cancelled') continue
    guestVisits[r.guest_name] = (guestVisits[r.guest_name] || 0) + 1
  }
  const repeatGuests = Object.values(guestVisits).filter((v) => v >= 2)
  const totalMembers = repeatGuests.length
  // "at risk" = guests with exactly 1–3 visits in last month — approximate with visit count
  const atRiskCount = repeatGuests.filter((v) => v < 4).length
  const avgVisitsPerMonth = totalMembers > 0 ? Math.round(repeatGuests.reduce((s, v) => s + v, 0) / totalMembers) : 0

  // ── Insights ──────────────────────────────────────────────────────────────
  const insightsSnap = await db.collection('insights').get()
  const activeInsights = insightsSnap.docs
    .map((d) => d.data())
    .filter((i) => i.status !== 'acted_on')
    .map((i) => i.summary_en)

  // ── Assemble structured snapshot ──────────────────────────────────────────
  const dataSnapshot = {
    today: {
      revenue: {
        total: revenue,
        vsTypicalPct: vsTypical,
        historicalAvg: typicalToday,
        byChannel: STATIC_CHANNELS,
      },
      covers,
      avgTicket,
      tablesOccupied: occupiedCount,
      totalTables: tables.length,
      activeAlerts: activeInsights.length,
    },
    inventory: inventory.map(({ name, stock, unit, threshold, status, hoursRemaining }) => ({
      name, stock, unit, threshold, status, hoursRemaining,
    })),
    tables: tables.map(({ id, status }) => ({ id, status })),
    orders: {
      pending: pendingCount,
      inKitchen: inKitchenItems.length,
      delayed: delayedCount,
    },
    staff: {
      onShiftNow: onShiftNow.length,
      scheduledToday: allShifts.length,
    },
    reservations: {
      todayCount: todayReservations.length,
      confirmedCount: confirmedToday.length,
      nextArrival: nextArrival
        ? nextArrival.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : null,
      peakForecast: '18:30–20:00 based on historical booking patterns',
    },
    suppliers: STATIC_SUPPLIERS,
    loyalty: { totalMembers, atRiskCount, avgVisitsPerMonth },
    topItems,
  }

  // ── Format as readable text for the system prompt ─────────────────────────
  const atRiskInv = inventory.filter((i) => i.status === 'at_risk')

  return [
    `=== RESTAURANT OPERATIONS SNAPSHOT (${now.toLocaleString('en-US')}) ===`,
    '',
    `REVENUE: ${revenue.toLocaleString('en-US')} VND today (${covers} covers, avg ticket ${avgTicket.toLocaleString('en-US')} VND).`,
    typicalToday > 0
      ? `vs. historical average for this weekday: ${typicalToday.toLocaleString('en-US')} VND (${vsTypical >= 0 ? '+' : ''}${vsTypical}%).`
      : 'No historical baseline available yet.',
    '',
    `TABLES: ${occupiedCount}/${tables.length} occupied. Status breakdown: ${
      ['open', 'reserved', 'dining', 'cleanup']
        .map((s) => `${s}: ${tables.filter((t) => t.status === s).length}`)
        .join(', ')
    }.`,
    '',
    `KITCHEN QUEUE: ${pendingCount} pending, ${inKitchenItems.length} in kitchen, ${delayedCount} delayed (>20 min).`,
    '',
    `STAFF: ${onShiftNow.length} on shift now out of ${allShifts.length} scheduled today.`,
    '',
    `RESERVATIONS: ${todayReservations.length} today (${confirmedToday.length} confirmed). Next arrival: ${
      nextArrival ? nextArrival.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'none'
    }. Peak forecast: 18:30–20:00.`,
    '',
    `INVENTORY: ${
      atRiskInv.length > 0
        ? `AT RISK — ${atRiskInv.map((i) => `${i.name} (${i.stock} ${i.unit}, ~${i.hoursRemaining}h left)`).join('; ')}.`
        : 'All items OK.'
    }`,
    '',
    `SALES CHANNELS (today, sample): ${STATIC_CHANNELS.map((c) => `${c.name}: ${c.orders} orders, ${c.revenue.toLocaleString('en-US')} VND`).join(' | ')}.`,
    '',
    `SUPPLIERS: ${STATIC_SUPPLIERS.map((s) => `${s.name} (${s.reliability}% on-time${s.nextShortfall ? `, shortfall risk: ${s.nextShortfall}` : ''})`).join(' | ')}.`,
    '',
    `LOYALTY: ${totalMembers} repeat members tracked. ${atRiskCount} at risk of churn (< 4 visits). Avg ${avgVisitsPerMonth} visits/member.`,
    '',
    topItems.length > 0
      ? `TOP ITEMS TODAY: ${topItems.map((i) => `${i.name} (${i.sold} sold)`).join(', ')}.`
      : 'No completed orders yet today.',
    '',
    activeInsights.length > 0
      ? `ACTIVE AI INSIGHTS: ${activeInsights.join(' | ')}.`
      : 'No active AI-generated insights.',
    '',
    `RAW JSON (for precise queries): ${JSON.stringify(dataSnapshot)}`,
  ].join('\n')
}

export async function sendMessage(req, res) {
  const { message } = req.body
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' })
  }

  const userDoc = await db.collection('users').doc(req.user.uid).get()
  const role = userDoc.exists ? userDoc.data().role : null
  if (!['manager', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Only manager/admin can use the AI Consultant' })
  }

  const messagesRef = db.collection('consultant_conversations').doc(req.user.uid).collection('messages')

  await messagesRef.add({ role: 'user', content: message, created_at: new Date() })

  const historySnap = await messagesRef.orderBy('created_at', 'desc').limit(HISTORY_LIMIT).get()
  const history = historySnap.docs
    .map((d) => d.data())
    .reverse()
    .map((m) => ({ role: m.role, content: m.content }))

  const snapshot = await buildDataSnapshot()

  let reply
  try {
    reply = await getChatCompletion([
      {
        role: 'system',
        content: `You are an AI Operations Consultant for Pang Pang Restaurant, a Thai casual dining restaurant. Help the owner understand what is happening in their business and why. Answer only in English. Be concise and specific, referencing the data below when relevant.\n\n${snapshot}`,
      },
      ...history,
    ])
  } catch (err) {
    return res.status(502).json({ error: 'AI Consultant is temporarily unavailable' })
  }

  await messagesRef.add({ role: 'assistant', content: reply, created_at: new Date() })

  res.json({ reply })
}
