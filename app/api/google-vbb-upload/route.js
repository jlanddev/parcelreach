import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'node:crypto';

// Hourly offline-conversion uploader for the reviewed-value system. Sends leads
// marked reviewed > 30 min ago (so a rep can still correct a value first) that
// haven't been sent yet, as "Reviewed Lead" offline conversions keyed on the LEAD
// ID (transaction_id) so Google dedupes repeats. If a reviewed value is edited AFTER
// it was sent, it goes up as a conversion ADJUSTMENT (restatement), not a new
// conversion. Secret-protected; ?dry=1 shows what would send without sending.
//
// The actual Google Data Manager API call is stubbed until the OAuth credentials are
// in (see uploadToGoogle). Everything else — the 30-min queue, dedupe, adjustments,
// and the per-lead sent bookkeeping — is live and testable via ?dry=1.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const REVIEW_DELAY_MS = 30 * 60 * 1000; // hold 30 min after review before sending

function authed(req) {
  const s = process.env.CAMPAIGN_RUN_SECRET;
  const u = new URL(req.url);
  return !s || u.searchParams.get('secret') === s || (req.headers.get('authorization') || '') === `Bearer ${s}`;
}
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();
const normPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d ? (d.length === 10 ? `+1${d}` : `+${d}`) : ''; };

// Send to Google Data Manager API. Wired once OAuth credentials are configured;
// throws until then so a live run is a clear, safe no-op (nothing gets marked sent).
async function uploadToGoogle(/* conversions, adjustments */) {
  if (!process.env.GOOGLE_DM_REFRESH_TOKEN) {
    throw new Error('Data Manager API not configured yet (awaiting OAuth credentials)');
  }
  // TODO: build the Data Manager ingest request:
  //   - new conversions: {conversionAction:"Reviewed Lead", gclid/gbraid/wbraid,
  //     userIdentifiers:[hashedEmail, hashedPhone], conversionValue, currency, orderId, time}
  //   - adjustments: RESTATEMENT with the same orderId and the new value
  throw new Error('not implemented');
}

async function handle(req) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const sb = supabaseAdmin();
  const cutoff = Date.now() - REVIEW_DELAY_MS;

  let leads = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('leads').select('id, email, phone, gclid, gbraid, wbraid, form_data')
      .not('form_data->review', 'is', null).range(f, f + 999);
    if (!data || !data.length) break;
    leads = leads.concat(data);
    if (data.length < 1000) break;
  }

  const newConv = [], adjust = []; let tooRecent = 0, alreadySent = 0;
  for (const l of leads) {
    const r = l.form_data?.review;
    if (!r) continue;
    if (new Date(r.reviewed_at || 0).getTime() > cutoff) { tooRecent++; continue; } // 30-min hold
    const fd = l.form_data || {};
    const base = {
      transaction_id: l.id,                              // lead ID -> Google dedupes repeats
      value: Number(r.value) || 0,
      time: r.reviewed_at,
      gclid: fd.gclid || l.gclid || null,
      gbraid: fd.gbraid || l.gbraid || null,
      wbraid: fd.wbraid || l.wbraid || null,
      email_sha256: l.email ? sha256(normEmail(l.email)) : null,
      phone_sha256: normPhone(l.phone) ? sha256(normPhone(l.phone)) : null,
    };
    if (!r.sent_at) newConv.push(base);
    else if (Number(r.sent_value) !== Number(r.value)) adjust.push({ ...base, restatement: true });
    else alreadySent++;
  }

  if (dry) {
    return NextResponse.json({
      ok: true, dry: true,
      newConversions: newConv.length, adjustments: adjust.length,
      heldUnder30min: tooRecent, alreadySentUnchanged: alreadySent,
      sampleNew: newConv.slice(0, 5).map((c) => ({ id: c.transaction_id, value: c.value, hasGclid: !!(c.gclid || c.gbraid || c.wbraid) })),
      sampleAdjustments: adjust.slice(0, 5).map((c) => ({ id: c.transaction_id, newValue: c.value })),
    });
  }

  let result;
  try { result = await uploadToGoogle(newConv, adjust); }
  catch (e) {
    return NextResponse.json({ ok: false, error: e.message, wouldSend: { newConversions: newConv.length, adjustments: adjust.length } });
  }

  // Mark each lead sent (so it isn't re-sent; an edit later shows as value != sent_value -> adjustment).
  const nowIso = new Date().toISOString();
  for (const c of [...newConv, ...adjust]) {
    const l = leads.find((x) => x.id === c.transaction_id);
    const fd = l?.form_data || {};
    await sb.from('leads').update({ form_data: { ...fd, review: { ...fd.review, sent_at: nowIso, sent_value: c.value } } })
      .eq('id', c.transaction_id).then(() => {}, () => {});
  }
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req) { return handle(req); }
export async function POST(req) { return handle(req); }
