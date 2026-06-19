// Templated recommendations appended to an insight's summary — simulated
// stand-in for the full ML recommendation system described in §6.

export function recommendationFor(insightDraft) {
  if (insightDraft.type === 'risk_forecast' && insightDraft.related_entities?.sku) {
    return {
      en: `Recommendation: increase stock buffer for ${insightDraft.related_entities.sku} by 20%.`,
      vi: `Đề xuất: tăng lượng dự trữ cho ${insightDraft.related_entities.sku} thêm 20%.`,
    }
  }
  if (insightDraft.type === 'risk_forecast') {
    return {
      en: 'Recommendation: add 1 floor staff to the current shift to reduce kitchen overload.',
      vi: 'Đề xuất: bổ sung 1 nhân viên cho ca hiện tại để giảm tải cho bếp.',
    }
  }
  if (insightDraft.type === 'root_cause') {
    return {
      en: 'Recommendation: review affected stations and inventory levels before the next service window.',
      vi: 'Đề xuất: kiểm tra lại các khu vực và tồn kho liên quan trước ca tiếp theo.',
    }
  }
  return { en: '', vi: '' }
}
