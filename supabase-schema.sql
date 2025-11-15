-- GarageLeadly Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Contractors table (user profiles)
CREATE TABLE contractors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  company_name TEXT,
  
  -- Territory configuration (county-based)
  counties TEXT[] NOT NULL, -- Array of counties they serve (must have at least 1)
  
  -- Lead preferences
  daily_lead_cap INTEGER DEFAULT 5,
  job_types TEXT[] DEFAULT ARRAY['residential', 'commercial'], -- ['residential', 'commercial'] or subset
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'suspended')),
  
  -- Billing
  membership_tier TEXT DEFAULT 'basic' CHECK (membership_tier IN ('basic', 'pro', 'enterprise')),
  price_per_lead DECIMAL(10,2) DEFAULT 25.00,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads table (consumer submissions from texasgaragefix.com)
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Consumer information
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  county TEXT NOT NULL, -- County for routing
  zip TEXT NOT NULL,
  issue TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('residential', 'commercial')),
  
  -- Lead routing
  contractor_id UUID REFERENCES contractors(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'contacted', 'converted', 'lost')),
  
  -- Timestamps
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_at TIMESTAMPTZ,
  contacted_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  
  -- Quality scoring (future enhancement)
  quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100)
);

-- Campaigns table (contractor lead preferences)
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contractor_id UUID REFERENCES contractors(id) NOT NULL,
  
  -- Campaign settings
  name TEXT NOT NULL,
  daily_cap INTEGER DEFAULT 5,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  
  -- Lead filters
  service_types TEXT[], -- ['repair', 'installation', 'emergency']
  job_types TEXT[], -- ['residential', 'commercial']
  min_job_value DECIMAL(10,2),
  
  -- Budget & spending
  budget DECIMAL(10,2),
  spent DECIMAL(10,2) DEFAULT 0.00,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions table (billing records)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contractor_id UUID REFERENCES contractors(id) NOT NULL,
  lead_id UUID REFERENCES leads(id),
  
  -- Transaction details
  type TEXT NOT NULL CHECK (type IN ('lead_charge', 'membership_fee', 'refund', 'credit')),
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  
  -- Payment method
  payment_method TEXT, -- 'stripe', 'card', etc.
  stripe_charge_id TEXT,
  
  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily lead count tracking (for cap enforcement)
CREATE TABLE daily_lead_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contractor_id UUID REFERENCES contractors(id) NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  lead_count INTEGER DEFAULT 0,
  
  UNIQUE(contractor_id, date)
);

-- Create indexes for better query performance
CREATE INDEX idx_contractors_status ON contractors(status);
CREATE INDEX idx_contractors_counties ON contractors USING GIN(counties);
CREATE INDEX idx_contractors_job_types ON contractors USING GIN(job_types);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_county ON leads(county);
CREATE INDEX idx_leads_job_type ON leads(job_type);
CREATE INDEX idx_leads_contractor ON leads(contractor_id);
CREATE INDEX idx_leads_submitted ON leads(submitted_at);
CREATE INDEX idx_campaigns_contractor ON campaigns(contractor_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_transactions_contractor ON transactions(contractor_id);
CREATE INDEX idx_transactions_lead ON transactions(lead_id);
CREATE INDEX idx_daily_counts_contractor_date ON daily_lead_counts(contractor_id, date);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_contractors_updated_at BEFORE UPDATE ON contractors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_lead_counts ENABLE ROW LEVEL SECURITY;

-- Contractors can only see their own data
CREATE POLICY "Contractors can view own profile" ON contractors
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Contractors can update own profile" ON contractors
    FOR UPDATE USING (auth.uid() = id);

-- Contractors can only see their assigned leads
CREATE POLICY "Contractors can view assigned leads" ON leads
    FOR SELECT USING (contractor_id = auth.uid());

-- Contractors can only see their own campaigns
CREATE POLICY "Contractors can view own campaigns" ON campaigns
    FOR SELECT USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can create own campaigns" ON campaigns
    FOR INSERT WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractors can update own campaigns" ON campaigns
    FOR UPDATE USING (contractor_id = auth.uid());

-- Contractors can only see their own transactions
CREATE POLICY "Contractors can view own transactions" ON transactions
    FOR SELECT USING (contractor_id = auth.uid());

-- Contractors can view their own daily counts
CREATE POLICY "Contractors can view own daily counts" ON daily_lead_counts
    FOR SELECT USING (contractor_id = auth.uid());

-- Contractor signup leads table (for sales pipeline)
CREATE TABLE contractor_signups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  county TEXT NOT NULL,
  current_leads TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'scheduled', 'qualified', 'closed', 'lost')),
  notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contractor_signups_status ON contractor_signups(status);
CREATE INDEX idx_contractor_signups_submitted ON contractor_signups(submitted_at);

-- Add updated_at trigger
CREATE TRIGGER update_contractor_signups_updated_at BEFORE UPDATE ON contractor_signups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Disable RLS for now (we'll add admin auth later)
ALTER TABLE contractor_signups DISABLE ROW LEVEL SECURITY;
