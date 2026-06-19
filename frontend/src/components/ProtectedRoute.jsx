import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const { t } = useTranslation()

  if (loading) return <div className="p-6">{t('common.loading')}</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}
