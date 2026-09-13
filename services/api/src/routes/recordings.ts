import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/client.js'
import { buildCallWhere, callFilterSchema } from '../domain/call-filters.js'
import { dispatchWebhooks } from '../services/webhooks.js'
import { requireAdmin, requireAuth } from './auth.js'

const updateRecordingSchema = z.object({
  status: z.enum(['pending', 'available', 'unavailable', 'failed', 'deleted']),
  providerRecordingId: z.string().max(240).nullable().optional(),
  providerReference: z.string().max(2000).nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
  mimeType: z.string().max(120).nullable().optional(),
})

export async function recordingsRoutes(app: FastifyInstance) {
  app.get('/api/v1/recordings', { preHandler: requireAuth }, async (request) => {
    const query = z.intersection(callFilterSchema, z.object({
      callId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().nonnegative().default(0),
    })).parse(request.query)
    const { clause, params } = buildCallWhere(query, 'calls')
    const conditions = [clause.replace(/^WHERE /, ''), "recordings.status = 'available'"]
      .filter(Boolean)

    if (query.callId) {
      params.push(query.callId)
      conditions.push(`calls.id = $${params.length}`)
    }

    const where = conditions.join(' AND ')
    const totalResult = await db.query<{ total: number }>(
      `SELECT COUNT(*)::integer AS total
       FROM recordings
       INNER JOIN calls ON calls.id = recordings.call_id
       WHERE ${where}`,
      params,
    )
    params.push(query.limit)
    const limitPosition = params.length
    params.push(query.offset)
    const offsetPosition = params.length

    const result = await db.query(
      `SELECT
         recordings.*,
         calls.remote_number_e164,
         calls.remote_number_display,
         calls.direction,
         calls.started_at,
         calls.talk_duration_seconds,
         users.name AS user_name,
         phone_numbers.display_number AS local_number_display
       FROM recordings
       INNER JOIN calls ON calls.id = recordings.call_id
       LEFT JOIN users ON users.id = calls.user_id
       LEFT JOIN phone_numbers ON phone_numbers.id = calls.phone_number_id
       WHERE ${where}
       ORDER BY recordings.recorded_at DESC NULLS LAST, recordings.created_at DESC
       LIMIT $${limitPosition}
       OFFSET $${offsetPosition}`,
      params,
    )

    const total = totalResult.rows[0]?.total ?? 0
    return {
      data: result.rows,
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + result.rows.length < total,
      },
    }
  })

  app.patch('/api/v1/recordings/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = updateRecordingSchema.parse(request.body)
    const result = await db.query(
      `UPDATE recordings
       SET status = $2,
           provider_recording_id = COALESCE($3, provider_recording_id),
           provider_reference = COALESCE($4, provider_reference),
           duration_seconds = COALESCE($5, duration_seconds),
           mime_type = COALESCE($6, mime_type),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, body.status, body.providerRecordingId ?? null, body.providerReference ?? null, body.durationSeconds ?? null, body.mimeType ?? null],
    )

    if (!result.rows[0]) return reply.code(404).send({ error: 'recording_not_found' })
    if (body.status === 'available') await dispatchWebhooks('recording.available', result.rows[0])
    return { data: result.rows[0] }
  })
}
