import { createClient } from 'redis'

let redis = null

async function connectRedis() {
  if (redis) return redis

  const {REDIS_URL} = process.env
  if (!REDIS_URL) {
    throw new Error('REDIS_URL is not defined in environment variables')
  }

  const client = createClient({url: REDIS_URL})
  client.on('error', (err) => console.error('Redis Client Error:', err))
  client.on('connect', () => console.log('Connected to Redis'))

  try {
    await client.connect()
    redis = client
  } catch (error) {
    console.error('Failed to connect to Redis:', error)
    throw error
  }
}

export { connectRedis, redis }
