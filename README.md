# Tellem

AI-powered outbound outreach platform. Search for contacts, add phone numbers, set objectives, and execute personalized WhatsApp campaigns at scale.

## Architecture

```
tellem-ai/
├── backend/          # Flask API (Python)
├── frontend/         # React + Vite SPA
└── whatsapp-service/ # Node.js + Baileys WhatsApp bridge
```

## Quick Start

You need **3 terminals** running simultaneously:

### 1. Backend (Flask)

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # Edit with your keys
python app.py
```

Runs on `http://localhost:5000`

### 2. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`

### 3. WhatsApp Service

```bash
cd whatsapp-service
npm install
npm run dev
```

Runs on `http://localhost:3001`

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `MONGO_DB_NAME` | Database name (default: `tellem_ai`) |
| `PERPLEXITY_API_KEY` | Perplexity API key for AI search |
| `OPENAI_API_KEY` | OpenAI key (for message generation) |
| `JWT_SECRET` | Secret for JWT tokens |
| `WA_SERVICE_URL` | WhatsApp service URL (default: `http://localhost:3001`) |

## Features

- **AI-powered contact search** — Find people by role, company, criteria via Perplexity
- **Per-number targeting** — Add individual phone numbers with custom objectives
- **Campaign management** — Create campaigns, add contacts, set objectives
- **WhatsApp outreach** — AI generates personalized messages, sends via WhatsApp
- **CSV import** — Bulk import contacts from CSV files
- **Real-time chat** — View and respond to WhatsApp conversations
- **Campaign execution** — SSE-powered real-time progress tracking
