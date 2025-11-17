-- Add missing columns to leads table
-- Run this in Supabase SQL Editor

-- Add checkbox columns for status tracking
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS offermade BOOLEAN DEFAULT false;

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS contractsigned BOOLEAN DEFAULT false;

-- Add offer price column
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS offerprice NUMERIC;

-- Add projected revenue column
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS projectedrevenue NUMERIC;

-- Add pictures array column (using JSONB to store array of image URLs)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS pictures JSONB DEFAULT '[]'::jsonb;

-- Add contract file column (using JSONB to store file info)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS contractfile JSONB;

-- Display the updated table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'leads'
ORDER BY ordinal_position;
