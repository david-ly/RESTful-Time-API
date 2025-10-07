import { DateTime } from 'luxon'
import { isValidObjectId } from 'mongoose'

function validateId(req, res, next) {
  const {id} = req.params
  if (!id || !isValidObjectId(id)) {
    return res.status(400).json({error: 'Invalid ID format'})
  }
  return next()
}

function convertTZ(entry, zone) {
  const tz = decodeURIComponent(zone)
  const local = DateTime.fromJSDate(entry.time).setZone(tz)
  if (!local.isValid) return [400, {error: `Invalid TZ ${tz}`}] // TODO: improve error handling here
  return [{...entry.toObject(), time: local.toISO()}]
}

export { validateId, convertTZ }
