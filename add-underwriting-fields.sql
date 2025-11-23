-- Add underwriting calculator fields to team_lead_data table
-- These fields are team-specific for deal analysis

ALTER TABLE team_lead_data
ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS comp1_acres DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS comp1_price DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS comp2_acres DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS comp2_price DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS comp3_acres DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS comp3_price DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS financing_costs DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS closing_costs DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS misc_costs DECIMAL(12, 2);
