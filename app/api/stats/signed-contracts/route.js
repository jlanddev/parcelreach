import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// GET /api/stats/signed-contracts[?year=2026]
// Read-only count of signed-contract-stage leads. Returns ONLY a number (no lead
// data), so it's safe to show on the restricted partner (OM Search) view.
// No `year` = all time (mirrors the CRM's "Signed Contracts" count). A `year`
// narrows by created_at for the window selector.
const CONTRACT_STATUSES = ['AGREEMENT_SENT', 'UNDER_CONTRACT', 'CLOSED'];

export async function GET(request) {
  try {
    const sb = supabaseAdmin();
    const yearRaw = new URL(request.url).searchParams.get('year');
    const year = /^\d{4}$/.test(yearRaw || '') ? Number(yearRaw) : null;

    let q = sb.from('leads').select('id', { count: 'exact', head: true }).in('pipeline_status', CONTRACT_STATUSES);
    if (year) {
      q = q.gte('created_at', `${year}-01-01T00:00:00Z`).lt('created_at', `${year + 1}-01-01T00:00:00Z`);
    }
    const { count, error } = await q;
    if (error) throw error;
    return NextResponse.json({ ok: true, count: count || 0, year: year || 'all' });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message || 'failed', count: 0 }, { status: 500 });
  }
}
