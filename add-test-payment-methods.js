require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function addTestPaymentMethods() {
  console.log('💳 Adding test payment methods to contractors...\n');

  // Get all contractors with Stripe customers
  const { data: contractors, error } = await supabase
    .from('contractors')
    .select('*')
    .not('stripe_customer_id', 'is', null);

  if (error) {
    console.error('Error fetching contractors:', error);
    return;
  }

  console.log(`Found ${contractors.length} contractors with Stripe customers\n`);

  for (const contractor of contractors) {
    try {
      // Create a test card token (works in test mode)
      const token = await stripe.tokens.create({
        card: {
          number: '4242424242424242',
          exp_month: 12,
          exp_year: 2025,
          cvc: '123',
        },
      });

      // Add card to customer using token
      const card = await stripe.customers.createSource(
        contractor.stripe_customer_id,
        { source: token.id }
      );

      // Set as default payment source
      await stripe.customers.update(contractor.stripe_customer_id, {
        default_source: card.id,
      });

      // Save to database
      await supabase.from('payment_methods').insert([{
        contractor_id: contractor.id,
        stripe_payment_method_id: card.id,
        is_default: true,
        last_four: '4242',
        card_type: 'visa',
      }]);

      console.log(`✅ Added test card to: ${contractor.email}`);
      console.log(`   Card ID: ${card.id}\n`);
    } catch (error) {
      console.error(`❌ Error for ${contractor.email}:`, error.message);
    }
  }

  console.log('\n✨ Done! All contractors now have test payment methods.');
  console.log('💰 Ready to charge! Submit a lead to test.');
}

addTestPaymentMethods();
