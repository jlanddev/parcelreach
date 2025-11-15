import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSetupSession } from '../../../../lib/stripe-billing.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { contractor_id, counties, daily_budget } = await request.json();

    // Update contractor with campaign settings
    const { data: contractor, error: updateError } = await supabase
      .from('contractors')
      .update({
        counties: counties,
        daily_budget: daily_budget,
      })
      .eq('id', contractor_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating contractor:', updateError);
      return NextResponse.json(
        { error: 'Failed to update contractor', details: updateError.message },
        { status: 500 }
      );
    }

    if (!contractor.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer ID found' },
        { status: 400 }
      );
    }

    // Create Stripe setup session for payment method
    const session = await createSetupSession(
      contractor_id,
      contractor.stripe_customer_id
    );

    if (!session) {
      return NextResponse.json(
        { error: 'Failed to create payment setup session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      setupUrl: session.url,
    });
  } catch (error) {
    console.error('Update campaign error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
