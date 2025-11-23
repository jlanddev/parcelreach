-- Team-specific lead data table
-- Each team has their own private workspace for each lead
-- Offers, status, notes, etc. are all team-specific

CREATE TABLE IF NOT EXISTS team_lead_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,

  -- Team-specific fields
  status TEXT DEFAULT 'new',
  offer_price DECIMAL(12, 2),
  contract_status TEXT,
  contract_sent_date TIMESTAMP WITH TIME ZONE,
  contract_signed_date TIMESTAMP WITH TIME ZONE,
  closing_date TIMESTAMP WITH TIME ZONE,
  earnest_money DECIMAL(12, 2),
  down_payment DECIMAL(12, 2),

  -- Custom team fields (JSON for flexibility)
  custom_data JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one record per team per lead
  UNIQUE(team_id, lead_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_lead_data_team ON team_lead_data(team_id);
CREATE INDEX IF NOT EXISTS idx_team_lead_data_lead ON team_lead_data(lead_id);
CREATE INDEX IF NOT EXISTS idx_team_lead_data_team_lead ON team_lead_data(team_id, lead_id);
