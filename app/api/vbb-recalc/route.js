import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { recomputeReview, VBB_DEAD_STATUSES } from '@/lib/reviewedValue';

// One-time (and safe-to-repeat) recalc of every reviewed lead's value with the
// current close-chance percentages. Honors manual overrides and the lead's live
// offer + stage. Secret-protected; ?dry=1 shows what WOULD change without writing.
// If a lead was already sent to Google and its value moves, it is left for the
// hourly uploader to pick up as an adjustment (we don't touch sent_at/sent_value).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authed(req) {
  const s = process.env.CAMPAIGN_RUN_SECRET;
  const u = new URL(req.url);
  return !s || u.searchParams.get('secret') === s || (req.headers.get('authorization') || '') === `Bearer ${s}`;
}

async function handle(req) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const sb = supabaseAdmin();

  let leads = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('leads')
      .select('id, offer_amount, pipeline_status, status, form_data')
      .not('form_data->review', 'is', null)
      .range(f, f + 999);
    if (!data || !data.length) break;
    leads = leads.concat(data);
    if (data.length < 1000) break;
  }

  let changed = 0, unchanged = 0, willAdjust = 0;
  const samples = [];
  for (const l of leads) {
    const fd = l.form_data || {};
    const rev = fd.review;
    if (!rev) continue;
    const offer = Number(l.offer_amount) || Number(rev.offer) || 0;
    const deadLost = VBB_DEAD_STATUSES.includes(String(l.pipeline_status || l.status || '').toUpperCase());
    const { value: newVal, profit: newProfit } = recomputeReview(rev, { offer, deadLost });
    if (Number(rev.value) === newVal) { unchanged++; continue; }
    if (rev.sent_at && Number(rev.sent_value) !== newVal) willAdjust++;
    if (samples.length < 25) samples.push({ id: l.id, lean: rev.lean || '', from: rev.value, to: newVal });
    changed++;
    if (!dry) {
      const updated = { ...rev, value: newVal, offer, profit: newProfit, base_profit: newProfit, recomputed_at: new Date().toISOString() };
      await sb.from('leads').update({ form_data: { ...fd, review: updated } }).eq('id', l.id).then(() => {}, () => {});
    }
  }

  return NextResponse.json({ ok: true, dry, reviewedLeads: leads.length, changed, unchanged, willBecomeAdjustments: willAdjust, samples });
}

export async function GET(req) { return handle(req); }
export async function POST(req) { return handle(req); }
