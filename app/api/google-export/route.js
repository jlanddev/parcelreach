// Manual Google Ads conversion backup + upload files, for when the automatic
// uploader is off/broken. Admin-only (seller PII). Never writes to the repo or
// /public — streams to the logged-in admin, or (for the cron) to a PRIVATE bucket.
//
//   ?file=backup            -> raw backup CSV (all website leads, full fields)
//   ?file=reviewed          -> Google manual-upload CSV, Reviewed Lead
//   ?file=contract          -> Google manual-upload CSV, Contract Signed
//   ?counts=1               -> JSON row counts vs Supabase lead count (proof)
//   ?validate=1[&kind=...]  -> Data Manager validateOnly "preview" (Google accepts, records nothing)
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  WEBSITE_SOURCE, buildBackupCsv, buildGoogleCsv, buildValidateEvents, CONV_NAMES,
} from '@/lib/googleConversions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function isAdmin(req) {
  const secret = process.env.CAMPAIGN_RUN_SECRET;
  const u = new URL(req.url);
  if (secret && (u.searchParams.get('secret') === secret || req.headers.get('authorization') === `Bearer ${secret}`)) return true;
  const m = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!m) return false;
  try {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data } = await anon.auth.getUser(m[1]);
    const uid = data?.user?.id;
    if (!uid) return false;
    const { data: urow } = await supabaseAdmin().from('users').select('role').eq('id', uid).maybeSingle();
    return urow?.role === 'admin';
  } catch { return false; }
}

async function fetchWebsiteLeads(sb) {
  // page through so a large list isn't silently truncated at 1000
  const cols = 'id, full_name, name, email, phone, gclid, gbraid, wbraid, pipeline_status, status, offer_amount, last_activity_at, updated_at, created_at, form_data, source';
  let all = [], from = 0, page = 1000;
  for (;;) {
    const { data, error } = await sb.from('leads').select(cols)
      .eq('source', WEBSITE_SOURCE).order('created_at', { ascending: false }).range(from, from + page - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < page) break;
    from += page;
  }
  return all;
}

// Data Manager validateOnly preview — same payload the real uploader sends.
async function validatePreview(kinds, leads) {
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/\D/g, '');
  const loginId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/\D/g, '');
  const CA = { reviewed: process.env.GOOGLE_CA_REVIEWED, contract: process.env.GOOGLE_CA_CONTRACT };
  if (!process.env.GOOGLE_DM_REFRESH_TOKEN || !customerId) return { ok: false, error: 'Data Manager not configured' };
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '', client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '', refresh_token: process.env.GOOGLE_DM_REFRESH_TOKEN || '', grant_type: 'refresh_token' }),
  }).then((r) => r.json());
  if (!tok.access_token) return { ok: false, error: 'oauth failed' };
  const out = {};
  for (const kind of kinds) {
    const events = buildValidateEvents(leads, kind);
    if (!events.length) { out[kind] = { events: 0, accepted: 0, rejected: 0, note: 'nothing eligible' }; continue; }
    if (!CA[kind]) { out[kind] = { events: events.length, error: `no conversion-action id (GOOGLE_CA_${kind.toUpperCase()})` }; continue; }
    const body = {
      destinations: [{ reference: 'd', operatingAccount: { accountType: 'GOOGLE_ADS', accountId: customerId }, ...(loginId ? { loginAccount: { accountType: 'GOOGLE_ADS', accountId: loginId } } : {}), productDestinationId: String(CA[kind]) }],
      events, encoding: 'HEX', consent: { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_GRANTED' }, validateOnly: true,
    };
    const resp = await fetch('https://datamanager.googleapis.com/v1/events:ingest', { method: 'POST', headers: { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await resp.json().catch(() => ({}));
    out[kind] = { events: events.length, status: resp.status, accepted: resp.ok ? events.length : 0, rejected: resp.ok ? 0 : events.length, googleResponse: data };
  }
  return { ok: true, convNames: CONV_NAMES, ...out };
}

export async function GET(req) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const u = new URL(req.url);
  const sb = supabaseAdmin();
  const leads = await fetchWebsiteLeads(sb);
  const stamp = new Date().toISOString().slice(0, 10);

  if (u.searchParams.get('counts')) {
    const { count } = await sb.from('leads').select('id', { count: 'exact', head: true }).eq('source', WEBSITE_SOURCE);
    return NextResponse.json({
      supabase_website_lead_count: count,
      backup_rows: leads.length,
      reviewed_rows: buildGoogleCsv(leads, 'reviewed').count,
      contract_rows: buildGoogleCsv(leads, 'contract').count,
      match: count === leads.length,
    });
  }

  if (u.searchParams.get('snapshot')) {
    // Daily archive to a PRIVATE bucket (RLS; service role writes, never public).
    await sb.storage.createBucket('lead-backups', { public: false }).catch(() => null);
    const files = [
      [`haven-leads-backup.csv`, buildBackupCsv(leads)],
      [`google-upload-reviewed-lead.csv`, buildGoogleCsv(leads, 'reviewed').csv],
      [`google-upload-contract-signed.csv`, buildGoogleCsv(leads, 'contract').csv],
    ];
    const results = [];
    for (const [base, content] of files) {
      for (const path of [`${stamp}/${base}`, `latest/${base}`]) {
        const { error } = await sb.storage.from('lead-backups')
          .upload(path, Buffer.from(content, 'utf-8'), { upsert: true, contentType: 'text/csv; charset=utf-8' });
        results.push({ path, ok: !error, error: error?.message });
      }
    }
    return NextResponse.json({ ok: results.every((r) => r.ok), leadCount: leads.length, files: results });
  }

  if (u.searchParams.get('validate')) {
    const kind = u.searchParams.get('kind');
    const kinds = kind ? [kind] : ['reviewed', 'contract'];
    return NextResponse.json(await validatePreview(kinds, leads));
  }

  const file = u.searchParams.get('file') || 'backup';
  let csv, name;
  if (file === 'backup') { csv = buildBackupCsv(leads); name = `haven-leads-backup-${stamp}.csv`; }
  else if (file === 'reviewed') { csv = buildGoogleCsv(leads, 'reviewed').csv; name = `google-upload-reviewed-lead-${stamp}.csv`; }
  else if (file === 'contract') { csv = buildGoogleCsv(leads, 'contract').csv; name = `google-upload-contract-signed-${stamp}.csv`; }
  else return NextResponse.json({ error: 'unknown file' }, { status: 400 });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex',
    },
  });
}
