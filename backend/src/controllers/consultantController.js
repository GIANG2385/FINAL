import { db } from '../firebaseAdmin.js'
import { getChatCompletion } from '../services/cohereClient.js'
import { getHistoricalBaseline } from '../services/historicalBaseline.js'

const HISTORY_LIMIT = 10

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

async function buildDataSnapshot() {
  // Server-side range filter (not status-filtered, to avoid needing a
  // composite index) — orders now holds 10,000+ historical rows, so an
  // unfiltered full-collection scan here would be extremely costly.
  const ordersSnap = await db.collection('orders').where('served_at', '>=', startOfToday()).get()
  const revenue = ordersSnap.docs.reduce((sum, doc) => {
    const order = doc.data()
    if (order.status !== 'served') return sum
    return sum + (order.total_amount || 0)
  }, 0)

  const inventorySnap = await db.collection('inventory').get()
  const atRiskItems = inventorySnap.docs
    .map((d) => d.data())
    .map((item) => {
      const hourlyConsumption = (item.avg_daily_consumption || 0) / 24
      const hoursRemaining = hourlyConsumption > 0 ? item.current_stock / hourlyConsumption : null
      return { ...item, hoursRemaining }
    })
    .filter((item) => item.hoursRemaining !== null && item.hoursRemaining <= 6)
    .map(
      (item) =>
        `${item.name_en} (${item.current_stock} ${item.unit} left, ~${Math.round(item.hoursRemaining)}h remaining)`
    )

  const insightsSnap = await db.collection('insights').get()
  const activeInsights = insightsSnap.docs
    .map((d) => d.data())
    .filter((i) => i.status !== 'acted_on')
    .map((i) => i.summary_en)

  const baseline = await getHistoricalBaseline()
  const weekday = new Date().getDay()
  const typicalToday = baseline.byWeekday[weekday] || 0
  const vsTypical =
    typicalToday > 0 ? Math.round(((revenue - typicalToday) / typicalToday) * 100) : null

  return [
    `Today's revenue so far: ${revenue.toLocaleString('en-US')} VND.`,
    typicalToday > 0
      ? `Historical average revenue for this day of week (based on ${baseline.distinctDays} days of past data): ${typicalToday.toLocaleString('en-US')} VND — today is currently ${vsTypical >= 0 ? '+' : ''}${vsTypical}% versus that typical level (note: a partial day so far will naturally read below 100% until the day ends).`
      : 'No historical baseline data available yet to compare today against.',
    atRiskItems.length > 0
      ? `Inventory items at risk of running out soon: ${atRiskItems.join('; ')}.`
      : 'No inventory items currently at risk of stockout.',
    activeInsights.length > 0
      ? `Active AI-generated insights: ${activeInsights.join(' | ')}.`
      : 'No active AI-generated insights right now.',
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
