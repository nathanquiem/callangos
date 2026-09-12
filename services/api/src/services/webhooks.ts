import { createHmac, randomUUID } from 'node:crypto'
import { config } from '../config.js'
import { db } from '../db/client.js'

export type WebhookTarget = {
  id: string
  url: string
}

export function webhookSecret(webhookId: string) {
  return createHmac('sha256', config.WEBHOOK_SIGNING_KEY).update(webhookId).digest('hex')
}

export async function deliverWebhook(webhook: WebhookTarget, eventType: string, data: unknown) {
  const deliveryId = randomUUID()
  const payload = JSON.stringify({
    id: deliveryId,
    event: eventType,
    occurredAt: new Date().toISOString(),
    data,
  })
  const signature = createHmac('sha256', webhookSecret(webhook.id)).update(payload).digest('hex')

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Callangos-Webhook/1.0',
        'x-callangos-event': eventType,
        'x-callangos-delivery': deliveryId,
        'x-callangos-signature': `sha256=${signature}`,
      },
      body: payload,
      signal: AbortSignal.timeout(5000),
    })
    const responseBody = (await response.text()).slice(0, 1000)
    await db.query(
      `INSERT INTO webhook_deliveries (
         id, webhook_id, event_type, payload, status, http_status,
         response_body, delivered_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, now())`,
      [deliveryId, webhook.id, eventType, payload, response.ok ? 'delivered' : 'failed', response.status, responseBody],
    )
    await db.query('UPDATE webhooks SET last_delivery_at = now() WHERE id = $1', [webhook.id])
    return { webhookId: webhook.id, delivered: response.ok, status: response.status }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook delivery failed'
    await db.query(
      `INSERT INTO webhook_deliveries (
         id, webhook_id, event_type, payload, status, error_message
       ) VALUES ($1, $2, $3, $4::jsonb, 'failed', $5)`,
      [deliveryId, webhook.id, eventType, payload, message],
    )
    return { webhookId: webhook.id, delivered: false, error: message }
  }
}

export async function dispatchWebhooks(eventType: string, data: unknown) {
  const webhooks = await db.query<WebhookTarget>(
    `SELECT id, url
     FROM webhooks
     WHERE active = true AND $1 = ANY(events)`,
    [eventType],
  )
  return Promise.all(webhooks.rows.map((webhook) => deliverWebhook(webhook, eventType, data)))
}
