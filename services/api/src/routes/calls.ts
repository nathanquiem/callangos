import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/client.js'
import { buildCallWhere, callFilterSchema } from '../domain/call-filters.js'
import { demoIds } from '../db/seed.js'
import { formatBrazilianPhone, normalizeBrazilianPhone } from '../domain/phone.js'
import { dispatchWebhooks } from '../services/webhooks.js'
import { requireAuth } from './auth.js'

const createCallSchema = z.object({
  phone: z.string().min(10).max(24),
  source: z.enum(['app', 'extension', 'api']).default('extension'),
  direction: z.enum(['outbound', 'inbound']).default('outbound'),
  userId: z.string().uuid().optional(),
  phoneNumberId: z.string().uuid().optional(),
})

const updateCallSchema = z.object({
  status: z.enum([
    'handed_off',
    'ringing',
    'answered',
    'completed',
    'missed',
    'busy',
    'voicemail',
    'failed',
    'canceled',
  ]),
  sessionDurationSeconds: z.number().int().nonnegative().optional(),
  talkDurationSeconds: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).nullable().optional(),
  dataSource: z.enum(['manual', 'provider', 'mixed']).default('manual'),
})

type DialerPublicConfig = {
  protocolHandler?: 'tel' | 'callto' | 'sip'
  outboundPrefix?: string
  dialFormat?: 'e164_digits' | 'e164_plus' | 'national'
}

function formatDialTarget(remoteNumber: string, config: DialerPublicConfig) {
  const digits = remoteNumber.replace(/\D/g, '')
  const base = config.dialFormat === 'e164_plus'
    ? `+${digits}`
    : config.dialFormat === 'national'
      ? digits.replace(/^55/, '')
      : digits

  return `${config.outboundPrefix?.trim() ?? ''}${base}`
}

export async function callsRoutes(app: FastifyInstance) {
  app.get('/api/v1/calls', { preHandler: requireAuth }, async (request) => {
    const query = z
      .intersection(callFilterSchema, z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }))
      .parse(request.query)
    const { clause, params } = buildCallWhere(query, 'calls')
    params.push(query.limit)

    const result = await db.query(
      `SELECT
         calls.*,
         users.name AS user_name,
         users.email AS user_email,
         phone_numbers.display_number AS local_number_display,
         extensions.external_extension,
         (
           SELECT recordings.id FROM recordings
           WHERE recordings.call_id = calls.id AND recordings.status = 'available'
           ORDER BY recordings.recorded_at DESC NULLS LAST LIMIT 1
         ) AS recording_id,
         (
           SELECT recordings.status FROM recordings
           WHERE recordings.call_id = calls.id
           ORDER BY recordings.recorded_at DESC NULLS LAST, recordings.created_at DESC LIMIT 1
         ) AS recording_status
       FROM calls
       LEFT JOIN users ON users.id = calls.user_id
       LEFT JOIN phone_numbers ON phone_numbers.id = calls.phone_number_id
       LEFT JOIN extensions ON extensions.id = calls.extension_id
       ${clause}
       ORDER BY calls.started_at DESC
       LIMIT $${params.length}`,
      params,
    )

    return { data: result.rows }
  })

  app.get('/api/v1/calls/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const call = await db.query('SELECT * FROM calls WHERE id = $1', [id])

    if (!call.rows[0]) {
      return reply.code(404).send({ error: 'call_not_found' })
    }

    const events = await db.query(
      'SELECT * FROM call_events WHERE call_id = $1 ORDER BY occurred_at',
      [id],
    )
    const recordings = await db.query(
      'SELECT * FROM recordings WHERE call_id = $1 ORDER BY recorded_at DESC',
      [id],
    )

    return {
      data: {
        ...call.rows[0],
        events: events.rows,
        recordings: recordings.rows,
      },
    }
  })

  app.post('/api/v1/calls', { preHandler: requireAuth }, async (request, reply) => {
    const body = createCallSchema.parse(request.body)
    const id = randomUUID()
    const eventId = randomUUID()
    const remoteNumber = normalizeBrazilianPhone(body.phone)
    const remoteDisplay = formatBrazilianPhone(remoteNumber)

    await db.query(
      `INSERT INTO calls (
         id, provider_id, user_id, extension_id, phone_number_id,
         direction, remote_number_e164, remote_number_display, status, source
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'created', $9)`,
      [
        id,
        demoIds.provider,
        body.userId ?? demoIds.user,
        demoIds.extension,
        body.phoneNumberId ?? null,
        body.direction,
        remoteNumber,
        remoteDisplay,
        body.source,
      ],
    )

    await db.query(
      `INSERT INTO call_events (id, call_id, event_type, source, payload)
       VALUES ($1, $2, 'created', 'callangos', $3::jsonb)`,
      [eventId, id, JSON.stringify({ source: body.source })],
    )

    await dispatchWebhooks('call.created', {
      id,
      phone: remoteNumber,
      direction: body.direction,
      source: body.source,
      status: 'created',
    })

    const provider = await db.query<{ public_config: DialerPublicConfig }>(
      'SELECT public_config FROM telephony_providers WHERE id = $1',
      [demoIds.provider],
    )
    const protocolHandler = provider.rows[0]?.public_config?.protocolHandler ?? 'tel'
    const dialTarget = formatDialTarget(remoteNumber, provider.rows[0]?.public_config ?? {})

    return reply.code(201).send({
      data: {
        id,
        remoteNumber,
        remoteDisplay,
        status: 'created',
        dialUrl: `${protocolHandler}:${dialTarget}`,
      },
    })
  })

  app.patch('/api/v1/calls/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = updateCallSchema.parse(request.body)
    const eventId = randomUUID()
    const recordingId = randomUUID()
    const ended = ['completed', 'missed', 'busy', 'voicemail', 'failed', 'canceled'].includes(body.status)

    const result = await db.query(
      `UPDATE calls
       SET status = $2,
           session_duration_seconds = COALESCE($3, session_duration_seconds),
           talk_duration_seconds = COALESCE($4, talk_duration_seconds),
           notes = COALESCE($5, notes),
           data_source = $6,
           answered_at = CASE
             WHEN $2 IN ('answered', 'completed') AND answered_at IS NULL THEN started_at
             ELSE answered_at
           END,
           ended_at = CASE WHEN $7 THEN now() ELSE ended_at END,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        body.status,
        body.sessionDurationSeconds ?? null,
        body.talkDurationSeconds ?? null,
        body.notes ?? null,
        body.dataSource,
        ended,
      ],
    )

    if (!result.rows[0]) {
      return reply.code(404).send({ error: 'call_not_found' })
    }

    await db.query(
      `INSERT INTO call_events (id, call_id, event_type, source, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [eventId, id, body.status, body.dataSource === 'provider' ? 'provider' : 'user', JSON.stringify(body)],
    )

    if (['completed', 'voicemail'].includes(body.status)) {
      await db.query(
        `INSERT INTO recordings (id, call_id, provider_id, status, storage_strategy, recorded_at)
         SELECT $1, $2, provider_id, 'pending', 'provider', ended_at
         FROM calls
         WHERE id = $2
           AND NOT EXISTS (SELECT 1 FROM recordings WHERE call_id = $2)`,
        [recordingId, id],
      )
    }

    await dispatchWebhooks('call.updated', result.rows[0])
    if (ended) await dispatchWebhooks('call.completed', result.rows[0])

    return { data: result.rows[0] }
  })
}
