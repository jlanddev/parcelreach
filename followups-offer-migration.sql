-- Follow-Up buckets, deal direction, and offer tracking.
-- Run once in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS).

-- Offer that follows the card everywhere + a "reviewed/locked" check.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS offer_amount numeric;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS offer_confirmed boolean DEFAULT false;

-- One direction tag (live-offer label, or the parked bucket carries direction).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_direction text;

-- Follow-Up sequence state.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_bucket text;       -- price_gap | listing | other_offer | needs_time
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_step int DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_started_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz;

-- Lost reason (when a lead is marked Lost).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_reason text;

-- pipeline_status gains two string values, FOLLOW_UP and LOST. It is a free-text
-- column so no enum change is needed.

-- Helps the Follow-Up tab and rundown sort by who is due.
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up_at ON leads (next_follow_up_at);

-- Reliable "last contacted" stored on the lead so the card never wrongly says
-- "No contact yet" (the old card read a capped recent-messages feed).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_dir text;      -- inbound | outbound
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_channel text;  -- text | call
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_preview text;

-- Dedicated last-call stamp so a call always shows on the card even after a
-- later text (last_contact_* gets overwritten by whichever is most recent).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_outcome text;

-- Backfill from the activity timeline (most recent text/call per lead).
UPDATE leads l SET
  last_contact_at = a.created_at,
  last_contact_dir = lower(a.direction),
  last_contact_channel = lower(a.activity_type),
  last_contact_preview = a.message_content
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, created_at, direction, activity_type, message_content
  FROM activities
  WHERE activity_type IN ('TEXT', 'CALL')
  ORDER BY lead_id, created_at DESC
) a
WHERE l.id = a.lead_id AND l.last_contact_at IS NULL;

-- Backfill last call from the activity timeline.
UPDATE leads l SET last_call_at = a.created_at, last_call_outcome = a.outcome
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, created_at, outcome
  FROM activities WHERE activity_type = 'CALL' ORDER BY lead_id, created_at DESC
) a WHERE l.id = a.lead_id AND l.last_call_at IS NULL;

-- One-time cleanup: leads that were auto-flipped to In Contact / Contacting by an
-- outbound text but never actually connected (no inbound reply, no completed call)
-- go back to New. Appointments and later stages are left alone.
UPDATE leads l
SET status = 'new', pipeline_status = 'NEW'
WHERE upper(coalesce(l.pipeline_status, l.status, '')) IN ('CONTACTED', 'CONTACTING')
  AND NOT EXISTS (
    SELECT 1 FROM activities a
    WHERE a.lead_id = l.id
      AND (
        (a.activity_type = 'TEXT' AND upper(a.direction) = 'INBOUND')
        OR (a.activity_type = 'CALL' AND lower(coalesce(a.outcome, '')) IN ('connected', 'spoke'))
      )
  );
