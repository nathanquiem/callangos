CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'admin'
    CHECK (role IN ('admin', 'operator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telephony_providers (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'degraded', 'offline', 'error')),
  integration_mode text NOT NULL DEFAULT 'external_protocol'
    CHECK (integration_mode IN ('external_protocol', 'api', 'webhook', 'sip')),
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS phone_numbers (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES telephony_providers(id) ON DELETE RESTRICT,
  e164 text NOT NULL UNIQUE,
  display_number text NOT NULL,
  label text NOT NULL DEFAULT 'Principal',
  active boolean NOT NULL DEFAULT true,
  supports_inbound boolean NOT NULL DEFAULT true,
  supports_outbound boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extensions (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES telephony_providers(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_extension text NOT NULL,
  label text NOT NULL DEFAULT 'Ramal principal',
  dialer_mode text NOT NULL DEFAULT 'external_protocol'
    CHECK (dialer_mode IN ('external_protocol', 'webphone', 'api')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, external_extension)
);

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY,
  provider_id uuid REFERENCES telephony_providers(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  extension_id uuid REFERENCES extensions(id) ON DELETE SET NULL,
  phone_number_id uuid REFERENCES phone_numbers(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound')),
  remote_number_e164 text NOT NULL,
  remote_number_display text NOT NULL,
  status text NOT NULL DEFAULT 'created'
    CHECK (
      status IN (
        'created',
        'handed_off',
        'ringing',
        'answered',
        'completed',
        'missed',
        'busy',
        'voicemail',
        'failed',
        'canceled'
      )
    ),
  source text NOT NULL DEFAULT 'extension'
    CHECK (source IN ('app', 'extension', 'provider_sync', 'inbound')),
  provider_call_id text,
  disconnect_cause text,
  notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  ring_duration_seconds integer
    CHECK (ring_duration_seconds IS NULL OR ring_duration_seconds >= 0),
  talk_duration_seconds integer
    CHECK (talk_duration_seconds IS NULL OR talk_duration_seconds >= 0),
  session_duration_seconds integer
    CHECK (session_duration_seconds IS NULL OR session_duration_seconds >= 0),
  data_source text NOT NULL DEFAULT 'manual'
    CHECK (data_source IN ('manual', 'provider', 'mixed')),
  provider_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calls_provider_call_id_unique
  ON calls (provider_id, provider_call_id)
  WHERE provider_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS calls_started_at_idx ON calls (started_at DESC);
CREATE INDEX IF NOT EXISTS calls_status_idx ON calls (status);
CREATE INDEX IF NOT EXISTS calls_remote_number_idx ON calls (remote_number_e164);

CREATE TABLE IF NOT EXISTS call_events (
  id uuid PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'callangos'
    CHECK (source IN ('callangos', 'user', 'provider')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_events_call_id_idx
  ON call_events (call_id, occurred_at);

CREATE TABLE IF NOT EXISTS recordings (
  id uuid PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES telephony_providers(id) ON DELETE SET NULL,
  provider_recording_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'unavailable', 'failed', 'deleted')),
  storage_strategy text NOT NULL DEFAULT 'provider'
    CHECK (storage_strategy IN ('provider', 'callangos')),
  duration_seconds integer
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  mime_type text,
  provider_reference text,
  recorded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recordings_call_id_idx ON recordings (call_id);
CREATE INDEX IF NOT EXISTS recordings_status_idx ON recordings (status);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  confirm_before_call boolean NOT NULL DEFAULT true,
  auto_open_call_details boolean NOT NULL DEFAULT true,
  default_country_code text NOT NULL DEFAULT '55',
  show_manual_data_badge boolean NOT NULL DEFAULT true,
  theme text NOT NULL DEFAULT 'light'
    CHECK (theme IN ('light', 'dark', 'system')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_sync_runs (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES telephony_providers(id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  imported_calls integer NOT NULL DEFAULT 0,
  imported_recordings integer NOT NULL DEFAULT 0,
  error_message text
);
