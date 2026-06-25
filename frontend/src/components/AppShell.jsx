import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { label: 'Executive View',   icon: '▦', to: '/',           adminOnly: true  },
  { label: 'Front of House',   icon: '⊞', to: '/foh',        adminOnly: false },
  { label: 'Back of House',    icon: '◫', to: '/boh',        adminOnly: false },
  { label: 'Guest Management', icon: '◎', to: '/guests',     adminOnly: false },
  { label: 'AI Insights',      icon: '✦', to: '/insights',   adminOnly: false },
  { label: 'AI Consultant',    icon: '🤖', to: '/consultant', adminOnly: true  },
]

export default function AppShell({ children }) {
  const { t, i18n } = useTranslation()
  const { user, role, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const isManager = role && ['manager', 'admin'].includes(role)
  const userName = user?.email?.split('@')[0] || 'User'
  const avatarSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=E8002A&color=fff&size=80`

  const visibleNav = NAV_ITEMS.filter((item) => !item.adminOnly || isManager)

  // Active detection: exact match for '/', prefix match for others
  const isActive = (to) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside style={{ width: '190px', flexShrink: 0, background: '#1A1A1A', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
        {/* Logo */}
        <div style={{ padding: '22px 16px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#E8002A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>🍜</div>
            <div>
              <div style={{ color: '#E8002A', fontWeight: 900, fontSize: '13px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>SmartOps</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '9px', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '1px' }}>Proactive Partner</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {visibleNav.map((item) => {
            const active = isActive(item.to) && (item.label === 'Executive View' ? location.pathname === '/' : true)
            // For duplicate routes (Kitchen Ops / Table Management both → /foh), only first match active
            const firstMatch = visibleNav.find((n) => isActive(n.to))
            const reallyActive = item === firstMatch || (item.to === '/' && location.pathname === '/')
            return (
              <Link
                key={item.label}
                to={item.to}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '8px', marginBottom: '2px',
                  textDecoration: 'none', fontSize: '13px',
                  fontWeight: reallyActive ? 600 : 400,
                  background: reallyActive ? '#E8002A' : 'transparent',
                  color: reallyActive ? 'white' : 'rgba(255,255,255,0.55)',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <span style={{ fontSize: '14px', width: '18px', textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '12px 8px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <Link to="/settings" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', color: 'rgba(255,255,255,0.45)', fontSize: '12px', textDecoration: 'none', borderRadius: '6px' }}>
            ⚙ Settings
          </Link>
          <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', color: 'rgba(255,255,255,0.45)', fontSize: '12px', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '6px', textAlign: 'left' }}>
            ⬡ Log Out
          </button>
        </div>
      </aside>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F2F2F7', overflowY: 'auto', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ background: 'white', borderBottom: '1px solid #E5E5EA', padding: '0 28px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#1A1A1A' }}>Pang Pang SmartOps</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={() => i18n.changeLanguage(i18n.language === 'vi' ? 'en' : 'vi')}
              style={{ background: '#F2F2F7', border: '1px solid #E5E5EA', borderRadius: '99px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#555' }}
            >
              {i18n.language === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
            </button>
            <button style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666', lineHeight: 1 }}>🔔</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: '12px', color: '#1A1A1A', lineHeight: 1.2 }}>{userName}</div>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{role}</div>
              </div>
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #E8002A' }}>
                <img src={avatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {children ?? <Outlet />}
        </div>
      </div>
    </div>
  )
}
