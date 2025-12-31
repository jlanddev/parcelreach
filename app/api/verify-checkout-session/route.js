import { NextResponse } from 'next/server';
import Stripe from 'stripe';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function GET(request) {
  try {
    const stripe = getStripe();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer']
    });

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      // For trial subscriptions, payment might not be "paid" yet
      if (!session.subscription) {
        return NextResponse.json(
          { error: 'Payment not completed' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      session: {
        id: session.id,
        customer: session.customer?.id || session.customer,
        customer_email: session.customer_details?.email || session.customer?.email,
        subscription: session.subscription?.id || session.subscription,
        metadata: session.metadata,
        status: session.status
      }
    });
  } catch (error) {
    console.error('Session verification error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
