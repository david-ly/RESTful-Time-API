import dotenv from 'dotenv'
import express from 'express'
import { DateTime } from 'luxon'
import mongoose from 'mongoose'

dotenv.config()

const { MONGODB_URI, PORT } = process.env
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in environment variables')
}

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err))

const time_schema = new mongoose.Schema({
  description: { type: String }
  , time: { type: Date }
  , created: { type: Date, default: Date.now }
  , updated: { type: Date, default: Date.now }
})
time_schema.pre('findOneAndUpdate', function (next) {
  this.set({ updated: Date.now() })
  next()
})
const TimeEntry = mongoose.model('TimeEntry', time_schema)

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/time', async (_, res) => {
  try {
    const entries = await TimeEntry.find()
    return res.json(entries)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.get('/time/:id', async (req, res) => {
  try {
    const entry = await TimeEntry.findById(req.params.id)
    if (!entry) return res.status(404).json({ error: 'Time entry not found' })
    const {zone} = req.query
    if (!zone) return res.json(entry)

    const tz = decodeURIComponent(zone)
    const local = DateTime.fromJSDate(entry.time).setZone(tz)
    if (!local.isValid) return res.status(400).json({error: `Invalid TZ ${tz}`})
    return res.json({...entry.toObject(), time: local.toISO()})
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.post('/time', async (req, res) => {
  try {
    const new_entry = new TimeEntry(req.body)
    const saved_ent = await new_entry.save()
    return res.status(201).json(saved_ent)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

app.put('/time/:id', async (req, res) => {
  try {
    const updated = await TimeEntry.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    if (!updated) return res.status(404).json({ error: 'Time entry not found' })
    return res.json(updated)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

app.delete('/time/:id', async (req, res) => {
  try {
    const deleted = await TimeEntry.findByIdAndDelete(req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Time entry not found' })
    return res.json({ message: 'Time entry deleted successfully' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.get('/', (_, res) => {
  res.json({ message: 'pong', ts: new Date().getTime() })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
