// Quick script to check if teams exist in database
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTeams() {
  console.log('🔍 Checking teams in database...\n');

  // Check teams table
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('*');

  if (teamsError) {
    console.error('❌ Error fetching teams:', teamsError);
    return;
  }

  console.log(`✅ Found ${teams.length} teams in database:`);
  teams.forEach(team => {
    console.log(`  - ${team.name} (ID: ${team.id}, Owner: ${team.owner_id})`);
  });

  // Check team_members table
  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('*, users(email), teams(name)');

  if (membersError) {
    console.error('❌ Error fetching team members:', membersError);
    return;
  }

  console.log(`\n✅ Found ${members.length} team memberships:`);
  members.forEach(member => {
    console.log(`  - ${member.users?.email} → ${member.teams?.name} (Role: ${member.role})`);
  });

  // Check for orphaned team_members (members without teams)
  const orphaned = members.filter(m => !m.teams);
  if (orphaned.length > 0) {
    console.log(`\n⚠️  WARNING: ${orphaned.length} team members have no associated team!`);
    orphaned.forEach(m => {
      console.log(`  - User: ${m.users?.email}, Team ID: ${m.team_id}`);
    });
  }
}

checkTeams().then(() => process.exit(0));
