import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isLidUser,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import cors from 'cors'
import express from 'express'
import { createServer } from 'http'
import fs from 'fs'
import path from 'path'
import pino from 'pino'
import { Server } from 'socket.io'

import { CORS_ORIGINS, DEBUG_MODE, LOG_LEVEL, SOCKET_IO_PATH } from './config.js'
import { getMongoDb, isMongoConfigured } from './mongo.js'

const PORT = process.env.PORT || 3001
const logger = pino({ level: LOG_LEVEL })
const sessions = new Map()

function allowOrigin(origin, callback) {
  if (!origin || CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) {
    callback(null, true)
    return
  }
  callback(new Error(`Origin ${origin} not allowed by CORS`))
}

process.on('uncaughtException', (err) => console.error('[FATAL] Uncaught exception:', err.message))
process.on('unhandledRejection', (err) => console.error('[FATAL] Unhandled rejection:', err?.message || err))

const app = express()
app.use(cors({ origin: allowOrigin, credentials: true }))
app.use(express.json({ limit: '10mb' }))

const server = createServer(app)
const io = new Server(server, {
  cors: { origin: allowOrigin, credentials: true },
  path: SOCKET_IO_PATH,
})

function getAuthDir(userId) {
  return path.resolve(process.cwd(), 'auth-data', userId)
}

// ── LID-to-phone JID mapping ──
// WhatsApp uses @lid (Linked IDs) internally. Replies come from @lid JIDs
// even though we send to @s.whatsapp.net JIDs. We capture the mapping from
// contact events and persist to MongoDB so we can resolve inbound @lid JIDs.

async function loadLidMap(userId) {
  const map = new Map()
  if (!isMongoConfigured()) return map
  try {
    const db = await getMongoDb()
    const docs = await db.collection('lid_mappings').find({ user_id: userId }).toArray()
    for (const d of docs) map.set(d.lid_jid, d.phone_jid)
    if (docs.length) logger.info({ userId, count: docs.length }, 'Loaded LID mappings')
  } catch (err) {
    logger.error(err, 'Failed to load LID mappings')
  }
  return map
}

async function persistLidMapping(userId, lidJid, phoneJid) {
  if (!isMongoConfigured()) return
  try {
    const db = await getMongoDb()
    await db.collection('lid_mappings').updateOne(
      { user_id: userId, lid_jid: lidJid },
      { $set: { user_id: userId, lid_jid: lidJid, phone_jid: phoneJid, updated_at: new Date().toISOString() } },
      { upsert: true }
    )
  } catch (err) {
    logger.error(err, 'Failed to persist LID mapping')
  }
}

function captureLidFromContact(contact, lidMap, userId) {
  const id = contact.id || ''
  const lid = contact.lid || contact.lidJid || ''

  let phoneJid = null
  let lidJid = null

  if (id.endsWith('@s.whatsapp.net') && lid && (lid.endsWith('@lid') || lid.includes('@lid'))) {
    phoneJid = id
    lidJid = lid
  } else if (id.endsWith('@lid') && lid && lid.endsWith('@s.whatsapp.net')) {
    phoneJid = lid
    lidJid = id
  }

  if (phoneJid && lidJid && !lidMap.has(lidJid)) {
    lidMap.set(lidJid, phoneJid)
    logger.info({ userId, lid: lidJid, phone: phoneJid }, 'Captured LID mapping')
    persistLidMapping(userId, lidJid, phoneJid)
  }
}

function resolveJid(jid, lidMap) {
  if (!jid || !isLidUser(jid)) return jid
  return lidMap.get(jid) || jid
}

async function startSession(userId) {
  if (sessions.has(userId)) return sessions.get(userId)

  const authDir = getAuthDir(userId)
  fs.mkdirSync(authDir, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    browser: Browsers.ubuntu('Tellem'),
    printQRInTerminal: false,
  })

  const lidMap = await loadLidMap(userId)
  const session = { sock, userId, status: 'connecting', lidMap }
  sessions.set(userId, session)

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts) captureLidFromContact(c, lidMap, userId)
  })
  sock.ev.on('contacts.update', (updates) => {
    for (const c of updates) captureLidFromContact(c, lidMap, userId)
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      session.status = 'qr'
      session.qr = qr
      io.to(userId).emit('qr', { qr, userId })
      logger.info({ userId }, 'QR code generated')
    }

    if (connection === 'open') {
      session.status = 'connected'
      session.qr = null

      const myJid = sock.user?.id
      if (myJid) {
        const myPhone = myJid.split(':')[0].split('@')[0]
        for (const [otherId, other] of sessions) {
          if (otherId === userId) continue
          const otherJid = other.sock?.user?.id
          if (!otherJid) continue
          const otherPhone = otherJid.split(':')[0].split('@')[0]
          if (otherPhone === myPhone) {
            logger.info({ userId, otherUserId: otherId, phone: myPhone }, 'Same WhatsApp phone — disconnecting old session')
            other._killedByNewSession = true
            try { other.sock.end() } catch {}
            sessions.delete(otherId)
            io.to(otherId).emit('disconnected', { userId: otherId, reason: 'same_phone_new_session' })
            const oldAuthDir = getAuthDir(otherId)
            fs.rmSync(oldAuthDir, { recursive: true, force: true })
          }
        }
      }

      io.to(userId).emit('connected', { userId })
      logger.info({ userId }, 'WhatsApp connected')

      if (isMongoConfigured()) {
        try {
          const db = await getMongoDb()
          await db.collection('whatsapp_instances').updateOne(
            { user_id: userId, wa_instance_id: 'default' },
            { $set: { status: 'connected', updated_at: new Date().toISOString() } },
            { upsert: true }
          )
        } catch (err) {
          logger.error(err, 'Failed to update instance status in DB')
        }
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      session.status = 'disconnected'
      sessions.delete(userId)
      io.to(userId).emit('disconnected', { userId, statusCode })

      if (session._killedByNewSession) {
        logger.info({ userId }, 'Session killed by new session on same phone — not reconnecting')
        fs.rmSync(authDir, { recursive: true, force: true })
      } else if (statusCode !== DisconnectReason.loggedOut) {
        logger.info({ userId, statusCode }, 'Reconnecting...')
        setTimeout(() => startSession(userId), 3000)
      } else {
        logger.info({ userId }, 'Logged out, cleaning up auth')
        fs.rmSync(authDir, { recursive: true, force: true })
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages: newMessages, type }) => {
    if (!isMongoConfigured()) return

    try {
      const db = await getMongoDb()
      const col = db.collection('message_logs')

      for (const msg of newMessages) {
        const rawJid = msg.key.remoteJid
        const jid = resolveJid(rawJid, lidMap)
        const fromMe = msg.key.fromMe
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          ''

        if (rawJid !== jid) {
          logger.info({ rawJid, resolvedJid: jid }, 'Resolved LID to phone JID')
        }

        const doc = {
          user_id: userId,
          channel: 'whatsapp',
          wa_line: true,
          jid,
          raw_jid: rawJid !== jid ? rawJid : undefined,
          message_id: msg.key.id,
          from_me: fromMe,
          direction: fromMe ? 'outbound' : 'inbound',
          text,
          message_type: text ? 'text' : 'other',
          push_name: msg.pushName || null,
          wa_message_timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) : null,
          timestamp: new Date().toISOString(),
          history_source: type === 'notify' ? 'live_notify' : 'history_sync',
          wa_key: msg.key,
        }

        await col.updateOne(
          { user_id: userId, channel: 'whatsapp', jid, message_id: msg.key.id },
          { $set: doc, $setOnInsert: { createdAt: new Date().toISOString() } },
          { upsert: true }
        )

        await db.collection('whatsapp_chats').updateOne(
          { user_id: userId, jid },
          {
            $set: {
              user_id: userId,
              jid,
              name: msg.pushName || null,
              updatedAt: new Date().toISOString(),
            },
            $setOnInsert: { createdAt: new Date().toISOString() },
          },
          { upsert: true }
        )
      }
    } catch (err) {
      logger.error(err, 'Failed to persist messages')
    }

    for (const msg of newMessages) {
      if (msg.key.fromMe || type !== 'notify') continue
      const msgText =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        ''
      if (!msgText.trim()) continue

      const rawJid = msg.key.remoteJid
      const jid = resolveJid(rawJid, lidMap)

      const webhookUrl = process.env.BACKEND_WEBHOOK_URL || 'http://127.0.0.1:5000/api/webhook/inbound'
      try {
        const resp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            jid,
            rawLidJid: rawJid !== jid ? rawJid : undefined,
            text: msgText,
            pushName: msg.pushName || null,
            messageId: msg.key.id,
          }),
        })
        const data = await resp.json()
        logger.info({ rawJid, resolvedJid: jid, action: data.action }, 'Webhook response')
      } catch (err) {
        logger.error(err, 'Failed to call backend webhook')
      }
    }

    io.to(userId).emit('messages', { userId, count: newMessages.length })
  })

  return session
}

// ── Socket.IO ──

io.on('connection', (socket) => {
  socket.on('register', async ({ userId }) => {
    if (!userId) return
    socket.join(userId)
    logger.info({ userId }, 'Socket registered')

    const existing = sessions.get(userId)
    if (existing?.status === 'qr' && existing.qr) {
      socket.emit('qr', { qr: existing.qr, userId })
    } else if (existing?.status === 'connected') {
      socket.emit('connected', { userId })
    }
  })

  socket.on('start-session', async ({ userId }) => {
    if (!userId) return
    try {
      await startSession(userId)
    } catch (err) {
      socket.emit('error', { message: err.message })
    }
  })
})

// ── REST API ──

app.get('/health', (req, res) => res.json({ status: 'ok', sessions: sessions.size }))

app.get('/api/sessions', (req, res) => {
  const list = []
  for (const [key, session] of sessions) {
    list.push({
      userId: session.userId,
      status: session.status,
    })
  }
  res.json(list)
})

app.get('/api/sessions/:userId/status', (req, res) => {
  const { userId } = req.params
  const session = sessions.get(userId)
  if (!session) return res.json({ status: 'disconnected' })
  res.json({ status: session.status, hasQr: !!session.qr })
})

app.post('/api/sessions/:userId/start', async (req, res) => {
  const { userId } = req.params
  try {
    const session = await startSession(userId)
    res.json({ status: session.status })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/sessions/:userId/kill', (req, res) => {
  const { userId } = req.params
  const session = sessions.get(userId)
  if (session) {
    session._killedByNewSession = true
    session.sock?.end()
    sessions.delete(userId)
  }
  res.json({ ok: true })
})

app.post('/api/send-message', async (req, res) => {
  let { userId, jid, text } = req.body
  if (!userId || !jid || !text) return res.status(400).json({ error: 'userId, jid, and text are required' })

  // Sanitize JID: strip +, spaces, dashes from the phone portion
  if (jid.includes('@')) {
    const [phone, domain] = jid.split('@')
    const clean = phone.replace(/[^0-9]/g, '')
    jid = `${clean}@${domain}`
  }

  let session = sessions.get(userId)

  if (!session || session.status !== 'connected') {
    try {
      session = await startSession(userId)
      if (session.status !== 'connected') {
        return res.status(503).json({ success: false, error: 'WhatsApp not connected' })
      }
    } catch (err) {
      return res.status(503).json({ success: false, error: `Cannot connect: ${err.message}` })
    }
  }

  try {
    const result = await session.sock.sendMessage(jid, { text })

    // Capture LID mapping from the send result
    const resultJid = result?.key?.remoteJid
    if (resultJid && isLidUser(resultJid) && jid.endsWith('@s.whatsapp.net')) {
      session.lidMap?.set(resultJid, jid)
      logger.info({ lid: resultJid, phone: jid }, 'Captured LID mapping from send result')
      persistLidMapping(userId, resultJid, jid)
    }

    res.json({ success: true, messageId: result?.key?.id })
  } catch (err) {
    logger.error(err, 'Failed to send message')
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/lid-mapping', async (req, res) => {
  const { userId, lidJid, phoneJid } = req.body
  if (!userId || !lidJid || !phoneJid) {
    return res.status(400).json({ error: 'userId, lidJid, and phoneJid required' })
  }
  const session = sessions.get(userId)
  if (session?.lidMap) session.lidMap.set(lidJid, phoneJid)
  await persistLidMapping(userId, lidJid, phoneJid)
  res.json({ ok: true })
})

app.get('/api/lid-mappings/:userId', async (req, res) => {
  const { userId } = req.params
  const session = sessions.get(userId)
  const mappings = []
  if (session?.lidMap) {
    for (const [lid, phone] of session.lidMap) {
      mappings.push({ lid, phone })
    }
  }
  res.json(mappings)
})

// ── Start ──

server.listen(PORT, () => {
  logger.info(`WhatsApp service running on port ${PORT}`)
  console.log(`[whatsapp-service] Listening on http://localhost:${PORT}`)
})
