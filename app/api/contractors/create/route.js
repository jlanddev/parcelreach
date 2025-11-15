import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStripeCustomer } from '../../../../lib/stripe-billing.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { email, name, company_name, phone } = await request.json();

    // Create contractor in Supabase
    const { data: contractor, error } = await supabase
      .from('contractors')
      .insert([
        {
          email,
          name,
          company_name,
          phone,
          is_active: true,
          daily_budget: 100.00,
          spent_today: 0.00,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating contractor:', error);
      return NextResponse.json(
        { error: 'Failed to create contractor', details: error.message },
        { status: 500 }
      );
    }

    // Create Stripe customer
    await createStripeCustomer(contractor);

    return NextResponse.json({
      success: true,
      contractor: contractor,
    });
  } catch (error) {
    console.error('Create contractor error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
