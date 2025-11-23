import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { sendLeadPurchaseConfirmation } from '@/lib/email';

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
      // Get lead details for notification and email
      const { data: lead } = await supabase
        .from('leads')
        .select('property_county, property_state, county, state, acres, full_name, name, fullname, owner, email, owner_email, phone, owner_phone, street_address, address, property_address')
        .eq('id', leadId)
        .single();

      // Get user details for email
      const { data: user } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('id', userId)
        .single();

      // Record the purchase
      const { error: purchaseError } = await supabase
        .from('lead_purchases')
        .insert([{
          lead_id: leadId,
          user_id: userId,
          team_id: teamId,
          price_paid: parseFloat(price),
          stripe_payment_intent_id: session.payment_intent,
          purchased_at: new Date().toISOString()
        }]);

      if (purchaseError) {
        console.error('Failed to record purchase:', purchaseError);
        return Response.json({ error: 'Failed to record purchase' }, { status: 500 });
      }

      // Assign the purchased lead to the buyer's team
      const { error: assignmentError } = await supabase
        .from('lead_assignments')
        .insert([{
          lead_id: leadId,
          team_id: teamId,
          assigned_at: new Date().toISOString()
        }]);

      if (assignmentError) {
        console.error('Failed to assign purchased lead:', assignmentError);
      }

      // Create team_lead_data for the purchased lead
      const { error: teamDataError } = await supabase
        .from('team_lead_data')
        .insert([{
          lead_id: leadId,
          team_id: teamId,
          status: 'new',
          created_at: new Date().toISOString()
        }]);

      if (teamDataError) {
        console.error('Failed to create team lead data:', teamDataError);
      }

      // Create notification for the purchase
      if (lead) {
        const county = lead.property_county || lead.county || 'Unknown';
        const state = lead.property_state || lead.state || 'Unknown';

        const { error: notifError } = await supabase
          .from('notifications')
          .insert([{
            user_id: userId,
            lead_id: leadId,
            title: 'Lead Purchased',
            message: `You purchased a lead: ${lead.acres || 'N/A'} acres in ${county}, ${state} for $${price}`,
            type: 'lead_assigned',
            read: false
          }]);

        if (notifError) {
          console.error('❌ Failed to create notification:', notifError);
        } else {
          console.log('✅ Notification created for purchase');
        }

        // Send purchase confirmation email
        if (user && user.email) {
          try {
            // Use actual county/state values from lead
            const location = `${county} County, ${state}`;

            // Get owner name from various possible fields
            const ownerName = lead.full_name || lead.name || lead.fullname || lead.owner || 'Property Owner';

            // Get address from various possible fields
            const ownerAddress = lead.street_address || lead.address || lead.property_address || 'N/A';

            // Get contact info
            const ownerEmail = lead.email || lead.owner_email || 'N/A';
            const ownerPhone = lead.phone || lead.owner_phone || 'N/A';

            await sendLeadPurchaseConfirmation({
              toEmail: user.email,
              toName: user.full_name || 'there',
              leadName: ownerName,
              location,
              acres: lead.acres || 'N/A',
              price,
              email: ownerEmail,
              phone: ownerPhone,
              address: ownerAddress
            });
            console.log('✅ Purchase confirmation email sent');
          } catch (emailError) {
            console.error('❌ Failed to send purchase email:', emailError);
          }
        }
      }

      console.log(`✅ Lead ${leadId} purchased by user ${userId} for $${price}`);
    } catch (err) {
      console.error('Error processing webhook:', err);
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  return Response.json({ received: true });
}
