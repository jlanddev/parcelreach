-- Fix for orphaned team members (team_members without corresponding teams)
-- This script creates missing teams for any team_member records that reference non-existent teams

-- First, let's see what we're dealing with
SELECT
  tm.team_id,
  tm.user_id,
  tm.role,
  u.email,
  CASE
    WHEN t.id IS NULL THEN 'MISSING TEAM'
    ELSE 'OK'
  END as status
FROM team_members tm
LEFT JOIN teams t ON tm.team_id = t.id
LEFT JOIN users u ON tm.user_id = u.id
ORDER BY status DESC;

-- Create missing teams
INSERT INTO teams (id, name, owner_id, created_at, updated_at)
SELECT DISTINCT
  tm.team_id,
  COALESCE(u.email, 'Unknown User') || '''s Team',
  tm.user_id,
  NOW(),
  NOW()
FROM team_members tm
LEFT JOIN teams t ON tm.team_id = t.id
LEFT JOIN users u ON tm.user_id = u.id
WHERE t.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Verify the fix
SELECT
  tm.team_id,
  tm.user_id,
  tm.role,
  u.email,
  t.name as team_name,
  CASE
    WHEN t.id IS NULL THEN 'STILL MISSING'
    ELSE 'FIXED'
  END as status
FROM team_members tm
LEFT JOIN teams t ON tm.team_id = t.id
LEFT JOIN users u ON tm.user_id = u.id
ORDER BY status DESC;
