import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;

  try {
    // For now, just parse the event (webhook signing can be added later)
    event = JSON.parse(body);
  } catch (err) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { leadId, userId, teamId, price } = session.metadata;

    try {
      // Get lead details for notification
      const { data: lead } = await supabase
        .from('leads')
        .select('property_county, property_state, acres')
        .eq('id', leadId)
        .single();

      // Record the purchase
      const { error } = await supabase
        .from('lead_purchases')
        .insert([{
          lead_id: leadId,
          user_id: userId,
          team_id: teamId,
          price_paid: parseFloat(price),
          stripe_payment_intent_id: session.payment_intent,
          purchased_at: new Date().toISOString()
        }]);

      if (error) {
        console.error('Failed to record purchase:', error);
        return Response.json({ error: 'Failed to record purchase' }, { status: 500 });
      }

      // Create notification for the purchase
      if (lead) {
        await supabase
          .from('notifications')
          .insert([{
            team_id: teamId,
            user_id: userId,
            title: 'Lead Purchased',
            message: `You purchased a lead: ${lead.acres || 'N/A'} acres in ${lead.property_county}, ${lead.property_state} for $${price}`,
            type: 'purchase',
            read: false,
            created_at: new Date().toISOString()
          }]);
      }

      console.log(`✅ Lead ${leadId} purchased by user ${userId} for $${price}`);
    } catch (err) {
      console.error('Error processing webhook:', err);
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  return Response.json({ received: true });
}
