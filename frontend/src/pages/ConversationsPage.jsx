import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import {
  MessageCircle, RefreshCw, Send, Clock, Trash2, CheckCircle,
  ThumbsUp, ThumbsDown, XCircle, Bot, User, Sparkles, ChevronRight, AlertTriangle, ArrowLeft
} from 'lucide-react'

const STATUS_CONFIG = {
  escalated: { label: 'Needs Attention', color: '#ea580c', bg: '#fff7ed', icon: AlertTriangle },
  interested: { label: 'Interested', color: '#16a34a', bg: '#f0fdf4', icon: ThumbsUp },
  not_interested: { label: 'Declined', color: '#dc2626', bg: '#fef2f2', icon: ThumbsDown },
  active: { label: 'Active', color: '#2563eb', bg: '#eff6ff', icon: MessageCircle },
  sent: { label: 'Sent', color: '#6b7280', bg: '#f3f4f6', icon: Send },
  closed: { label: 'Closed', color: '#9ca3af', bg: '#f9fafb', icon: CheckCircle },
}

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.sent
  const Icon = config.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 600,
      color: config.color, background: config.bg,
    }}>
      <Icon size={10} /> {config.label}
    </span>
  )
}

function ReplyComposer({ convId, token, onReplySent }) {
  const [instruction, setInstruction] = useState('')
  const [sending, setSending] = useState(false)
  const [lastSent, setLastSent] = useState(null)

  async function handleSend(e) {
    e.preventDefault()
    const text = instruction.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const result = await api.sendConversationReply(token, convId, text)
      setLastSent(result.reply_sent)
      setInstruction('')
      onReplySent?.()
    } catch (err) {
      alert(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ marginTop: 10, borderRadius: 8, border: '1.5px solid #fed7aa', background: '#fffbeb', padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#ea580c', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <AlertTriangle size={12} /> Tell the AI how to respond
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 8, lineHeight: 1.5 }}>
        e.g. "Tell them we're available Tuesday at 3pm" or "Share our pricing: $99/mo"
      </div>
      <form onSubmit={handleSend} style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder="Type instruction for the AI..."
          disabled={sending}
          style={{
            flex: 1, padding: '8px 12px', fontSize: 12, borderRadius: 6,
            border: '1px solid var(--border)', fontFamily: 'inherit',
            outline: 'none', background: 'white',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--teal)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <button type="submit" className="btn-primary" disabled={!instruction.trim() || sending}
          style={{ padding: '8px 14px', fontSize: 11, borderRadius: 6, whiteSpace: 'nowrap' }}>
          {sending ? 'Sending...' : 'Send via AI'}
        </button>
      </form>
      {lastSent && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: 'white', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600, color: 'var(--teal)' }}>AI sent:</span> {lastSent}
        </div>
      )}
    </div>
  )
}

function MessageThread({ messages, isTest }) {
  if (!messages?.length) return null
  return (
    <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, padding: '8px 0' }}>
      {messages.map((msg, i) => (
        <div key={i} style={{
          display: 'flex', flexDirection: msg.fromMe ? 'row-reverse' : 'row', gap: 6,
        }}>
          <div style={{ maxWidth: '75%' }}>
            {(msg.is_demo || isTest) && (
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase',
                marginBottom: 2, textAlign: msg.fromMe ? 'right' : 'left', letterSpacing: 0.5,
              }}>
                {msg.fromMe ? 'AI (Test)' : 'Simulated Reply'}
              </div>
            )}
            <div style={{
              padding: '8px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              ...(msg.fromMe
                ? { background: 'var(--teal)', color: 'white', borderBottomRightRadius: 3 }
                : { background: 'white', border: '1px solid var(--border)', borderBottomLeftRadius: 3 }),
            }}>
              {msg.text}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ConversationThread({ conv, onStatusChange, onDelete, expanded, onToggle, token, onReload }) {
  const name = conv.contact_name || conv.customer_name || conv.jid?.split('@')[0] || 'Unknown'
  const hasReply = conv.last_customer_message
  const isClosed = conv.status === 'closed'
  const statusActions = Object.keys(STATUS_CONFIG).filter(s => s !== conv.status && s !== 'closed')

  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const fetchDetail = useCallback(() => {
    if (!token) return
    setLoadingDetail(true)
    api.getConversation(token, conv._id)
      .then(d => setDetail(d))
      .catch(() => {})
      .finally(() => setLoadingDetail(false))
  }, [token, conv._id])

  useEffect(() => {
    if (expanded && !detail) fetchDetail()
  }, [expanded, detail, fetchDetail])

  useEffect(() => {
    if (!expanded || !(conv.is_demo || conv.is_test)) return
    const timer = setInterval(fetchDetail, 6000)
    return () => clearInterval(timer)
  }, [expanded, conv.is_demo, conv.is_test, fetchDetail])

  return (
    <div className="card" style={{ marginBottom: 8, cursor: 'pointer', padding: 0, overflow: 'hidden' }}
      onClick={onToggle}>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--teal-soft)',
            color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>
            {name[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
              <StatusBadge status={conv.status} />
              {(conv.is_demo || conv.is_test) && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 700,
                  color: '#7c3aed', background: '#f5f3ff', textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  Test
                </span>
              )}
              {conv.campaign_name && (
                <span style={{ fontSize: 10, color: 'var(--ink-muted)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>
                  {conv.campaign_name}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hasReply ? (
                <><span style={{ color: 'var(--teal)', fontWeight: 600 }}>Customer:</span> {conv.last_customer_message}</>
              ) : (
                <><span style={{ fontWeight: 500 }}>You:</span> {conv.initial_message}</>
              )}
            </div>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--ink-muted)', transform: expanded ? 'rotate(90deg)' : 'none', transition: '0.15s' }} />
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--bg)' }}
          onClick={(e) => e.stopPropagation()}>
          {conv.status === 'escalated' && conv.escalation_reason && (
            <div style={{
              fontSize: 12, marginBottom: 10, padding: '8px 12px', borderRadius: 8,
              background: '#fff7ed', border: '1px solid #fed7aa', color: '#ea580c',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertTriangle size={14} />
              <span><strong>Escalation:</strong> {conv.escalation_reason}</span>
            </div>
          )}
          {conv.objective && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 10 }}>
              <strong>Objective:</strong> {conv.objective}
            </div>
          )}

          {loadingDetail ? (
            <div style={{ textAlign: 'center', padding: 12 }}><div className="spinner" /></div>
          ) : detail?.messages?.length > 0 ? (
            <>
              <div style={{ fontWeight: 600, color: 'var(--ink-muted)', fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>
                Conversation ({detail.messages.length} messages)
              </div>
              <MessageThread messages={detail.messages} isTest={conv.is_demo || conv.is_test} />
            </>
          ) : (
            <>
              {conv.initial_message && (
                <div style={{ fontSize: 12, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink-muted)', fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Initial Message Sent</div>
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.6 }}>
                    {conv.initial_message}
                  </div>
                </div>
              )}
              {conv.last_customer_message && (
                <div style={{ fontSize: 12, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, color: 'var(--teal)', fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Customer Reply</div>
                  <div style={{ background: 'white', border: '1px solid var(--teal)', borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.6 }}>
                    {conv.last_customer_message}
                  </div>
                </div>
              )}
            </>
          )}

          {conv.status === 'escalated' && (
            <ReplyComposer convId={conv._id} token={token} onReplySent={() => {
              setDetail(null)
              onReload?.()
            }} />
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
            {!isClosed && statusActions.map((status) => {
              const config = STATUS_CONFIG[status]
              if (!config) return null
              const Icon = config.icon
              return (
                <button key={status} onClick={() => onStatusChange(conv._id, status)}
                  className="btn-ghost" style={{ padding: '5px 10px', fontSize: 11, gap: 4, color: config.color, borderColor: config.color + '40' }}>
                  <Icon size={12} /> {config.label}
                </button>
              )
            })}
            {!isClosed && (
              <button onClick={() => onStatusChange(conv._id, 'closed')}
                className="btn-ghost" style={{ padding: '5px 10px', fontSize: 11, gap: 4, color: '#9ca3af', borderColor: '#9ca3af40', marginLeft: 'auto' }}>
                <XCircle size={12} /> Close
              </button>
            )}
            {isClosed && (
              <button onClick={() => { if (confirm('Delete this conversation and all its messages?')) onDelete?.(conv._id) }}
                className="btn-ghost" style={{ padding: '5px 10px', fontSize: 11, gap: 4, color: '#dc2626', borderColor: '#dc262640' }}>
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
          {conv.updated_at && (
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 8 }}>
              Updated {new Date(conv.updated_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ConversationsPage() {
  const { token } = useAuth()
  const [conversations, setConversations] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: "Hi! I'm your AI management assistant. I can help you manage your outbound conversations. Ask me things like:\n\n• \"Show me who's interested\"\n• \"How many replies did we get?\"\n• \"What's the status of our campaigns?\"" },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)

  const loadData = useCallback(async () => {
    if (!token) return
    try {
      const [convs, statsData] = await Promise.all([
        api.getConversations(token, statusFilter || undefined),
        api.getConversationStats(token),
      ])
      setConversations(convs)
      setStats(statsData)
    } catch {}
    finally { setLoading(false) }
  }, [token, statusFilter])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!token) return
    const timer = setInterval(loadData, 10000)
    return () => clearInterval(timer)
  }, [loadData, token])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  async function handleStatusChange(convId, newStatus) {
    try {
      const updated = await api.updateConversationStatus(token, convId, newStatus)
      setConversations((prev) => prev.map((c) => c._id === convId ? updated : c))
      loadData()
    } catch (err) { alert(err.message) }
  }

  async function handleDelete(convId) {
    try {
      await api.deleteConversation(token, convId)
      setConversations((prev) => prev.filter((c) => c._id !== convId))
      setExpandedId(null)
      loadData()
    } catch (err) { alert(err.message) }
  }

  async function handleClearClosed() {
    try {
      const result = await api.clearClosedConversations(token)
      loadData()
      return result.deleted || 0
    } catch (err) { alert(err.message); return 0 }
  }

  async function handleChatSend(e) {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text || chatLoading) return

    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', text }])
    setChatLoading(true)

    try {
      const response = await api.aiInstruct(token, text)
      setChatMessages((prev) => [...prev, { role: 'assistant', text: response.reply }])
      if (response.actions_taken) {
        loadData()
      }
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: 'assistant', text: `Sorry, I couldn't process that: ${err.message}` }])
    } finally {
      setChatLoading(false)
    }
  }

  const statItems = [
    { key: 'total', label: 'Total', color: 'var(--ink)' },
    { key: 'escalated', label: 'Needs You', color: '#ea580c' },
    { key: 'interested', label: 'Interested', color: '#16a34a' },
    { key: 'active', label: 'Active', color: '#2563eb' },
    { key: 'sent', label: 'Sent', color: '#6b7280' },
    { key: 'not_interested', label: 'Declined', color: '#dc2626' },
    { key: 'closed', label: 'Closed', color: '#9ca3af' },
  ]

  const [mobileShowAI, setMobileShowAI] = useState(false)

  return (
    <div className="conversations-layout" style={{ display: 'flex', height: '100%' }}>
      {/* Left: AI Chat */}
      <div className={`conversations-ai-panel ${!mobileShowAI ? 'mobile-hidden' : ''}`} style={{ width: 340, minWidth: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--card)' }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="mobile-back-btn icon-btn" onClick={() => setMobileShowAI(false)}>
            <ArrowLeft size={18} />
          </button>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: 'var(--teal-soft)', color: 'var(--teal)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Sparkles size={15} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>AI Assistant</div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Manage conversations</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {chatMessages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: msg.role === 'user' ? 'var(--ink)' : 'var(--teal-soft)',
                color: msg.role === 'user' ? 'white' : 'var(--teal)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {msg.role === 'user' ? <User size={13} /> : <Bot size={13} />}
              </div>
              <div style={{
                maxWidth: '80%', padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                ...(msg.role === 'user'
                  ? { background: 'var(--ink)', color: 'white', borderBottomRightRadius: 4 }
                  : { background: 'var(--bg)', border: '1px solid var(--border)', borderBottomLeftRadius: 4 }),
              }}>
                {msg.text}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'var(--teal-soft)', color: 'var(--teal)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bot size={13} />
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ animation: 'pulse-dot 1.5s ease-in-out infinite' }}>Thinking...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleChatSend} style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Give instructions..."
            className="chat-input"
            disabled={chatLoading}
          />
          <button type="submit" className="chat-send-btn" disabled={!chatInput.trim() || chatLoading}>
            <Send size={16} />
          </button>
        </form>
      </div>

      {/* Right: Conversation feed */}
      <div className={`conversations-feed ${mobileShowAI ? 'mobile-hidden' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <button className="mobile-panel-toggle" onClick={() => setMobileShowAI(true)}>
          <Sparkles size={14} /> Open AI Assistant
        </button>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Conversations</h2>
            <button onClick={loadData} className="icon-btn"><RefreshCw size={16} /></button>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${statItems.length}, 1fr)`, gap: 8, marginBottom: 14 }}>
            {statItems.map(({ key, label, color }) => {
              const isActive = statusFilter === key || (key === 'total' && !statusFilter)
              return (
                <button key={key} onClick={() => setStatusFilter(key === 'total' ? '' : key)}
                  style={{
                    padding: '10px 4px', textAlign: 'center', borderRadius: 10,
                    border: isActive ? `1.5px solid ${color}30` : '1.5px solid transparent',
                    cursor: 'pointer',
                    background: isActive ? color + '10' : 'var(--bg)',
                    transition: '0.15s',
                  }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{stats[key] || 0}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontWeight: 600, marginTop: 2 }}>{label}</div>
                </button>
              )
            })}
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={() => setStatusFilter('')}
              className={`campaign-tab ${!statusFilter ? 'active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }}>
              All
            </button>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={`campaign-tab ${statusFilter === key ? 'active' : ''}`}
                style={{ fontSize: 11, padding: '4px 10px' }}>
                {config.label} {stats[key] ? `(${stats[key]})` : ''}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div className="empty-state"><div className="spinner" /><p>Loading conversations...</p></div>
          ) : conversations.length === 0 ? (
            <div className="empty-state">
              <MessageCircle size={48} style={{ color: 'var(--ink-muted)', marginBottom: 16 }} />
              <h3>{statusFilter ? `No ${STATUS_CONFIG[statusFilter]?.label?.toLowerCase()} conversations` : 'No outbound conversations yet'}</h3>
              <p>Execute a campaign from the Outbound page to start tracking conversations here.</p>
            </div>
          ) : (
            <>
              {statusFilter === 'closed' && conversations.length > 0 && (
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      if (confirm(`Delete all ${conversations.length} closed conversation(s) and their messages? This cannot be undone.`))
                        handleClearClosed()
                    }}
                    className="btn-ghost"
                    style={{
                      padding: '6px 14px', fontSize: 12, gap: 6,
                      color: '#dc2626', borderColor: '#dc262640', fontWeight: 600,
                    }}>
                    <Trash2 size={14} /> Clear All Closed
                  </button>
                </div>
              )}
              {conversations.map((conv) => (
                <ConversationThread
                  key={conv._id}
                  conv={conv}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  expanded={expandedId === conv._id}
                  onToggle={() => setExpandedId(expandedId === conv._id ? null : conv._id)}
                  token={token}
                  onReload={loadData}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
