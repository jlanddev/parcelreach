import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';

// Conversions API: send a server-side Schedule event to the "Properties" buyer
// pixel (Oak Hill Reserve + future flips), sharing the browser's event_id so
// Meta de-duplicates. Email + phone are hashed; raw/hashed contact details are
// never logged. Uses the pixel-only token HAVEN_PROPERTIES_CAPI_TOKEN. This is
// the BUYER pixel only; it never touches the seller pixel. Best-effort, never
// blocks the lead write.
const PROPERTIES_PIXEL = '1828560981600056';
async function sendPropertiesCapi(opts) {
  const token = process.env.HAVEN_PROPERTIES_CAPI_TOKEN;
  if (!token || !opts.scheduleEventId) return; // not configured, or no browser event to match
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
  const event = {
    event_name: 'Schedule',
    event_time: Math.floor(Date.now() / 1000),
    event_id: opts.scheduleEventId,
    action_source: 'website',
    event_source_url: opts.sourceUrl || 'https://oakhillreserve.land',
    user_data,
    custom_data: { content_name: opts.contentName || 'Oak Hill Reserve' },
  };
  const payload = { data: [event] };
  if (opts.testEventCode) payload.test_event_code = opts.testEventCode;
  try {
    await fetch(`https://graph.facebook.com/v21.0/${PROPERTIES_PIXEL}/events?access_token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
  } catch { /* best-effort; a failed CAPI send must never break the intake */ }
}

// POST /api/buyer-lead
// Public intake for BUYER leads (people interested in buying a Haven Ground
// property). Buyers are written to the SAME `leads` table with source
// 'dispo-buyer', so in the CRM they render with the exact same lead card and
// every function (text, call, notes, follow-ups, stage) works. They are walled
// off from the seller board and from Google at the fetch/export layer, so a
// buyer never pollutes the seller pipeline or Google conversions.
//
// Body: { full_name|name, phone, email, source, property:{slug,title,price,
//   acreage,url}, message, consent:{agreed,text,method}, tracking:{...} }

const BUYER_SOURCE = 'dispo-buyer';

const ALLOWED_ORIGINS = [
  'https://havenground.com',
  'https://www.havenground.com',
  'https://haven-ground.netlify.app',
  'https://harmonlandcompany.com',
  'https://www.harmonlandcompany.com',
  'https://oakhillreserve.land',
  'https://www.oakhillreserve.land',
  'https://storied-daifuku-d264c3.netlify.app',
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
    const fullName = (body.full_name || body.name || '').trim();
    const email = (body.email || '').trim();
    const phone = (body.phone || '').trim();
    if (!phone && !email) {
      return NextResponse.json({ ok: false, error: 'A phone or email is required' }, { status: 400, headers: cors });
    }

    const sourceLabel = (body.source || 'Haven Ground - Property Inquiry').trim();
    const message = (body.message || '').trim();
    const now = new Date().toISOString();
    const p = body.property || {};
    const property = (p.slug || p.title || p.url)
      ? {
          slug: p.slug || null, title: p.title || null, price: p.price ?? null,
          acreage: p.acreage ?? null, county: p.county || null, state: p.state || null,
          label: p.label || null, url: p.url || null,
        }
      : null;
    const c = body.consent || {};
    const consent = {
      agreed: c.agreed === true || /^y|^t|^1/i.test(String(c.agreed || '')),
      text: c.text || null, method: c.method || 'otp_checkbox', at: c.at || now,
    };
    const t = body.tracking || {};
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const clientUa = request.headers.get('user-agent') || null;
    // Meta click ids may arrive nested (body.tracking) or top-level (Oak Hill site spreads them).
    const fbc = body._fbc || body.fbc || t.fbc || null;
    const fbp = body._fbp || body.fbp || t.fbp || null;
    const tracking = {
      gclid: t.gclid || body.gclid || null, gbraid: t.gbraid || null, wbraid: t.wbraid || null,
      utm_source: t.utm_source || body.utm_source || null, utm_medium: t.utm_medium || body.utm_medium || null,
      utm_campaign: t.utm_campaign || body.utm_campaign || null,
      fbclid: body.fbclid || t.fbclid || null, fbc, fbp,
      landing_url: t.landing_url || body.event_source_url || null, referrer: t.referrer || null,
      ip: clientIp,
    };
    // Args for the server-side Schedule CAPI send (same event_id as the browser pixel).
    const capiArgs = {
      email, phone, fbc, fbp, ip: clientIp, ua: clientUa,
      scheduleEventId: body.schedule_event_id || null,
      sourceUrl: body.event_source_url || null,
      contentName: (body.property && body.property.title) || 'Oak Hill Reserve',
      testEventCode: body.test_event_code || null,
    };

    const sb = supabaseAdmin();

    // lead_notes.user_id is NOT NULL, so system notes are authored by the admin.
    let noteAuthor = null;
    try {
      const { data: a } = await sb.from('users').select('id').eq('role', 'admin').order('created_at', { ascending: true }).limit(1).maybeSingle();
      noteAuthor = a?.id || null;
    } catch { /* non-fatal */ }

    // Dedup against an existing BUYER with the same phone (never a seller lead).
    const last10 = phone.replace(/\D/g, '').slice(-10);
    if (last10.length === 10) {
      const { data: existing } = await sb.from('leads')
        .select('id, phone, form_data, email, full_name')
        .eq('source', BUYER_SOURCE).ilike('phone', `%${last10.slice(-4)}%`);
      // Confirm an exact last-10 match (the ilike only prefilters on last 4).
      const dup = (existing || []).find((l) => (l.phone || '').replace(/\D/g, '').slice(-10) === last10);
      if (dup) {
        const fd = dup.form_data || {};
        const props = Array.isArray(fd.properties) ? fd.properties : (fd.property ? [fd.property] : []);
        if (property) props.push({ ...property, at: now });
        await sb.from('leads').update({
          email: dup.email || email || null,
          full_name: dup.full_name || fullName || null,
          last_activity_at: now,
          form_data: { ...fd, buyer: true, property: property || fd.property || null, properties: props },
        }).eq('id', dup.id);
        if (message && noteAuthor) {
          const { data: exists } = await sb.from('lead_notes').select('id').eq('lead_id', dup.id).eq('content', message).limit(1);
          if (!exists || exists.length === 0) {
            await sb.from('lead_notes').insert([{ lead_id: dup.id, user_id: noteAuthor, content: message }]).then(() => {}, () => {});
          }
        }
        await sendPropertiesCapi(capiArgs);
        return NextResponse.json({ ok: true, leadId: dup.id, merged: true }, { headers: cors });
      }
    }

    const row = {
      full_name: fullName || null,
      name: fullName || null,
      phone: phone || null,
      email: email || null,
      source: BUYER_SOURCE,
      status: 'new',
      pipeline_status: 'NEW',
      address: property?.title ? `Buyer interest: ${property.title}` : 'Buyer inquiry',
      last_activity_at: now,
      form_data: {
        buyer: true,
        property,
        properties: property ? [{ ...property, at: now }] : [],
        buyer_message: message || null,
        source_label: sourceLabel,
        consent,
        tracking,
        phone_last10: last10 || null,
      },
    };

    const { data: lead, error } = await sb.from('leads').insert([row]).select('id').single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: cors });

    if (message && noteAuthor) await sb.from('lead_notes').insert([{ lead_id: lead.id, user_id: noteAuthor, content: message }]).then(() => {}, () => {});

    await sendPropertiesCapi(capiArgs);
    return NextResponse.json({ ok: true, leadId: lead.id }, { headers: cors });
  } catch (err) {
    console.error('[buyer-lead intake]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Intake failed' }, { status: 500, headers: cors });
  }
}
