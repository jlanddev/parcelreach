import { NextResponse } from 'next/server';
import { getPropertyDetail, LandPortalError } from '@/lib/landportal';

// GET /api/landportal/property/{id}?fips=48113
// Hydrate one property's full detail. IMPORTANT: this draws from the SMALL
// single-property daily pool (~single digits/day), NOT the ~100k filter quota,
// and spills into export tokens when exhausted. Lazy/deliberate use only. The
// response echoes meta.requests_left so the UI can show the remaining pool.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const fips = new URL(request.url).searchParams.get('fips') || '';
    if (!id) return NextResponse.json({ ok: false, error: 'Missing property id' }, { status: 400 });
    const { property, geometry, meta } = await getPropertyDetail(id, fips);
    return NextResponse.json({ ok: true, property, geometry, meta });
  } catch (err) {
    if (err instanceof LandPortalError) {
      const msg = err.code === 'forbidden'
        ? 'Property-detail pool exhausted (this draws from the small single-property quota / export tokens).'
        : err.message;
      return NextResponse.json({ ok: false, code: err.code, error: msg, request_id: err.requestId }, { status: err.status || 500 });
    }
    console.error('[landportal property]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed' }, { status: 500 });
  }
}
