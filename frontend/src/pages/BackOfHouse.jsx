import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore'
import { db } from '../services/firebase'

function formatVnd(amount, lang) {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency', currency: 'VND',
  }).format(amount)
}

function formatTime(date, lang) {
  return date.toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
}

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

const tabBtn = (active) => ({
  padding: '10px 20px',
  border: 'none',
  borderBottom: active ? '2px solid var(--pp-primary)' : '2px solid transparent',
  background: 'transparent',
  color: active ? 'var(--pp-primary)' : 'var(--pp-text-muted)',
  fontWeight: active ? 700 : 400,
  fontSize: '14px',
  cursor: 'pointer',
  transition: 'all 0.15s',
})

const card = {
  background: 'var(--pp-card-bg)',
  border: '1px solid var(--pp-border)',
  borderRadius: '10px',
  padding: '18px 20px',
}

const STATIC_SUPPLIERS = [
  { id: 1, name: 'Chị Lan — Chợ Hôm', items: 'Thịt bò, Xương heo', lastDelivery: '2026-06-24', reliability: 95 },
  { id: 2, name: 'Anh Tuấn — Chợ Đồng Xuân', items: 'Rau, Hành lá, Gia vị', lastDelivery: '2026-06-23', reliability: 82 },
  { id: 3, name: 'Cty Minh Tâm', items: 'Bánh phở, Bún', lastDelivery: '2026-06-22', reliability: 68 },
]

const STATIC_CHANNELS = [
  { name_vi: 'Tại bàn', name_en: 'Dine-in', orders: 48, revenue: 6240000 },
  { name_vi: 'Mang về', name_en: 'Takeaway', orders: 15, revenue: 1350000 },
  { name_vi: 'GrabFood', name_en: 'GrabFood', orders: 22, revenue: 2090000 },
  { name_vi: 'ShopeeFood', name_en: 'ShopeeFood', orders: 9, revenue: 855000 },
]

const FOOD_COST_PCT = 0.32
const HOURLY_WAGE_VND = 25000

export default function BackOfHouse() {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState('kitchen')
  const [staffShifts, setStaffShifts] = useState(null)
  const [orders, setOrders] = useState(null)
  const [inventoryRaw, setInventoryRaw] = useState(null)
  const [localStock, setLocalStock] = useState({})
  const [kitchenQueue, setKitchenQueue] = useState(null)

  useEffect(() => {
    const unsubShifts = onSnapshot(collection(db, 'staff_shifts'), (snap) => {
      setStaffShifts(snap.docs.map((d) => d.data()))
    })
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
    const todayOrders = query(collection(db, 'orders'), where('created_at', '>=', dayStart))
    const unsubOrders = onSnapshot(todayOrders, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    const unsubInv = onSnapshot(collection(db, 'inventory'), (snap) => {
      setInventoryRaw(snap.docs.map((d) => d.data()))
    })
    const unsubQueue = onSnapshot(collection(db, 'kitchen_queue'), (snap) => {
      setKitchenQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => { unsubShifts(); unsubOrders(); unsubInv(); unsubQueue() }
  }, [])

  // Compute profit from Firestore data (same logic as backend profitController)
  const profit = useMemo(() => {
    if (!orders || !staffShifts) return null
    const revenue = orders.filter((o) => o.status === 'served').reduce((s, o) => s + (o.total_amount || 0), 0)
    const labor_cost = Math.round(staffShifts.reduce((s, sh) => {
      const start = toDate(sh.shift_start); const end = toDate(sh.shift_end)
      if (!start || !end) return s
      return s + Math.max(0, (end - start) / 3600000) * HOURLY_WAGE_VND
    }, 0))
    const food_cost = Math.round(revenue * FOOD_COST_PCT)
    return { revenue, food_cost, labor_cost, profit: revenue - food_cost - labor_cost }
  }, [orders, staffShifts])

  // Compute stockout forecast from Firestore data (same logic as backend inventoryController)
  const inventory = useMemo(() => {
    if (!inventoryRaw) return null
    const now = Date.now()
    return inventoryRaw.map((item) => {
      const hourly = (item.avg_daily_consumption || 0) / 24
      const hoursLeft = hourly > 0 ? item.current_stock / hourly : null
      return {
        ...item,
        hours_remaining: hoursLeft !== null ? Math.round(hoursLeft * 10) / 10 : null,
        stockout_at: hoursLeft !== null ? new Date(now + hoursLeft * 3600000) : null,
        at_risk: hoursLeft !== null && hoursLeft <= 6,
      }
    }).sort((a, b) => (a.hours_remaining ?? Infinity) - (b.hours_remaining ?? Infinity))
  }, [inventoryRaw])

  const getStock = (item) => localStock[item.sku] !== undefined ? localStock[item.sku] : (item.current_stock ?? 0)

  async function handleAdvanceQueueItem(queueItem) {
    const nextStatus = queueItem.status === 'pending' ? 'in_progress' : 'ready'
    try {
      await updateDoc(doc(db, 'kitchen_queue', queueItem.id), { status: nextStatus })

      if (nextStatus === 'ready') {
        const siblings = (kitchenQueue || []).filter(
          (q) => q.order_id === queueItem.order_id
        )
        const allReady = siblings.every(
          (q) => q.id === queueItem.id ? true : q.status === 'ready'
        )
        if (allReady) {
          const order = (orders || []).find((o) => o.id === queueItem.order_id)
          if (order) {
            await updateDoc(doc(db, 'orders', queueItem.order_id), { status: 'ready' })
          }
        }
      }
    } catch (e) {
      console.error('kitchen advance error', e)
    }
  }

  function updateStock(sku, newVal) {
    const val = Math.max(0, Math.round(newVal * 10) / 10)
    setLocalStock((prev) => ({ ...prev, [sku]: val }))
  }

  const now = new Date()
  const onShiftNow = (staffShifts || []).filter((s) => {
    const start = toDate(s.shift_start); const end = toDate(s.shift_end)
    return start && end && start <= now && now <= end
  })
  const recentOrderVolume = (orders || []).filter((o) => {
    const created = toDate(o.created_at)
    return created && Date.now() - created.getTime() < 2 * 60 * 60 * 1000
  }).length
  const staffingFlag = recentOrderVolume > onShiftNow.length * 5 ? 'understaffed'
    : onShiftNow.length > 0 && recentOrderVolume < onShiftNow.length ? 'overstaffed' : 'ok'

  const tabs = [
    { id: 'kitchen',   label: t('boh.kitchen') },
    { id: 'inventory', label: i18n.language === 'vi' ? 'Tồn kho' : 'Inventory' },
    { id: 'labor',     label: i18n.language === 'vi' ? 'Nhân sự' : 'Labor' },
    { id: 'supply',    label: i18n.language === 'vi' ? 'Cung ứng & Doanh thu' : 'Supply & Revenue' },
  ]

  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--pp-text)', marginBottom: '16px' }}>
        {t('nav.backOfHouse')}
      </h1>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--pp-border)', marginBottom: '24px' }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={tabBtn(activeTab === tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Kitchen Tab ── */}
      {activeTab === 'kitchen' && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
            {t('boh.kitchenDisplay')}
          </h2>
          {kitchenQueue === null ? (
            <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>
              {i18n.language === 'vi' ? 'Đang tải...' : 'Loading…'}
            </p>
          ) : (() => {
            const pending    = kitchenQueue.filter((q) => q.status === 'pending')
            const cooking    = kitchenQueue.filter((q) => q.status === 'in_progress')
            const done       = kitchenQueue.filter((q) => q.status === 'ready' || q.status === 'completed')
            const columns = [
              { label: t('boh.kanban.pending'),   items: pending, border: '#CBD5E1', headerBg: '#F1F5F9', headerColor: '#374151' },
              { label: t('boh.kanban.inKitchen'), items: cooking, border: '#FCD34D', headerBg: '#FFFBEB', headerColor: '#92400E' },
              { label: t('boh.kanban.completed'), items: done,    border: '#86EFAC', headerBg: '#F0FDF4', headerColor: '#166534' },
            ]
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
                {columns.map((col) => (
                  <div key={col.label} style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ background: col.headerBg, color: col.headerColor, padding: '10px 14px', fontWeight: 700, fontSize: '13px', borderBottom: `2px solid ${col.border}` }}>
                      {col.label} ({col.items.length})
                    </div>
                    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' }}>
                      {col.items.map((q) => {
                        const queuedAt = q.queued_at?.toDate ? q.queued_at.toDate() : (q.queued_at ? new Date(q.queued_at) : null)
                        const elapsed = queuedAt ? Math.round((Date.now() - queuedAt.getTime()) / 60000) : 0
                        const delayColor = elapsed > 20 ? 'var(--pp-danger-text)' : elapsed > 10 ? '#D97706' : 'var(--pp-success-text)'
                        return (
                          <div key={q.id} style={{ background: 'white', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                              <p style={{ fontWeight: 600, fontSize: '13px', margin: 0 }}>
                                {q.qty ? `${q.qty}× ` : ''}{i18n.language === 'vi' ? (q.item_name_vi || q.item_sku) : (q.item_name_en || q.item_sku)}
                              </p>
                              {q.table_id && (
                                <span style={{ fontSize: '11px', background: 'var(--pp-neutral-bg)', color: 'var(--pp-neutral-text)', borderRadius: '4px', padding: '1px 5px', marginLeft: '6px', whiteSpace: 'nowrap' }}>
                                  {q.table_id}
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: '12px', fontWeight: 500, color: delayColor, margin: 0 }}>
                              ⏱ {elapsed} {i18n.language === 'vi' ? 'phút' : 'min'}
                            </p>
                            {(q.status === 'pending' || q.status === 'in_progress') && (
                              <button
                                onClick={() => handleAdvanceQueueItem(q)}
                                style={{
                                  marginTop: '8px', width: '100%', fontSize: '12px', fontWeight: 600,
                                  padding: '5px 0', borderRadius: '6px', cursor: 'pointer', border: 'none',
                                  background: q.status === 'pending' ? 'var(--pp-warning-bg)' : 'var(--pp-success-bg)',
                                  color: q.status === 'pending' ? 'var(--pp-warning-text)' : 'var(--pp-success-text)',
                                }}
                              >
                                {q.status === 'pending'
                                  ? (i18n.language === 'vi' ? 'Bắt đầu' : 'Start')
                                  : (i18n.language === 'vi' ? 'Xong ✓' : 'Ready ✓')}
                              </button>
                            )}
                          </div>
                        )
                      })}
                      {col.items.length === 0 && (
                        <p style={{ fontSize: '12px', color: 'var(--pp-text-hint)', margin: 0 }}>—</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Tab A: Inventory ── */}
      {activeTab === 'inventory' && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>{t('boh.inventory')}</h2>
          {inventory === null ? (
            <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>{t('common.loading')}</p>
          ) : (
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: 'var(--pp-yellow)', borderBottom: '1px solid var(--pp-border)' }}>
                    {[t('boh.item'), t('boh.stock'), t('boh.par'), t('boh.stockoutProjection'), i18n.language === 'vi' ? 'Cập nhật' : 'Update'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item) => {
                    const stock = getStock(item)
                    const parLevel = item.par_level
                    const rowStatus = stock <= 0 ? 'critical' : stock < parLevel * 0.3 ? 'critical' : stock < parLevel * 0.6 ? 'warning' : 'ok'
                    return (
                      <tr key={item.sku} style={{
                        borderBottom: '1px solid var(--pp-border)',
                        background: rowStatus === 'critical' ? 'var(--pp-danger-bg)' : rowStatus === 'warning' ? 'var(--pp-warning-bg)' : 'transparent',
                      }}>
                        <td style={{ padding: '12px' }}>{i18n.language === 'vi' ? item.name_vi : item.name_en}</td>
                        <td style={{ padding: '12px' }}>{stock} {item.unit}</td>
                        <td style={{ padding: '12px', color: 'var(--pp-text-muted)' }}>{parLevel} {item.unit}</td>
                        <td style={{ padding: '12px', color: rowStatus === 'critical' ? 'var(--pp-danger-text)' : 'var(--pp-text-muted)', fontWeight: rowStatus === 'critical' ? 600 : 400 }}>
                          {item.stockout_at ? t('boh.willRunOutBy', { time: formatTime(new Date(item.stockout_at), i18n.language) }) : '—'}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button onClick={() => updateStock(item.sku, stock - 0.5)} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid var(--pp-border)', background: 'white', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>−</button>
                            <input type="number" value={stock} step="0.5" min="0"
                              onChange={(e) => updateStock(item.sku, parseFloat(e.target.value) || 0)}
                              style={{ width: '60px', padding: '3px 6px', border: '1px solid var(--pp-border)', borderRadius: '4px', fontSize: '13px', textAlign: 'center' }}
                            />
                            <button onClick={() => updateStock(item.sku, stock + 0.5)} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid var(--pp-border)', background: 'white', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>+</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab B: Labor ── */}
      {activeTab === 'labor' && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>{t('boh.labor')}</h2>
          {staffShifts === null ? (
            <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>{t('common.loading')}</p>
          ) : (
            <>
              <p style={{ fontSize: '14px', marginBottom: '10px' }}>
                {t('boh.staffOnShift', { count: onShiftNow.length })} · {t('boh.recentOrders', { count: recentOrderVolume })}
              </p>
              {staffingFlag !== 'ok' && (
                <div style={{ background: 'var(--pp-warning-bg)', border: '1px solid var(--pp-warning-border)', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', color: 'var(--pp-warning-text)', marginBottom: '14px', display: 'inline-block' }}>
                  {t(`boh.staffingFlag.${staffingFlag}`)}
                </div>
              )}
              <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: 'var(--pp-yellow)', borderBottom: '1px solid var(--pp-border)' }}>
                      {[i18n.language === 'vi' ? 'Nhân viên' : 'Staff', i18n.language === 'vi' ? 'Vai trò' : 'Role', i18n.language === 'vi' ? 'Ca làm' : 'Shift', i18n.language === 'vi' ? 'Trạng thái' : 'Status'].map((h) => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staffShifts.map((s) => {
                      const isOn = onShiftNow.some((o) => o.staff_id === s.staff_id)
                      const start = toDate(s.shift_start); const end = toDate(s.shift_end)
                      return (
                        <tr key={s.staff_id} style={{ borderBottom: '1px solid var(--pp-border)' }}>
                          <td style={{ padding: '12px', fontWeight: 500 }}>{s.name}</td>
                          <td style={{ padding: '12px', color: 'var(--pp-text-muted)' }}>{s.role}</td>
                          <td style={{ padding: '12px', color: 'var(--pp-text-muted)', fontSize: '13px' }}>
                            {start && end ? `${formatTime(start, i18n.language)} – ${formatTime(end, i18n.language)}` : '—'}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: 500,
                              background: isOn ? 'var(--pp-success-bg)' : 'var(--pp-neutral-bg)',
                              color: isOn ? 'var(--pp-success-text)' : 'var(--pp-neutral-text)',
                            }}>{isOn ? t('boh.shiftStatus.on') : t('boh.shiftStatus.off')}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '14px', background: 'var(--pp-warning-bg)', border: '1px solid var(--pp-warning-border)', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', color: 'var(--pp-warning-text)' }}>
                {t('boh.laborAiForecast')}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab C: Supply & Revenue ── */}
      {activeTab === 'supply' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* Profit Snapshot */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>{t('boh.profitSnapshot')}</h2>
            {profit === null ? (
              <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>{t('common.loading')}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '14px' }}>
                {[
                  { label: t('dashboard.todayRevenue'), value: formatVnd(profit.revenue, i18n.language) },
                  { label: t('boh.foodCost'),   value: formatVnd(profit.food_cost, i18n.language) },
                  { label: t('boh.laborCost'),  value: formatVnd(profit.labor_cost, i18n.language) },
                  { label: t('boh.profit'),     value: formatVnd(profit.profit, i18n.language) },
                ].map((item) => (
                  <div key={item.label} style={card}>
                    <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', margin: '0 0 4px' }}>{item.label}</p>
                    <p style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Revenue by Channel */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>{t('boh.channels')}</h2>
            <div style={{ background: 'var(--pp-warning-bg)', border: '1px solid var(--pp-warning-border)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '14px', color: 'var(--pp-warning-text)' }}>
              {t('boh.channelAiInsight')}
            </div>
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: 'var(--pp-yellow)', borderBottom: '1px solid var(--pp-border)' }}>
                    {[t('boh.channelName'), t('boh.channelOrders'), t('boh.channelRevenue')].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STATIC_CHANNELS.map((c) => (
                    <tr key={c.name_en} style={{ borderBottom: '1px solid var(--pp-border)' }}>
                      <td style={{ padding: '12px' }}>{i18n.language === 'vi' ? c.name_vi : c.name_en}</td>
                      <td style={{ padding: '12px' }}>{c.orders}</td>
                      <td style={{ padding: '12px' }}>{formatVnd(c.revenue, i18n.language)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Supply Monitoring */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>{t('boh.supply')}</h2>
            <div style={{ background: 'var(--pp-info-bg)', border: '1px solid var(--pp-info-border)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '14px', color: 'var(--pp-info-text)' }}>
              {t('boh.supplyAiForecast')}
            </div>
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: 'var(--pp-yellow)', borderBottom: '1px solid var(--pp-border)' }}>
                    {[t('boh.supplier'), t('boh.items'), t('boh.lastDelivery'), t('boh.reliability')].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STATIC_SUPPLIERS.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--pp-border)' }}>
                      <td style={{ padding: '12px', fontWeight: 500 }}>{s.name}</td>
                      <td style={{ padding: '12px', color: 'var(--pp-text-muted)' }}>{s.items}</td>
                      <td style={{ padding: '12px', color: 'var(--pp-text-muted)' }}>{s.lastDelivery}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: 600,
                          background: s.reliability >= 90 ? 'var(--pp-success-bg)' : s.reliability >= 70 ? 'var(--pp-warning-bg)' : 'var(--pp-danger-bg)',
                          color: s.reliability >= 90 ? 'var(--pp-success-text)' : s.reliability >= 70 ? 'var(--pp-warning-text)' : 'var(--pp-danger-text)',
                        }}>{s.reliability}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
