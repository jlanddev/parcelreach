-- Add purchase_price to team_lead_data for per-org pricing
-- This ensures each org has their own price for a lead
-- Org A can get it free while Org B pays $200

ALTER TABLE team_lead_data
ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(12, 2);

COMMENT ON COLUMN team_lead_data.purchase_price IS 'Price this team must pay to unlock lead (marketplace). NULL = already unlocked/free.';

-- Index for filtering priced leads
CREATE INDEX IF NOT EXISTS idx_team_lead_data_purchase_price ON team_lead_data(purchase_price);
