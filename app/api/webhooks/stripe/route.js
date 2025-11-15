import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 });
  }

  console.log('📨 Stripe webhook received:', event.type);

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;

    case 'setup_intent.succeeded':
      await handleSetupIntentSucceeded(event.data.object);
      break;

    case 'payment_method.attached':
      await handlePaymentMethodAttached(event.data.object);
      break;

    case 'charge.failed':
      await handleChargeFailed(event.data.object);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session) {
  console.log('✅ Checkout completed:', session.id);
  console.log('📋 Session mode:', session.mode);
  console.log('📋 Session metadata:', JSON.stringify(session.metadata));
  console.log('📋 Customer email:', session.customer_email);

  if (session.mode === 'setup') {
    // Payment method setup completed
    let contractorId = session.metadata?.contractor_id;

    // Check if this is a free account setup (no existing contractor)
    if (!contractorId && session.metadata?.free_account === 'true') {
      console.log('📝 Creating new contractor from free signup');

      // Create Stripe customer first
      const customer = await stripe.customers.create({
        email: session.customer_email,
        name: session.metadata?.contractor_name,
        metadata: {
          company_name: session.metadata?.company_name,
          phone: session.metadata?.phone,
        },
      });

      // Create contractor record
      const contractorData = {
        id: session.metadata?.auth_user_id, // Link to auth user
        email: session.customer_email,
        name: session.metadata?.contractor_name,
        company_name: session.metadata?.company_name,
        phone: session.metadata?.phone,
        stripe_customer_id: customer.id,
        counties: session.metadata?.county ? [session.metadata.county] : [],
        status: 'active',
      };

      console.log('📝 Attempting to create contractor with data:', JSON.stringify(contractorData));

      const { data: newContractor, error } = await supabase
        .from('contractors')
        .insert([contractorData])
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating contractor:', JSON.stringify(error));
        console.error('❌ Error details:', error.message, error.details, error.hint);
        return;
      }

      contractorId = newContractor.id;
      console.log(`✅ Created contractor: ${contractorId}`);

      // Create campaign
      await supabase.from('campaigns').insert([{
        contractor_id: contractorId,
        leads_per_day: parseInt(session.metadata?.leads_per_day || '3'),
        is_active: true,
      }]);

      console.log(`✅ Created campaign for contractor ${contractorId}`);
    }

    if (!contractorId) {
      console.error('No contractor_id in session metadata');
      return;
    }

    // Get the setup intent and payment method
    const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent);
    const paymentMethodId = setupIntent.payment_method;

    if (paymentMethodId) {
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

      // Attach payment method to customer
      const { data: contractor } = await supabase
        .from('contractors')
        .select('stripe_customer_id')
        .eq('id', contractorId)
        .single();

      if (contractor?.stripe_customer_id) {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: contractor.stripe_customer_id,
        });
      }

      // Save payment method to database
      await supabase.from('payment_methods').insert([{
        contractor_id: contractorId,
        stripe_payment_method_id: paymentMethodId,
        is_default: true,
        last_four: paymentMethod.card?.last4,
        card_type: paymentMethod.card?.brand,
      }]);

      console.log(`✅ Payment method saved for contractor ${contractorId}`);
    }
  }
}

async function handleSetupIntentSucceeded(setupIntent) {
  console.log('✅ Setup intent succeeded:', setupIntent.id);
}

async function handlePaymentMethodAttached(paymentMethod) {
  console.log('💳 Payment method attached:', paymentMethod.id);

  // Payment method is attached to customer
  const customerId = paymentMethod.customer;

  if (!customerId) return;

  // Find contractor by stripe_customer_id
  const { data: contractor } = await supabase
    .from('contractors')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!contractor) {
    console.error('No contractor found for customer:', customerId);
    return;
  }

  // Save payment method if not already saved
  const { data: existing } = await supabase
    .from('payment_methods')
    .select('id')
    .eq('stripe_payment_method_id', paymentMethod.id)
    .single();

  if (!existing) {
    await supabase.from('payment_methods').insert([{
      contractor_id: contractor.id,
      stripe_payment_method_id: paymentMethod.id,
      is_default: true,
      last_four: paymentMethod.card?.last4,
      card_type: paymentMethod.card?.brand,
    }]);
  }
}

async function handleChargeFailed(charge) {
  console.error('❌ Charge failed:', charge.id, charge.failure_message);

  // Record the failed charge
  const contractorId = charge.metadata?.contractor_id;
  const leadId = charge.metadata?.lead_id;

  if (contractorId && leadId) {
    await supabase.from('lead_charges').insert([{
      contractor_id: contractorId,
      lead_id: leadId,
      stripe_charge_id: charge.id,
      amount_cents: charge.amount,
      status: 'failed',
      failure_reason: charge.failure_message,
    }]);
  }
}

async function handleSubscriptionDeleted(subscription) {
  console.log('❌ Subscription deleted:', subscription.id);

  // Deactivate contractor
  const customerId = subscription.customer;

  await supabase
    .from('contractors')
    .update({ is_active: false })
    .eq('stripe_customer_id', customerId);
}
