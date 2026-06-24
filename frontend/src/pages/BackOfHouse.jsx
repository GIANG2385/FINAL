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
  const [suppliers] = useState([
    { id: 1, name: 'Chị Lan — Chợ Hôm', items: 'Thịt bò, Xương heo', lastDelivery: '2026-06-24', reliability: 95 },
    { id: 2, name: 'Anh Tuấn — Chợ Đồng Xuân', items: 'Rau, Hành lá, Gia vị', lastDelivery: '2026-06-23', reliability: 82 },
    { id: 3, name: 'Cty Minh Tâm', items: 'Bánh phở, Bún', lastDelivery: '2026-06-22', reliability: 68 },
  ])
  const [channels] = useState([
    { name_vi: 'Tại bàn', name_en: 'Dine-in', orders: 48, revenue: 6240000 },
    { name_vi: 'Mang về', name_en: 'Takeaway', orders: 15, revenue: 1350000 },
    { name_vi: 'GrabFood', name_en: 'GrabFood', orders: 22, revenue: 2090000 },
    { name_vi: 'ShopeeFood', name_en: 'ShopeeFood', orders: 9, revenue: 855000 },
  ])

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
  const pendingQueue = kitchenQueue.filter((q) => q.status === 'pending')
  const inKitchenQueue = kitchenQueue.filter((q) => q.status === 'in_progress' || q.status === 'in_kitchen')
  const completedQueue = kitchenQueue.filter((q) => q.status === 'ready')

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
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: t('boh.kanban.pending'), items: pendingQueue, border: 'border-gray-300' },
            { label: t('boh.kanban.inKitchen'), items: inKitchenQueue, border: 'border-purple-300' },
            { label: t('boh.kanban.completed'), items: completedQueue, border: 'border-green-300' },
          ].map((col) => (
            <div key={col.label} className={'rounded-lg border-2 p-3 ' + col.border}>
              <p className="mb-2 text-sm font-semibold">{col.label} ({col.items.length})</p>
              <div className="space-y-2">
                {col.items.map((q) => {
                  const queuedAt = toDate(q.queued_at)
                  const elapsedMin = queuedAt ? Math.round((Date.now() - queuedAt.getTime()) / 60000) : 0
                  const delay = elapsedMin > 20 ? 'red' : elapsedMin > 10 ? 'amber' : 'green'
                  return (
                    <div
                      key={q.id}
                      className={
                        'rounded border p-2 text-xs ' +
                        (delay === 'red' ? 'border-red-300 bg-red-50' :
                         delay === 'amber' ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200')
                      }
                    >
                      <p className="font-medium">{q.item_sku}</p>
                      <p className="text-gray-500">{q.station}</p>
                      <p className={delay === 'red' ? 'font-medium text-red-600' : 'text-gray-500'}>
                        {t('boh.elapsedMin', { min: elapsedMin })}
                      </p>
                    </div>
                  )
                })}
                {col.items.length === 0 && <p className="text-xs text-gray-400">—</p>}
              </div>
            </div>
          ))}
        </div>
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
          {staffShifts.map((s) => {
            const isOnShift = onShiftNow.some((o) => o.staff_id === s.staff_id)
            return (
              <li key={s.staff_id} className="flex justify-between border-b border-gray-100 py-1">
                <span>
                  {s.name} · {s.role}
                  {s.shift_start && s.shift_end && (
                    <span className="ml-2 text-gray-400">
                      {formatTime(toDate(s.shift_start), i18n.language)}–{formatTime(toDate(s.shift_end), i18n.language)}
                    </span>
                  )}
                </span>
                <span className={
                  'rounded px-2 py-0.5 text-xs ' +
                  (isOnShift ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')
                }>
                  {isOnShift ? t('boh.shiftStatus.on') : t('boh.shiftStatus.off')}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
          {t('boh.laborAiForecast')}
        </div>
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

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('boh.channels')}</h2>
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t('boh.channelAiInsight')}
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-1 pr-2">{t('boh.channelName')}</th>
              <th className="py-1 pr-2">{t('boh.channelOrders')}</th>
              <th className="py-1">{t('boh.channelRevenue')}</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.name_en} className="border-b border-gray-100">
                <td className="py-2 pr-2">{i18n.language === 'vi' ? c.name_vi : c.name_en}</td>
                <td className="py-2 pr-2">{c.orders}</td>
                <td className="py-2">{formatVnd(c.revenue, i18n.language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('boh.supply')}</h2>
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {t('boh.supplyAiForecast')}
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-1 pr-2">{t('boh.supplier')}</th>
              <th className="py-1 pr-2">{t('boh.items')}</th>
              <th className="py-1 pr-2">{t('boh.lastDelivery')}</th>
              <th className="py-1">{t('boh.reliability')}</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-gray-100">
                <td className="py-2 pr-2 font-medium">{s.name}</td>
                <td className="py-2 pr-2 text-gray-500">{s.items}</td>
                <td className="py-2 pr-2 text-gray-500">{s.lastDelivery}</td>
                <td className="py-2">
                  <span className={
                    'rounded px-2 py-0.5 text-xs font-medium ' +
                    (s.reliability >= 90 ? 'bg-green-100 text-green-700' :
                     s.reliability >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700')
                  }>
                    {s.reliability}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
