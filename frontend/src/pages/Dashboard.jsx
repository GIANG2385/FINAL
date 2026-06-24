import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../services/firebase'
import { api } from '../services/api'

const RANGE_DAYS = { day: 1, week: 7, month: 30 }

function formatVnd(amount, lang) {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency', currency: 'VND',
  }).format(amount)
}

const isSameDay = (date) => {
  const now = new Date()
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
}

const card = {
  background: 'var(--pp-card-bg)',
  border: '1px solid var(--pp-border)',
  borderRadius: '10px',
  padding: '18px 20px',
}

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const [insights, setInsights] = useState([])
  const [ackError, setAckError] = useState(null)
  const [revenueRange, setRevenueRange] = useState('day')
  const [rawOrders, setRawOrders] = useState(null)
  const [tables, setTables] = useState(null)

  useEffect(() => {
    // Load 30 days so we can compute day/week/month ranges client-side
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recentOrders = query(collection(db, 'orders'), where('created_at', '>=', monthAgo))
    const unsubOrders = onSnapshot(recentOrders, (snap) => {
      setRawOrders(snap.docs.map((d) => d.data()))
    })
    const unsubTables = onSnapshot(collection(db, 'tables'), (snap) => {
      setTables(snap.docs.map((d) => d.data()))
    })
    const unsubInsights = onSnapshot(collection(db, 'insights'), (snap) => {
      setInsights(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => { unsubOrders(); unsubTables(); unsubInsights() }
  }, [])

  // Derive today's orders for covers/avgTicket KPIs
  const orders = useMemo(() => {
    if (!rawOrders) return null
    return rawOrders.filter((o) => {
      const created = o.created_at?.toDate ? o.created_at.toDate() : o.created_at ? new Date(o.created_at) : null
      return created && isSameDay(created)
    })
  }, [rawOrders])

  // Revenue for the selected range (computed from Firestore data, no backend needed)
  const rangeRevenue = useMemo(() => {
    if (!rawOrders) return null
    const days = RANGE_DAYS[revenueRange] ?? 1
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    return rawOrders
      .filter((o) => o.status === 'served' && o.created_at)
      .filter((o) => {
        const ts = o.created_at?.toDate ? o.created_at.toDate() : new Date(o.created_at)
        return ts >= cutoff
      })
      .reduce((sum, o) => sum + (o.total_amount || 0), 0)
  }, [allOrders, revenueRange])

  if (rawOrders === null || tables === null) {
    return <div style={{ padding: '28px 32px', color: 'var(--pp-text-muted)' }}>{t('common.loading')}</div>
  }

  const servedToday = orders.filter((o) => o.status === 'served')
  const todayRevenue = servedToday.reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const covers = servedToday.length
  const avgTicket = covers > 0 ? todayRevenue / covers : 0
  const occupied = tables.filter((tb) => tb.status === 'dining' || tb.status === 'reserved').length

  // Deduplicate and cap alerts at 3
  const activeInsights = insights.filter((i) => i.status !== 'acted_on')
  const deduped = activeInsights.reduce((acc, insight) => {
    const key = (i18n.language === 'vi' ? insight.summary_vi : insight.summary_en) + insight.type
    const existing = acc.find((a) => a._key === key)
    if (existing) { existing._count = (existing._count || 1) + 1 }
    else acc.push({ ...insight, _key: key, _count: 1 })
    return acc
  }, [])
  const dashboardAlerts = deduped.slice(0, 3)

  async function handleAcknowledge(id) {
    try { await api.post(`/api/insights/${id}/acknowledge`) }
    catch { setAckError(t('common.error')) }
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--pp-text)', marginBottom: '24px' }}>
        {t('nav.dashboard')}
      </h1>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={card}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            {['day', 'week', 'month'].map((r) => (
              <button key={r} onClick={() => setRevenueRange(r)} style={{
                borderRadius: '6px', padding: '2px 8px', fontSize: '11px', border: 'none', cursor: 'pointer',
                background: revenueRange === r ? 'var(--pp-primary)' : 'var(--pp-neutral-bg)',
                color: revenueRange === r ? 'white' : 'var(--pp-text-muted)',
              }}>{t(`dashboard.range.${r}`)}</button>
            ))}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', margin: 0 }}>{t('dashboard.todayRevenue')}</p>
          <p style={{ fontSize: '26px', fontWeight: 700, color: 'var(--pp-text)', margin: '4px 0 0' }}>
            {rangeRevenue !== null ? formatVnd(rangeRevenue, i18n.language) : '…'}
          </p>
        </div>

        <div style={card}>
          <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', margin: 0 }}>{t('dashboard.covers')}</p>
          <p style={{ fontSize: '26px', fontWeight: 700, color: 'var(--pp-text)', margin: '4px 0 0' }}>{covers}</p>
        </div>

        <div style={card}>
          <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', margin: 0 }}>{t('dashboard.avgTicket')}</p>
          <p style={{ fontSize: '26px', fontWeight: 700, color: 'var(--pp-text)', margin: '4px 0 0' }}>{formatVnd(avgTicket, i18n.language)}</p>
        </div>

        <div style={card}>
          <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', margin: 0 }}>{t('dashboard.tableOccupancy')}</p>
          <p style={{ fontSize: '26px', fontWeight: 700, color: 'var(--pp-text)', margin: '4px 0 0' }}>
            {t('dashboard.tablesOccupied', { occupied, total: tables.length })}
          </p>
        </div>
      </div>

      {/* AI Daily Summary */}
      <div style={{
        background: 'var(--pp-primary-light)',
        borderLeft: '4px solid var(--pp-primary)',
        borderRadius: '0 10px 10px 0',
        padding: '14px 18px',
        marginBottom: '24px',
      }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pp-primary)', marginBottom: '6px' }}>
          {t('dashboard.aiSummary')}
        </p>
        <p style={{ fontSize: '14px', color: 'var(--pp-text)', marginBottom: '6px' }}>
          {i18n.language === 'vi'
            ? `Hôm nay có ${covers} lượt khách, doanh thu ${formatVnd(todayRevenue, i18n.language)}. ${occupied > 0 ? `Hiện có ${occupied} bàn đang sử dụng.` : 'Hiện không có bàn nào đang sử dụng.'} ${activeInsights.length > 0 ? `Có ${activeInsights.length} cảnh báo cần xử lý.` : 'Không có cảnh báo nào.'}`
            : `Today: ${covers} covers, revenue ${formatVnd(todayRevenue, i18n.language)}. ${occupied > 0 ? `${occupied} tables currently occupied.` : 'No tables currently occupied.'} ${activeInsights.length > 0 ? `${activeInsights.length} alert(s) need attention.` : 'No active alerts.'}`
          }
        </p>
        <p style={{ fontSize: '13px', color: 'var(--pp-primary-text)' }}>{t('dashboard.rootCause')}</p>
      </div>

      {/* Active Alerts */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{t('dashboard.alerts')}</h2>
          <Link to="/insights" style={{ fontSize: '14px', color: 'var(--pp-primary)', textDecoration: 'none' }}>
            {t('insights.title')} →
          </Link>
        </div>
        {ackError && <p style={{ color: 'var(--pp-danger-text)', fontSize: '13px', marginBottom: '8px' }}>{ackError}</p>}
        {dashboardAlerts.length === 0 ? (
          <p style={{ fontSize: '14px', color: 'var(--pp-text-muted)' }}>{t('dashboard.noAlerts')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {dashboardAlerts.map((insight) => {
              const isCritical = insight.severity === 'critical'
              return (
                <div key={insight.id} style={{
                  background: isCritical ? 'var(--pp-danger-bg)' : 'var(--pp-warning-bg)',
                  border: `1px solid ${isCritical ? 'var(--pp-danger-border)' : 'var(--pp-warning-border)'}`,
                  borderRadius: '10px',
                  padding: '14px 16px',
                }}>
                  <p style={{ fontSize: '11px', color: 'var(--pp-text-muted)', marginBottom: '4px' }}>
                    {t(`insights.type.${insight.type}`)} · {t(`insights.severity.${insight.severity}`)} · {t('insights.statusLabel.new')}
                  </p>
                  <p style={{ fontSize: '14px', color: 'var(--pp-text)', margin: 0 }}>
                    {i18n.language === 'vi' ? insight.summary_vi : insight.summary_en}
                    {insight._count > 1 && <span style={{ color: 'var(--pp-text-muted)', marginLeft: '6px' }}>(×{insight._count})</span>}
                  </p>
                  {insight.status === 'new' && (
                    <button
                      onClick={() => handleAcknowledge(insight.id)}
                      style={{
                        marginTop: '8px', border: '1px solid var(--pp-border)', background: 'white',
                        borderRadius: '99px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer',
                        color: 'var(--pp-text)',
                      }}
                    >{t('insights.acknowledge')}</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
