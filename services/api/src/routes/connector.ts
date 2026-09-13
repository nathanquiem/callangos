import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { config } from '../config.js'
import { db } from '../db/client.js'
import { normalizeBrazilianPhone } from '../domain/phone.js'
import { dispatchWebhooks } from '../services/webhooks.js'
import { requireAuth } from './auth.js'
import { authenticateApiToken } from './integrations.js'

const eventSchema = z.object({
  event: z.enum(['answered', 'ended', 'busy', 'failed']),
  phone: z.string().min(3).max(240),
})

function connectorPhone(value: string) {
  const candidates = value.match(/\+?\d{10,13}/g)
  return normalizeBrazilianPhone(candidates?.at(-1) ?? value)
}

export async function connectorRoutes(app: FastifyInstance) {
  app.addContentTypeParser(
    ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: 64 * 1024 * 1024 },
    (_request, body, done) => done(null, body),
  )

  app.post('/api/v1/connector/events', async (request, reply) => {
    const token = await authenticateApiToken(request)
    if (!token?.created_by) return reply.code(401).send({ error: 'invalid_api_token' })
    const body = eventSchema.parse(request.body)
    const remoteNumber = connectorPhone(body.phone)
    const current = await db.query<{ id: string; status: string }>(
      `SELECT id, status
       FROM calls
       WHERE user_id = $1
         AND remote_number_e164 = $2
         AND status IN ('created', 'handed_off', 'ringing', 'answered')
         AND started_at > now() - interval '4 hours'
       ORDER BY started_at DESC
       LIMIT 1`,
      [token.created_by, remoteNumber],
    )
    if (!current.rows[0]) return reply.code(404).send({ error: 'active_call_not_found' })

    const nextStatus = body.event === 'answered'
      ? 'answered'
      : body.event === 'busy'
        ? 'busy'
        : body.event === 'failed'
          ? 'failed'
          : current.rows[0].status === 'answered' ? 'completed' : 'missed'
    const ended = ['completed', 'missed', 'busy', 'failed'].includes(nextStatus)
    const result = await db.query(
      `UPDATE calls
       SET status = $2,
           answered_at = CASE WHEN $2 = 'answered' THEN COALESCE(answered_at, now()) ELSE answered_at END,
           ended_at = CASE WHEN $3 THEN now() ELSE ended_at END,
           session_duration_seconds = CASE WHEN $3 THEN GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::integer) ELSE session_duration_seconds END,
           talk_duration_seconds = CASE WHEN $3 AND answered_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (now() - answered_at))::integer) WHEN $3 THEN 0 ELSE talk_duration_seconds END,
           data_source = 'mixed',
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [current.rows[0].id, nextStatus, ended],
    )
    await db.query(
      `INSERT INTO call_events (id, call_id, event_type, source, payload)
       VALUES ($1, $2, $3, 'provider', $4::jsonb)`,
      [randomUUID(), current.rows[0].id, nextStatus, JSON.stringify({ connector: 'microsip', phone: body.phone })],
    )
    if (nextStatus === 'completed') {
      await db.query(
        `INSERT INTO recordings (id, call_id, provider_id, status, storage_strategy, recorded_at)
         SELECT $1, id, provider_id, 'pending', 'callangos', ended_at
         FROM calls WHERE id = $2
           AND NOT EXISTS (SELECT 1 FROM recordings WHERE call_id = $2)`,
        [randomUUID(), current.rows[0].id],
      )
    }
    await dispatchWebhooks('call.updated', result.rows[0])
    if (ended) await dispatchWebhooks('call.completed', result.rows[0])
    return { data: result.rows[0] }
  })

  app.post('/api/v1/connector/recordings/:callId', async (request, reply) => {
    const token = await authenticateApiToken(request)
    if (!token?.created_by) return reply.code(401).send({ error: 'invalid_api_token' })
    const { callId } = z.object({ callId: z.string().uuid() }).parse(request.params)
    const call = await db.query<{ id: string; provider_id: string | null; talk_duration_seconds: number | null }>(
      'SELECT id, provider_id, talk_duration_seconds FROM calls WHERE id = $1 AND user_id = $2',
      [callId, token.created_by],
    )
    if (!call.rows[0]) return reply.code(404).send({ error: 'call_not_found' })
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) return reply.code(400).send({ error: 'empty_recording' })

    const suppliedName = String(request.headers['x-callangos-file-name'] ?? '')
    const suppliedExtension = extname(suppliedName).toLowerCase()
    const extension = suppliedExtension === '.wav' || suppliedExtension === '.mp3'
      ? suppliedExtension
      : request.headers['content-type']?.includes('wav') ? '.wav' : '.mp3'
    const existing = await db.query<{ id: string }>('SELECT id FROM recordings WHERE call_id = $1 ORDER BY created_at LIMIT 1', [callId])
    const recordingId = existing.rows[0]?.id ?? randomUUID()
    const fileName = `${recordingId}${extension}`
    const recordingsDirectory = resolve(config.RECORDINGS_DIR)
    await mkdir(recordingsDirectory, { recursive: true })
    await writeFile(resolve(recordingsDirectory, fileName), request.body)

    const recording = existing.rows[0]
      ? await db.query(
        `UPDATE recordings SET status = 'available', storage_strategy = 'callangos', duration_seconds = $2,
           mime_type = $3, provider_reference = $4, recorded_at = COALESCE(recorded_at, now()), updated_at = now()
         WHERE id = $1 RETURNING *`,
        [recordingId, call.rows[0].talk_duration_seconds, extension === '.wav' ? 'audio/wav' : 'audio/mpeg', fileName],
      )
      : await db.query(
        `INSERT INTO recordings (id, call_id, provider_id, status, storage_strategy, duration_seconds, mime_type, provider_reference, recorded_at)
         VALUES ($1, $2, $3, 'available', 'callangos', $4, $5, $6, now()) RETURNING *`,
        [recordingId, callId, call.rows[0].provider_id, call.rows[0].talk_duration_seconds, extension === '.wav' ? 'audio/wav' : 'audio/mpeg', fileName],
      )
    await dispatchWebhooks('recording.available', recording.rows[0])
    return reply.code(201).send({ data: recording.rows[0] })
  })

  app.get('/api/v1/recordings/:id/audio', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const recording = await db.query<{ provider_reference: string; mime_type: string | null }>(
      `SELECT provider_reference, mime_type FROM recordings
       WHERE id = $1 AND status = 'available' AND storage_strategy = 'callangos'`,
      [id],
    )
    const recordingRow = recording.rows[0]
    const reference = recordingRow?.provider_reference
    if (!reference || reference !== reference.split(/[\\/]/).at(-1)) return reply.code(404).send({ error: 'recording_not_found' })
    const filePath = resolve(config.RECORDINGS_DIR, reference)
    try { await stat(filePath) } catch { return reply.code(404).send({ error: 'recording_file_not_found' }) }
    return reply.type(recordingRow.mime_type ?? 'application/octet-stream')
      .header('Content-Disposition', `inline; filename="${reference}"`)
      .send(createReadStream(filePath))
  })
}
