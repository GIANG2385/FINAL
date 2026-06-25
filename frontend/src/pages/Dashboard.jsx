import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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

const INITIALS_COLORS = ['#7C3AED','#0369A1','#059669','#D97706','#DB2777','#0891B2']

const NAV_ITEMS = [
  { label: 'Executive View', icon: '▦', to: '/' },
  { label: 'Table Management', icon: '⊞', to: '/foh' },
  { label: 'Kitchen Ops', icon: '⚑', to: '/foh' },
  { label: 'Stock Control', icon: '◫', to: '/boh' },
  { label: 'CRM', icon: '◎', to: '/guests' },
  { label: 'AI Insights', icon: '✦', to: '/insights' },
]

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()

  // ── State (all existing — do not remove) ──────────────────────────────────
  const [insights, setInsights] = useState([])
  const [ackError, setAckError] = useState(null)
  const [revenueRange, setRevenueRange] = useState('day')
  const [rawOrders, setRawOrders] = useState(null)
  const [tables, setTables] = useState(null)
  const [reservations, setReservations] = useState([])

  // ── Data fetching (existing subscriptions + one new reservations fetch) ──
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
        supabase.from('tables').select('*')
          .then(({ data }) => setTables(data || []))
      }).subscribe()

    const insightsChannel = supabase.channel('insights-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insights' }, () => {
        supabase.from('insights').select('*')
          .then(({ data }) => setInsights(data || []))
      }).subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(tablesChannel)
      supabase.removeChannel(insightsChannel)
    }
  }, [])

  // ── Derived values (all existing logic preserved) ─────────────────────────
  const orders = useMemo(() => {
    if (!rawOrders) return null
    return rawOrders.filter((o) => {
      const created = o.created_at ? new Date(o.created_at) : null
      return created && isSameDay(created)
    })
  }, [rawOrders])

  const rangeRevenue = useMemo(() => {
    if (!rawOrders) return null
    const days = RANGE_DAYS[revenueRange] ?? 1
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    return rawOrders
      .filter((o) => o.status === 'served' && o.created_at && new Date(o.created_at) >= cutoff)
      .reduce((sum, o) => sum + (o.total_amount || 0), 0)
  }, [rawOrders, revenueRange])

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

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  if (rawOrders === null || tables === null) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#666', fontSize: '14px' }}>Loading…</span>
      </div>
    )
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

  const userName = user?.email?.split('@')[0] || 'Manager'
  const avatarSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=E8002A&color=fff&size=80`

  const sortedTables = [...tables].sort((a, b) =>
    parseInt(a.table_id.replace(/\D/g, '')) - parseInt(b.table_id.replace(/\D/g, ''))
  )

  const TIER_PILL = {
    Gold:   { bg: '#D97706', color: 'white' },
    Silver: { bg: '#64748B', color: 'white' },
    Bronze: { bg: '#C2410C', color: 'white' },
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── LEFT SIDEBAR ──────────────────────────────────────────────────── */}
      <aside style={{ width: '190px', flexShrink: 0, background: '#1A1A1A', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>

        {/* Logo */}
        <div style={{ padding: '24px 16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#E8002A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>🍜</div>
            <div>
              <div style={{ color: '#E8002A', fontWeight: 900, fontSize: '13px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>SmartOps</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '9px', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '1px' }}>Proactive Partner</div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.to === '/' && item.label === 'Executive View'
            return (
              <Link
                key={item.label}
                to={item.to}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '8px', marginBottom: '2px',
                  textDecoration: 'none', fontSize: '13px', fontWeight: isActive ? 600 : 400,
                  background: isActive ? '#E8002A' : 'transparent',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.55)',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <span style={{ fontSize: '14px', width: '18px', textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: '12px 8px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button style={{ width: '100%', background: '#E8002A', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '8px' }}>
            📄 Shift Report
          </button>
          <Link to="/settings" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', color: 'rgba(255,255,255,0.45)', fontSize: '12px', textDecoration: 'none', borderRadius: '6px' }}>
            ⚙ Settings
          </Link>
          <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', color: 'rgba(255,255,255,0.45)', fontSize: '12px', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '6px', textAlign: 'left' }}>
            ⬡ Log Out
          </button>
        </div>
      </aside>

      {/* ── RIGHT CONTENT ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F2F2F7', overflowY: 'auto' }}>

        {/* Top bar */}
        <div style={{ background: 'white', borderBottom: '1px solid #E5E5EA', padding: '0 28px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#1A1A1A' }}>Pang Pang SmartOps</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => i18n.changeLanguage(i18n.language === 'vi' ? 'en' : 'vi')}
              style={{ background: '#F2F2F7', border: '1px solid #E5E5EA', borderRadius: '99px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#555' }}
            >
              {i18n.language === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
            </button>
            <button style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666', lineHeight: 1 }}>🔔</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#1A1A1A', lineHeight: 1.2 }}>{userName}</div>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{role}</div>
              </div>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #E8002A' }}>
                <img src={avatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ padding: '24px 28px', flex: 1 }}>

          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1A1A1A', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Executive Dashboard</h1>
              <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Real-time performance metrics for <strong>{shiftLabel}</strong> · {dateLabel}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '99px', padding: '5px 12px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534' }}>System Live</span>
            </div>
          </div>

          {/* ── KPI ROW ────────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '18px' }}>
            {[
              {
                label: 'Revenue',
                value: formatVnd(rangeRevenue ?? 0),
                delta: '+12%',
                deltaUp: true,
                sub: 'vs last shift',
                icon: '₫',
                extra: (
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                    {['day','week','month'].map((r) => (
                      <button key={r} onClick={() => setRevenueRange(r)} style={{ borderRadius: '4px', padding: '2px 7px', fontSize: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, background: revenueRange === r ? '#E8002A' : '#F2F2F7', color: revenueRange === r ? 'white' : '#888' }}>
                        {r === 'day' ? '1D' : r === 'week' ? '7D' : '30D'}
                      </button>
                    ))}
                  </div>
                ),
              },
              { label: 'Covers', value: covers, delta: `${covers} served`, deltaUp: covers > 0, sub: 'today', icon: '👥' },
              { label: 'Avg Ticket', value: formatVnd(avgTicket), delta: '+5%', deltaUp: true, sub: 'vs typical', icon: '🧾' },
              { label: 'Occupancy', value: `${occupied}/${tables.length}`, delta: `${Math.round((occupied/Math.max(tables.length,1))*100)}%`, deltaUp: occupied > tables.length / 2, sub: 'tables active', icon: '⊞' },
            ].map((kpi) => (
              <div key={kpi.label} style={{ background: 'white', border: '1px solid #E5E5EA', borderRadius: '12px', padding: '16px 18px' }}>
                {kpi.extra || null}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{kpi.label}</span>
                  <span style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #FFB3C1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#E8002A' }}>{kpi.icon}</span>
                </div>
                <div style={{ fontSize: '30px', fontWeight: 800, color: '#1A1A1A', lineHeight: 1.1, marginBottom: '6px' }}>{kpi.value}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: kpi.deltaUp ? '#16A34A' : '#DC2626' }}>
                    {kpi.deltaUp ? '▲' : '▼'} {kpi.delta}
                  </span>
                  <span style={{ fontSize: '11px', color: '#AAA' }}>{kpi.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── AI CONSULTANT CARD ─────────────────────────────────────────── */}
          <div style={{ background: '#E8002A', borderRadius: '14px', padding: '20px 24px', marginBottom: '18px', display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', flexShrink: 0 }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ color: 'white', fontWeight: 700, fontSize: '15px' }}>AI Consultant: Mid-Shift Narrative</span>
                <span style={{ background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', padding: '2px 8px', borderRadius: '99px' }}>LIVE INSIGHT</span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: '13px', lineHeight: 1.6, margin: '0 0 14px' }}>
                {i18n.language === 'vi'
                  ? `Hôm nay có ${covers} lượt khách với doanh thu ${formatVnd(todayRevenue)}. ${occupied > 0 ? `Hiện có ${occupied} bàn đang sử dụng.` : 'Hiện không có bàn nào đang sử dụng.'} ${activeInsights.length > 0 ? `Có ${activeInsights.length} cảnh báo cần xử lý.` : 'Không có cảnh báo nào.'}`
                  : `Today logged ${covers} covers with revenue of ${formatVnd(todayRevenue)}. ${occupied > 0 ? `${occupied} of ${tables.length} tables are currently active.` : 'No tables currently occupied.'} ${activeInsights.length > 0 ? `${activeInsights.length} alert${activeInsights.length > 1 ? 's' : ''} need attention.` : 'No active alerts at this time.'}`
                }
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Link to="/consultant" style={{ border: '1px solid rgba(255,255,255,0.5)', color: 'white', background: 'transparent', borderRadius: '8px', padding: '7px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}>Action Plan</Link>
                <button onClick={() => {}} style={{ border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.7)', background: 'transparent', borderRadius: '8px', padding: '7px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
              </div>
            </div>
          </div>

          {/* ── BOTTOM ROW: ALERTS + FLOOR PLAN ───────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '44% 1fr', gap: '16px', marginBottom: '18px' }}>

            {/* Urgent Alerts */}
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E5E5EA', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px', color: '#1A1A1A' }}>Urgent Alerts</span>
                {dashboardAlerts.length > 0 && (
                  <span style={{ background: '#E8002A', color: 'white', fontSize: '10px', fontWeight: 700, borderRadius: '99px', padding: '2px 8px' }}>
                    {dashboardAlerts.length} ACTION ITEM{dashboardAlerts.length > 1 ? 'S' : ''}
                  </span>
                )}
              </div>
              {ackError && <p style={{ color: '#DC2626', fontSize: '12px', marginBottom: '8px' }}>{ackError}</p>}
              {dashboardAlerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
                  <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No active alerts</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {dashboardAlerts.map((insight) => {
                    const isCritical = insight.severity === 'critical'
                    const borderColor = isCritical ? '#E8002A' : insight.type === 'root_cause' ? '#6366F1' : '#F59E0B'
                    const iconBg = isCritical ? '#FEE2E2' : insight.type === 'root_cause' ? '#EDE9FE' : '#FEF9C3'
                    const iconColor = isCritical ? '#DC2626' : insight.type === 'root_cause' ? '#6366F1' : '#D97706'
                    const icon = isCritical ? '⚠' : insight.type === 'root_cause' ? '📉' : '📦'
                    return (
                      <div key={insight.id} style={{ borderLeft: `4px solid ${borderColor}`, background: '#FAFAFA', borderRadius: '0 8px 8px 0', padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>{icon}</div>
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
              )}
            </div>

            {/* Live Floor Status */}
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E5E5EA', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px', color: '#1A1A1A' }}>Live Floor Status</span>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[
                    { color: '#E8002A', label: 'OCCUPIED' },
                    { color: '#fff', label: 'AVAILABLE', border: '#CBD5E1' },
                    { color: '#FFFBEB', label: 'CHECKOUT', border: '#F59E0B' },
                  ].map((l) => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: l.color, border: `1px solid ${l.border || l.color}` }} />
                      <span style={{ fontSize: '9px', fontWeight: 700, color: '#888', letterSpacing: '0.05em' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Floor canvas */}
              <div style={{ background: '#F5F0E8', borderRadius: '10px', padding: '16px', position: 'relative' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '8px' }}>
                  {sortedTables.map((tb) => {
                    const isDining = tb.status === 'dining'
                    const isReserved = tb.status === 'reserved'
                    const isCleanup = tb.status === 'cleanup'
                    const bg = isDining ? '#E8002A' : isCleanup ? '#FFFBEB' : 'white'
                    const border = isDining ? '#C5001F' : isReserved ? '#F59E0B' : isCleanup ? '#F59E0B' : '#CBD5E1'
                    const textColor = isDining ? 'white' : '#1A1A1A'
                    const borderStyle = isReserved ? 'dashed' : 'solid'
                    return (
                      <div key={tb.table_id} style={{ background: bg, border: `2px ${borderStyle} ${border}`, borderRadius: '8px', padding: '8px 6px', textAlign: 'center', position: 'relative' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: textColor }}>{tb.table_id}</div>
                        <div style={{ fontSize: '9px', color: isDining ? 'rgba(255,255,255,0.8)' : '#888', marginTop: '2px' }}>
                          {isDining ? '●' : isReserved ? '◌' : isCleanup ? '↻' : '○'}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '9px', color: '#A09070', fontWeight: 600, letterSpacing: '0.08em' }}>SECTION A</span>
                  <div style={{ background: '#1A1A1A', color: 'white', fontSize: '9px', fontWeight: 700, borderRadius: '99px', padding: '2px 10px', letterSpacing: '0.1em' }}>MAIN ENTRANCE</div>
                  <span style={{ fontSize: '9px', color: '#A09070', fontWeight: 600, letterSpacing: '0.08em' }}>BOOTH ROW</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── GUEST TRACKING ─────────────────────────────────────────────── */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E5E5EA', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontWeight: 700, fontSize: '14px', color: '#1A1A1A' }}>High Value Guest Tracking</span>
              <Link to="/guests" style={{ fontSize: '12px', color: '#E8002A', fontWeight: 600, textDecoration: 'none' }}>View All CRM →</Link>
            </div>
            {topGuests.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No guest data yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #F2F2F7' }}>
                    {['GUEST', 'STATUS', 'LIFETIME VISITS', 'LAST VISIT', 'ACTION'].map((h) => (
                      <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#AAA', letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topGuests.map((g, idx) => {
                    const initials = getInitials(g.name)
                    const circleBg = INITIALS_COLORS[idx % INITIALS_COLORS.length]
                    const tier = TIER_PILL[g.tier]
                    return (
                      <tr key={g.name} style={{ borderBottom: '1px solid #F2F2F7' }}>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: circleBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                            <span style={{ fontWeight: 600, color: '#1A1A1A' }}>{g.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ background: tier.bg, color: tier.color, borderRadius: '99px', padding: '3px 10px', fontSize: '11px', fontWeight: 700 }}>{g.tier}</span>
                        </td>
                        <td style={{ padding: '12px', color: '#555' }}>{g.visits} visits</td>
                        <td style={{ padding: '12px', color: '#888', fontSize: '12px' }}>—</td>
                        <td style={{ padding: '12px' }}>
                          <button style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#888' }}>···</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
