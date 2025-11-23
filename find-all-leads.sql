-- Find all leads and their team assignments
-- This will help us locate the missing 3 leads

-- First, get all teams for jordan@havenground.com
SELECT
    'Teams for jordan@havenground.com:' as info,
    t.id as team_id,
    t.name as team_name,
    t.owner_id
FROM teams t
JOIN team_members tm ON t.id = tm.team_id
JOIN auth.users u ON tm.user_id = u.id
WHERE u.email = 'jordan@havenground.com';

-- Get ALL leads in the system with their team assignments
SELECT
    'All leads in system:' as info,
    l.id as lead_id,
    l.fullname,
    l.acres,
    l.address,
    l.city,
    l.state,
    l.created_at,
    la.team_id,
    t.name as team_name
FROM leads l
LEFT JOIN lead_assignments la ON l.id = la.lead_id
LEFT JOIN teams t ON la.team_id = t.id
ORDER BY l.created_at DESC
LIMIT 20;

-- Get count of leads per team
SELECT
    'Lead counts per team:' as info,
    t.name as team_name,
    t.id as team_id,
    COUNT(la.lead_id) as lead_count
FROM teams t
LEFT JOIN lead_assignments la ON t.id = la.team_id
GROUP BY t.id, t.name
ORDER BY lead_count DESC;
