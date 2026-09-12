import { randomBytes, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { config } from '../config.js'
import { db } from '../db/client.js'
import { hashToken, verifyPassword } from '../domain/auth.js'

type SessionUser = {
  id: string
  name: string
  email: string
  role: 'admin' | 'operator'
}

export async function currentUser(request: FastifyRequest) {
  if (config.ALLOW_DEV_AUTH_BYPASS && db.kind === 'pglite') {
    const local = await db.query<SessionUser>(
      `SELECT id, name, email, role FROM users
       WHERE email = $1 AND active = true`,
      [config.ADMIN_EMAIL],
    )
    return local.rows[0] ?? null
  }

  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return null
  const result = await db.query<SessionUser>(
    `SELECT users.id, users.name, users.email, users.role
     FROM auth_sessions
     INNER JOIN users ON users.id = auth_sessions.user_id
     WHERE auth_sessions.token_hash = $1
       AND auth_sessions.expires_at > now()
       AND users.active = true`,
    [hashToken(authorization.slice(7))],
  )
  if (result.rows[0]) {
    await db.query(
      `UPDATE auth_sessions SET last_used_at = now()
       WHERE token_hash = $1`,
      [hashToken(authorization.slice(7))],
    )
  }
  return result.rows[0] ?? null
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!(await currentUser(request))) return reply.code(401).send({ error: 'authentication_required' })
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await currentUser(request)
  if (!user) return reply.code(401).send({ error: 'authentication_required' })
  if (user.role !== 'admin') return reply.code(403).send({ error: 'admin_required' })
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/login', {
    config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8).max(240),
    }).parse(request.body)
    const user = await db.query<SessionUser & { password_hash: string | null }>(
      `SELECT id, name, email, role, password_hash
       FROM users WHERE email = $1 AND active = true`,
      [body.email.toLowerCase()],
    )
    const match = user.rows[0]
    if (!match?.password_hash || !verifyPassword(body.password, match.password_hash)) {
      return reply.code(401).send({ error: 'invalid_credentials' })
    }

    const token = `clg_session_${randomBytes(32).toString('base64url')}`
    await db.query(
      `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '12 hours')`,
      [randomUUID(), match.id, hashToken(token)],
    )
    return { data: { token, user: { id: match.id, name: match.name, email: match.email, role: match.role } } }
  })

  app.get('/api/v1/auth/me', async (request, reply) => {
    const user = await currentUser(request)
    if (!user) return reply.code(401).send({ error: 'authentication_required' })
    return { data: user }
  })

  app.post('/api/v1/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    const authorization = request.headers.authorization
    if (authorization?.startsWith('Bearer ')) {
      await db.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(authorization.slice(7))])
    }
    return reply.code(204).send()
  })
}
