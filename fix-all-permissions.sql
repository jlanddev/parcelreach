-- Complete fix for all modal fields
-- Run this entire script in Supabase SQL Editor

-- 1. Add missing columns
ALTER TABLE leads ADD COLUMN IF NOT EXISTS parcelid TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS county TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS offermade BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contractsigned BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS offerprice NUMERIC;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS projectedrevenue NUMERIC;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pictures JSONB DEFAULT '[]'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contractfile JSONB;

-- 2. Add UPDATE policy (THIS IS THE KEY FIX!)
DROP POLICY IF EXISTS "Allow authenticated update" ON leads;
CREATE POLICY "Allow authenticated update" ON leads
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 3. Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'leads';
