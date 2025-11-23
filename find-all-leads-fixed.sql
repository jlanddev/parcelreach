-- Find all leads and their team assignments (FIXED column names)

SELECT
    l.id as lead_id,
    l.full_name,
    l.acres,
    l.street_address,
    l.city,
    l.created_at,
    la.team_id,
    t.name as team_name
FROM leads l
LEFT JOIN lead_assignments la ON l.id = la.lead_id
LEFT JOIN teams t ON la.team_id = t.id
ORDER BY l.created_at DESC
LIMIT 20;
