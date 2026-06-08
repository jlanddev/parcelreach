-- ============================================================================
-- Current Teammate tracking on leads
-- ============================================================================
-- Adds current_owner_id so both Jordan and Anthony can see who's actively
-- working a lead, with a toggle to claim/release.
-- Paste into Supabase SQL Editor → Run.
-- ============================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS current_owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Default existing leads to Anthony (acquisition manager) as the working teammate
UPDATE leads
SET current_owner_id = (SELECT id FROM users WHERE role = 'acquisition_manager' LIMIT 1)
WHERE current_owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_current_owner ON leads(current_owner_id);
