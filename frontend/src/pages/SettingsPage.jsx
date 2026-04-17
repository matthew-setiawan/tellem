import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { QRCodeSVG } from 'qrcode.react'
import { io } from 'socket.io-client'
import { Smartphone, RefreshCw, Wifi, WifiOff, QrCode, FlaskConical, Check } from 'lucide-react'

const WA_SOCKET_URL = import.meta.env.VITE_WA_SOCKET_URL || 'http://localhost:3001'
const WA_SOCKET_PATH = import.meta.env.VITE_WA_SOCKET_PATH || '/socket.io'

export default function SettingsPage() {
  const { token, user } = useAuth()

  const [waStatus, setWaStatus] = useState('disconnected')
  const [qrData, setQrData] = useState(null)
  const socketRef = useRef(null)

  const [testingMode, setTestingMode] = useState(false)
  const [demoLeads, setDemoLeads] = useState(false)
  const [testName, setTestName] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testWhatsapp, setTestWhatsapp] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) return
    api.getSettings(token)
      .then((data) => {
        setTestingMode(!!data.testing_mode)
        setDemoLeads(!!data.demo_leads)
        const tc = data.test_contact || {}
        setTestName(tc.name || '')
        setTestEmail(tc.email || '')
        setTestWhatsapp(tc.whatsapp || '')
      })
      .catch((err) => console.error('Load settings failed:', err))
      .finally(() => setLoaded(true))
  }, [token])

  async function save(overrides = {}) {
    if (!token) return
    setSaving(true)
    const payload = {
      testing_mode: 'testing_mode' in overrides ? overrides.testing_mode : testingMode,
      demo_leads: 'demo_leads' in overrides ? overrides.demo_leads : demoLeads,
      test_contact: {
        name: 'name' in overrides ? overrides.name : testName,
        email: 'email' in overrides ? overrides.email : testEmail,
        whatsapp: 'whatsapp' in overrides ? overrides.whatsapp : testWhatsapp,
      },
    }
    try {
      await api.updateSettings(token, payload)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  function handleToggle() {
    const next = !testingMode
    setTestingMode(next)
    save({ testing_mode: next })
  }

  // WhatsApp socket
  useEffect(() => {
    if (!user?.id) return
    const socket = io(WA_SOCKET_URL, { path: WA_SOCKET_PATH, transports: ['websocket', 'polling'] })
    socketRef.current = socket
    socket.on('connect', () => socket.emit('register', { userId: user.id }))
    socket.on('qr', ({ qr }) => { setQrData(qr); setWaStatus('qr') })
    socket.on('connected', () => { setQrData(null); setWaStatus('connected') })
    socket.on('disconnected', () => { setQrData(null); setWaStatus('disconnected') })
    return () => socket.disconnect()
  }, [user?.id])

  function handleConnect() {
    if (!socketRef.current?.connected || !user?.id) return
    socketRef.current.emit('start-session', { userId: user.id })
  }

  const isConnected = waStatus === 'connected'
  const hasQR = waStatus === 'qr' && qrData

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage WhatsApp connections and testing configuration</p>
      </div>

      {/* ── Testing Mode ── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>Testing Mode</h2>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: testingMode ? '#fef9c3' : 'var(--bg)',
                color: testingMode ? '#ca8a04' : 'var(--ink-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FlaskConical size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  Enable Testing Mode
                  {testingMode && <span style={{ color: '#ca8a04', fontSize: 11, fontWeight: 700, marginLeft: 8, background: '#fef9c3', padding: '2px 8px', borderRadius: 100 }}>ACTIVE</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
                  All searches return your test contact only — no real people contacted
                </div>
              </div>
            </div>
            <button
              onClick={handleToggle}
              disabled={saving}
              style={{
                width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: testingMode ? 'var(--teal)' : 'var(--border)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: 'white',
                position: 'absolute', top: 3, left: testingMode ? 25 : 3,
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              }} />
            </button>
          </div>

          {testingMode && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Test method</div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <button
                  onClick={() => { setDemoLeads(true); save({ demo_leads: true }) }}
                  style={{
                    flex: 1, padding: 16, borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    border: demoLeads ? '2px solid var(--teal)' : '1.5px solid var(--border)',
                    background: demoLeads ? 'var(--teal-soft)' : 'var(--card)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: demoLeads ? 'var(--teal)' : 'var(--ink)' }}>
                    Fake Leads (Demo)
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                    AI generates fake contacts who "reply" with simulated responses. No real messages sent at all.
                  </div>
                </button>
                <button
                  onClick={() => { setDemoLeads(false); save({ demo_leads: false }) }}
                  style={{
                    flex: 1, padding: 16, borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    border: !demoLeads ? '2px solid var(--teal)' : '1.5px solid var(--border)',
                    background: !demoLeads ? 'var(--teal-soft)' : 'var(--card)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: !demoLeads ? 'var(--teal)' : 'var(--ink)' }}>
                    Real Number
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                    All searches return your test number. Real WhatsApp messages are sent to that number.
                  </div>
                </button>
              </div>

              {demoLeads ? (
                <div style={{
                  padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0',
                  fontSize: 12, color: '#15803d', lineHeight: 1.5,
                }}>
                  Demo mode active. Searches will return AI-generated fake contacts. Messages are simulated — fake leads will "reply" with AI-generated responses. No real messages are sent.
                </div>
              ) : (
                <>
                  <div style={{
                    padding: 10, background: '#fefce8', borderRadius: 8, border: '1px solid #fef08a',
                    fontSize: 12, color: '#92400e', marginBottom: 16, lineHeight: 1.5,
                  }}>
                    Every outreach search will return this contact. Real messages are sent via WhatsApp to this number.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Name</label>
                      <input type="text" className="form-input" placeholder="Test contact name"
                        value={testName}
                        onChange={(e) => setTestName(e.target.value)}
                        onBlur={() => save()}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Email</label>
                      <input type="email" className="form-input" placeholder="test@example.com"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        onBlur={() => save()}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>WhatsApp Number *</label>
                    <input type="text" className="form-input" placeholder="+1234567890 — this number receives all test messages"
                      value={testWhatsapp}
                      onChange={(e) => setTestWhatsapp(e.target.value)}
                      onBlur={() => save()}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── WhatsApp Connection ── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>WhatsApp Connection</h2>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: isConnected ? '#dcfce7' : 'var(--bg)',
                color: isConnected ? '#16a34a' : 'var(--ink-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Smartphone size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>WhatsApp</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {isConnected ? (
                    <><Wifi size={12} style={{ color: '#16a34a' }} /> Connected</>
                  ) : hasQR ? (
                    <><QrCode size={12} style={{ color: 'var(--orange)' }} /> Scan QR code below</>
                  ) : (
                    <><WifiOff size={12} /> Disconnected</>
                  )}
                </div>
              </div>
            </div>
            {!isConnected && (
              <button onClick={handleConnect} className="btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }}>
                <RefreshCw size={14} /> {hasQR ? 'New QR' : 'Connect'}
              </button>
            )}
          </div>

          {hasQR && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: 24, background: 'white', borderRadius: 12, border: '1px solid var(--border)',
            }}>
              <QRCodeSVG value={qrData} size={240} level="M" />
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 16, textAlign: 'center' }}>
                Open WhatsApp → Settings → Linked Devices → Link a Device
              </p>
            </div>
          )}

          {isConnected && (
            <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#16a34a', fontWeight: 500, textAlign: 'center' }}>
              WhatsApp is connected and ready to send messages
            </div>
          )}

          {!isConnected && !hasQR && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
              Click "Connect" to link your WhatsApp account by scanning a QR code.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
