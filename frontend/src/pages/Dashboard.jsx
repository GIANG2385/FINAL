import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collection, onSnapshot } from 'firebase/firestore'
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

  useEffect(() => {
    const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
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
          <p className="text-sm text-gray-500">{t('dashboard.todayRevenue')}</p>
          <p className="mt-1 text-xl font-semibold">{formatVnd(todayRevenue, i18n.language)}</p>
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
