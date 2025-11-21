-- Add parent_note_id column to lead_notes for threaded replies
ALTER TABLE lead_notes ADD COLUMN IF NOT EXISTS parent_note_id UUID REFERENCES lead_notes(id) ON DELETE CASCADE;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_lead_notes_parent_note_id ON lead_notes(parent_note_id);

-- Add index for fetching top-level notes (where parent_note_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_lead_notes_parent_null ON lead_notes(lead_id) WHERE parent_note_id IS NULL;
