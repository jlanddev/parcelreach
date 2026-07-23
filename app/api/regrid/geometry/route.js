import { NextResponse } from 'next/server';
import { fetchParcelGeometry } from '@/lib/regrid';

// GET /api/regrid/geometry?apn=..&fips=..&county=..  (or ?lat=..&lon=..)
// Returns a parcel boundary polygon from Regrid v2 for the mini-map. Free where
// the account/trial has coverage (returns { geometry: null } where it does not,
// so the caller falls back to a placeholder or the Land Portal boundary).
const mem = new Map(); // key -> geometry|null (per warm instance)

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const apn = (searchParams.get('apn') || '').trim();
    const fips = (searchParams.get('fips') || '').trim();
    const county = (searchParams.get('county') || '').trim();
    const state = (searchParams.get('state') || '').trim();
    const address = (searchParams.get('address') || '').trim();
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    const key = apn ? `apn:${fips}:${county}:${apn}` : (lat && lon ? `pt:${lat}:${lon}` : `adr:${fips}:${address}`);
    if (mem.has(key)) return NextResponse.json({ ok: true, geometry: mem.get(key), cached: true });

    if (!apn && !address && !(lat && lon)) return NextResponse.json({ ok: false, error: 'Provide apn+fips(+county), address, or lat+lon' }, { status: 400 });
    const geometry = await fetchParcelGeometry({ apn, fips, state, county, address, lat, lon });
    mem.set(key, geometry);
    return NextResponse.json({ ok: true, geometry, covered: !!geometry });
  } catch (err) {
    console.error('[regrid geometry]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed' }, { status: 500 });
  }
}
