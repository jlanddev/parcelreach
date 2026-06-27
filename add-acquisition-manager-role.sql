-- ============================================================================
-- ONE-SHOT SETUP: Acquisition Manager Role (Anthony)
-- ============================================================================
-- 1. Supabase Dashboard → Authentication → Users → Add User
--    Enter Anthony's email + a temp password. Click Create.
-- 2. Change the email on the next line to match what you just used.
-- 3. Paste this whole file into Supabase SQL Editor → Run. Done.
-- ============================================================================

DO $$
DECLARE
  anthony_email TEXT := 'anthony@yourdomain.com';  -- <<< CHANGE THIS
BEGIN

  -- Role column on users (default 'admin' so Jordan stays admin)
  ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin'
    CHECK (role IN ('admin', 'acquisition_manager'));
  UPDATE users SET role = 'admin' WHERE role IS NULL;

  -- Property map fields on leads
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS map_uploaded BOOLEAN DEFAULT FALSE;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS map_image_url TEXT;

  -- Storage bucket for map screenshots
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('lead-maps', 'lead-maps', true)
  ON CONFLICT (id) DO NOTHING;

  -- Upsert Anthony's profile row + set role from his auth account
  INSERT INTO users (id, email, full_name, role)
  SELECT id, email, 'Anthony', 'acquisition_manager'
  FROM auth.users
  WHERE email = anthony_email
  ON CONFLICT (id) DO UPDATE SET role = 'acquisition_manager';

END $$;

-- Indexes (outside DO block — IF NOT EXISTS handles re-runs)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_leads_map_uploaded ON leads(map_uploaded) WHERE map_uploaded = TRUE;

-- Storage policies (outside DO block — CREATE POLICY doesn't accept variables)
DROP POLICY IF EXISTS "Authenticated users can upload lead maps" ON storage.objects;
CREATE POLICY "Authenticated users can upload lead maps"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lead-maps');

DROP POLICY IF EXISTS "Authenticated users can update lead maps" ON storage.objects;
CREATE POLICY "Authenticated users can update lead maps"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'lead-maps');

DROP POLICY IF EXISTS "Public can read lead maps" ON storage.objects;
CREATE POLICY "Public can read lead maps"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'lead-maps');

-- Sanity check — should return Jordan as admin + Anthony as acquisition_manager
SELECT email, role FROM users ORDER BY role;
