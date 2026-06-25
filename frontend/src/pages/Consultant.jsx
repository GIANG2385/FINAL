import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { auth } from '../services/firebase'
import supabase from '../services/supabase'
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

  const uidRef = useRef(null)

  const refreshMessages = (uid) => {
    supabase.from('consultant_messages')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true })
      .then(({ data }) => setMessages(data || []))
  }

  useEffect(() => {
    if (!user) return
    const uid = auth.currentUser?.uid
    if (!uid) return
    uidRef.current = uid

    refreshMessages(uid)

    const channel = supabase.channel(`consultant-${uid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'consultant_messages',
      }, (payload) => {
        if (payload.new?.user_id !== uid) return
        setMessages((prev) => {
          if (!prev) return [payload.new]
          // Already have this real ID — skip
          if (prev.find((m) => m.id === payload.new.id)) return prev
          // Replace matching optimistic message (same role + content) instead of appending
          const optIdx = prev.findIndex(
            (m) => m.id?.startsWith('opt-') && m.role === payload.new.role && m.content === payload.new.content
          )
          if (optIdx !== -1) {
            const next = [...prev]
            next[optIdx] = payload.new
            return next
          }
          return [...prev, payload.new]
        })
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  if (role && !['manager', 'admin'].includes(role)) return <Navigate to="/" replace />

  async function send(text) {
    if (!text.trim() || sending) return
    setSending(true); setError(null); setInput('')

    // Optimistically add user message so it appears immediately
    const optimisticId = `opt-${Date.now()}`
    setMessages((prev) => [...(prev || []), {
      id: optimisticId, role: 'user', content: text,
      created_at: new Date().toISOString(), user_id: uidRef.current,
    }])

    try {
      await api.post('/api/consultant/messages', { message: text })
      // Refresh after API responds — real-time may already have delivered both messages,
      // but this guarantees the assistant reply appears even if real-time is slow
      setTimeout(() => {
        if (uidRef.current) refreshMessages(uidRef.current)
      }, 300)
    } catch {
      setError(t('consultant.error'))
      // Remove optimistic message on failure
      setMessages((prev) => prev?.filter((m) => m.id !== optimisticId) ?? [])
    } finally {
      setSending(false); inputRef.current?.focus()
    }
  }

  async function handleRegenerate() {
    const lastUser = [...(messages || [])].reverse().find((m) => m.role === 'user')
    if (lastUser) await send(lastUser.content)
  }

  async function handleClear() {
    if (!window.confirm(t('consultant.clearConfirm'))) return
    setClearing(true)
    try {
      await api.delete('/api/consultant/messages')
      setMessages([])
    }
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '24px 28px', minHeight: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1A1A1A', margin: '0 0 4px', letterSpacing: '-0.02em' }}>{t('consultant.title')}</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>
            {messages !== null && messages.length > 0 ? t('consultant.messageCount', { count: messages.length }) : 'Ask anything about today\'s operations'}
          </p>
        </div>
        {messages !== null && messages.length > 0 && (
          <button onClick={handleClear} disabled={clearing} style={{ border: '1px solid #E5E5EA', background: 'white', borderRadius: '99px', padding: '6px 14px', fontSize: '12px', color: '#888', cursor: 'pointer', opacity: clearing ? 0.5 : 1 }}>
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
      <div style={{ flexShrink: 0, background: '#F2F2F7', paddingTop: '10px', borderTop: '1px solid #E5E5EA', marginTop: '8px' }}>
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
