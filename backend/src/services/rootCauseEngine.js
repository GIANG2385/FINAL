// Rule-based root-cause analysis — simulated stand-in for the full ML
// engine described in the proposal (build instructions §6).
//
// MVP simplification: with only "today's" seeded data and no multi-day
// history, the "baseline" is the prior 2h window of today's revenue
// rather than a rolling historical average. Documented here so a future
// pass swapping in real historical baselines knows what to replace.
const DROP_THRESHOLD_PCT = 0.15

export function analyzeRootCause({ recentRevenue, priorRevenue, stockoutSkus, kitchenOverloaded, complaintCount }) {
  if (priorRevenue <= 0) return null
  const dropPct = (priorRevenue - recentRevenue) / priorRevenue
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
    summary_en: `Revenue dropped ${pct}% versus the prior window${
      causes_en.length ? `, linked to ${causes_en.join(' and ')}` : ''
    }.`,
    summary_vi: `Doanh thu giảm ${pct}% so với khung giờ trước${
      causes_vi.length ? `, liên quan đến ${causes_vi.join(' và ')}` : ''
    }.`,
    metrics: { revenue_impact_vnd: recentRevenue - priorRevenue, drop_pct: pct },
    related_entities: { stockout_skus: stockoutSkus, kitchen_overloaded: kitchenOverloaded, complaint_count: complaintCount },
  }
}
