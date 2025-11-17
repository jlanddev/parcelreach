-- Lead Assignments Junction Table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/snfttvopjrpzsypteiby/editor

-- Create lead_assignments table for many-to-many relationship
CREATE TABLE IF NOT EXISTS lead_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL,
  team_id UUID NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID,
  UNIQUE(lead_id, team_id),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead_id ON lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_team_id ON lead_assignments(team_id);

-- Disable RLS for now
ALTER TABLE lead_assignments DISABLE ROW LEVEL SECURITY;

-- Migrate existing assignments to junction table
INSERT INTO lead_assignments (lead_id, team_id, assigned_at)
SELECT id, team_id, purchased_at
FROM leads
WHERE team_id IS NOT NULL
ON CONFLICT (lead_id, team_id) DO NOTHING;
