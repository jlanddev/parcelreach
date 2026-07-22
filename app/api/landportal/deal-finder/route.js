import { NextResponse } from 'next/server';
import { findDeals, LandPortalError } from '@/lib/landportal';

// POST /api/landportal/deal-finder
// Body: { fips:[...], parentMin, parentMax, childMin?, childMax?, soldDays, ratio }
// Returns for-sale parent listings priced under `ratio` of the median sold PPA
// of the exit (child) lot band in each county, plus the per-county benchmark.
// The child band auto-derives from the parent band (5-20 -> 1-3, 20+ -> 5-10)
// unless overridden. Filter-pool only (no metered hydration).
export async function POST(request) {
  try {
    const params = await request.json();
    const result = await findDeals(params || {});
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof LandPortalError) {
      const msg = err.code === 'mls_access_denied' ? 'This account does not have MLS data access.' : err.message;
      return NextResponse.json({ ok: false, code: err.code, error: msg }, { status: err.status || 500 });
    }
    console.error('[landportal deal-finder]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Deal finder failed' }, { status: 500 });
  }
}
