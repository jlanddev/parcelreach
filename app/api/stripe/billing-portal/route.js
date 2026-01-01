import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request) {
  try {
    const stripe = getStripe();
    const supabase = getSupabase();
    const { userId, returnUrl } = await request.json();

    // Get user's email from auth
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);
    const userEmail = user?.email;

    if (!userEmail) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Find Stripe customer by email
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 1
    });

    if (customers.data.length === 0) {
      return Response.json({ error: 'No billing account found' }, { status: 404 });
    }

    const customerId = customers.data[0].id;

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('Billing portal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Also support GET to get customer's payment method info
export async function GET(request) {
  try {
    const stripe = getStripe();
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return Response.json({ error: 'userId required' }, { status: 400 });
    }

    // Get user's email from auth
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);
    const userEmail = user?.email;

    if (!userEmail) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Find Stripe customer by email
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 1
    });

    if (customers.data.length === 0) {
      return Response.json({ card: null, subscription: null });
    }

    const customer = customers.data[0];

    // Get payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.id,
      type: 'card',
      limit: 1
    });

    // Get active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 1
    });

    const card = paymentMethods.data[0]?.card || null;
    const subscription = subscriptions.data[0] || null;

    return Response.json({
      card: card ? {
        brand: card.brand,
        last4: card.last4,
        expMonth: card.exp_month,
        expYear: card.exp_year
      } : null,
      subscription: subscription ? {
        status: subscription.status,
        trialEnd: subscription.trial_end,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      } : null
    });
  } catch (error) {
    console.error('Get billing info error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
