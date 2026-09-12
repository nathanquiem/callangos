import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { config } from './config.js'
import { db } from './db/client.js'
import { migrate } from './db/migrate.js'
import { seed } from './db/seed.js'
import { authRoutes } from './routes/auth.js'
import { callsRoutes } from './routes/calls.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { integrationsRoutes } from './routes/integrations.js'
import { recordingsRoutes } from './routes/recordings.js'
import { settingsRoutes } from './routes/settings.js'
import { telephonyRoutes } from './routes/telephony.js'
import { usersRoutes } from './routes/users.js'

const app = Fastify({
  trustProxy: true,
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
  },
})

const allowedOrigins = config.APP_ORIGIN.split(',').map((origin) => origin.trim())

await app.register(cors, {
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  origin(origin, callback) {
    const isAllowed =
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.startsWith('chrome-extension://')

    callback(isAllowed ? null : new Error('Origin not allowed'), isAllowed)
  },
})

await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
})

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'validation_error',
      details: error.issues,
    })
  }

  app.log.error(error)
  return reply.code(500).send({ error: 'internal_error' })
})

app.get('/health', { config: { rateLimit: false } }, async () => ({
  status: 'ok',
  database: db.kind,
}))

await app.register(authRoutes)
await app.register(callsRoutes)
await app.register(dashboardRoutes)
await app.register(recordingsRoutes)
await app.register(telephonyRoutes)
await app.register(settingsRoutes)
await app.register(usersRoutes)
await app.register(integrationsRoutes)

async function start() {
  await migrate()
  await seed()
  await app.listen({ host: config.HOST, port: config.PORT })
}

async function shutdown() {
  await app.close()
  await db.close()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await start()
