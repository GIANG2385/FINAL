import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import supabase from '../services/supabase'
import { api } from '../services/api'

const SEVERITY_COLORS = {
  info: 'border-gray-200',
  warning: 'border-yellow-300 bg-yellow-50',
  critical: 'border-red-300 bg-red-50',
}

export default function Insights() {
  const { t, i18n } = useTranslation()
  const [insights, setInsights] = useState(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    // Initial fetch
    supabase.from('insights').select('*').then(({ data }) => {
      const list = data || []
      list.sort((a, b) => (b.created_at ?? 0) > (a.created_at ?? 0) ? 1 : -1)
      setInsights(list)
    })

    // Real-time subscription
    const channel = supabase.channel('insights')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insights' }, () => {
        supabase.from('insights').select('*').then(({ data }) => setInsights(data || []))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  if (insights === null) {
    return <div className="p-6">{t('common.loading')}</div>
  }

  const filtered = insights.filter(
    (i) => (!typeFilter || i.type === typeFilter) && (!severityFilter || i.severity === severityFilter)
  )

  async function handleAcknowledge(id) {
    setBusyId(id)
    setActionError(null)
    try {
      await api.post(`/api/insights/${id}/acknowledge`)
    } catch (err) {
      setActionError(t('common.error'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">{t('insights.title')}</h1>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}

      <div className="mb-4 flex gap-4">
        <div>
          <label className="mr-2 text-sm text-gray-500">{t('insights.filterType')}</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">{t('insights.all')}</option>
            <option value="root_cause">{t('insights.type.root_cause')}</option>
            <option value="risk_forecast">{t('insights.type.risk_forecast')}</option>
            <option value="recommendation">{t('insights.type.recommendation')}</option>
          </select>
        </div>
        <div>
          <label className="mr-2 text-sm text-gray-500">{t('insights.filterSeverity')}</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">{t('insights.all')}</option>
            <option value="info">{t('insights.severity.info')}</option>
            <option value="warning">{t('insights.severity.warning')}</option>
            <option value="critical">{t('insights.severity.critical')}</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">{t('insights.empty')}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((insight) => (
            <div key={insight.id} className={'rounded-lg border p-4 ' + SEVERITY_COLORS[insight.severity]}>
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {t(`insights.type.${insight.type}`)} · {t(`insights.severity.${insight.severity}`)} ·{' '}
                  {t(`insights.statusLabel.${insight.status}`)}
                </span>
              </div>
              <p className="text-sm">{i18n.language === 'vi' ? insight.summary_vi : insight.summary_en}</p>
              {insight.status === 'new' && (
                <button
                  disabled={busyId === insight.id}
                  onClick={() => handleAcknowledge(insight.id)}
                  className="mt-2 rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-50"
                >
                  {t('insights.acknowledge')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
