import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import supabase from '../services/supabase'

function exportCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
}

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
  const [showAddMember, setShowAddMember] = useState(false)
  const [newMember, setNewMember] = useState({ guest_name: '', phone: '' })
  const [memberError, setMemberError] = useState(null)

  useEffect(() => {
    supabase.from('reservations').select('*').then(({ data }) => {
      setReservations(data || [])
    })

    const channel = supabase.channel('reservations-guest')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        supabase.from('reservations').select('*').then(({ data }) => setReservations(data || []))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function handleAddMember() {
    const guest_name = newMember.guest_name.trim()
    if (!guest_name) {
      setMemberError(i18n.language === 'vi' ? 'Vui lòng nhập tên khách' : 'Guest name is required')
      return
    }
    try {
      await supabase.from('reservations').insert({
        guest_name,
        phone: newMember.phone.trim() || null,
        reservation_time: new Date().toISOString(),
        status: 'confirmed',
        party_size: 1,
        table_id: null,
      })
      setNewMember({ guest_name: '', phone: '' })
      setShowAddMember(false)
      setMemberError(null)
    } catch (e) { console.error(e); setMemberError(e.message || 'Error saving') }
  }

  async function handleDeleteMember(guestName) {
    const msg = i18n.language === 'vi' ? `Xoá thành viên "${guestName}"?` : `Delete member "${guestName}"?`
    if (!window.confirm(msg)) return
    try {
      await supabase.from('reservations').delete().eq('guest_name', guestName)
    } catch (e) { console.error(e) }
  }

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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => exportCsv('guests', ['Guest Name', 'Tier', 'Visits', 'Points', 'Last Visit'],
              topGuests.map((g) => [g.guest_name, getLoyaltyTier(g.visits), g.visits, getLoyaltyPoints(g.visits), g.lastVisit ? g.lastVisit.toISOString() : ''])
            )}
            style={{ background: 'white', color: '#1A1A1A', border: '1px solid #E5E5EA', borderRadius: '99px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >↓ {i18n.language === 'vi' ? 'Xuất CSV' : 'Export CSV'}</button>
          <button
            onClick={() => { setShowAddMember(true); setMemberError(null) }}
            style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '9px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
          >
            + {i18n.language === 'vi' ? 'Thêm thành viên' : 'Add Member'}
          </button>
        </div>
      </div>

      {memberError && <p style={{ color: 'var(--pp-danger-text)', fontSize: '13px', marginBottom: '10px' }}>{memberError}</p>}

      {showAddMember && (
        <div style={{ background: 'white', border: '1px solid #E5E5EA', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: 600, fontSize: '14px', margin: '0 0 12px' }}>
            {i18n.language === 'vi' ? 'Thành viên mới' : 'New Member'}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <input
              placeholder={i18n.language === 'vi' ? 'Tên khách hàng *' : 'Guest name *'}
              value={newMember.guest_name}
              onChange={(e) => setNewMember((m) => ({ ...m, guest_name: e.target.value }))}
              style={{ flex: 1, minWidth: '180px', border: '1px solid #E5E5EA', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}
            />
            <input
              placeholder={i18n.language === 'vi' ? 'Số điện thoại (tuỳ chọn)' : 'Phone (optional)'}
              value={newMember.phone}
              onChange={(e) => setNewMember((m) => ({ ...m, phone: e.target.value }))}
              style={{ flex: 1, minWidth: '160px', border: '1px solid #E5E5EA', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleAddMember} style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '7px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              {i18n.language === 'vi' ? 'Thêm' : 'Add'}
            </button>
            <button onClick={() => { setShowAddMember(false); setMemberError(null) }} style={{ background: 'transparent', border: '1px solid #E5E5EA', borderRadius: '99px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' }}>
              {i18n.language === 'vi' ? 'Huỷ' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

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
                {[t('guest.guestName'), t('guest.loyaltyTier'), t('guest.visitFrequency'), t('guest.loyaltyPoints'), t('guest.lastVisit'), ''].map((h) => (
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
                    <td style={{ padding: '12px' }}>
                      <button
                        onClick={() => handleDeleteMember(g.guest_name)}
                        style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '16px', fontWeight: 700, lineHeight: 1 }}
                        title={i18n.language === 'vi' ? 'Xoá thành viên' : 'Delete member'}
                      >✕</button>
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
