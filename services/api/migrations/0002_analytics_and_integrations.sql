ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS desktop_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS compact_tables boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_autoplay boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_history_period text NOT NULL DEFAULT 'last_7_days',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_source_check;
ALTER TABLE calls
  ADD CONSTRAINT calls_source_check
  CHECK (source IN ('app', 'extension', 'api', 'provider_sync', 'inbound'));

CREATE TABLE IF NOT EXISTS api_tokens (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_tokens_active_idx ON api_tokens (active);

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY['call.completed']::text[],
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  last_delivery_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY,
  webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('delivered', 'failed')),
  http_status integer,
  response_body text,
  error_message text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_idx
  ON webhook_deliveries (webhook_id, created_at DESC);
