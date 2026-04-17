import { MongoClient } from 'mongodb'
import { MONGO_DB_NAME, MONGO_URI } from './config.js'

let mongoClient
let mongoDb

export async function getMongoDb() {
  if (mongoDb) return mongoDb

  if (!MONGO_URI) {
    throw new Error('MONGO_URI is required')
  }

  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI)
    await mongoClient.connect()
  }

  mongoDb = mongoClient.db(MONGO_DB_NAME)
  return mongoDb
}

export function isMongoConfigured() {
  return Boolean(MONGO_URI)
}

export async function closeMongoClient() {
  if (mongoClient) {
    await mongoClient.close()
    mongoClient = null
    mongoDb = null
  }
}
