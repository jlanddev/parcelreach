import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { VBB_PROFIT_CAP, VBB_DEAD_STATUSES, contractValue, closedValue } from '@/lib/reviewedValue';
import crypto from 'node:crypto';

// Hourly offline-conversion uploader for the reviewed-value system.
//
// Reviewed Lead: send leads marked reviewed > 30 min ago (so a rep can still
// correct a value first) that haven't been sent, keyed on the LEAD ID
// (transaction_id) so Google dedupes. A value edited AFTER it was sent goes up as
// a conversion ADJUSTMENT (restatement), not a new conversion.
//
// Contract Signed: ONLY if the lead has a human-reviewed worth AND an offer
// (engine-only values never go out as contracts). Value = min(worth − offer, $100k)
// × 75%. Contracts missing a reviewed worth or an offer are flagged, not sent.
//
// Safety: 30-min hold; lead ID (+"-contract") as order ID; sent timestamps so
// nothing resends; a run log row every run; an admin alert on failure / many
// rejections / a >2× spike (which also HOLDS the run unless ?force=1); and a
// single-lead retract (?retract=<leadId>&kind=review|contract) that queues a
// RETRACTION and clears the sent state.
//
// The Google Data Manager API call itself is stubbed until OAuth creds are in
// (uploadToGoogle). Everything else is live and testable via ?dry=1.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const REVIEW_DELAY_MS = 30 * 60 * 1000;  // hold 30 min after review before sending
const CONTRACT_STATUSES = ['AGREEMENT_SENT', 'UNDER_CONTRACT', 'CLOSED'];
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000; // Google click/match window
const SPIKE_FACTOR = 2;                  // >2× the recent average = hold + alert
const SPIKE_MIN = 20;                    // ...but never hold fewer than this (small normal batches always flow)
const DM_INGEST_URL = 'https://datamanager.googleapis.com/v1/events:ingest';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function authed(req) {
  const s = process.env.CAMPAIGN_RUN_SECRET;
  const u = new URL(req.url);
  return !s || u.searchParams.get('secret') === s || (req.headers.get('authorization') || '') === `Bearer ${s}`;
}
// The cron uses the run secret; the CRM "Run now"/"Send now" buttons pass the admin's
// Supabase access token instead. Accept either.
async function authedAsync(req) {
  if (authed(req)) return true;
  const m = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!m) return false;
  try {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data } = await anon.auth.getUser(m[1]);
    const uid = data?.user?.id;
    if (!uid) return false;
    const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', uid).maybeSingle();
    return u?.role === 'admin';
  } catch (e) { return false; }
}
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();
const normPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d ? (d.length === 10 ? `+1${d}` : `+${d}`) : ''; };

// Mint a short-lived access token from the stored refresh token.
async function getAccessToken() {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_DM_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok || !d.access_token) throw new Error('OAuth token refresh failed: ' + JSON.stringify(d).slice(0, 300));
  return d.access_token;
}

// One Data Manager event from a queued conversion. Identifiers are already SHA-256
// hex (encoding:HEX); gclid/gbraid/wbraid go in adIdentifiers; value in conversionValue.
function toEvent(c, value) {
  const userIdentifiers = [];
  if (c.email_sha256) userIdentifiers.push({ emailAddress: c.email_sha256 });
  if (c.phone_sha256) userIdentifiers.push({ phoneNumber: c.phone_sha256 });
  const adIdentifiers = {};
  if (c.gclid) adIdentifiers.gclid = c.gclid;
  if (c.gbraid) adIdentifiers.gbraid = c.gbraid;
  if (c.wbraid) adIdentifiers.wbraid = c.wbraid;
  const ev = {
    destinationReferences: ['d'],
    transactionId: c.transaction_id,
    eventTimestamp: c.time || new Date().toISOString(),
    eventSource: process.env.GOOGLE_DM_EVENT_SOURCE || 'WEB', // leads originate on the website form
    conversionValue: Number(value) || 0,
    currency: 'USD',
  };
  if (userIdentifiers.length) ev.userData = { userIdentifiers };
  if (Object.keys(adIdentifiers).length) ev.adIdentifiers = adIdentifiers;
  return ev;
}

// Send to the Google Data Manager API (events:ingest), one request per conversion
// action. GATED: throws "not configured" (a safe no-op — nothing marked sent) until the
// refresh token, customer ID, and at least one conversion-action ID are all set. Retracts
// go up as $0 restatements (Data Manager doesn't support true retraction). With
// validateOnly:true, Google checks the payload but records nothing. Returns the set of
// transaction IDs it accepted so the caller only marks those sent.
async function uploadToGoogle(payload, { validateOnly = false } = {}) {
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/\D/g, '');
  const loginId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/\D/g, '');
  const CA = { review: process.env.GOOGLE_CA_REVIEWED, contract: process.env.GOOGLE_CA_CONTRACT, closed: process.env.GOOGLE_CA_CLOSED };
  if (!process.env.GOOGLE_DM_REFRESH_TOKEN) throw new Error('Data Manager API not configured yet (no GOOGLE_DM_REFRESH_TOKEN)');
  if (!customerId) throw new Error('Data Manager API not configured yet (set GOOGLE_ADS_CUSTOMER_ID)');
  if (!CA.review && !CA.contract && !CA.closed) throw new Error('Data Manager API not configured yet (set GOOGLE_CA_REVIEWED / _CONTRACT / _CLOSED)');

  const { reviewNew, reviewAdj, reviewRetract, contract, closed } = payload;
  const groups = [
    { name: 'Reviewed Lead', caId: CA.review, sends: [...reviewNew, ...reviewAdj], zeros: reviewRetract },
    { name: 'Contract Signed', caId: CA.contract, sends: [...contract.new, ...contract.adj], zeros: contract.retract },
    { name: 'Closed Deal', caId: CA.closed, sends: [...closed.new, ...closed.adj], zeros: closed.retract },
  ];

  const accessToken = await getAccessToken();
  const sentIds = new Set();
  const rejections = [];
  const skipped = [];
  const debug = []; // per-group request/response, for the validateOnly preview
  let rejected = 0;

  for (const g of groups) {
    const events = [...g.sends.map((c) => toEvent(c, c.value)), ...g.zeros.map((c) => toEvent(c, 0))];
    if (!events.length) continue;
    if (!g.caId) { skipped.push({ group: g.name, reason: 'no conversion action ID set', count: events.length }); continue; }
    const body = {
      destinations: [{
        reference: 'd',
        operatingAccount: { accountType: 'GOOGLE_ADS', accountId: customerId },
        ...(loginId ? { loginAccount: { accountType: 'GOOGLE_ADS', accountId: loginId } } : {}),
        productDestinationId: String(g.caId),
      }],
      events,
      encoding: 'HEX',
      consent: { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_GRANTED' },
      validateOnly: !!validateOnly,
    };
    let resp, data;
    try {
      resp = await fetch(DM_INGEST_URL, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      data = await resp.json().catch(() => ({}));
    } catch (e) {
      rejected += events.length; rejections.push({ group: g.name, error: String(e) });
      debug.push({ group: g.name, productDestinationId: String(g.caId), eventCount: events.length, error: String(e) });
      continue;
    }
    // Preview: the request shape (first 2 events) + Google's raw response.
    debug.push({ group: g.name, productDestinationId: String(g.caId), eventCount: events.length, requestSample: { ...body, events: events.slice(0, 2) }, status: resp.status, response: data });
    if (!resp.ok) {
      rejected += events.length;
      rejections.push({ group: g.name, status: resp.status, error: data?.error || data });
      continue;
    }
    for (const ev of events) sentIds.add(ev.transactionId); // accepted (or validated)
  }

  return { sentIds, sentCount: sentIds.size, rejected, rejections, skipped, debug, validateOnly: !!validateOnly };
}

// Best-effort admin alert (reuses the notifications table; type 'mention' is always
// allowed by its CHECK). Never throws.
async function alertAdmins(sb, title, message) {
  try {
    const { data: admins } = await sb.from('users').select('id').eq('role', 'admin');
    for (const a of admins || []) {
      await sb.from('notifications').insert({ user_id: a.id, from_user_id: null, type: 'mention', title, message: String(message).slice(0, 300), link: '/admin/land?tab=vbb-queue' }).then(() => {}, () => {});
    }
  } catch (e) { /* non-fatal */ }
}

// Best-effort run log (table may not exist yet; see the CREATE TABLE in chat). Never throws.
async function logRun(sb, row) {
  try { await sb.from('vbb_upload_runs').insert(row); } catch (e) { /* non-fatal */ }
}
// Auto-upload kill switch, stored in app_settings (key 'vbb_auto_upload'). Defaults
// ON when the row/table is absent so a fresh setup still runs; the CRM toggle writes it.
async function autoUploadOn(sb) {
  try {
    const { data } = await sb.from('app_settings').select('value').eq('key', 'vbb_auto_upload').maybeSingle();
    if (!data) return true;
    const v = data.value;
    return v === true || v?.on === true || v === 'true';
  } catch (e) { return true; }
}
async function recentAvgSent(sb) {
  try {
    const { data } = await sb.from('vbb_upload_runs').select('sent_count').eq('dry', false).eq('ok', true).order('ran_at', { ascending: false }).limit(10);
    const nums = (data || []).map((r) => Number(r.sent_count) || 0).filter((n) => n > 0);
    if (!nums.length) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  } catch (e) { return 0; }
}

// Only WEBSITE-form leads are Google Ads leads. Everything else (LeadBid,
// on-market/subdivision, referral, admin uploads, GHL echoes) is manually added
// and must NEVER be uploaded to Google — it didn't come from an ad click.
const WEBSITE_SOURCE = 'Haven Ground - Sell Your Land Form';

async function fetchLeads(sb) {
  let leads = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('leads')
      .select('id, full_name, name, email, phone, gclid, gbraid, wbraid, pipeline_status, status, offer_amount, last_activity_at, updated_at, created_at, form_data, source')
      .eq('source', WEBSITE_SOURCE)
      .or('form_data->review.not.is.null,pipeline_status.in.(AGREEMENT_SENT,UNDER_CONTRACT,CLOSED)')
      .range(f, f + 999);
    if (!data || !data.length) break;
    leads = leads.concat(data);
    if (data.length < 1000) break;
  }
  return leads;
}

// Build a phone/email -> click-ID map from EVERY lead that carries one, so a
// conversion whose own record has no click ID can inherit it from a duplicate
// record of the same person (e.g. they also submitted the real form via an ad).
async function buildClickMap(sb) {
  const byPhone = new Map(), byEmail = new Map();
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('leads')
      .select('email, phone, gclid, gbraid, wbraid, form_data')
      .or('gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null')
      .range(f, f + 999);
    if (!data || !data.length) break;
    for (const l of data) {
      const c = { gclid: l.gclid || l.form_data?.gclid || null, gbraid: l.gbraid || l.form_data?.gbraid || null, wbraid: l.wbraid || l.form_data?.wbraid || null };
      if (!(c.gclid || c.gbraid || c.wbraid)) continue;
      const ph = (l.phone || '').replace(/\D/g, '').slice(-10);
      const em = (l.email || '').trim().toLowerCase();
      if (ph && !byPhone.has(ph)) byPhone.set(ph, c);
      if (em && !byEmail.has(em)) byEmail.set(em, c);
    }
    if (data.length < 1000) break;
  }
  return { byPhone, byEmail };
}

// Mark a single lead's conversion for retraction, then let the next run send it.
async function handleRetract(req, sb) {
  const u = new URL(req.url);
  const leadId = u.searchParams.get('retract');
  const kind = (u.searchParams.get('kind') || 'review').toLowerCase();
  const { data: cur } = await sb.from('leads').select('form_data').eq('id', leadId).maybeSingle();
  if (!cur) return NextResponse.json({ error: 'lead not found' }, { status: 404 });
  const fd = cur.form_data || {};
  const key = kind === 'contract' ? 'contract_upload' : kind === 'closed' ? 'closed_upload' : 'review';
  const node = fd[key];
  if (!node || !node.sent_at) return NextResponse.json({ ok: false, error: `nothing sent for ${kind} on this lead to retract` });
  const updated = { ...fd, [key]: { ...node, retract: true, retract_requested_at: new Date().toISOString() } };
  await sb.from('leads').update({ form_data: updated }).eq('id', leadId);
  await alertAdmins(sb, 'VBB conversion retraction queued', `${kind} conversion for lead ${leadId} will be retracted on the next run.`);
  return NextResponse.json({ ok: true, queuedRetraction: { leadId, kind } });
}

async function handle(req) {
  if (!(await authedAsync(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const u = new URL(req.url);
  if (u.searchParams.get('retract')) return handleRetract(req, supabaseAdmin());
  const dry = u.searchParams.get('dry') === '1';
  const force = u.searchParams.get('force') === '1';
  const validate = u.searchParams.get('validate') === '1'; // call Google with validateOnly, mark nothing
  const manual = u.searchParams.get('manual') === '1';     // UI "Run now" — bypasses the kill switch
  const only = u.searchParams.get('only');                 // UI "Send now" — just this lead id
  const sb = supabaseAdmin();
  const now = Date.now();
  const cutoff = now - REVIEW_DELAY_MS;
  const ranAt = new Date().toISOString();

  let leads = await fetchLeads(sb);
  if (only) leads = leads.filter((l) => l.id === only);

  const clickMap = await buildClickMap(sb);
  const ids = (l) => {
    let gclid = l.form_data?.gclid || l.gclid || null;
    let gbraid = l.form_data?.gbraid || l.gbraid || null;
    let wbraid = l.form_data?.wbraid || l.wbraid || null;
    // Inherit a click ID from a duplicate record (same phone/email) when this one has none.
    if (!gclid && !gbraid && !wbraid) {
      const ph = (l.phone || '').replace(/\D/g, '').slice(-10);
      const em = (l.email || '').trim().toLowerCase();
      const found = (ph && clickMap.byPhone.get(ph)) || (em && clickMap.byEmail.get(em)) || null;
      if (found) { gclid = found.gclid; gbraid = found.gbraid; wbraid = found.wbraid; }
    }
    return { gclid, gbraid, wbraid };
  };
  const hashed = (l) => ({ email_sha256: l.email ? sha256(normEmail(l.email)) : null, phone_sha256: normPhone(l.phone) ? sha256(normPhone(l.phone)) : null });
  const matchable = (c) => !!(c.gclid || c.gbraid || c.wbraid || c.email_sha256 || c.phone_sha256);
  // Window is measured from the CLICK (≈ lead creation): Google won't match a
  // conversion more than 90 days after the click.
  const clickOf = (l) => new Date(l.created_at || 0).getTime();
  const tooLate = (conv, l) => { const c = clickOf(l); return c > 0 && conv > 0 && (conv - c) > NINETY_DAYS_MS; };

  const reviewNew = [], reviewAdj = [], reviewRetract = []; let reviewHeld = 0, reviewUnchanged = 0, reviewOutside = 0, reviewHeldManual = 0;

  // Shared Contract/Closed queueing (same shape, different conversion + bookkeeping key).
  const mkDeal = () => ({ new: [], adj: [], retract: [], needsReview: [], needsOffer: [], unmatchable: 0, unchanged: 0, outside: 0, held: 0 });
  const contract = mkDeal(), closed = mkDeal();
  const queueDeal = (bucket, { action, orderSuffix, upKey, value, reason }, l, when, up) => {
    if (up.retract && up.sent_at) { bucket.retract.push({ action, transaction_id: `${l.id}${orderSuffix}`, lead_id: l.id, ...ids(l), ...hashed(l) }); return; }
    if (up.hold) { bucket.held++; return; } // manually held — skip this one
    if (tooLate(when, l)) { bucket.outside++; return; }
    if (value == null) { const flag = { lead_id: l.id, worth: Number(l.form_data?.review?.worth) || null }; if (reason === 'needs_offer') bucket.needsOffer.push(flag); else bucket.needsReview.push(flag); return; }
    const base = { action, transaction_id: `${l.id}${orderSuffix}`, lead_id: l.id, value, time: new Date(when).toISOString(), ...ids(l), ...hashed(l) };
    if (!matchable(base)) bucket.unmatchable++;
    else if (!up.sent_at) bucket.new.push(base);
    else if (Number(up.sent_value) !== value) bucket.adj.push({ ...base, restatement: true });
    else bucket.unchanged++;
  };

  for (const l of leads) {
    const r = l.form_data?.review;
    const o = l.form_data?.outcomes || {};
    const status = String(l.pipeline_status || l.status || '').toUpperCase();
    // Fold the card's live offer into the review so "needs offer" clears when it's filled.
    const reviewForDeal = r ? { ...r, offer: r.offer != null ? r.offer : (Number(l.offer_amount) || 0) } : null;

    // Reviewed Lead (transaction_id = lead ID; 30-min hold; edits -> restatement)
    if (r && r.value != null) {
      if (r.retract && r.sent_at) {
        reviewRetract.push({ action: 'Reviewed Lead', transaction_id: l.id, ...ids(l), ...hashed(l) });
      } else if (r.hold) {
        reviewHeldManual++;
      } else if (tooLate(new Date(r.reviewed_at || 0).getTime(), l)) {
        reviewOutside++;
      } else if (new Date(r.reviewed_at || 0).getTime() > cutoff) {
        reviewHeld++;
      } else {
        const base = { action: 'Reviewed Lead', transaction_id: l.id, value: Number(r.value) || 0, time: r.reviewed_at, ...ids(l), ...hashed(l) };
        if (!r.sent_at) reviewNew.push(base);
        else if (Number(r.sent_value) !== Number(r.value)) reviewAdj.push({ ...base, restatement: true });
        else reviewUnchanged++;
      }
    }

    // Contract Signed — profit × (75% − lean% at time of contract). Needs review + offer.
    if (CONTRACT_STATUSES.includes(status)) {
      const when = new Date(o.UNDER_CONTRACT?.at || o.AGREEMENT_SENT?.at || o.CLOSED?.at || l.last_activity_at || l.updated_at || l.created_at || 0).getTime();
      const leanAtContract = o.UNDER_CONTRACT?.lean ?? o.AGREEMENT_SENT?.lean ?? r?.lean;
      const cv = contractValue(reviewForDeal, { leanAtContract });
      queueDeal(contract, { action: 'Contract Signed', orderSuffix: '-contract', upKey: 'contract_upload', value: cv.value, reason: cv.reason }, l, when, l.form_data?.contract_upload || {});
    }

    // Closed Deal conversion RETIRED (Signed Contract is the win). Void any closed
    // conversion we previously sent by restating it to $0 (one-time; sent_at then clears
    // so it won't re-queue). No new Closed conversions are ever created.
    const closedUp = l.form_data?.closed_upload || {};
    if (closedUp.sent_at && Number(closedUp.sent_value) !== 0) {
      closed.retract.push({ action: 'Closed Deal', transaction_id: `${l.id}-closed`, lead_id: l.id, ...ids(l), ...hashed(l) });
    }
  }

  const toSendCount = reviewNew.length + reviewAdj.length + reviewRetract.length
    + contract.new.length + contract.adj.length + contract.retract.length
    + closed.new.length + closed.adj.length + closed.retract.length;

  const dealSummary = (d) => ({ new: d.new.length, adjustments: d.adj.length, retractions: d.retract.length, needsReview: d.needsReview.length, needsOffer: d.needsOffer.length, unmatchable_no_gclid_or_pii: d.unmatchable, unchanged: d.unchanged, outsideWindow: d.outside, held: d.held });
  const summary = {
    reviewedLead: { new: reviewNew.length, adjustments: reviewAdj.length, retractions: reviewRetract.length, heldUnder30min: reviewHeld, held: reviewHeldManual, unchanged: reviewUnchanged, outsideWindow: reviewOutside },
    contractSigned: dealSummary(contract),
    closedDeal: dealSummary(closed),
  };

  if (dry) {
    await logRun(sb, { ran_at: ranAt, dry: true, ok: true, sent_count: 0, to_send: toSendCount, summary });
    return NextResponse.json({
      ok: true, dry: true, ...summary,
      flagged: { contractNeedsReview: contract.needsReview.slice(0, 10), contractNeedsOffer: contract.needsOffer.slice(0, 10), closedNeedsReview: closed.needsReview.slice(0, 10), closedNeedsOffer: closed.needsOffer.slice(0, 10) },
      sampleContract: contract.new.slice(0, 8).map((c) => ({ leadId: c.lead_id, value: c.value, hasClickId: !!(c.gclid || c.gbraid || c.wbraid), hasHashedPII: !!(c.email_sha256 || c.phone_sha256) })),
    });
  }

  // Kill switch: the hourly cron respects the auto-upload toggle; a manual "Run now"
  // (?manual=1) and validateOnly bypass it. Nothing is sent when paused.
  if (!validate && !manual && !(await autoUploadOn(sb))) {
    await logRun(sb, { ran_at: ranAt, dry: false, ok: true, sent_count: 0, to_send: toSendCount, summary, note: 'paused: auto-upload off' });
    return NextResponse.json({ ok: true, paused: true, reason: 'auto_upload_off', toSend: toSendCount, hint: 'turn Auto-upload on, or add ?manual=1' });
  }

  // Spike guard: hold the run (don't send) if it's >2× the recent average, unless forced.
  // Skipped for validateOnly (nothing is recorded in that mode).
  if (!validate) {
    const avg = await recentAvgSent(sb);
    // Only hold a GENUINE spike: above an absolute floor AND more than 2x the recent
    // average. Small normal batches (a few conversions) always flow through.
    const spikeThreshold = Math.max(SPIKE_MIN, Math.round(avg * SPIKE_FACTOR));
    if (!force && toSendCount > spikeThreshold) {
      // Don't spam the bell on a persistent hold — alert at most once per 6 hours.
      try {
        const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
        const { data: recent } = await sb.from('notifications').select('id').eq('title', 'VBB upload HELD — volume spike').gte('created_at', since).limit(1);
        if (!recent || !recent.length) await alertAdmins(sb, 'VBB upload HELD — volume spike', `Run wanted to send ${toSendCount} conversions vs a recent avg of ${Math.round(avg)} (hold floor ${SPIKE_MIN}). Held for review. Re-run with ?force=1 to send.`);
      } catch { /* non-fatal */ }
      await logRun(sb, { ran_at: ranAt, dry: false, ok: false, sent_count: 0, to_send: toSendCount, summary, note: 'held: volume spike' });
      return NextResponse.json({ ok: false, held: true, reason: 'volume_spike', toSend: toSendCount, recentAvg: Math.round(avg), threshold: spikeThreshold, hint: 'add ?force=1 to send anyway' });
    }
  }

  let result;
  try {
    result = await uploadToGoogle({ reviewNew, reviewAdj, reviewRetract, contract, closed }, { validateOnly: validate });
  } catch (e) {
    const notConfigured = /not configured/i.test(e.message || '');
    if (!notConfigured) await alertAdmins(sb, 'VBB upload FAILED', `${e.message}. Wanted to send ${toSendCount}.`);
    await logRun(sb, { ran_at: ranAt, dry: false, ok: false, sent_count: 0, to_send: toSendCount, summary, note: e.message });
    return NextResponse.json({ ok: false, error: e.message, wouldSend: summary });
  }

  const rejected = Number(result?.rejected) || 0;
  if (rejected > 0 && toSendCount > 0 && rejected / toSendCount >= 0.25) {
    await alertAdmins(sb, 'VBB upload — many rejections', `${rejected} of ${toSendCount} conversions were rejected by Google. ${JSON.stringify((result.rejections || []).slice(0, 5))}`);
  }
  const g = { sentCount: result.sentCount, rejected, rejections: (result.rejections || []).slice(0, 10), skipped: result.skipped || [] };

  // validateOnly: Google checked the payload but recorded nothing, so mark nothing sent.
  if (validate) {
    await logRun(sb, { ran_at: ranAt, dry: false, ok: rejected === 0, sent_count: 0, to_send: toSendCount, summary, note: `validateOnly (validated ${result.sentCount}, rejected ${rejected})` });
    return NextResponse.json({ ok: rejected === 0, validateOnly: true, ...summary, google: g, debug: result.debug || [] });
  }

  // Live: stamp sent state ONLY for the transaction IDs Google accepted.
  const sentIds = result.sentIds instanceof Set ? result.sentIds : new Set(result.sentIds || []);
  const nowIso = new Date().toISOString();
  for (const c of [...reviewNew, ...reviewAdj]) {
    if (!sentIds.has(c.transaction_id)) continue;
    const l = leads.find((x) => x.id === c.transaction_id); const fd = l?.form_data || {};
    await sb.from('leads').update({ form_data: { ...fd, review: { ...fd.review, sent_at: nowIso, sent_value: c.value } } }).eq('id', c.transaction_id).then(() => {}, () => {});
  }
  for (const c of reviewRetract) {
    if (!sentIds.has(c.transaction_id)) continue;
    const l = leads.find((x) => x.id === c.transaction_id); const fd = l?.form_data || {};
    await sb.from('leads').update({ form_data: { ...fd, review: { ...fd.review, retract: false, retracted_at: nowIso, sent_at: null, sent_value: 0 } } }).eq('id', c.transaction_id).then(() => {}, () => {});
  }
  // Contract + Closed share bookkeeping shape; only the form_data key differs.
  const stampDeal = async (d, key) => {
    for (const c of [...d.new, ...d.adj]) {
      if (!sentIds.has(c.transaction_id)) continue;
      const l = leads.find((x) => x.id === c.lead_id); const fd = l?.form_data || {};
      await sb.from('leads').update({ form_data: { ...fd, [key]: { ...(fd[key] || {}), sent_at: nowIso, sent_value: c.value } } }).eq('id', c.lead_id).then(() => {}, () => {});
    }
    for (const c of d.retract) {
      if (!sentIds.has(c.transaction_id)) continue;
      const l = leads.find((x) => x.id === c.lead_id); const fd = l?.form_data || {};
      await sb.from('leads').update({ form_data: { ...fd, [key]: { ...(fd[key] || {}), retract: false, retracted_at: nowIso, sent_at: null, sent_value: 0 } } }).eq('id', c.lead_id).then(() => {}, () => {});
    }
  };
  await stampDeal(contract, 'contract_upload');
  await stampDeal(closed, 'closed_upload');

  // Record the exact line items of this run so History can show which leads + values.
  const nameFor = (id) => { const l = leads.find((x) => x.id === id); return l?.full_name || l?.name || 'Lead'; };
  const items = [];
  for (const c of [...reviewNew, ...reviewAdj]) if (sentIds.has(c.transaction_id)) items.push({ leadId: c.transaction_id, name: nameFor(c.transaction_id), stage: 'Reviewed', value: c.value, match: (c.gclid || c.gbraid || c.wbraid) ? 'Click ID' : (c.email_sha256 || c.phone_sha256) ? 'Email/Phone' : 'none', kind: c.restatement ? 'adjust' : 'new' });
  for (const c of reviewRetract) if (sentIds.has(c.transaction_id)) items.push({ leadId: c.transaction_id, name: nameFor(c.transaction_id), stage: 'Reviewed', value: 0, match: '', kind: 'retract' });
  const dealItems = (d, stage) => {
    for (const c of [...d.new, ...d.adj]) if (sentIds.has(c.transaction_id)) items.push({ leadId: c.lead_id, name: nameFor(c.lead_id), stage, value: c.value, match: (c.gclid || c.gbraid || c.wbraid) ? 'Click ID' : (c.email_sha256 || c.phone_sha256) ? 'Email/Phone' : 'none', kind: c.restatement ? 'adjust' : 'new' });
    for (const c of d.retract) if (sentIds.has(c.transaction_id)) items.push({ leadId: c.lead_id, name: nameFor(c.lead_id), stage, value: 0, match: '', kind: 'retract' });
  };
  dealItems(contract, 'Contract');
  dealItems(closed, 'Closed');

  await logRun(sb, { ran_at: ranAt, dry: false, ok: rejected === 0, sent_count: result.sentCount, to_send: toSendCount, summary: { ...summary, items: items.slice(0, 500) }, note: result.skipped?.length ? `skipped: ${result.skipped.map((s) => s.group).join(', ')}` : null });
  return NextResponse.json({ ok: rejected === 0, sent: result.sentCount, ...summary, google: g });
}

export async function GET(req) { return handle(req); }
export async function POST(req) { return handle(req); }
