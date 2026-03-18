import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request) {
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { county, state, acreage, seller_name, agent_name, agent_phone, agent_email, parcel_id } = body;

    if (!county || !state) {
      return Response.json({ error: 'County and State are required' }, { status: 400 });
    }

    // Insert lead with ALL required NOT NULL columns
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert([{
        name: seller_name || 'Unknown Seller',
        full_name: seller_name || 'Unknown Seller',
        email: agent_email || 'subdivision@parcelreach.com',
        phone: agent_phone || 'N/A',
        address: `${county}, ${state}`,
        city: county,
        property_county: county,
        county: county,
        property_state: state,
        state: state,
        acres: parseFloat(acreage) || null,
        acreage: parseFloat(acreage) || null,
        parcel_id: parcel_id || null,
        source: 'subdivision',
        status: 'new',
        form_data: {
          agentName: agent_name || '',
          agentPhone: agent_phone || '',
          agentEmail: agent_email || ''
        }
      }])
      .select()
      .single();

    if (leadError) {
      console.error('Subdivision lead insert error:', leadError);
      return Response.json({ error: leadError.message }, { status: 500 });
    }

    // Auto-schedule for daily rundown
    const todayAt5 = new Date();
    todayAt5.setHours(17, 0, 0, 0);

    const { error: taskError } = await supabase
      .from('scheduled_tasks')
      .insert([{
        lead_id: lead.id,
        title: `NEW LEAD: ${lead.full_name}`,
        task_type: 'callback',
        priority: 'high',
        status: 'pending',
        due_at: todayAt5.toISOString(),
        notes: `Subdivision property - ${county}, ${state} - ${acreage || '?'} acres. Agent: ${agent_name || 'N/A'}`
      }]);

    if (taskError) {
      console.error('Scheduled task insert error (non-fatal):', taskError);
    }

    return Response.json({ success: true, lead });
  } catch (error) {
    console.error('Error in /api/subdivision/create:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
