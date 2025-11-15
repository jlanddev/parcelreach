-- Temporarily allow inserts for setup
ALTER TABLE contractors DISABLE ROW LEVEL SECURITY;

-- Insert test contractor with your phone number
INSERT INTO contractors (
  email,
  phone,
  name,
  company_name,
  counties,
  daily_lead_cap,
  job_types,
  status,
  membership_tier,
  price_per_lead
) VALUES (
  'test@contractor.com',
  '+17139315872',
  'Test Contractor',
  'Test Garage Co',
  ARRAY['Harris'],
  10,
  ARRAY['residential', 'commercial'],
  'active',
  'basic',
  25.00
);

-- Re-enable RLS
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;

-- Verify the contractor was created
SELECT email, phone, name, counties, job_types, daily_lead_cap FROM contractors;
