import 'dotenv/config'
import { z } from 'zod'

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5174'),
  DATABASE_URL: z.string().optional(),
  PGLITE_DATA_DIR: z.string().default('.data/callangos'),
  RECORDINGS_DIR: z.string().default('.data/recordings'),
  WEBHOOK_SIGNING_KEY: z.string().min(16).default('callangos-local-signing-key'),
  ADMIN_EMAIL: z.string().email().default('nael@callangos.local'),
  ADMIN_PASSWORD: z.string().min(8).default('callangos-local'),
  ALLOW_DEV_AUTH_BYPASS: z.string().default('true').transform((value) => value === 'true'),
})

export const config = configSchema.parse(process.env)

if (process.env.NODE_ENV === 'production') {
  const missing: string[] = []
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL')
  if (!process.env.APP_ORIGIN) missing.push('APP_ORIGIN')
  if (!process.env.ADMIN_EMAIL) missing.push('ADMIN_EMAIL')
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) missing.push('ADMIN_PASSWORD (mínimo de 12 caracteres)')
  if (!process.env.WEBHOOK_SIGNING_KEY || process.env.WEBHOOK_SIGNING_KEY.length < 32) missing.push('WEBHOOK_SIGNING_KEY (mínimo de 32 caracteres)')
  if (config.ALLOW_DEV_AUTH_BYPASS) missing.push('ALLOW_DEV_AUTH_BYPASS=false')

  if (missing.length > 0) {
    throw new Error(`Configuração de produção incompleta: ${missing.join(', ')}`)
  }
}
