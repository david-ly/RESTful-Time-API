import mongoose from 'mongoose'

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

async function connectMongo() {
  const {MONGODB_URI} = process.env
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in environment variables')
  }

  try {
    await mongoose.connect(MONGODB_URI)
    console.log(`Connected to Mongo @ ${MONGODB_URI}`)
  } catch (err) {
    console.error(`Mongo connection failed @ ${MONGODB_URI}:`, err)
  }
}

export { connectMongo, TimeEntry }
