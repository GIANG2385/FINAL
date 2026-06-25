import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import supabase from '../services/supabase'

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

function formatDateTime(date, lang) {
  return date.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function getLoyaltyTier(visits) {
  if (visits >= 10) return 'vang'
  if (visits >= 5) return 'bac'
  return 'dong'
}
function getLoyaltyPoints(visits) { return visits * 50 }

const TIER_STYLES = {
  vang: { background: 'var(--pp-gold-bg)',   color: 'var(--pp-gold-text)',   border: '1px solid var(--pp-gold-border)' },
  bac:  { background: 'var(--pp-silver-bg)', color: 'var(--pp-silver-text)', border: '1px solid var(--pp-silver-border)' },
  dong: { background: 'var(--pp-bronze-bg)', color: 'var(--pp-bronze-text)', border: '1px solid var(--pp-bronze-border)' },
}

export default function GuestEngagement() {
  const { t, i18n } = useTranslation()
  const [reservations, setReservations] = useState(null)

  useEffect(() => {
    // Initial fetch
    supabase.from('reservations').select('*').then(({ data }) => {
      setReservations(data || [])
    })

    // Real-time subscription
    const channel = supabase.channel('reservations-guest')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        supabase.from('reservations').select('*').then(({ data }) => setReservations(data || []))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  if (reservations === null) {
    return <div style={{ padding: '28px 32px', color: 'var(--pp-text-muted)' }}>{t('common.loading')}</div>
  }

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
    .sort((a, b) => b.visits - a.visits)

  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--pp-text)', marginBottom: '24px' }}>
        {t('nav.guestEngagement')}
      </h1>

      <section>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '14px' }}>{t('guest.loyalty')}</h2>

        {topGuests.length === 0 ? (
          <p style={{ fontSize: '14px', color: 'var(--pp-text-muted)' }}>{t('guest.noRepeatGuests')}</p>
        ) : (
          <>
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: 'var(--pp-yellow)', borderBottom: '1px solid var(--pp-border)' }}>
                    {[t('guest.guestName'), t('guest.visitFrequency'), t('guest.loyaltyPoints'), t('guest.loyaltyTier'), t('guest.lastVisit')].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topGuests.map((g) => {
                    const tier = getLoyaltyTier(g.visits)
                    return (
                      <tr key={g.guest_name} style={{ borderBottom: '1px solid var(--pp-border)' }}>
                        <td style={{ padding: '12px', fontWeight: 500 }}>{g.guest_name}</td>
                        <td style={{ padding: '12px' }}>{t('guest.visits', { count: g.visits })}</td>
                        <td style={{ padding: '12px' }}>{getLoyaltyPoints(g.visits)}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ ...TIER_STYLES[tier], borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: 500 }}>
                            {t(`guest.loyaltyTiers.${tier}`)}
                          </span>
                        </td>
                        <td style={{ padding: '12px', color: 'var(--pp-text-muted)', fontSize: '13px' }}>
                          {g.lastVisit ? formatDateTime(g.lastVisit, i18n.language) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', marginBottom: '12px' }}>
              {t('guest.totalMembers', { count: topGuests.length })}
            </p>
            <div style={{ background: 'var(--pp-warning-bg)', border: '1px solid var(--pp-warning-border)', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', color: 'var(--pp-warning-text)' }}>
              {t('guest.atRiskInsight')}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
