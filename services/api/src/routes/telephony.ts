import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/client.js'
import { demoIds } from '../db/seed.js'
import { formatBrazilianPhone, normalizeBrazilianPhone } from '../domain/phone.js'
import { requireAdmin, requireAuth } from './auth.js'

const updateTelephonySchema = z.object({
  status: z.enum(['pending', 'connected', 'degraded', 'offline', 'error']).optional(),
  integrationMode: z.enum(['external_protocol', 'api', 'webhook', 'sip']).optional(),
  publicConfig: z
    .object({
      portalUrl: z.string().url().optional(),
      plan: z.string().max(120).optional(),
      extension: z.string().max(32).optional(),
      number: z.string().max(32).optional(),
      registrarServer: z.string().max(240).optional(),
      sipPort: z.number().int().min(1).max(65535).optional(),
      transport: z.enum(['UDP', 'TCP', 'TLS']).optional(),
      outboundPrefix: z.string().max(12).optional(),
      dialFormat: z.enum(['e164_digits', 'e164_plus', 'national']).optional(),
      protocolHandler: z.enum(['tel', 'callto', 'sip']).optional(),
      cdrMode: z.enum(['manual', 'api', 'webhook']).optional(),
      cdrEndpoint: z.union([z.literal(''), z.string().url()]).optional(),
      recordingMode: z.enum(['provider', 'disabled']).optional(),
    })
    .optional(),
  extension: z.object({
    externalExtension: z.string().trim().min(1).max(32),
    label: z.string().trim().min(1).max(120).default('Ramal principal'),
    dialerMode: z.enum(['external_protocol', 'webphone', 'api']).default('external_protocol'),
    active: z.boolean().default(true),
  }).optional(),
})

const createNumberSchema = z.object({
  number: z.string().trim().min(10).max(24),
  label: z.string().trim().min(1).max(120).default('Principal'),
})

const updateNumberSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
})

export async function telephonyRoutes(app: FastifyInstance) {
  app.get('/api/v1/telephony', { preHandler: requireAuth }, async () => {
    const provider = await db.query(
      `SELECT * FROM telephony_providers WHERE id = $1`,
      [demoIds.provider],
    )
    const extensions = await db.query(
      `SELECT id, external_extension, label, dialer_mode, active
       FROM extensions
       WHERE provider_id = $1
       ORDER BY created_at`,
      [demoIds.provider],
    )
    const numbers = await db.query(
      `SELECT id, e164, display_number, label, active
       FROM phone_numbers
       WHERE provider_id = $1
       ORDER BY created_at`,
      [demoIds.provider],
    )

    return {
      data: {
        provider: provider.rows[0],
        extensions: extensions.rows,
        numbers: numbers.rows,
      },
    }
  })

  app.patch('/api/v1/telephony', { preHandler: requireAdmin }, async (request) => {
    const body = updateTelephonySchema.parse(request.body)
    const current = await db.query<{ public_config: Record<string, unknown> }>(
      'SELECT public_config FROM telephony_providers WHERE id = $1',
      [demoIds.provider],
    )
    const publicConfig = {
      ...current.rows[0]?.public_config,
      ...body.publicConfig,
    }

    const result = await db.query(
      `UPDATE telephony_providers
       SET status = COALESCE($2, status),
           integration_mode = COALESCE($3, integration_mode),
           public_config = $4::jsonb,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        demoIds.provider,
        body.status ?? null,
        body.integrationMode ?? null,
        JSON.stringify(publicConfig),
      ],
    )

    if (body.extension) {
      await db.query(
        `UPDATE extensions
         SET external_extension = $2,
             label = $3,
             dialer_mode = $4,
             active = $5,
             updated_at = now()
         WHERE id = $1`,
        [demoIds.extension, body.extension.externalExtension, body.extension.label, body.extension.dialerMode, body.extension.active],
      )
    }

    return { data: result.rows[0] }
  })

  app.delete('/api/v1/telephony', { preHandler: requireAdmin }, async (_request, reply) => {
    await db.query('DELETE FROM phone_numbers WHERE provider_id = $1', [demoIds.provider])
    await db.query(
      `UPDATE telephony_providers
       SET status = 'pending',
           integration_mode = 'external_protocol',
           public_config = $2::jsonb,
           last_sync_at = NULL,
           updated_at = now()
       WHERE id = $1`,
      [
        demoIds.provider,
        JSON.stringify({
          portalUrl: 'https://brdid.com.br/',
          plan: 'PABX Virtual',
          extension: '2001',
          dialFormat: 'e164_digits',
          protocolHandler: 'tel',
          cdrMode: 'manual',
          recordingMode: 'provider',
        }),
      ],
    )
    await db.query(
      `UPDATE extensions
       SET external_extension = '2001',
           label = 'Ramal principal',
           dialer_mode = 'external_protocol',
           active = true,
           updated_at = now()
       WHERE id = $1`,
      [demoIds.extension],
    )
    return reply.code(204).send()
  })

  app.post('/api/v1/telephony/numbers', { preHandler: requireAdmin }, async (request, reply) => {
    const body = createNumberSchema.parse(request.body)
    const e164 = normalizeBrazilianPhone(body.number)
    const result = await db.query(
      `INSERT INTO phone_numbers (
         id, provider_id, e164, display_number, label
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [randomUUID(), demoIds.provider, e164, formatBrazilianPhone(e164), body.label],
    )
    return reply.code(201).send({ data: result.rows[0] })
  })

  app.patch('/api/v1/telephony/numbers/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = updateNumberSchema.parse(request.body)
    const result = await db.query(
      `UPDATE phone_numbers
       SET label = COALESCE($2, label),
           active = COALESCE($3, active),
           updated_at = now()
       WHERE id = $1 AND provider_id = $4
       RETURNING *`,
      [id, body.label ?? null, body.active ?? null, demoIds.provider],
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'phone_number_not_found' })
    return { data: result.rows[0] }
  })
}
