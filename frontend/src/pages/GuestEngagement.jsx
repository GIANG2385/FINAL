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

function getLoyaltyTier(visits) {
  if (visits >= 10) return 'vang'
  if (visits >= 5) return 'bac'
  return 'dong'
}
function getLoyaltyPoints(visits) { return visits * 50 }

export default function GuestEngagement() {
  const { t, i18n } = useTranslation()
  const [reservations, setReservations] = useState(null)
  const [localReservations, setLocalReservations] = useState([])
  const [form, setForm] = useState({ name: '', partySize: 2, time: '18:00' })
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState(null)

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

  const allUpcoming = [
    ...upcoming,
    ...localReservations.filter((r) => r.status === 'confirmed'),
  ]

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

        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {t('guest.peakForecast')}
        </div>

        <div className="mb-3 flex justify-end">
          <button
            onClick={() => setFormOpen((f) => !f)}
            className="rounded bg-purple-600 px-3 py-1 text-sm text-white"
          >
            {t('guest.addReservation')}
          </button>
        </div>

        {formOpen && (
          <div className="mb-4 space-y-2 rounded-lg border border-gray-200 p-3">
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <input
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder={t('guest.guestNameLabel')}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                type="number"
                min="1"
                max="20"
                className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder={t('guest.partySizeLabel')}
                value={form.partySize}
                onChange={(e) => setForm((f) => ({ ...f, partySize: Number(e.target.value) }))}
              />
              <input
                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder={t('guest.timeLabel')}
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              />
            </div>
            <button
              onClick={() => {
                if (!form.name.trim()) { setFormError('Vui lòng nhập tên khách'); return }
                setLocalReservations((prev) => [
                  ...prev,
                  { id: Date.now(), guest_name: form.name, party_size: form.partySize, time: form.time, status: 'confirmed' },
                ])
                setForm({ name: '', partySize: 2, time: '18:00' })
                setFormOpen(false)
                setFormError(null)
              }}
              className="rounded bg-purple-600 px-3 py-1 text-sm text-white"
            >
              {t('common.save')}
            </button>
          </div>
        )}

        {allUpcoming.length === 0 ? (
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
              {allUpcoming.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-2">{r.guest_name}</td>
                  <td className="py-2 pr-2">{r.party_size}</td>
                  <td className="py-2 pr-2">
                    {r.reservation_time
                      ? formatDateTime(toDate(r.reservation_time), i18n.language)
                      : r.time}
                  </td>
                  <td className="py-2">
                    <span className={'rounded px-2 py-0.5 text-xs ' + (STATUS_COLORS[r.status] || 'bg-purple-100 text-purple-700')}>
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
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-1 pr-2">{t('guest.guestName')}</th>
                  <th className="py-1 pr-2">{t('guest.visitFrequency')}</th>
                  <th className="py-1 pr-2">{t('guest.loyaltyPoints')}</th>
                  <th className="py-1 pr-2">{t('guest.loyaltyTier')}</th>
                  <th className="py-1">{t('guest.lastVisit')}</th>
                </tr>
              </thead>
              <tbody>
                {topGuests.map((g) => {
                  const tier = getLoyaltyTier(g.visits)
                  return (
                    <tr key={g.guest_name} className="border-b border-gray-100">
                      <td className="py-2 pr-2 font-medium">{g.guest_name}</td>
                      <td className="py-2 pr-2">{t('guest.visits', { count: g.visits })}</td>
                      <td className="py-2 pr-2">{getLoyaltyPoints(g.visits)}</td>
                      <td className="py-2 pr-2">
                        <span className={
                          'rounded px-2 py-0.5 text-xs ' +
                          (tier === 'vang' ? 'bg-yellow-100 text-yellow-700' :
                           tier === 'bac' ? 'bg-gray-100 text-gray-600' :
                           'bg-orange-100 text-orange-700')
                        }>
                          {t(`guest.loyaltyTiers.${tier}`)}
                        </span>
                      </td>
                      <td className="py-2">{g.lastVisit ? formatDateTime(g.lastVisit, i18n.language) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-2 text-sm text-gray-500">{t('guest.totalMembers', { count: topGuests.length })}</p>
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {t('guest.atRiskInsight')}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
