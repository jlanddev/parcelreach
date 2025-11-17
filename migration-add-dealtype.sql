-- Migration: Add dealType column to leads table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/snfttvopjrpzsypteiby/editor

-- Disable RLS to allow updates
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;

-- Add dealType column if it doesn't exist (no default, will be NULL)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dealType TEXT;

-- Verify the changes
SELECT id, name, address, acreage, dealType FROM leads ORDER BY created_at DESC;
