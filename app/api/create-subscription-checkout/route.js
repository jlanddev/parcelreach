import { NextResponse } from 'next/server';
import Stripe from 'stripe';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function POST(request) {
  try {
    const stripe = getStripe();
    const body = await request.json();
    const { email, firstName, lastName, organizationName, phone } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: email,
        name: `${firstName || ''} ${lastName || ''}`.trim(),
        phone: phone || undefined,
        metadata: {
          organization_name: organizationName || '',
          first_name: firstName || '',
          last_name: lastName || ''
        }
      });
    }

    // Create Stripe Checkout Session with subscription and 7-day trial
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'ParcelReach Pro Membership',
              description: 'Monthly access to premium land seller leads',
            },
            unit_amount: 9700, // $97 in cents
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          organization_name: organizationName || '',
          first_name: firstName || '',
          last_name: lastName || ''
        }
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/signup/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/#signup`,
      metadata: {
        organization_name: organizationName || '',
        first_name: firstName || '',
        last_name: lastName || '',
        email: email
      }
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe subscription checkout error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
