import { pathToFileURL } from 'node:url'
import { config } from '../config.js'
import { hashPassword } from '../domain/auth.js'
import { db } from './client.js'

export const demoIds = {
  user: '00000000-0000-4000-8000-000000000001',
  provider: '00000000-0000-4000-8000-000000000002',
  extension: '00000000-0000-4000-8000-000000000003',
  operator: '00000000-0000-4000-8000-000000000004',
  numberOne: '00000000-0000-4000-8000-000000000005',
  numberTwo: '00000000-0000-4000-8000-000000000006',
} as const

export async function seed() {
  await db.query(
    `INSERT INTO users (id, name, email, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (id) DO UPDATE
     SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = now()`,
    [demoIds.user, 'Nael Queiroz', config.ADMIN_EMAIL],
  )

  const admin = await db.query<{ password_hash: string | null }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [demoIds.user],
  )
  if (!admin.rows[0]?.password_hash) {
    await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [demoIds.user, hashPassword(config.ADMIN_PASSWORD)])
  }

  await db.query(
    `INSERT INTO telephony_providers (
       id, code, display_name, status, integration_mode, public_config
     )
     VALUES ($1, 'br_did', 'BR DID', 'pending', 'external_protocol', $2::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      demoIds.provider,
      JSON.stringify({
        portalUrl: 'https://brdid.com.br/',
        plan: 'PABX Virtual',
        extension: '2001',
      }),
    ],
  )

  await db.query(
    `INSERT INTO extensions (
       id, provider_id, user_id, external_extension, label, dialer_mode, active
     )
     VALUES ($1, $2, $3, '2001', 'Ramal principal', 'external_protocol', true)
     ON CONFLICT (id) DO NOTHING`,
    [demoIds.extension, demoIds.provider, demoIds.user],
  )

  await db.query(
    `INSERT INTO user_settings (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [demoIds.user],
  )

  if (!process.env.DATABASE_URL || process.env.SEED_DEMO_DATA === 'true') {
    await db.query(
      `INSERT INTO users (id, name, email, role, password_hash)
       VALUES ($1, 'Operador Demo', 'operador@callangos.local', 'operator', $2)
       ON CONFLICT (id) DO NOTHING`,
      [demoIds.operator, hashPassword(config.ADMIN_PASSWORD)],
    )

    await db.query(
      `INSERT INTO phone_numbers (id, provider_id, e164, display_number, label)
       VALUES
         ($1, $3, '+551140001000', '(11) 4000-1000', 'Linha SP'),
         ($2, $3, '+551540002000', '(15) 4000-2000', 'Linha Interior')
       ON CONFLICT (id) DO NOTHING`,
      [demoIds.numberOne, demoIds.numberTwo, demoIds.provider],
    )

    await db.query(
      `INSERT INTO calls (
         id, provider_id, user_id, extension_id, direction,
         remote_number_e164, remote_number_display, status, source,
         started_at, answered_at, ended_at, talk_duration_seconds,
         session_duration_seconds, disconnect_cause, data_source
       )
       VALUES
         ('00000000-0000-4000-8000-000000001001', $1, $2, $3, 'outbound', '+5515997421088', '(15) 99742-1088', 'completed', 'extension', now() - interval '34 minutes', now() - interval '33 minutes 52 seconds', now() - interval '29 minutes 34 seconds', 258, 266, 'normal_clearing', 'manual'),
         ('00000000-0000-4000-8000-000000001002', $1, $2, $3, 'outbound', '+5511958136220', '(11) 95813-6220', 'missed', 'extension', now() - interval '2 hours', NULL, now() - interval '1 hour 59 minutes 37 seconds', 0, 23, 'no_answer', 'manual'),
         ('00000000-0000-4000-8000-000000001003', $1, $2, $3, 'outbound', '+5519991084421', '(19) 99108-4421', 'completed', 'extension', now() - interval '1 day 3 hours', now() - interval '1 day 2 hours 59 minutes 49 seconds', now() - interval '1 day 2 hours 53 minutes 37 seconds', 372, 383, 'normal_clearing', 'manual'),
         ('00000000-0000-4000-8000-000000001004', $1, $2, $3, 'outbound', '+551532328080', '(15) 3232-8080', 'busy', 'extension', now() - interval '2 days 1 hour', NULL, now() - interval '2 days 59 minutes 52 seconds', 0, 8, 'busy', 'manual'),
         ('00000000-0000-4000-8000-000000001005', $1, $2, $3, 'outbound', '+5511982147714', '(11) 98214-7714', 'voicemail', 'extension', now() - interval '3 days 4 hours', now() - interval '3 days 3 hours 59 minutes 50 seconds', now() - interval '3 days 3 hours 59 minutes 7 seconds', 43, 53, 'voicemail', 'manual')
       ON CONFLICT (id) DO NOTHING`,
      [demoIds.provider, demoIds.user, demoIds.extension],
    )

    await db.query(
      `UPDATE calls
       SET phone_number_id = CASE
             WHEN id IN ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000001003') THEN $1::uuid
             ELSE $2::uuid
           END,
           user_id = CASE
             WHEN id IN ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000001005') THEN $3::uuid
             ELSE user_id
           END
       WHERE id IN (
         '00000000-0000-4000-8000-000000001001',
         '00000000-0000-4000-8000-000000001002',
         '00000000-0000-4000-8000-000000001003',
         '00000000-0000-4000-8000-000000001004',
         '00000000-0000-4000-8000-000000001005'
       )`,
      [demoIds.numberOne, demoIds.numberTwo, demoIds.operator],
    )

    await db.query(
      `INSERT INTO recordings (
         id, call_id, provider_id, provider_recording_id, status,
         storage_strategy, duration_seconds, mime_type, provider_reference, recorded_at
       )
       VALUES
         ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000001001', $1, 'demo-recording-1', 'available', 'provider', 258, 'audio/mpeg', 'portal:demo-recording-1', now() - interval '29 minutes 34 seconds'),
         ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000001003', $1, 'demo-recording-2', 'available', 'provider', 372, 'audio/mpeg', 'portal:demo-recording-2', now() - interval '1 day 2 hours 53 minutes 37 seconds'),
         ('00000000-0000-4000-8000-000000002003', '00000000-0000-4000-8000-000000001005', $1, NULL, 'pending', 'provider', NULL, NULL, NULL, now() - interval '3 days 3 hours 59 minutes 7 seconds')
       ON CONFLICT (id) DO NOTHING`,
      [demoIds.provider],
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seed()
  console.log(`Database seeded using ${db.kind}.`)
  await db.close()
}
