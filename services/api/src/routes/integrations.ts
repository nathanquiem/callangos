import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { db } from '../db/client.js'
import { demoIds } from '../db/seed.js'
import { deliverWebhook, webhookSecret } from '../services/webhooks.js'
import { requireAdmin } from './auth.js'

const webhookEvents = z.enum(['call.created', 'call.updated', 'call.completed', 'recording.available'])

const createTokenSchema = z.object({
  name: z.string().trim().min(2).max(120),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
})

const createWebhookSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().url().max(2000),
  events: z.array(webhookEvents).min(1),
})

const updateWebhookSchema = createWebhookSchema.partial().extend({
  active: z.boolean().optional(),
})

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function authenticateApiToken(request: FastifyRequest) {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice(7)
  const result = await db.query<{ id: string; name: string; created_by: string | null }>(
    `SELECT id, name, created_by FROM api_tokens
     WHERE token_hash = $1
       AND active = true
       AND (expires_at IS NULL OR expires_at > now())`,
    [tokenHash(token)],
  )
  if (!result.rows[0]) return null
  await db.query('UPDATE api_tokens SET last_used_at = now() WHERE id = $1', [result.rows[0].id])
  return result.rows[0]
}

export async function integrationsRoutes(app: FastifyInstance) {
  app.get('/api/v1/api-tokens', { preHandler: requireAdmin }, async () => {
    const result = await db.query(
      `SELECT id, name, token_prefix, active, expires_at, last_used_at, created_at
       FROM api_tokens ORDER BY created_at DESC`,
    )
    return { data: result.rows }
  })

  app.post('/api/v1/api-tokens', { preHandler: requireAdmin }, async (request, reply) => {
    const body = createTokenSchema.parse(request.body)
    const token = `clg_live_${randomBytes(24).toString('base64url')}`
    const result = await db.query(
      `INSERT INTO api_tokens (
         id, name, token_prefix, token_hash, created_by, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, token_prefix, active, expires_at, last_used_at, created_at`,
      [randomUUID(), body.name, token.slice(0, 13), tokenHash(token), demoIds.user, body.expiresAt ?? null],
    )
    return reply.code(201).send({ data: { ...(result.rows[0] as Record<string, unknown>), token } })
  })

  app.delete('/api/v1/api-tokens/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const result = await db.query(
      `DELETE FROM api_tokens WHERE id = $1 RETURNING id`,
      [id],
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'token_not_found' })
    return reply.code(204).send()
  })

  app.get('/api/v1/external/calls', async (request, reply) => {
    const token = await authenticateApiToken(request)
    if (!token) return reply.code(401).send({ error: 'invalid_api_token' })
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(request.query)
    const calls = await db.query(
      `SELECT id, direction, remote_number_e164, remote_number_display, status,
              started_at, answered_at, ended_at, talk_duration_seconds
       FROM calls ORDER BY started_at DESC LIMIT $1`,
      [query.limit],
    )
    return { data: calls.rows, meta: { authenticatedAs: token.name } }
  })

  app.get('/api/v1/webhooks', { preHandler: requireAdmin }, async () => {
    const result = await db.query(
      `SELECT webhooks.*,
         (SELECT status FROM webhook_deliveries WHERE webhook_id = webhooks.id ORDER BY created_at DESC LIMIT 1) AS last_status,
         (SELECT http_status FROM webhook_deliveries WHERE webhook_id = webhooks.id ORDER BY created_at DESC LIMIT 1) AS last_http_status
       FROM webhooks ORDER BY created_at DESC`,
    )
    return { data: result.rows }
  })

  app.post('/api/v1/webhooks', { preHandler: requireAdmin }, async (request, reply) => {
    const body = createWebhookSchema.parse(request.body)
    const id = randomUUID()
    const result = await db.query(
      `INSERT INTO webhooks (id, name, url, events, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, body.name, body.url, body.events, demoIds.user],
    )
    return reply.code(201).send({ data: { ...(result.rows[0] as Record<string, unknown>), signingSecret: webhookSecret(id) } })
  })

  app.patch('/api/v1/webhooks/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = updateWebhookSchema.parse(request.body)
    const result = await db.query(
      `UPDATE webhooks
       SET name = COALESCE($2, name),
           url = COALESCE($3, url),
           events = COALESCE($4, events),
           active = COALESCE($5, active),
           updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, body.name ?? null, body.url ?? null, body.events ?? null, body.active ?? null],
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'webhook_not_found' })
    return { data: result.rows[0] }
  })

  app.delete('/api/v1/webhooks/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const result = await db.query('DELETE FROM webhooks WHERE id = $1 RETURNING id', [id])
    if (!result.rows[0]) return reply.code(404).send({ error: 'webhook_not_found' })
    return reply.code(204).send()
  })

  app.post('/api/v1/webhooks/:id/test', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const webhook = await db.query<{ id: string; url: string }>('SELECT id, url FROM webhooks WHERE id = $1', [id])
    if (!webhook.rows[0]) return reply.code(404).send({ error: 'webhook_not_found' })
    const result = await deliverWebhook(webhook.rows[0], 'webhook.test', { message: 'Teste do Callangos' })
    return { data: result }
  })

  app.get('/api/v1/webhook-deliveries', { preHandler: requireAdmin }, async () => {
    const result = await db.query(
      `SELECT webhook_deliveries.*, webhooks.name AS webhook_name
       FROM webhook_deliveries
       INNER JOIN webhooks ON webhooks.id = webhook_deliveries.webhook_id
       ORDER BY webhook_deliveries.created_at DESC LIMIT 100`,
    )
    return { data: result.rows }
  })
}
