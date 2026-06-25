import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

// allowedRoles: if provided, redirect non-matching roles to their default page
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth()
  const { t } = useTranslation()

  if (loading) return <div className="p-6">{t('common.loading')}</div>
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/foh" replace />
  }
  return children
}
