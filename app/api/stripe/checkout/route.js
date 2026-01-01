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
    const { leadId, userId, teamId } = await request.json();

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Get price from team_lead_data (where admin sets price per team)
    let price = lead.price;
    if (teamId) {
      const { data: teamLeadData } = await supabase
        .from('team_lead_data')
        .select('purchase_price')
        .eq('lead_id', leadId)
        .eq('team_id', teamId)
        .single();

      if (teamLeadData?.purchase_price) {
        price = teamLeadData.purchase_price;
      }
    }

    if (!price || parseFloat(price) <= 0) {
      return Response.json({ error: 'Lead has no price set' }, { status: 400 });
    }

    // Check if already purchased
    const { data: existingPurchase } = await supabase
      .from('lead_purchases')
      .select('id')
      .eq('lead_id', leadId)
      .eq('user_id', userId)
      .single();

    if (existingPurchase) {
      return Response.json({ error: 'Lead already purchased' }, { status: 400 });
    }

    // Get user's email from auth to find their Stripe customer
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);
    const userEmail = user?.email;

    // Find existing Stripe customer by email
    let customer = null;
    if (userEmail) {
      const customers = await stripe.customers.list({
        email: userEmail,
        limit: 1
      });
      if (customers.data.length > 0) {
        customer = customers.data[0];
      }
    }

    // Try to charge saved card directly (one-click purchase)
    if (customer) {
      // Get customer's default payment method or first available
      let paymentMethodId = customer.invoice_settings?.default_payment_method;

      if (!paymentMethodId) {
        // Try to get from subscriptions
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'active',
          limit: 1
        });
        if (subscriptions.data.length > 0) {
          paymentMethodId = subscriptions.data[0].default_payment_method;
        }
      }

      if (!paymentMethodId) {
        // List payment methods directly
        const paymentMethods = await stripe.paymentMethods.list({
          customer: customer.id,
          type: 'card',
          limit: 1
        });
        if (paymentMethods.data.length > 0) {
          paymentMethodId = paymentMethods.data[0].id;
        }
      }

      // If we have a payment method, charge directly
      if (paymentMethodId) {
        try {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(parseFloat(price) * 100),
            currency: 'usd',
            customer: customer.id,
            payment_method: paymentMethodId,
            off_session: true,
            confirm: true,
            description: `Land Lead - ${lead.property_county || lead.county}, ${lead.property_state || lead.state}`,
            metadata: {
              leadId,
              userId,
              teamId,
              price: price
            }
          });

          if (paymentIntent.status === 'succeeded') {
            // Payment successful - record the purchase
            await supabase.from('lead_purchases').insert([{
              lead_id: leadId,
              user_id: userId,
              team_id: teamId,
              price: price,
              stripe_payment_intent_id: paymentIntent.id,
              purchased_at: new Date().toISOString()
            }]);

            return Response.json({
              success: true,
              directCharge: true,
              message: 'Lead purchased successfully'
            });
          }
        } catch (chargeError) {
          // If direct charge fails (e.g., card declined), fall back to checkout
          console.log('Direct charge failed, falling back to checkout:', chargeError.message);
        }
      }
    }

    // Fall back to checkout session if no saved card or direct charge failed
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Land Lead - ${lead.property_county || lead.county}, ${lead.property_state || lead.state}`,
              description: `${lead.acres || 'N/A'} acres`,
            },
            unit_amount: Math.round(parseFloat(price) * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${request.headers.get('origin')}/dashboard?purchase=success&lead_id=${leadId}`,
      cancel_url: `${request.headers.get('origin')}/dashboard?purchase=cancelled`,
      metadata: {
        leadId,
        userId,
        teamId,
        price: price
      }
    };

    if (customer) {
      sessionConfig.customer = customer.id;
    } else if (userEmail) {
      sessionConfig.customer_email = userEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return Response.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
