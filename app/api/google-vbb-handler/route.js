import { NextResponse } from 'next/server';
import { fipsForCountyState, countyMedianPPA } from '@/lib/landportal';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Dynamic value-based-bidding handler. Given a lead's county + state + acreage
// range (the fields the form ALREADY collects — no new questions), it estimates
// what that size parcel resells for in that market from LandPortal MLS sold comps,
// applies Haven Ground's underwriting (buy at 50% of resale => profit is 50% of
// resale; must clear $10k; inherited sellers weighted x2), and returns the dollar
// value to feed Google Ads as the conversion value. Reporting only — this never
// touches lead capture, and ALWAYS returns a value (safe 1.00 fallback) so the
// form's conversion fire can never break or stall.

export const dynamic = 'force-dynamic';

const PROFIT_FLOOR = 15000; // must clear $15k gross or it's not a deal we want
const BUY_RATIO = 0.5;      // we always buy at ~50% of resale => profit = 50% of resale
const MIN_COMPS = 5;        // fewer sold comps than this => data too thin to trust, don't bid off it

const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
});

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get('origin')) });
}

// "2-5 Acres" -> {min:2, max:5, rep:3.5}; "100+ Acres" -> {min:100, max:320, rep:100}
function acreBand(acresStr) {
  const s = String(acresStr || '');
  const nums = (s.match(/\d+/g) || []).map(Number);
  if (!nums.length) return null;
  if (/\+/.test(s) || nums.length === 1) {
    const min = nums[0];
    return { min, max: Math.max(min * 3, min + 100), rep: min }; // open-ended: value off the floor, conservatively
  }
  const [min, max] = [nums[0], nums[1]];
  return { min, max, rep: (min + max) / 2 };
}

// Write the value breakdown onto the lead so every row carries its own audit
// trail: LandPortal median $/acre, resale, profit, comp count, and the final value
// fed to Google. Best-effort — never blocks or fails the value response.
async function logVbbToLead(leadId, breakdown) {
  if (!leadId) return;
  try {
    const sb = supabaseAdmin();
    const { data: cur } = await sb.from('leads').select('form_data').eq('id', leadId).maybeSingle();
    const fd = (cur && cur.form_data) || {};
    await sb.from('leads').update({
      form_data: { ...fd, vbb: { ...breakdown, computed_at: new Date().toISOString() } },
    }).eq('id', leadId);
  } catch (e) {
    console.error('[google-vbb-handler] lead log failed', e?.message);
  }
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const respond = (conversionValue, extra = {}) =>
    NextResponse.json({ conversionValue, ...extra }, { headers: cors(origin) });

  try {
    const body = await request.json().catch(() => ({}));
    const { county, state, acres, isInherited } = body || {};
    const inherited = /^(yes|true|1)$/i.test(String(isInherited ?? ''));

    const band = acreBand(acres);
    if (!band || band.min < 2) {
      // Under 2 acres is below the buy box (and the form already screens 0-2 out).
      return respond(0, { reason: 'below_acre_floor' });
    }

    const fips = await fipsForCountyState(county, state);
    if (!fips) return respond(1.0, { reason: 'fips_unresolved' }); // safe fallback

    const { medianPPA: ppa, N } = await countyMedianPPA(fips, { acreMin: band.min, acreMax: band.max });
    if (!ppa || ppa <= 0) return respond(1.0, { reason: 'no_comps', comps: N });
    // Thin data (a handful of sales) makes the median unreliable — don't bid off it.
    if (N < MIN_COMPS) return respond(1.0, { reason: 'low_confidence_comps', comps: N, ppa });

    const resale = ppa * band.rep;        // $/acre x representative acres in band
    const profit = resale * BUY_RATIO;    // we buy at 50% of resale

    const breakdown = { fips, ppa, resale: Math.round(resale), profit: Math.round(profit), comps: N, inherited, floor: PROFIT_FLOOR };

    if (profit < PROFIT_FLOOR) {
      await logVbbToLead(body.leadId, { ...breakdown, value: 0, reason: 'under_profit_floor' });
      return respond(0, { reason: 'under_profit_floor', ...breakdown });
    }

    const value = Math.round(profit * (inherited ? 2 : 1));
    await logVbbToLead(body.leadId, { ...breakdown, value });
    return respond(value, { ...breakdown, value });
  } catch (err) {
    console.error('[google-vbb-handler]', err?.message);
    return respond(1.0, { reason: 'error' }); // never break the form's conversion fire
  }
}
