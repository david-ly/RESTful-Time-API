import dotenv from 'dotenv'
import express from 'express'
import { connectMongo, connectRedis } from './dbs/index.js'
import router from './routes/router.js'


dotenv.config()

const {PORT} = process.env
if (!PORT) {
  throw new Error('PORT is not defined in environment variables')
}

await connectMongo()
await connectRedis()

const app = express()
app.use(express.json())
app.use(express.urlencoded({extended: true}))
app.use('/time', router)

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
