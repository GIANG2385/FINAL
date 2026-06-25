// src/controllers/insightsController.js
import { supabase } from '../supabaseClient.js'
import { forecastStockout, forecastKitchenOverload } from '../services/riskForecast.js'
import { analyzeRootCause } from '../services/rootCauseEngine.js'
import { recommendationFor } from '../services/recommendationEngine.js'
import { getHistoricalBaseline, typicalRevenueForWindow } from '../services/historicalBaseline.js'

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

async function hasRecentOpenInsight(type, matchKey, matchValue) {
  const { data, error } = await supabase
    .from('insights')
    .select('status, created_at, related_entities')
    .eq('type', type)
  if (error) throw new Error(error.message)
  const cutoff = Date.now() - 30 * 60 * 1000
  return (data || []).some((row) => {
    if (row.status === 'acted_on') return false
    const createdAt = toDate(row.created_at)
    if (!createdAt || createdAt.getTime() < cutoff) return false
    return row.related_entities?.[matchKey] === matchValue
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
  const { data: inventoryRows, error: invErr } = await supabase
    .from('inventory')
    .select('*')
  if (invErr) throw new Error(invErr.message)

  for (const item of inventoryRows || []) {
    const hourlyConsumption = (item.avg_daily_consumption || 0) / 24
    const hours_remaining = hourlyConsumption > 0 ? item.current_stock / hourlyConsumption : null
    const draft = forecastStockout({ ...item, hours_remaining })
    if (!draft) continue
    if (await hasRecentOpenInsight('risk_forecast', 'sku', item.sku)) continue
    created.push(appendRecommendation(draft))
  }

  // --- Risk forecast: kitchen overload ---
  const { data: queueRows, error: qErr } = await supabase
    .from('kitchen_queue')
    .select('*')
    .neq('status', 'ready')
  if (qErr) throw new Error(qErr.message)

  const activeQueue = queueRows || []
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

  // --- Root cause: revenue in the last 2h vs the historical baseline for this time of day ---
  const now = Date.now()
  const recentCutoff = new Date(now - 120 * 60000)
  const { data: recentOrders, error: recentErr } = await supabase
    .from('orders')
    .select('total_amount')
    .eq('status', 'served')
    .gte('served_at', recentCutoff.toISOString())
  if (recentErr) throw new Error(recentErr.message)
  const recentRevenue = (recentOrders || []).reduce((s, o) => s + (o.total_amount || 0), 0)

  const baseline = await getHistoricalBaseline()
  const baselineRevenue = typicalRevenueForWindow(baseline, new Date(now).getHours() - 1, 2)

  const stockoutSkus = (inventoryRows || [])
    .filter((item) => item.current_stock <= 0)
    .map((item) => item.sku)

  const rootCauseDraft = analyzeRootCause({
    recentRevenue,
    baselineRevenue,
    stockoutSkus,
    kitchenOverloaded: activeQueue.length >= 5,
    complaintCount: 0,
  })
  if (
    rootCauseDraft &&
    !(await hasRecentOpenInsight(
      'root_cause',
      'kitchen_overloaded',
      rootCauseDraft.related_entities.kitchen_overloaded,
    ))
  ) {
    created.push(appendRecommendation(rootCauseDraft))
  }

  if (created.length > 0) {
    const rows = created.map((insight) => ({
      id: crypto.randomUUID(),
      ...insight,
      created_at: new Date().toISOString(),
      status: 'new',
    }))
    const { error: insertErr } = await supabase.from('insights').insert(rows)
    if (insertErr) throw new Error(insertErr.message)
  }

  return created.length
}

export async function runAnalysis(req, res) {
  const count = await runAnalysisInternal()
  res.json({ created: count })
}

export async function listInsights(req, res) {
  const { type, severity, status } = req.query
  let query = supabase.from('insights').select('*')
  if (type) query = query.eq('type', type)
  if (severity) query = query.eq('severity', severity)
  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
}

export async function acknowledgeInsight(req, res) {
  const { id } = req.params

  // Check user role from Supabase users table
  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('uid', req.user.uid)
    .single()
  const role = userRow?.role ?? null
  if (!['manager', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Only manager/admin can acknowledge insights' })
  }

  const { data: existing } = await supabase
    .from('insights')
    .select('id')
    .eq('id', id)
    .single()
  if (!existing) return res.status(404).json({ error: 'Insight not found' })

  const { data: updated, error: updateErr } = await supabase
    .from('insights')
    .update({ status: 'acknowledged' })
    .eq('id', id)
    .select()
    .single()
  if (updateErr) return res.status(500).json({ error: updateErr.message })

  res.json(updated)
}
