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
  vang: { background: 'var(--pp-gold-bg)',   color: 'var(--pp-gold-text)',   border: '1px solid var(--pp-gold-border)',   icon: '★' },
  bac:  { background: 'var(--pp-silver-bg)', color: 'var(--pp-silver-text)', border: '1px solid var(--pp-silver-border)', icon: '●' },
  dong: { background: 'var(--pp-bronze-bg)', color: 'var(--pp-bronze-text)', border: '1px solid var(--pp-bronze-border)', icon: '▲' },
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
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#888', fontSize: '14px' }}>{t('common.loading')}</span></div>
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
    <div style={{ padding: '24px 28px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1A1A1A', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Guest Management</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Loyalty tracking · {topGuests.length} active members</p>
        </div>
      </div>

      {/* Loyalty table card */}
      <div style={{ background: 'white', border: '1px solid #E5E5EA', borderRadius: '12px', padding: '18px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#1A1A1A' }}>{t('guest.loyalty')}</span>
          <span style={{ fontSize: '12px', color: '#888' }}>{t('guest.totalMembers', { count: topGuests.length })}</span>
        </div>

        {topGuests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>👥</div>
            <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>{t('guest.noRepeatGuests')}</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F2F2F7' }}>
                {[t('guest.guestName'), t('guest.loyaltyTier'), t('guest.visitFrequency'), t('guest.loyaltyPoints'), t('guest.lastVisit')].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#AAA', letterSpacing: '0.08em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topGuests.map((g, idx) => {
                const tier = getLoyaltyTier(g.visits)
                const INITIALS_COLORS = ['#7C3AED','#0369A1','#059669','#D97706','#DB2777','#0891B2']
                const initials = g.guest_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                return (
                  <tr key={g.guest_name} style={{ borderBottom: '1px solid #F2F2F7' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: INITIALS_COLORS[idx % INITIALS_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                        <span style={{ fontWeight: 600, color: '#1A1A1A' }}>{g.guest_name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ ...TIER_STYLES[tier], borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '10px' }}>{TIER_STYLES[tier]?.icon}</span>
                        {t(`guest.loyaltyTiers.${tier}`)}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: '#555' }}>{t('guest.visits', { count: g.visits })}</td>
                    <td style={{ padding: '12px', color: '#555' }}>{getLoyaltyPoints(g.visits)} pts</td>
                    <td style={{ padding: '12px', color: '#AAA', fontSize: '12px' }}>
                      {g.lastVisit ? formatDateTime(g.lastVisit, i18n.language) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* At-risk notice */}
      <div style={{ background: '#FFFBEB', border: '1px solid #F5D878', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#92400E' }}>
        💡 {t('guest.atRiskInsight')}
      </div>
    </div>
  )
}
