const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://xkeqkmpfjeyltqoomkjw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrZXFrbXBmamV5bHRxb29ta2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5OTcyMzUsImV4cCI6MjA3ODU3MzIzNX0.XYBKU9ombSnRiirRJdY7_YJoijvSIAQaMPpdkwRKJIw'
);

const contractors = [
  {
    email: 'harris@test.com',
    phone: '+17135551111',
    name: 'Harris Test Contractor',
    company_name: 'Harris Garage Pros',
    counties: ['Harris'],
    daily_lead_cap: 10,
    job_types: ['residential', 'commercial'],
    status: 'active',
    membership_tier: 'basic',
    price_per_lead: 30.00,
  },
  {
    email: 'fortbend@test.com',
    phone: '+12815552222',
    name: 'Fort Bend Test Contractor',
    company_name: 'Fort Bend Door Services',
    counties: ['Fort Bend'],
    daily_lead_cap: 10,
    job_types: ['residential', 'commercial'],
    status: 'active',
    membership_tier: 'basic',
    price_per_lead: 30.00,
  },
  {
    email: 'montgomery@test.com',
    phone: '+19365553333',
    name: 'Montgomery Test Contractor',
    company_name: 'Montgomery Garage Fix',
    counties: ['Montgomery'],
    daily_lead_cap: 10,
    job_types: ['residential', 'commercial'],
    status: 'active',
    membership_tier: 'basic',
    price_per_lead: 30.00,
  },
];

async function setupDummyContractors() {
  console.log('🔧 Setting up dummy contractor accounts...\n');

  for (const contractor of contractors) {
    const { data, error } = await supabase
      .from('contractors')
      .insert([contractor])
      .select();

    if (error) {
      if (error.code === '23505') {
        console.log(`⚠️  ${contractor.email} already exists - skipping`);
      } else {
        console.error(`❌ Error creating ${contractor.email}:`, error.message);
      }
    } else {
      console.log(`✅ Created: ${contractor.email} (${contractor.counties[0]} County)`);
      console.log(`   Phone: ${contractor.phone}`);
      console.log(`   Daily cap: ${contractor.daily_lead_cap} leads`);
      console.log(`   Price: $${contractor.price_per_lead}/lead\n`);
    }
  }

  console.log('\n✨ Done! You now have 3 test contractors ready to receive leads.');
  console.log('\n📋 Test numbers to use:');
  console.log('   Harris County: +17135551111');
  console.log('   Fort Bend County: +12815552222');
  console.log('   Montgomery County: +19365553333');
}

setupDummyContractors();
