-- Migration: Add profile fields to users table
-- Run this in your Supabase SQL Editor

-- Add first_name, last_name, and phone columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Create index on first_name and last_name for faster queries
CREATE INDEX IF NOT EXISTS idx_users_first_name ON users(first_name);
CREATE INDEX IF NOT EXISTS idx_users_last_name ON users(last_name);

-- Optional: Migrate existing full_name data to first_name/last_name
-- This will split "John Doe" into first_name="John", last_name="Doe"
-- UNCOMMENT THE BELOW IF YOU WANT TO MIGRATE EXISTING DATA:

/*
UPDATE users
SET
  first_name = SPLIT_PART(full_name, ' ', 1),
  last_name = CASE
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(full_name, ' '), 1) > 1
    THEN SPLIT_PART(full_name, ' ', ARRAY_LENGTH(STRING_TO_ARRAY(full_name, ' '), 1))
    ELSE ''
  END
WHERE full_name IS NOT NULL AND first_name IS NULL;
*/

-- Note: Keep full_name column for backward compatibility
-- It can be computed from first_name + last_name or updated separately
