import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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

const isSameDay = (date) => {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const [orders, setOrders] = useState(null)
  const [tables, setTables] = useState(null)
  const [insights, setInsights] = useState([])
  const [ackError, setAckError] = useState(null)
  const [revenueRange, setRevenueRange] = useState('day')
  const [revenueSummary, setRevenueSummary] = useState(null)
  const [revenueError, setRevenueError] = useState(null)

  useEffect(() => {
    // Scoped to the last 24h — the orders collection also holds 10,000+
    // historical rows (loaded for analytics baselines), which an
    // unscoped live listener here would read in full on every mount.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentOrders = query(collection(db, 'orders'), where('created_at', '>=', dayAgo))
    const unsubOrders = onSnapshot(recentOrders, (snap) => {
      setOrders(snap.docs.map((d) => d.data()))
    })
    const unsubTables = onSnapshot(collection(db, 'tables'), (snap) => {
      setTables(snap.docs.map((d) => d.data()))
    })
    const unsubInsights = onSnapshot(collection(db, 'insights'), (snap) => {
      setInsights(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => {
      unsubOrders()
      unsubTables()
      unsubInsights()
    }
  }, [])

  useEffect(() => {
    setRevenueError(null)
    api
      .get(`/api/profit/summary?range=${revenueRange}`)
      .then(setRevenueSummary)
      .catch(() => setRevenueError(t('common.error')))
  }, [revenueRange, t])

  if (orders === null || tables === null) {
    return <div className="p-6">{t('common.loading')}</div>
  }

  const servedToday = orders.filter(
    (o) => o.status === 'served' && o.served_at && isSameDay(o.served_at.toDate ? o.served_at.toDate() : new Date(o.served_at))
  )
  const todayRevenue = servedToday.reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const covers = servedToday.length
  const avgTicket = covers > 0 ? todayRevenue / covers : 0

  const occupied = tables.filter((tb) => tb.status === 'dining' || tb.status === 'reserved').length
  const activeInsights = insights.filter((i) => i.status !== 'acted_on')

  const vsTypicalPct =
    revenueSummary && revenueSummary.historical_avg_revenue > 0
      ? Math.round(
          ((revenueSummary.revenue - revenueSummary.historical_avg_revenue) /
            revenueSummary.historical_avg_revenue) *
            100
        )
      : null

  async function handleAcknowledge(id) {
    try {
      await api.post(`/api/insights/${id}/acknowledge`)
    } catch (err) {
      setAckError(t('common.error'))
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">{t('nav.dashboard')}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-2 flex gap-1">
            {['day', 'week', 'month'].map((r) => (
              <button
                key={r}
                onClick={() => setRevenueRange(r)}
                className={
                  'rounded px-2 py-0.5 text-xs ' +
                  (revenueRange === r ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600')
                }
              >
                {t(`dashboard.range.${r}`)}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-500">{t('dashboard.todayRevenue')}</p>
          {revenueError ? (
            <p className="mt-1 text-sm text-red-600">{revenueError}</p>
          ) : revenueSummary ? (
            <>
              <p className="mt-1 text-xl font-semibold">{formatVnd(revenueSummary.revenue, i18n.language)}</p>
              {vsTypicalPct !== null && (
                <p className={'mt-1 text-xs ' + (vsTypicalPct >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {t('dashboard.vsTypical', { pct: vsTypicalPct >= 0 ? `+${vsTypicalPct}` : vsTypicalPct })}
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-xl font-semibold">{formatVnd(todayRevenue, i18n.language)}</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">{t('dashboard.covers')}</p>
          <p className="mt-1 text-xl font-semibold">{covers}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">{t('dashboard.avgTicket')}</p>
          <p className="mt-1 text-xl font-semibold">{formatVnd(avgTicket, i18n.language)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">{t('dashboard.tableOccupancy')}</p>
          <p className="mt-1 text-xl font-semibold">
            {t('dashboard.tablesOccupied', { occupied, total: tables.length })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {tables.map((tb) => (
          <div
            key={tb.table_id}
            className={
              'rounded-md p-3 text-center text-sm font-medium ' +
              {
                open: 'bg-gray-100 text-gray-600',
                reserved: 'bg-yellow-100 text-yellow-700',
                dining: 'bg-purple-100 text-purple-700',
                cleanup: 'bg-orange-100 text-orange-700',
              }[tb.status]
            }
          >
            <div>{tb.table_id}</div>
            <div className="text-xs">{t(`dashboard.status.${tb.status}`)}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('dashboard.alerts')}</h2>
          <Link to="/insights" className="text-sm text-purple-600">
            {t('insights.title')}
          </Link>
        </div>
        {ackError && <p className="mb-2 text-sm text-red-600">{ackError}</p>}
        {activeInsights.length === 0 ? (
          <p className="text-sm text-gray-500">{t('dashboard.noAlerts')}</p>
        ) : (
          <div className="space-y-2">
            {activeInsights.map((insight) => (
              <div key={insight.id} className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm">{i18n.language === 'vi' ? insight.summary_vi : insight.summary_en}</p>
                {insight.status === 'new' && (
                  <button
                    onClick={() => handleAcknowledge(insight.id)}
                    className="mt-2 rounded border border-gray-300 px-3 py-1 text-xs"
                  >
                    {t('insights.acknowledge')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
