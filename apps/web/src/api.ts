export type Page = 'dialer' | 'history' | 'recordings' | 'dashboard' | 'telephony' | 'settings' | 'api'
export type Period = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_week' | 'this_month' | 'custom' | 'all'

export type FilterState = {
  period: Period
  dateFrom: string
  dateTo: string
  status: string
  direction: string
  userId: string
  phoneNumberId: string
  phone: string
  duration: string
}

export type CallRecord = {
  id: string
  direction: 'outbound' | 'inbound'
  remote_number_e164: string
  remote_number_display: string
  local_number_display: string | null
  status: string
  source: string
  started_at: string
  answered_at: string | null
  ended_at: string | null
  talk_duration_seconds: number | null
  session_duration_seconds: number | null
  data_source: string
  user_name: string | null
  user_email: string | null
  external_extension: string | null
  recording_id: string | null
  recording_status: string | null
}

export type RecordingRecord = {
  id: string
  call_id: string
  status: 'available'
  duration_seconds: number | null
  storage_strategy: 'provider' | 'callangos'
  provider_reference: string | null
  recorded_at: string | null
  remote_number_display: string
  remote_number_e164: string
  direction: 'outbound' | 'inbound'
  started_at: string
  talk_duration_seconds: number | null
  user_name: string | null
  local_number_display: string | null
}

export type DashboardData = {
  summary: {
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
  }
  byStatus: Array<{ status: string; count: number }>
  byDay: Array<{ day: string; total: number; answered: number; talk_seconds: number }>
  byHour: Array<{ hour: number; total: number; answered: number }>
  byDuration: Array<{ bucket: string; count: number }>
  byUser: Array<{ user_id: string; user_name: string | null; total: number; answered: number; talk_seconds: number }>
}

export type PhoneNumber = {
  id: string
  e164: string
  display_number: string
  label: string
  active: boolean
}

export type TelephonyData = {
  provider: {
    display_name: string
    status: string
    integration_mode: string
    public_config: {
      plan?: string
      extension?: string
      number?: string
      portalUrl?: string
      registrarServer?: string
      sipPort?: number
      transport?: 'UDP' | 'TCP' | 'TLS'
      outboundPrefix?: string
      dialFormat?: 'e164_digits' | 'e164_plus' | 'national'
      protocolHandler?: 'tel' | 'callto' | 'sip'
      cdrMode?: 'manual' | 'api' | 'webhook'
      cdrEndpoint?: string
      recordingMode?: 'provider' | 'disabled'
    }
  }
  extensions: Array<{
    id: string
    external_extension: string
    label: string
    dialer_mode: string
    active: boolean
  }>
  numbers: PhoneNumber[]
}

export type SettingsData = {
  confirm_before_call: boolean
  auto_open_call_details: boolean
  default_country_code: string
  show_manual_data_badge: boolean
  theme: 'light' | 'dark' | 'system'
  desktop_notifications: boolean
  compact_tables: boolean
  recording_autoplay: boolean
  default_history_period: Exclude<Period, 'custom' | 'all'>
  timezone: string
}

export type UserRecord = {
  id: string
  name: string
  email: string
  role: 'admin' | 'operator'
  active: boolean
  created_at: string
  temporaryPassword?: string
}

export type AuthUser = {
  id: string
  name: string
  email: string
  role: 'admin' | 'operator'
}

export type ApiToken = {
  id: string
  name: string
  token_prefix: string
  active: boolean
  expires_at: string | null
  last_used_at: string | null
  created_at: string
  token?: string
}

export type WebhookRecord = {
  id: string
  name: string
  url: string
  events: string[]
  active: boolean
  last_delivery_at: string | null
  last_status: string | null
  last_http_status: number | null
  signingSecret?: string
}

export const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'
export const externalDialing = import.meta.env.VITE_DIALER_MODE === 'external'

export const initialFilters: FilterState = {
  period: 'last_7_days',
  dateFrom: '',
  dateTo: '',
  status: '',
  direction: '',
  userId: '',
  phoneNumberId: '',
  phone: '',
  duration: '',
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const session = localStorage.getItem('callangos_session')
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session}` } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const payload = await response.text().catch(() => '')
    throw new Error(payload ? `API ${response.status}: ${payload}` : `API ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function filterQuery(filters: FilterState) {
  const query = new URLSearchParams()
  const today = startOfDay(new Date())
  let from: Date | null = null
  let to: Date | null = null

  if (filters.period === 'today') { from = today; to = addDays(today, 1) }
  if (filters.period === 'yesterday') { from = addDays(today, -1); to = today }
  if (filters.period === 'last_7_days') { from = addDays(today, -6); to = addDays(today, 1) }
  if (filters.period === 'last_30_days') { from = addDays(today, -29); to = addDays(today, 1) }
  if (filters.period === 'this_week') { from = addDays(today, -((today.getDay() + 6) % 7)); to = addDays(today, 1) }
  if (filters.period === 'this_month') { from = new Date(today.getFullYear(), today.getMonth(), 1); to = addDays(today, 1) }
  if (filters.period === 'custom') {
    if (filters.dateFrom) from = startOfDay(new Date(`${filters.dateFrom}T00:00:00`))
    if (filters.dateTo) to = addDays(startOfDay(new Date(`${filters.dateTo}T00:00:00`)), 1)
  }

  if (from) query.set('dateFrom', from.toISOString())
  if (to) query.set('dateTo', to.toISOString())
  if (filters.status) query.set('status', filters.status)
  if (filters.direction) query.set('direction', filters.direction)
  if (filters.userId) query.set('userId', filters.userId)
  if (filters.phoneNumberId) query.set('phoneNumberId', filters.phoneNumberId)
  if (filters.phone) query.set('phone', filters.phone)
  if (filters.duration) query.set('duration', filters.duration)
  return query.toString()
}
