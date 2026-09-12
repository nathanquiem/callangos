import { randomBytes, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/client.js'
import { hashPassword } from '../domain/auth.js'
import { requireAdmin } from './auth.js'

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(240),
  password: z.string().min(8).max(240).optional(),
})

const updateUserSchema = createUserSchema.partial().extend({
  active: z.boolean().optional(),
})

export async function usersRoutes(app: FastifyInstance) {
  app.get('/api/v1/users', { preHandler: requireAdmin }, async () => {
    const result = await db.query(
      `SELECT id, name, email, role, active, created_at, updated_at
       FROM users
       ORDER BY role, name`,
    )
    return { data: result.rows }
  })

  app.post('/api/v1/users', { preHandler: requireAdmin }, async (request, reply) => {
    const body = createUserSchema.parse(request.body)
    const temporaryPassword = body.password ?? randomBytes(9).toString('base64url')
    const result = await db.query(
      `INSERT INTO users (id, name, email, role, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, active, created_at, updated_at`,
      [randomUUID(), body.name, body.email.toLowerCase(), 'operator', hashPassword(temporaryPassword)],
    )
    return reply.code(201).send({ data: { ...(result.rows[0] as Record<string, unknown>), temporaryPassword } })
  })

  app.patch('/api/v1/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = updateUserSchema.parse(request.body)
    const result = await db.query(
      `UPDATE users
       SET name = COALESCE($2, name),
           email = COALESCE($3, email),
           active = COALESCE($4, active),
           password_hash = COALESCE($5, password_hash),
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, email, role, active, created_at, updated_at`,
      [id, body.name ?? null, body.email?.toLowerCase() ?? null, body.active ?? null, body.password ? hashPassword(body.password) : null],
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'user_not_found' })
    return { data: result.rows[0] }
  })
}
