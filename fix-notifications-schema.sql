-- Fix notifications table - add missing 'link' column
-- Run this in your Supabase SQL Editor

-- Add link column if it doesn't exist
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS link VARCHAR(500);

-- Verify the column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'notifications';
