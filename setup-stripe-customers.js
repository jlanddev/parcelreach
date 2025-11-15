require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function setupStripeCustomers() {
  console.log('🔧 Setting up Stripe customers for existing contractors...\n');

  // Get all contractors without stripe_customer_id
  const { data: contractors, error } = await supabase
    .from('contractors')
    .select('*')
    .is('stripe_customer_id', null);

  if (error) {
    console.error('Error fetching contractors:', error);
    return;
  }

  if (!contractors || contractors.length === 0) {
    console.log('✅ All contractors already have Stripe customers!');
    return;
  }

  console.log(`Found ${contractors.length} contractors without Stripe customers\n`);

  for (const contractor of contractors) {
    try {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: contractor.email,
        name: contractor.company_name || contractor.name,
        phone: contractor.phone,
        metadata: {
          contractor_id: contractor.id,
          county: contractor.counties?.[0] || 'unknown',
        },
      });

      // Update contractor with stripe_customer_id
      await supabase
        .from('contractors')
        .update({ stripe_customer_id: customer.id })
        .eq('id', contractor.id);

      console.log(`✅ Created Stripe customer for: ${contractor.email}`);
      console.log(`   Customer ID: ${customer.id}\n`);
    } catch (error) {
      console.error(`❌ Error for ${contractor.email}:`, error.message);
    }
  }

  console.log('\n✨ Done! All contractors now have Stripe customers.');
  console.log('\n📝 Next steps:');
  console.log('1. Contractors need to add payment method via dashboard');
  console.log('2. Or use Stripe test card: 4242 4242 4242 4242');
}

setupStripeCustomers();
