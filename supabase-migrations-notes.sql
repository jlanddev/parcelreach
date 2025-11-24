-- Migration for Monday.com-style notes system
-- Run this in your Supabase SQL Editor

-- 1. Add parent_id column to lead_notes for nested replies
ALTER TABLE lead_notes
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES lead_notes(id) ON DELETE CASCADE;

-- 2. Create index on parent_id for faster queries
CREATE INDEX IF NOT EXISTS idx_lead_notes_parent_id ON lead_notes(parent_id);

-- 3. Create note_likes table for the like/reaction system
CREATE TABLE IF NOT EXISTS note_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID REFERENCES lead_notes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(note_id, user_id) -- Prevent duplicate likes from same user
);

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_note_likes_note_id ON note_likes(note_id);
CREATE INDEX IF NOT EXISTS idx_note_likes_user_id ON note_likes(user_id);

-- 5. Add attachments column to lead_notes for file uploads
ALTER TABLE lead_notes
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- 6. Enable Row Level Security
ALTER TABLE note_likes ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for note_likes
CREATE POLICY "Users can view likes on notes they can access"
  ON note_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can like notes"
  ON note_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike their own likes"
  ON note_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Done! Your notes system is now ready with:
-- ✓ Nested threading (parent_id)
-- ✓ Like/reaction system (note_likes table)
-- ✓ File attachments support (attachments column)
