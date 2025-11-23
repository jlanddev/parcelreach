-- Create trigger to automatically assign leads to teams when inserted
-- This fixes the issue where leads are created but don't show up in the dashboard

-- First, create the function that will be called by the trigger
CREATE OR REPLACE FUNCTION auto_assign_lead_to_team()
RETURNS TRIGGER AS $$
BEGIN
    -- If the lead has a team_id, create the assignment
    IF NEW.team_id IS NOT NULL THEN
        INSERT INTO lead_assignments (team_id, lead_id)
        VALUES (NEW.team_id, NEW.id)
        ON CONFLICT (team_id, lead_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS auto_assign_lead_trigger ON leads;
CREATE TRIGGER auto_assign_lead_trigger
    AFTER INSERT ON leads
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_lead_to_team();

-- Also update existing leads that have team_id but no assignment
INSERT INTO lead_assignments (team_id, lead_id)
SELECT team_id, id
FROM leads
WHERE team_id IS NOT NULL
AND id NOT IN (SELECT lead_id FROM lead_assignments)
ON CONFLICT (team_id, lead_id) DO NOTHING;
