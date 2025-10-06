import express from 'express'
import { DateTime } from 'luxon'
import { TimeEntry } from '../dbs/mongo.js'
import { validateId } from './middleware.js'

const FIND_UPD_OPTS = {new: true, runValidators: true}

const router = express.Router({ mergeParams: true })
router.get('/', getAllTimeEntries)
router.get('/:id', validateId, getTimeEntryByID)
router.post('/', createTimeEntry)
router.put('/:id', validateId, updateTimeEntry)
router.delete('/:id', validateId, deleteTimeEntry)

async function getAllTimeEntries(_, res) {
  try {
    const entries = await TimeEntry.find()
    return res.json(entries)
  } catch (err) {
    return res.status(500).json({error: err.message})
  }
}

async function getTimeEntryByID(req, res) {
  try {
    const {id} = req.params
    const {zone} = req.query

    const entry = await TimeEntry.findById(id)
    if (!entry) return res.status(404).json({error: 'Time entry not found'})
    if (!zone) return res.json(entry)

    const tz = decodeURIComponent(zone)
    const local = DateTime.fromJSDate(entry.time).setZone(tz)
    if (!local.isValid) return res.status(400).json({error: `Invalid TZ ${tz}`})
    return res.json({...entry.toObject(), time: local.toISO()})
  } catch (err) {
    return res.status(500).json({error: err.message})
  }
}

async function createTimeEntry(req, res) {
  try {
    const {body} = req

    const new_entry = new TimeEntry(body)
    const saved_ent = await new_entry.save()
    return res.status(201).json(saved_ent)
  } catch (err) {
    return res.status(400).json({error: err.message})
  }
}

async function updateTimeEntry(req, res) {
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
}

async function deleteTimeEntry(req, res) {
  const {id} = req.params

  try {
    const deleted = await TimeEntry.findByIdAndDelete(id)
    if (!deleted) return res.status(404).json({error: 'Time entry not found'})
    return res.json({message: 'Time entry deleted successfully'})
  } catch (err) {
    return res.status(500).json({error: err.message})
  }
}

export default router
