import { NavLink, Routes, Route, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Settings from './pages/Settings'
import FrontOfHouse from './pages/FrontOfHouse'
import BackOfHouse from './pages/BackOfHouse'
import Insights from './pages/Insights'
import GuestEngagement from './pages/GuestEngagement'
import Consultant from './pages/Consultant'
import ProtectedRoute from './components/ProtectedRoute'
import VnpayReturn from './pages/VnpayReturn'
import { useAuth } from './context/AuthContext'

const navLinkStyle = ({ isActive }) => ({
  padding: '0 12px',
  border: 'none',
  background: 'transparent',
  fontSize: '13px',
  fontWeight: isActive ? 700 : 400,
  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
  borderBottom: isActive ? '3px solid #E8002A' : '3px solid transparent',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  height: '52px',
  boxSizing: 'border-box',
  letterSpacing: isActive ? '0.01em' : 'normal',
})

export default function App() {
  const { t, i18n } = useTranslation()
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div>
      <nav style={{
        background: 'var(--pp-navbar-bg)',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '4px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        overflowX: 'auto',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', marginRight: '16px', flexShrink: 0, lineHeight: 1 }}>
          <span style={{ color: '#E8002A', fontWeight: 900, fontSize: '15px', letterSpacing: '-0.02em' }}>Pang Pang</span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 600, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '1px' }}>SmartOps AI</span>
        </div>

        {role && ['manager', 'admin'].includes(role) && (
          <NavLink to="/" end style={navLinkStyle}>{t('nav.dashboard')}</NavLink>
        )}
        <NavLink to="/foh" style={navLinkStyle}>{t('nav.frontOfHouse')}</NavLink>
        <NavLink to="/boh" style={navLinkStyle}>{t('nav.backOfHouse')}</NavLink>
        <NavLink to="/guests" style={navLinkStyle}>{t('nav.guestEngagement')}</NavLink>
        <NavLink to="/insights" style={navLinkStyle}>{t('nav.insights')}</NavLink>
        {role && ['manager', 'admin'].includes(role) && (
          <NavLink to="/consultant" style={navLinkStyle}>{t('nav.consultant')}</NavLink>
        )}
        <NavLink to="/settings" style={navLinkStyle}>{t('nav.settings')}</NavLink>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <button
            onClick={() => i18n.changeLanguage(i18n.language === 'vi' ? 'en' : 'vi')}
            style={{
              padding: '4px 12px',
              borderRadius: '99px',
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {i18n.language === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
          </button>
          {user ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%', overflow: 'hidden',
                  border: '2px solid rgba(232,0,42,0.5)', flexShrink: 0,
                }}>
                  <img
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.email?.split('@')[0] || 'U')}&background=E8002A&color=fff&size=60`}
                    alt="avatar"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                style={{ color: 'rgba(255,255,255,0.45)', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '99px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}
              >
                {t('auth.logout')}
              </button>
            </>
          ) : (
            <NavLink to="/login" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px' }}>{t('auth.login')}</NavLink>
          )}
        </div>
      </nav>

      <main style={{ background: 'var(--pp-page-bg)', minHeight: 'calc(100vh - 52px)' }}>
        <Routes>
          <Route path="/" element={<ProtectedRoute allowedRoles={['manager', 'admin']}><Dashboard /></ProtectedRoute>} />
          <Route path="/login" element={<Login />} />
          <Route path="/foh" element={<ProtectedRoute><FrontOfHouse /></ProtectedRoute>} />
          <Route path="/boh" element={<ProtectedRoute><BackOfHouse /></ProtectedRoute>} />
          <Route path="/guests" element={<ProtectedRoute><GuestEngagement /></ProtectedRoute>} />
          <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
          <Route path="/consultant" element={<ProtectedRoute allowedRoles={['manager', 'admin']}><Consultant /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/vnpay-return" element={<VnpayReturn />} />
        </Routes>
      </main>
    </div>
  )
}
