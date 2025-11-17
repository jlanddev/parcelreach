-- ParcelReach Database Cleanup Script
-- Run this in Supabase SQL Editor to remove all test/dummy data
-- WARNING: This will delete ALL existing data. Only run if you're sure!

-- 1. Delete all lead assignments
DELETE FROM lead_assignments;

-- 2. Delete all leads
DELETE FROM leads;

-- 3. Delete all team members
DELETE FROM team_members;

-- 4. Delete all teams/organizations
DELETE FROM teams;

-- 5. Delete all admin users
DELETE FROM admin_users;

-- 6. Delete all contractor signups (if table exists from old GarageLeadly)
DELETE FROM contractor_signups WHERE true;

-- 7. Reset any auto-incrementing sequences (optional)
-- If you have sequences, uncomment these:
-- ALTER SEQUENCE leads_id_seq RESTART WITH 1;
-- ALTER SEQUENCE teams_id_seq RESTART WITH 1;

-- Success message
SELECT 'Database cleaned successfully! All test data removed.' AS message;
