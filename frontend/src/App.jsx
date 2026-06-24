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
import { useAuth } from './context/AuthContext'

const navLinkStyle = ({ isActive }) => ({
  padding: '6px 12px',
  border: 'none',
  background: 'transparent',
  fontSize: '14px',
  fontWeight: isActive ? 700 : 400,
  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
  borderBottom: isActive ? '2px solid #E8002A' : '2px solid transparent',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
  textDecoration: 'none',
  display: 'inline-block',
  lineHeight: '52px',
  height: '52px',
  boxSizing: 'border-box',
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
        <span style={{ color: 'white', fontWeight: 700, fontSize: '15px', marginRight: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {t('app.name')}
        </span>

        <NavLink to="/" end style={navLinkStyle}>{t('nav.dashboard')}</NavLink>
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
              {role && <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px' }}>{role}</span>}
              <button
                onClick={handleLogout}
                style={{ color: 'rgba(255,255,255,0.55)', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }}
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
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/login" element={<Login />} />
          <Route path="/foh" element={<ProtectedRoute><FrontOfHouse /></ProtectedRoute>} />
          <Route path="/boh" element={<ProtectedRoute><BackOfHouse /></ProtectedRoute>} />
          <Route path="/guests" element={<ProtectedRoute><GuestEngagement /></ProtectedRoute>} />
          <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
          <Route path="/consultant" element={<ProtectedRoute><Consultant /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  )
}
