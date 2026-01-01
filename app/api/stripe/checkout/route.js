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
    let customerId = null;
    if (userEmail) {
      const customers = await stripe.customers.list({
        email: userEmail,
        limit: 1
      });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    // Create Stripe checkout session with customer if found
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
            unit_amount: Math.round(parseFloat(price) * 100), // Convert to cents
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

    // Add customer to session if found - this pre-fills their saved card
    if (customerId) {
      sessionConfig.customer = customerId;
      sessionConfig.customer_update = { address: 'auto' };
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
