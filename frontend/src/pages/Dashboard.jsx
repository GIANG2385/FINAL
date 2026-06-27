import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ReferenceLine,
} from 'recharts'
import supabase from '../services/supabase'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { auth } from '../services/firebase'

const FOOD_COST_PCT = 0.32
const HOURLY_WAGE   = 25000
const RANGE_DAYS    = { day: 1, week: 7, month: 30 }
const COLORS = ['#E8002A','#6366F1','#F59E0B','#22C55E','#0EA5E9','#A855F7']
const COST_COLORS = ['#F59E0B','#6366F1','#16A34A']

function fmt(n) {
  if (n >= 1_000_000_000) return `₫${(n/1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `₫${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `₫${(n/1_000).toFixed(0)}K`
  return `₫${n}`
}
function pct(n) { return `${n.toFixed(1)}%` }

const card = (extra = {}) => ({
  background: 'white', border: '1px solid #E5E5EA', borderRadius: '12px',
  padding: '16px 18px', transition: 'box-shadow 0.15s', ...extra,
})

const KPI_META = [
  { key: 'revenue',   label: ['Revenue','Doanh thu'],   icon: '₫',  color: '#E8002A', filterKey: null },
  { key: 'foodCost',  label: ['Food Cost','Giá vốn'],   icon: '🍽', color: '#F59E0B', filterKey: null },
  { key: 'laborCost', label: ['Labor Cost','Nhân sự'],  icon: '👥', color: '#6366F1', filterKey: null },
  { key: 'profit',    label: ['Profit','Lợi nhuận'],    icon: '📈', color: '#16A34A', filterKey: null },
  { key: 'margin',    label: ['Margin','Biên LN'],      icon: '%',  color: '#0EA5E9', filterKey: null },
  { key: 'orders',    label: ['Orders','Đơn hàng'],     icon: '🧾', color: '#A855F7', filterKey: 'kpi' },
  { key: 'guests',    label: ['Guests','Khách'],        icon: '⊞', color: '#EC4899', filterKey: null },
]

// ── Drill-through order modal ──────────────────────────────────────────────
function OrderModal({ order, lang, onClose }) {
  if (!order) return null
  const statusColor = order.status==='served'?'#16A34A':order.status==='cancelled'?'#DC2626':'#F59E0B'
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'white', borderRadius:'16px', padding:'24px', width:'420px', maxHeight:'80vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <div>
            <div style={{ fontSize:'16px', fontWeight:800, color:'#1A1A1A' }}>{order.id}</div>
            <div style={{ fontSize:'12px', color:'#AAA', marginTop:'2px' }}>
              {order.created_at ? new Date(order.created_at).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#888', lineHeight:1 }}>×</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'16px' }}>
          {[
            ['Table', order.table_id || (lang==='vi'?'Mang về':'Takeaway')],
            ['Status', order.status],
            ['Payment', order.payment_method || '—'],
            ['Total', fmt(order.total_amount||0)],
          ].map(([k,v]) => (
            <div key={k} style={{ background:'#F9F9F9', borderRadius:'8px', padding:'10px 12px' }}>
              <div style={{ fontSize:'10px', fontWeight:700, color:'#AAA', textTransform:'uppercase', marginBottom:'3px' }}>{k}</div>
              <div style={{ fontSize:'13px', fontWeight:600, color: k==='Status'?statusColor:'#1A1A1A', textTransform:'capitalize' }}>{v}</div>
            </div>
          ))}
        </div>
        {(order.items||[]).length > 0 && (
          <>
            <div style={{ fontSize:'11px', fontWeight:700, color:'#AAA', textTransform:'uppercase', marginBottom:'8px' }}>Items</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {order.items.map((item,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 10px', background:'#F9F9F9', borderRadius:'8px' }}>
                  <span style={{ fontSize:'13px', color:'#333' }}>{lang==='vi'?(item.name_vi||item.name_en||item.sku):(item.name_en||item.name_vi||item.sku)}</span>
                  <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                    <span style={{ fontSize:'12px', color:'#AAA' }}>×{item.qty||1}</span>
                    <span style={{ fontSize:'13px', fontWeight:700, color:'#1A1A1A' }}>{fmt((item.unit_price||0)*(item.qty||1))}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ marginTop:'16px', padding:'12px', background:'#FFF5F5', borderRadius:'8px', display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontWeight:700, fontSize:'14px', color:'#1A1A1A' }}>Total</span>
          <span style={{ fontWeight:800, fontSize:'16px', color:'#E8002A' }}>{fmt(order.total_amount||0)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Filter chip ──────────────────────────────────────────────────────────────
function FilterChip({ label, onRemove }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'5px', background:'#FFF0F0', border:'1px solid #FCA5A5', borderRadius:'99px', padding:'3px 10px 3px 12px' }}>
      <span style={{ fontSize:'12px', fontWeight:600, color:'#E8002A' }}>{label}</span>
      <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:'#E8002A', fontSize:'14px', lineHeight:1, padding:0 }}>×</button>
    </div>
  )
}

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language

  // ── Data ──────────────────────────────────────────────────────────────────
  const [rawOrders,    setRawOrders]    = useState(null)
  const [staffShifts,  setStaffShifts]  = useState([])
  const [tables,       setTables]       = useState(null)
  const [insights,     setInsights]     = useState([])
  const [inventoryRaw, setInventoryRaw] = useState([])
  const [reservations, setReservations] = useState([])
  const [range,        setRange]        = useState('day')
  const [ackError,     setAckError]     = useState(null)

  // ── Interactivity state ───────────────────────────────────────────────────
  // `hour` = 0-23 for Today clicks; `date` = "M/D" string for 7D/30D clicks
  const [filters, setFilters] = useState({ channel: null, hour: null, date: null, item: null, payment: null })
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [hoveredCard, setHoveredCard]   = useState(null)

  function toggleFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: prev[key] === value ? null : value }))
  }
  function clearAllFilters() {
    setFilters({ channel: null, hour: null, date: null, item: null, payment: null })
  }
  const hasFilters = Object.values(filters).some(v => v !== null)

  // ── AI Consultant ─────────────────────────────────────────────────────────
  const [consultantMessages, setConsultantMessages] = useState(null)
  const [briefLoading,       setBriefLoading]       = useState(false)
  const chatUidRef    = useRef(null)
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

  useEffect(() => {
    if (briefFiredRef.current) return
    if (!rawOrders || !tables || staffShifts === null || inventoryRaw === null) return
    if (!chatUidRef.current) return
    briefFiredRef.current = true
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const todayOrders = rawOrders.filter(o => o.status === 'served' && o.created_at && new Date(o.created_at) >= todayStart)
    const todayRevenue = todayOrders.reduce((s,o) => s + (o.total_amount||0), 0)
    const ydStart = new Date(todayStart); ydStart.setDate(ydStart.getDate()-1)
    const ydEnd = new Date(); ydEnd.setDate(ydEnd.getDate()-1)
    const ydRevenue = rawOrders.filter(o => o.status==='served' && o.created_at && new Date(o.created_at)>=ydStart && new Date(o.created_at)<=ydEnd).reduce((s,o)=>s+(o.total_amount||0),0)
    const revDelta = ydRevenue > 0 ? Math.round(((todayRevenue-ydRevenue)/ydRevenue)*100) : null
    const itemMap = {}
    for (const o of todayOrders) for (const item of (o.items||[])) { const n=item.name_en||item.name||item.sku; if(n) itemMap[n]=(itemMap[n]||0)+(item.qty||1) }
    const topItems = Object.entries(itemMap).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,q])=>`${n}(${q})`).join(', ')
    const atRiskItems = inventoryRaw.map(i=>{ const h=(i.avg_daily_consumption||0)/24; return{...i,hoursLeft:h>0?i.current_stock/h:null} }).filter(i=>i.hoursLeft!==null&&i.hoursLeft<=4).map(i=>`${i.name_en||i.sku}(${i.hoursLeft.toFixed(1)}h)`)
    const now = new Date()
    const onShiftNow = staffShifts.filter(s=>{ const st=s.shift_start?new Date(s.shift_start):null; const en=s.shift_end?new Date(s.shift_end):null; return st&&en&&st<=now&&now<=en })
    const activeAlerts = insights.filter(i=>i.status==='new').slice(0,3).map(i=>i.summary_en||i.summary_vi)
    const dayName = now.toLocaleDateString('en-US',{weekday:'long'})
    const timeOfDay = now.getHours()<12?'morning':now.getHours()<17?'afternoon':'evening'
    const prompt = `You are the AI operations advisor for PangPang restaurant. Generate a concise 2-3 sentence executive brief for the manager right now. Be specific, data-driven, and end with one concrete recommendation. Use natural language like a smart colleague — no bullet points, no headers.\n\nCurrent snapshot (${dayName} ${timeOfDay}):\n- Revenue today: ₫${(todayRevenue/1e6).toFixed(1)}M across ${todayOrders.length} orders${revDelta!==null?` (${revDelta>0?'+':''}${revDelta}% vs yesterday)`:''}\n- Tables occupied: ${tables.filter(t=>t.status==='dining'||t.status==='reserved').length}/${tables.length}\n- Top items: ${topItems||'none'}\n- Staff on shift: ${onShiftNow.length}\n${atRiskItems.length?`- Inventory at risk: ${atRiskItems.join(', ')}`:'- Inventory: OK'}\n${activeAlerts.length?`- Alerts: ${activeAlerts.join('; ')}`:'- No alerts'}\n\nRespond with the executive brief only.`
    setBriefLoading(true)
    api.post('/api/consultant/messages', { message: prompt }).finally(() => setBriefLoading(false))
  }, [rawOrders, tables, staffShifts, inventoryRaw, insights])

  // ── Range & base filters ──────────────────────────────────────────────────
  const cutoff = useMemo(() => {
    if (range === 'day') { const d = new Date(); d.setHours(0,0,0,0); return d }
    return new Date(Date.now() - RANGE_DAYS[range] * 86400000)
  }, [range])

  const served = useMemo(() => {
    if (!rawOrders) return []
    return rawOrders.filter(o => o.status === 'served' && o.created_at && new Date(o.created_at) >= cutoff)
  }, [rawOrders, cutoff])

  // ── Cross-filtered orders — drives ALL charts & KPIs ─────────────────────
  const filteredServed = useMemo(() => {
    return served.filter(o => {
      if (filters.channel === 'dine_in'  && !o.table_id) return false
      if (filters.channel === 'takeaway' &&  o.table_id) return false
      if (filters.hour !== null) {
        if (new Date(o.created_at).getHours() !== filters.hour) return false
      }
      if (filters.date) {
        const d = new Date(o.created_at)
        if (`${d.getMonth()+1}/${d.getDate()}` !== filters.date) return false
      }
      if (filters.item) {
        const has = (o.items||[]).some(i => (i.name_en||i.name_vi||i.name||i.sku) === filters.item || (i.name_vi||i.name_en||i.name||i.sku) === filters.item)
        if (!has) return false
      }
      if (filters.payment && o.payment_method !== filters.payment) return false
      return true
    })
  }, [served, filters])

  // ── KPIs from filteredServed ──────────────────────────────────────────────
  const kpis = useMemo(() => {
    const revenue   = filteredServed.reduce((s,o) => s + (o.total_amount||0), 0)
    const foodCost  = Math.round(revenue * FOOD_COST_PCT)
    const laborCost = Math.round(staffShifts.reduce((s,sh) => {
      const start = sh.shift_start ? new Date(sh.shift_start) : null
      const end   = sh.shift_end   ? new Date(sh.shift_end)   : null
      return s + (start && end ? Math.max(0,(end-start)/3600000) * HOURLY_WAGE : 0)
    }, 0))
    const profit = revenue - foodCost - laborCost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0
    return { revenue, foodCost, laborCost, profit, margin, orders: filteredServed.length, guests: filteredServed.length }
  }, [filteredServed, staffShifts])

  // ── Revenue trend ─────────────────────────────────────────────────────────
  const revenueTrend = useMemo(() => {
    if (!rawOrders) return []
    const map = {}
    if (range === 'day') { for (let h=0;h<24;h++) map[`${String(h).padStart(2,'0')}:00`]=0 }
    else { const days=range==='week'?7:30; for(let i=days-1;i>=0;i--){ const d=new Date();d.setDate(d.getDate()-i);d.setHours(0,0,0,0); map[`${d.getMonth()+1}/${d.getDate()}`]=0 } }
    for (const o of filteredServed) {
      const d = new Date(o.created_at)
      const key = range==='day' ? `${String(d.getHours()).padStart(2,'0')}:00` : `${d.getMonth()+1}/${d.getDate()}`
      if (key in map) map[key] += o.total_amount||0
    }
    // attach dateKey for non-day so bars can be clicked to filter by day
    return Object.entries(map).map(([label,revenue]) => ({
      label, revenue,
      ...(range !== 'day' ? { dateKey: label } : { hour: parseInt(label) }),
    }))
  }, [rawOrders, filteredServed, range])

  // ── Hourly bar (day = per-hour; week/month = reuse revenueTrend daily) ───
  const hourlyData = useMemo(() => {
    if (!rawOrders) return []
    if (range !== 'day') return revenueTrend  // already has dateKey
    const hours = {}
    for (let h=0;h<24;h++) hours[h]=0
    for (const o of filteredServed) {
      const h = new Date(o.created_at).getHours()
      hours[h] = (hours[h]||0) + (o.total_amount||0)
    }
    return Object.entries(hours).map(([h,v]) => ({ label:`${h}h`, revenue:v, hour:Number(h) }))
  }, [rawOrders, filteredServed, range, revenueTrend])

  // ── Top items ─────────────────────────────────────────────────────────────
  const topItems = useMemo(() => {
    const map = {}
    for (const o of filteredServed) {
      for (const item of (o.items||[])) {
        const name = lang==='vi'?(item.name_vi||item.name_en||item.name||item.sku):(item.name_en||item.name_vi||item.name||item.sku)
        if (!name) continue
        map[name] = (map[name]||0)+(item.qty||1)
      }
    }
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,qty])=>({name,qty}))
  }, [filteredServed, lang])

  // ── Payment methods ───────────────────────────────────────────────────────
  const paymentData = useMemo(() => {
    const map = {}
    for (const o of filteredServed) { const pm=o.payment_method||'unknown'; map[pm]=(map[pm]||0)+1 }
    return Object.entries(map).map(([name,value])=>({name,value}))
  }, [filteredServed])

  // ── Cost breakdown ────────────────────────────────────────────────────────
  const costData = useMemo(() => {
    if (kpis.revenue===0) return []
    return [
      { name: lang==='vi'?'Giá vốn':'Food Cost',  value: kpis.foodCost  },
      { name: lang==='vi'?'Nhân sự':'Labor Cost', value: kpis.laborCost },
      { name: lang==='vi'?'Lợi nhuận':'Profit',   value: Math.max(0, kpis.profit) },
    ]
  }, [kpis, lang])

  // ── Channel data ──────────────────────────────────────────────────────────
  const channelData = useMemo(() => {
    let dineIn=0, takeaway=0
    for (const o of filteredServed) { if(o.table_id) dineIn++; else takeaway++ }
    return [
      { name: lang==='vi'?'Tại bàn':'Dine-in',  value: dineIn,   key: 'dine_in'  },
      { name: lang==='vi'?'Mang về':'Takeaway', value: takeaway, key: 'takeaway' },
    ]
  }, [filteredServed, lang])

  // ── Alerts, recent orders, at-risk, staff ────────────────────────────────
  const alerts = useMemo(() => Object.values(
    insights.filter(i=>i.status==='new').reduce((acc,i)=>{ const k=(i.summary_vi||i.summary_en||'').trim(); if(!acc[k]||i.created_at>acc[k].created_at) acc[k]=i; return acc },{})
  ).sort((a,b)=>b.created_at>a.created_at?1:-1).slice(0,4), [insights])

  const recentOrders = useMemo(() => {
    if (!filteredServed.length && !hasFilters) return [...(rawOrders||[])].sort((a,b)=>b.created_at>a.created_at?1:-1).slice(0,8)
    return [...filteredServed].sort((a,b)=>b.created_at>a.created_at?1:-1).slice(0,8)
  }, [filteredServed, rawOrders, hasFilters])

  const atRisk = useMemo(() => inventoryRaw
    .map(item=>{ const h=(item.avg_daily_consumption||0)/24; return{...item,hoursLeft:h>0?item.current_stock/h:null} })
    .filter(item=>item.hoursLeft!==null&&item.hoursLeft<=8)
    .sort((a,b)=>a.hoursLeft-b.hoursLeft).slice(0,4), [inventoryRaw])

  const nowTime = new Date()
  const onShift = staffShifts.filter(s=>{ const st=s.shift_start?new Date(s.shift_start):null; const en=s.shift_end?new Date(s.shift_end):null; return st&&en&&st<=nowTime&&nowTime<=en })

  if (rawOrders===null||tables===null) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <span style={{color:'#888',fontSize:'14px'}}>Loading…</span>
    </div>
  )

  const occupied  = tables.filter(t=>t.status==='dining'||t.status==='reserved').length
  const dateLabel = nowTime.toLocaleDateString(lang==='vi'?'vi-VN':'en-US',{weekday:'long',month:'long',day:'numeric'})
  const rangeLabel = range==='day'?(lang==='vi'?'Hôm nay':'Today'):range==='week'?'7D':'30D'

  const TooltipVnd = ({ active, payload, label }) => {
    if (!active||!payload?.length) return null
    return (
      <div style={{background:'white',border:'1px solid #E5E5EA',borderRadius:'8px',padding:'8px 12px',fontSize:'12px',boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
        <div style={{color:'#888',marginBottom:'2px'}}>{label}</div>
        <div style={{fontWeight:700,color:'#E8002A'}}>{fmt(payload[0].value)}</div>
        {filters.channel && <div style={{fontSize:'10px',color:'#AAA',marginTop:'2px'}}>Filtered: {filters.channel}</div>}
      </div>
    )
  }

  // active filter labels for chips
  const activeChips = [
    filters.channel && { key:'channel', label: filters.channel==='dine_in'?(lang==='vi'?'Tại bàn':'Dine-in'):(lang==='vi'?'Mang về':'Takeaway') },
    filters.hour!==null && { key:'hour', label: `${lang==='vi'?'Giờ':'Hour'} ${filters.hour}h` },
    filters.date && { key:'date', label: `${lang==='vi'?'Ngày':'Day'} ${filters.date}` },
    filters.item && { key:'item', label: filters.item },
    filters.payment && { key:'payment', label: filters.payment },
  ].filter(Boolean)

  return (
    <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:'16px'}}>

      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:'24px',fontWeight:800,color:'#1A1A1A',margin:'0 0 2px',letterSpacing:'-0.02em'}}>
            {lang==='vi'?'Bảng điều hành':'Executive Dashboard'}
          </h1>
          <p style={{margin:0,fontSize:'13px',color:'#888'}}>{dateLabel}</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          {hasFilters && (
            <button onClick={clearAllFilters} style={{padding:'5px 12px',background:'#FFF0F0',border:'1px solid #FCA5A5',borderRadius:'99px',fontSize:'11px',fontWeight:700,color:'#E8002A',cursor:'pointer'}}>
              {lang==='vi'?'Xóa bộ lọc':'Clear filters'} ×
            </button>
          )}
          <div style={{display:'flex',gap:'3px',background:'#F2F2F7',borderRadius:'8px',padding:'3px'}}>
            {[['day',lang==='vi'?'Hôm nay':'Today'],['week','7D'],['month','30D']].map(([r,lbl])=>(
              <button key={r} onClick={()=>{setRange(r);clearAllFilters()}} style={{
                borderRadius:'6px',padding:'4px 14px',fontSize:'12px',border:'none',cursor:'pointer',
                fontWeight:600,background:range===r?'white':'transparent',
                color:range===r?'#E8002A':'#888',
                boxShadow:range===r?'0 1px 3px rgba(0,0,0,0.1)':'none',
              }}>{lbl}</button>
            ))}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'5px',background:'#DCFCE7',border:'1px solid #86EFAC',borderRadius:'99px',padding:'4px 12px'}}>
            <span style={{width:'6px',height:'6px',borderRadius:'50%',background:'#16A34A',display:'inline-block'}}/>
            <span style={{fontSize:'11px',fontWeight:600,color:'#166534'}}>{lang==='vi'?'Hệ thống hoạt động':'System Live'}</span>
          </div>
        </div>
      </div>

      {/* ── Active filter chips ── */}
      {activeChips.length > 0 && (
        <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
          <span style={{fontSize:'11px',fontWeight:700,color:'#AAA',textTransform:'uppercase',letterSpacing:'0.08em'}}>
            {lang==='vi'?'Lọc theo:':'Filtered by:'}
          </span>
          {activeChips.map(c=>(
            <FilterChip key={c.key} label={c.label} onRemove={()=>setFilters(prev=>({...prev,[c.key]:null}))} />
          ))}
          <span style={{fontSize:'12px',color:'#AAA'}}>— {filteredServed.length} {lang==='vi'?'đơn':'orders'} ({served.length} {lang==='vi'?'tổng':'total'})</span>
        </div>
      )}

      {/* ── AI Executive Brief ── */}
      {(() => {
        const lastAssistant = consultantMessages?.find(m=>m.role==='assistant')
        const timeLabel = lastAssistant?.created_at ? new Date(lastAssistant.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : null
        const isGenerating = briefLoading||(consultantMessages!==null&&!lastAssistant&&briefFiredRef.current)
        return (
          <div style={{background:'linear-gradient(135deg,#1A1A1A 0%,#2D1010 100%)',border:'1px solid #3D1515',borderRadius:'14px',padding:'16px 20px',display:'flex',alignItems:'flex-start',gap:'14px'}}>
            <div style={{width:'40px',height:'40px',borderRadius:'50%',background:'rgba(232,0,42,0.2)',border:'1px solid rgba(232,0,42,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'20px',flexShrink:0,marginTop:'2px'}}>🤖</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                <span style={{fontSize:'11px',fontWeight:700,color:'#E8002A',textTransform:'uppercase',letterSpacing:'0.1em'}}>{lang==='vi'?'Tóm tắt điều hành AI':'AI Executive Brief'}</span>
                {timeLabel&&!isGenerating&&<span style={{fontSize:'11px',color:'rgba(255,255,255,0.35)'}}>· {lang==='vi'?'Cập nhật lúc':'Updated at'} {timeLabel}</span>}
                {isGenerating&&<span style={{fontSize:'11px',color:'rgba(255,255,255,0.4)',display:'flex',alignItems:'center',gap:'5px'}}>
                  {[0,0.2,0.4].map((d,i)=><span key={i} style={{display:'inline-block',width:'7px',height:'7px',borderRadius:'50%',background:'#E8002A',animation:`scaleBounce 1s ${d}s infinite`}}/>)}
                  &nbsp;{lang==='vi'?'Đang phân tích…':'Analysing…'}
                </span>}
              </div>
              {consultantMessages===null||(isGenerating&&!lastAssistant)
                ? <p style={{margin:0,fontSize:'14px',color:'rgba(255,255,255,0.4)',fontStyle:'italic'}}>{lang==='vi'?'Đang kết nối dữ liệu…':'Connecting to live data…'}</p>
                : lastAssistant
                  ? <p style={{margin:0,fontSize:'14px',color:'rgba(255,255,255,0.92)',lineHeight:1.7}}>{lastAssistant.content}</p>
                  : <p style={{margin:0,fontSize:'14px',color:'rgba(255,255,255,0.45)',fontStyle:'italic'}}>{lang==='vi'?'Chưa có dữ liệu.':'No data yet.'}</p>
              }
            </div>
            <Link to="/consultant" style={{flexShrink:0,padding:'8px 18px',background:'#E8002A',color:'white',borderRadius:'99px',fontWeight:700,fontSize:'12px',textDecoration:'none',whiteSpace:'nowrap',alignSelf:'center'}}>
              {lang==='vi'?'Hỏi AI →':'Ask AI →'}
            </Link>
          </div>
        )
      })()}

      {/* ── KPI Row (7 cards) — clickable, highlights filtered state ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'10px'}}>
        {KPI_META.map(({key,label,icon,color})=>{
          const raw = kpis[key]
          const display = key==='margin'?pct(raw):['revenue','foodCost','laborCost','profit'].includes(key)?fmt(raw):raw
          const negative = key==='foodCost'||key==='laborCost'||(key==='profit'&&raw<0)
          const isHovered = hoveredCard===key
          return (
            <div key={key}
              onMouseEnter={()=>setHoveredCard(key)}
              onMouseLeave={()=>setHoveredCard(null)}
              style={{
                background:'white', borderRadius:'10px', padding:'12px 10px', textAlign:'center',
                border:`1px solid ${negative?'#FCA5A5':'#E5E5EA'}`,
                borderTop:`3px solid ${color}`,
                cursor:'default',
                transform: isHovered?'translateY(-2px)':'none',
                boxShadow: isHovered?`0 6px 20px ${color}22`:'none',
                transition:'transform 0.15s, box-shadow 0.15s',
              }}>
              <div style={{fontSize:'16px',marginBottom:'6px'}}>{icon}</div>
              <div style={{fontSize:'10px',fontWeight:700,color:'#AAA',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:'4px'}}>
                {lang==='vi'?label[1]:label[0]}
              </div>
              <div style={{fontSize:'17px',fontWeight:800,color:negative?'#DC2626':key==='profit'&&raw>0?'#16A34A':'#1A1A1A',lineHeight:1.1,transition:'color 0.2s'}}>{display}</div>
              <div style={{fontSize:'10px',color:'#AAA',marginTop:'3px'}}>{rangeLabel}{hasFilters?' · filtered':''}</div>
            </div>
          )
        })}
      </div>

      {/* ── Row 2: Revenue Trend | Sales by Channel ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}}>

        {/* Revenue Trend — click to filter by hour (Today) or day (7D/30D) */}
        <div style={card()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
            <span style={{fontWeight:700,fontSize:'13px',color:'#1A1A1A'}}>{lang==='vi'?'Xu hướng doanh thu':'Revenue Trend'}</span>
            {(filters.hour!==null||filters.date)&&(
              <button onClick={()=>setFilters(p=>({...p,hour:null,date:null}))} style={{fontSize:'11px',color:'#E8002A',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>×{lang==='vi'?'xóa':'clear'}</button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={revenueTrend} margin={{top:8,right:8,left:0,bottom:0}}>
              <XAxis dataKey="label" tick={{fontSize:10,fill:'#AAA'}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
              <YAxis hide/>
              <Tooltip content={<TooltipVnd/>}/>
              {filters.hour!==null&&range==='day'&&<ReferenceLine x={`${String(filters.hour).padStart(2,'0')}:00`} stroke="#E8002A" strokeDasharray="4 2"/>}
              {filters.date&&range!=='day'&&<ReferenceLine x={filters.date} stroke="#E8002A" strokeDasharray="4 2"/>}
              <Line type="monotone" dataKey="revenue" stroke="#E8002A" strokeWidth={2.5}
                dot={(props)=>{
                  const { cx,cy,payload } = props
                  const isActive = range==='day'
                    ? (filters.hour===null||filters.hour===payload.hour)
                    : (filters.date===null||filters.date===payload.dateKey)
                  return <circle key={cx} cx={cx} cy={cy} r={5} fill={isActive?'#E8002A':'#FCA5A5'}
                    stroke="white" strokeWidth={2} style={{cursor:'pointer'}}
                    onClick={()=>{ if(range==='day'&&payload.hour!==undefined) toggleFilter('hour',payload.hour); else if(payload.dateKey) toggleFilter('date',payload.dateKey) }}/>
                }}
                activeDot={{r:8,fill:'#E8002A',stroke:'white',strokeWidth:2,cursor:'pointer',
                  onClick:(_,payload)=>{ if(range==='day'&&payload.hour!==undefined) toggleFilter('hour',payload.hour); else if(payload.dateKey) toggleFilter('date',payload.dateKey) }}}/>
            </LineChart>
          </ResponsiveContainer>
          <p style={{margin:'4px 0 0',fontSize:'10px',color:'#AAA',textAlign:'center'}}>
            {range==='day'?(lang==='vi'?'Nhấp điểm để lọc theo giờ':'Click a point to filter by hour'):(lang==='vi'?'Nhấp điểm để lọc theo ngày':'Click a point to filter by day')}
          </p>
        </div>

        {/* Sales by Channel — click bar to cross-filter */}
        <div style={card()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
            <span style={{fontWeight:700,fontSize:'13px',color:'#1A1A1A'}}>{lang==='vi'?'Doanh số theo kênh':'Sales by Channel'}</span>
            {filters.channel&&<button onClick={()=>setFilters(p=>({...p,channel:null}))} style={{fontSize:'11px',color:'#E8002A',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>×{lang==='vi'?'xóa':'clear'}</button>}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart layout="vertical" data={channelData} margin={{top:0,right:16,left:0,bottom:0}}>
              <XAxis type="number" hide/>
              <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:'#555'}} axisLine={false} tickLine={false} width={70}/>
              <Tooltip formatter={(v,n,p)=>[`${v} orders`,p.payload.name]}/>
              <Bar dataKey="value" radius={[0,4,4,0]} cursor="pointer"
                onClick={(data)=>toggleFilter('channel', data.key)}>
                {channelData.map((d,i)=>(
                  <Cell key={i} fill={COLORS[i%COLORS.length]}
                    opacity={filters.channel&&filters.channel!==d.key?0.35:1}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p style={{margin:'4px 0 0',fontSize:'10px',color:'#AAA',textAlign:'center'}}>{lang==='vi'?'Nhấp để lọc theo kênh':'Click bar to filter by channel'}</p>
        </div>
      </div>

      {/* ── Row 3: Hourly Sales | Top Selling Items ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}}>

        {/* Hourly/Daily column — click to filter by hour (Today) or day (7D/30D) */}
        <div style={card()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
            <span style={{fontWeight:700,fontSize:'13px',color:'#1A1A1A'}}>
              {range==='day'?(lang==='vi'?'Doanh thu theo giờ':'Hourly Sales'):(lang==='vi'?'Doanh thu theo ngày':'Daily Revenue')}
            </span>
            {(filters.hour!==null||filters.date)&&(
              <button onClick={()=>setFilters(p=>({...p,hour:null,date:null}))} style={{fontSize:'11px',color:'#E8002A',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>×{lang==='vi'?'xóa':'clear'}</button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hourlyData} margin={{top:4,right:4,left:0,bottom:0}}>
              <XAxis dataKey="label" tick={{fontSize:9,fill:'#AAA'}} axisLine={false} tickLine={false} interval={range==='day'?3:'preserveStartEnd'}/>
              <YAxis hide/>
              <Tooltip content={<TooltipVnd/>}/>
              <Bar dataKey="revenue" radius={[3,3,0,0]} cursor="pointer"
                onClick={(data)=>{ if(range==='day') toggleFilter('hour',data.hour); else toggleFilter('date',data.dateKey) }}>
                {hourlyData.map((d,i)=>{
                  const active = range==='day'
                    ? (filters.hour===null || filters.hour===d.hour)
                    : (filters.date===null || filters.date===d.dateKey)
                  return <Cell key={i} fill="#E8002A" opacity={active?1:0.3}/>
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p style={{margin:'4px 0 0',fontSize:'10px',color:'#AAA',textAlign:'center'}}>
            {range==='day'?(lang==='vi'?'Nhấp cột để lọc theo giờ':'Click a bar to filter by hour'):(lang==='vi'?'Nhấp cột để lọc theo ngày':'Click a bar to filter by day')}
          </p>
        </div>

        {/* Top Selling Items — click to filter */}
        <div style={card()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
            <span style={{fontWeight:700,fontSize:'13px',color:'#1A1A1A'}}>{lang==='vi'?'Món bán chạy nhất':'Top Selling Items'}</span>
            {filters.item&&<button onClick={()=>setFilters(p=>({...p,item:null}))} style={{fontSize:'11px',color:'#E8002A',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>×{lang==='vi'?'xóa':'clear'}</button>}
          </div>
          {topItems.length===0
            ? <p style={{fontSize:'13px',color:'#AAA',margin:0}}>{lang==='vi'?'Chưa có dữ liệu':'No data yet'}</p>
            : <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart layout="vertical" data={topItems} margin={{top:0,right:16,left:0,bottom:0}}>
                  <XAxis type="number" hide/>
                  <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:'#555'}} axisLine={false} tickLine={false} width={100}/>
                  <Tooltip formatter={(v)=>[`${v} ${lang==='vi'?'phần bán':'sold'}`,'']}/>
                  <Bar dataKey="qty" radius={[0,4,4,0]} cursor="pointer"
                    onClick={(data)=>toggleFilter('item', data.name)}>
                    {topItems.map((d,i)=>(
                      <Cell key={i} fill={COLORS[i%COLORS.length]}
                        opacity={filters.item&&filters.item!==d.name?0.3:1}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p style={{margin:'4px 0 0',fontSize:'10px',color:'#AAA',textAlign:'center'}}>{lang==='vi'?'Nhấp để lọc theo món':'Click an item to filter orders'}</p>
            </>
          }
        </div>
      </div>

      {/* ── Row 4: Cost Breakdown | Payment Methods ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}}>

        {/* Cost Breakdown */}
        <div style={card({display:'flex',flexDirection:'column'})}>
          <div style={{fontWeight:700,fontSize:'13px',marginBottom:'8px',color:'#1A1A1A'}}>{lang==='vi'?'Phân tích chi phí':'Cost Breakdown'}</div>
          {costData.length===0
            ? <p style={{fontSize:'13px',color:'#AAA',margin:0}}>{lang==='vi'?'Chưa có dữ liệu':'No data yet'}</p>
            : <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={costData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3}>
                      {costData.map((_,i)=><Cell key={i} fill={COST_COLORS[i]}/>)}
                    </Pie>
                    <Tooltip formatter={(v)=>fmt(v)}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{flex:1,display:'flex',flexDirection:'column',gap:'8px'}}>
                  {costData.map((d,i)=>(
                    <div key={d.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <span style={{width:'10px',height:'10px',borderRadius:'2px',background:COST_COLORS[i],display:'inline-block'}}/>
                        <span style={{fontSize:'12px',color:'#555'}}>{d.name}</span>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:'12px',fontWeight:700,color:'#1A1A1A'}}>{fmt(d.value)}</div>
                        <div style={{fontSize:'10px',color:'#AAA'}}>{kpis.revenue>0?pct(d.value/kpis.revenue*100):'-'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
          }
        </div>

        {/* Payment Methods — click slice to filter */}
        <div style={card({display:'flex',flexDirection:'column'})}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
            <span style={{fontWeight:700,fontSize:'13px',color:'#1A1A1A'}}>{lang==='vi'?'Phương thức thanh toán':'Payment Methods'}</span>
            {filters.payment&&<button onClick={()=>setFilters(p=>({...p,payment:null}))} style={{fontSize:'11px',color:'#E8002A',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>×{lang==='vi'?'xóa':'clear'}</button>}
          </div>
          {paymentData.length===0
            ? <p style={{fontSize:'13px',color:'#AAA',margin:0}}>{lang==='vi'?'Chưa có dữ liệu':'No data yet'}</p>
            : <>
              <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={paymentData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} cursor="pointer"
                      onClick={(data)=>toggleFilter('payment', data.name)}>
                      {paymentData.map((d,i)=>(
                        <Cell key={i} fill={COLORS[i%COLORS.length]}
                          opacity={filters.payment&&filters.payment!==d.name?0.3:1}/>
                      ))}
                    </Pie>
                    <Tooltip formatter={(v,n)=>[v,n]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{flex:1,display:'flex',flexDirection:'column',gap:'8px'}}>
                  {paymentData.map((d,i)=>{
                    const total=paymentData.reduce((s,x)=>s+x.value,0)
                    const isSelected = filters.payment===d.name
                    return (
                      <div key={d.name} onClick={()=>toggleFilter('payment',d.name)}
                        style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',padding:'4px 6px',borderRadius:'6px',background:isSelected?'#FFF0F0':'transparent',opacity:filters.payment&&!isSelected?0.4:1,transition:'all 0.15s'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                          <span style={{width:'10px',height:'10px',borderRadius:'2px',background:COLORS[i%COLORS.length],display:'inline-block'}}/>
                          <span style={{fontSize:'12px',color:'#555',textTransform:'capitalize'}}>{d.name}</span>
                        </div>
                        <span style={{fontSize:'12px',fontWeight:700,color:isSelected?'#E8002A':'#1A1A1A'}}>{d.value} ({pct(d.value/total*100)})</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <p style={{margin:'4px 0 0',fontSize:'10px',color:'#AAA',textAlign:'center'}}>{lang==='vi'?'Nhấp để lọc theo thanh toán':'Click to filter by payment method'}</p>
            </>
          }
        </div>
      </div>

      {/* ── Row 5: Recent Orders | Alerts | Inventory | Staff ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'14px'}}>

        {/* Recent Orders — click row to drill through */}
        <div style={card()}>
          <div style={{fontWeight:700,fontSize:'13px',marginBottom:'10px',color:'#1A1A1A',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span>{lang==='vi'?'Đơn gần đây':'Recent Orders'}</span>
            {hasFilters&&<span style={{fontSize:'10px',color:'#E8002A',fontWeight:600}}>{filteredServed.length} {lang==='vi'?'đơn':'orders'}</span>}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
            {recentOrders.length===0
              ? <p style={{fontSize:'12px',color:'#AAA',margin:0}}>{lang==='vi'?'Chưa có đơn':'No orders'}</p>
              : recentOrders.map(o=>{
                const statusColor=o.status==='served'?'#16A34A':o.status==='cancelled'?'#DC2626':'#F59E0B'
                return (
                  <div key={o.id} onClick={()=>setSelectedOrder(o)}
                    style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',borderRadius:'8px',cursor:'pointer',transition:'background 0.1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#F9F9F9'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div>
                      <div style={{fontSize:'12px',fontWeight:600,color:'#1A1A1A'}}>{o.table_id||(lang==='vi'?'Mang về':'Takeaway')}</div>
                      <div style={{fontSize:'10px',color:'#AAA'}}>{o.created_at?new Date(o.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:'12px',fontWeight:700,color:'#1A1A1A'}}>{fmt(o.total_amount||0)}</div>
                      <div style={{fontSize:'10px',fontWeight:600,color:statusColor,textTransform:'capitalize'}}>{o.status}</div>
                    </div>
                  </div>
                )
              })
            }
          </div>
          <p style={{margin:'6px 0 0',fontSize:'10px',color:'#AAA',textAlign:'center'}}>{lang==='vi'?'Nhấp hàng để xem chi tiết':'Click a row for order detail'}</p>
        </div>

        {/* Alerts */}
        <div style={card()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
            <span style={{fontWeight:700,fontSize:'13px',color:'#1A1A1A'}}>{lang==='vi'?'Cảnh báo':'Alerts'}</span>
            {alerts.length>0&&<span style={{background:'#E8002A',color:'white',fontSize:'9px',fontWeight:700,borderRadius:'99px',padding:'2px 7px'}}>{alerts.length}</span>}
          </div>
          {ackError&&<p style={{color:'#DC2626',fontSize:'11px',margin:'0 0 6px'}}>{ackError}</p>}
          {alerts.length===0
            ? <div style={{textAlign:'center',padding:'12px 0'}}><div style={{fontSize:'24px'}}>✅</div><p style={{fontSize:'12px',color:'#888',margin:'4px 0 0'}}>{lang==='vi'?'Không có cảnh báo':'All clear'}</p></div>
            : alerts.map(ins=>(
              <div key={ins.id} style={{borderLeft:`3px solid ${ins.severity==='critical'?'#DC2626':'#F59E0B'}`,paddingLeft:'8px',marginBottom:'8px'}}>
                <p style={{fontSize:'11px',color:'#333',margin:'0 0 3px',lineHeight:1.4}}>{lang==='vi'?ins.summary_vi:ins.summary_en}</p>
                {ins.status==='new'&&(
                  <button onClick={async()=>{ try{await api.post(`/api/insights/${ins.id}/acknowledge`)}catch{setAckError('Error')} }}
                    style={{fontSize:'10px',color:'#E8002A',background:'none',border:'none',padding:0,cursor:'pointer',fontWeight:600}}>
                    {lang==='vi'?'Đã xử lý →':'Resolve →'}
                  </button>
                )}
              </div>
            ))
          }
        </div>

        {/* Inventory At-Risk */}
        <div style={card()}>
          <div style={{fontWeight:700,fontSize:'13px',marginBottom:'10px',color:'#1A1A1A'}}>{lang==='vi'?'Tồn kho nguy cơ':'Inventory Alert'}</div>
          {atRisk.length===0
            ? <div style={{textAlign:'center',padding:'12px 0'}}><div style={{fontSize:'24px'}}>📦</div><p style={{fontSize:'12px',color:'#888',margin:'4px 0 0'}}>{lang==='vi'?'Tồn kho ổn định':'Stock OK'}</p></div>
            : atRisk.map(item=>{
              const pct = item.hoursLeft <= 0 ? 0 : Math.min(100, (item.hoursLeft / 8) * 100)
              const color = item.hoursLeft<=2?'#DC2626':'#F59E0B'
              return (
                <div key={item.sku} style={{marginBottom:'10px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                    <span style={{fontSize:'12px',fontWeight:600,color:'#1A1A1A'}}>{lang==='vi'?item.name_vi:item.name_en}</span>
                    <span style={{fontSize:'11px',fontWeight:700,color}}>{item.hoursLeft<=0?(lang==='vi'?'Hết':'Out'):`${item.hoursLeft.toFixed(1)}h`}</span>
                  </div>
                  <div style={{height:'4px',background:'#F2F2F7',borderRadius:'2px'}}>
                    <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:'2px',transition:'width 0.3s'}}/>
                  </div>
                </div>
              )
            })
          }
        </div>

        {/* Staff on Shift */}
        <div style={card()}>
          <div style={{fontWeight:700,fontSize:'13px',marginBottom:'10px',color:'#1A1A1A'}}>{lang==='vi'?'Nhân sự ca này':'Staff on Shift'}</div>
          <div style={{marginBottom:'8px'}}>
            <span style={{fontSize:'22px',fontWeight:800,color:'#1A1A1A'}}>{onShift.length}</span>
            <span style={{fontSize:'12px',color:'#AAA',marginLeft:'4px'}}>/ {staffShifts.length} {lang==='vi'?'nhân viên':'staff'}</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
            {onShift.slice(0,4).map(s=>(
              <div key={s.staff_id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid #F2F2F7'}}>
                <div>
                  <div style={{fontSize:'12px',fontWeight:600,color:'#1A1A1A'}}>{s.name}</div>
                  <div style={{fontSize:'10px',color:'#AAA',textTransform:'capitalize'}}>{s.role}</div>
                </div>
                <span style={{background:'#DCFCE7',color:'#166534',fontSize:'9px',fontWeight:700,borderRadius:'99px',padding:'2px 7px'}}>ON</span>
              </div>
            ))}
            {onShift.length===0&&<p style={{fontSize:'12px',color:'#AAA',margin:0}}>{lang==='vi'?'Không có ca làm':'No active shifts'}</p>}
          </div>
        </div>
      </div>

      {/* ── Drill-through modal ── */}
      {selectedOrder && <OrderModal order={selectedOrder} lang={lang} onClose={()=>setSelectedOrder(null)}/>}

    </div>
  )
}
