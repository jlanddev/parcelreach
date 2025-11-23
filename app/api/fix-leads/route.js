import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { email } = await request.json();

    const logs = [];
    const log = (message) => {
      console.log(message);
      logs.push(message);
    };

    log(`🔧 Fixing leads for ${email}`);

    // Get user
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (!users) {
      return NextResponse.json({ error: 'User not found', logs });
    }

    // Get team
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id, teams(*)')
      .eq('user_id', users.id);

    if (!teamMembers || teamMembers.length === 0) {
      return NextResponse.json({ error: 'No team found', logs });
    }

    const team = teamMembers[0].teams;
    log(`✓ Team: ${team.name} (${team.id})`);

    // Get leads
    const { data: leads } = await supabase
      .from('leads')
      .select('id, team_id')
      .eq('team_id', team.id);

    log(`📊 Found ${leads?.length || 0} leads`);

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, message: 'No leads to fix', logs });
    }

    // Fix assignments
    const { data: existingAssignments } = await supabase
      .from('lead_assignments')
      .select('lead_id')
      .eq('team_id', team.id);

    const existingIds = new Set(existingAssignments?.map(a => a.lead_id) || []);
    const toAssign = leads.filter(l => !existingIds.has(l.id));

    if (toAssign.length > 0) {
      await supabase
        .from('lead_assignments')
        .insert(toAssign.map(l => ({ team_id: team.id, lead_id: l.id })));
      log(`✓ Created ${toAssign.length} assignments`);
    }

    // Fix team_lead_data
    const { data: existingData } = await supabase
      .from('team_lead_data')
      .select('lead_id')
      .eq('team_id', team.id);

    const existingDataIds = new Set(existingData?.map(d => d.lead_id) || []);
    const toCreate = leads.filter(l => !existingDataIds.has(l.id));

    if (toCreate.length > 0) {
      await supabase
        .from('team_lead_data')
        .insert(toCreate.map(l => ({ team_id: team.id, lead_id: l.id, status: 'new' })));
      log(`✓ Created ${toCreate.length} team_lead_data`);
    }

    log('✅ Fix complete!');

    return NextResponse.json({ success: true, logs });
  } catch (error) {
    console.error('Fix error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
