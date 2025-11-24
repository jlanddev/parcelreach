-- Migration: Add online status, read receipts, and edit history
-- Run this in your Supabase SQL Editor

-- 1. Add edited_at column to lead_notes for edit history
ALTER TABLE lead_notes
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

-- 2. Create note_views table for read receipts
CREATE TABLE IF NOT EXISTS note_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID REFERENCES lead_notes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(note_id, user_id) -- One view record per user per note
);

-- 3. Create indexes for note_views
CREATE INDEX IF NOT EXISTS idx_note_views_note_id ON note_views(note_id);
CREATE INDEX IF NOT EXISTS idx_note_views_user_id ON note_views(user_id);

-- 4. Create user_presence table for online status
CREATE TABLE IF NOT EXISTS user_presence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'online' CHECK (status IN ('online', 'away', 'offline')),
  UNIQUE(user_id, lead_id) -- One presence record per user per lead
);

-- 5. Create indexes for user_presence
CREATE INDEX IF NOT EXISTS idx_user_presence_lead_id ON user_presence(lead_id);
CREATE INDEX IF NOT EXISTS idx_user_presence_user_id ON user_presence(user_id);
CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence(last_seen);

-- 6. Enable Row Level Security
ALTER TABLE note_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for note_views
CREATE POLICY "Users can view note views for their team's notes"
  ON note_views FOR SELECT
  USING (true);

CREATE POLICY "Users can record their own note views"
  ON note_views FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 8. Create RLS policies for user_presence
CREATE POLICY "Users can view presence for their team's leads"
  ON user_presence FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own presence"
  ON user_presence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own presence"
  ON user_presence FOR UPDATE
  USING (auth.uid() = user_id);

-- 9. Create function to auto-update status based on last_seen
CREATE OR REPLACE FUNCTION update_user_status()
RETURNS void AS $$
BEGIN
  UPDATE user_presence
  SET status = CASE
    WHEN last_seen > NOW() - INTERVAL '2 minutes' THEN 'online'
    WHEN last_seen > NOW() - INTERVAL '10 minutes' THEN 'away'
    ELSE 'offline'
  END
  WHERE status != CASE
    WHEN last_seen > NOW() - INTERVAL '2 minutes' THEN 'online'
    WHEN last_seen > NOW() - INTERVAL '10 minutes' THEN 'away'
    ELSE 'offline'
  END;
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a scheduled job to run status updates every minute
-- (You'll need to set this up in Supabase Dashboard -> Database -> Cron Jobs)
-- SELECT cron.schedule('update-user-status', '* * * * *', 'SELECT update_user_status()');
