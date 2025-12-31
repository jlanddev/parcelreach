import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import crypto from 'crypto';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function POST(request) {
  const supabase = getSupabase();
  const stripe = getStripe();

  const body = await request.json().catch(() => ({}));
  const testId = crypto.randomBytes(4).toString('hex');
  const testEmail = body.email || `test_${testId}@parcelreach-test.com`;
  const firstName = body.firstName || 'Test';
  const lastName = body.lastName || `User_${testId}`;
  const orgName = body.orgName || `Test Org ${testId}`;

  const results = {
    testId,
    steps: [],
    success: true,
    error: null
  };

  try {
    // ============================================
    // STEP 1: Create Stripe Customer
    // ============================================
    console.log('📍 Step 1: Creating Stripe customer...');
    const customer = await stripe.customers.create({
      email: testEmail,
      name: `${firstName} ${lastName}`,
      metadata: {
        test: 'true',
        testId,
        organization_name: orgName
      }
    });
    results.steps.push({
      step: 1,
      name: 'Create Stripe Customer',
      success: true,
      data: { customerId: customer.id, email: customer.email }
    });

    // ============================================
    // STEP 2: Create Stripe Subscription with Trial
    // ============================================
    console.log('📍 Step 2: Creating Stripe subscription...');

    // First create a price
    const product = await stripe.products.create({
      name: `Test Subscription ${testId}`,
      metadata: { test: 'true' }
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 9700,
      currency: 'usd',
      recurring: { interval: 'month' }
    });

    // Create subscription with trial (no payment method needed for trial)
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      trial_period_days: 7,
      metadata: { test: 'true', testId }
    });

    results.steps.push({
      step: 2,
      name: 'Create Stripe Subscription',
      success: true,
      data: {
        subscriptionId: subscription.id,
        status: subscription.status,
        trialEnd: new Date(subscription.trial_end * 1000).toISOString()
      }
    });

    // ============================================
    // STEP 3: Create Supabase Auth User
    // ============================================
    console.log('📍 Step 3: Creating Supabase auth user...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: `TestPass123!${testId}`,
      email_confirm: true,
      user_metadata: {
        full_name: `${firstName} ${lastName}`,
        first_name: firstName,
        last_name: lastName,
        organization_name: orgName,
        stripe_customer_id: customer.id,
        stripe_subscription_id: subscription.id,
        test: true
      }
    });

    if (authError) throw new Error(`Auth error: ${authError.message}`);

    results.steps.push({
      step: 3,
      name: 'Create Supabase Auth User',
      success: true,
      data: { userId: authData.user.id, email: authData.user.email }
    });

    // ============================================
    // STEP 4: Create User Profile
    // ============================================
    console.log('📍 Step 4: Creating user profile...');
    const { error: userError } = await supabase
      .from('users')
      .upsert([{
        id: authData.user.id,
        email: testEmail,
        full_name: `${firstName} ${lastName}`,
        first_name: firstName,
        last_name: lastName,
        created_at: new Date().toISOString()
      }], { onConflict: 'id' });

    if (userError) throw new Error(`User profile error: ${userError.message}`);

    results.steps.push({
      step: 4,
      name: 'Create User Profile',
      success: true,
      data: { userId: authData.user.id }
    });

    // ============================================
    // STEP 5: Create Team
    // ============================================
    console.log('📍 Step 5: Creating team...');
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .insert([{
        name: orgName,
        subscription_type: 'monthly',
        owner_id: authData.user.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (teamError) throw new Error(`Team error: ${teamError.message}`);

    results.steps.push({
      step: 5,
      name: 'Create Team',
      success: true,
      data: { teamId: teamData.id, teamName: teamData.name }
    });

    // ============================================
    // STEP 6: Create Team Member
    // ============================================
    console.log('📍 Step 6: Creating team member...');
    const { error: memberError } = await supabase
      .from('team_members')
      .insert([{
        team_id: teamData.id,
        user_id: authData.user.id,
        role: 'owner'
      }]);

    if (memberError) throw new Error(`Team member error: ${memberError.message}`);

    results.steps.push({
      step: 6,
      name: 'Create Team Member',
      success: true,
      data: { teamId: teamData.id, role: 'owner' }
    });

    // ============================================
    // STEP 7: Create Test Lead
    // ============================================
    console.log('📍 Step 7: Creating test lead...');
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .insert([{
        full_name: `Test Owner ${testId}`,
        email: `testowner_${testId}@example.com`,
        phone: '555-123-4567',
        property_county: 'Travis',
        property_state: 'TX',
        county: 'Travis',
        state: 'TX',
        acres: 15.5,
        price: 125,
        street_address: `${Math.floor(Math.random() * 9999)} Test Ranch Rd`,
        source: 'e2e_test',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (leadError) throw new Error(`Lead error: ${leadError.message}`);

    results.steps.push({
      step: 7,
      name: 'Create Test Lead',
      success: true,
      data: { leadId: leadData.id, price: leadData.price, acres: leadData.acres }
    });

    // ============================================
    // STEP 8: Simulate Lead Purchase
    // ============================================
    console.log('📍 Step 8: Simulating lead purchase...');

    // Create payment intent for the lead
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 12500, // $125
      currency: 'usd',
      customer: customer.id,
      metadata: {
        test: 'true',
        testId,
        leadId: leadData.id,
        userId: authData.user.id
      },
      // Use test payment method
      payment_method: 'pm_card_visa',
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      }
    });

    results.steps.push({
      step: 8,
      name: 'Create Payment Intent',
      success: true,
      data: {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100
      }
    });

    // ============================================
    // STEP 9: Record Lead Purchase
    // ============================================
    console.log('📍 Step 9: Recording lead purchase...');
    const { error: purchaseError } = await supabase
      .from('lead_purchases')
      .insert([{
        lead_id: leadData.id,
        user_id: authData.user.id,
        team_id: teamData.id,
        price_paid: 125,
        stripe_payment_intent_id: paymentIntent.id,
        purchased_at: new Date().toISOString()
      }]);

    if (purchaseError) throw new Error(`Purchase error: ${purchaseError.message}`);

    results.steps.push({
      step: 9,
      name: 'Record Lead Purchase',
      success: true,
      data: { leadId: leadData.id, pricePaid: 125 }
    });

    // ============================================
    // STEP 10: Assign Lead to Team
    // ============================================
    console.log('📍 Step 10: Assigning lead to team...');
    const { error: assignError } = await supabase
      .from('lead_assignments')
      .insert([{
        lead_id: leadData.id,
        team_id: teamData.id,
        assigned_at: new Date().toISOString()
      }]);

    if (assignError) throw new Error(`Assignment error: ${assignError.message}`);

    results.steps.push({
      step: 10,
      name: 'Assign Lead to Team',
      success: true,
      data: { leadId: leadData.id, teamId: teamData.id }
    });

    // ============================================
    // STEP 11: Create Team Lead Data
    // ============================================
    console.log('📍 Step 11: Creating team lead data...');
    const { error: teamLeadError } = await supabase
      .from('team_lead_data')
      .insert([{
        lead_id: leadData.id,
        team_id: teamData.id,
        status: 'new',
        created_at: new Date().toISOString()
      }]);

    if (teamLeadError) throw new Error(`Team lead data error: ${teamLeadError.message}`);

    results.steps.push({
      step: 11,
      name: 'Create Team Lead Data',
      success: true,
      data: { leadId: leadData.id, status: 'new' }
    });

    // ============================================
    // STEP 12: Create Notification
    // ============================================
    console.log('📍 Step 12: Creating notification...');
    const { error: notifError } = await supabase
      .from('notifications')
      .insert([{
        user_id: authData.user.id,
        lead_id: leadData.id,
        title: 'Lead Purchased',
        message: `You purchased a lead: 15.5 acres in Travis County, TX for $125`,
        type: 'lead_assigned',
        read: false,
        created_at: new Date().toISOString()
      }]);

    if (notifError) throw new Error(`Notification error: ${notifError.message}`);

    results.steps.push({
      step: 12,
      name: 'Create Notification',
      success: true,
      data: { userId: authData.user.id, type: 'lead_assigned' }
    });

    // ============================================
    // STEP 13: Test FB Conversion API
    // ============================================
    console.log('📍 Step 13: Sending FB conversion event...');
    try {
      const fbResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://parcelreach.ai'}/api/fb-conversion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName: 'Purchase',
          email: testEmail,
          firstName,
          lastName,
          value: 125,
          currency: 'USD',
          contentName: 'Lead Purchase - E2E Test',
          eventId: `purchase_${testId}`
        })
      });
      const fbResult = await fbResponse.json();
      results.steps.push({
        step: 13,
        name: 'FB Conversion Event',
        success: fbResponse.ok,
        data: fbResult
      });
    } catch (fbError) {
      results.steps.push({
        step: 13,
        name: 'FB Conversion Event',
        success: false,
        error: fbError.message
      });
    }

    // Summary
    results.summary = {
      testId,
      testEmail,
      password: `TestPass123!${testId}`,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      userId: authData.user.id,
      teamId: teamData.id,
      teamName: orgName,
      leadId: leadData.id,
      paymentIntentId: paymentIntent.id,
      totalSteps: results.steps.length,
      successfulSteps: results.steps.filter(s => s.success).length
    };

    console.log('✅ Full simulation complete!');

  } catch (error) {
    console.error('❌ Simulation error:', error);
    results.success = false;
    results.error = error.message;
  }

  return NextResponse.json(results);
}

// GET endpoint to check simulation status
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/test/simulate',
    method: 'POST',
    description: 'Simulates full user signup, subscription, and lead purchase flow',
    usage: 'POST with optional body: { email, firstName, lastName, orgName }'
  });
}
