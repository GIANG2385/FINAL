// src/controllers/inventoryController.js
import { supabase } from '../supabaseClient.js'

// Consumption velocity + time-to-stockout projection.
// Rule-based estimate (current_stock / avg_daily_consumption), not ML —
// see PangPang_SmartOps_AI_Build_Instructions.md §6.
export async function getForecast(req, res) {
  const { data: rows, error } = await supabase.from('inventory').select('*')
  if (error) return res.status(500).json({ error: error.message })

  const now = Date.now()
  const forecast = (rows || []).map((item) => {
    const hourlyConsumption = (item.avg_daily_consumption || 0) / 24
    const hoursRemaining = hourlyConsumption > 0 ? item.current_stock / hourlyConsumption : null
    const stockoutAt = hoursRemaining !== null ? new Date(now + hoursRemaining * 60 * 60 * 1000) : null

    return {
      sku: item.sku,
      name_en: item.name_en,
      name_vi: item.name_vi,
      unit: item.unit,
      current_stock: item.current_stock,
      par_level: item.par_level,
      hours_remaining: hoursRemaining !== null ? Math.round(hoursRemaining * 10) / 10 : null,
      stockout_at: stockoutAt,
      at_risk: hoursRemaining !== null && hoursRemaining <= 6,
    }
  })

  forecast.sort((a, b) => (a.hours_remaining ?? Infinity) - (b.hours_remaining ?? Infinity))
  res.json(forecast)
}
