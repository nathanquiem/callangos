BEGIN;

-- A organização entra agora para o banco não precisar ser desmontado caso o
-- Callangos evolua de uso interno para produto. O app atual usa uma organização.
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO organizations (id, name, slug)
VALUES ('10000000-0000-4000-8000-000000000001', 'Callangos', 'callangos')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL
    DEFAULT '10000000-0000-4000-8000-000000000001'
    REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE telephony_providers
  ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL
    DEFAULT '10000000-0000-4000-8000-000000000001'
    REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE phone_numbers
  ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL
    DEFAULT '10000000-0000-4000-8000-000000000001'
    REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE extensions
  ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL
    DEFAULT '10000000-0000-4000-8000-000000000001'
    REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL
    DEFAULT '10000000-0000-4000-8000-000000000001'
    REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL
    DEFAULT '10000000-0000-4000-8000-000000000001'
    REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL
    DEFAULT '10000000-0000-4000-8000-000000000001'
    REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL
    DEFAULT '10000000-0000-4000-8000-000000000001'
    REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT ARRAY['calls:read']::text[],
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE webhooks
  ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL
    DEFAULT '10000000-0000-4000-8000-000000000001'
    REFERENCES organizations(id) ON DELETE RESTRICT;

-- Metadados suficientes para retenção, download seguro e deduplicação de áudio.
ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint
    CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  ADD COLUMN IF NOT EXISTS checksum_sha256 text,
  ADD COLUMN IF NOT EXISTS retention_until timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Entregas passam a comportar retentativas sem perder o histórico da tentativa.
ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1
    CHECK (attempt_number > 0),
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer
    CHECK (duration_ms IS NULL OR duration_ms >= 0);

-- Caixa de entrada idempotente para futuros CDRs/webhooks da operadora.
CREATE TABLE IF NOT EXISTS provider_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL REFERENCES telephony_providers(id) ON DELETE CASCADE,
  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processed', 'ignored', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  payload jsonb NOT NULL,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider_id, external_event_id)
);

-- Referências a segredos da VPS; a senha SIP nunca entra em public_config.
CREATE TABLE IF NOT EXISTS provider_secret_references (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL REFERENCES telephony_providers(id) ON DELETE CASCADE,
  secret_type text NOT NULL
    CHECK (secret_type IN ('sip_password', 'api_token', 'webhook_secret')),
  secret_reference text NOT NULL,
  masked_hint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, secret_type)
);

-- Registro administrativo para alterações sensíveis de usuário, linha, token e webhook.
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- O mesmo DID pode existir em provedores distintos, mas nunca duplicado na organização.
ALTER TABLE phone_numbers DROP CONSTRAINT IF EXISTS phone_numbers_e164_key;
CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_org_e164_unique
  ON phone_numbers (organization_id, e164);

CREATE UNIQUE INDEX IF NOT EXISTS recordings_provider_reference_unique
  ON recordings (provider_id, provider_recording_id)
  WHERE provider_recording_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS calls_org_started_idx
  ON calls (organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS calls_org_status_started_idx
  ON calls (organization_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS calls_org_user_started_idx
  ON calls (organization_id, user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS calls_org_number_started_idx
  ON calls (organization_id, phone_number_id, started_at DESC);
CREATE INDEX IF NOT EXISTS calls_org_direction_started_idx
  ON calls (organization_id, direction, started_at DESC);
CREATE INDEX IF NOT EXISTS recordings_available_recorded_idx
  ON recordings (organization_id, recorded_at DESC)
  WHERE status = 'available';
CREATE INDEX IF NOT EXISTS provider_events_pending_idx
  ON provider_events (provider_id, received_at)
  WHERE processing_status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS webhook_deliveries_retry_idx
  ON webhook_deliveries (next_attempt_at)
  WHERE status = 'failed' AND next_attempt_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON audit_logs (organization_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_active_idx
  ON auth_sessions (user_id, expires_at DESC);

-- Regras que impedem CDRs incoerentes de contaminarem Histórico e Painel.
ALTER TABLE calls
  ADD CONSTRAINT calls_answered_after_start_check
    CHECK (answered_at IS NULL OR answered_at >= started_at),
  ADD CONSTRAINT calls_ended_after_start_check
    CHECK (ended_at IS NULL OR ended_at >= started_at),
  ADD CONSTRAINT calls_talk_within_session_check
    CHECK (
      talk_duration_seconds IS NULL OR
      session_duration_seconds IS NULL OR
      talk_duration_seconds <= session_duration_seconds
    ),
  ADD CONSTRAINT calls_remote_e164_check
    CHECK (remote_number_e164 ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE phone_numbers
  ADD CONSTRAINT phone_numbers_e164_check
    CHECK (e164 ~ '^\+[1-9][0-9]{7,14}$');

CREATE OR REPLACE FUNCTION callangos_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION callangos_set_updated_at();
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION callangos_set_updated_at();
CREATE TRIGGER telephony_providers_set_updated_at
  BEFORE UPDATE ON telephony_providers
  FOR EACH ROW EXECUTE FUNCTION callangos_set_updated_at();
CREATE TRIGGER phone_numbers_set_updated_at
  BEFORE UPDATE ON phone_numbers
  FOR EACH ROW EXECUTE FUNCTION callangos_set_updated_at();
CREATE TRIGGER extensions_set_updated_at
  BEFORE UPDATE ON extensions
  FOR EACH ROW EXECUTE FUNCTION callangos_set_updated_at();
CREATE TRIGGER calls_set_updated_at
  BEFORE UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION callangos_set_updated_at();
CREATE TRIGGER recordings_set_updated_at
  BEFORE UPDATE ON recordings
  FOR EACH ROW EXECUTE FUNCTION callangos_set_updated_at();
CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION callangos_set_updated_at();
CREATE TRIGGER webhooks_set_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION callangos_set_updated_at();
CREATE TRIGGER provider_secret_references_set_updated_at
  BEFORE UPDATE ON provider_secret_references
  FOR EACH ROW EXECUTE FUNCTION callangos_set_updated_at();

-- Views estáveis para Histórico e Gravações, mantendo as telas longe de joins frágeis.
CREATE OR REPLACE VIEW call_details AS
SELECT
  calls.*,
  users.name AS user_name,
  users.email AS user_email,
  phone_numbers.display_number AS local_number_display,
  phone_numbers.label AS local_number_label,
  extensions.external_extension,
  recordings.id AS recording_id,
  recordings.status AS recording_status
FROM calls
LEFT JOIN users ON users.id = calls.user_id
LEFT JOIN phone_numbers ON phone_numbers.id = calls.phone_number_id
LEFT JOIN extensions ON extensions.id = calls.extension_id
LEFT JOIN LATERAL (
  SELECT id, status
  FROM recordings
  WHERE recordings.call_id = calls.id
  ORDER BY recorded_at DESC NULLS LAST, created_at DESC
  LIMIT 1
) recordings ON true;

CREATE OR REPLACE VIEW available_recordings AS
SELECT
  recordings.*,
  calls.remote_number_e164,
  calls.remote_number_display,
  calls.direction,
  calls.started_at,
  calls.talk_duration_seconds,
  users.name AS user_name,
  phone_numbers.display_number AS local_number_display
FROM recordings
INNER JOIN calls ON calls.id = recordings.call_id
LEFT JOIN users ON users.id = calls.user_id
LEFT JOIN phone_numbers ON phone_numbers.id = calls.phone_number_id
WHERE recordings.status = 'available';

COMMIT;
