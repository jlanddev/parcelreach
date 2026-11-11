import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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
      ? { slug: p.slug || null, title: p.title || null, price: p.price ?? null, acreage: p.acreage ?? null, url: p.url || null }
      : null;
    const c = body.consent || {};
    const consent = {
      agreed: c.agreed === true || /^y|^t|^1/i.test(String(c.agreed || '')),
      text: c.text || null, method: c.method || 'otp_checkbox', at: c.at || now,
    };
    const t = body.tracking || {};
    const tracking = {
      gclid: t.gclid || null, gbraid: t.gbraid || null, wbraid: t.wbraid || null,
      utm_source: t.utm_source || null, utm_medium: t.utm_medium || null, utm_campaign: t.utm_campaign || null,
      landing_url: t.landing_url || null, referrer: t.referrer || null,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    };

    const sb = supabaseAdmin();

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
        if (message) await sb.from('lead_notes').insert([{ lead_id: dup.id, content: message }]).then(() => {}, () => {});
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

    if (message) await sb.from('lead_notes').insert([{ lead_id: lead.id, content: message }]).then(() => {}, () => {});

    return NextResponse.json({ ok: true, leadId: lead.id }, { headers: cors });
  } catch (err) {
    console.error('[buyer-lead intake]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Intake failed' }, { status: 500, headers: cors });
  }
}
