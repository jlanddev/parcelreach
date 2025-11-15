-- Stripe Billing System Schema
-- Run this AFTER dynamic-pricing-schema.sql

-- Add Stripe fields to contractors table
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS daily_budget DECIMAL(10,2) DEFAULT 100.00;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS spent_today DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Payment methods table
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  last_four TEXT,
  card_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lead charges table
CREATE TABLE IF NOT EXISTS lead_charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id),
  stripe_charge_id TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  failure_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  retry_success BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily budget tracking
CREATE TABLE IF NOT EXISTS daily_budget_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  budget_amount DECIMAL(10,2) NOT NULL,
  spent_amount DECIMAL(10,2) DEFAULT 0.00,
  leads_received INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(contractor_id, date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_methods_contractor ON payment_methods(contractor_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods(contractor_id, is_default);
CREATE INDEX IF NOT EXISTS idx_lead_charges_contractor ON lead_charges(contractor_id);
CREATE INDEX IF NOT EXISTS idx_lead_charges_lead ON lead_charges(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_charges_status ON lead_charges(status);
CREATE INDEX IF NOT EXISTS idx_lead_charges_created ON lead_charges(created_at);
CREATE INDEX IF NOT EXISTS idx_daily_budget_tracking_contractor_date ON daily_budget_tracking(contractor_id, date);

-- RLS policies
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_budget_tracking ENABLE ROW LEVEL SECURITY;

-- Contractors can view their own payment methods
CREATE POLICY "Contractors can view own payment methods" ON payment_methods
    FOR SELECT USING (contractor_id = auth.uid());

-- Contractors can view their own charges
CREATE POLICY "Contractors can view own charges" ON lead_charges
    FOR SELECT USING (contractor_id = auth.uid());

-- Contractors can view their own budget tracking
CREATE POLICY "Contractors can view own budget tracking" ON daily_budget_tracking
    FOR SELECT USING (contractor_id = auth.uid());

-- For now, disable RLS (we'll add admin auth later)
ALTER TABLE payment_methods DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_charges DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_budget_tracking DISABLE ROW LEVEL SECURITY;

-- Function to reset daily budgets (run at midnight)
CREATE OR REPLACE FUNCTION reset_daily_budgets()
RETURNS void AS $$
BEGIN
  -- Archive today's spending
  INSERT INTO daily_budget_tracking (contractor_id, date, budget_amount, spent_amount, leads_received)
  SELECT
    id,
    CURRENT_DATE,
    daily_budget,
    spent_today,
    (SELECT COUNT(*) FROM lead_charges
     WHERE contractor_id = contractors.id
     AND DATE(created_at) = CURRENT_DATE
     AND status = 'succeeded')
  FROM contractors
  WHERE spent_today > 0;

  -- Reset spent_today to 0
  UPDATE contractors SET spent_today = 0.00;
END;
$$ LANGUAGE plpgsql;

-- Comment: Schedule this function to run daily at midnight using Supabase cron or external scheduler
