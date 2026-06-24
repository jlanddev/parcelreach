-- Project Blue messaging: schema additions
-- Run once in Supabase (SQL editor). Safe to re-run (idempotent).

-- 1) activities: unread tracking, idempotency, and which line carried it
ALTER TABLE activities ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS pb_guid      TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS pb_line_id   TEXT;

-- Dedupe inbound/outbound webhooks by Project Blue's guid (one row per message)
CREATE UNIQUE INDEX IF NOT EXISTS activities_pb_guid_key
  ON activities (pb_guid) WHERE pb_guid IS NOT NULL;

-- Fast "unread inbound texts for this lead" lookups
CREATE INDEX IF NOT EXISTS activities_lead_unread_idx
  ON activities (lead_id) WHERE direction = 'INBOUND' AND read_at IS NULL;

-- 2) leads: opt-out + sticky sending line
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_opt_out  BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pb_line_id   TEXT;
