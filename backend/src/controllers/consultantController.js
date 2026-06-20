import { db } from '../firebaseAdmin.js'
import { getChatCompletion } from '../services/openaiClient.js'

const HISTORY_LIMIT = 10

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

function isToday(date) {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

async function buildDataSnapshot() {
  const ordersSnap = await db.collection('orders').where('status', '==', 'served').get()
  const revenue = ordersSnap.docs.reduce((sum, doc) => {
    const order = doc.data()
    const servedAt = toDate(order.served_at)
    if (servedAt && isToday(servedAt)) return sum + (order.total_amount || 0)
    return sum
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

  return [
    `Today's revenue so far: ${revenue.toLocaleString('en-US')} VND.`,
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
