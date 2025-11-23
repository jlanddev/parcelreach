require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', supabaseUrl ? '✓' : '✗');
console.log('Service key:', supabaseKey ? '✓' : '✗');

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixLeads() {
  console.log('🔧 Starting lead fix...\n');

  try {
    // Get Haven Ground user
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', 'jordan@havenground.com')
      .single();

    if (!users) {
      console.log('❌ User jordan@havenground.com not found');
      return;
    }

    console.log(`✓ Found user: ${users.email}`);

    // Get user's team
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('team_id, teams(*)')
      .eq('user_id', users.id);

    if (!teamMembers || teamMembers.length === 0) {
      console.log('❌ No team found');
      return;
    }

    const team = teamMembers[0].teams;
    console.log(`✓ Found team: ${team.name} (${team.id})\n`);

    // Get all leads with this team_id
    const { data: leads } = await supabase
      .from('leads')
      .select('id, team_id')
      .eq('team_id', team.id);

    console.log(`📊 Found ${leads?.length || 0} leads with team_id=${team.id}\n`);

    if (!leads || leads.length === 0) {
      console.log('❌ No leads to fix');
      return;
    }

    // Fix lead_assignments
    console.log('🔨 Fixing lead_assignments...');
    const { data: existingAssignments } = await supabase
      .from('lead_assignments')
      .select('lead_id')
      .eq('team_id', team.id);

    const existingAssignmentIds = new Set(existingAssignments?.map(a => a.lead_id) || []);
    const toAssign = leads.filter(l => !existingAssignmentIds.has(l.id));

    if (toAssign.length > 0) {
      const { error: assignError } = await supabase
        .from('lead_assignments')
        .insert(toAssign.map(l => ({
          team_id: team.id,
          lead_id: l.id
        })));

      if (assignError) {
        console.log(`❌ Error: ${assignError.message}`);
      } else {
        console.log(`✓ Created ${toAssign.length} lead assignments`);
      }
    } else {
      console.log('✓ All leads already assigned');
    }

    // Fix team_lead_data
    console.log('\n🔨 Fixing team_lead_data...');
    const { data: existingTeamData } = await supabase
      .from('team_lead_data')
      .select('lead_id')
      .eq('team_id', team.id);

    const existingDataIds = new Set(existingTeamData?.map(d => d.lead_id) || []);
    const toCreate = leads.filter(l => !existingDataIds.has(l.id));

    if (toCreate.length > 0) {
      const { error: dataError } = await supabase
        .from('team_lead_data')
        .insert(toCreate.map(l => ({
          team_id: team.id,
          lead_id: l.id,
          status: 'new'
        })));

      if (dataError) {
        console.log(`❌ Error: ${dataError.message}`);
      } else {
        console.log(`✓ Created ${toCreate.length} team_lead_data entries`);
      }
    } else {
      console.log('✓ All leads already have team_lead_data');
    }

    // Final stats
    console.log('\n📊 Final Stats:');
    const { count: finalAssignments } = await supabase
      .from('lead_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id);

    const { count: finalTeamData } = await supabase
      .from('team_lead_data')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id);

    console.log(`Leads assigned: ${finalAssignments}`);
    console.log(`Team lead data: ${finalTeamData}`);

    console.log('\n✅ Fix complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixLeads();
