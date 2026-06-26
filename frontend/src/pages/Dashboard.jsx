import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import supabase from '../services/supabase'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'

const RANGE_DAYS = { day: 1, week: 7, month: 30 }

function formatVnd(amount) {
  if (amount >= 1_000_000_000) return `₫${(amount / 1_000_000_000).toFixed(1)}B`
  if (amount >= 1_000_000) return `₫${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `₫${(amount / 1_000).toFixed(0)}K`
  return `₫${amount}`
}

const isSameDay = (date) => {
  const now = new Date()
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const INITIALS_COLORS = ['#7C3AED', '#0369A1', '#059669', '#D97706', '#DB2777', '#0891B2']

const TIER_PILL = {
  Gold:   { bg: '#D97706', color: 'white' },
  Silver: { bg: '#64748B', color: 'white' },
  Bronze: { bg: '#C2410C', color: 'white' },
}

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()

  const [insights, setInsights] = useState([])
  const [ackError, setAckError] = useState(null)
  const [revenueRange, setRevenueRange] = useState('day')
  const [rawOrders, setRawOrders] = useState(null)
  const [tables, setTables] = useState(null)
  const [reservations, setReservations] = useState([])

  useEffect(() => {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    supabase.from('orders').select('*').gte('created_at', monthAgo.toISOString())
      .then(({ data }) => setRawOrders(data || []))
    supabase.from('tables').select('*')
      .then(({ data }) => setTables(data || []))
    supabase.from('insights').select('*')
      .then(({ data }) => setInsights(data || []))
    supabase.from('reservations').select('guest_name, status')
      .then(({ data }) => setReservations(data || []))

    const ordersChannel = supabase.channel('orders-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        supabase.from('orders').select('*').gte('created_at', monthAgo.toISOString())
          .then(({ data }) => setRawOrders(data || []))
      }).subscribe()

    const tablesChannel = supabase.channel('tables-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        supabase.from('tables').select('*').then(({ data }) => setTables(data || []))
      }).subscribe()

    const insightsChannel = supabase.channel('insights-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insights' }, () => {
        supabase.from('insights').select('*').then(({ data }) => setInsights(data || []))
      }).subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(tablesChannel)
      supabase.removeChannel(insightsChannel)
    }
  }, [])

  const orders = useMemo(() => {
    if (!rawOrders) return null
    return rawOrders.filter((o) => {
      const created = o.created_at ? new Date(o.created_at) : null
      return created && isSameDay(created)
    })
  }, [rawOrders])

  // All range-driven KPI values share the same cutoff
  const rangeCutoff = useMemo(() => {
    if (revenueRange === 'day') {
      const d = new Date(); d.setHours(0, 0, 0, 0); return d
    }
    return new Date(Date.now() - RANGE_DAYS[revenueRange] * 24 * 60 * 60 * 1000)
  }, [revenueRange])

  const rangeServed = useMemo(() => {
    if (!rawOrders) return []
    return rawOrders.filter((o) => o.status === 'served' && o.created_at && new Date(o.created_at) >= rangeCutoff)
  }, [rawOrders, rangeCutoff])

  const rangeRevenue = useMemo(() => rangeServed.reduce((s, o) => s + (o.total_amount || 0), 0), [rangeServed])

  const topGuests = useMemo(() => {
    const map = {}
    for (const r of reservations) {
      if (r.status === 'cancelled') continue
      if (!map[r.guest_name]) map[r.guest_name] = 0
      map[r.guest_name]++
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, visits]) => ({
        name, visits,
        tier: visits >= 10 ? 'Gold' : visits >= 5 ? 'Silver' : 'Bronze',
      }))
  }, [reservations])

  async function handleAcknowledge(id) {
    try { await api.post(`/api/insights/${id}/acknowledge`) }
    catch { setAckError(t('common.error')) }
  }

  if (rawOrders === null || tables === null) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#888', fontSize: '14px' }}>Loading…</span></div>
  }

  const servedToday = (orders || []).filter((o) => o.status === 'served')
  const todayRevenue = servedToday.reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const covers = servedToday.length
  const avgTicket = covers > 0 ? todayRevenue / covers : 0
  const occupied = tables.filter((tb) => tb.status === 'dining' || tb.status === 'reserved').length

  const activeInsights = insights.filter((i) => i.status !== 'acted_on')
  const deduped = activeInsights.reduce((acc, insight) => {
    const key = (insight.summary_en || '') + insight.type
    const existing = acc.find((a) => a._key === key)
    if (existing) { existing._count = (existing._count || 1) + 1 }
    else acc.push({ ...insight, _key: key, _count: 1 })
    return acc
  }, [])
  const dashboardAlerts = deduped.slice(0, 3)

  const now = new Date()
  const shiftLabel = now.getHours() < 15 ? 'Lunch Shift' : 'Dinner Shift'
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const sortedTables = [...tables].sort((a, b) =>
    parseInt(a.table_id.replace(/\D/g, '')) - parseInt(b.table_id.replace(/\D/g, ''))
  )

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1A1A1A', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Executive Dashboard</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Real-time performance · <strong>{shiftLabel}</strong> · {dateLabel}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '99px', padding: '5px 12px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534' }}>System Live</span>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ marginBottom: '18px' }}>
        {/* Section header with range toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Performance Metrics</span>
          <div style={{ display: 'flex', gap: '4px', background: '#F2F2F7', borderRadius: '8px', padding: '3px' }}>
            {[['day','Today'], ['week','7D'], ['month','30D']].map(([r, label]) => (
              <button key={r} onClick={() => setRevenueRange(r)} style={{ borderRadius: '6px', padding: '4px 12px', fontSize: '11px', border: 'none', cursor: 'pointer', fontWeight: 600, background: revenueRange === r ? 'white' : 'transparent', color: revenueRange === r ? '#E8002A' : '#888', boxShadow: revenueRange === r ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px' }}>
          {(() => {
            const rangeCovers = rangeServed.length
            const rangeAvg = rangeCovers > 0 ? rangeRevenue / rangeCovers : 0
            const rangeSub = revenueRange === 'day' ? 'today' : revenueRange === 'week' ? 'last 7 days' : 'last 30 days'
            return [
              { label: 'Revenue',    value: formatVnd(rangeRevenue),  icon: '₫',  deltaUp: rangeRevenue > 0,  delta: formatVnd(rangeRevenue),  sub: rangeSub },
              { label: 'Covers',     value: rangeCovers,               icon: '👥', deltaUp: rangeCovers > 0,   delta: `${rangeCovers} orders`,  sub: rangeSub },
              { label: 'Avg Ticket', value: formatVnd(rangeAvg),       icon: '🧾', deltaUp: rangeAvg > 0,      delta: formatVnd(rangeAvg),      sub: 'per order' },
              { label: 'Occupancy',  value: `${occupied}/${tables.length}`, icon: '⊞', deltaUp: occupied > tables.length / 2, delta: `${Math.round((occupied / Math.max(tables.length,1)) * 100)}%`, sub: 'tables now' },
            ].map((kpi) => (
              <div key={kpi.label} style={{ background: 'white', border: '1px solid #E5E5EA', borderRadius: '12px', padding: '16px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <span style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #FFB3C1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: '#E8002A', marginBottom: '10px' }}>{kpi.icon}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{kpi.label}</span>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#1A1A1A', lineHeight: 1.1, marginBottom: '8px' }}>{kpi.value}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: kpi.deltaUp ? '#16A34A' : '#888' }}>{kpi.deltaUp ? '▲' : '—'}</span>
                  <span style={{ fontSize: '11px', color: '#AAA' }}>{kpi.sub}</span>
                </div>
              </div>
            ))
          })()}
        </div>
      </div>

      {/* AI consultant card */}
      <div style={{ background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 60%, #4338CA 100%)', borderRadius: '14px', padding: '20px 24px', marginBottom: '18px', display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>🤖</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ color: 'white', fontWeight: 700, fontSize: '15px' }}>AI Consultant: Mid-Shift Narrative</span>
            <span style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', padding: '2px 8px', borderRadius: '99px' }}>LIVE INSIGHT</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', lineHeight: 1.6, margin: '0 0 14px' }}>
            {i18n.language === 'vi'
              ? `Hôm nay có ${covers} lượt khách với doanh thu ${formatVnd(todayRevenue)}. ${occupied > 0 ? `Hiện có ${occupied} bàn đang sử dụng.` : 'Chưa có bàn nào.'} ${activeInsights.length > 0 ? `Có ${activeInsights.length} cảnh báo cần xử lý.` : 'Không có cảnh báo.'}`
              : `Today logged ${covers} covers — revenue ${formatVnd(todayRevenue)}. ${occupied > 0 ? `${occupied}/${tables.length} tables active.` : 'No tables occupied yet.'} ${activeInsights.length > 0 ? `${activeInsights.length} alert${activeInsights.length > 1 ? 's' : ''} need attention.` : 'No active alerts.'}`}
          </p>
          <Link to="/consultant" style={{ border: '1px solid rgba(255,255,255,0.4)', color: 'white', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '7px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}>Open AI Consultant →</Link>
        </div>
      </div>

      {/* Alerts + Floor plan */}
      <div style={{ display: 'grid', gridTemplateColumns: '44% 1fr', gap: '16px', marginBottom: '18px', alignItems: 'stretch' }}>

        {/* Alerts */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E5E5EA', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <span style={{ fontWeight: 700, fontSize: '14px', color: '#1A1A1A' }}>Urgent Alerts</span>
            {dashboardAlerts.length > 0 && (
              <span style={{ background: '#E8002A', color: 'white', fontSize: '10px', fontWeight: 700, borderRadius: '99px', padding: '2px 8px' }}>
                {dashboardAlerts.length} ITEM{dashboardAlerts.length > 1 ? 'S' : ''}
              </span>
            )}
          </div>
          {ackError && <p style={{ color: '#DC2626', fontSize: '12px', marginBottom: '8px' }}>{ackError}</p>}
          {dashboardAlerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
              <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No active alerts</p>
            </div>
          ) : dashboardAlerts.map((insight) => {
            const isCritical = insight.severity === 'critical'
            const borderColor = isCritical ? '#E8002A' : insight.type === 'root_cause' ? '#6366F1' : '#F59E0B'
            const iconBg = isCritical ? '#FEE2E2' : insight.type === 'root_cause' ? '#EDE9FE' : '#FEF9C3'
            const icon = isCritical ? '⚠' : insight.type === 'root_cause' ? '📉' : '📦'
            return (
              <div key={insight.id} style={{ borderLeft: `4px solid ${borderColor}`, background: '#FAFAFA', borderRadius: '0 8px 8px 0', padding: '12px 14px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 600, fontSize: '12px', color: '#1A1A1A' }}>
                        {insight.type === 'risk_forecast' ? 'Stock Alert' : 'Revenue Alert'}
                        {insight._count > 1 && <span style={{ color: '#888', fontWeight: 400, marginLeft: '4px' }}>(×{insight._count})</span>}
                      </span>
                      <span style={{ fontSize: '10px', color: '#AAA', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                        {new Date(insight.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#555', margin: '3px 0 8px', lineHeight: 1.4 }}>
                      {i18n.language === 'vi' ? insight.summary_vi : insight.summary_en}
                    </p>
                    {insight.status === 'new' && (
                      <button onClick={() => handleAcknowledge(insight.id)} style={{ fontSize: '11px', color: borderColor, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }}>
                        Mark as resolved →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Floor plan */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E5E5EA', padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontWeight: 700, fontSize: '14px', color: '#1A1A1A' }}>Live Floor Status</span>
            <div style={{ display: 'flex', gap: '12px' }}>
              {[{ color: '#E8002A', label: 'DINING' }, { color: 'white', border: '#CBD5E1', label: 'OPEN' }, { color: '#FFFBEB', border: '#F59E0B', label: 'CLEANUP' }].map((l) => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: l.color, border: `1px solid ${l.border || l.color}` }} />
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#888', letterSpacing: '0.05em' }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: '#F5F0E8', borderRadius: '10px', padding: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '8px' }}>
              {sortedTables.map((tb) => {
                const isDining = tb.status === 'dining'
                const isReserved = tb.status === 'reserved'
                const isCleanup = tb.status === 'cleanup'
                const bg = isDining ? '#E8002A' : isCleanup ? '#FFFBEB' : 'white'
                const border = isDining ? '#C5001F' : isReserved ? '#F59E0B' : isCleanup ? '#F59E0B' : '#CBD5E1'
                const textColor = isDining ? 'white' : '#1A1A1A'
                return (
                  <div key={tb.table_id} style={{ background: bg, border: `2px ${isReserved ? 'dashed' : 'solid'} ${border}`, borderRadius: '8px', padding: '8px 6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: textColor }}>{tb.table_id}</div>
                    <div style={{ fontSize: '9px', color: isDining ? 'rgba(255,255,255,0.7)' : '#AAA', marginTop: '2px' }}>
                      {isDining ? '●' : isReserved ? '◌' : isCleanup ? '↻' : '○'}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ background: '#1A1A1A', color: 'white', fontSize: '9px', fontWeight: 700, borderRadius: '99px', padding: '2px 10px', letterSpacing: '0.1em' }}>MAIN ENTRANCE</div>
            </div>
          </div>
        </div>
      </div>

      {/* Guest tracking */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E5E5EA', padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#1A1A1A' }}>High Value Guest Tracking</span>
          <Link to="/guests" style={{ fontSize: '12px', color: '#E8002A', fontWeight: 600, textDecoration: 'none' }}>View All →</Link>
        </div>
        {topGuests.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No guest data yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F2F2F7' }}>
                {['GUEST', 'TIER', 'VISITS', 'LAST VISIT', ''].map((h) => (
                  <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#AAA', letterSpacing: '0.08em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topGuests.map((g, idx) => {
                const tp = TIER_PILL[g.tier]
                return (
                  <tr key={g.name} style={{ borderBottom: '1px solid #F2F2F7' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: INITIALS_COLORS[idx % INITIALS_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                          {getInitials(g.name)}
                        </div>
                        <span style={{ fontWeight: 600, color: '#1A1A1A' }}>{g.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}><span style={{ background: tp.bg, color: tp.color, borderRadius: '99px', padding: '3px 10px', fontSize: '11px', fontWeight: 700 }}>{g.tier}</span></td>
                    <td style={{ padding: '12px', color: '#555' }}>{g.visits}</td>
                    <td style={{ padding: '12px', color: '#AAA', fontSize: '12px' }}>—</td>
                    <td style={{ padding: '12px' }}><button style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#CCC' }}>···</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
