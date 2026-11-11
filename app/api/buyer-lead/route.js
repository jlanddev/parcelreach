import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// POST /api/buyer-lead
// Public intake for BUYER leads (people interested in buying a Haven Ground
// property / wanting to hear about deals). Writes to the isolated `buyer_leads`
// table, never the seller `leads` table. Shows up in the CRM Dispo Center.
//
// Body: {
//   full_name | name, phone, email,
//   source,                       // e.g. 'Haven Ground - Property Inquiry'
//   property: { slug, title, price, acreage, url },  // what they're looking at
//   consent: { agreed, text, method },               // OTP checkbox consent
//   tracking: { gclid, gbraid, wbraid, utm_source, utm_medium, utm_campaign,
//               landing_url, referrer }
// }
//
// Duplicate phone (same buyer inquiring again) is merged into the existing
// buyer: the new property interest is appended, no second row is created.

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
      return NextResponse.json(
        { ok: false, error: 'A phone or email is required' },
        { status: 400, headers: cors },
      );
    }

    const source = (body.source || 'Haven Ground - Property Inquiry').trim();
    const message = (body.message || '').trim();
    const now = new Date().toISOString();

    // The property they're interested in (optional).
    const p = body.property || {};
    const propertyEntry = (p.slug || p.title || p.url)
      ? [{
          slug: p.slug || null,
          title: p.title || null,
          price: p.price ?? null,
          acreage: p.acreage ?? null,
          url: p.url || null,
          at: now,
        }]
      : [];

    // Consent captured at the verification checkbox.
    const c = body.consent || {};
    const consent = {
      agreed: c.agreed === true || /^y|^t|^1/i.test(String(c.agreed || '')),
      text: c.text || null,
      method: c.method || 'otp_checkbox',
      at: c.at || now,
    };

    // Attribution / click IDs so buyers map back to ad spend if needed.
    const t = body.tracking || {};
    const tracking = {
      gclid: t.gclid || null,
      gbraid: t.gbraid || null,
      wbraid: t.wbraid || null,
      utm_source: t.utm_source || null,
      utm_medium: t.utm_medium || null,
      utm_campaign: t.utm_campaign || null,
      landing_url: t.landing_url || null,
      referrer: t.referrer || null,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: request.headers.get('user-agent') || null,
    };

    const sb = supabaseAdmin();

    const row = {
      full_name: fullName || null,
      phone: phone || null,
      email: email || null,
      source,
      stage: 'New',
      stage_history: [{ stage: 'New', at: now }],
      status: 'active',
      properties: propertyEntry,
      tracking,
      consent,
      last_activity_at: now,
    };

    const { data: lead, error } = await sb.from('buyer_leads').insert([row]).select().single();

    if (error) {
      // 23505 = duplicate phone_norm. Merge the new interest into the existing
      // buyer instead of erroring or creating a second record.
      if (error.code === '23505' && phone) {
        const norm = phone.replace(/\D/g, '').slice(-10);
        const { data: existing } = await sb
          .from('buyer_leads')
          .select('id, properties, email, full_name')
          .eq('phone_norm', norm)
          .maybeSingle();

        if (existing) {
          const mergedProps = [...(existing.properties || []), ...propertyEntry];
          await sb.from('buyer_leads').update({
            properties: mergedProps,
            email: existing.email || email || null,
            full_name: existing.full_name || fullName || null,
            last_activity_at: now,
            updated_at: now,
          }).eq('id', existing.id);

          const mergeActs = [{
            buyer_lead_id: existing.id,
            type: 'inquiry',
            body: propertyEntry[0]?.title
              ? `Returning buyer inquired on ${propertyEntry[0].title}`
              : 'Returning buyer inquired again',
            meta: { property: propertyEntry[0] || null, source },
          }];
          if (message) mergeActs.push({ buyer_lead_id: existing.id, type: 'note', body: message });
          await sb.from('buyer_activities').insert(mergeActs).then(() => {}, () => {});

          return NextResponse.json(
            { ok: true, buyerId: existing.id, merged: true },
            { headers: cors },
          );
        }
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: cors });
    }

    // Log the first inquiry as an activity (best-effort), plus their message.
    const acts = [{
      buyer_lead_id: lead.id,
      type: 'inquiry',
      body: propertyEntry[0]?.title
        ? `New buyer inquired on ${propertyEntry[0].title}`
        : 'New buyer inquiry',
      meta: { property: propertyEntry[0] || null, source },
    }];
    if (message) acts.push({ buyer_lead_id: lead.id, type: 'note', body: message });
    await sb.from('buyer_activities').insert(acts).then(() => {}, () => {});

    return NextResponse.json({ ok: true, buyerId: lead.id }, { headers: cors });
  } catch (err) {
    console.error('[buyer-lead intake]', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Intake failed' },
      { status: 500, headers: cors },
    );
  }
}
