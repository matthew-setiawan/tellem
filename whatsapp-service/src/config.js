import path from 'path'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const backendEnvPath = path.resolve(process.cwd(), '../backend/.env')
if (fs.existsSync(backendEnvPath)) {
  const parsed = dotenv.parse(fs.readFileSync(backendEnvPath))
  if (!process.env.MONGO_URI && parsed.MONGO_URI) process.env.MONGO_URI = parsed.MONGO_URI
  if (!process.env.MONGO_DB_NAME && parsed.MONGO_DB_NAME) process.env.MONGO_DB_NAME = parsed.MONGO_DB_NAME
}

export const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:3000']
export const NODE_ENV = process.env.NODE_ENV || 'production'
export const DEBUG_MODE = parseBoolEnv('WA_DEBUG_MODE', NODE_ENV === 'development')
export const LOG_LEVEL = process.env.LOG_LEVEL || (DEBUG_MODE ? 'debug' : 'warn')
export const SOCKET_IO_PATH = process.env.SOCKET_IO_PATH || '/socket.io'
export const MONGO_URI = process.env.MONGO_URI || ''
export const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'tellem_ai'

export function parseCsvEnv(name, fallback = []) {
  const raw = process.env[name]
  if (!raw) return fallback
  return raw.split(',').map((v) => v.trim()).filter(Boolean)
}

export function parseBoolEnv(name, fallback = false) {
  const raw = process.env[name]
  if (raw === undefined || raw === null || raw === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase())
}

export function parseIntEnv(name, fallback = 0) {
  const raw = process.env[name]
  if (raw === undefined || raw === null || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export const CORS_ORIGINS = parseCsvEnv('CORS_ORIGINS', DEFAULT_CORS_ORIGINS)
