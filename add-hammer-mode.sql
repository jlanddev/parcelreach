-- ============================================================================
-- Hammer Mode + WE_PASSED — pipeline engine foundations
-- ============================================================================
-- Paste into Supabase SQL Editor → Run.
-- ============================================================================

-- Hammer mode is an overlay flag (not a status). When true, every completed
-- touch auto-schedules the next callback for tomorrow until the lead's status
-- changes or you toggle it off.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS hammer_mode BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_leads_hammer_mode ON leads(hammer_mode) WHERE hammer_mode = TRUE;

-- Sanity check
SELECT COUNT(*) AS leads_in_hammer FROM leads WHERE hammer_mode = TRUE;
