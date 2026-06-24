import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../services/firebase'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'

function formatTime(value) {
  if (!value) return ''
  const d = value.toDate ? value.toDate() : new Date(value)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-gray-400"
          style={{ animation: `bounce 1.2s ${i * 0.2}s infinite` }}
        />
      ))}
      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }`}</style>
    </div>
  )
}

export default function Consultant() {
  const { t, i18n } = useTranslation()
  const { user, role } = useAuth()
  const [messages, setMessages] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const quickPrompts = t('consultant.quickPrompts', { returnObjects: true })

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'consultant_conversations', user.uid, 'messages'),
      orderBy('created_at', 'asc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [user])

  // Auto-scroll to bottom whenever messages change or AI starts/stops typing
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  if (role && !['manager', 'admin'].includes(role)) {
    return <Navigate to="/" replace />
  }

  async function send(text) {
    if (!text.trim() || sending) return
    setSending(true)
    setError(null)
    setInput('')
    try {
      await api.post('/api/consultant/messages', { message: text })
    } catch (err) {
      setError(t('consultant.error'))
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await send(input)
  }

  async function handleRegenerate() {
    if (!messages) return
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser) await send(lastUser.content)
  }

  async function handleClear() {
    if (!window.confirm(t('consultant.clearConfirm'))) return
    setClearing(true)
    setError(null)
    try {
      await api.delete('/api/consultant/messages')
    } catch {
      setError(t('common.error'))
    } finally {
      setClearing(false)
    }
  }

  function handleCopy(id, content) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  const lastAssistantMsg = messages?.filter((m) => m.role === 'assistant').slice(-1)[0]

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col p-6">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('consultant.title')}</h1>
          {messages !== null && messages.length > 0 && (
            <p className="text-xs text-gray-400">{t('consultant.messageCount', { count: messages.length })}</p>
          )}
        </div>
        {messages !== null && messages.length > 0 && (
          <button
            onClick={handleClear}
            disabled={clearing}
            className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {clearing ? '…' : t('consultant.clearChat')}
          </button>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages === null ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-500">{t('consultant.empty')}</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={'flex ' + (m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div className={'group relative max-w-2xl ' + (m.role === 'user' ? 'items-end' : 'items-start') + ' flex flex-col'}>
                <div
                  className={
                    'rounded-lg px-3 py-2 text-sm ' +
                    (m.role === 'user' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-800')
                  }
                >
                  {m.content}
                </div>

                {/* Timestamp + copy button */}
                <div className={'mt-0.5 flex items-center gap-2 ' + (m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  <span className="text-xs text-gray-400">{formatTime(m.created_at)}</span>
                  <button
                    onClick={() => handleCopy(m.id, m.content)}
                    className="hidden rounded px-1 text-xs text-gray-400 hover:text-gray-600 group-hover:block"
                  >
                    {copiedId === m.id ? t('consultant.copied') : t('consultant.copy')}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-gray-100 px-3">
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* Regenerate button — only when last message is from assistant and not currently sending */}
      {lastAssistantMsg && !sending && (
        <div className="mt-2 flex justify-center">
          <button
            onClick={handleRegenerate}
            className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50"
          >
            ↺ {t('consultant.regenerate')}
          </button>
        </div>
      )}

      {/* Quick prompt chips */}
      {Array.isArray(quickPrompts) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {quickPrompts.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={sending}
              className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs text-purple-700 hover:bg-purple-100 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          ref={inputRef}
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
