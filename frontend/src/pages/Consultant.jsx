import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../services/firebase'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function Consultant() {
  const { t } = useTranslation()
  const { user, role } = useAuth()
  const [messages, setMessages] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'consultant_conversations', user.uid, 'messages'), orderBy('created_at', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [user])

  if (role && !['manager', 'admin'].includes(role)) {
    return <Navigate to="/" replace />
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    setError(null)
    const text = input
    setInput('')
    try {
      await api.post('/api/consultant/messages', { message: text })
    } catch (err) {
      setError(t('consultant.error'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col p-6">
      <h1 className="mb-4 text-2xl font-semibold">{t('consultant.title')}</h1>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages === null ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-500">{t('consultant.empty')}</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                'max-w-2xl rounded-lg p-3 text-sm ' +
                (m.role === 'user' ? 'ml-auto bg-purple-600 text-white' : 'bg-gray-100 text-gray-800')
              }
            >
              {m.content}
            </div>
          ))
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleSend} className="mt-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('consultant.placeholder')}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded bg-purple-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {t('consultant.send')}
        </button>
      </form>
    </div>
  )
}
