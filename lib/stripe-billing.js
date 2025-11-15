import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Create Stripe customer for new contractor
 */
export async function createStripeCustomer(contractorData) {
  try {
    const customer = await stripe.customers.create({
      email: contractorData.email,
      name: contractorData.company_name || contractorData.name,
      phone: contractorData.phone,
      metadata: {
        contractor_id: contractorData.id,
        county: contractorData.counties?.[0] || 'unknown',
      },
    });

    // Update contractor with stripe_customer_id
    const { error } = await supabase
      .from('contractors')
      .update({ stripe_customer_id: customer.id })
      .eq('id', contractorData.id);

    if (error) {
      console.error('Error updating contractor with Stripe ID:', error);
      return null;
    }

    return customer;
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    return null;
  }
}

/**
 * Create checkout session for payment method setup
 */
export async function createSetupSession(contractorId, stripeCustomerId) {
  try {
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'setup',
      payment_method_types: ['card'],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard?payment_setup=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard?payment_setup=cancel`,
      metadata: {
        contractor_id: contractorId,
      },
    });

    return session;
  } catch (error) {
    console.error('Error creating setup session:', error);
    return null;
  }
}

/**
 * Charge contractor for a lead
 */
export async function chargeContractorForLead(contractorId, leadId, amountDollars) {
  try {
    // 1. Get contractor
    const { data: contractor, error: contractorError } = await supabase
      .from('contractors')
      .select('*')
      .eq('id', contractorId)
      .single();

    if (contractorError || !contractor) {
      throw new Error('Contractor not found');
    }

    // 2. Check daily budget
    if (contractor.spent_today >= contractor.daily_budget) {
      return {
        success: false,
        reason: 'daily_budget_exceeded',
        message: `Daily budget of $${contractor.daily_budget} exceeded`,
      };
    }

    // 3. Check if contractor has Stripe customer ID
    if (!contractor.stripe_customer_id) {
      throw new Error('No Stripe customer ID for contractor');
    }

    const amountCents = Math.round(amountDollars * 100);

    // 4. Get customer's payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: contractor.stripe_customer_id,
      type: 'card',
    });

    if (!paymentMethods.data || paymentMethods.data.length === 0) {
      throw new Error('No payment method found for customer');
    }

    const defaultPaymentMethod = paymentMethods.data[0].id;

    // 5. Create Payment Intent (modern Stripe API)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: contractor.stripe_customer_id,
      payment_method: defaultPaymentMethod,
      description: `Garage door lead`,
      confirm: true,
      off_session: true,
      metadata: {
        lead_id: leadId,
        contractor_id: contractorId,
      },
    });

    // 5. Record successful charge
    await supabase.from('lead_charges').insert([{
      contractor_id: contractorId,
      lead_id: leadId,
      stripe_charge_id: paymentIntent.id,
      amount_cents: amountCents,
      status: 'succeeded',
    }]);

    // 6. Update daily spent
    await supabase
      .from('contractors')
      .update({
        spent_today: contractor.spent_today + amountDollars,
      })
      .eq('id', contractorId);

    return {
      success: true,
      chargeId: paymentIntent.id,
      amount: amountDollars,
    };
  } catch (error) {
    console.error('Error charging contractor:', error);

    // Record failed charge
    await supabase.from('lead_charges').insert([{
      contractor_id: contractorId,
      lead_id: leadId,
      amount_cents: Math.round(amountDollars * 100),
      status: 'failed',
      failure_reason: error.message,
    }]);

    return {
      success: false,
      reason: 'charge_failed',
      message: error.message,
    };
  }
}

/**
 * Get contractor billing info
 */
export async function getContractorBilling(contractorId) {
  const { data: contractor } = await supabase
    .from('contractors')
    .select('*')
    .eq('id', contractorId)
    .single();

  if (!contractor) {
    return null;
  }

  // Get today's leads
  const today = new Date().toISOString().split('T')[0];
  const { count: leadsToday } = await supabase
    .from('lead_charges')
    .select('*', { count: 'exact', head: true })
    .eq('contractor_id', contractorId)
    .eq('status', 'succeeded')
    .gte('created_at', today);

  // Get payment methods
  const { data: paymentMethods } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('contractor_id', contractorId);

  return {
    daily_budget: contractor.daily_budget,
    spent_today: contractor.spent_today,
    remaining_budget: contractor.daily_budget - contractor.spent_today,
    leads_received_today: leadsToday || 0,
    payment_methods: paymentMethods || [],
  };
}

/**
 * Update contractor's daily budget
 */
export async function updateDailyBudget(contractorId, newBudget) {
  const { error } = await supabase
    .from('contractors')
    .update({ daily_budget: newBudget })
    .eq('id', contractorId);

  if (error) {
    console.error('Error updating budget:', error);
    return false;
  }

  return true;
}

/**
 * Retry failed charges (run periodically)
 */
export async function retryFailedCharges() {
  // Get failed charges from last 24 hours with retry_count < 3
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: failedCharges } = await supabase
    .from('lead_charges')
    .select('*, contractors(*), leads(*)')
    .eq('status', 'failed')
    .lt('retry_count', 3)
    .gte('created_at', twentyFourHoursAgo);

  if (!failedCharges || failedCharges.length === 0) {
    return { retried: 0, succeeded: 0 };
  }

  let succeeded = 0;

  for (const charge of failedCharges) {
    try {
      const amountDollars = charge.amount_cents / 100;

      // Retry the charge
      const result = await chargeContractorForLead(
        charge.contractor_id,
        charge.lead_id,
        amountDollars
      );

      if (result.success) {
        // Mark original as retry_success
        await supabase
          .from('lead_charges')
          .update({ retry_success: true })
          .eq('id', charge.id);

        succeeded++;
      } else {
        // Increment retry count
        await supabase
          .from('lead_charges')
          .update({ retry_count: charge.retry_count + 1 })
          .eq('id', charge.id);
      }
    } catch (error) {
      console.error(`Error retrying charge ${charge.id}:`, error);
    }
  }

  return {
    retried: failedCharges.length,
    succeeded,
  };
}
