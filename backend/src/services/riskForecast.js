// Rule-based risk forecasting — simulated stand-in for predictive ML.
// See build instructions §6. Pure functions: given precomputed inputs,
// decide whether a risk_forecast insight should be raised.

const STOCKOUT_HOURS_THRESHOLD = 6
const OVERLOAD_QUEUE_DEPTH = 5

export function forecastStockout({ sku, name_en, name_vi, unit, current_stock, hours_remaining }) {
  if (hours_remaining === null || hours_remaining > STOCKOUT_HOURS_THRESHOLD) return null

  const stockoutAt = new Date(Date.now() + hours_remaining * 60 * 60 * 1000)
  const hhmm = stockoutAt.toTimeString().slice(0, 5)

  return {
    type: 'risk_forecast',
    severity: hours_remaining < 2 ? 'critical' : 'warning',
    summary_en: `${name_en} is projected to run out by ${hhmm} at the current consumption rate.`,
    summary_vi: `${name_vi} dự kiến sẽ hết vào lúc ${hhmm} theo tốc độ tiêu thụ hiện tại.`,
    metrics: { hours_remaining, current_stock, unit },
    related_entities: { sku },
  }
}

export function forecastKitchenOverload({ queueDepth, avgElapsedMin, targetMin }) {
  if (queueDepth < OVERLOAD_QUEUE_DEPTH) return null

  return {
    type: 'risk_forecast',
    severity: avgElapsedMin > targetMin * 2 ? 'critical' : 'warning',
    summary_en: `Kitchen queue has ${queueDepth} active items — prep times are trending past the ${targetMin} min target.`,
    summary_vi: `Hàng đợi bếp có ${queueDepth} món đang chờ — thời gian chế biến đang vượt mục tiêu ${targetMin} phút.`,
    metrics: { queue_depth: queueDepth, avg_elapsed_min: avgElapsedMin, target_min: targetMin },
    related_entities: {},
  }
}
