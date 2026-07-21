import { NextResponse } from 'next/server';
import { abbrByFips } from '@/lib/usStates';

// GET /api/regrid/geometry?apn=..&fips=..&county=..  (or ?lat=..&lon=..)
// Returns a parcel boundary polygon from Regrid v2 for the mini-map. Free where
// the account/trial has coverage (returns { geometry: null } where it does not,
// so the caller falls back to a placeholder or the Land Portal boundary).
// Regrid v2 auth is a `token` QUERY param (not a Bearer header).

const REGRID = 'https://app.regrid.com/api/v2';
const mem = new Map(); // key -> geometry|null (per warm instance)

function token() {
  const t = process.env.REGRID_TOKEN || process.env.NEXT_PUBLIC_REGRID_TOKEN;
  if (!t) throw new Error('REGRID_TOKEN not configured');
  return t;
}

const slug = (s) => String(s || '').toLowerCase().replace(/county|parish|borough/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function firstGeometry(json) {
  const par = json?.parcels;
  const feats = Array.isArray(par?.features) ? par.features : (Array.isArray(par) ? par : []);
  return feats[0]?.geometry || null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const apn = (searchParams.get('apn') || '').trim();
    const fips = (searchParams.get('fips') || '').trim();
    const county = (searchParams.get('county') || '').trim();
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const state = (searchParams.get('state') || abbrByFips[fips.slice(0, 2)] || '').toLowerCase();

    const key = apn ? `apn:${state}:${slug(county)}:${apn}` : `pt:${lat}:${lon}`;
    if (mem.has(key)) return NextResponse.json({ ok: true, geometry: mem.get(key), cached: true });

    let url = null;
    if (apn && state && county) {
      const path = `/us/${state}/${slug(county)}`;
      url = `${REGRID}/parcels/apn?parcelnumb=${encodeURIComponent(apn)}&path=${encodeURIComponent(path)}&return_geometry=true&limit=1&token=${token()}`;
    } else if (lat && lon) {
      url = `${REGRID}/parcels/point?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&return_geometry=true&limit=1&token=${token()}`;
    } else {
      return NextResponse.json({ ok: false, error: 'Provide apn+fips(+county) or lat+lon' }, { status: 400 });
    }

    const res = await fetch(url);
    // 403 "not included in API trials" (no coverage) or any non-200 => no boundary,
    // not an error the caller should choke on.
    if (!res.ok) { mem.set(key, null); return NextResponse.json({ ok: true, geometry: null, covered: false }); }
    const json = await res.json();
    const geometry = firstGeometry(json);
    mem.set(key, geometry);
    return NextResponse.json({ ok: true, geometry, covered: !!geometry });
  } catch (err) {
    console.error('[regrid geometry]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed' }, { status: 500 });
  }
}
