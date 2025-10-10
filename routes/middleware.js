import { DateTime } from 'luxon'
import { isValidObjectId } from 'mongoose'

const REVIVE_FIELDS = ['created', 'time', 'updated']

function convertTZ(entry, zone) {
  const tz = decodeURIComponent(zone)
  const local = DateTime.fromJSDate(entry.time).setZone(tz)
  if (!local.isValid) return [null, {error: `Invalid TZ ${tz}`}]
  return [{...entry, time: local.toISO()}]
}

function reviveDate(key, val) {
  return REVIVE_FIELDS.includes(key) ? new Date(val) : val
}

function validateId(req, res, next) {
  const {id} = req.params
  if (!id || !isValidObjectId(id)) {
    return res.status(400).json({error: 'Invalid ID format'})
  }
  return next()
}

export { convertTZ, reviveDate, validateId }
