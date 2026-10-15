import { NextResponse } from 'next/server';
import { fipsForCountyState, countyCompInspect } from '@/lib/landportal';

// Audit tool: see the raw LandPortal sold comps behind a county's median $/acre,
// so a human can verify the data matches real life before any bidding runs on it.
// GET /api/landportal/comp-inspect?county=Waller&state=Texas&acres=2-5%20Acres&secret=...
// (or &acreMin=2&acreMax=5). Returns the median, comp COUNT, a confidence flag,
// and a sample of the actual sold listings. Protected — it exposes licensed MLS data.

export const dynamic = 'force-dynamic';

const MIN_COMPS = 5;

function acreBand(acresStr) {
  const s = String(acresStr || '');
  const nums = (s.match(/\d+/g) || []).map(Number);
  if (!nums.length) return { min: 2, max: 10 };
  if (/\+/.test(s) || nums.length === 1) { const min = nums[0]; return { min, max: Math.max(min * 3, min + 100) }; }
  return { min: nums[0], max: nums[1] };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = process.env.CAMPAIGN_RUN_SECRET;
  if (secret && searchParams.get('secret') !== secret && (request.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const county = searchParams.get('county');
    const state = searchParams.get('state');
    const acres = searchParams.get('acres');
    const acreMin = searchParams.get('acreMin');
    const acreMax = searchParams.get('acreMax');
    const band = (acreMin && acreMax) ? { min: Number(acreMin), max: Number(acreMax) } : acreBand(acres);

    const fips = await fipsForCountyState(county, state);
    if (!fips) return NextResponse.json({ ok: false, error: 'Could not resolve county+state to FIPS', county, state });

    const inspect = await countyCompInspect(fips, { acreMin: band.min, acreMax: band.max });
    const count = inspect?.count || 0;
    return NextResponse.json({
      ok: true,
      county, state, fips, band,
      medianPricePerAcre: inspect?.medianPPA ?? null,
      compCount: count,
      confidence: count >= MIN_COMPS ? 'ok' : 'LOW — too few comps to trust',
      sampleComps: inspect?.sample || [],
    });
  } catch (err) {
    console.error('[comp-inspect]', err?.message);
    return NextResponse.json({ ok: false, error: err?.message || 'failed' }, { status: 500 });
  }
}
