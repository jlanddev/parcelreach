import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// POST /api/investor/intake
// Public intake for Go West Lands investor applications (the gowestcapital.land
// landing page posts here cross-origin). Creates a lead with source
// 'go-west-lands' so it shows in the CRM Investors tab, and books the chosen
// appointment as a scheduled_tasks meeting on Jordan's calendar.
//
// Body: { name, phone, email, has_50k ('Yes'|'No'), message, appointment_at
//   (ISO, UTC), appointment_label (friendly Central string), appointment_tz,
//   source ('Go West Lands Investor VSL') }

const ALLOWED_ORIGINS = [
  'https://gowestcapital.land',
  'https://www.gowestcapital.land',
  'https://go-west-capital.netlify.app',
  'https://go-west-lands.netlify.app',
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const cors = corsHeaders(request.headers.get('origin'));
  try {
    const body = await request.json();
    const name = (body.name || '').trim();
    const email = (body.email || '').trim();
    const phone = (body.phone || '').trim();
    if (!name || (!email && !phone)) {
      return NextResponse.json({ ok: false, error: 'Name and a contact method are required' }, { status: 400, headers: cors });
    }

    const has50k = /^y/i.test(body.has_50k || '') ? 'Yes' : 'No';
    const why = (body.message || '').trim();
    const apptAt = body.appointment_at || null;          // ISO UTC instant
    const apptLabel = body.appointment_label || null;    // friendly Central label
    const apptTz = body.appointment_tz || 'America/Chicago';
    const sourceLabel = body.source || 'Go West Lands Investor VSL';

    const sb = supabaseAdmin();

    // Route the appointment to Jordan (the admin) so it lands on his calendar.
    let adminId = null;
    try {
      const { data: admin } = await sb.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
      adminId = admin?.id || null;
    } catch { /* non-fatal */ }

    // If they scheduled a time, the lead goes straight to the Appt Set stage.
    const scheduled = !!apptAt;

    const { data: lead, error } = await sb.from('leads').insert([{
      name,
      full_name: name,
      email: email || 'N/A',
      phone: phone || 'N/A',
      address: 'Investor inquiry (no property)',
      city: 'N/A',
      source: 'go-west-lands',
      status: scheduled ? 'appt_set_for_jordan' : 'new',
      pipeline_status: scheduled ? 'APPT_SET_FOR_JORDAN' : 'NEW',
      current_owner_id: adminId,
      last_activity_at: new Date().toISOString(),
      form_data: {
        origin: 'go_west_lands',
        investor: true,
        has_50k: has50k,
        why,
        appointment_at: apptAt,
        appointment_label: apptLabel,
        appointment_tz: apptTz,
        source_label: sourceLabel,
      },
    }]).select().single();

    if (error) {
      // Some databases may not have pipeline_status; retry without it.
      const { data: lead2, error: err2 } = await sb.from('leads').insert([{
        name, full_name: name, email: email || 'N/A', phone: phone || 'N/A',
        address: 'Investor inquiry (no property)', city: 'N/A',
        source: 'go-west-lands', status: scheduled ? 'appt_set_for_jordan' : 'new',
        form_data: {
          origin: 'go_west_lands', investor: true, has_50k: has50k, why,
          appointment_at: apptAt, appointment_label: apptLabel, appointment_tz: apptTz, source_label: sourceLabel,
        },
      }]).select().single();
      if (err2) return NextResponse.json({ ok: false, error: err2.message }, { status: 500, headers: cors });
      return NextResponse.json({ ok: true, leadId: lead2.id, scheduled }, { headers: cors });
    }

    // Book the appointment as a meeting task so it appears on the Shared Calendar.
    if (scheduled) {
      await sb.from('scheduled_tasks').insert([{
        lead_id: lead.id,
        assigned_to: adminId,
        task_type: 'meeting',
        title: `Investor appointment: ${name}`,
        description: `Go West Lands investor. ${has50k === 'Yes' ? '$50k+ ready.' : 'Under $50k.'}${why ? ' Why: ' + why : ''}`,
        due_at: apptAt,
        priority: 'high',
        status: 'pending',
      }]).then(() => {}, () => { /* task is best-effort; appointment also lives on the lead */ });
    }

    return NextResponse.json({ ok: true, leadId: lead.id, scheduled }, { headers: cors });
  } catch (err) {
    console.error('[investor intake]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Intake failed' }, { status: 500, headers: cors });
  }
}
