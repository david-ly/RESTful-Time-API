import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { DateTime } from 'luxon'

dotenv.config()

const { MONGODB_URI } = process.env

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in environment variables')
}

// Define the same schema as in express.js
const time_schema = new mongoose.Schema({
  description: { type: String },
  time: { type: Date },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
})

const TimeEntry = mongoose.model('TimeEntry', time_schema)

// Sample time entries
const timeEntries = [
  {
    description: "Morning Standup Meeting",
    time: DateTime.now().set({ hour: 9, minute: 0 }).toJSDate()
  },
  {
    description: "Lunch Break",
    time: DateTime.now().set({ hour: 12, minute: 30 }).toJSDate()
  },
  {
    description: "Project Review",
    time: DateTime.now().set({ hour: 14, minute: 0 }).toJSDate()
  },
  {
    description: "Team Sync",
    time: DateTime.now().set({ hour: 16, minute: 0 }).toJSDate()
  },
  {
    description: "Code Review Session",
    time: DateTime.now().plus({ days: 1 }).set({ hour: 10, minute: 0 }).toJSDate()
  },
  {
    description: "Client Meeting",
    time: DateTime.now().plus({ days: 1 }).set({ hour: 13, minute: 0 }).toJSDate()
  },
  {
    description: "Sprint Planning",
    time: DateTime.now().plus({ days: 2 }).set({ hour: 11, minute: 0 }).toJSDate()
  }
]

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')

    // Insert new entries
    const result = await TimeEntry.insertMany(timeEntries)
    console.log(`Successfully inserted ${result.length} time entries`)

    // Log the inserted entries
    console.log('\nInserted entries:')
    result.forEach(entry => {
      console.log(`- ${entry.description}: ${entry.time}`)
    })

  } catch (err) {
    console.error('Error seeding database:', err)
  } finally {
    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
  }
}

seed() 