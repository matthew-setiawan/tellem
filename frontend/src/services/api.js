const BASE = '/api'

async function request(path, options = {}) {
  const { headers: optHeaders, ...rest } = options
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...optHeaders },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` }
}

export const api = {
  // Auth
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  register: (username, password, email, business_name) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, email, business_name }),
    }),

  getMe: (token) =>
    request('/auth/me', { headers: authHeaders(token) }),

  // Outreach
  outreachSearch: (token, query, limit = 5) =>
    request('/outreach/search', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ query, limit }),
    }),

  getOutreachCampaigns: (token) =>
    request('/outreach/campaigns', { headers: authHeaders(token) }),

  createOutreachCampaign: (token, name) =>
    request('/outreach/campaigns', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name }),
    }),

  getOutreachCampaign: (token, id) =>
    request(`/outreach/campaigns/${id}`, { headers: authHeaders(token) }),

  updateOutreachCampaign: (token, id, updates) =>
    request(`/outreach/campaigns/${id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify(updates),
    }),

  deleteOutreachCampaign: (token, id) =>
    request(`/outreach/campaigns/${id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),

  addContactsToCampaign: (token, campaignId, contacts) =>
    request(`/outreach/campaigns/${campaignId}/contacts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ contacts }),
    }),

  removeContactFromCampaign: (token, campaignId, contactId) =>
    request(`/outreach/campaigns/${campaignId}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),

  addNumberToCampaign: (token, campaignId, data) =>
    request(`/outreach/campaigns/${campaignId}/add-number`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }),

  importCsvToCampaign: async (token, campaignId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${BASE}/outreach/campaigns/${campaignId}/import-csv`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Import failed')
    return data
  },

  executeCampaign: (token, campaignId, onProgress) => {
    return new Promise((resolve, reject) => {
      const url = `${BASE}/outreach/campaigns/${campaignId}/execute`
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) return res.json().then((d) => reject(new Error(d.error || 'Execute failed')))
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          function read() {
            reader.read().then(({ done, value }) => {
              if (done) return resolve()
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop()
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const event = JSON.parse(line.slice(6))
                    onProgress?.(event)
                  } catch {}
                }
              }
              read()
            })
          }
          read()
        })
        .catch(reject)
    })
  },

  // WhatsApp
  getWhatsAppChats: (token) =>
    request('/whatsapp/chats', { headers: authHeaders(token) }),

  getWhatsAppMessages: (token, jid, limit = 100) =>
    request(`/whatsapp/messages/${encodeURIComponent(jid)}?limit=${limit}`, {
      headers: authHeaders(token),
    }),

  sendWhatsAppMessage: (token, jid, text) =>
    request('/whatsapp/send', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ jid, text }),
    }),

  // Conversations (AI Management)
  getConversations: (token, status) => {
    const qs = status ? `?status=${status}` : ''
    return request(`/conversations${qs}`, { headers: authHeaders(token) })
  },

  getConversation: (token, id) =>
    request(`/conversations/${id}`, { headers: authHeaders(token) }),

  updateConversationStatus: (token, id, status) =>
    request(`/conversations/${id}/status`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ status }),
    }),

  getConversationStats: (token) =>
    request('/conversations/stats', { headers: authHeaders(token) }),

  deleteConversation: (token, id) =>
    request(`/conversations/${id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),

  clearClosedConversations: (token) =>
    request('/conversations/closed', {
      method: 'DELETE',
      headers: authHeaders(token),
    }),

  sendConversationReply: (token, id, instruction) =>
    request(`/conversations/${id}/reply`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ instruction }),
    }),

  aiInstruct: (token, message) =>
    request('/conversations/instruct', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ message }),
    }),

  // Settings
  getSettings: (token) =>
    request('/settings', { headers: authHeaders(token) }),

  updateSettings: (token, updates) =>
    request('/settings', {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify(updates),
    }),

  // Agent (AI outbound)
  getAgentThreads: (token) =>
    request('/agent/threads', { headers: authHeaders(token) }),

  createAgentThread: (token) =>
    request('/agent/threads', { method: 'POST', headers: authHeaders(token) }),

  updateAgentThreadContext: (token, threadId, campaignContext) =>
    request(`/agent/threads/${threadId}/context`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ campaign_context: campaignContext }),
    }),

  getAgentThread: (token, id) =>
    request(`/agent/threads/${id}`, { headers: authHeaders(token) }),

  deleteAgentThread: (token, id) =>
    request(`/agent/threads/${id}`, { method: 'DELETE', headers: authHeaders(token) }),

  sendAgentMessage: (token, threadId, message) =>
    request(`/agent/threads/${threadId}/message`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ message }),
    }),

  executeAgentThread: (token, threadId, onProgress, messageTemplate) => {
    return new Promise((resolve, reject) => {
      const url = `${BASE}/agent/threads/${threadId}/execute`
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message_template: messageTemplate || '' }),
      })
        .then((res) => {
          if (!res.ok) return res.json().then((d) => reject(new Error(d.error || 'Execute failed')))
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          function read() {
            reader.read().then(({ done, value }) => {
              if (done) return resolve()
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop()
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const event = JSON.parse(line.slice(6))
                    onProgress?.(event)
                  } catch {}
                }
              }
              read()
            })
          }
          read()
        })
        .catch(reject)
    })
  },
}
