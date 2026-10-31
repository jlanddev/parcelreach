// Builds the manual Google Ads offline-conversion backup + upload files from
// Haven Ground website-form leads. SERVER-ONLY (uses node:crypto). The values and
// hashing here mirror the automatic uploader (app/api/google-vbb-upload) so a
// hand upload matches what the cron would have sent.
//
// PRIVACY: output contains seller phone/email (raw in the backup, SHA-256 in the
// Google files). It must never be written to the repo or /public — only streamed
// to a logged-in admin or stored in a PRIVATE Supabase bucket.
import crypto from 'crypto';
import { contractValue } from './reviewedValue';

export const WEBSITE_SOURCE = 'Haven Ground - Sell Your Land Form';
export const CONTRACT_STATUSES = ['AGREEMENT_SENT', 'UNDER_CONTRACT', 'CLOSED'];
export const CONV_NAMES = {
  reviewed: process.env.GOOGLE_CA_REVIEWED_NAME || 'Reviewed Lead',
  contract: process.env.GOOGLE_CA_CONTRACT_NAME || 'Contract Signed',
};
const EXPORT_TZ = process.env.GOOGLE_EXPORT_TZ || 'America/Chicago';

// --- identical normalization/hashing to the uploader ---
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const normPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d ? (d.length === 10 ? `+1${d}` : `+${d}`) : ''; };

// click IDs: lead columns first, then form_data (never invents one)
export function idsOf(l) {
  const fd = l.form_data || {};
  return {
    gclid: l.gclid || fd.gclid || null,
    gbraid: l.gbraid || fd.gbraid || null,
    wbraid: l.wbraid || fd.wbraid || null,
  };
}
export const hasClickId = (l) => { const i = idsOf(l); return !!(i.gclid || i.gbraid || i.wbraid); };

// "YYYY-MM-DD HH:MM:SS" in EXPORT_TZ (pairs with the Parameters:TimeZone line)
function fmtTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d)) return '';
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: EXPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
  let hh = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day} ${hh}:${p.minute}:${p.second}`;
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (headers, rows) =>
  [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';

// Reviewed-Lead conversion for a lead, or null if it doesn't qualify.
function reviewedConv(l) {
  const r = l.form_data?.review;
  if (!r || r.value == null) return null;
  return { value: Number(r.value) || 0, time: r.reviewed_at || l.created_at, sentAt: r.sent_at || null, sentValue: r.sent_value };
}
// Contract-Signed conversion for a lead, or null. Mirrors the uploader's value.
function contractConv(l) {
  const status = String(l.pipeline_status || l.status || '').toUpperCase();
  if (!CONTRACT_STATUSES.includes(status)) return null;
  const r = l.form_data?.review;
  const reviewForDeal = r ? { ...r, offer: r.offer != null ? r.offer : (Number(l.offer_amount) || 0) } : null;
  const o = l.form_data?.outcomes || {};
  const leanAtContract = o.UNDER_CONTRACT?.lean ?? o.AGREEMENT_SENT?.lean ?? r?.lean;
  const cv = contractValue(reviewForDeal, { leanAtContract });
  if (cv.value == null) return null;
  const when = o.UNDER_CONTRACT?.at || o.AGREEMENT_SENT?.at || o.CLOSED?.at || l.last_activity_at || l.updated_at || l.created_at;
  const up = l.form_data?.contract_upload || {};
  return { value: cv.value, time: when, sentAt: up.sent_at || null, sentValue: up.sent_value };
}

// === 1) RAW BACKUP: every website lead, full fields (RAW phone/email — private) ===
export function buildBackupCsv(leads) {
  const headers = [
    'Created', 'Lead ID', 'Name', 'Phone', 'Email', 'gclid', 'gbraid', 'wbraid',
    'Landing URL', 'Lean', 'Worth', 'Reviewed Value', 'Reviewed Value Sent', 'Reviewed Sent At',
    'Contract Value', 'Contract Value Sent', 'Contract Sent At', 'Has Click ID',
  ];
  const rows = leads.map((l) => {
    const i = idsOf(l), r = l.form_data?.review || {};
    const rv = reviewedConv(l), cv = contractConv(l);
    return [
      l.created_at, l.id, l.full_name || l.name || '', l.phone || '', l.email || '',
      i.gclid || '', i.gbraid || '', i.wbraid || '', l.form_data?.landing_url || '',
      r.lean ?? '', r.worth ?? '',
      rv ? rv.value : '', rv && rv.sentValue != null ? rv.sentValue : '', rv?.sentAt || '',
      cv ? cv.value : '', cv && cv.sentValue != null ? cv.sentValue : '', cv?.sentAt || '',
      hasClickId(l) ? 'yes' : 'NO',
    ];
  });
  return toCsv(headers, rows);
}

// === 2) GOOGLE MANUAL-UPLOAD file (classic "Upload conversions" format) ===
// kind: 'reviewed' | 'contract'. One row per qualifying lead that has an
// identifier (click ID, or hashed email/phone for enhanced conversions).
export function buildGoogleCsv(leads, kind) {
  const convName = CONV_NAMES[kind];
  const pick = kind === 'contract' ? contractConv : reviewedConv;
  const headers = [
    'Google Click ID', 'Conversion Name', 'Conversion Time',
    'Conversion Value', 'Conversion Currency', 'Email', 'Phone Number',
  ];
  const rows = [];
  for (const l of leads) {
    const c = pick(l);
    if (!c) continue;
    const i = idsOf(l);
    const email = normEmail(l.email), phone = normPhone(l.phone);
    const emailH = email ? sha256(email) : '';
    const phoneH = phone ? sha256(phone) : '';
    if (!i.gclid && !emailH && !phoneH) continue; // nothing Google can match on
    rows.push([
      i.gclid || '', convName, fmtTime(c.time),
      Number(c.value) || 0, 'USD', emailH, phoneH,
    ]);
  }
  // The TimeZone parameter line makes "Conversion Time" unambiguous = zero editing.
  const body = toCsv(headers, rows);
  return { csv: `Parameters:TimeZone=${EXPORT_TZ}\r\n${body}`, count: rows.length };
}

// Data Manager events for a validateOnly "preview" (same identifiers/values the
// manual file carries) — proves Google accepts the data without recording it.
export function buildValidateEvents(leads, kind) {
  const pick = kind === 'contract' ? contractConv : reviewedConv;
  const out = [];
  for (const l of leads) {
    const c = pick(l);
    if (!c) continue;
    const i = idsOf(l);
    const email = normEmail(l.email), phone = normPhone(l.phone);
    const userIdentifiers = [];
    if (email) userIdentifiers.push({ emailAddress: sha256(email) });
    if (phone) userIdentifiers.push({ phoneNumber: sha256(phone) });
    const adIdentifiers = {};
    if (i.gclid) adIdentifiers.gclid = i.gclid;
    if (i.gbraid) adIdentifiers.gbraid = i.gbraid;
    if (i.wbraid) adIdentifiers.wbraid = i.wbraid;
    if (!userIdentifiers.length && !Object.keys(adIdentifiers).length) continue;
    const ev = {
      destinationReferences: ['d'],
      transactionId: `${l.id}-${kind}`,
      eventTimestamp: new Date(c.time || Date.now()).toISOString(),
      eventSource: process.env.GOOGLE_DM_EVENT_SOURCE || 'WEB',
      conversionValue: Number(c.value) || 0,
      currency: 'USD',
    };
    if (userIdentifiers.length) ev.userData = { userIdentifiers };
    if (Object.keys(adIdentifiers).length) ev.adIdentifiers = adIdentifiers;
    out.push(ev);
  }
  return out;
}
