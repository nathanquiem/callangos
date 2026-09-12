import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { buildCallWhere, callFilterSchema } from '../domain/call-filters.js'
import { requireAuth } from './auth.js'

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/v1/dashboard', { preHandler: requireAuth }, async (request) => {
    const filters = callFilterSchema.parse(request.query)
    const { clause, params } = buildCallWhere(filters, 'calls')
    const cte = `WITH filtered_calls AS (SELECT calls.* FROM calls ${clause})`

    const summary = await db.query<{
      total_calls: number
      answered_calls: number
      unanswered_calls: number
      inbound_calls: number
      outbound_calls: number
      recordings_available: number
      talk_seconds: number
      session_seconds: number
      average_talk_seconds: number
      unique_numbers: number
    }>(
      `${cte}
       SELECT
         count(*)::int AS total_calls,
         count(*) FILTER (WHERE status IN ('answered', 'completed'))::int AS answered_calls,
         count(*) FILTER (WHERE status IN ('missed', 'busy', 'voicemail', 'failed'))::int AS unanswered_calls,
         count(*) FILTER (WHERE direction = 'inbound')::int AS inbound_calls,
         count(*) FILTER (WHERE direction = 'outbound')::int AS outbound_calls,
         COALESCE(sum(talk_duration_seconds), 0)::int AS talk_seconds,
         COALESCE(sum(session_duration_seconds), 0)::int AS session_seconds,
         COALESCE(avg(talk_duration_seconds) FILTER (WHERE talk_duration_seconds > 0), 0)::int AS average_talk_seconds,
         count(DISTINCT remote_number_e164)::int AS unique_numbers,
         (
           SELECT count(*)::int
           FROM recordings
           INNER JOIN filtered_calls ON filtered_calls.id = recordings.call_id
           WHERE recordings.status = 'available'
         ) AS recordings_available
       FROM filtered_calls`,
      params,
    )

    const byStatus = await db.query<{ status: string; count: number }>(
      `${cte}
       SELECT status, count(*)::int AS count
       FROM filtered_calls
       GROUP BY status
       ORDER BY count DESC`,
      params,
    )

    const byDay = await db.query<{ day: string; total: number; answered: number; talk_seconds: number }>(
      `${cte}
       SELECT
         to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day,
         count(*)::int AS total,
         count(*) FILTER (WHERE status IN ('answered', 'completed'))::int AS answered,
         COALESCE(sum(talk_duration_seconds), 0)::int AS talk_seconds
       FROM filtered_calls
       GROUP BY date_trunc('day', started_at)
       ORDER BY date_trunc('day', started_at)`,
      params,
    )

    const byHour = await db.query<{ hour: number; total: number; answered: number }>(
      `${cte}
       SELECT
         extract(hour FROM started_at)::int AS hour,
         count(*)::int AS total,
         count(*) FILTER (WHERE status IN ('answered', 'completed'))::int AS answered
       FROM filtered_calls
       GROUP BY extract(hour FROM started_at)
       ORDER BY hour`,
      params,
    )

    const byDuration = await db.query<{ bucket: string; count: number }>(
      `${cte}
       SELECT bucket, count(*)::int AS count
       FROM (
         SELECT CASE
           WHEN COALESCE(talk_duration_seconds, session_duration_seconds, 0) <= 60 THEN '0_60'
           WHEN COALESCE(talk_duration_seconds, session_duration_seconds, 0) <= 300 THEN '61_300'
           WHEN COALESCE(talk_duration_seconds, session_duration_seconds, 0) <= 600 THEN '301_600'
           ELSE '601_plus'
         END AS bucket
         FROM filtered_calls
       ) durations
       GROUP BY bucket`,
      params,
    )

    const byUser = await db.query<{ user_id: string; user_name: string; total: number; answered: number; talk_seconds: number }>(
      `${cte}
       SELECT
         users.id AS user_id,
         users.name AS user_name,
         count(*)::int AS total,
         count(*) FILTER (WHERE filtered_calls.status IN ('answered', 'completed'))::int AS answered,
         COALESCE(sum(filtered_calls.talk_duration_seconds), 0)::int AS talk_seconds
       FROM filtered_calls
       LEFT JOIN users ON users.id = filtered_calls.user_id
       GROUP BY users.id, users.name
       ORDER BY total DESC`,
      params,
    )

    return {
      data: {
        summary: summary.rows[0],
        byStatus: byStatus.rows,
        byDay: byDay.rows,
        byHour: byHour.rows,
        byDuration: byDuration.rows,
        byUser: byUser.rows,
      },
    }
  })
}
