-- Add parcel ID and county columns
-- Run this in Supabase SQL Editor

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS parcelid TEXT;

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS county TEXT;

-- Update existing leads with sample data (optional)
-- You can remove this if you don't want to update existing records
-- UPDATE leads SET parcelid = 'Unknown' WHERE parcelid IS NULL;
-- UPDATE leads SET county = 'Unknown' WHERE county IS NULL;
