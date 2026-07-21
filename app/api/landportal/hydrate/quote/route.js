import { NextResponse } from 'next/server';
import { quoteHydration, LandPortalError } from '@/lib/landportal';

// POST /api/landportal/hydrate/quote
// Body: { items: [{ property_id, fips }], cap? }
// Returns the cost math for hydrating this set. Spends nothing.
export async function POST(request) {
  try {
    const { items = [], cap } = await request.json();
    const quote = await quoteHydration(items, cap ? { cap } : {});
    return NextResponse.json({ ok: true, quote });
  } catch (err) {
    const status = err instanceof LandPortalError ? err.status : 500;
    return NextResponse.json({ ok: false, error: err.message || 'Quote failed' }, { status });
  }
}
