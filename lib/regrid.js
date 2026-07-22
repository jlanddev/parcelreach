// Server-side Regrid v2 parcel-geometry fetch. Auth is a `token` QUERY param.
// Returns a GeoJSON geometry (Polygon/MultiPolygon) or null where there is no
// coverage (trial areas, or an unlicensed county), so callers degrade gracefully.
import { US_STATES, abbrByFips } from '@/lib/usStates';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const REGRID = 'https://app.regrid.com/api/v2';
const nameToAbbr = Object.fromEntries(US_STATES.map((s) => [s.name.toLowerCase(), s.abbr]));

function token() {
  return process.env.REGRID_TOKEN || process.env.NEXT_PUBLIC_REGRID_TOKEN || null;
}
const slug = (s) => String(s || '').toLowerCase().replace(/county|parish|borough/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function resolveAbbr({ state, fips }) {
  if (state) {
    const s = String(state).trim();
    if (s.length === 2) return s.toLowerCase();
    if (nameToAbbr[s.toLowerCase()]) return nameToAbbr[s.toLowerCase()].toLowerCase();
  }
  const byFips = abbrByFips[String(fips || '').slice(0, 2)];
  return byFips ? byFips.toLowerCase() : '';
}

export async function fetchParcelGeometry({ apn, fips, state, county, lat, lon } = {}) {
  const t = token();
  if (!t) return null;
  const abbr = resolveAbbr({ state, fips });

  // Permanent cache: boundaries never change, and each Regrid parcel record is
  // billed, so we fetch a given parcel at most once ever. Only successful
  // geometry is cached (a "no coverage" miss re-queries, which is free on Regrid).
  const cacheKey = apn ? `apn:${String(fips || '').slice(0, 2)}:${slug(county)}:${String(apn).trim()}` : (lat && lon ? `pt:${lat}:${lon}` : null);
  if (cacheKey) {
    try {
      const sb = supabaseAdmin();
      const { data } = await sb.from('regrid_geometry_cache').select('geometry').eq('cache_key', cacheKey).maybeSingle();
      if (data?.geometry) return data.geometry;
    } catch { /* table may not exist yet */ }
  }

  let url = null;
  if (apn && abbr && county) {
    url = `${REGRID}/parcels/apn?parcelnumb=${encodeURIComponent(String(apn).trim())}&path=${encodeURIComponent(`/us/${abbr}/${slug(county)}`)}&return_geometry=true&limit=1&token=${t}`;
  } else if (lat && lon) {
    url = `${REGRID}/parcels/point?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&return_geometry=true&limit=1&token=${t}`;
  } else {
    return null;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const par = json?.parcels;
    const feats = Array.isArray(par?.features) ? par.features : (Array.isArray(par) ? par : []);
    const geometry = feats[0]?.geometry || null;
    if (geometry && cacheKey) {
      try {
        const sb = supabaseAdmin();
        await sb.from('regrid_geometry_cache').upsert({ cache_key: cacheKey, geometry, fetched_at: new Date().toISOString() }, { onConflict: 'cache_key' });
      } catch { /* cache optional */ }
    }
    return geometry;
  } catch {
    return null;
  }
}
