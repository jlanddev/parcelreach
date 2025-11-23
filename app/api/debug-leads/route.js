import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { email } = await request.json();

    // Get user
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    // Get team
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id, teams(*)')
      .eq('user_id', users.id);

    const team = teamMembers[0].teams;

    // Simulate fetchLeads query
    const { data: assignments } = await supabase
      .from('lead_assignments')
      .select('lead_id')
      .eq('team_id', team.id);

    const assignedLeadIds = assignments?.map(a => a.lead_id) || [];

    // Query leads like dashboard does
    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        team_data:team_lead_data!inner(
          status,
          offer_price,
          contract_status
        )
      `)
      .in('id', assignedLeadIds.length > 0 ? assignedLeadIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('team_lead_data.team_id', team.id)
      .order('created_at', { ascending: false});

    return NextResponse.json({
      team: { id: team.id, name: team.name },
      assignedLeadIds,
      assignedCount: assignedLeadIds.length,
      fetchedCount: data?.length || 0,
      error: error?.message,
      leads: data || []
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
