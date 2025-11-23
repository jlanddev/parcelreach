import { createClient } from '@supabase/supabase-js';

export async function GET(request, { params }) {
  try {
    const { token } = params;

    if (!token) {
      return Response.json({ error: 'No token provided' }, { status: 400 });
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from('signature_requests')
      .select('*')
      .eq('token', token)
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return Response.json({ error: error.message }, { status: 404 });
    }

    if (!data) {
      return Response.json({ error: 'Signature request not found' }, { status: 404 });
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      return Response.json({ error: 'This signature request has expired' }, { status: 410 });
    }

    return Response.json({ data });

  } catch (error) {
    console.error('Error fetching signature request:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
