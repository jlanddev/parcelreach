import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function POST(request) {
  try {
    const stripe = getStripe();
    const supabase = getSupabase();
    const body = await request.json();
    const { email, name, company_name, phone, county, leads_per_day, password } = body;

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Create Stripe Checkout Session for card setup (no charge)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'setup',
      customer_email: email,
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/signup/success?free=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/onboarding-free?setup_canceled=true`,
      metadata: {
        contractor_name: name,
        company_name: company_name,
        phone: phone,
        county: county,
        leads_per_day: leads_per_day,
        free_account: 'true',
        auth_user_id: authData.user.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe setup error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
