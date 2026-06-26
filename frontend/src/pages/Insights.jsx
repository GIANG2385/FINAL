import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import supabase from '../services/supabase'
import { api } from '../services/api'

const SEVERITY_STYLE = {
  info:     { border: '#CBD5E1', bg: '#F8FAFC', icon: 'ℹ', iconBg: '#E0F2FE', iconColor: '#0369A1', labelColor: '#0369A1' },
  warning:  { border: '#F5D878', bg: '#FFFBEB', icon: '⚠', iconBg: '#FEF9C3', iconColor: '#854D0E', labelColor: '#854D0E' },
  critical: { border: '#FCA5A5', bg: '#FFF5F5', icon: '🚨', iconBg: '#FEE2E2', iconColor: '#DC2626', labelColor: '#DC2626' },
}

export default function Insights() {
  const { t, i18n } = useTranslation()
  const [insights, setInsights] = useState(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    api.post('/api/insights/run').catch(() => {})

    supabase.from('insights').select('*').then(({ data }) => {
      const list = data || []
      list.sort((a, b) => (b.created_at ?? 0) > (a.created_at ?? 0) ? 1 : -1)
      setInsights(list)
    })

    const channel = supabase.channel('insights')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insights' }, () => {
        supabase.from('insights').select('*').then(({ data }) => setInsights(data || []))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function handleAcknowledge(id) {
    setBusyId(id); setActionError(null)
    try { await api.post(`/api/insights/${id}/acknowledge`) }
    catch { setActionError(t('common.error')) }
    finally { setBusyId(null) }
  }

  if (insights === null) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#888', fontSize: '14px' }}>{t('common.loading')}</span></div>
  }

  // Deduplicate by summary text — keep the most recent of each unique message
  const deduped = Object.values(
    insights.reduce((acc, i) => {
      const key = (i.summary_vi || i.summary_en || '').trim()
      if (!acc[key] || i.created_at > acc[key].created_at) acc[key] = i
      return acc
    }, {})
  ).sort((a, b) => (b.created_at ?? 0) > (a.created_at ?? 0) ? 1 : -1)

  const filtered = deduped.filter(
    (i) => (!typeFilter || i.type === typeFilter) && (!severityFilter || i.severity === severityFilter)
  )

  const counts = { total: deduped.length, new: deduped.filter(i => i.status === 'new').length, critical: deduped.filter(i => i.severity === 'critical').length }

  const selectStyle = { border: '1px solid #E5E5EA', borderRadius: '8px', padding: '6px 10px', fontSize: '13px', background: 'white', cursor: 'pointer', color: '#1A1A1A', outline: 'none' }

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1A1A1A', margin: '0 0 4px', letterSpacing: '-0.02em' }}>{t('insights.title')}</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>{i18n.language === 'vi' ? 'Cảnh báo AI · cập nhật khi tải trang' : 'AI-generated alerts · refreshed on page load'}</p>
        </div>
        {counts.critical > 0 && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '99px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#DC2626' }}>{counts.critical} Critical</span>
          </div>
        )}
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Insights', value: counts.total, color: '#1A1A1A' },
          { label: 'Need Action', value: counts.new, color: '#D97706' },
          { label: 'Critical', value: counts.critical, color: '#DC2626' },
        ].map((s) => (
          <div key={s.label} style={{ background: 'white', border: '1px solid #E5E5EA', borderRadius: '12px', padding: '14px 18px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#AAA', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{s.label}</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: 'white', border: '1px solid #E5E5EA', borderRadius: '12px', padding: '14px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Filter</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: '#888' }}>{t('insights.filterType')}</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
            <option value="">{t('insights.all')}</option>
            <option value="root_cause">{t('insights.type.root_cause')}</option>
            <option value="risk_forecast">{t('insights.type.risk_forecast')}</option>
            <option value="recommendation">{t('insights.type.recommendation')}</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: '#888' }}>{t('insights.filterSeverity')}</label>
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={selectStyle}>
            <option value="">{t('insights.all')}</option>
            <option value="info">{t('insights.severity.info')}</option>
            <option value="warning">{t('insights.severity.warning')}</option>
            <option value="critical">{t('insights.severity.critical')}</option>
          </select>
        </div>
        {(typeFilter || severityFilter) && (
          <button onClick={() => { setTypeFilter(''); setSeverityFilter('') }} style={{ marginLeft: 'auto', fontSize: '12px', color: '#E8002A', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear filters</button>
        )}
      </div>

      {actionError && <p style={{ color: '#DC2626', fontSize: '12px', marginBottom: '12px' }}>{actionError}</p>}

      {/* Insight cards */}
      {filtered.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #E5E5EA', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>{t('insights.empty')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map((insight) => {
            const sev = SEVERITY_STYLE[insight.severity] || SEVERITY_STYLE.info
            return (
              <div key={insight.id} style={{ background: sev.bg, border: `1px solid ${sev.border}`, borderLeft: `4px solid ${sev.border}`, borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: sev.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>{sev.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: sev.labelColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t(`insights.severity.${insight.severity}`)}</span>
                      <span style={{ fontSize: '11px', color: '#888' }}>·</span>
                      <span style={{ fontSize: '11px', color: '#888' }}>{t(`insights.type.${insight.type}`)}</span>
                      <span style={{ fontSize: '11px', color: '#888' }}>·</span>
                      <span style={{ fontSize: '11px', color: '#AAA' }}>{t(`insights.statusLabel.${insight.status}`)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#AAA' }}>{new Date(insight.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: '#333', margin: '0 0 8px', lineHeight: 1.5 }}>
                      {i18n.language === 'vi' ? insight.summary_vi : insight.summary_en}
                    </p>
                    {insight.status === 'new' && (
                      <button
                        disabled={busyId === insight.id}
                        onClick={() => handleAcknowledge(insight.id)}
                        style={{ padding: '5px 14px', border: `1px solid ${sev.border}`, borderRadius: '8px', background: 'white', fontSize: '12px', fontWeight: 600, color: sev.labelColor, cursor: 'pointer', opacity: busyId === insight.id ? 0.5 : 1 }}
                      >
                        {t('insights.acknowledge')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
