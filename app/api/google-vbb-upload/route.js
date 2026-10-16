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
const CONTRACT_STATUSES = ['AGREEMENT_SENT', 'UNDER_CONTRACT', 'CLOSED'];
const CONTRACT_RATIO = 0.75;            // est. chance a signed contract closes
const PROFIT_CAP = 100000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000; // Google click/match window

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
  const now = Date.now();
  const cutoff = now - REVIEW_DELAY_MS;

  // Leads needing a Reviewed-Lead upload (have a review) OR a Contract-Signed upload
  // (reached a signed-contract status — includes the historical contracts).
  let leads = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('leads')
      .select('id, email, phone, gclid, gbraid, wbraid, pipeline_status, status, last_activity_at, updated_at, created_at, form_data')
      .or('form_data->review.not.is.null,pipeline_status.in.(AGREEMENT_SENT,UNDER_CONTRACT,CLOSED)')
      .range(f, f + 999);
    if (!data || !data.length) break;
    leads = leads.concat(data);
    if (data.length < 1000) break;
  }

  const ids = (l) => ({ gclid: l.form_data?.gclid || l.gclid || null, gbraid: l.form_data?.gbraid || l.gbraid || null, wbraid: l.form_data?.wbraid || l.wbraid || null });
  const hashed = (l) => ({ email_sha256: l.email ? sha256(normEmail(l.email)) : null, phone_sha256: normPhone(l.phone) ? sha256(normPhone(l.phone)) : null });
  const matchable = (c) => !!(c.gclid || c.gbraid || c.wbraid || c.email_sha256 || c.phone_sha256);

  const reviewNew = [], reviewAdj = []; let reviewHeld = 0, reviewUnchanged = 0;
  const contractNew = [], contractAdj = []; let contractUnmatchable = 0, contractUnchanged = 0, contractOutsideWindow = 0;

  for (const l of leads) {
    // Reviewed Lead (transaction_id = lead ID; 30-min hold; edits -> restatement)
    const r = l.form_data?.review;
    if (r && r.value != null) {
      if (new Date(r.reviewed_at || 0).getTime() > cutoff) reviewHeld++;
      else {
        const base = { action: 'Reviewed Lead', transaction_id: l.id, value: Number(r.value) || 0, time: r.reviewed_at, ...ids(l), ...hashed(l) };
        if (!r.sent_at) reviewNew.push(base);
        else if (Number(r.sent_value) !== Number(r.value)) reviewAdj.push({ ...base, restatement: true });
        else reviewUnchanged++;
      }
    }
    // Contract Signed (value = min(profit,$100k) x 75%; order id = leadId-contract)
    if (CONTRACT_STATUSES.includes(String(l.pipeline_status || l.status || '').toUpperCase())) {
      const o = l.form_data?.outcomes || {};
      const whenStr = o.UNDER_CONTRACT?.at || o.AGREEMENT_SENT?.at || o.CLOSED?.at || l.last_activity_at || l.updated_at || l.created_at;
      const when = new Date(whenStr || 0).getTime();
      if (!when || when < now - NINETY_DAYS_MS) { contractOutsideWindow++; } // Google won't match older than the window
      else {
        const prof = Number(l.form_data?.review?.base_profit ?? l.form_data?.vbb?.profit ?? 0);
        const cval = Math.round(Math.min(Math.max(prof, 0), PROFIT_CAP) * CONTRACT_RATIO);
        const cu = l.form_data?.contract_upload || {};
        const base = { action: 'Contract Signed', transaction_id: `${l.id}-contract`, lead_id: l.id, value: cval, time: new Date(when).toISOString(), ...ids(l), ...hashed(l) };
        if (!matchable(base)) contractUnmatchable++;       // no gclid AND no hashed PII -> Google can't match (the old 13 w/o gclid)
        else if (!cu.sent_at) contractNew.push(base);
        else if (Number(cu.sent_value) !== cval) contractAdj.push({ ...base, restatement: true });
        else contractUnchanged++;
      }
    }
  }

  if (dry) {
    return NextResponse.json({
      ok: true, dry: true,
      reviewedLead: { new: reviewNew.length, adjustments: reviewAdj.length, heldUnder30min: reviewHeld, unchanged: reviewUnchanged },
      contractSigned: { new: contractNew.length, adjustments: contractAdj.length, unmatchable_no_gclid_or_pii: contractUnmatchable, unchanged: contractUnchanged, outsideWindow: contractOutsideWindow },
      sampleContract: contractNew.slice(0, 8).map((c) => ({ leadId: c.lead_id, value: c.value, hasClickId: !!(c.gclid || c.gbraid || c.wbraid), hasHashedPII: !!(c.email_sha256 || c.phone_sha256) })),
    });
  }

  let result;
  try { result = await uploadToGoogle(reviewNew, reviewAdj, contractNew, contractAdj); }
  catch (e) {
    return NextResponse.json({ ok: false, error: e.message, wouldSend: { reviewedNew: reviewNew.length, reviewedAdj: reviewAdj.length, contractNew: contractNew.length, contractAdj: contractAdj.length } });
  }

  const nowIso = new Date().toISOString();
  for (const c of [...reviewNew, ...reviewAdj]) {
    const l = leads.find((x) => x.id === c.transaction_id); const fd = l?.form_data || {};
    await sb.from('leads').update({ form_data: { ...fd, review: { ...fd.review, sent_at: nowIso, sent_value: c.value } } }).eq('id', c.transaction_id).then(() => {}, () => {});
  }
  for (const c of [...contractNew, ...contractAdj]) {
    const l = leads.find((x) => x.id === c.lead_id); const fd = l?.form_data || {};
    await sb.from('leads').update({ form_data: { ...fd, contract_upload: { sent_at: nowIso, sent_value: c.value } } }).eq('id', c.lead_id).then(() => {}, () => {});
  }
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req) { return handle(req); }
export async function POST(req) { return handle(req); }
