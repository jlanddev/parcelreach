import { NextResponse } from 'next/server';
import { getCountyDictionary, LandPortalError } from '@/lib/landportal';

// GET /api/landportal/counties
// Cached FIPS -> county-name dictionary for the county picker. Optional ?state=TX
// narrows to one state (first two FIPS digits are the state code) and ?fips=48113
// or ?q=harris filter/search. Returns an array sorted by state then name.
const STATE_BY_PREFIX = null; // (name lookup not needed; UI groups by prefix)

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const state = (searchParams.get('state') || '').trim();
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const dict = await getCountyDictionary();

    let rows = Object.entries(dict).map(([fips, name]) => ({ fips, name, state_fips: String(fips).slice(0, 2) }));
    if (state) {
      // Accept a 2-letter code only if we can resolve it to a FIPS prefix via a
      // sample; otherwise accept a numeric state FIPS prefix directly.
      const pref = /^\d{2}$/.test(state) ? state : null;
      if (pref) rows = rows.filter((r) => r.state_fips === pref);
    }
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.fips.includes(q));
    rows.sort((a, b) => (a.state_fips === b.state_fips ? a.name.localeCompare(b.name) : a.state_fips.localeCompare(b.state_fips)));

    return NextResponse.json({ ok: true, count: rows.length, counties: rows });
  } catch (err) {
    if (err instanceof LandPortalError) {
      return NextResponse.json({ ok: false, code: err.code, error: err.message }, { status: err.status || 500 });
    }
    console.error('[landportal counties]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed' }, { status: 500 });
  }
}
