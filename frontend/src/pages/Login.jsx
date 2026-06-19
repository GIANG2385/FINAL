import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 p-6">
        <h1 className="text-xl font-semibold">{t('auth.login')}</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('auth.email')}
          className="w-full rounded border border-gray-300 px-3 py-2"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('auth.password')}
          className="w-full rounded border border-gray-300 px-3 py-2"
          required
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-purple-600 px-3 py-2 text-white disabled:opacity-50"
        >
          {t('auth.login')}
        </button>
      </form>
    </div>
  )
}
