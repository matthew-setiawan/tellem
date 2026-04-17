import { useEffect, useState } from 'react'

const chatFlow = [
  { type: 'user', content: 'Find me acquisition targets in SaaS with $5-50M ARR', delay: 0 },
  { type: 'ai', content: "Perfect! I'll search for qualified targets. Let me ask a few clarifying questions first:", delay: 800 },
  { type: 'ai', content: 'What industries are you focusing on? (e.g., Fintech, MarTech, HR Tech)', delay: 1600 },
  { type: 'user', content: 'MarTech and Fintech preferably', delay: 3000 },
  { type: 'ai', content: 'Great! Geographic focus? Any preference on founder background?', delay: 3800 },
  { type: 'user', content: 'US-based, prefer technical founders', delay: 5200 },
  { type: 'ai', content: '✓ Searching for qualified targets matching your criteria...', delay: 6000 },
  {
    type: 'match', delay: 7200, isMatching: true,
    content: 'Found 8 qualified targets. Reaching out via email & WhatsApp...',
    matchData: { name: 'Sarah Chen', title: 'Founder & CEO', company: 'FinFlow', avatar: '👩‍💼' },
  },
  {
    type: 'match', delay: 10000,
    content: 'Sarah responded! Available for a call?',
    matchData: { name: 'Sarah Chen', title: 'Founder & CEO', company: 'FinFlow', avatar: '👩‍💼', response: 'Yes! Happy to chat about potential partnership.' },
  },
  { type: 'ai', content: 'Sarah is interested. Are you available for a 30-min call?', delay: 11200 },
  { type: 'user', content: 'Perfect! What time works?', delay: 12600 },
  { type: 'ai', content: '📅 Call booked for Tuesday at 2:00 PM. Calendar link sent.', delay: 13400 },
]

export default function ChatInterfaceMockup() {
  const [messages, setMessages] = useState([])

  useEffect(() => {
    const timers = chatFlow.map((msg, idx) =>
      setTimeout(() => setMessages((prev) => [...prev, msg]), msg.delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', background: 'white', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.12)', overflow: 'hidden', border: '1px solid #e8e6e1' }}>
      <div style={{ background: 'linear-gradient(to right, #faf9f7, white)', padding: '16px 24px', borderBottom: '1px solid #f0eeea', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, background: '#00a896', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: 16 }}>T</div>
        <div>
          <p style={{ fontWeight: 600, color: '#1a1918', margin: 0, fontFamily: "'Crimson Text', serif" }}>Tellem</p>
          <p style={{ fontSize: 12, color: '#a9a8a3', margin: 0 }}>Always online</p>
        </div>
      </div>

      <div style={{ height: 384, overflowY: 'auto', padding: 24, background: '#faf9f7', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '75%',
              background: msg.type === 'user' ? '#1a1918' : 'white',
              color: msg.type === 'user' ? 'white' : '#1a1918',
              border: msg.type !== 'user' ? '1px solid #e8e6e1' : 'none',
              borderRadius: 12,
              padding: '10px 14px',
              fontSize: 13,
              lineHeight: 1.6,
            }}>
              {msg.type === 'match' && msg.matchData ? (
                <div>
                  <p style={{ color: '#6b6a67', margin: '0 0 8px' }}>{msg.content}</p>
                  <div style={{ background: '#e6faf7', border: '1px solid #00a896', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 24 }}>{msg.matchData.avatar}</span>
                      <div>
                        <p style={{ fontWeight: 600, margin: 0 }}>{msg.matchData.name}</p>
                        <p style={{ fontSize: 11, color: '#6b6a67', margin: 0 }}>{msg.matchData.title} at {msg.matchData.company}</p>
                      </div>
                    </div>
                    {msg.matchData.response && <p style={{ fontSize: 11, color: '#00a896', fontStyle: 'italic', margin: '6px 0 0' }}>"{msg.matchData.response}"</p>}
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0 }}>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {messages.length > 0 && messages.length < chatFlow.length && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: 'white', border: '1px solid #e8e6e1', borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 6 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 6, height: 6, background: '#a9a8a3', borderRadius: '50%', animation: `bounce 1s ease-in-out ${i * 150}ms infinite` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ background: 'white', padding: '12px 24px', borderTop: '1px solid #f0eeea', display: 'flex', gap: 12 }}>
        <input type="text" placeholder="Ask Tellem to find anyone..." disabled style={{ flex: 1, background: '#f8f7f5', border: '1px solid #e8e6e1', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#a9a8a3', opacity: 0.5 }} />
        <button disabled style={{ background: '#00a896', color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 500, opacity: 0.5 }}>Send</button>
      </div>

      <div style={{ background: 'linear-gradient(to right, #e6faf7, white)', padding: '8px 24px', borderTop: '1px solid rgba(0,168,150,0.2)' }}>
        <p style={{ fontSize: 11, color: '#00a896', fontWeight: 500, margin: 0 }}>
          {messages.length >= 12 ? '✓ Call booked with Sarah Chen' : messages.length >= 8 ? '⏳ Finding matches...' : 'Chatting with Tellem...'}
        </p>
      </div>
    </div>
  )
}
