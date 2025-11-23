-- AUTOMATIC FIX FOR MISSING LEADS
-- Just run this entire script in Supabase SQL Editor

-- Step 1: Assign ALL leads to Haven Ground team if they're not assigned elsewhere
INSERT INTO lead_assignments (team_id, lead_id)
SELECT
    t.id as team_id,
    l.id as lead_id
FROM teams t
CROSS JOIN leads l
JOIN team_members tm ON t.id = tm.team_id
JOIN auth.users u ON tm.user_id = u.id
WHERE u.email = 'jordan@havenground.com'
AND NOT EXISTS (
    -- Don't reassign if already assigned to this team
    SELECT 1 FROM lead_assignments la
    WHERE la.lead_id = l.id AND la.team_id = t.id
)
ON CONFLICT (team_id, lead_id) DO NOTHING;

-- Step 2: Create team_lead_data for all assigned leads
INSERT INTO team_lead_data (team_id, lead_id, status, full_name, email, phone, street_address, city, property_state, property_county, zip, acres, parcel_id, dealtype, notes, projected_revenue, offer_price)
SELECT
    t.id as team_id,
    l.id as lead_id,
    COALESCE(l.status, 'new') as status,
    l.full_name,
    l.email,
    l.phone,
    l.street_address,
    l.city,
    l.property_state,
    l.property_county,
    l.zip,
    l.acres,
    l.parcel_id,
    l.dealtype,
    l.notes,
    l.projected_revenue,
    l.offer_price
FROM teams t
JOIN team_members tm ON t.id = tm.team_id
JOIN auth.users u ON tm.user_id = u.id
JOIN lead_assignments la ON t.id = la.team_id
JOIN leads l ON la.lead_id = l.id
WHERE u.email = 'jordan@havenground.com'
AND NOT EXISTS (
    SELECT 1 FROM team_lead_data tld
    WHERE tld.lead_id = l.id AND tld.team_id = t.id
)
ON CONFLICT (team_id, lead_id) DO NOTHING;

-- Verification: Show lead count for Haven Ground
SELECT
    'Haven Ground Lead Count:' as info,
    t.name as team_name,
    COUNT(DISTINCT la.lead_id) as total_leads
FROM teams t
JOIN team_members tm ON t.id = tm.team_id
JOIN auth.users u ON tm.user_id = u.id
LEFT JOIN lead_assignments la ON t.id = la.team_id
WHERE u.email = 'jordan@havenground.com'
GROUP BY t.name;
