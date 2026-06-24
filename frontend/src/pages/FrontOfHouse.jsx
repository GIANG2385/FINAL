import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore'
import { db } from '../services/firebase'
import { api } from '../services/api'
import { MENU_ITEMS } from '../data/menu'

function formatVnd(amount, lang) {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency', currency: 'VND',
  }).format(amount)
}

function formatDateTime(date, lang) {
  return date.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

const TABLE_COLORS = {
  open:     { bg: '#F1F5F9', color: '#475569' },
  reserved: { bg: '#FEF9C3', color: '#854D0E' },
  dining:   { bg: '#FFEAED', color: '#A8001F' },
  cleanup:  { bg: '#FEF0E7', color: '#92400E' },
}

const TABLE_MINUTES = { T01: 42, T02: 18, T03: 65, T04: 10, T05: 30, T06: 55, T07: 8, T08: 22 }
const AVG_OCCUPIED_MIN = 28
const PAYMENT_METHODS = ['cash', 'card', 'momo']

const STATUS_COLORS = {
  confirmed: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
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

export default function FrontOfHouse() {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState('tables')
  const [tables, setTables] = useState(null)
  const [orders, setOrders] = useState(null)
  const [kitchenQueue, setKitchenQueue] = useState(null)
  const [reservations, setReservations] = useState(null)
  const [selectedTable, setSelectedTable] = useState(null)
  const [cart, setCart] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [paymentConfirmation, setPaymentConfirmation] = useState(null)
  const [spikeAlert, setSpikeAlert] = useState(false)
  // Local reservation form
  const [localReservations, setLocalReservations] = useState([])
  const [form, setForm] = useState({ name: '', partySize: 2, time: '18:00' })
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    const unsubTables = onSnapshot(collection(db, 'tables'), (snap) => {
      setTables(snap.docs.map((d) => d.data()))
    })
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentOrders = query(collection(db, 'orders'), where('created_at', '>=', dayAgo))
    const unsubOrders = onSnapshot(recentOrders, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    const unsubQueue = onSnapshot(collection(db, 'kitchen_queue'), (snap) => {
      setKitchenQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    const unsubRes = onSnapshot(collection(db, 'reservations'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (toDate(a.reservation_time)?.getTime() ?? 0) - (toDate(b.reservation_time)?.getTime() ?? 0))
      setReservations(list)
    })
    return () => { unsubTables(); unsubOrders(); unsubQueue(); unsubRes() }
  }, [])

  const activeOrder = useMemo(() => {
    if (!orders || !selectedTable) return null
    return orders
      .filter((o) => o.table_id === selectedTable && o.status !== 'cancelled')
      .sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0))
      .find((o) => o.status !== 'served' || !o.payment_method) || null
  }, [orders, selectedTable])

  if (tables === null || orders === null) {
    return <div style={{ padding: '28px 32px', color: 'var(--pp-text-muted)' }}>{t('common.loading')}</div>
  }

  const cartItems = Object.entries(cart).filter(([, qty]) => qty > 0)
  const cartTotal = cartItems.reduce((sum, [sku, qty]) => {
    const item = MENU_ITEMS.find((m) => m.sku === sku)
    return sum + item.unit_price * qty
  }, 0)

  async function handleCreateOrder() {
    setBusy(true); setError(null)
    try {
      await api.post('/api/orders', {
        table_id: selectedTable, channel: 'dine_in',
        items: cartItems.map(([sku, qty]) => ({ sku, qty })),
      })
      setCart({})
      const now = Date.now()
      const recent = (orders || [])
        .filter((o) => o.created_at)
        .map((o) => (o.created_at.toMillis ? o.created_at.toMillis() : new Date(o.created_at).getTime()))
        .filter((ts) => now - ts < 5 * 60 * 1000)
      if (recent.length >= 3) setSpikeAlert(true)
    } catch { setError(t('common.error')) }
    finally { setBusy(false) }
  }

  async function handleSendToKitchen(orderId) {
    setBusy(true); setError(null)
    try { await api.patch(`/api/orders/${orderId}/status`, { status: 'in_kitchen' }) }
    catch { setError(t('common.error')) }
    finally { setBusy(false) }
  }

  async function handleMarkServed(orderId) {
    setBusy(true); setError(null)
    try { await api.patch(`/api/orders/${orderId}/status`, { status: 'served' }) }
    catch { setError(t('common.error')) }
    finally { setBusy(false) }
  }

  async function handleRecordPayment(orderId, method, total) {
    setBusy(true); setError(null)
    try {
      await updateDoc(doc(db, 'orders', orderId), { payment_method: method })
      await updateDoc(doc(db, 'tables', selectedTable), { status: 'cleanup' })
      setPaymentConfirmation({ tableId: selectedTable, total, method })
    } catch { setError(t('common.error')) }
    finally { setBusy(false) }
  }

  const tabs = [
    { id: 'tables',       label: i18n.language === 'vi' ? 'Sơ đồ bàn' : 'Tables' },
    { id: 'orders',       label: i18n.language === 'vi' ? 'Theo dõi đơn' : 'Orders' },
    { id: 'reservations', label: i18n.language === 'vi' ? 'Đặt bàn' : 'Reservations' },
  ]

  // Kitchen kanban data
  const queue = kitchenQueue || []
  const pendingQ   = queue.filter((q) => q.status === 'pending')
  const inKitchenQ = queue.filter((q) => q.status === 'in_progress' || q.status === 'in_kitchen')
  const completedQ = queue.filter((q) => q.status === 'ready')

  // Reservations
  const upcoming = (reservations || []).filter((r) => {
    const time = toDate(r.reservation_time)
    return r.status === 'confirmed' && time && time.getTime() >= Date.now()
  })
  const allUpcoming = [...upcoming, ...localReservations.filter((r) => r.status === 'confirmed')]

  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--pp-text)', marginBottom: '16px' }}>
        {t('nav.frontOfHouse')}
      </h1>

      {spikeAlert && (
        <div style={{
          background: 'var(--pp-warning-bg)', border: '1px solid var(--pp-warning-border)',
          borderRadius: '8px', padding: '10px 16px', marginBottom: '16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px',
          color: 'var(--pp-warning-text)',
        }}>
          <span>{t('foh.spikeAlert')}</span>
          <button onClick={() => setSpikeAlert(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline', color: 'inherit' }}>{t('common.cancel')}</button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--pp-border)', marginBottom: '24px' }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={tabBtn(activeTab === tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab A: Tables ── */}
      {activeTab === 'tables' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))', gap: '10px', marginBottom: '24px' }}>
            {tables.map((tb) => {
              const tc = TABLE_COLORS[tb.status] || TABLE_COLORS.open
              const mins = TABLE_MINUTES[tb.table_id]
              const isSelected = selectedTable === tb.table_id
              return (
                <button
                  key={tb.table_id}
                  onClick={() => { setSelectedTable(tb.table_id); setPaymentConfirmation(null) }}
                  style={{
                    borderRadius: '10px', padding: '12px 8px', textAlign: 'center', fontSize: '13px',
                    fontWeight: 500, cursor: 'pointer', border: isSelected ? '2px solid var(--pp-primary)' : '2px solid transparent',
                    background: tc.bg, color: tc.color, transition: 'border 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{tb.table_id}</div>
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>{t(`dashboard.status.${tb.status}`)}</div>
                  {tb.status === 'dining' && mins && (
                    <div style={{
                      marginTop: '4px', fontSize: '11px', fontWeight: 600,
                      color: mins > AVG_OCCUPIED_MIN ? 'var(--pp-danger-text)' : 'var(--pp-success-text)',
                      background: mins > AVG_OCCUPIED_MIN ? 'var(--pp-danger-bg)' : 'var(--pp-success-bg)',
                      borderRadius: '4px', padding: '1px 4px',
                    }}>{mins}m</div>
                  )}
                </button>
              )
            })}
          </div>

          {selectedTable && (
            <div style={{ maxWidth: '440px', background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                  {activeOrder ? t('foh.billFor', { table: selectedTable }) : selectedTable}
                </h2>
                {activeOrder && (
                  <span style={{
                    borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: 500,
                    background: activeOrder.status === 'served' ? 'var(--pp-success-bg)' : activeOrder.status === 'in_kitchen' ? 'var(--pp-warning-bg)' : 'var(--pp-neutral-bg)',
                    color: activeOrder.status === 'served' ? 'var(--pp-success-text)' : activeOrder.status === 'in_kitchen' ? 'var(--pp-warning-text)' : 'var(--pp-neutral-text)',
                  }}>
                    {t(`foh.orderStatus.${activeOrder.status}`)}
                  </span>
                )}
              </div>
              {error && <p style={{ color: 'var(--pp-danger-text)', fontSize: '13px', marginBottom: '8px' }}>{error}</p>}

              {paymentConfirmation && paymentConfirmation.tableId === selectedTable ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--pp-success-text)', marginBottom: '8px' }}>{t('foh.paymentReceived')}</p>
                  <p style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>{formatVnd(paymentConfirmation.total, i18n.language)}</p>
                  <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', marginBottom: '16px', textTransform: 'capitalize' }}>{paymentConfirmation.method}</p>
                  <button onClick={() => setPaymentConfirmation(null)} style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '9px 20px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', width: '100%' }}>
                    {t('foh.startNewOrder')}
                  </button>
                </div>
              ) : (
                <>
                  {!activeOrder && (
                    <div>
                      {MENU_ITEMS.map((item) => (
                        <div key={item.sku} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid var(--pp-border)' }}>
                          <div>
                            <p style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>{i18n.language === 'vi' ? item.name_vi : item.name_en}</p>
                            <p style={{ fontSize: '12px', color: 'var(--pp-text-muted)', margin: 0 }}>{formatVnd(item.unit_price, i18n.language)}</p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button onClick={() => setCart((c) => ({ ...c, [item.sku]: Math.max(0, (c[item.sku] || 0) - 1) }))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-border)', background: 'white', cursor: 'pointer', fontSize: '14px' }}>−</button>
                            <span style={{ width: '20px', textAlign: 'center', fontSize: '14px' }}>{cart[item.sku] || 0}</span>
                            <button onClick={() => setCart((c) => ({ ...c, [item.sku]: (c[item.sku] || 0) + 1 }))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-border)', background: 'white', cursor: 'pointer', fontSize: '14px' }}>+</button>
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px' }}>
                        <span style={{ fontWeight: 600 }}>{formatVnd(cartTotal, i18n.language)}</span>
                        <button disabled={busy || cartItems.length === 0} onClick={handleCreateOrder} style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '9px 20px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: (busy || cartItems.length === 0) ? 0.5 : 1 }}>
                          {t('foh.createOrder')}
                        </button>
                      </div>
                    </div>
                  )}

                  {activeOrder && (
                    <div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
                        {activeOrder.items.map((it, idx) => (
                          <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', paddingBottom: '6px' }}>
                            <span>{it.qty}× {i18n.language === 'vi' ? it.name_vi : it.name_en}</span>
                            <span>{formatVnd(it.unit_price * it.qty, i18n.language)}</span>
                          </li>
                        ))}
                      </ul>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--pp-border)', paddingTop: '10px', fontWeight: 700, fontSize: '16px', marginBottom: '14px' }}>
                        <span>{t('foh.total')}</span>
                        <span>{formatVnd(activeOrder.total_amount, i18n.language)}</span>
                      </div>
                      {activeOrder.status === 'open' && (
                        <button disabled={busy} onClick={() => handleSendToKitchen(activeOrder.id)} style={{ width: '100%', background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '9px 20px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
                          {t('foh.sendToKitchen')}
                        </button>
                      )}
                      {activeOrder.status === 'in_kitchen' && (
                        <div>
                          <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', marginBottom: '8px' }}>{t('foh.inKitchen')}</p>
                          <button disabled={busy} onClick={() => handleMarkServed(activeOrder.id)} style={{ width: '100%', background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '9px 20px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
                            {t('foh.markServed')}
                          </button>
                        </div>
                      )}
                      {activeOrder.status === 'served' && !activeOrder.payment_method && (
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>{t('foh.recordPayment')}</p>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {PAYMENT_METHODS.map((method) => (
                              <button key={method} disabled={busy} onClick={() => handleRecordPayment(activeOrder.id, method, activeOrder.total_amount)}
                                style={{ flex: 1, border: '1px solid var(--pp-border)', background: 'white', borderRadius: '8px', padding: '8px', fontSize: '13px', cursor: 'pointer', textTransform: 'capitalize', opacity: busy ? 0.5 : 1 }}>
                                {method}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab B: Orders (Kitchen Kanban) ── */}
      {activeTab === 'orders' && (
        <div>
          {kitchenQueue === null ? (
            <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>{t('common.loading')}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
              {[
                { label: t('boh.kanban.pending'),   items: pendingQ,   border: '#CBD5E1', headerBg: '#F1F5F9', headerColor: '#374151' },
                { label: t('boh.kanban.inKitchen'), items: inKitchenQ, border: '#FCD34D', headerBg: '#FFFBEB', headerColor: '#92400E' },
                { label: t('boh.kanban.completed'), items: completedQ, border: '#86EFAC', headerBg: '#F0FDF4', headerColor: '#166534' },
              ].map((col) => (
                <div key={col.label} style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ background: col.headerBg, color: col.headerColor, padding: '10px 14px', fontWeight: 700, fontSize: '13px', borderBottom: `2px solid ${col.border}` }}>
                    {col.label} ({col.items.length})
                  </div>
                  <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' }}>
                    {col.items.map((q) => {
                      const queuedAt = toDate(q.queued_at)
                      const elapsed = queuedAt ? Math.round((Date.now() - queuedAt.getTime()) / 60000) : 0
                      const delayColor = elapsed > 20 ? 'var(--pp-danger-text)' : elapsed > 10 ? '#D97706' : 'var(--pp-success-text)'
                      return (
                        <div key={q.id} style={{ background: 'white', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '10px' }}>
                          <p style={{ fontWeight: 600, fontSize: '13px', margin: '0 0 2px' }}>{q.item_sku}</p>
                          <p style={{ fontSize: '11px', color: 'var(--pp-text-muted)', margin: '0 0 6px' }}>{q.station}</p>
                          <p style={{ fontSize: '12px', fontWeight: 500, color: delayColor, margin: 0 }}>⏱ {elapsed} {i18n.language === 'vi' ? 'phút' : 'min'}</p>
                        </div>
                      )
                    })}
                    {col.items.length === 0 && <p style={{ fontSize: '12px', color: 'var(--pp-text-hint)', margin: 0 }}>—</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab C: Reservations ── */}
      {activeTab === 'reservations' && (
        <div>
          <div style={{ background: 'var(--pp-info-bg)', border: '1px solid var(--pp-info-border)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '14px', color: 'var(--pp-info-text)' }}>
            {t('guest.peakForecast')}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button onClick={() => setFormOpen((f) => !f)} style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '8px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              {t('guest.addReservation')}
            </button>
          </div>

          {formOpen && (
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {formError && <p style={{ color: 'var(--pp-danger-text)', fontSize: '12px', margin: 0 }}>{formError}</p>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input style={{ flex: 1, border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }} placeholder={t('guest.guestNameLabel')} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                <input type="number" min="1" max="20" style={{ width: '70px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px', fontSize: '13px' }} value={form.partySize} onChange={(e) => setForm((f) => ({ ...f, partySize: Number(e.target.value) }))} />
                <input style={{ width: '80px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px', fontSize: '13px' }} placeholder="HH:MM" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
              </div>
              <button
                onClick={() => {
                  if (!form.name.trim()) { setFormError('Vui lòng nhập tên khách'); return }
                  setLocalReservations((prev) => [...prev, { id: Date.now(), guest_name: form.name, party_size: form.partySize, time: form.time, status: 'confirmed' }])
                  setForm({ name: '', partySize: 2, time: '18:00' }); setFormOpen(false); setFormError(null)
                }}
                style={{ alignSelf: 'flex-start', background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '7px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >{t('common.save')}</button>
            </div>
          )}

          {allUpcoming.length === 0 ? (
            <p style={{ fontSize: '14px', color: 'var(--pp-text-muted)' }}>{t('guest.noUpcoming')}</p>
          ) : (
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: 'var(--pp-yellow)', borderBottom: '1px solid var(--pp-border)' }}>
                    {[t('guest.guestName'), t('guest.partySize'), t('guest.time'), t('guest.status')].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allUpcoming.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--pp-border)' }}>
                      <td style={{ padding: '12px' }}>{r.guest_name}</td>
                      <td style={{ padding: '12px' }}>{r.party_size}</td>
                      <td style={{ padding: '12px' }}>{r.reservation_time ? formatDateTime(toDate(r.reservation_time), i18n.language) : r.time}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: 500,
                          background: r.status === 'confirmed' ? 'var(--pp-primary-light)' : r.status === 'completed' ? 'var(--pp-success-bg)' : 'var(--pp-neutral-bg)',
                          color: r.status === 'confirmed' ? 'var(--pp-primary-text)' : r.status === 'completed' ? 'var(--pp-success-text)' : 'var(--pp-neutral-text)',
                        }}>
                          {t(`guest.statusLabel.${r.status}`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
