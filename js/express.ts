'use strict'

import dotenv from 'dotenv'
import express from 'express'
import mongoose from 'mongoose'

dotenv.config()

const {MONGODB_URI, PORT} = process.env
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in environment variables')
}

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/time', getAllTimeEntries)
app.get('/time/:id', getTimeEntryById)
app.post('/time', createTimeEntry)
app.put('/time/:id', updateTimeEntry)
app.delete('/time/:id', deleteTimeEntry)
app.get('/', healthCheck)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err))

const time_schema = new mongoose.Schema({
    description: { type: String }
  , time: { type: Date }
  , created: { type: Date, default: Date.now }
  , updated: { type: Date, default: Date.now }
})
time_schema.pre('findOneAndUpdate', function(next) {
  this.set({ updated: Date.now() })
  next()
})
const TimeEntry = mongoose.model('TimeEntry', time_schema)

async function getAllTimeEntries(_: any, res: express.Response) {
  try {
    const entries = await TimeEntry.find()
    res.json(entries)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error })
  }
}

async function getTimeEntryById(req: express.Request, res: express.Response) {
  try {
    const entry = await TimeEntry.findById(req.params.id)
    if (!entry) {
      res.status(404).json({ error: 'Time entry not found' })
      return
    }
    res.json(entry)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error })
  }
}

async function createTimeEntry(req: express.Request, res: express.Response) {
  try {
    const new_entry = new TimeEntry(req.body)
    const saved_ent = await new_entry.save()
    res.status(201).json(saved_ent)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error })
  }
}

async function updateTimeEntry(req: express.Request, res: express.Response) {
  try {
    const updated = await TimeEntry.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    if (!updated) {
      res.status(404).json({ error: 'Time entry not found' })
      return
    }
    res.json(updated)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error })
  }
}

async function deleteTimeEntry(req: express.Request, res: express.Response) {
  try {
    const deleted = await TimeEntry.findByIdAndDelete(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'Time entry not found' })
      return
    }
    res.json({ message: 'Time entry deleted successfully' })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error })
  }
}

function healthCheck(_: any, res: express.Response) {
  res.json({ message: 'pong', ts: new Date().getTime() })
}
