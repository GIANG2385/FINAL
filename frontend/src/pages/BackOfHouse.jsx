import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../services/firebase'
import { api } from '../services/api'

function formatVnd(amount, lang) {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)
}

function formatTime(date, lang) {
  return date.toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
}

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

const OVERLOAD_QUEUE_DEPTH = 5

export default function BackOfHouse() {
  const { t, i18n } = useTranslation()
  const [inventory, setInventory] = useState(null)
  const [inventoryError, setInventoryError] = useState(null)
  const [kitchenQueue, setKitchenQueue] = useState(null)
  const [staffShifts, setStaffShifts] = useState(null)
  const [orders, setOrders] = useState(null)
  const [profit, setProfit] = useState(null)
  const [profitError, setProfitError] = useState(null)

  useEffect(() => {
    const unsubQueue = onSnapshot(collection(db, 'kitchen_queue'), (snap) => {
      setKitchenQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    const unsubShifts = onSnapshot(collection(db, 'staff_shifts'), (snap) => {
      setStaffShifts(snap.docs.map((d) => d.data()))
    })
    // Scoped to the last 24h — the orders collection also holds 10,000+
    // historical rows (loaded for analytics baselines), which an
    // unscoped live listener here would read in full on every mount.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentOrders = query(collection(db, 'orders'), where('created_at', '>=', dayAgo))
    const unsubOrders = onSnapshot(recentOrders, (snap) => {
      setOrders(snap.docs.map((d) => d.data()))
    })
    return () => {
      unsubQueue()
      unsubShifts()
      unsubOrders()
    }
  }, [])

  useEffect(() => {
    api
      .get('/api/inventory/forecast')
      .then(setInventory)
      .catch(() => setInventoryError(t('common.error')))
    api
      .get('/api/profit/summary?range=day')
      .then(setProfit)
      .catch(() => setProfitError(t('common.error')))
  }, [t])

  if (kitchenQueue === null || staffShifts === null || orders === null) {
    return <div className="p-6">{t('common.loading')}</div>
  }

  const activeQueue = kitchenQueue.filter((q) => q.status !== 'ready')
  const overloaded = activeQueue.length >= OVERLOAD_QUEUE_DEPTH

  const onShiftNow = staffShifts.filter((s) => {
    const start = toDate(s.shift_start)
    const end = toDate(s.shift_end)
    const now = new Date()
    return start <= now && now <= end
  })
  const recentOrderVolume = orders.filter((o) => {
    const created = toDate(o.created_at)
    return created && Date.now() - created.getTime() < 2 * 60 * 60 * 1000
  }).length
  const staffingFlag =
    recentOrderVolume > onShiftNow.length * 5 ? 'understaffed' : onShiftNow.length > 0 && recentOrderVolume < onShiftNow.length ? 'overstaffed' : 'ok'

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-semibold">{t('nav.backOfHouse')}</h1>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('boh.inventory')}</h2>
        {inventoryError ? (
          <p className="text-sm text-red-600">{inventoryError}</p>
        ) : inventory === null ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-1 pr-2">{t('boh.item')}</th>
                <th className="py-1 pr-2">{t('boh.stock')}</th>
                <th className="py-1 pr-2">{t('boh.par')}</th>
                <th className="py-1">{t('boh.stockoutProjection')}</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <tr key={item.sku} className={'border-b border-gray-100 ' + (item.at_risk ? 'bg-red-50' : '')}>
                  <td className="py-2 pr-2">{i18n.language === 'vi' ? item.name_vi : item.name_en}</td>
                  <td className="py-2 pr-2">
                    {item.current_stock} {item.unit}
                  </td>
                  <td className="py-2 pr-2 text-gray-500">
                    {item.par_level} {item.unit}
                  </td>
                  <td className={'py-2 ' + (item.at_risk ? 'font-medium text-red-600' : 'text-gray-500')}>
                    {item.stockout_at
                      ? t('boh.willRunOutBy', { time: formatTime(new Date(item.stockout_at), i18n.language) })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('boh.kitchenDisplay')}</h2>
        {overloaded && (
          <div className="mb-3 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700">{t('boh.overloadWarning')}</div>
        )}
        {activeQueue.length === 0 ? (
          <p className="text-sm text-gray-500">{t('boh.noQueue')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {activeQueue.map((q) => {
              const queuedAt = toDate(q.queued_at)
              const elapsedMin = queuedAt ? Math.round((Date.now() - queuedAt.getTime()) / 60000) : 0
              const overTarget = elapsedMin > (q.prep_time_target_min || 15)
              return (
                <div
                  key={q.id}
                  className={'rounded-lg border p-3 ' + (overTarget ? 'border-red-300 bg-red-50' : 'border-gray-200')}
                >
                  <p className="text-sm font-medium">{q.item_sku}</p>
                  <p className="text-xs text-gray-500">{q.station}</p>
                  <p className={'mt-1 text-sm ' + (overTarget ? 'font-medium text-red-600' : '')}>
                    {t('boh.elapsedMin', { min: elapsedMin })}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('boh.labor')}</h2>
        <p className="mb-2 text-sm">
          {t('boh.staffOnShift', { count: onShiftNow.length })} · {t('boh.recentOrders', { count: recentOrderVolume })}
        </p>
        {staffingFlag !== 'ok' && (
          <div className="mb-3 inline-block rounded-md bg-yellow-100 px-3 py-1 text-sm text-yellow-700">
            {t(`boh.staffingFlag.${staffingFlag}`)}
          </div>
        )}
        <ul className="space-y-1 text-sm">
          {staffShifts.map((s) => (
            <li key={s.staff_id} className="flex justify-between border-b border-gray-100 py-1">
              <span>
                {s.name} · {s.role} · {s.station}
              </span>
              <span className="text-gray-500">{s.tasks_completed} {t('boh.tasks')}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('boh.profitSnapshot')}</h2>
        {profitError ? (
          <p className="text-sm text-red-600">{profitError}</p>
        ) : profit === null ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">{t('dashboard.todayRevenue')}</p>
              <p className="mt-1 text-lg font-semibold">{formatVnd(profit.revenue, i18n.language)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">{t('boh.foodCost')}</p>
              <p className="mt-1 text-lg font-semibold">{formatVnd(profit.food_cost, i18n.language)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">{t('boh.laborCost')}</p>
              <p className="mt-1 text-lg font-semibold">{formatVnd(profit.labor_cost, i18n.language)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">{t('boh.profit')}</p>
              <p className="mt-1 text-lg font-semibold">{formatVnd(profit.profit, i18n.language)}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
