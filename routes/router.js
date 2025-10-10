import express from 'express'
import { DateTime } from 'luxon'
import { TimeEntry } from '../dbs/mongo.js'
import { redis } from '../dbs/redis.js'
import { convertTZ, reviveDate, validateId } from './middleware.js'

const CACHE_TTL_SEC = 300
const ERR_404_MSG = (id) => `Time entry [${id}] not found`
const FIND_UPD_OPTS = {new: true, runValidators: true}

const router = express.Router({ mergeParams: true })
router.get('/', getAllTimeEntries)
router.get('/:id', validateId, getTimeEntryByID)
router.post('/', createTimeEntry)
router.put('/:id', validateId, updateTimeEntry)
router.delete('/:id', validateId, deleteTimeEntry)

async function getAllTimeEntries(_, res) {
  try {
    const entries = await TimeEntry.find().lean()
    console.debug('All (Mongo) entries returned')
    return res.json(entries)
  } catch (err) {
    return res.status(500).json({error: err.message})
  }
}

async function getTimeEntryByID(req, res) {
  try {
    const {id} = req.params
    const {zone} = req.query
    console.debug(`GET /time/${id}?zone=${zone || 'none'}`)

    const entry = await retrieveEntry(id)
    if (!entry) return res.status(404).json({error: ERR_404_MSG(id)})

    await refreshEntry(entry)
    if (!zone) return res.json(entry) // skip TZ conversion

    const [result, err] = convertTZ(entry, zone)
    if (err) return res.status(400).json(err)
    console.debug(`Converted entry [${id}] returned, TZ: ${zone}`)
    return res.json(result)
  } catch (err) {
    return res.status(500).json({error: err.message})
  }
}

async function createTimeEntry(req, res) {
  try {
    const {body} = req

    const new_entry = new TimeEntry(body)
    const saved_ent = (await new_entry.save()).toObject()
    await refreshEntry(saved_ent)
    console.debug(`Time entry [${saved_ent._id.toString()}] successfully saved`)
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
    if (UTC) { // overwrite `time` prop with Date in UTC before saving
      const utc = DateTime.fromISO(body.time, {zone: 'utc'})
      body.time = utc.toJSDate()
    }

    const updated = await TimeEntry.findByIdAndUpdate(id, body, FIND_UPD_OPTS)
    if (!updated) return res.status(404).json({error: ERR_404_MSG(id)})

    const upd_obj = updated.toObject()
    await refreshEntry(upd_obj)
    console.debug(`Time entry [${upd_obj._id.toString()}] successfully updated`)
    return res.json(upd_obj)
  } catch (err) {
    return res.status(400).json({error: err.message})
  }
}

async function deleteTimeEntry(req, res) {
  const {id} = req.params

  try {
    const deleted = await TimeEntry.findByIdAndDelete(id)
    if (!deleted) return res.status(404).json({error: ERR_404_MSG(id)})

    const cache_key = `cache:${id}`
    await redis.del(cache_key)
    return res.json({message: `Time entry [${id}] successfully deleted`})
  } catch (err) {
    return res.status(500).json({error: err.message})
  }
}

async function refreshEntry(entry) {
  const cache_key = `cache:${entry._id.toString()}`
  return redis.setEx(cache_key, CACHE_TTL_SEC, JSON.stringify(entry))
}

async function retrieveEntry(id) {
  const cached = await redis.get(`cache:${id}`)
  if (cached) {
    console.debug(`Cached entry [${id}] retrieved`)
    return JSON.parse(cached, reviveDate)
  }

  const entry = await TimeEntry.findById(id).lean()
  if (!entry) return null
  console.debug(`Mongo entry [${id}] retrieved`)
  return entry
}

export default router
