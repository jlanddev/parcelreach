import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// GET /api/stats/click-coverage[?since=2026-10-16]
// What % of real-form leads carry a Google click ID (gclid/gbraid/wbraid) since
// the given date. This is the health metric for the gclid-capture pipeline — a
// drop means ads are landing where capture doesn't run, or leads are coming in
// through a path that doesn't save the click ID. Shown on the Upload Queue page.
const REAL_FORM = 'Haven Ground - Sell Your Land Form';
const DEFAULT_SINCE = '2026-10-16'; // gclid capture went live

const hasClick = (l) =>
  !!((l.gclid || l.form_data?.gclid || '').trim() ||
     (l.gbraid || l.form_data?.gbraid || '').trim() ||
     (l.wbraid || l.form_data?.wbraid || '').trim());

export async function GET(request) {
  try {
    const sb = supabaseAdmin();
    const sinceRaw = new URL(request.url).searchParams.get('since');
    const since = /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw || '') ? sinceRaw : DEFAULT_SINCE;

    const { data, error } = await sb.from('leads')
      .select('source, gclid, gbraid, wbraid, form_data')
      .gte('created_at', `${since}T00:00:00Z`).limit(10000);
    if (error) throw error;

    const real = (data || []).filter((l) => l.source === REAL_FORM);
    const other = (data || []).filter((l) => l.source === 'haven-ground');
    const realWith = real.filter(hasClick).length;
    const otherWith = other.filter(hasClick).length;

    return NextResponse.json({
      ok: true,
      since,
      real: { total: real.length, withClick: realWith, pct: real.length ? Math.round((realWith / real.length) * 100) : 0 },
      havenGround: { total: other.length, withClick: otherWith, pct: other.length ? Math.round((otherWith / other.length) * 100) : 0 },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message || 'failed' }, { status: 500 });
  }
}
