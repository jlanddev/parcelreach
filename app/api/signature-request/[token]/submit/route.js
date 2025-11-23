import { createClient } from '@supabase/supabase-js';

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const { signatureData } = await request.json();

    if (!token || !signatureData) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Update signature request with seller signature
    const { data: sigRequest, error: updateError } = await supabase
      .from('signature_requests')
      .update({
        seller_signature: signatureData,
        seller_signed_at: new Date().toISOString(),
        status: 'signed'
      })
      .eq('token', token)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating signature:', updateError);
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    // Update lead contract status if lead_id and team_id exist
    if (sigRequest.lead_id && sigRequest.team_id) {
      await supabase
        .from('team_lead_data')
        .update({
          contract_status: 'signed',
          contract_signed_date: new Date().toISOString()
        })
        .eq('lead_id', sigRequest.lead_id)
        .eq('team_id', sigRequest.team_id);
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('Error submitting signature:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
