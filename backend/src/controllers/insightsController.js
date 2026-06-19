import { db } from '../firebaseAdmin.js'
import { forecastStockout, forecastKitchenOverload } from '../services/riskForecast.js'
import { analyzeRootCause } from '../services/rootCauseEngine.js'
import { recommendationFor } from '../services/recommendationEngine.js'

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

async function hasRecentOpenInsight(type, matchKey, matchValue) {
  const snap = await db.collection('insights').where('type', '==', type).get()
  const cutoff = Date.now() - 30 * 60 * 1000
  return snap.docs.some((doc) => {
    const data = doc.data()
    if (data.status === 'acted_on') return false
    const createdAt = toDate(data.created_at)
    if (!createdAt || createdAt.getTime() < cutoff) return false
    return data.related_entities?.[matchKey] === matchValue
  })
}

function appendRecommendation(draft) {
  const rec = recommendationFor(draft)
  return {
    ...draft,
    summary_en: rec.en ? `${draft.summary_en} ${rec.en}` : draft.summary_en,
    summary_vi: rec.vi ? `${draft.summary_vi} ${rec.vi}` : draft.summary_vi,
  }
}

export async function runAnalysisInternal() {
  const created = []

  // --- Risk forecast: stockouts ---
  const inventorySnap = await db.collection('inventory').get()
  for (const doc of inventorySnap.docs) {
    const item = doc.data()
    const hourlyConsumption = (item.avg_daily_consumption || 0) / 24
    const hours_remaining = hourlyConsumption > 0 ? item.current_stock / hourlyConsumption : null
    const draft = forecastStockout({ ...item, hours_remaining })
    if (!draft) continue
    if (await hasRecentOpenInsight('risk_forecast', 'sku', item.sku)) continue
    created.push(appendRecommendation(draft))
  }

  // --- Risk forecast: kitchen overload ---
  const queueSnap = await db.collection('kitchen_queue').where('status', '!=', 'ready').get()
  const activeQueue = queueSnap.docs.map((d) => d.data())
  if (activeQueue.length > 0) {
    const now = Date.now()
    const elapsedList = activeQueue.map((q) => {
      const queuedAt = toDate(q.queued_at)
      return queuedAt ? (now - queuedAt.getTime()) / 60000 : 0
    })
    const avgElapsedMin = Math.round(elapsedList.reduce((s, v) => s + v, 0) / elapsedList.length)
    const targetMin = Math.round(
      activeQueue.reduce((s, q) => s + (q.prep_time_target_min || 15), 0) / activeQueue.length
    )
    const draft = forecastKitchenOverload({ queueDepth: activeQueue.length, avgElapsedMin, targetMin })
    if (draft) {
      draft.related_entities.overload = true
      if (!(await hasRecentOpenInsight('risk_forecast', 'overload', true))) {
        created.push(appendRecommendation(draft))
      }
    }
  }

  // --- Root cause: revenue dip in the last 2h vs the prior 2h ---
  const ordersSnap = await db.collection('orders').where('status', '==', 'served').get()
  const now = Date.now()
  let recentRevenue = 0
  let priorRevenue = 0
  for (const doc of ordersSnap.docs) {
    const order = doc.data()
    const servedAt = toDate(order.served_at)
    if (!servedAt || !isToday(servedAt)) continue
    const ageMin = (now - servedAt.getTime()) / 60000
    if (ageMin <= 120) recentRevenue += order.total_amount || 0
    else if (ageMin <= 240) priorRevenue += order.total_amount || 0
  }

  const stockoutSkus = inventorySnap.docs
    .map((d) => d.data())
    .filter((item) => item.current_stock <= 0)
    .map((item) => item.sku)

  const rootCauseDraft = analyzeRootCause({
    recentRevenue,
    priorRevenue,
    stockoutSkus,
    kitchenOverloaded: activeQueue.length >= 5,
    complaintCount: 0,
  })
  if (rootCauseDraft && !(await hasRecentOpenInsight('root_cause', 'kitchen_overloaded', rootCauseDraft.related_entities.kitchen_overloaded))) {
    created.push(appendRecommendation(rootCauseDraft))
  }

  const batch = db.batch()
  for (const insight of created) {
    const ref = db.collection('insights').doc()
    batch.set(ref, { ...insight, created_at: new Date(), status: 'new' })
  }
  if (created.length > 0) await batch.commit()

  return created.length
}

export async function runAnalysis(req, res) {
  const count = await runAnalysisInternal()
  res.json({ created: count })
}

export async function listInsights(req, res) {
  const { type, severity, status } = req.query
  let query = db.collection('insights')
  if (type) query = query.where('type', '==', type)
  if (severity) query = query.where('severity', '==', severity)
  if (status) query = query.where('status', '==', status)

  const snap = await query.get()
  const insights = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (toDate(b.created_at)?.getTime() ?? 0) - (toDate(a.created_at)?.getTime() ?? 0))
  res.json(insights)
}

export async function acknowledgeInsight(req, res) {
  const { id } = req.params
  const userDoc = await db.collection('users').doc(req.user.uid).get()
  const role = userDoc.exists ? userDoc.data().role : null
  if (!['manager', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Only manager/admin can acknowledge insights' })
  }

  const ref = db.collection('insights').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return res.status(404).json({ error: 'Insight not found' })

  await ref.update({ status: 'acknowledged' })
  const updated = await ref.get()
  res.json({ id, ...updated.data() })
}
