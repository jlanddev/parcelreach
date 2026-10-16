import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { computeVbbValue, FALLBACK_VALUE } from '@/lib/vbb';

// Dynamic value-based-bidding handler. From a lead's county + state + acreage range
// (fields the form already collects — no new questions), it scores the lead via
// LandPortal MLS comps (see lib/vbb.js) and returns the dollar value to feed Google
// Ads. Reporting only; never touches lead capture; ALWAYS returns a value (median
// fallback) so the conversion fire can't break or stall. Writes the full breakdown
// to the lead's form_data.vbb for the per-lead audit trail — including fallback cases.

export const dynamic = 'force-dynamic';

const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
});

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get('origin')) });
}

// Write the score + breakdown onto the lead so every row carries its own audit
// trail (median $/acre, resale, profit, comp count, final value, and whether it was
// a fallback). Best-effort — never blocks or fails the value response.
async function logVbbToLead(leadId, record) {
  if (!leadId) return;
  try {
    const sb = supabaseAdmin();
    const { data: cur } = await sb.from('leads').select('form_data').eq('id', leadId).maybeSingle();
    const fd = (cur && cur.form_data) || {};
    await sb.from('leads').update({
      form_data: { ...fd, vbb: { ...record, computed_at: new Date().toISOString() } },
    }).eq('id', leadId);
  } catch (e) {
    console.error('[google-vbb-handler] lead log failed', e?.message);
  }
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const respond = (conversionValue, extra = {}) =>
    NextResponse.json({ conversionValue, ...extra }, { headers: cors(origin) });
  const body = await request.json().catch(() => ({}));
  try {
    const { county, state, acres, isInherited } = body || {};
    const r = await computeVbbValue({ county, state, acres, isInherited });
    await logVbbToLead(body.leadId, r);
    return respond(r.value, r);
  } catch (err) {
    console.error('[google-vbb-handler]', err?.message);
    const errRec = { value: FALLBACK_VALUE, fallback: true, reason: 'error' };
    await logVbbToLead(body.leadId, errRec);
    return respond(FALLBACK_VALUE, errRec);
  }
}
