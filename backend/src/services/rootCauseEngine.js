// Rule-based root-cause analysis — simulated stand-in for the full ML
// engine described in the proposal (build instructions §6).
//
// Baseline is the historical average revenue for this same time-of-day
// window (see services/historicalBaseline.js), computed from real past
// orders rather than a same-day prior-window comparison.
const DROP_THRESHOLD_PCT = 0.15

export function analyzeRootCause({ recentRevenue, baselineRevenue, stockoutSkus, kitchenOverloaded, complaintCount }) {
  if (baselineRevenue <= 0) return null
  const dropPct = (baselineRevenue - recentRevenue) / baselineRevenue
  if (dropPct < DROP_THRESHOLD_PCT) return null

  const causes_en = []
  const causes_vi = []
  if (kitchenOverloaded) {
    causes_en.push('kitchen overload')
    causes_vi.push('quá tải bếp')
  }
  if (stockoutSkus.length > 0) {
    causes_en.push(`stockouts (${stockoutSkus.join(', ')})`)
    causes_vi.push(`hết hàng (${stockoutSkus.join(', ')})`)
  }
  if (complaintCount >= 3) {
    causes_en.push(`a spike in complaints (${complaintCount})`)
    causes_vi.push(`tăng đột biến khiếu nại (${complaintCount})`)
  }

  const pct = Math.round(dropPct * 100)

  return {
    type: 'root_cause',
    severity: dropPct > 0.3 ? 'critical' : 'warning',
    summary_en: `Revenue is ${pct}% below the historical average for this time of day${
      causes_en.length ? `, linked to ${causes_en.join(' and ')}` : ''
    }.`,
    summary_vi: `Doanh thu thấp hơn ${pct}% so với mức trung bình lịch sử cho khung giờ này${
      causes_vi.length ? `, liên quan đến ${causes_vi.join(' và ')}` : ''
    }.`,
    metrics: { revenue_impact_vnd: recentRevenue - baselineRevenue, drop_pct: pct },
    related_entities: { stockout_skus: stockoutSkus, kitchen_overloaded: kitchenOverloaded, complaint_count: complaintCount },
  }
}
