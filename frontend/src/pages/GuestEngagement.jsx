import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

function formatDateTime(date, lang) {
  return date.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUS_COLORS = {
  confirmed: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function GuestEngagement() {
  const { t, i18n } = useTranslation()
  const [reservations, setReservations] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'reservations'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (toDate(a.reservation_time)?.getTime() ?? 0) - (toDate(b.reservation_time)?.getTime() ?? 0))
      setReservations(list)
    })
    return unsub
  }, [])

  if (reservations === null) {
    return <div className="p-6">{t('common.loading')}</div>
  }

  const upcoming = reservations.filter((r) => {
    const time = toDate(r.reservation_time)
    return r.status === 'confirmed' && time && time.getTime() >= Date.now()
  })

  const loyaltyMap = new Map()
  for (const r of reservations) {
    if (r.status === 'cancelled') continue
    const entry = loyaltyMap.get(r.guest_name) || { guest_name: r.guest_name, visits: 0, lastVisit: null }
    entry.visits += 1
    const time = toDate(r.reservation_time)
    if (time && (!entry.lastVisit || time > entry.lastVisit)) entry.lastVisit = time
    loyaltyMap.set(r.guest_name, entry)
  }
  const topGuests = Array.from(loyaltyMap.values())
    .filter((g) => g.visits >= 2)
    .sort((a, b) => b.visits - a.visits)

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-semibold">{t('nav.guestEngagement')}</h1>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('guest.reservations')}</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-500">{t('guest.noUpcoming')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-1 pr-2">{t('guest.guestName')}</th>
                <th className="py-1 pr-2">{t('guest.partySize')}</th>
                <th className="py-1 pr-2">{t('guest.time')}</th>
                <th className="py-1">{t('guest.status')}</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-2">{r.guest_name}</td>
                  <td className="py-2 pr-2">{r.party_size}</td>
                  <td className="py-2 pr-2">{formatDateTime(toDate(r.reservation_time), i18n.language)}</td>
                  <td className="py-2">
                    <span className={'rounded px-2 py-0.5 text-xs ' + STATUS_COLORS[r.status]}>
                      {t(`guest.statusLabel.${r.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('guest.loyalty')}</h2>
        {topGuests.length === 0 ? (
          <p className="text-sm text-gray-500">{t('guest.noRepeatGuests')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-1 pr-2">{t('guest.guestName')}</th>
                <th className="py-1 pr-2">{t('guest.visitFrequency')}</th>
                <th className="py-1">{t('guest.lastVisit')}</th>
              </tr>
            </thead>
            <tbody>
              {topGuests.map((g) => (
                <tr key={g.guest_name} className="border-b border-gray-100">
                  <td className="py-2 pr-2 font-medium">{g.guest_name}</td>
                  <td className="py-2 pr-2">{t('guest.visits', { count: g.visits })}</td>
                  <td className="py-2">{g.lastVisit ? formatDateTime(g.lastVisit, i18n.language) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
