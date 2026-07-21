import { NextResponse } from 'next/server';
import { runHydration, LandPortalError } from '@/lib/landportal';

// POST /api/landportal/hydrate/run
// Body: { items: [{ property_id, fips }], cap? }
// Hydrates the new (uncached) parcels, spending pool then tokens under the
// per-run cap + $10/day circuit breaker. Returns { details, receipt }.
export async function POST(request) {
  try {
    const { items = [], cap } = await request.json();
    const result = await runHydration(items, cap ? { cap } : {});
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof LandPortalError) {
      return NextResponse.json({ ok: false, code: err.code, error: err.message }, { status: err.status || 500 });
    }
    console.error('[landportal hydrate run]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Hydration failed' }, { status: 500 });
  }
}
