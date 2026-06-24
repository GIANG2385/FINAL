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
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '10px 14px', background: 'white', border: '1px solid var(--pp-border)', borderRadius: '4px 18px 18px 18px', width: 'fit-content' }}>
      {[0, 0.2, 0.4].map((delay, i) => (
        <span key={i} style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: 'var(--pp-primary)',
          animation: `scaleBounce 1.2s ${delay}s infinite`,
          display: 'inline-block',
        }} />
      ))}
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
    const q = query(collection(db, 'consultant_conversations', user.uid, 'messages'), orderBy('created_at', 'asc'))
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  if (role && !['manager', 'admin'].includes(role)) return <Navigate to="/" replace />

  async function send(text) {
    if (!text.trim() || sending) return
    setSending(true); setError(null); setInput('')
    try { await api.post('/api/consultant/messages', { message: text }) }
    catch { setError(t('consultant.error')) }
    finally { setSending(false); inputRef.current?.focus() }
  }

  async function handleRegenerate() {
    const lastUser = [...(messages || [])].reverse().find((m) => m.role === 'user')
    if (lastUser) await send(lastUser.content)
  }

  async function handleClear() {
    if (!window.confirm(t('consultant.clearConfirm'))) return
    setClearing(true)
    try { await api.delete('/api/consultant/messages') }
    catch { setError(t('common.error')) }
    finally { setClearing(false) }
  }

  function handleCopy(id, content) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id); setTimeout(() => setCopiedId(null), 1500)
    })
  }

  const lastAssistantMsg = messages?.filter((m) => m.role === 'assistant').slice(-1)[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', padding: '24px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 2px' }}>{t('consultant.title')}</h1>
          {messages !== null && messages.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--pp-text-muted)', margin: 0 }}>{t('consultant.messageCount', { count: messages.length })}</p>
          )}
        </div>
        {messages !== null && messages.length > 0 && (
          <button onClick={handleClear} disabled={clearing} style={{ border: '1px solid var(--pp-border)', background: 'white', borderRadius: '99px', padding: '6px 14px', fontSize: '12px', color: 'var(--pp-text-muted)', cursor: 'pointer', opacity: clearing ? 0.5 : 1 }}>
            {clearing ? '…' : t('consultant.clearChat')}
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '4px' }}>
        {messages === null ? (
          <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>{t('common.loading')}</p>
        ) : messages.length === 0 ? (
          <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>{t('consultant.empty')}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '10px', alignItems: 'flex-end', gap: '8px' }}>
              {m.role === 'assistant' && (
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--pp-primary-light)', border: '1px solid var(--pp-primary-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>
                  🤖
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={m.role === 'user' ? {
                  maxWidth: '420px', padding: '10px 14px',
                  background: 'var(--pp-primary)', color: 'white',
                  borderRadius: '18px 18px 4px 18px', fontSize: '14px', lineHeight: 1.5,
                } : {
                  maxWidth: '520px', padding: '10px 14px',
                  background: 'white', color: 'var(--pp-text)',
                  border: '1px solid var(--pp-border)',
                  borderRadius: '4px 18px 18px 18px', fontSize: '14px', lineHeight: 1.6,
                }}>
                  {m.content}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                  <span style={{ fontSize: '11px', color: 'var(--pp-text-hint)' }}>{formatTime(m.created_at)}</span>
                  <button onClick={() => handleCopy(m.id, m.content)} style={{ fontSize: '11px', color: 'var(--pp-text-hint)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {copiedId === m.id ? t('consultant.copied') : t('consultant.copy')}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {sending && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--pp-primary-light)', border: '1px solid var(--pp-primary-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>🤖</div>
            <TypingDots />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p style={{ color: 'var(--pp-danger-text)', fontSize: '13px', marginTop: '6px' }}>{error}</p>}

      {/* Regenerate */}
      {lastAssistantMsg && !sending && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
          <button onClick={handleRegenerate} style={{ border: '1px solid var(--pp-border)', background: 'white', borderRadius: '99px', padding: '5px 14px', fontSize: '12px', color: 'var(--pp-text-muted)', cursor: 'pointer' }}>
            ↺ {t('consultant.regenerate')}
          </button>
        </div>
      )}

      {/* Bottom bar — chips + input */}
      <div style={{ flexShrink: 0, background: 'var(--pp-page-bg)', paddingTop: '10px', borderTop: '1px solid var(--pp-border)', marginTop: '8px' }}>
        {Array.isArray(quickPrompts) && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            {quickPrompts.map((q) => (
              <button key={q} onClick={() => send(q)} disabled={sending} style={{
                padding: '6px 14px', borderRadius: '99px',
                border: '1px solid var(--pp-primary-border)',
                background: 'var(--pp-primary-light)',
                color: 'var(--pp-primary-text)',
                fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap',
                opacity: sending ? 0.5 : 1,
              }}>{q}</button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(input) }} style={{ display: 'flex', gap: '8px' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('consultant.placeholder')}
            disabled={sending}
            style={{ flex: 1, padding: '10px 16px', border: '1px solid var(--pp-border)', borderRadius: '99px', fontSize: '14px', outline: 'none', background: 'white' }}
          />
          <button type="submit" disabled={sending || !input.trim()} style={{
            padding: '10px 20px', background: 'var(--pp-primary)', color: 'white',
            border: 'none', borderRadius: '99px', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
            opacity: (sending || !input.trim()) ? 0.5 : 1,
          }}>{t('consultant.send')}</button>
        </form>
      </div>
    </div>
  )
}
