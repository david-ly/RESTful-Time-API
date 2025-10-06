import { isValidObjectId } from 'mongoose'

export function validateId(req, res, next) {
  const {id} = req.params
  if (!id || !isValidObjectId(id)) {
    return res.status(400).json({error: 'Invalid ID format'})
  }
  return next()
}
