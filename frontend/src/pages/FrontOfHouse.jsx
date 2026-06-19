import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '../services/firebase'
import { api } from '../services/api'
import { MENU_ITEMS } from '../data/menu'

function formatVnd(amount, lang) {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)
}

const TABLE_COLORS = {
  open: 'bg-gray-100 text-gray-600',
  reserved: 'bg-yellow-100 text-yellow-700',
  dining: 'bg-purple-100 text-purple-700',
  cleanup: 'bg-orange-100 text-orange-700',
}

const PAYMENT_METHODS = ['cash', 'card', 'momo']

export default function FrontOfHouse() {
  const { t, i18n } = useTranslation()
  const [tables, setTables] = useState(null)
  const [orders, setOrders] = useState(null)
  const [selectedTable, setSelectedTable] = useState(null)
  const [cart, setCart] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsubTables = onSnapshot(collection(db, 'tables'), (snap) => {
      setTables(snap.docs.map((d) => d.data()))
    })
    const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => {
      unsubTables()
      unsubOrders()
    }
  }, [])

  const activeOrder = useMemo(() => {
    if (!orders || !selectedTable) return null
    return orders
      .filter((o) => o.table_id === selectedTable && o.status !== 'cancelled')
      .sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0))
      .find((o) => o.status !== 'served' || !o.payment_method) || null
  }, [orders, selectedTable])

  if (tables === null || orders === null) {
    return <div className="p-6">{t('common.loading')}</div>
  }

  const cartItems = Object.entries(cart).filter(([, qty]) => qty > 0)
  const cartTotal = cartItems.reduce((sum, [sku, qty]) => {
    const item = MENU_ITEMS.find((m) => m.sku === sku)
    return sum + item.unit_price * qty
  }, 0)

  async function handleCreateOrder() {
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/orders', {
        table_id: selectedTable,
        channel: 'dine_in',
        items: cartItems.map(([sku, qty]) => ({ sku, qty })),
      })
      setCart({})
    } catch (err) {
      setError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSendToKitchen(orderId) {
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/api/orders/${orderId}/status`, { status: 'in_kitchen' })
    } catch (err) {
      setError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleMarkServed(orderId) {
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/api/orders/${orderId}/status`, { status: 'served' })
    } catch (err) {
      setError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRecordPayment(orderId, method) {
    setBusy(true)
    setError(null)
    try {
      await updateDoc(doc(db, 'orders', orderId), { payment_method: method })
      await updateDoc(doc(db, 'tables', selectedTable), { status: 'cleanup' })
    } catch (err) {
      setError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">{t('nav.frontOfHouse')}</h1>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {tables.map((tb) => (
          <button
            key={tb.table_id}
            onClick={() => setSelectedTable(tb.table_id)}
            className={
              'rounded-md p-3 text-center text-sm font-medium ring-2 transition ' +
              TABLE_COLORS[tb.status] +
              (selectedTable === tb.table_id ? ' ring-purple-500' : ' ring-transparent')
            }
          >
            <div>{tb.table_id}</div>
            <div className="text-xs">{t(`dashboard.status.${tb.status}`)}</div>
          </button>
        ))}
      </div>

      {selectedTable && (
        <div className="mt-6 max-w-md rounded-lg border border-gray-200 p-4">
          <h2 className="mb-3 text-lg font-semibold">{selectedTable}</h2>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

          {!activeOrder && (
            <div className="space-y-3">
              {MENU_ITEMS.map((item) => (
                <div key={item.sku} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{i18n.language === 'vi' ? item.name_vi : item.name_en}</p>
                    <p className="text-xs text-gray-500">{formatVnd(item.unit_price, i18n.language)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="h-7 w-7 rounded border border-gray-300"
                      onClick={() => setCart((c) => ({ ...c, [item.sku]: Math.max(0, (c[item.sku] || 0) - 1) }))}
                    >
                      −
                    </button>
                    <span className="w-4 text-center">{cart[item.sku] || 0}</span>
                    <button
                      className="h-7 w-7 rounded border border-gray-300"
                      onClick={() => setCart((c) => ({ ...c, [item.sku]: (c[item.sku] || 0) + 1 }))}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                <span className="font-medium">{formatVnd(cartTotal, i18n.language)}</span>
                <button
                  disabled={busy || cartItems.length === 0}
                  onClick={handleCreateOrder}
                  className="rounded bg-purple-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {t('foh.createOrder')}
                </button>
              </div>
            </div>
          )}

          {activeOrder && (
            <div className="space-y-3">
              <ul className="space-y-1">
                {activeOrder.items.map((it, idx) => (
                  <li key={idx} className="flex justify-between text-sm">
                    <span>
                      {it.qty}× {i18n.language === 'vi' ? it.name_vi : it.name_en}
                    </span>
                    <span>{formatVnd(it.unit_price * it.qty, i18n.language)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-medium">
                <span>{t('foh.total')}</span>
                <span>{formatVnd(activeOrder.total_amount, i18n.language)}</span>
              </div>

              {activeOrder.status === 'open' && (
                <button
                  disabled={busy}
                  onClick={() => handleSendToKitchen(activeOrder.id)}
                  className="w-full rounded bg-purple-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {t('foh.sendToKitchen')}
                </button>
              )}

              {activeOrder.status === 'in_kitchen' && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">{t('foh.inKitchen')}</p>
                  <button
                    disabled={busy}
                    onClick={() => handleMarkServed(activeOrder.id)}
                    className="w-full rounded bg-purple-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                  >
                    {t('foh.markServed')}
                  </button>
                </div>
              )}

              {activeOrder.status === 'served' && !activeOrder.payment_method && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('foh.recordPayment')}</p>
                  <div className="flex gap-2">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method}
                        disabled={busy}
                        onClick={() => handleRecordPayment(activeOrder.id, method)}
                        className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm capitalize disabled:opacity-50"
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
