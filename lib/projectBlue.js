/**
 * Project Blue API client (server-side only — uses the secret API key).
 * Docs: https://api.tryprojectblue.com  ·  Auth: Authorization: Bearer <key>
 *
 * Project Blue sends over iMessage/SMS/RCS from your connected device lines.
 * There is no "make a call" endpoint (call logs are read-only/polled) and no
 * contact API for non-HighLevel/HubSpot CRMs — so we log everything to our own
 * Supabase `activities` timeline.
 */
const PB_BASE = 'https://api.tryprojectblue.com';

function pbKey() {
  const key = process.env.PROJECT_BLUE_API_KEY;
  if (!key) throw new Error('PROJECT_BLUE_API_KEY is not set');
  return key;
}

/** Strip to digits. */
export function digits(phone) {
  return (phone || '').replace(/\D/g, '');
}

/** Best-effort E.164 (US default). Project Blue re-normalizes, but matching
 * needs a consistent form. */
export function toE164(phone) {
  if (!phone) return null;
  const d = digits(phone);
  if (!d) return null;
  if (String(phone).trim().startsWith('+')) return '+' + d;
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.startsWith('1')) return '+' + d;
  return '+' + d;
}

/** Last 10 digits — the stable key for matching numbers across formats. */
export function last10(phone) {
  return digits(phone).slice(-10);
}

async function pb(path, { method = 'GET', body, query } = {}) {
  const url = new URL(PB_BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== '') url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${pbKey()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Project Blue ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Send a text. Returns Project Blue's queue response. */
export function sendMessage({ to, message, lineId, mediaAttachmentUrl, audioAttachmentUrl, enableAiVoiceMemo }) {
  return pb('/send-api-message', {
    method: 'POST',
    body: {
      phone: toE164(to),
      message,
      shouldAutoCreateContact: false, // we own the CRM (Supabase), not HighLevel/HubSpot
      ...(lineId ? { lineId } : {}),
      ...(mediaAttachmentUrl ? { mediaAttachmentUrl } : {}),
      ...(audioAttachmentUrl ? { audioAttachmentUrl } : {}),
      ...(enableAiVoiceMemo ? { enableAiVoiceMemo } : {}),
    },
  });
}

/** Available sending lines (device phone numbers). */
export function getLines() {
  return pb('/get-lines');
}

/** Is this number reachable over iMessage? */
export function checkIMessage(phone) {
  return pb('/api-check-imessage-availability', { method: 'POST', body: { phone: toE164(phone) } });
}

/** Full message thread with one phone number (inbound + outbound, chronological). */
export async function getMessagesForPhone(phone, { limit = 50 } = {}) {
  const e164 = toE164(phone);
  const [inbound, outbound] = await Promise.all([
    pb('/get-messages-api', { query: { from_number: e164, direction: 'inbound', limit } }).catch(() => ({ data: [] })),
    pb('/get-messages-api', { query: { to_number: e164, direction: 'outbound', limit } }).catch(() => ({ data: [] })),
  ]);
  const msgs = [...(inbound.data || []), ...(outbound.data || [])];
  msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return msgs;
}

/** Recent call logs involving one phone number. PB has no per-number filter,
 * so we page recent logs and match client-side. */
export async function getCallLogsForPhone(phone, { limit = 100 } = {}) {
  const tail = last10(phone);
  const res = await pb('/get-call-logs-api', { query: { limit } }).catch(() => ({ data: [] }));
  return (res.data || []).filter((c) => last10(c.to_number) === tail || last10(c.from_number) === tail);
}
