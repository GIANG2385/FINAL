import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'
import supabase from '../services/supabase'
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

const AVG_OCCUPIED_MIN = 60  // avg dining time 60 min (1 hr turn)

const tabBtn = (active) => ({
  padding: '10px 20px',
  border: 'none',
  borderBottom: active ? '3px solid var(--pp-primary)' : '3px solid transparent',
  marginBottom: '-1px',
  background: 'transparent',
  color: active ? 'var(--pp-primary)' : 'var(--pp-text-muted)',
  fontWeight: active ? 700 : 500,
  fontSize: '13px',
  letterSpacing: '0.03em',
  cursor: 'pointer',
  transition: 'all 0.15s',
  whiteSpace: 'nowrap',
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
  const [vnpayModal, setVnpayModal] = useState(null) // { orderId, amount, paymentUrl }
  // Reservation form
  const [form, setForm] = useState({ name: '', partySize: 2, time: '18:00' })
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState(null)
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [noteInput, setNoteInput] = useState('')
  const [addingMore, setAddingMore] = useState(false)
  const [inventory, setInventory] = useState(null)
  const [firestoreMenu, setFirestoreMenu] = useState(null)

  useEffect(() => {
    // ── Initial fetches ──
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999)
    const startOfToday = dayStart.toISOString()
    const endOfToday = dayEnd.toISOString()

    supabase.from('tables').select('*').then(({ data }) => {
      if (data) setTables(data)
    })
    supabase.from('orders').select('*')
      .gte('created_at', startOfToday)
      .lt('created_at', endOfToday)
      .then(({ data }) => {
        if (data) setOrders(data)
      })
    supabase.from('kitchen_queue').select('*').then(({ data }) => {
      if (data) setKitchenQueue(data)
    })
    supabase.from('reservations').select('*').then(({ data }) => {
      if (data) {
        const list = [...data]
        list.sort((a, b) => (toDate(a.reservation_time)?.getTime() ?? 0) - (toDate(b.reservation_time)?.getTime() ?? 0))
        setReservations(list)
      }
    })
    supabase.from('inventory').select('*').then(({ data }) => {
      if (data) setInventory(data)
    })
    supabase.from('menu_items').select('*').then(({ data }) => {
      if (data) setFirestoreMenu(data.length > 0 ? data : null)
    })

    // ── Real-time subscriptions ──
    const tablesSub = supabase
      .channel('foh-tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        supabase.from('tables').select('*').then(({ data }) => {
          if (data) setTables(data)
        })
      })
      .subscribe()

    const ordersSub = supabase
      .channel('foh-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        supabase.from('orders').select('*')
          .gte('created_at', startOfToday)
          .lt('created_at', endOfToday)
          .then(({ data }) => {
            if (data) setOrders(data)
          })
      })
      .subscribe()

    const queueSub = supabase
      .channel('foh-kitchen-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_queue' }, () => {
        supabase.from('kitchen_queue').select('*').then(({ data }) => {
          if (data) setKitchenQueue(data)
        })
      })
      .subscribe()

    const resSub = supabase
      .channel('foh-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        supabase.from('reservations').select('*').then(({ data }) => {
          if (data) {
            const list = [...data]
            list.sort((a, b) => (toDate(a.reservation_time)?.getTime() ?? 0) - (toDate(b.reservation_time)?.getTime() ?? 0))
            setReservations(list)
          }
        })
      })
      .subscribe()

    const invSub = supabase
      .channel('foh-inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        supabase.from('inventory').select('*').then(({ data }) => {
          if (data) setInventory(data)
        })
      })
      .subscribe()

    const menuSub = supabase
      .channel('foh-menu-items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        supabase.from('menu_items').select('*').then(({ data }) => {
          if (data) setFirestoreMenu(data.length > 0 ? data : null)
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(tablesSub)
      supabase.removeChannel(ordersSub)
      supabase.removeChannel(queueSub)
      supabase.removeChannel(resSub)
      supabase.removeChannel(invSub)
      supabase.removeChannel(menuSub)
    }
  }, [])

  // Find the active (unpaid or in-progress) order for the selected table
  const activeOrder = useMemo(() => {
    if (!orders || !selectedTable) return null
    return orders
      .filter((o) => o.table_id === selectedTable && o.status !== 'cancelled')
      .sort((a, b) => {
        const ta = toDate(a.created_at)?.getTime() ?? 0
        const tb2 = toDate(b.created_at)?.getTime() ?? 0
        return tb2 - ta
      })
      .find((o) => o.status !== 'served' || !o.payment_method) || null
  }, [orders, selectedTable])

  useEffect(() => {
    const checkReservations = () => {
      if (!reservations || !tables) return
      const now = Date.now()
      const TEN_MIN = 10 * 60 * 1000

      reservations.forEach((r) => {
        if (r.status !== 'confirmed' || !r.table_id) return
        const resTime = toDate(r.reservation_time)?.getTime()
        if (!resTime) return

        const inWindow = now >= resTime - TEN_MIN && now <= resTime + TEN_MIN
        const table = tables.find((tb) => tb.table_id === r.table_id)
        if (!table) return

        if (inWindow && table.status === 'open') {
          supabase.from('tables').update({ status: 'reserved' }).eq('table_id', r.table_id).then(() => {}).catch(console.error)
        } else if (!inWindow && now > resTime + TEN_MIN && table.status === 'reserved') {
          supabase.from('tables').update({ status: 'open' }).eq('table_id', r.table_id).then(() => {}).catch(console.error)
        }
      })
    }

    checkReservations()
    const interval = setInterval(checkReservations, 60 * 1000)
    return () => clearInterval(interval)
  }, [reservations, tables])

  // Build a map of ingredient_sku → { sku, current_stock } for fast lookup
  const invMap = useMemo(() => {
    const map = {}
    for (const inv of (inventory || [])) map[inv.sku] = inv
    return map
  }, [inventory])

  // Use Supabase menu items when available, fall back to hardcoded for loading state
  const activeMenu = firestoreMenu || MENU_ITEMS

  // Set of menu item SKUs that cannot be ordered due to insufficient stock
  const unavailableSkus = useMemo(() => {
    return new Set(
      activeMenu.filter((m) =>
        (m.recipes || []).some((r) => (invMap[r.ingredient_sku]?.current_stock ?? 0) < r.qty)
      ).map((m) => m.sku)
    )
  }, [invMap, activeMenu])

  if (tables === null || orders === null) {
    return <div style={{ padding: '28px 32px', color: 'var(--pp-text-muted)' }}>{t('common.loading')}</div>
  }

  const cartItems = Object.entries(cart).filter(([, qty]) => qty > 0)
  const cartTotal = cartItems.reduce((sum, [sku, qty]) => {
    const item = activeMenu.find((m) => m.sku === sku)
    return sum + (item?.unit_price ?? 0) * qty
  }, 0)

  // Aggregate ingredient deductions for a list of order items and apply them
  async function applyInventoryDeductions(orderItems) {
    const deductions = {}
    for (const item of orderItems) {
      const menuItem = activeMenu.find((m) => m.sku === item.sku)
      for (const recipe of (menuItem?.recipes || [])) {
        deductions[recipe.ingredient_sku] = (deductions[recipe.ingredient_sku] || 0) + recipe.qty * item.qty
      }
    }
    await Promise.all(
      Object.entries(deductions).map(([ingredientSku, amount]) => {
        const inv = invMap[ingredientSku]
        if (inv?.sku) {
          return supabase.from('inventory').update({
            current_stock: Math.max(0, (inv.current_stock ?? 0) - amount),
          }).eq('sku', inv.sku)
        }
        return Promise.resolve()
      })
    )
  }

  // ── Create order: write directly to Supabase ──
  async function handleCreateOrder() {
    if (cartItems.length === 0) return
    setBusy(true); setError(null)
    try {
      const resolvedItems = cartItems.map(([sku, qty]) => {
        const item = activeMenu.find((m) => m.sku === sku)
        return { sku: item.sku, name_en: item.name_en, name_vi: item.name_vi, unit_price: item.unit_price, qty }
      })
      const total_amount = resolvedItems.reduce((s, i) => s + i.unit_price * i.qty, 0)
      const newId = crypto.randomUUID()

      const { data: newOrder } = await supabase.from('orders').insert({
        id: newId,
        table_id: selectedTable,
        channel: 'dine_in',
        items: resolvedItems,
        status: 'open',
        total_amount,
        created_at: new Date().toISOString(),
        served_at: null,
        payment_method: null,
      }).select().single()

      await supabase.from('tables').update({ status: 'dining', seated_at: new Date().toISOString() }).eq('table_id', selectedTable)

      setCart({})

      // Spike detection: ≥3 orders in last 5 min
      const fiveMinAgo = Date.now() - 5 * 60 * 1000
      const recentCount = (orders || []).filter((o) => {
        const ts = toDate(o.created_at)?.getTime() ?? 0
        return ts >= fiveMinAgo
      }).length
      if (recentCount >= 2) setSpikeAlert(true)  // +1 for the order just created
    } catch (e) {
      console.error(e)
      setError(t('common.error'))
    } finally { setBusy(false) }
  }

  // ── Send to kitchen: update order status + create kitchen_queue entries ──
  async function handleSendToKitchen(orderId) {
    setBusy(true); setError(null)
    try {
      await supabase.from('orders').update({ status: 'in_kitchen' }).eq('id', orderId)

      // Create a kitchen_queue item per line-item
      const order = orders.find((o) => o.id === orderId)
      if (order?.items?.length) {
        await supabase.from('kitchen_queue').insert(
          order.items.map((item) => ({
            order_id: orderId,
            table_id: selectedTable,
            item_sku: item.sku,
            item_name: item.name_en,
            item_name_vi: item.name_vi,
            item_name_en: item.name_en,
            qty: item.qty,
            station: 'kitchen',
            status: 'pending',
            queued_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            prep_time_target_min: 15,
          }))
        )
        await applyInventoryDeductions(order.items)
      }
    } catch (e) {
      console.error(e)
      setError(t('common.error'))
    } finally { setBusy(false) }
  }

  async function handleAddMoreItems(orderId) {
    if (cartItems.length === 0) return
    setBusy(true); setError(null)
    try {
      const { data: existingOrderData } = await supabase.from('orders').select('items').eq('id', orderId).single()
      const existingItems = existingOrderData?.items || []

      const newItems = cartItems.map(([sku, qty]) => {
        const item = activeMenu.find((m) => m.sku === sku)
        return { sku: item.sku, name_en: item.name_en, name_vi: item.name_vi, unit_price: item.unit_price, qty }
      })

      // Merge into full bill (for total_amount tracking)
      const merged = [...existingItems]
      for (const ni of newItems) {
        const idx = merged.findIndex((e) => e.sku === ni.sku)
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], qty: merged[idx].qty + ni.qty }
        } else {
          merged.push(ni)
        }
      }

      const total_amount = merged.reduce((s, i) => s + i.unit_price * i.qty, 0)

      // Update bill total and send only new items to kitchen
      await supabase.from('orders').update({ items: merged, total_amount, status: 'in_kitchen' }).eq('id', orderId)

      await supabase.from('kitchen_queue').insert(
        newItems.map((item) => ({
          order_id: orderId,
          table_id: selectedTable,
          item_sku: item.sku,
          item_name_vi: item.name_vi,
          item_name_en: item.name_en,
          qty: item.qty,
          station: 'kitchen',
          status: 'pending',
          queued_at: new Date().toISOString(),
          started_at: null,
          completed_at: null,
          prep_time_target_min: 15,
        }))
      )
      await applyInventoryDeductions(newItems)

      setCart({})
      setAddingMore(false)
    } catch (e) {
      console.error(e)
      setError(t('common.error'))
    } finally { setBusy(false) }
  }

  async function handleRecallToKitchen(orderId) {
    const activeEntries = (kitchenQueue || []).filter(
      (q) => q.order_id === orderId && (q.status === 'pending' || q.status === 'in_progress')
    )
    if (activeEntries.length > 0) {
      setError(i18n.language === 'vi'
        ? 'Đơn hàng đang trong hàng chờ bếp, vui lòng chờ'
        : 'Order is already in kitchen queue, please wait')
      return
    }

    setBusy(true); setError(null)
    try {
      const order = orders.find((o) => o.id === orderId)
      if (order?.items?.length) {
        await supabase.from('kitchen_queue').insert(
          order.items.map((item) => ({
            order_id: orderId,
            table_id: order.table_id,
            item_sku: item.sku,
            item_name: item.name_en,
            item_name_vi: item.name_vi,
            item_name_en: item.name_en,
            qty: item.qty,
            station: 'kitchen',
            status: 'pending',
            queued_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            prep_time_target_min: 15,
          }))
        )
      }
    } catch (e) {
      console.error(e)
      setError(t('common.error'))
    } finally { setBusy(false) }
  }

  async function handleInitVnpay(orderId, amount) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/vnpay/create-payment-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount }),
      })
      if (!res.ok) throw new Error(`Payment service error: ${res.status}`)
      const data = await res.json()
      if (!data.paymentUrl) throw new Error('No payment URL returned')
      setVnpayModal({ orderId, amount, paymentUrl: data.paymentUrl })
    } catch (e) {
      console.error(e)
      setError(i18n.language === 'vi' ? 'Không thể tạo mã QR thanh toán' : 'Could not generate payment QR')
    } finally { setBusy(false) }
  }

  // ── Mark served ──
  async function handleMarkServed(orderId) {
    setBusy(true); setError(null)
    try {
      await supabase.from('orders').update({ status: 'served', served_at: new Date().toISOString() }).eq('id', orderId)
    } catch (e) {
      console.error(e)
      setError(t('common.error'))
    } finally { setBusy(false) }
  }

  // Advance a kitchen_queue item: pending→in_progress or in_progress→ready.
  // When all items for an order reach 'ready', auto-promote the order to 'ready'.
  async function handleAdvanceQueueItem(queueItem) {
    const nextStatus = queueItem.status === 'pending' ? 'in_progress' : 'ready'
    try {
      await supabase.from('kitchen_queue').update({ status: nextStatus }).eq('queue_id', queueItem.queue_id)

      if (nextStatus === 'ready') {
        // Check if all sibling items are now ready
        const siblings = (kitchenQueue || []).filter(
          (q) => q.order_id === queueItem.order_id
        )
        const allReady = siblings.every(
          (q) => q.queue_id === queueItem.queue_id ? true : q.status === 'ready'
        )
        if (allReady) {
          await supabase.from('orders').update({ status: 'ready' }).eq('id', queueItem.order_id)
        }
      }
    } catch (e) {
      console.error(e)
      setError(t('common.error'))
    }
  }

  // ── Record payment: write payment_method + set table to cleanup ──
  async function handleRecordPayment(orderId, method, total) {
    setBusy(true); setError(null)
    try {
      await supabase.from('orders').update({ payment_method: method }).eq('id', orderId)
      await supabase.from('tables').update({ status: 'cleanup' }).eq('table_id', selectedTable)
      setPaymentConfirmation({ tableId: selectedTable, total, method })
    } catch (e) {
      console.error(e)
      setError(t('common.error'))
    } finally { setBusy(false) }
  }

  async function handleAssignTable(reservationId, tableId) {
    try {
      await supabase.from('reservations').update({ table_id: tableId || null }).eq('reservation_id', reservationId)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleSaveNote(reservationId) {
    try {
      await supabase.from('reservations').update({ note: noteInput.trim() || null }).eq('reservation_id', reservationId)
      setEditingNoteId(null)
      setNoteInput('')
    } catch (e) {
      console.error(e)
    }
  }

  async function handleDeleteReservation(reservationId) {
    try {
      await supabase.from('reservations').delete().eq('reservation_id', reservationId)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleMarkClean(tableId) {
    setBusy(true); setError(null)
    try {
      await supabase.from('tables').update({ status: 'open', seated_at: null }).eq('table_id', tableId)

      // Complete any confirmed reservation tied to this table
      const linkedRes = (reservations || []).find(
        (r) => r.table_id === tableId && r.status === 'confirmed'
      )
      if (linkedRes) {
        await supabase.from('reservations').update({ status: 'completed', table_id: null }).eq('reservation_id', linkedRes.reservation_id)
      }

      setSelectedTable(null)
      setPaymentConfirmation(null)
    } catch (e) {
      console.error(e)
      setError(t('common.error'))
    } finally { setBusy(false) }
  }

  const tabs = [
    { id: 'tables',       label: i18n.language === 'vi' ? 'Sơ đồ bàn' : 'Tables' },
    { id: 'orders',       label: i18n.language === 'vi' ? 'Theo dõi đơn' : 'Orders' },
    { id: 'reservations', label: i18n.language === 'vi' ? 'Đặt bàn' : 'Reservations' },
  ]

  // Kitchen kanban
  const queue = kitchenQueue || []
  const pendingQ   = queue.filter((q) => q.status === 'pending')
  const inKitchenQ = queue.filter((q) => q.status === 'in_progress' || q.status === 'in_kitchen')
  const completedQ = queue.filter((q) => q.status === 'ready' || q.status === 'completed')

  // Reservations
  const upcoming = (reservations || []).filter((r) => {
    const time = toDate(r.reservation_time)
    return r.status === 'confirmed' && time && time.getTime() >= Date.now()
  })
  const allUpcoming = upcoming

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
          <button onClick={() => setSpikeAlert(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline', color: 'inherit' }}>
            {t('common.cancel')}
          </button>
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
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Table grid */}
          <div style={{ flex: '0 0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(90px,1fr))', gap: '10px', marginBottom: '12px', width: '320px' }}>
              {tables.map((tb) => {
                const tc = TABLE_COLORS[tb.status] || TABLE_COLORS.open
                const isSelected = selectedTable === tb.table_id
                const tableOrder = orders.find((o) =>
                  o.table_id === tb.table_id && o.status !== 'cancelled' && o.status !== 'served'
                )
                const seatedAt = toDate(tb.seated_at)
                const elapsedMin = seatedAt && tb.status === 'dining'
                  ? Math.round((Date.now() - seatedAt.getTime()) / 60000)
                  : null
                const reservationForTable = tb.status === 'reserved'
                  ? (reservations || []).find((r) => r.table_id === tb.table_id && r.status === 'confirmed')
                  : null
                return (
                  <button
                    key={tb.table_id}
                    onClick={() => { setSelectedTable(tb.table_id); setPaymentConfirmation(null); setError(null); setAddingMore(false) }}
                    style={{
                      borderRadius: '10px', padding: '12px 8px', textAlign: 'center', fontSize: '13px',
                      fontWeight: 500, cursor: 'pointer',
                      border: isSelected ? '2px solid var(--pp-primary)' : '2px solid transparent',
                      background: tc.bg, color: tc.color, transition: 'border 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{tb.table_id}</div>
                    <div style={{ fontSize: '11px', marginTop: '2px' }}>{t(`dashboard.status.${tb.status}`)}</div>
                    {tableOrder && (
                      <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--pp-primary)', fontWeight: 600 }}>
                        {t(`foh.orderStatus.${tableOrder.status}`)}
                      </div>
                    )}
                    {elapsedMin !== null && (
                      <div style={{
                        marginTop: '4px', fontSize: '11px', fontWeight: 600,
                        color: elapsedMin > AVG_OCCUPIED_MIN ? 'var(--pp-danger-text)' : 'var(--pp-success-text)',
                        background: elapsedMin > AVG_OCCUPIED_MIN ? 'var(--pp-danger-bg)' : 'var(--pp-success-bg)',
                        borderRadius: '4px', padding: '1px 4px',
                      }}>{elapsedMin}m</div>
                    )}
                    {reservationForTable && (
                      <div style={{
                        marginTop: '3px', fontSize: '10px', fontWeight: 600, color: '#854D0E',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px',
                      }}>
                        {reservationForTable.guest_name}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {Object.entries(TABLE_COLORS).map(([status, style]) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--pp-text-muted)' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: style.bg, border: '1px solid var(--pp-border)' }} />
                  {t(`dashboard.status.${status}`)}
                </div>
              ))}
            </div>
          </div>

          {/* Order panel */}
          {selectedTable && (
            <div style={{ flex: 1, minWidth: '300px', maxWidth: '420px', background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                  {activeOrder ? `${t('foh.billFor', { table: selectedTable })}` : `${i18n.language === 'vi' ? 'Bàn' : 'Table'} ${selectedTable}`}
                </h2>
                {activeOrder && (
                  <span style={{
                    borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: 500,
                    background: activeOrder.status === 'served' ? 'var(--pp-success-bg)'
                      : activeOrder.status === 'ready'     ? 'var(--pp-success-bg)'
                      : activeOrder.status === 'in_kitchen' ? 'var(--pp-warning-bg)'
                      : 'var(--pp-neutral-bg)',
                    color: activeOrder.status === 'served' ? 'var(--pp-success-text)'
                      : activeOrder.status === 'ready'     ? 'var(--pp-success-text)'
                      : activeOrder.status === 'in_kitchen' ? 'var(--pp-warning-text)'
                      : 'var(--pp-neutral-text)',
                  }}>
                    {t(`foh.orderStatus.${activeOrder.status}`)}
                  </span>
                )}
              </div>

              {error && <p style={{ color: 'var(--pp-danger-text)', fontSize: '13px', marginBottom: '10px' }}>{error}</p>}

              {/* Payment confirmed screen */}
              {paymentConfirmation && paymentConfirmation.tableId === selectedTable ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--pp-success-text)', marginBottom: '8px' }}>{t('foh.paymentReceived')}</p>
                  <p style={{ fontSize: '28px', fontWeight: 700, marginBottom: '4px' }}>{formatVnd(paymentConfirmation.total, i18n.language)}</p>
                  <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', marginBottom: '20px', textTransform: 'capitalize' }}>{paymentConfirmation.method}</p>
                  <button
                    onClick={() => { setPaymentConfirmation(null); setSelectedTable(null) }}
                    style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '10px 24px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', width: '100%' }}
                  >
                    {t('foh.startNewOrder')}
                  </button>
                </div>
              ) : !activeOrder ? (
                (() => {
                  const tbl = tables.find((tb) => tb.table_id === selectedTable)
                  if (tbl?.status === 'cleanup') {
                    return (
                      <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧹</div>
                        <p style={{ fontSize: '14px', color: 'var(--pp-text-muted)', marginBottom: '20px' }}>
                          {i18n.language === 'vi' ? 'Bàn đang được dọn dẹp' : 'Table is being cleaned'}
                        </p>
                        <button
                          disabled={busy}
                          onClick={() => handleMarkClean(selectedTable)}
                          style={{
                            width: '100%', background: 'var(--pp-primary)', color: 'white',
                            border: 'none', borderRadius: '99px', padding: '10px',
                            fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                            opacity: busy ? 0.5 : 1,
                          }}
                        >
                          {busy ? '…' : t('foh.markClean')}
                        </button>
                      </div>
                    )
                  }
                  return (
                    <div>
                      <p style={{ fontSize: '12px', color: 'var(--pp-text-muted)', marginBottom: '12px' }}>
                        {i18n.language === 'vi' ? 'Chọn món để tạo đơn hàng mới' : 'Select items to create a new order'}
                      </p>
                      {activeMenu.map((item) => {
                        const outOfStock = unavailableSkus.has(item.sku)
                        return (
                          <div key={item.sku} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid var(--pp-border)', opacity: outOfStock ? 0.5 : 1 }}>
                            <div>
                              <p style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>{i18n.language === 'vi' ? item.name_vi : item.name_en}</p>
                              <p style={{ fontSize: '12px', color: outOfStock ? 'var(--pp-danger-text)' : 'var(--pp-text-muted)', margin: 0 }}>
                                {outOfStock ? (i18n.language === 'vi' ? 'Hết nguyên liệu' : 'Out of stock') : formatVnd(item.unit_price, i18n.language)}
                              </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button disabled={outOfStock} onClick={() => setCart((c) => ({ ...c, [item.sku]: Math.max(0, (c[item.sku] || 0) - 1) }))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-border)', background: 'white', cursor: outOfStock ? 'not-allowed' : 'pointer', fontSize: '16px', lineHeight: 1 }}>−</button>
                              <span style={{ width: '22px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>{cart[item.sku] || 0}</span>
                              <button disabled={outOfStock} onClick={() => setCart((c) => ({ ...c, [item.sku]: (c[item.sku] || 0) + 1 }))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-border)', background: 'white', cursor: outOfStock ? 'not-allowed' : 'pointer', fontSize: '16px', lineHeight: 1 }}>+</button>
                            </div>
                          </div>
                        )
                      })}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '16px' }}>{formatVnd(cartTotal, i18n.language)}</span>
                        <button
                          disabled={busy || cartItems.length === 0}
                          onClick={handleCreateOrder}
                          style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '10px 22px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: (busy || cartItems.length === 0) ? 0.5 : 1 }}
                        >
                          {busy ? '…' : t('foh.createOrder')}
                        </button>
                      </div>
                    </div>
                  )
                })()
              ) : (
                /* Active order — bill view */
                <div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
                    {(activeOrder.items || []).map((it, idx) => (
                      <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '6px 0', borderBottom: '1px solid var(--pp-border)' }}>
                        <span>{it.qty}× {i18n.language === 'vi' ? it.name_vi : it.name_en}</span>
                        <span style={{ fontWeight: 500 }}>{formatVnd(it.unit_price * it.qty, i18n.language)}</span>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--pp-border)', paddingTop: '10px', fontWeight: 700, fontSize: '16px', marginBottom: '16px' }}>
                    <span>{t('foh.total')}</span>
                    <span>{formatVnd(activeOrder.total_amount, i18n.language)}</span>
                  </div>

                  {activeOrder.status === 'open' && (
                    <button
                      disabled={busy}
                      onClick={() => handleSendToKitchen(activeOrder.id)}
                      style={{ width: '100%', background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '10px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
                    >
                      {busy ? '…' : t('foh.sendToKitchen')}
                    </button>
                  )}

                  {activeOrder.status === 'in_kitchen' && (
                    <div>
                      <p style={{ fontSize: '13px', color: 'var(--pp-warning-text)', background: 'var(--pp-warning-bg)', borderRadius: '6px', padding: '8px 12px', marginBottom: '10px' }}>
                        🍳 {t('foh.inKitchen')}
                      </p>
                      <button
                        disabled={busy}
                        onClick={() => handleRecallToKitchen(activeOrder.id)}
                        style={{
                          width: '100%', background: 'transparent', color: 'var(--pp-warning-text)',
                          border: '1px solid var(--pp-warning-border)', borderRadius: '99px', padding: '10px',
                          fontWeight: 600, fontSize: '13px', cursor: busy ? 'not-allowed' : 'pointer',
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        {busy ? '…' : (i18n.language === 'vi' ? '🔔 Gọi lại bếp' : '🔔 Recall to Kitchen')}
                      </button>
                    </div>
                  )}

                  {activeOrder.status === 'ready' && (
                    <div>
                      <p style={{
                        fontSize: '13px', color: 'var(--pp-success-text)',
                        background: 'var(--pp-success-bg)', borderRadius: '6px',
                        padding: '8px 12px', marginBottom: '10px',
                      }}>
                        ✅ {t('foh.orderReady')}
                      </p>
                      <button
                        disabled={busy}
                        onClick={() => handleMarkServed(activeOrder.id)}
                        style={{
                          width: '100%', background: 'var(--pp-primary)', color: 'white',
                          border: 'none', borderRadius: '99px', padding: '10px',
                          fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        {busy ? '…' : t('foh.markServed')}
                      </button>
                    </div>
                  )}

                  {activeOrder.status === 'served' && !activeOrder.payment_method && (
                    <div>
                      {addingMore ? (
                        <div>
                          <p style={{ fontSize: '12px', color: 'var(--pp-text-muted)', marginBottom: '12px' }}>
                            {i18n.language === 'vi' ? 'Thêm món vào đơn hiện tại' : 'Add items to current order'}
                          </p>
                          {activeMenu.map((item) => {
                            const outOfStock = unavailableSkus.has(item.sku)
                            return (
                              <div key={item.sku} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid var(--pp-border)', opacity: outOfStock ? 0.5 : 1 }}>
                                <div>
                                  <p style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>{i18n.language === 'vi' ? item.name_vi : item.name_en}</p>
                                  <p style={{ fontSize: '12px', color: outOfStock ? 'var(--pp-danger-text)' : 'var(--pp-text-muted)', margin: 0 }}>
                                    {outOfStock ? (i18n.language === 'vi' ? 'Hết nguyên liệu' : 'Out of stock') : formatVnd(item.unit_price, i18n.language)}
                                  </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <button disabled={outOfStock} onClick={() => setCart((c) => ({ ...c, [item.sku]: Math.max(0, (c[item.sku] || 0) - 1) }))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-border)', background: 'white', cursor: outOfStock ? 'not-allowed' : 'pointer', fontSize: '16px', lineHeight: 1 }}>−</button>
                                  <span style={{ width: '22px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>{cart[item.sku] || 0}</span>
                                  <button disabled={outOfStock} onClick={() => setCart((c) => ({ ...c, [item.sku]: (c[item.sku] || 0) + 1 }))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-border)', background: 'white', cursor: outOfStock ? 'not-allowed' : 'pointer', fontSize: '16px', lineHeight: 1 }}>+</button>
                                </div>
                              </div>
                            )
                          })}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button
                              onClick={() => { setAddingMore(false); setCart({}) }}
                              style={{ flex: 1, border: '1px solid var(--pp-border)', background: 'white', borderRadius: '99px', padding: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              disabled={busy || cartItems.length === 0}
                              onClick={() => handleAddMoreItems(activeOrder.id)}
                              style={{ flex: 1, background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: (busy || cartItems.length === 0) ? 0.5 : 1 }}
                            >
                              {busy ? '…' : (i18n.language === 'vi' ? 'Gửi bếp' : 'Send to Kitchen')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>{t('foh.recordPayment')}</p>
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            <button
                              disabled={busy}
                              onClick={() => handleRecordPayment(activeOrder.id, 'cash', activeOrder.total_amount)}
                              style={{ flex: 1, border: '2px solid var(--pp-border)', background: 'white', borderRadius: '8px', padding: '10px 6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
                            >
                              💵 Cash
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => handleInitVnpay(activeOrder.id, activeOrder.total_amount)}
                              style={{ flex: 1, border: '2px solid var(--pp-border)', background: 'white', borderRadius: '8px', padding: '10px 6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
                            >
                              📱 VNPay
                            </button>
                          </div>
                          <button
                            onClick={() => { setAddingMore(true); setCart({}) }}
                            style={{ width: '100%', border: '2px solid var(--pp-primary)', background: 'transparent', color: 'var(--pp-primary)', borderRadius: '99px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            {t('foh.addMoreItems')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', alignItems: 'start' }}>
              {[
                { label: t('boh.kanban.pending'),   items: pendingQ,   dot: '#F59E0B', border: '#FCD34D', headerBg: '#FFFBEB', headerColor: '#92400E' },
                { label: t('boh.kanban.inKitchen'), items: inKitchenQ, dot: '#6366F1', border: '#A5B4FC', headerBg: '#EEF2FF', headerColor: '#3730A3' },
                { label: t('boh.kanban.completed'), items: completedQ, dot: '#22C55E', border: '#86EFAC', headerBg: '#F0FDF4', headerColor: '#166534' },
              ].map((col) => (
                <div key={col.label} style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden', minHeight: '200px', display: 'flex', flexDirection: 'column' }}>
                  {/* Fix 6+7: nowrap + colored dot */}
                  <div style={{ background: col.headerBg, color: col.headerColor, padding: '10px 14px', fontWeight: 700, fontSize: '13px', borderBottom: `2px solid ${col.border}`, display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.dot, display: 'inline-block', flexShrink: 0 }} />
                    {col.label} <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: '2px' }}>({col.items.length})</span>
                  </div>
                  <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    {col.items.map((q) => {
                      const queuedAt = toDate(q.queued_at)
                      const elapsed = queuedAt ? Math.round((Date.now() - queuedAt.getTime()) / 60000) : 0
                      // Fix 5: time color + icon based on urgency
                      const isOverdue = elapsed > 20
                      const isWarning = elapsed > 10 && elapsed <= 20
                      const timeColor = isOverdue ? 'var(--pp-danger-text)' : isWarning ? '#D97706' : 'var(--pp-success-text)'
                      const timeIcon = isOverdue ? '⚠' : '⏱'
                      return (
                        <div key={q.queue_id} style={{
                          background: 'white', border: `1px solid ${isOverdue ? 'var(--pp-danger-border)' : 'var(--pp-border)'}`,
                          borderRadius: '8px', padding: '10px',
                          animation: isOverdue ? 'pulse-danger 2s infinite' : 'none',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                            <p style={{ fontWeight: 600, fontSize: '13px', margin: 0 }}>
                              {q.qty ? `${q.qty}× ` : ''}{i18n.language === 'vi' ? (q.item_name_vi || q.item_name || q.item_sku) : (q.item_name_en || q.item_name || q.item_sku)}
                            </p>
                            {q.table_id && (
                              <span style={{ fontSize: '11px', background: 'var(--pp-neutral-bg)', color: 'var(--pp-neutral-text)', borderRadius: '4px', padding: '1px 5px', marginLeft: '6px', whiteSpace: 'nowrap' }}>
                                {q.table_id}
                              </span>
                            )}
                          </div>
                          {/* Fix 5: time with icon and urgency color */}
                          <p style={{ fontSize: '12px', fontWeight: isWarning || isOverdue ? 700 : 500, color: timeColor, margin: 0 }}>
                            {timeIcon} {elapsed} {i18n.language === 'vi' ? 'phút' : 'min'}
                          </p>
                          {(q.status === 'pending' || q.status === 'in_progress') && (
                            <button
                              onClick={() => handleAdvanceQueueItem(q)}
                              style={{
                                marginTop: '8px', width: '100%', fontSize: '12px', fontWeight: 600,
                                padding: '5px 0', borderRadius: '6px', cursor: 'pointer', border: 'none',
                                background: q.status === 'pending' ? 'var(--pp-warning-bg)' : 'var(--pp-success-bg)',
                                color: q.status === 'pending' ? 'var(--pp-warning-text)' : 'var(--pp-success-text)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                              }}
                            >
                              {/* Fix 10: arrow on advance button */}
                              {q.status === 'pending' ? t('boh.kanban.startCooking') : t('boh.kanban.markReady')} →
                            </button>
                          )}
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
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  style={{ flex: 1, minWidth: '140px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}
                  placeholder={t('guest.guestNameLabel')}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <input
                  type="number" min="1" max="20"
                  style={{ width: '70px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px', fontSize: '13px' }}
                  value={form.partySize}
                  onChange={(e) => setForm((f) => ({ ...f, partySize: Number(e.target.value) }))}
                />
                <input
                  style={{ width: '90px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px', fontSize: '13px' }}
                  placeholder="HH:MM"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                />
              </div>
              <button
                onClick={async () => {
                  if (!form.name.trim()) {
                    setFormError(i18n.language === 'vi' ? 'Vui lòng nhập tên khách' : 'Please enter guest name')
                    return
                  }
                  try {
                    const [hh, mm] = form.time.split(':').map(Number)
                    const resTime = new Date()
                    resTime.setHours(hh, mm, 0, 0)
                    await supabase.from('reservations').insert({
                      reservation_id: crypto.randomUUID(),
                      guest_name: form.name.trim(),
                      party_size: form.partySize,
                      reservation_time: resTime.toISOString(),
                      status: 'confirmed',
                      table_id: null,
                      note: null,
                    })
                    setForm({ name: '', partySize: 2, time: '18:00' })
                    setFormOpen(false)
                    setFormError(null)
                  } catch (e) {
                    console.error(e)
                    setFormError(i18n.language === 'vi' ? 'Lỗi khi lưu đặt bàn' : 'Error saving reservation')
                  }
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
                    {[
                      t('guest.guestName'),
                      t('guest.partySize'),
                      t('guest.time'),
                      t('foh.assignTable'),
                      i18n.language === 'vi' ? 'Ghi chú' : 'Note',
                      t('guest.status'),
                      '',
                    ].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allUpcoming.map((r) => (
                    <tr key={r.reservation_id} style={{ borderBottom: '1px solid var(--pp-border)' }}>
                      <td style={{ padding: '12px' }}>{r.guest_name}</td>
                      <td style={{ padding: '12px' }}>{r.party_size}</td>
                      <td style={{ padding: '12px' }}>
                        {r.reservation_time ? formatDateTime(toDate(r.reservation_time), i18n.language) : r.time}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <select
                          value={r.table_id || ''}
                          onChange={(e) => handleAssignTable(r.reservation_id, e.target.value)}
                          style={{ border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', background: 'white' }}
                        >
                          <option value="">{t('foh.noTableAssigned')}</option>
                          {(tables || [])
                            .filter((tb) => tb.status === 'open' || tb.table_id === r.table_id)
                            .map((tb) => (
                              <option key={tb.table_id} value={tb.table_id}>{tb.table_id}</option>
                            ))}
                        </select>
                      </td>
                      <td style={{ padding: '12px', minWidth: '160px' }}>
                        {editingNoteId === r.reservation_id ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              autoFocus
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                              placeholder={t('foh.notePlaceholder')}
                              style={{ flex: 1, border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px' }}
                            />
                            <button
                              onClick={() => handleSaveNote(r.reservation_id)}
                              style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              {t('foh.saveNote')}
                            </button>
                            <button
                              onClick={() => { setEditingNoteId(null); setNoteInput('') }}
                              style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                            >✕</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', color: r.note ? 'var(--pp-text)' : 'var(--pp-text-hint)' }}>
                              {r.note || '—'}
                            </span>
                            <button
                              onClick={() => { setEditingNoteId(r.reservation_id); setNoteInput(r.note || '') }}
                              style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              {t('foh.addNote')}
                            </button>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: 500,
                          background: r.status === 'confirmed' ? 'var(--pp-primary-light)' : r.status === 'completed' ? 'var(--pp-success-bg)' : 'var(--pp-neutral-bg)',
                          color: r.status === 'confirmed' ? 'var(--pp-primary-text)' : r.status === 'completed' ? 'var(--pp-success-text)' : 'var(--pp-neutral-text)',
                        }}>
                          {t(`guest.statusLabel.${r.status}`)}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <button
                          onClick={() => {
                            if (window.confirm(i18n.language === 'vi' ? `Xoá đặt bàn của ${r.guest_name}?` : `Delete reservation for ${r.guest_name}?`)) {
                              handleDeleteReservation(r.reservation_id)
                            }
                          }}
                          style={{ background: 'transparent', border: '1px solid var(--pp-danger-text)', color: 'var(--pp-danger-text)', borderRadius: '6px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {i18n.language === 'vi' ? 'Xoá' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {vnpayModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '32px 28px',
            textAlign: 'center', maxWidth: '340px', width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>VNPay</h2>
            <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', marginBottom: '20px' }}>
              {t('foh.vnpayQR')}
            </p>
            <div style={{ display: 'inline-block', padding: '12px', background: 'white', border: '2px solid var(--pp-border)', borderRadius: '12px', marginBottom: '16px' }}>
              <QRCodeSVG value={vnpayModal.paymentUrl} size={200} />
            </div>
            <p style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>
              {formatVnd(vnpayModal.amount, i18n.language)}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setVnpayModal(null); setError(null) }}
                style={{ flex: 1, border: '1px solid var(--pp-border)', background: 'transparent', borderRadius: '99px', padding: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                {t('common.cancel')}
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  await handleRecordPayment(vnpayModal.orderId, 'vnpay', vnpayModal.amount)
                  setVnpayModal(null)
                }}
                style={{ flex: 1, background: '#0066CC', color: 'white', border: 'none', borderRadius: '99px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
              >
                {busy ? '…' : t('foh.confirmPayment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
