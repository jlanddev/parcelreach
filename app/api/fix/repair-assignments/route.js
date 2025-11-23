import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const results = [];

  try {
    // Get all lead_assignments
    const { data: assignments } = await supabase
      .from('lead_assignments')
      .select('lead_id, team_id');

    results.push({ step: 'fetch', count: assignments?.length, assignments });

    // For each assignment, check if team_lead_data exists
    let fixed = 0;
    let skipped = 0;

    for (const assignment of assignments || []) {
      // Check if team_lead_data exists
      const { data: existing } = await supabase
        .from('team_lead_data')
        .select('id')
        .eq('team_id', assignment.team_id)
        .eq('lead_id', assignment.lead_id)
        .single();

      if (!existing) {
        // Missing - create it
        const { error } = await supabase
          .from('team_lead_data')
          .insert([{
            team_id: assignment.team_id,
            lead_id: assignment.lead_id,
            status: 'new'
          }]);

        if (!error) {
          fixed++;
          results.push({
            action: 'created',
            team_id: assignment.team_id,
            lead_id: assignment.lead_id
          });
        } else {
          results.push({
            action: 'failed',
            team_id: assignment.team_id,
            lead_id: assignment.lead_id,
            error: error.message
          });
        }
      } else {
        skipped++;
      }
    }

    results.push({
      summary: 'Repair complete',
      fixed,
      skipped
    });

    return Response.json({ success: true, results });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      results
    }, { status: 500 });
  }
}
