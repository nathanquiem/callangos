import { z } from 'zod'

export const callFilterSchema = z.object({
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  status: z.string().max(40).optional(),
  direction: z.enum(['outbound', 'inbound']).optional(),
  userId: z.string().uuid().optional(),
  phoneNumberId: z.string().uuid().optional(),
  phone: z.string().max(32).optional(),
  duration: z.enum(['0_60', '61_300', '301_600', '601_plus']).optional(),
})

export type CallFilters = z.infer<typeof callFilterSchema>

export function buildCallWhere(filters: CallFilters, alias = 'calls') {
  const conditions: string[] = []
  const params: unknown[] = []

  function addCondition(sql: string, value: unknown) {
    params.push(value)
    conditions.push(sql.replace('?', `$${params.length}`))
  }

  if (filters.dateFrom) addCondition(`${alias}.started_at >= ?`, filters.dateFrom)
  if (filters.dateTo) addCondition(`${alias}.started_at < ?`, filters.dateTo)
  if (filters.status) addCondition(`${alias}.status = ?`, filters.status)
  if (filters.direction) addCondition(`${alias}.direction = ?`, filters.direction)
  if (filters.userId) addCondition(`${alias}.user_id = ?`, filters.userId)
  if (filters.phoneNumberId) addCondition(`${alias}.phone_number_id = ?`, filters.phoneNumberId)
  if (filters.phone) addCondition(`${alias}.remote_number_e164 LIKE ?`, `%${filters.phone.replace(/\D/g, '')}%`)

  const duration = `COALESCE(${alias}.talk_duration_seconds, ${alias}.session_duration_seconds, 0)`
  if (filters.duration === '0_60') conditions.push(`${duration} <= 60`)
  if (filters.duration === '61_300') conditions.push(`${duration} > 60 AND ${duration} <= 300`)
  if (filters.duration === '301_600') conditions.push(`${duration} > 300 AND ${duration} <= 600`)
  if (filters.duration === '601_plus') conditions.push(`${duration} > 600`)

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}
