import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const steps = [];
  let testTeamId, testLeadId, testUserId;

  try {
    // STEP 1: Create test user
    steps.push({ step: 1, action: 'Creating test user...' });
    const { data: { user }, error: userError } = await supabase.auth.admin.createUser({
      email: `test-${Date.now()}@test.com`,
      password: 'TestPass123!',
      email_confirm: true
    });

    if (userError) {
      steps.push({ step: 1, status: 'FAILED', error: userError.message });
      return Response.json({ success: false, steps });
    }
    testUserId = user.id;
    steps.push({ step: 1, status: 'SUCCESS', userId: testUserId });

    // STEP 2: Create user in users table
    steps.push({ step: 2, action: 'Creating user profile...' });
    const { error: profileError } = await supabase
      .from('users')
      .insert([{
        id: testUserId,
        email: user.email,
        full_name: 'Test User'
      }]);

    if (profileError && !profileError.message.includes('duplicate')) {
      steps.push({ step: 2, status: 'FAILED', error: profileError.message });
    } else {
      steps.push({ step: 2, status: 'SUCCESS' });
    }

    // STEP 3: Create test team
    steps.push({ step: 3, action: 'Creating test team...' });
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert([{
        name: 'Test Team ' + Date.now(),
        subscription_type: 'pay-per-lead'
      }])
      .select()
      .single();

    if (teamError) {
      steps.push({ step: 3, status: 'FAILED', error: teamError.message });
      return Response.json({ success: false, steps });
    }
    testTeamId = team.id;
    steps.push({ step: 3, status: 'SUCCESS', teamId: testTeamId, teamName: team.name });

    // STEP 4: Add user to team
    steps.push({ step: 4, action: 'Adding user to team...' });
    const { error: memberError } = await supabase
      .from('team_members')
      .insert([{
        team_id: testTeamId,
        user_id: testUserId,
        role: 'owner'
      }]);

    if (memberError && !memberError.message.includes('duplicate')) {
      steps.push({ step: 4, status: 'FAILED', error: memberError.message });
    } else {
      steps.push({ step: 4, status: 'SUCCESS' });
    }

    // STEP 5: Create test lead with price
    steps.push({ step: 5, action: 'Creating priced lead...' });
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert([{
        name: 'Test Lead',
        full_name: 'Test Lead',
        email: 'lead@test.com',
        phone: '555-1234',
        address: '123 Test St',
        city: 'Austin',
        property_state: 'TX',
        property_county: 'Travis',
        acres: 50,
        price: 197.00,
        latitude: 30.2672,
        longitude: -97.7431,
        source: 'api-test'
      }])
      .select()
      .single();

    if (leadError) {
      steps.push({ step: 5, status: 'FAILED', error: leadError.message });
      return Response.json({ success: false, steps });
    }
    testLeadId = lead.id;
    steps.push({ step: 5, status: 'SUCCESS', leadId: testLeadId, price: lead.price });

    // STEP 6: Create lead assignment
    steps.push({ step: 6, action: 'Assigning lead to team...' });
    const { error: assignError } = await supabase
      .from('lead_assignments')
      .insert([{
        lead_id: testLeadId,
        team_id: testTeamId
      }]);

    if (assignError && !assignError.message.includes('duplicate')) {
      steps.push({ step: 6, status: 'FAILED', error: assignError.message });
    } else {
      steps.push({ step: 6, status: 'SUCCESS' });
    }

    // STEP 7: Create team_lead_data (like admin does)
    steps.push({ step: 7, action: 'Creating team_lead_data...' });
    const { error: teamDataError } = await supabase
      .from('team_lead_data')
      .insert([{
        team_id: testTeamId,
        lead_id: testLeadId,
        status: 'new',
        full_name: lead.full_name,
        email: lead.email,
        phone: lead.phone,
        street_address: lead.address,
        city: lead.city,
        property_state: lead.property_state,
        property_county: lead.property_county,
        acres: lead.acres
      }]);

    if (teamDataError && !teamDataError.message.includes('duplicate')) {
      steps.push({ step: 7, status: 'FAILED', error: teamDataError.message });
    } else {
      steps.push({ step: 7, status: 'SUCCESS' });
    }

    // STEP 8: Query like dashboard does
    steps.push({ step: 8, action: 'Fetching leads (dashboard query)...' });

    // First get assignments
    const { data: assignments } = await supabase
      .from('lead_assignments')
      .select('lead_id')
      .eq('team_id', testTeamId);

    const assignedLeadIds = assignments?.map(a => a.lead_id) || [];
    steps.push({ step: '8a', status: 'INFO', assignedLeadIds, count: assignedLeadIds.length });

    // Then query leads
    const { data: leads, error: queryError } = await supabase
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
      .eq('team_lead_data.team_id', testTeamId);

    if (queryError) {
      steps.push({ step: 8, status: 'FAILED', error: queryError.message });
    } else {
      steps.push({ step: 8, status: 'SUCCESS', leadsFound: leads?.length, leads });
    }

    // STEP 9: Test masking logic
    if (leads && leads.length > 0) {
      steps.push({ step: 9, action: 'Testing masking...' });
      const testLead = leads[0];
      const hasPrice = testLead.price && parseFloat(testLead.price) > 0;
      steps.push({
        step: 9,
        status: 'INFO',
        hasPrice,
        price: testLead.price,
        shouldBeMasked: hasPrice
      });
    }

    // CLEANUP
    steps.push({ step: 'cleanup', action: 'Cleaning up test data...' });
    await supabase.from('team_lead_data').delete().eq('team_id', testTeamId);
    await supabase.from('lead_assignments').delete().eq('team_id', testTeamId);
    await supabase.from('team_members').delete().eq('team_id', testTeamId);
    await supabase.from('leads').delete().eq('id', testLeadId);
    await supabase.from('teams').delete().eq('id', testTeamId);
    await supabase.auth.admin.deleteUser(testUserId);
    steps.push({ step: 'cleanup', status: 'SUCCESS' });

    return Response.json({
      success: true,
      summary: 'Full flow test completed',
      steps
    });

  } catch (error) {
    steps.push({ step: 'error', status: 'FAILED', error: error.message });
    return Response.json({ success: false, steps }, { status: 500 });
  }
}
