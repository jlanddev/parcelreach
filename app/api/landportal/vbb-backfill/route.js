import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { computeVbbValue } from '@/lib/vbb';

// One-time (re-runnable) backfill: score every historical lead through the VBB
// engine, write the breakdown to form_data.vbb (audit trail + value report), and
// warm the LandPortal comp cache per county/band so deploy-day leads resolve fast.
// Batched to a time budget and resumable (processes only un-scored leads) so it
// stays under the serverless timeout and is gentle on LandPortal. Secret-protected.
//   ?mode=stats  -> summary: scored count, fallback rate, median values, distribution
//   (default)    -> process one budgeted batch of un-scored leads; returns `remaining`

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authed(req) {
  const s = process.env.CAMPAIGN_RUN_SECRET;
  const u = new URL(req.url);
  return !s || u.searchParams.get('secret') === s || (req.headers.get('authorization') || '') === `Bearer ${s}`;
}

const NOT_TEST = (q) => q.not('name', 'ilike', '%test%').not('phone', 'ilike', '%7139315872%');

async function handle(req) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const u = new URL(req.url);
  const sb = supabaseAdmin();

  // ---- stats: summarize the scored pool (numbers only, no PII) ----
  if (u.searchParams.get('mode') === 'stats') {
    let rows = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from('leads').select('form_data').not('form_data->vbb', 'is', null).range(from, from + 999);
      if (!data || !data.length) break;
      rows = rows.concat(data);
      if (data.length < 1000) break;
    }
    const recs = rows.map((r) => r.form_data?.vbb).filter(Boolean);
    const vals = recs.map((v) => Number(v.value)).filter((n) => Number.isFinite(n));
    const med = (arr) => arr.length ? (arr.length % 2 ? arr[(arr.length - 1) / 2] : Math.round((arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2)) : null;
    const all = vals.slice().sort((a, b) => a - b);
    const positive = vals.filter((n) => n > 1).sort((a, b) => a - b); // real deal scores (exclude $0/$1)
    const fallbackCount = recs.filter((v) => v.fallback).length;
    const zeroCount = recs.filter((v) => Number(v.value) === 0).length;
    return NextResponse.json({
      scored: recs.length,
      fallbackCount,
      fallbackPct: recs.length ? Math.round((1000 * fallbackCount) / recs.length) / 10 : 0,
      zeroCount,
      positiveCount: positive.length,
      medianAll: med(all),
      medianPositive: med(positive),
      distribution: {
        zero: zeroCount,
        under10k: vals.filter((n) => n > 1 && n < 10000).length,
        k10_50: vals.filter((n) => n >= 10000 && n < 50000).length,
        k50_100: vals.filter((n) => n >= 50000 && n < 100000).length,
        over100k: vals.filter((n) => n >= 100000).length,
      },
    });
  }

  // ---- process one budgeted batch of UN-scored leads ----
  const force = u.searchParams.get('force') === '1';
  const budgetMs = Math.min(20000, Math.max(3000, Number(u.searchParams.get('budget')) || 8000));
  const start = Date.now();

  let q = sb.from('leads')
    .select('id, county, property_county, state, property_state, acres, form_data')
    .order('county', { ascending: true })
    .limit(150);
  if (!force) q = q.is('form_data->vbb', null);
  q = NOT_TEST(q);
  const { data: leads } = await q;

  let processed = 0, scored = 0, fallback = 0, zero = 0;
  for (const l of (leads || [])) {
    if (Date.now() - start > budgetMs) break;
    const acres = l.form_data?.acres || l.acres;               // real range string lives in form_data
    const isInherited = l.form_data?.isInherited;
    const county = l.property_county || l.county;
    const state = l.property_state || l.state;
    let r;
    try { r = await computeVbbValue({ county, state, acres, isInherited }); }
    catch { r = { value: 1, fallback: true, reason: 'error' }; }
    const fd = l.form_data || {};
    await sb.from('leads').update({
      form_data: { ...fd, vbb: { ...r, backfilled: true, computed_at: new Date().toISOString() } },
    }).eq('id', l.id).then(() => {}, () => {});
    processed++;
    if (r.fallback) fallback++;
    if (r.value === 0) zero++;
    if (!r.fallback && r.value > 0) scored++;
  }

  let remaining = null;
  try {
    const { count } = await NOT_TEST(sb.from('leads').select('id', { count: 'exact', head: true }).is('form_data->vbb', null));
    remaining = count ?? null;
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, processed, scored, fallback, zero, remaining, elapsedMs: Date.now() - start });
}

export async function GET(req) { return handle(req); }
export async function POST(req) { return handle(req); }
