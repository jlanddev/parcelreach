import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email) {
    return Response.json({ error: 'Email parameter required' }, { status: 400 });
  }

  try {
    const supabase = getSupabase();
    // Find user by email
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email === email);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Get team memberships
    const { data: memberships } = await supabase
      .from('team_members')
      .select('*, teams(id, name, subscription_type, owner_id)')
      .eq('user_id', user.id);

    return Response.json({
      user: {
        id: user.id,
        email: user.email
      },
      memberships: memberships || [],
      message: memberships?.length > 1 ? 'User is member of multiple teams!' : 'User has single team membership'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
