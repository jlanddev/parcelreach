-- Fix missing lead assignments for Haven Ground team

-- First, get Haven Ground team ID
DO $$
DECLARE
    haven_team_id UUID;
BEGIN
    -- Get Haven Ground team ID
    SELECT id INTO haven_team_id
    FROM teams
    WHERE name ILIKE '%haven%ground%' OR name ILIKE '%havenground%'
    LIMIT 1;

    -- If not found, try getting jordan@havenground.com's team
    IF haven_team_id IS NULL THEN
        SELECT t.id INTO haven_team_id
        FROM teams t
        JOIN team_members tm ON t.id = tm.team_id
        JOIN auth.users u ON tm.user_id = u.id
        WHERE u.email = 'jordan@havenground.com'
        LIMIT 1;
    END IF;

    RAISE NOTICE 'Haven Ground team ID: %', haven_team_id;

    -- Insert missing lead assignments for all leads that should belong to Haven Ground
    -- This assigns ALL leads that aren't already assigned to other teams
    INSERT INTO lead_assignments (team_id, lead_id)
    SELECT haven_team_id, l.id
    FROM leads l
    WHERE NOT EXISTS (
        SELECT 1 FROM lead_assignments la WHERE la.lead_id = l.id AND la.team_id = haven_team_id
    )
    AND l.id NOT IN (
        -- Exclude leads already assigned to other teams
        SELECT lead_id FROM lead_assignments WHERE team_id != haven_team_id
    )
    ON CONFLICT (team_id, lead_id) DO NOTHING;

    RAISE NOTICE 'Fixed lead assignments';
END $$;

-- Verify the fix
SELECT
    t.name as team_name,
    COUNT(la.lead_id) as lead_count
FROM teams t
LEFT JOIN lead_assignments la ON t.id = la.team_id
WHERE t.name ILIKE '%haven%' OR t.name ILIKE '%ground%'
GROUP BY t.id, t.name;
