-- Team Invitations table
CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(100) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_team_invitations_token (token),
  INDEX idx_team_invitations_email (email),
  INDEX idx_team_invitations_team_id (team_id)
);

-- RLS policies
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Team owners can view their team's invitations
CREATE POLICY "Team owners can view invitations"
  ON team_invitations
  FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM teams WHERE owner_id = auth.uid()
    )
  );

-- Service role can insert invitations
CREATE POLICY "Service role can insert invitations"
  ON team_invitations
  FOR INSERT
  WITH CHECK (true);

-- Users can view invitations sent to their email
CREATE POLICY "Users can view their own invitations"
  ON team_invitations
  FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

COMMENT ON TABLE team_invitations IS 'Stores team invitation links sent via email';
