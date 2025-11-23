import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const { leadId, teamId } = await request.json();

    if (!leadId || !teamId) {
      return Response.json({ error: 'leadId and teamId required' }, { status: 400 });
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Find the signature request for this lead
    const { data, error } = await supabase
      .from('signature_requests')
      .select('*')
      .eq('lead_id', leadId)
      .eq('team_id', teamId)
      .eq('status', 'signed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return Response.json({ error: 'No signed agreement found' }, { status: 404 });
    }

    // Return the token so the frontend can open the signed PA
    return Response.json({
      token: data.token,
      signedAt: data.seller_signed_at,
      url: `https://parcelreach.ai/api/signed-pa/${data.token}`
    });

  } catch (error) {
    console.error('Error fetching signed PA:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
