import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadialBarChart, RadialBar, Legend,
} from 'recharts'
import supabase from '../services/supabase'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { auth } from '../services/firebase'


const FOOD_COST_PCT = 0.32
const HOURLY_WAGE   = 25000
const RANGE_DAYS    = { day: 1, week: 7, month: 30 }
const COLORS = ['#E8002A','#6366F1','#F59E0B','#22C55E','#0EA5E9','#A855F7']

function fmt(n) {
  if (n >= 1_000_000_000) return `₫${(n/1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `₫${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `₫${(n/1_000).toFixed(0)}K`
  return `₫${n}`
}
function pct(n) { return `${n.toFixed(1)}%` }

const card = (extra = {}) => ({
  background: 'white', border: '1px solid #E5E5EA', borderRadius: '12px',
  padding: '16px 18px', ...extra,
})

const KPI_META = [
  { key: 'revenue',      label: ['Revenue','Doanh thu'],      icon: '₫',  color: '#E8002A' },
  { key: 'foodCost',     label: ['Food Cost','Giá vốn'],      icon: '🍽', color: '#F59E0B' },
  { key: 'laborCost',    label: ['Labor Cost','Nhân sự'],     icon: '👥', color: '#6366F1' },
  { key: 'profit',       label: ['Profit','Lợi nhuận'],       icon: '📈', color: '#16A34A' },
  { key: 'margin',       label: ['Margin','Biên LN'],         icon: '%',  color: '#0EA5E9' },
  { key: 'orders',       label: ['Orders','Đơn hàng'],        icon: '🧾', color: '#A855F7' },
  { key: 'guests',       label: ['Guests','Khách'],           icon: '⊞', color: '#EC4899' },
]

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language

  const [rawOrders,    setRawOrders]    = useState(null)
  const [staffShifts,  setStaffShifts]  = useState([])
  const [tables,       setTables]       = useState(null)
  const [insights,     setInsights]     = useState([])
  const [inventoryRaw, setInventoryRaw] = useState([])
  const [reservations, setReservations] = useState([])
  const [range,        setRange]        = useState('day')
  const [ackError,     setAckError]     = useState(null)

  // AI Consultant dashboard brief
  const [consultantMessages, setConsultantMessages] = useState(null)
  const [briefLoading,       setBriefLoading]       = useState(false)
  const chatUidRef   = useRef(null)
  const briefFiredRef = useRef(false)

  useEffect(() => {
    const monthAgo = new Date(Date.now() - 30 * 86400000)
    supabase.from('orders').select('*').gte('created_at', monthAgo.toISOString())
      .then(({ data }) => setRawOrders(data || []))
    supabase.from('tables').select('*').then(({ data }) => setTables(data || []))
    supabase.from('insights').select('*').then(({ data }) => setInsights(data || []))
    supabase.from('staff_shifts').select('*').then(({ data }) => setStaffShifts(data || []))
    supabase.from('inventory').select('*').then(({ data }) => setInventoryRaw(data || []))
    supabase.from('reservations').select('guest_name,status').then(({ data }) => setReservations(data || []))

    const ch1 = supabase.channel('dash-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () =>
        supabase.from('orders').select('*').gte('created_at', monthAgo.toISOString()).then(({ data }) => setRawOrders(data || [])))
      .subscribe()
    const ch2 = supabase.channel('dash-tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () =>
        supabase.from('tables').select('*').then(({ data }) => setTables(data || [])))
      .subscribe()
    const ch3 = supabase.channel('dash-insights')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insights' }, () =>
        supabase.from('insights').select('*').then(({ data }) => setInsights(data || [])))
      .subscribe()
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); supabase.removeChannel(ch3) }
  }, [])

  // Load consultant messages (summary only — last assistant reply)
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    chatUidRef.current = uid
    supabase.from('consultant_messages').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setConsultantMessages(data || []))
    const ch = supabase.channel(`dash-consultant-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'consultant_messages' }, () => {
        supabase.from('consultant_messages').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20)
          .then(({ data }) => setConsultantMessages(data || []))
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Auto-generate executive brief once all data is loaded
  useEffect(() => {
    if (briefFiredRef.current) return
    if (!rawOrders || !tables || staffShifts === null || inventoryRaw === null) return
    if (!chatUidRef.current) return
    briefFiredRef.current = true

    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const todayOrders = rawOrders.filter(o => o.status === 'served' && o.created_at && new Date(o.created_at) >= todayStart)
    const todayRevenue = todayOrders.reduce((s,o) => s + (o.total_amount||0), 0)

    // Yesterday same window for comparison
    const ydStart = new Date(todayStart); ydStart.setDate(ydStart.getDate()-1)
    const ydEnd   = new Date()
    ydEnd.setDate(ydEnd.getDate()-1)
    const ydOrders = rawOrders.filter(o => o.status === 'served' && o.created_at && new Date(o.created_at) >= ydStart && new Date(o.created_at) <= ydEnd)
    const ydRevenue = ydOrders.reduce((s,o) => s + (o.total_amount||0), 0)
    const revDelta = ydRevenue > 0 ? Math.round(((todayRevenue - ydRevenue)/ydRevenue)*100) : null

    // Top items
    const itemMap = {}
    for (const o of todayOrders) for (const item of (o.items||[])) {
      const name = item.name_en || item.name || item.sku
      if (name) itemMap[name] = (itemMap[name]||0) + (item.qty||1)
    }
    const topItems = Object.entries(itemMap).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,q])=>`${n} (${q})`).join(', ')

    // Inventory at risk
    const atRiskItems = inventoryRaw
      .map(item => { const h = (item.avg_daily_consumption||0)/24; return { ...item, hoursLeft: h>0?item.current_stock/h:null } })
      .filter(i => i.hoursLeft !== null && i.hoursLeft <= 4)
      .map(i => `${i.name_en||i.sku} (${i.hoursLeft.toFixed(1)}h left)`)

    // Staff
    const now = new Date()
    const onShiftNow = staffShifts.filter(s => {
      const st = s.shift_start ? new Date(s.shift_start) : null
      const en = s.shift_end   ? new Date(s.shift_end)   : null
      return st && en && st <= now && now <= en
    })

    // Active alerts
    const activeAlerts = insights.filter(i=>i.status==='new').slice(0,3).map(i=>i.summary_en||i.summary_vi)

    const dayName  = now.toLocaleDateString('en-US', { weekday:'long' })
    const timeOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'
    const occupied  = tables.filter(t=>t.status==='dining'||t.status==='reserved').length

    const prompt = `You are the AI operations advisor for PangPang restaurant. Generate a concise 2-3 sentence executive brief for the manager right now. Be specific, data-driven, and end with one concrete recommendation. Use natural language like a smart colleague would — no bullet points, no headers.

Current snapshot (${dayName} ${timeOfDay}):
- Revenue today so far: ₫${(todayRevenue/1000000).toFixed(1)}M across ${todayOrders.length} orders${revDelta !== null ? ` (${revDelta>0?'+':''}${revDelta}% vs same window yesterday)` : ''}
- Tables occupied: ${occupied}/${tables.length}
- Top selling items: ${topItems||'none yet'}
- Staff on shift: ${onShiftNow.length} (${onShiftNow.map(s=>s.name||s.role).join(', ')||'none'})
${atRiskItems.length ? `- Inventory at risk: ${atRiskItems.join(', ')}` : '- Inventory: all stock levels OK'}
${activeAlerts.length ? `- Active alerts: ${activeAlerts.join('; ')}` : '- No active alerts'}

Respond with the executive brief only — no preamble.`

    setBriefLoading(true)
    api.post('/api/consultant/messages', { message: prompt })
      .finally(() => setBriefLoading(false))
  }, [rawOrders, tables, staffShifts, inventoryRaw, insights])

  const cutoff = useMemo(() => {
    if (range === 'day') { const d = new Date(); d.setHours(0,0,0,0); return d }
    return new Date(Date.now() - RANGE_DAYS[range] * 86400000)
  }, [range])

  const rangeOrders = useMemo(() => {
    if (!rawOrders) return []
    return rawOrders.filter(o => o.created_at && new Date(o.created_at) >= cutoff)
  }, [rawOrders, cutoff])

  const served = useMemo(() => rangeOrders.filter(o => o.status === 'served'), [rangeOrders])

  const kpis = useMemo(() => {
    const revenue   = served.reduce((s,o) => s + (o.total_amount||0), 0)
    const foodCost  = Math.round(revenue * FOOD_COST_PCT)
    const laborCost = Math.round(staffShifts.reduce((s,sh) => {
      const start = sh.shift_start ? new Date(sh.shift_start) : null
      const end   = sh.shift_end   ? new Date(sh.shift_end)   : null
      return s + (start && end ? Math.max(0,(end-start)/3600000) * HOURLY_WAGE : 0)
    }, 0))
    const profit = revenue - foodCost - laborCost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0
    return { revenue, foodCost, laborCost, profit, margin, orders: served.length, guests: served.length }
  }, [served, staffShifts])

  // ── Revenue Trend (line chart) ──────────────────────────────────────────
  const revenueTrend = useMemo(() => {
    if (!rawOrders) return []
    const days = range === 'day' ? 1 : range === 'week' ? 7 : 30
    const map = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
      const key = range === 'day'
        ? `${String(d.getHours()).padStart(2,'0')}:00`
        : `${d.getMonth()+1}/${d.getDate()}`
      map[key] = 0
    }
    for (const o of rawOrders) {
      if (o.status !== 'served' || !o.created_at) continue
      const d = new Date(o.created_at)
      if (d < cutoff) continue
      const key = range === 'day'
        ? `${String(d.getHours()).padStart(2,'0')}:00`
        : `${d.getMonth()+1}/${d.getDate()}`
      if (key in map) map[key] += o.total_amount || 0
    }
    return Object.entries(map).map(([label, revenue]) => ({ label, revenue }))
  }, [rawOrders, range, cutoff])

  // ── Hourly / Daily bar chart ────────────────────────────────────────────
  const hourlyData = useMemo(() => {
    if (!rawOrders) return []
    if (range === 'day') {
      const hours = {}
      for (let h = 0; h < 24; h++) hours[h] = 0
      for (const o of rawOrders) {
        if (o.status !== 'served' || !o.created_at) continue
        const d = new Date(o.created_at)
        if (d < cutoff) continue
        hours[d.getHours()] = (hours[d.getHours()] || 0) + (o.total_amount || 0)
      }
      return Object.entries(hours).map(([h, v]) => ({ label: `${h}h`, revenue: v }))
    }
    return revenueTrend
  }, [rawOrders, range, cutoff, revenueTrend])

  // ── Top Selling Items ────────────────────────────────────────────────────
  const topItems = useMemo(() => {
    const map = {}
    for (const o of served) {
      for (const item of (o.items || [])) {
        const name = lang === 'vi' ? (item.name_vi || item.name || item.sku) : (item.name_en || item.name || item.sku)
        if (!name) continue
        map[name] = (map[name] || 0) + (item.qty || 1)
      }
    }
    return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0,6).map(([name,qty]) => ({ name, qty }))
  }, [served, lang])

  // ── Payment Methods ──────────────────────────────────────────────────────
  const paymentData = useMemo(() => {
    const map = {}
    for (const o of served) {
      const pm = o.payment_method || 'unknown'
      map[pm] = (map[pm] || 0) + 1
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [served])

  // ── Cost Breakdown ────────────────────────────────────────────────────────
  const costData = useMemo(() => {
    if (kpis.revenue === 0) return []
    return [
      { name: lang === 'vi' ? 'Giá vốn' : 'Food Cost',   value: kpis.foodCost },
      { name: lang === 'vi' ? 'Nhân sự' : 'Labor Cost',  value: kpis.laborCost },
      { name: lang === 'vi' ? 'Lợi nhuận' : 'Profit',    value: Math.max(0, kpis.profit) },
    ]
  }, [kpis, lang])

  // ── Sales by Channel (static) ─────────────────────────────────────────────
  const channelData = [
    { name: lang === 'vi' ? 'Tại bàn' : 'Dine-in',    value: 48 },
    { name: lang === 'vi' ? 'Mang về' : 'Takeaway',   value: 15 },
    { name: 'GrabFood',                                 value: 22 },
    { name: 'ShopeeFood',                               value: 9  },
  ]

  // ── Alerts ────────────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const deduped = Object.values(
      insights.filter(i => i.status === 'new').reduce((acc, i) => {
        const k = (i.summary_vi || i.summary_en || '').trim()
        if (!acc[k] || i.created_at > acc[k].created_at) acc[k] = i
        return acc
      }, {})
    ).sort((a,b) => b.created_at > a.created_at ? 1 : -1).slice(0, 4)
    return deduped
  }, [insights])

  // ── Recent Orders ─────────────────────────────────────────────────────────
  const recentOrders = useMemo(() => {
    return [...(rawOrders||[])].sort((a,b) => b.created_at > a.created_at ? 1 : -1).slice(0,5)
  }, [rawOrders])

  // ── At-risk Inventory ─────────────────────────────────────────────────────
  const atRisk = useMemo(() => {
    const now = Date.now()
    return inventoryRaw
      .map(item => {
        const hourly = (item.avg_daily_consumption || 0) / 24
        const hoursLeft = hourly > 0 ? item.current_stock / hourly : null
        return { ...item, hoursLeft }
      })
      .filter(item => item.hoursLeft !== null && item.hoursLeft <= 8)
      .sort((a,b) => a.hoursLeft - b.hoursLeft)
      .slice(0, 4)
  }, [inventoryRaw])

  // ── Staff on shift ────────────────────────────────────────────────────────
  const nowTime = new Date()
  const onShift = staffShifts.filter(s => {
    const start = s.shift_start ? new Date(s.shift_start) : null
    const end   = s.shift_end   ? new Date(s.shift_end)   : null
    return start && end && start <= nowTime && nowTime <= end
  })

  if (rawOrders === null || tables === null) {
    return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ color:'#888', fontSize:'14px' }}>Loading…</span>
    </div>
  }

  const occupied = tables.filter(t => t.status === 'dining' || t.status === 'reserved').length
  const dateLabel = nowTime.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { weekday:'long', month:'long', day:'numeric' })

  const rangeLabel = range === 'day'
    ? (lang === 'vi' ? 'Hôm nay' : 'Today')
    : range === 'week' ? '7D' : '30D'

  const TooltipVnd = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background:'white', border:'1px solid #E5E5EA', borderRadius:'8px', padding:'8px 12px', fontSize:'12px' }}>
        <div style={{ color:'#888', marginBottom:'2px' }}>{label}</div>
        <div style={{ fontWeight:700, color:'#E8002A' }}>{fmt(payload[0].value)}</div>
      </div>
    )
  }

  return (
    <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:'16px' }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:800, color:'#1A1A1A', margin:'0 0 2px', letterSpacing:'-0.02em' }}>
            {lang === 'vi' ? 'Bảng điều hành' : 'Executive Dashboard'}
          </h1>
          <p style={{ margin:0, fontSize:'13px', color:'#888' }}>{dateLabel}</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{ display:'flex', gap:'3px', background:'#F2F2F7', borderRadius:'8px', padding:'3px' }}>
            {[['day', lang==='vi'?'Hôm nay':'Today'], ['week','7D'], ['month','30D']].map(([r,lbl]) => (
              <button key={r} onClick={() => setRange(r)} style={{
                borderRadius:'6px', padding:'4px 14px', fontSize:'12px', border:'none', cursor:'pointer',
                fontWeight:600, background: range===r ? 'white' : 'transparent',
                color: range===r ? '#E8002A' : '#888',
                boxShadow: range===r ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'5px', background:'#DCFCE7', border:'1px solid #86EFAC', borderRadius:'99px', padding:'4px 12px' }}>
            <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#16A34A', display:'inline-block' }} />
            <span style={{ fontSize:'11px', fontWeight:600, color:'#166534' }}>{lang==='vi'?'Hệ thống hoạt động':'System Live'}</span>
          </div>
        </div>
      </div>

      {/* ── AI Consultant Executive Brief ── */}
      {(() => {
        // Find the most recent assistant reply that is a brief (not a user-triggered reply)
        // We show the very last assistant message as the brief
        const lastAssistant = consultantMessages?.find(m => m.role === 'assistant')
        const timeLabel = lastAssistant?.created_at
          ? new Date(lastAssistant.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
          : null
        const isGenerating = briefLoading || (consultantMessages !== null && !lastAssistant && briefFiredRef.current)
        return (
          <div style={{ background:'linear-gradient(135deg,#1A1A1A 0%,#2D1010 100%)', border:'1px solid #3D1515', borderRadius:'14px', padding:'16px 20px', display:'flex', alignItems:'flex-start', gap:'14px' }}>
            {/* Icon */}
            <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:'rgba(232,0,42,0.2)', border:'1px solid rgba(232,0,42,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flexShrink:0, marginTop:'2px' }}>🤖</div>

            {/* Content */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                <span style={{ fontSize:'11px', fontWeight:700, color:'#E8002A', textTransform:'uppercase', letterSpacing:'0.1em' }}>
                  {lang==='vi'?'Tóm tắt điều hành AI':'AI Executive Brief'}
                </span>
                {timeLabel && !isGenerating && (
                  <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)' }}>· {lang==='vi'?'Cập nhật lúc':'Updated at'} {timeLabel}</span>
                )}
                {isGenerating && (
                  <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.4)', display:'flex', alignItems:'center', gap:'5px' }}>
                    <span style={{ display:'inline-block', width:'7px', height:'7px', borderRadius:'50%', background:'#E8002A', animation:'scaleBounce 1s 0s infinite' }} />
                    <span style={{ display:'inline-block', width:'7px', height:'7px', borderRadius:'50%', background:'#E8002A', animation:'scaleBounce 1s 0.2s infinite' }} />
                    <span style={{ display:'inline-block', width:'7px', height:'7px', borderRadius:'50%', background:'#E8002A', animation:'scaleBounce 1s 0.4s infinite' }} />
                    &nbsp;{lang==='vi'?'Đang phân tích…':'Analysing…'}
                  </span>
                )}
              </div>

              {consultantMessages === null || (isGenerating && !lastAssistant) ? (
                <p style={{ margin:0, fontSize:'14px', color:'rgba(255,255,255,0.4)', fontStyle:'italic' }}>
                  {lang==='vi'?'Đang kết nối dữ liệu và tạo tóm tắt…':'Connecting to live data and generating brief…'}
                </p>
              ) : lastAssistant ? (
                <p style={{ margin:0, fontSize:'14px', color:'rgba(255,255,255,0.92)', lineHeight:1.7, fontWeight:400 }}>
                  {lastAssistant.content}
                </p>
              ) : (
                <p style={{ margin:0, fontSize:'14px', color:'rgba(255,255,255,0.45)', fontStyle:'italic' }}>
                  {lang==='vi'?'Chưa có dữ liệu đủ để tạo tóm tắt.':'No data yet to generate a brief.'}
                </p>
              )}
            </div>

            {/* CTA */}
            <Link to="/consultant" style={{ flexShrink:0, padding:'8px 18px', background:'#E8002A', color:'white', borderRadius:'99px', fontWeight:700, fontSize:'12px', textDecoration:'none', whiteSpace:'nowrap', alignSelf:'center' }}>
              {lang==='vi'?'Hỏi AI →':'Ask AI →'}
            </Link>
          </div>
        )
      })()}

      {/* ── KPI Row (7 cards) ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'10px' }}>
        {KPI_META.map(({ key, label, icon, color }) => {
          let raw = kpis[key]
          let display = key === 'margin' ? pct(raw) : key === 'revenue' || key === 'foodCost' || key === 'laborCost' || key === 'profit' ? fmt(raw) : raw
          const negative = key === 'foodCost' || key === 'laborCost' || (key === 'profit' && raw < 0)
          return (
            <div key={key} style={{ background:'white', border:`1px solid ${negative?'#FCA5A5':'#E5E5EA'}`, borderTop:`3px solid ${color}`, borderRadius:'10px', padding:'12px 10px', textAlign:'center' }}>
              <div style={{ fontSize:'16px', marginBottom:'6px' }}>{icon}</div>
              <div style={{ fontSize:'10px', fontWeight:700, color:'#AAA', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'4px' }}>
                {lang==='vi' ? label[1] : label[0]}
              </div>
              <div style={{ fontSize:'17px', fontWeight:800, color: negative?'#DC2626': key==='profit'&&raw>0?'#16A34A':'#1A1A1A', lineHeight:1.1 }}>{display}</div>
              <div style={{ fontSize:'10px', color:'#AAA', marginTop:'3px' }}>{rangeLabel}</div>
            </div>
          )
        })}
      </div>

      {/* ── Row 2: Revenue Trend | Profit Gauge | Sales by Channel ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 220px 1fr', gap:'14px' }}>

        {/* Revenue Trend */}
        <div style={card()}>
          <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'12px', color:'#1A1A1A' }}>
            {lang==='vi'?'Xu hướng doanh thu':'Revenue Trend'}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={revenueTrend} margin={{ top:4, right:4, left:0, bottom:0 }}>
              <XAxis dataKey="label" tick={{ fontSize:10, fill:'#AAA' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis hide />
              <Tooltip content={<TooltipVnd />} />
              <Line type="monotone" dataKey="revenue" stroke="#E8002A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Profit Gauge */}
        <div style={{ ...card(), display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'8px', color:'#1A1A1A' }}>
            {lang==='vi'?'Biên lợi nhuận':'Profit Margin'}
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <RadialBarChart cx="50%" cy="80%" innerRadius="60%" outerRadius="90%" startAngle={180} endAngle={0}
              data={[{ name:'margin', value: Math.max(0, Math.min(100, kpis.margin)), fill: kpis.margin >= 20 ? '#16A34A' : kpis.margin >= 5 ? '#F59E0B' : '#DC2626' }]}>
              <RadialBar dataKey="value" cornerRadius={6} background={{ fill:'#F2F2F7' }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div style={{ fontSize:'22px', fontWeight:800, color: kpis.margin>=20?'#16A34A':kpis.margin>=5?'#F59E0B':'#DC2626', marginTop:'-32px' }}>
            {pct(kpis.margin)}
          </div>
          <div style={{ fontSize:'11px', color:'#AAA', marginTop:'4px' }}>{lang==='vi'?'lợi nhuận/doanh thu':'profit / revenue'}</div>
        </div>

        {/* Sales by Channel */}
        <div style={card()}>
          <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'12px', color:'#1A1A1A' }}>
            {lang==='vi'?'Doanh số theo kênh':'Sales by Channel'}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart layout="vertical" data={channelData} margin={{ top:0, right:16, left:0, bottom:0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize:11, fill:'#555' }} axisLine={false} tickLine={false} width={70} />
              <Tooltip formatter={(v) => v} />
              <Bar dataKey="value" radius={[0,4,4,0]}>
                {channelData.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Row 3: Hourly/Daily Revenue | Top Selling Items ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>

        {/* Hourly/Daily Column Chart */}
        <div style={card()}>
          <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'12px', color:'#1A1A1A' }}>
            {range === 'day' ? (lang==='vi'?'Doanh thu theo giờ':'Hourly Sales') : (lang==='vi'?'Doanh thu theo ngày':'Daily Revenue')}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hourlyData} margin={{ top:4, right:4, left:0, bottom:0 }}>
              <XAxis dataKey="label" tick={{ fontSize:9, fill:'#AAA' }} axisLine={false} tickLine={false} interval={range==='day'?3:'preserveStartEnd'} />
              <YAxis hide />
              <Tooltip content={<TooltipVnd />} />
              <Bar dataKey="revenue" fill="#E8002A" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Selling Items */}
        <div style={card()}>
          <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'12px', color:'#1A1A1A' }}>
            {lang==='vi'?'Món bán chạy nhất':'Top Selling Items'}
          </div>
          {topItems.length === 0 ? (
            <p style={{ fontSize:'13px', color:'#AAA', margin:0 }}>{lang==='vi'?'Chưa có dữ liệu':'No data yet'}</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart layout="vertical" data={topItems} margin={{ top:0, right:16, left:0, bottom:0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize:11, fill:'#555' }} axisLine={false} tickLine={false} width={100} />
                <Tooltip formatter={(v) => [`${v} sold`, '']} />
                <Bar dataKey="qty" radius={[0,4,4,0]}>
                  {topItems.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Row 4: Cost Breakdown | Payment Methods ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>

        {/* Cost Breakdown Donut */}
        <div style={card({ display:'flex', flexDirection:'column' })}>
          <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'8px', color:'#1A1A1A' }}>
            {lang==='vi'?'Phân tích chi phí':'Cost Breakdown'}
          </div>
          {costData.length === 0 ? (
            <p style={{ fontSize:'13px', color:'#AAA', margin:0 }}>{lang==='vi'?'Chưa có dữ liệu':'No data yet'}</p>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={costData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3}>
                    {costData.map((_,i) => <Cell key={i} fill={['#F59E0B','#6366F1','#16A34A'][i]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'8px' }}>
                {costData.map((d,i) => (
                  <div key={d.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                      <span style={{ width:'10px', height:'10px', borderRadius:'2px', background:['#F59E0B','#6366F1','#16A34A'][i], display:'inline-block' }} />
                      <span style={{ fontSize:'12px', color:'#555' }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize:'12px', fontWeight:700, color:'#1A1A1A' }}>{fmt(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Payment Methods Donut */}
        <div style={card({ display:'flex', flexDirection:'column' })}>
          <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'8px', color:'#1A1A1A' }}>
            {lang==='vi'?'Phương thức thanh toán':'Payment Methods'}
          </div>
          {paymentData.length === 0 ? (
            <p style={{ fontSize:'13px', color:'#AAA', margin:0 }}>{lang==='vi'?'Chưa có dữ liệu':'No data yet'}</p>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={paymentData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3}>
                    {paymentData.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v,n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'8px' }}>
                {paymentData.map((d,i) => {
                  const total = paymentData.reduce((s,x) => s+x.value, 0)
                  return (
                    <div key={d.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <span style={{ width:'10px', height:'10px', borderRadius:'2px', background:COLORS[i%COLORS.length], display:'inline-block' }} />
                        <span style={{ fontSize:'12px', color:'#555', textTransform:'capitalize' }}>{d.name}</span>
                      </div>
                      <span style={{ fontSize:'12px', fontWeight:700, color:'#1A1A1A' }}>{d.value} ({pct(d.value/total*100)})</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 5: Recent Orders | Alerts | Inventory | Staff ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'14px' }}>

        {/* Recent Orders */}
        <div style={card()}>
          <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'10px', color:'#1A1A1A' }}>
            {lang==='vi'?'Đơn gần đây':'Recent Orders'}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {recentOrders.length === 0
              ? <p style={{ fontSize:'12px', color:'#AAA', margin:0 }}>{lang==='vi'?'Chưa có đơn':'No orders yet'}</p>
              : recentOrders.map((o) => {
                const statusColor = o.status==='served'?'#16A34A':o.status==='cancelled'?'#DC2626':'#F59E0B'
                return (
                  <div key={o.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #F2F2F7' }}>
                    <div>
                      <div style={{ fontSize:'12px', fontWeight:600, color:'#1A1A1A' }}>{o.table_id || '—'}</div>
                      <div style={{ fontSize:'10px', color:'#AAA' }}>{o.created_at ? new Date(o.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:'12px', fontWeight:700, color:'#1A1A1A' }}>{fmt(o.total_amount||0)}</div>
                      <div style={{ fontSize:'10px', fontWeight:600, color:statusColor, textTransform:'capitalize' }}>{o.status}</div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Alerts */}
        <div style={card()}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
            <span style={{ fontWeight:700, fontSize:'13px', color:'#1A1A1A' }}>{lang==='vi'?'Cảnh báo':'Alerts'}</span>
            {alerts.length > 0 && <span style={{ background:'#E8002A', color:'white', fontSize:'9px', fontWeight:700, borderRadius:'99px', padding:'2px 7px' }}>{alerts.length}</span>}
          </div>
          {ackError && <p style={{ color:'#DC2626', fontSize:'11px', margin:'0 0 6px' }}>{ackError}</p>}
          {alerts.length === 0
            ? <div style={{ textAlign:'center', padding:'12px 0' }}>
                <div style={{ fontSize:'24px' }}>✅</div>
                <p style={{ fontSize:'12px', color:'#888', margin:'4px 0 0' }}>{lang==='vi'?'Không có cảnh báo':'All clear'}</p>
              </div>
            : alerts.map((ins) => (
              <div key={ins.id} style={{ borderLeft:`3px solid ${ins.severity==='critical'?'#DC2626':'#F59E0B'}`, paddingLeft:'8px', marginBottom:'8px' }}>
                <p style={{ fontSize:'11px', color:'#333', margin:'0 0 3px', lineHeight:1.4 }}>
                  {lang==='vi' ? ins.summary_vi : ins.summary_en}
                </p>
                {ins.status==='new' && (
                  <button onClick={async()=>{ try{await api.post(`/api/insights/${ins.id}/acknowledge`)}catch{setAckError('Error')} }}
                    style={{ fontSize:'10px', color:'#E8002A', background:'none', border:'none', padding:0, cursor:'pointer', fontWeight:600 }}>
                    {lang==='vi'?'Đã xử lý →':'Resolve →'}
                  </button>
                )}
              </div>
            ))}
        </div>

        {/* Inventory At-Risk */}
        <div style={card()}>
          <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'10px', color:'#1A1A1A' }}>
            {lang==='vi'?'Tồn kho nguy cơ':'Inventory Alert'}
          </div>
          {atRisk.length === 0
            ? <div style={{ textAlign:'center', padding:'12px 0' }}>
                <div style={{ fontSize:'24px' }}>📦</div>
                <p style={{ fontSize:'12px', color:'#888', margin:'4px 0 0' }}>{lang==='vi'?'Tồn kho ổn định':'Stock levels OK'}</p>
              </div>
            : atRisk.map((item) => (
              <div key={item.sku} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #F2F2F7' }}>
                <div style={{ fontSize:'12px', fontWeight:600, color:'#1A1A1A' }}>{lang==='vi'?item.name_vi:item.name_en}</div>
                <div style={{ fontSize:'11px', fontWeight:700, color: item.hoursLeft<=2?'#DC2626':'#F59E0B' }}>
                  {item.hoursLeft<=0 ? (lang==='vi'?'Hết':'Out') : `${item.hoursLeft.toFixed(1)}h`}
                </div>
              </div>
            ))}
        </div>

        {/* Staff Performance */}
        <div style={card()}>
          <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'10px', color:'#1A1A1A' }}>
            {lang==='vi'?'Nhân sự ca này':'Staff on Shift'}
          </div>
          <div style={{ marginBottom:'8px' }}>
            <span style={{ fontSize:'22px', fontWeight:800, color:'#1A1A1A' }}>{onShift.length}</span>
            <span style={{ fontSize:'12px', color:'#AAA', marginLeft:'4px' }}>/ {staffShifts.length} {lang==='vi'?'nhân viên':'staff'}</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            {onShift.slice(0,4).map((s) => (
              <div key={s.staff_id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid #F2F2F7' }}>
                <div>
                  <div style={{ fontSize:'12px', fontWeight:600, color:'#1A1A1A' }}>{s.name}</div>
                  <div style={{ fontSize:'10px', color:'#AAA', textTransform:'capitalize' }}>{s.role}</div>
                </div>
                <span style={{ background:'#DCFCE7', color:'#166534', fontSize:'9px', fontWeight:700, borderRadius:'99px', padding:'2px 7px' }}>ON</span>
              </div>
            ))}
            {onShift.length === 0 && <p style={{ fontSize:'12px', color:'#AAA', margin:0 }}>{lang==='vi'?'Không có ca làm':'No active shifts'}</p>}
          </div>
        </div>
      </div>

    </div>
  )
}
