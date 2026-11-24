import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';

const GOWEST_PIXEL = '2057317551651711';

// Conversions API: send Lead (and Schedule) server-side to the Go West
// Mastermind pixel, sharing the browser's event_id so Facebook de-duplicates.
// Email + phone are hashed; hashed and raw contact details are never logged.
// Uses the Go West token only (GOWEST_META_TOKEN). Best-effort, never blocks.
async function sendGoWestCapi(opts) {
  const token = process.env.GOWEST_META_TOKEN;
  if (!token) return; // not configured; skip silently
  const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
  const email = (opts.email || '').trim().toLowerCase();
  let digits = (opts.phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '1' + digits; // US country code for matching
  const user_data = {};
  if (email && email !== 'n/a') user_data.em = [sha(email)];
  if (digits) user_data.ph = [sha(digits)];
  if (opts.fbc) user_data.fbc = opts.fbc;
  if (opts.fbp) user_data.fbp = opts.fbp;
  if (opts.ip) user_data.client_ip_address = opts.ip;
  if (opts.ua) user_data.client_user_agent = opts.ua;
  const now = Math.floor(Date.now() / 1000);
  const base = {
    action_source: 'website',
    event_source_url: opts.sourceUrl || 'https://gowestcapital.land',
    user_data,
    custom_data: { content_name: 'Go West Land Private Network' },
  };
  const events = [{ ...base, event_name: 'Lead', event_time: now, event_id: opts.leadEventId }];
  if (opts.scheduled && opts.scheduleEventId) {
    events.push({ ...base, event_name: 'Schedule', event_time: now, event_id: opts.scheduleEventId });
  }
  const payload = { data: events };
  if (opts.testEventCode) payload.test_event_code = opts.testEventCode;
  try {
    await fetch(`https://graph.facebook.com/v21.0/${GOWEST_PIXEL}/events?access_token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
  } catch { /* best-effort; a failed CAPI send must never break the application */ }
}

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

    // The Go West form posts these field names. Earlier this route read
    // body.message / body.has_50k, which the form never sends, so every written
    // answer was silently dropped. Read the real fields now.
    const application = {
      work_role: (body.work_role || '').trim(),            // What do you do for work?
      land_status: (body.land_status || '').trim(),        // Where are you with land development?
      capital: (body.capital || '').trim(),                // Capital set aside / access to
      goals: (body.goals || '').trim(),                    // What they want from membership
      why_you: (body.why_you || body.message || '').trim(),// Why we should consider them
    };
    const why = application.why_you;
    const has50k = (/^y/i.test(body.has_50k || '')
      || /\b(50|75|100|150|200|250|500)\s*k\b|\$?\s*(50|75|100|150|200|250|500),?000|\bmillion\b|\b1m\b|or more|500k\+/i.test(application.capital))
      ? 'Yes' : 'No';
    const apptAt = body.appointment_at || null;          // ISO UTC instant
    const apptLabel = body.appointment_label || null;    // friendly Central label
    const apptTz = body.appointment_tz || 'America/Chicago';
    const sourceLabel = body.source || 'Go West Lands Investor VSL';

    // Meta ad attribution for Go West (UTMs + fbclid/_fbc/_fbp). Stored on the
    // lead so each application carries its ad source into the CRM. This is Go
    // West's own pixel data; it is never sent to Haven's Google uploader or
    // Haven's pixel (investor leads use source 'go-west-lands', which both
    // exclude).
    const tracking = {
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
      utm_content: body.utm_content || null,   // ad name ({{ad.name}})
      utm_term: body.utm_term || null,         // ad set name ({{adset.name}})
      ad_id: body.ad_id || null,               // numeric Meta ad id ({{ad.id}})
      fbclid: body.fbclid || null,
      fbc: body._fbc || body.fbc || null,
      fbp: body._fbp || body.fbp || null,
      landing_url: body.landing_url || body.event_source_url || null,
      referrer: body.referrer || null,
      first_touch_at: body.first_touch_at || null,
    };

    const sb = supabaseAdmin();

    // Route the appointment to Jordan (the admin) so it lands on his calendar.
    let adminId = null;
    try {
      const { data: admin } = await sb.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
      adminId = admin?.id || null;
    } catch { /* non-fatal */ }

    // If they scheduled a time, the lead goes straight to the Appt Set stage.
    const scheduled = !!apptAt;

    // Args for the Conversions API send (same event_id as the browser pixel).
    const capiArgs = {
      email, phone,
      fbc: tracking.fbc, fbp: tracking.fbp,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      ua: request.headers.get('user-agent') || null,
      sourceUrl: body.event_source_url || request.headers.get('referer') || 'https://gowestcapital.land',
      scheduled,
      leadEventId: body.lead_event_id || null,
      scheduleEventId: body.schedule_event_id || null,
      testEventCode: body.test_event_code || null,
    };

    const { data: lead, error } = await sb.from('leads').insert([{
      name,
      full_name: name,
      email: email || 'N/A',
      phone: phone || 'N/A',
      address: 'Investor inquiry (no property)',
      city: 'N/A',
      source: 'go-west-lands',
      // Investor-only stages, never the seller stage APPT_SET_FOR_JORDAN, and not
      // owned by Jordan. Keeps mastermind applicants out of the seller pipeline
      // and off Jordan's calendar.
      status: 'new',
      pipeline_status: scheduled ? 'INVESTOR_CALL_BOOKED' : 'INVESTOR_APPLIED',
      current_owner_id: null,
      last_activity_at: new Date().toISOString(),
      form_data: {
        origin: 'go_west_lands',
        investor: true,
        application,
        has_50k: has50k,
        why,
        appointment_at: apptAt,
        appointment_label: apptLabel,
        appointment_tz: apptTz,
        source_label: sourceLabel,
        tracking,
      },
    }]).select().single();

    if (error) {
      // Some databases may not have pipeline_status; retry without it.
      const { data: lead2, error: err2 } = await sb.from('leads').insert([{
        name, full_name: name, email: email || 'N/A', phone: phone || 'N/A',
        address: 'Investor inquiry (no property)', city: 'N/A',
        source: 'go-west-lands', status: 'new',
        form_data: {
          origin: 'go_west_lands', investor: true, application, has_50k: has50k, why,
          appointment_at: apptAt, appointment_label: apptLabel, appointment_tz: apptTz, source_label: sourceLabel, tracking,
        },
      }]).select().single();
      if (err2) return NextResponse.json({ ok: false, error: err2.message }, { status: 500, headers: cors });
      await sendGoWestCapi(capiArgs);
      return NextResponse.json({ ok: true, leadId: lead2.id, scheduled }, { headers: cors });
    }

    // No scheduled_tasks meeting is created: investor calls must NOT land on
    // Jordan's calendar or the seller Mapped & Appointment Set tab. The booked
    // time lives on the investor lead (form_data.appointment_*) and will drive
    // Trevor's notification/calendar invite in a later phase.

    await sendGoWestCapi(capiArgs);
    return NextResponse.json({ ok: true, leadId: lead.id, scheduled }, { headers: cors });
  } catch (err) {
    console.error('[investor intake]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Intake failed' }, { status: 500, headers: cors });
  }
}
