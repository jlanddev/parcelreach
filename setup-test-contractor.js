import { createClient } from '@supabase/supabase-js';

// Load the credentials directly
const supabase = createClient(
  'https://xkeqkmpfjeyltqoomkjw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrZXFrbXBmamV5bHRxb29ta2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5OTcyMzUsImV4cCI6MjA3ODU3MzIzNX0.XYBKU9ombSnRiirRJdY7_YJoijvSIAQaMPpdkwRKJIw'
);

async function setupTestContractor() {
  console.log('Creating test contractor...');
  
  const YOUR_PHONE = '+17139315872';
  
  const { data, error } = await supabase
    .from('contractors')
    .insert([{
      email: 'test@contractor.com',
      phone: YOUR_PHONE,
      name: 'Test Contractor',
      company_name: 'Test Garage Co',
      counties: ['Harris'],
      daily_lead_cap: 10,
      job_types: ['residential', 'commercial'],
      status: 'active',
      membership_tier: 'basic',
      price_per_lead: 25.00,
    }])
    .select();

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Test contractor created successfully!');
    console.log(data);
  }
}

setupTestContractor();
