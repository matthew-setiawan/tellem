import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import {
  Send, Trash2, Phone, Mail, MapPin, Linkedin,
  Bot, User, Sparkles, Loader, CheckCircle, XCircle, ArrowRight,
  MessageSquarePlus, Edit3, FileText, ChevronDown, ChevronUp, Save, ArrowLeft,
} from 'lucide-react'

function ContactCard({ contact }) {
  const initials = (contact.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="outreach-card" style={{ cursor: 'default', minWidth: 280, maxWidth: 320, flexShrink: 0 }}>
      <div className="outreach-card-top">
        <div className="outreach-avatar">{initials}</div>
        <div className="outreach-card-info">
          <span className="outreach-card-name">{contact.name}</span>
          {contact.title && <span className="outreach-card-subtitle">{contact.title}</span>}
          {contact.company && <span className="outreach-card-subtitle">{contact.company}</span>}
        </div>
      </div>
      {contact.summary && <p className="outreach-card-summary">{contact.summary}</p>}
      <div className="outreach-card-chips">
        {contact.location && <span className="outreach-chip"><MapPin size={11} /> {contact.location}</span>}
        {contact.email && <span className="outreach-chip highlight"><Mail size={11} /> {contact.email}</span>}
        {(contact.phone || contact.whatsapp) && (
          <span className="outreach-chip highlight"><Phone size={11} /> {contact.whatsapp || contact.phone}</span>
        )}
        {contact.linkedin_url && (
          <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="outreach-chip link"
            onClick={e => e.stopPropagation()}>
            <Linkedin size={11} /> LinkedIn
          </a>
        )}
      </div>
      <div className="outreach-card-footer">
        <span className="outreach-source">{contact.source || 'search'}</span>
      </div>
    </div>
  )
}

function ProgressBar({ progress }) {
  if (!progress) return null
  const pct = progress.total > 0 ? Math.round((progress.processed + progress.failed) / progress.total * 100) : 0
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: 'var(--ink-soft)' }}>
        <span>Sending messages...</span>
        <span>{progress.processed + progress.failed}/{progress.total}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, background: 'var(--teal)', width: `${pct}%`, transition: 'width 0.3s' }} />
      </div>
      {progress.failed > 0 && (
        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{progress.failed} failed</div>
      )}
    </div>
  )
}

const OPTION_LETTERS = 'ABCDEFGHIJ'
const CUSTOM_KEYWORDS = ['something else', 'other', 'let me type', 'custom', 'type my own']

function isCustomOption(label) {
  const lower = label.toLowerCase()
  return CUSTOM_KEYWORDS.some(kw => lower.includes(kw))
}

function InlineInput({ disabled, onSubmit }) {
  const [value, setValue] = useState('')
  const ref = useRef(null)

  function handleSubmit(e) {
    e.preventDefault()
    const text = value.trim()
    if (!text || disabled) return
    onSubmit(text)
    setValue('')
  }

  return (
    <form onSubmit={handleSubmit} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 14px',
      background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 10,
      transition: 'border-color 0.15s',
    }}
      onFocus={() => ref.current?.parentElement && (ref.current.parentElement.style.borderColor = 'var(--teal)')}
      onBlur={() => ref.current?.parentElement && (ref.current.parentElement.style.borderColor = 'var(--border)')}
    >
      <span style={{
        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
        background: 'var(--bg)', color: 'var(--ink-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700,
      }}>
        ✎
      </span>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Type your own answer..."
        disabled={disabled}
        style={{
          flex: 1, border: 'none', background: 'none', outline: 'none',
          fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', padding: '6px 0',
        }}
      />
      <button
        type="submit"
        disabled={!value.trim() || disabled}
        style={{
          width: 30, height: 30, borderRadius: 8, border: 'none',
          background: value.trim() ? 'var(--teal)' : 'var(--border)',
          color: 'white', cursor: value.trim() ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s', flexShrink: 0,
        }}
      >
        <Send size={13} />
      </button>
    </form>
  )
}

function OptionCards({ options, onPick, disabled }) {
  if (!options?.length) return null

  const clickable = options.filter(opt => {
    const label = typeof opt === 'string' ? opt : opt.label || opt.text || ''
    return !isCustomOption(label)
  })
  const hasCustom = clickable.length < options.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, maxWidth: '80%' }}>
      {clickable.map((opt, i) => {
        const letter = OPTION_LETTERS[i] || String(i + 1)
        const label = typeof opt === 'string' ? opt : opt.label || opt.text || ''
        return (
          <button
            key={i}
            disabled={disabled}
            onClick={() => onPick(label)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 10,
              cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, color: 'var(--ink)',
              textAlign: 'left', transition: 'all 0.15s', opacity: disabled ? 0.5 : 1,
              fontFamily: 'inherit', lineHeight: 1.5,
            }}
            onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.background = 'var(--teal-soft)' }}}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card)' }}
          >
            <span style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
              background: 'var(--teal-soft)', color: 'var(--teal)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
            }}>
              {letter}
            </span>
            <span>{label}</span>
          </button>
        )
      })}
      {hasCustom && <InlineInput disabled={disabled} onSubmit={onPick} />}
    </div>
  )
}

function DraftEditor({ draft, onSend, executing }) {
  const [text, setText] = useState(draft || '')
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => { setText(draft || '') }, [draft])

  return (
    <div style={{
      marginTop: 10, borderRadius: 12, border: '1.5px solid var(--border)',
      background: 'var(--card)', overflow: 'hidden', maxWidth: '90%',
    }}>
      <div style={{
        padding: '8px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-muted)' }}>
          Message Draft
        </span>
        <button
          onClick={() => setIsEditing(!isEditing)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
            color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <Edit3 size={11} /> {isEditing ? 'Preview' : 'Edit'}
        </button>
      </div>
      <div style={{ padding: 14 }}>
        {isEditing ? (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            style={{
              width: '100%', minHeight: 140, border: '1px solid var(--border)', borderRadius: 8,
              padding: 10, fontSize: 13, fontFamily: 'inherit', lineHeight: 1.6,
              resize: 'vertical', background: 'white', color: 'var(--ink)', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--teal)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        ) : (
          <div style={{
            fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--ink)',
            padding: '10px 12px', background: 'var(--bg)', borderRadius: 8,
            border: '1px solid var(--border)',
          }}>
            {text}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 6 }}>
          Use <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>{'{name}'}</code>,{' '}
          <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>{'{company}'}</code>,{' '}
          <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>{'{title}'}</code>{' '}
          as placeholders.
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn-primary"
          style={{ padding: '8px 20px', fontSize: 13, borderRadius: 8 }}
          onClick={() => onSend(text)}
          disabled={executing || !text.trim()}
        >
          {executing ? <><Loader size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> Sending...</> : <><Send size={14} /> Send Messages</>}
        </button>
      </div>
    </div>
  )
}

function CampaignContextPanel({ threadId, initialContext, token, onSaved }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(initialContext || '')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setValue(initialContext || '')
    setDirty(false)
  }, [initialContext, threadId])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      await api.updateAgentThreadContext(token, threadId, value)
      setDirty(false)
      onSaved?.(value)
    } catch (err) {
      alert('Failed to save context: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const hasContext = (initialContext || '').trim().length > 0

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: hasContext ? 'var(--teal)' : 'var(--ink-muted)',
          fontFamily: 'inherit', fontWeight: 600,
        }}
      >
        <FileText size={13} />
        <span>Campaign Context</span>
        {hasContext && (
          <span style={{
            fontSize: 10, background: 'var(--teal-soft)', color: 'var(--teal)',
            padding: '1px 6px', borderRadius: 100, fontWeight: 700,
          }}>
            SET
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 20px 12px' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 8, lineHeight: 1.5 }}>
            Add context about your business, product, or campaign. The AI will use this when crafting messages and responding to replies. This context is isolated to this thread only.
          </div>
          <textarea
            value={value}
            onChange={e => { setValue(e.target.value); setDirty(true) }}
            placeholder="E.g. We're a SaaS startup offering AI-powered analytics for e-commerce. Our pricing starts at $49/mo. We're targeting Series A+ companies..."
            style={{
              width: '100%', minHeight: 90, border: '1.5px solid var(--border)', borderRadius: 8,
              padding: 10, fontSize: 12, fontFamily: 'inherit', lineHeight: 1.6,
              resize: 'vertical', background: 'white', color: 'var(--ink)', outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--teal)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          {dirty && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                  fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none',
                  background: 'var(--teal)', color: 'white', cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1, transition: 'opacity 0.15s', fontFamily: 'inherit',
                }}
              >
                {saving ? <Loader size={12} style={{ animation: 'spin 0.6s linear infinite' }} /> : <Save size={12} />}
                {saving ? 'Saving...' : 'Save Context'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg, onExecute, executing, onPickOption, isSending, onSendDraft }) {
  const isUser = msg.role === 'user'
  const isStatus = msg.role === 'status'

  if (msg.type === 'contacts' && msg.metadata?.contacts?.length > 0) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4, overflow: 'hidden' }}>
        <div style={avatarStyle('assistant')}><Bot size={13} /></div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={bubbleStyle(false)}>
            {msg.content}
            {msg.metadata.testing_mode && (
              <span style={{ display: 'inline-block', marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#ca8a04', background: '#fef9c3', padding: '1px 6px', borderRadius: 100 }}>
                TEST MODE
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, marginTop: 8, WebkitOverflowScrolling: 'touch' }}>
            {msg.metadata.contacts.map((c, i) => <ContactCard key={i} contact={c} />)}
          </div>
        </div>
      </div>
    )
  }

  if (msg.type === 'draft' && msg.metadata?.draft) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={avatarStyle('assistant')}><Bot size={13} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={bubbleStyle(false)}>{msg.content}</div>
          <DraftEditor draft={msg.metadata.draft} onSend={onSendDraft} executing={executing} />
        </div>
      </div>
    )
  }

  if (msg.type === 'confirmation') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={avatarStyle('assistant')}><Bot size={13} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={bubbleStyle(false)}>{msg.content}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              className="btn-primary"
              style={{ padding: '8px 20px', fontSize: 13, borderRadius: 8 }}
              onClick={onExecute}
              disabled={executing}
            >
              {executing ? <><Loader size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> Sending...</> : <><Send size={14} /> Send Messages</>}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (msg.type === 'progress' && isStatus) {
    const meta = msg.metadata || {}
    const success = meta.processed > 0
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={avatarStyle('assistant')}>
          {success ? <CheckCircle size={13} /> : <XCircle size={13} />}
        </div>
        <div style={{
          ...bubbleStyle(false),
          background: success ? '#f0fdf4' : '#fef2f2',
          borderColor: success ? '#bbf7d0' : '#fecaca',
        }}>
          {msg.content}
        </div>
      </div>
    )
  }

  if (msg.type === 'options' && msg.metadata?.options?.length > 0) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={avatarStyle('assistant')}><Bot size={13} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={bubbleStyle(false)}>{msg.content}</div>
          <OptionCards options={msg.metadata.options} onPick={onPickOption} disabled={isSending} />
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', gap: 8,
      alignItems: 'flex-start',
      flexDirection: isUser ? 'row-reverse' : 'row',
      marginBottom: 4,
    }}>
      <div style={avatarStyle(isUser ? 'user' : 'assistant')}>
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div style={bubbleStyle(isUser)}>{msg.content}</div>
    </div>
  )
}

function avatarStyle(role) {
  return {
    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
    background: role === 'user' ? 'var(--ink)' : 'var(--teal-soft)',
    color: role === 'user' ? 'white' : 'var(--teal)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}

function bubbleStyle(isUser) {
  return {
    maxWidth: '80%', padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    ...(isUser
      ? { background: 'var(--ink)', color: 'white', borderBottomRightRadius: 4 }
      : { background: 'var(--card)', border: '1px solid var(--border)', borderBottomLeftRadius: 4 }),
  }
}

export default function OutboundPage() {
  const { token } = useAuth()

  const [threads, setThreads] = useState([])
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [activeThread, setActiveThread] = useState(null)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [execProgress, setExecProgress] = useState(null)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const loadThreads = useCallback(async () => {
    if (!token) return
    try {
      const data = await api.getAgentThreads(token)
      setThreads(data)
    } catch {}
    finally { setLoadingThreads(false) }
  }, [token])

  useEffect(() => { loadThreads() }, [loadThreads])

  const loadThread = useCallback(async (id) => {
    if (!token || !id) { setActiveThread(null); return }
    setLoadingThread(true)
    try {
      const data = await api.getAgentThread(token, id)
      setActiveThread(data)
    } catch { setActiveThread(null) }
    finally { setLoadingThread(false) }
  }, [token])

  useEffect(() => {
    if (activeThreadId) loadThread(activeThreadId)
    else setActiveThread(null)
  }, [activeThreadId, loadThread])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeThread?.messages])

  useEffect(() => {
    if (!sending && activeThreadId) inputRef.current?.focus()
  }, [sending, activeThreadId])

  async function handleNewThread() {
    try {
      const thread = await api.createAgentThread(token)
      setThreads(prev => [thread, ...prev])
      setActiveThreadId(thread._id)
    } catch (err) { alert(err.message) }
  }

  async function handleDeleteThread(id, e) {
    e.stopPropagation()
    if (!confirm('Delete this thread?')) return
    try {
      await api.deleteAgentThread(token, id)
      setThreads(prev => prev.filter(t => t._id !== id))
      if (activeThreadId === id) { setActiveThreadId(null); setActiveThread(null) }
    } catch (err) { alert(err.message) }
  }

  async function sendText(text) {
    if (!text || sending || !activeThreadId) return
    setSending(true)

    const optimisticMsg = { role: 'user', content: text, type: 'text', created_at: new Date().toISOString() }
    setActiveThread(prev => prev ? { ...prev, messages: [...(prev.messages || []), optimisticMsg] } : prev)

    try {
      const response = await api.sendAgentMessage(token, activeThreadId, text)
      const newMsgs = response.messages || []

      setActiveThread(prev => {
        if (!prev) return prev
        return { ...prev, messages: [...(prev.messages || []), ...newMsgs] }
      })

      loadThreads()
    } catch (err) {
      setActiveThread(prev => {
        if (!prev) return prev
        return {
          ...prev,
          messages: [...(prev.messages || []), { role: 'assistant', content: `Error: ${err.message}`, type: 'text', created_at: new Date().toISOString() }],
        }
      })
    } finally {
      setSending(false)
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput('')
    await sendText(text)
  }

  function handlePickOption(label) {
    if (sending) return
    sendText(label)
  }

  async function handleExecute(messageTemplate) {
    if (!activeThreadId || executing) return
    setExecuting(true)
    setExecProgress({ processed: 0, failed: 0, total: 0 })

    try {
      await api.executeAgentThread(token, activeThreadId, (event) => {
        if (event.type === 'start') {
          setExecProgress({ processed: 0, failed: 0, total: event.total })
        } else if (event.type === 'progress') {
          setExecProgress({ processed: event.processed, failed: event.failed, total: event.total })
        } else if (event.type === 'done') {
          setExecProgress(null)
          loadThread(activeThreadId)
        }
      }, messageTemplate)
    } catch (err) {
      alert(err.message)
    } finally {
      setExecuting(false)
      setExecProgress(null)
    }
  }

  function handleSendDraft(editedMessage) {
    handleExecute(editedMessage)
  }

  const messages = activeThread?.messages || []
  const [mobileShowChat, setMobileShowChat] = useState(false)

  function selectThread(id) {
    setActiveThreadId(id)
    setInput('')
    setExecProgress(null)
    setMobileShowChat(true)
  }

  return (
    <div className="outbound-layout" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ── Left sidebar: Threads ── */}
      <div className={`outbound-sidebar ${mobileShowChat ? 'mobile-hidden' : ''}`} style={{
        width: 280, borderRight: '1px solid var(--border)', background: 'var(--card)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <button
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontSize: 13, borderRadius: 10 }}
            onClick={handleNewThread}
          >
            <MessageSquarePlus size={16} /> New Outreach
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingThreads ? (
            <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" /></div>
          ) : threads.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--ink-muted)' }}>
              No threads yet. Click above to start.
            </div>
          ) : (
            threads.map(t => (
              <div
                key={t._id}
                onClick={() => selectThread(t._id)}
                style={{
                  padding: '12px 16px', cursor: 'pointer', transition: 'background 0.15s',
                  borderBottom: '1px solid var(--border)',
                  background: activeThreadId === t._id ? 'var(--teal-soft)' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: activeThreadId === t._id ? 'var(--teal)' : 'var(--bg)',
                  color: activeThreadId === t._id ? 'white' : 'var(--ink-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Send size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.title || 'New Outreach'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>
                    {new Date(t.updated_at || t.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  style={{ flexShrink: 0, opacity: 0.4 }}
                  onClick={(e) => handleDeleteThread(t._id, e)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main chat area ── */}
      <div className={`outbound-main ${!mobileShowChat ? 'mobile-hidden' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden', minWidth: 0 }}>
        {!activeThreadId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16, background: 'var(--teal-soft)', color: 'var(--teal)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
            }}>
              <Sparkles size={28} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Tellem Outbound</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', margin: '0 0 24px', textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>
              Describe who you want to reach and what your goal is. The AI will find contacts, craft personalised messages, and send them for you.
            </p>
            <button className="btn-primary" onClick={handleNewThread} style={{ padding: '12px 28px', fontSize: 14, borderRadius: 10 }}>
              <MessageSquarePlus size={18} /> Start New Outreach
            </button>
            <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 420 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-muted)', marginBottom: 4 }}>
                Try saying...
              </div>
              {[
                'Find 5 marketing managers at SaaS companies in NYC',
                'Reach out to startup founders in fintech about our AI product',
                'Search for HR directors at companies with 100+ employees',
              ].map((example, i) => (
                <button
                  key={i}
                  onClick={async () => {
                    const thread = await api.createAgentThread(token)
                    setThreads(prev => [thread, ...prev])
                    setActiveThreadId(thread._id)
                    setInput(example)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
                    cursor: 'pointer', fontSize: 13, color: 'var(--ink)', textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.background = 'var(--teal-soft)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card)' }}
                >
                  <ArrowRight size={14} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : loadingThread ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{
              padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <button className="mobile-back-btn icon-btn" onClick={() => setMobileShowChat(false)}>
                <ArrowLeft size={18} />
              </button>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: 'var(--teal-soft)', color: 'var(--teal)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{activeThread?.title || 'New Outreach'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>AI-powered outbound agent</div>
              </div>
            </div>

            {/* Campaign Context */}
            <CampaignContextPanel
              threadId={activeThreadId}
              initialContext={activeThread?.campaign_context || ''}
              token={token}
              onSaved={(ctx) => setActiveThread(prev => prev ? { ...prev, campaign_context: ctx } : prev)}
            />

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.length === 0 && !sending && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-muted)' }}>
                  <Bot size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                  <p style={{ fontSize: 14, margin: 0 }}>Tell me who you want to reach and what your goal is.</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  onExecute={() => handleExecute()}
                  executing={executing}
                  onPickOption={handlePickOption}
                  isSending={sending}
                  onSendDraft={handleSendDraft}
                />
              ))}
              {sending && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={avatarStyle('assistant')}><Bot size={13} /></div>
                  <div style={{ ...bubbleStyle(false), display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Loader size={14} style={{ animation: 'spin 0.6s linear infinite', color: 'var(--teal)' }} />
                    <span style={{ color: 'var(--ink-soft)' }}>Thinking...</span>
                  </div>
                </div>
              )}
              {execProgress && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={avatarStyle('assistant')}><Bot size={13} /></div>
                  <div style={{ ...bubbleStyle(false), minWidth: 280 }}>
                    <ProgressBar progress={execProgress} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} style={{
              padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--card)',
              display: 'flex', gap: 8,
            }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Describe your outreach goal..."
                className="chat-input"
                disabled={sending || executing}
              />
              <button
                type="submit"
                className="chat-send-btn"
                disabled={!input.trim() || sending || executing}
              >
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
