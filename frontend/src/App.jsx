import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Settings from './pages/Settings'
import FrontOfHouse from './pages/FrontOfHouse'
import BackOfHouse from './pages/BackOfHouse'
import Insights from './pages/Insights'
import GuestEngagement from './pages/GuestEngagement'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'

export default function App() {
  const { t } = useTranslation()
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div>
      <nav className="flex items-center gap-4 overflow-x-auto whitespace-nowrap border-b border-gray-200 px-6 py-3">
        <span className="shrink-0 font-semibold">{t('app.name')}</span>
        <Link className="shrink-0" to="/">{t('nav.dashboard')}</Link>
        <Link className="shrink-0" to="/foh">{t('nav.frontOfHouse')}</Link>
        <Link className="shrink-0" to="/boh">{t('nav.backOfHouse')}</Link>
        <Link className="shrink-0" to="/guests">{t('nav.guestEngagement')}</Link>
        <Link className="shrink-0" to="/insights">{t('nav.insights')}</Link>
        <Link className="shrink-0" to="/settings">{t('nav.settings')}</Link>
        <div className="ml-auto flex shrink-0 items-center gap-4">
          {user ? (
            <>
              {role && <span className="text-sm text-gray-500">{role}</span>}
              <button onClick={handleLogout} className="text-sm">
                {t('auth.logout')}
              </button>
            </>
          ) : (
            <Link to="/login">{t('auth.login')}</Link>
          )}
        </div>
      </nav>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route
          path="/foh"
          element={
            <ProtectedRoute>
              <FrontOfHouse />
            </ProtectedRoute>
          }
        />
        <Route
          path="/boh"
          element={
            <ProtectedRoute>
              <BackOfHouse />
            </ProtectedRoute>
          }
        />
        <Route
          path="/guests"
          element={
            <ProtectedRoute>
              <GuestEngagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/insights"
          element={
            <ProtectedRoute>
              <Insights />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  )
}
