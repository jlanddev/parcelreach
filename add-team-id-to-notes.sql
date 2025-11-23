-- Add team_id to lead_notes for data isolation
-- Each team should only see their own notes on a lead

ALTER TABLE lead_notes
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_lead_notes_team_id ON lead_notes(team_id);

-- Create composite index for efficient queries
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_team ON lead_notes(lead_id, team_id);
