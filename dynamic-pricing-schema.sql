-- Dynamic Pricing Schema - Run this in Supabase SQL Editor

-- Platform settings (global config)
CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('platform_margin', '0.20', 'Default margin percentage (0.20 = 20%)'),
  ('fallback_cost_per_lead', '25.00', 'Fallback cost if Google Ads unavailable'),
  ('google_ads_enabled', 'false', 'Whether to pull from Google Ads API')
ON CONFLICT (setting_key) DO NOTHING;

-- Lead costs tracking
CREATE TABLE IF NOT EXISTS lead_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id) NOT NULL UNIQUE,
  contractor_id UUID REFERENCES contractors(id) NOT NULL,
  
  google_ads_cost DECIMAL(10,2),
  margin_applied DECIMAL(5,4) DEFAULT 0.20,
  platform_price DECIMAL(10,2) NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns to existing tables
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS google_ads_cost DECIMAL(10,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS margin_applied DECIMAL(5,4);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS calculated_price DECIMAL(10,2);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_lead_costs_lead ON lead_costs(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_costs_contractor ON lead_costs(contractor_id);

-- Disable RLS for now (we'll add admin auth later)
ALTER TABLE platform_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_costs DISABLE ROW LEVEL SECURITY;
