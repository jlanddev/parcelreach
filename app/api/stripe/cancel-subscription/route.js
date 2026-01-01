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
    const { userId, password } = await request.json();

    if (!userId || !password) {
      return Response.json({ error: 'User ID and password required' }, { status: 400 });
    }

    // Get user's email from auth
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);
    const userEmail = user?.email;

    if (!userEmail) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify password by attempting to sign in
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: password
    });

    if (authError) {
      return Response.json({ error: 'Incorrect password' }, { status: 401 });
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

    // Get active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return Response.json({ error: 'No active subscription found' }, { status: 404 });
    }

    const subscription = subscriptions.data[0];

    // Cancel at period end (not immediately)
    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true
    });

    // Determine the end date
    const endDate = new Date(updatedSubscription.current_period_end * 1000);
    const formattedEndDate = endDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    return Response.json({
      success: true,
      message: subscription.status === 'trialing'
        ? `Your trial has been cancelled. You'll retain access until ${formattedEndDate}.`
        : `Your subscription has been cancelled. You'll retain access until ${formattedEndDate}.`,
      endDate: formattedEndDate,
      status: subscription.status
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
