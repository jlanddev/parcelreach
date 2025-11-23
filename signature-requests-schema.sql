-- Table to track Purchase Agreement signature requests
CREATE TABLE IF NOT EXISTS signature_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  pa_html TEXT NOT NULL,
  seller_name TEXT NOT NULL,
  seller_email TEXT NOT NULL,
  seller_phone TEXT,
  buyer_entity TEXT NOT NULL,
  purchase_price NUMERIC,
  property_address TEXT,
  status TEXT DEFAULT 'pending', -- pending, signed, expired
  seller_signature TEXT, -- base64 signature image
  seller_signed_at TIMESTAMP WITH TIME ZONE,
  buyer_signature TEXT, -- base64 signature image
  buyer_signed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days'
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_signature_requests_token ON signature_requests(token);
CREATE INDEX IF NOT EXISTS idx_signature_requests_lead_id ON signature_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_signature_requests_status ON signature_requests(status);

-- Enable RLS
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;

-- Policy to allow public access by token
CREATE POLICY "Allow public access by token" ON signature_requests
  FOR SELECT
  USING (true);

-- Policy to allow public updates by token
CREATE POLICY "Allow public updates by token" ON signature_requests
  FOR UPDATE
  USING (true);

-- Policy to allow team members to insert
CREATE POLICY "Allow team members to insert" ON signature_requests
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = signature_requests.team_id
      AND team_members.user_id = auth.uid()
    )
  );

-- Policy to allow team members to read their requests
CREATE POLICY "Allow team members to read" ON signature_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = signature_requests.team_id
      AND team_members.user_id = auth.uid()
    )
  );
