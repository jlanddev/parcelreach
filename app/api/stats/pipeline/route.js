import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// GET /api/stats/pipeline[?year=2026]
// Read-only pipeline stage COUNTS (no lead data) for the restricted partner view.
// Mirrors the CRM's top-tab counts: dedup by phone keeping the furthest-along
// record, then count each stage. `year` filters by created_at; omit for all time.
const EARLY = ['', 'NEW', 'CONTACTING', 'CONTACTED', 'ANTHONY_CONTACTED', 'ANTHONY_FOLLOW_UP', 'OFFER_CURATED'];
const up = (l) => String(l.pipeline_status || l.status || '').toUpperCase();
const rank = (l) => {
  if ((l.status || '').toLowerCase() === 'archived') return -2;
  const s = up(l);
  if (s === 'LOST') return -1;
  if (['CLOSED', 'UNDER_CONTRACT', 'AGREEMENT_SENT'].includes(s)) return 5;
  if (['OFFER_SENT', 'NEGOTIATING'].includes(s)) return 4;
  if (l.offer_amount != null && Number(l.offer_amount) !== 0) return 3;
  if (s === 'APPT_SET_FOR_JORDAN') return 2;
  return 1;
};

export async function GET(request) {
  try {
    const sb = supabaseAdmin();
    const yearRaw = new URL(request.url).searchParams.get('year');
    const year = /^\d{4}$/.test(yearRaw || '') ? Number(yearRaw) : null;

    const { data: leads, error } = await sb.from('leads')
      .select('id, phone, pipeline_status, status, offer_amount, created_at, last_contact_dir')
      .limit(20000);
    if (error) throw error;

    // Leads currently in an active campaign drip (excluded from PPC Inflow), matching the CRM.
    const { data: enr } = await sb.from('campaign_enrollments').select('lead_id').eq('status', 'active').limit(50000);
    const enrolled = new Set((enr || []).map((e) => e.lead_id));

    // Dedup by phone, keep furthest-along (then most recent).
    const best = new Map();
    for (const l of leads || []) {
      const k = (l.phone || '').replace(/\D/g, '').slice(-10) || `id:${l.id}`;
      const cur = best.get(k);
      if (!cur || (rank(l) - rank(cur) || (new Date(l.created_at) - new Date(cur.created_at))) > 0) best.set(k, l);
    }
    let rows = Array.from(best.values());
    if (year) {
      const lo = `${year}-01-01T00:00:00Z`, hi = `${year + 1}-01-01T00:00:00Z`;
      rows = rows.filter((l) => l.created_at >= lo && l.created_at < hi);
    }

    const notArch = (l) => (l.status || '').toLowerCase() !== 'archived';
    const inCampaign = (l) => enrolled.has(l.id) && String(l.last_contact_dir || '').toLowerCase() !== 'inbound';
    const hasOffer = (l) => l.offer_amount != null && Number(l.offer_amount) !== 0;

    const counts = {
      ppc_inflow: rows.filter((l) => EARLY.includes(up(l)) && notArch(l) && !inCampaign(l)).length,
      appt_set: rows.filter((l) => up(l) === 'APPT_SET_FOR_JORDAN').length,
      offer_curated: rows.filter((l) => hasOffer(l) && [...EARLY, 'APPT_SET_FOR_JORDAN'].includes(up(l)) && notArch(l)).length,
      offer_made: rows.filter((l) => ['OFFER_SENT', 'NEGOTIATING'].includes(up(l))).length,
      signed_contracts: rows.filter((l) => ['AGREEMENT_SENT', 'UNDER_CONTRACT', 'CLOSED'].includes(up(l))).length,
    };
    return NextResponse.json({ ok: true, year: year || 'all', counts });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message || 'failed', counts: {} }, { status: 500 });
  }
}
