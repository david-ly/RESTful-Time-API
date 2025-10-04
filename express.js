import dotenv from 'dotenv'
import express from 'express'
import {DateTime} from 'luxon'
import mongoose, {isValidObjectId} from 'mongoose'
import { createClient } from 'redis'

dotenv.config()
const {MONGODB_URI, PORT, REDIS_URL} = process.env

if (!REDIS_URL) {
  throw new Error('REDIS_URL is not defined in environment variables')
}

const client = createClient({url: REDIS_URL})
client.on('error', (err) => console.error('Redis Client Error:', err))
client.on('connect', () => console.log('Connected to Redis'))
await client.connect()

// Setup MongoDB connection
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in environment variables')
}
const FIND_UPD_OPTS = {new: true, runValidators: true}

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err))

// Define `TimeEntry` Mongoose model/schema
const time_schema = new mongoose.Schema({
  description: {type: String}
, time: {type: Date}
, created: {type: Date, default: Date.now}
, updated: {type: Date, default: Date.now}
})
time_schema.pre('findOneAndUpdate', function (next) {
  this.set({updated: Date.now()})
  return next()
})
const TimeEntry = mongoose.model('TimeEntry', time_schema)

// Initialize `express` app & routes
const app = express()
app.use(express.json())
app.use(express.urlencoded({extended: true}))

app.get('/time', async (_, res) => {
  try {
    const entries = await TimeEntry.find()
    return res.json(entries)
  } catch (err) {
    return res.status(500).json({error: err.message})
  }
})

app.get('/time/:id', validateId, async (req, res) => {
  try {
    const {id} = req.params
    const {zone} = req.query
    const key = `cache:${id}`

    const cached = await client.get(key)
    if (cached) {
      console.log(`Cache hit: ${id}`)
      if (!zone) return res.json(JSON.parse(cached))

      const [entry, err] = convertTZ(JSON.parse(cached), zone)
      if (err) return res.status(400).json(err)
      return res.json(entry)
    }

    const entry = await TimeEntry.findById(id)
    if (!entry) return res.status(404).json({error: 'Time entry not found'})
    client.setEx(key, 300, JSON.stringify(entry)) // Cache the original entry and &-
    if (!zone) return res.json(entry)

    // -& convert to given TZ (on server) if provided as query param
    return res.json(convertTZ(entry, zone))
  } catch (err) {
    return res.status(500).json({error: err.message})
  }
})

app.post('/time', async (req, res) => {
  try {
    const {body} = req

    const new_entry = new TimeEntry(body)
    const saved_ent = await new_entry.save()
    return res.status(201).json(saved_ent)
  } catch (err) {
    return res.status(400).json({error: err.message})
  }
})

app.put('/time/:id', validateId, async (req, res) => {
  try {
    const {body} = req
    const {id} = req.params
    const {UTC} = req.query
    if (UTC) {
      const utc = DateTime.fromISO(body.time, {zone: 'utc'})
      body.time = utc.toJSDate()
    }

    const updated = await TimeEntry.findByIdAndUpdate(id, body, FIND_UPD_OPTS)
    if (!updated) return res.status(404).json({error: 'Time entry not found'})
    return res.json(updated)
  } catch (err) {
    return res.status(400).json({error: err.message})
  }
})

app.delete('/time/:id', validateId, async (req, res) => {
  try {
    const {id} = req.params

    const deleted = await TimeEntry.findByIdAndDelete(id)
    if (!deleted) return res.status(404).json({error: 'Time entry not found'})
    return res.json({message: 'Time entry deleted successfully'})
  } catch (err) {
    return res.status(500).json({error: err.message})
  }
})

app.get('/', (_, res) => {
  return res.json({message: 'pong', ts: new Date().getTime()})
})

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err?.stack || err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason)
  process.exit(1)
})

function validateId(req, res, next) {
  const {id} = req.params
  if (!id || !isValidObjectId(id)) {
    return res.status(400).json({error: 'Invalid ID format'})
  }
  return next()
}

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`)
  server.close(err => {
    if (err) {
      console.error('Error closing server:', err)
      process.exit(1)
    }

    console.log('✅ All connections closed. Exiting.')
    process.exit(0)
  })

  setTimeout(() => {
    console.warn('⏱️ Force shutdown: took too long.')
    process.exit(1)
  }, 10000).unref()
}
