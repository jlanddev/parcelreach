-- Marketplace Lead Pricing Migration
-- Adds price and purchase tracking to leads

-- Add price column to leads (null = free/assigned lead, value = marketplace lead)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);

-- Add index for querying priced leads
CREATE INDEX IF NOT EXISTS idx_leads_price ON leads(price) WHERE price IS NOT NULL;

-- Track individual user purchases (since multiple users in a team might purchase same lead)
CREATE TABLE IF NOT EXISTS lead_purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  price_paid DECIMAL(10,2) NOT NULL,
  stripe_payment_intent_id TEXT,
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(lead_id, user_id)
);

-- Indexes for lead_purchases
CREATE INDEX IF NOT EXISTS idx_lead_purchases_lead ON lead_purchases(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_purchases_user ON lead_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_purchases_team ON lead_purchases(team_id);

-- Disable RLS for now
ALTER TABLE lead_purchases DISABLE ROW LEVEL SECURITY;

-- Function to check if user has purchased a lead
CREATE OR REPLACE FUNCTION user_has_purchased_lead(p_user_id UUID, p_lead_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM lead_purchases
    WHERE user_id = p_user_id AND lead_id = p_lead_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify migration
SELECT
  'Migration completed' as status,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'price') as price_column_added,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_purchases') as purchases_table_created;
