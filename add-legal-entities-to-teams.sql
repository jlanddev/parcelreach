-- Add legal_entities field to teams table
-- This stores the LLC names that can be used as buyer entities in purchase agreements

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS legal_entities JSONB DEFAULT '[]'::jsonb;
