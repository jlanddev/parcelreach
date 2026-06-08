-- ============================================================================
-- Acquisition Manager Role Migration
-- ============================================================================
-- Adds role-based access for cold callers (Anthony), property map upload,
-- and the "Mapped" badge on lead cards.
--
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/snfttvopjrpzsypteiby/editor
-- ============================================================================

-- 1. ROLE COLUMN on users table
-- Default 'admin' so Jordan (the only existing user) stays admin.
-- Anthony's row will be flipped to 'acquisition_manager' after his auth account is created.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT
  DEFAULT 'admin'
  CHECK (role IN ('admin', 'acquisition_manager'));

UPDATE users SET role = 'admin' WHERE role IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);


-- 2. PROPERTY MAP UPLOAD fields on leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS map_uploaded BOOLEAN DEFAULT FALSE;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS map_image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_map_uploaded ON leads(map_uploaded) WHERE map_uploaded = TRUE;


-- 3. STORAGE BUCKET for property map screenshots
-- Public bucket so the image URL renders directly in the lead card.
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-maps', 'lead-maps', true)
ON CONFLICT (id) DO NOTHING;

-- Allow any authenticated user to upload map screenshots (both Jordan + Anthony)
DROP POLICY IF EXISTS "Authenticated users can upload lead maps" ON storage.objects;
CREATE POLICY "Authenticated users can upload lead maps"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lead-maps');

-- Allow any authenticated user to update/replace map screenshots
DROP POLICY IF EXISTS "Authenticated users can update lead maps" ON storage.objects;
CREATE POLICY "Authenticated users can update lead maps"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'lead-maps');

-- Public read so the <img> renders without a signed URL
DROP POLICY IF EXISTS "Public can read lead maps" ON storage.objects;
CREATE POLICY "Public can read lead maps"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'lead-maps');


-- ============================================================================
-- AFTER you create Anthony's auth user in Supabase Dashboard
-- (Authentication → Users → Add User → his email + password),
-- run this to set his role:
-- ============================================================================
--
-- INSERT INTO users (id, email, full_name, role)
-- SELECT id, email, 'Anthony', 'acquisition_manager'
-- FROM auth.users
-- WHERE email = 'anthony@yourdomain.com'  -- <<< replace with Anthony's email
-- ON CONFLICT (id) DO UPDATE SET role = 'acquisition_manager';
--
-- ============================================================================
