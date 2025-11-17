-- Migration: Admin Features and Lead Source Tracking
-- Purpose: Support admin dashboard, lead distribution, and haven-ground integration
-- Run this in Supabase SQL Editor

-- 1. Add fields to leads table for tracking source and parcel data
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'haven-ground';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS parcel_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS county TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_county TEXT; -- matches haven-ground form field
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_state TEXT; -- matches haven-ground form field
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acres NUMERIC;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS names_on_deed TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS street_address TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_verified BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS purchased_by UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS price_paid NUMERIC;

-- 2. Add subscription type to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS subscription_type TEXT DEFAULT 'pay-per-lead' CHECK (subscription_type IN ('pay-per-lead', 'monthly', 'enterprise'));
ALTER TABLE teams ADD COLUMN IF NOT EXISTS monthly_lead_allocation INTEGER DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS leads_used_this_month INTEGER DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS billing_cycle_start DATE;

-- 3. Create admin_users table to track who has admin access
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- 4. Create lead_assignments table to track manual assignments
CREATE TABLE IF NOT EXISTS lead_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  assignment_type TEXT DEFAULT 'manual' CHECK (assignment_type IN ('manual', 'auto-purchase', 'monthly-allocation')),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_purchased_by ON leads(purchased_by);
CREATE INDEX IF NOT EXISTS idx_leads_parcel_id ON leads(parcel_id);
CREATE INDEX IF NOT EXISTS idx_teams_subscription_type ON teams(subscription_type);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_team_id ON lead_assignments(team_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead_id ON lead_assignments(lead_id);

-- 6. Create view for admin dashboard to see all organizations
CREATE OR REPLACE VIEW admin_organizations AS
SELECT
  t.id,
  t.name,
  t.subscription_type,
  t.monthly_lead_allocation,
  t.leads_used_this_month,
  t.billing_cycle_start,
  t.created_at,
  COUNT(DISTINCT tm.user_id) as member_count,
  COUNT(DISTINCT CASE WHEN l.purchased_at >= NOW() - INTERVAL '30 days' THEN l.id END) as leads_last_30_days
FROM teams t
LEFT JOIN team_members tm ON t.id = tm.team_id
LEFT JOIN leads l ON t.id = l.purchased_by
GROUP BY t.id, t.name, t.subscription_type, t.monthly_lead_allocation, t.leads_used_this_month, t.billing_cycle_start, t.created_at
ORDER BY t.created_at DESC;

-- 7. Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Disable RLS on new tables for now (will set up proper policies later)
ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_assignments DISABLE ROW LEVEL SECURITY;

-- Verify migration
SELECT
  'Migration completed successfully' as status,
  COUNT(*) as admin_users_table_exists
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('admin_users', 'lead_assignments');
