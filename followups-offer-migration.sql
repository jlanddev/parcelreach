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
