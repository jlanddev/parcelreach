-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow team members to insert" ON signature_requests;
DROP POLICY IF EXISTS "Allow team members to read" ON signature_requests;

-- New policy: Allow service role to insert (for API routes)
CREATE POLICY "Allow service role to insert" ON signature_requests
  FOR INSERT
  WITH CHECK (true);

-- New policy: Allow service role and team members to read
CREATE POLICY "Allow authenticated to read" ON signature_requests
  FOR SELECT
  USING (true);

-- Keep existing public policies for signature page access
-- "Allow public access by token" - already exists
-- "Allow public updates by token" - already exists
