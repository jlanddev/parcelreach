import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    // Check teams table
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*');

    // Check team_members table
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('*, users(email), teams(name)');

    // Find orphaned team_members (members without teams)
    const orphaned = members?.filter(m => !m.teams) || [];

    const report = {
      teams: {
        count: teams?.length || 0,
        data: teams || [],
        error: teamsError
      },
      team_members: {
        count: members?.length || 0,
        data: members || [],
        error: membersError
      },
      orphaned_members: {
        count: orphaned.length,
        data: orphaned,
        issue: orphaned.length > 0 ? 'CRITICAL: Team members exist without corresponding teams!' : null
      }
    };

    return Response.json(report);
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
