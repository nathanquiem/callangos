import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/client.js'
import { demoIds } from '../db/seed.js'
import { requireAuth } from './auth.js'

const updateSettingsSchema = z.object({
  confirmBeforeCall: z.boolean().optional(),
  autoOpenCallDetails: z.boolean().optional(),
  defaultCountryCode: z.string().regex(/^\d{1,4}$/).optional(),
  showManualDataBadge: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  desktopNotifications: z.boolean().optional(),
  compactTables: z.boolean().optional(),
  recordingAutoplay: z.boolean().optional(),
  defaultHistoryPeriod: z.enum(['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_week', 'this_month']).optional(),
  timezone: z.string().min(3).max(80).optional(),
})

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/v1/settings', { preHandler: requireAuth }, async () => {
    const result = await db.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [demoIds.user],
    )
    return { data: result.rows[0] }
  })

  app.patch('/api/v1/settings', { preHandler: requireAuth }, async (request) => {
    const body = updateSettingsSchema.parse(request.body)
    const result = await db.query(
      `UPDATE user_settings
       SET confirm_before_call = COALESCE($2, confirm_before_call),
           auto_open_call_details = COALESCE($3, auto_open_call_details),
           default_country_code = COALESCE($4, default_country_code),
           show_manual_data_badge = COALESCE($5, show_manual_data_badge),
           theme = COALESCE($6, theme),
           desktop_notifications = COALESCE($7, desktop_notifications),
           compact_tables = COALESCE($8, compact_tables),
           recording_autoplay = COALESCE($9, recording_autoplay),
           default_history_period = COALESCE($10, default_history_period),
           timezone = COALESCE($11, timezone),
           updated_at = now()
       WHERE user_id = $1
       RETURNING *`,
      [
        demoIds.user,
        body.confirmBeforeCall ?? null,
        body.autoOpenCallDetails ?? null,
        body.defaultCountryCode ?? null,
        body.showManualDataBadge ?? null,
        body.theme ?? null,
        body.desktopNotifications ?? null,
        body.compactTables ?? null,
        body.recordingAutoplay ?? null,
        body.defaultHistoryPeriod ?? null,
        body.timezone ?? null,
      ],
    )
    return { data: result.rows[0] }
  })
}
