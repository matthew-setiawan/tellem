import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { MessageCircle, Send, RefreshCw } from 'lucide-react'

export default function ChatPage() {
  const { token } = useAuth()
  const [chats, setChats] = useState([])
  const [selectedChat, setSelectedChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)

  const loadChats = useCallback(async () => {
    if (!token) return
    try {
      const data = await api.getWhatsAppChats(token)
      setChats(data)
    } catch {}
  }, [token])

  useEffect(() => { loadChats() }, [loadChats])

  useEffect(() => {
    if (!selectedChat || !token) return
    let cancelled = false

    async function loadMessages() {
      try {
        const data = await api.getWhatsAppMessages(token, selectedChat.jid || selectedChat.id)
        if (!cancelled) setMessages(data)
      } catch {}
    }

    loadMessages()
    const timer = setInterval(loadMessages, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [selectedChat, token])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    if (!newMessage.trim() || !selectedChat || sending) return
    setSending(true)
    try {
      await api.sendWhatsAppMessage(token, selectedChat.jid || selectedChat.id, newMessage.trim())
      setNewMessage('')
    } catch (err) { alert(err.message) }
    finally { setSending(false) }
  }

  return (
    <div className="chat-layout">
      {/* Chat list */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Chats</h3>
          <button onClick={loadChats} className="icon-btn"><RefreshCw size={16} /></button>
        </div>
        <div className="chat-list">
          {chats.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
              No chats yet. Connect WhatsApp and start outreach.
            </div>
          )}
          {chats.map((chat) => {
            const name = chat.displayName || chat.name || chat.jid?.split('@')[0] || 'Unknown'
            const isActive = selectedChat?.jid === chat.jid || selectedChat?.id === chat.id
            return (
              <div key={chat.jid || chat.id} className={`chat-item ${isActive ? 'active' : ''}`} onClick={() => setSelectedChat(chat)}>
                <div className="chat-item-avatar">{name[0]?.toUpperCase()}</div>
                <div className="chat-item-info">
                  <span className="chat-item-name">{name}</span>
                  <span className="chat-item-jid">{chat.jid?.split('@')[0]}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Chat window */}
      <div className="chat-window">
        {!selectedChat ? (
          <div className="chat-empty">
            <MessageCircle size={48} style={{ color: 'var(--ink-muted)', marginBottom: 16 }} />
            <h3>Select a chat</h3>
            <p>Choose a conversation from the sidebar to view messages.</p>
          </div>
        ) : (
          <>
            <div className="chat-window-header">
              <div className="chat-window-avatar">
                {(selectedChat.displayName || selectedChat.name || 'U')[0]?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedChat.displayName || selectedChat.name || selectedChat.jid?.split('@')[0]}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{selectedChat.jid}</div>
              </div>
            </div>

            <div className="chat-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`chat-bubble ${msg.fromMe ? 'outgoing' : 'incoming'}`}>
                  <p>{msg.text}</p>
                  <span className="chat-time">{msg.timestamp ? new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-bar" onSubmit={handleSend}>
              <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." className="chat-input" disabled={sending} />
              <button type="submit" className="chat-send-btn" disabled={!newMessage.trim() || sending}>
                <Send size={18} />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
