import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getMessagesForPhone } from '@/lib/projectBlue';

// Reads a lead's whole file (property details, the offer, the collaborative
// notes, and the SMS thread) and writes a clean partner-facing summary in
// Jordan's voice: first person, tight and factual, grammar corrected, leading
// with where the deal currently sits. This is the note that gets pushed to a
// partner's Monday board, so it must read like Jordan wrote it, not like AI.

const CH = 'America/Chicago';
function stamp(at) {
  if (!at) return 'unknown time';
  const d = new Date(at);
  if (isNaN(d.getTime())) return 'unknown time';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CH, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d);
}

const STAGE_LABEL = (s) => {
  s = (s || '').toUpperCase();
  if (!s || s === 'NEW') return 'New, not reached yet';
  if (['CONTACTING', 'CONTACTED', 'ANTHONY_CONTACTED', 'ANTHONY_FOLLOW_UP'].includes(s)) return 'In contact with the seller';
  if (s === 'OFFER_CURATED') return 'Reviewed, offer built and ready to send';
  if (s === 'APPT_SET_FOR_JORDAN') return 'Appointment set';
  if (['OFFER_SENT', 'OFFER_MADE', 'NEGOTIATING'].includes(s)) return 'Offer made, in negotiation';
  if (s === 'AGREEMENT_SENT') return 'Agreement sent, waiting on signature';
  if (s === 'UNDER_CONTRACT') return 'Under contract';
  if (s === 'FOLLOW_UP') return 'Following up';
  if (s === 'LOST') return 'Lost';
  return s;
};

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    const { leadId, draft } = await request.json();
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

    // Two modes. POLISH: Jordan typed his own note, so we only clean up his
    // writing and add nothing. COMPILE: the box is empty, so we build the note
    // from the logged conversation, strictly grounded.
    const typed = typeof draft === 'string' ? draft.trim() : '';
    const isPolish = typed.length > 0;

    // POLISH MODE: correct and improve Jordan's own words, invent nothing.
    if (isPolish) {
      const system = `You are cleaning up Jordan's own writing for a note he will send to a land partner. Rewrite it to read clearly and professionally in his voice: fix grammar, spelling, and punctuation, tighten the wording, and make it flow.

CRITICAL: Use ONLY the information Jordan wrote. Do NOT add, invent, or infer any new fact, number, price, acreage, name, condition, or detail. Do not pull in anything from outside his text. If he did not write it, it does not appear. Keep every fact exactly as he stated it and do not change his meaning. Do not add a greeting or sign-off he did not write.

NEVER use em dashes or en dashes. Use commas, periods, or parentheses. Hard rule.
Output ONLY the cleaned-up note. No preamble, no "Here is", no quotes, no labels.`;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, temperature: 0, system, messages: [{ role: 'user', content: `Jordan's note, clean it up and add nothing:\n\n${typed}` }] }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ error: data.error?.message || 'AI error' }, { status: 502 });
      let out = (data.content?.[0]?.text || '').trim().replace(/\s*[—–]\s*/g, ', ').replace(/^["']|["']$/g, '').trim();
      if (!out) return NextResponse.json({ error: 'Could not clean up the note' }, { status: 502 });
      return NextResponse.json({ ok: true, summary: out, mode: 'polish' });
    }

    const supabase = supabaseAdmin();
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    // ---- Assemble the file (notes + texts + calls), timestamped. ----
    const events = []; // { at, line }

    // Collaborative notes: the team's own write-ups, call recaps, verbal offers.
    // This is the richest source for the summary (Anthony's call notes, Jordan's
    // offer notes). Skip pure system log lines like [VM]/[CALL]/[TEXT].
    const { data: notes } = await supabase
      .from('lead_notes')
      .select('content, created_at, user_id')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true }).limit(60);
    let authorById = {};
    const uids = [...new Set((notes || []).map((n) => n.user_id).filter(Boolean))];
    if (uids.length) {
      const { data: us } = await supabase.from('users').select('id, full_name').in('id', uids);
      authorById = Object.fromEntries((us || []).map((u) => [u.id, (u.full_name || '').split(' ')[0] || 'Team']));
    }
    for (const n of notes || []) {
      const c = (n.content || '').replace(/@\w+/g, '').trim();
      if (!c || /^\[[A-Za-z]+\]/.test(c)) continue;
      const who = authorById[n.user_id] || 'Team';
      events.push({ at: n.created_at, line: `Note (${who}): ${c}` });
    }

    // SMS thread (Project Blue, fall back to the activity log). Only add if it
    // carries detail worth including; the prompt decides what is useful.
    let texts = [];
    try {
      const msgs = await getMessagesForPhone(lead.phone);
      texts = (msgs || []).map((m) => ({
        at: m.sent_at || m.created_at,
        who: m.direction === 'outbound' ? 'Us' : 'Seller',
        text: m.content || '',
      }));
    } catch { /* fall back below */ }
    if (!texts.length) {
      const { data: acts } = await supabase
        .from('activities').select('direction, message_content, created_at')
        .eq('lead_id', leadId).eq('activity_type', 'TEXT')
        .order('created_at', { ascending: true }).limit(40);
      texts = (acts || []).map((a) => ({
        at: a.created_at,
        who: (a.direction || '').toUpperCase() === 'OUTBOUND' ? 'Us' : 'Seller',
        text: a.message_content || '',
      }));
    }
    for (const t of texts) {
      if (!t.text) continue;
      events.push({ at: t.at, line: `Text (${t.who}): ${t.text}` });
    }

    // Call log: outcome + any recap note.
    const { data: calls } = await supabase
      .from('activities')
      .select('direction, outcome, duration_seconds, created_at, message_content')
      .eq('lead_id', leadId).eq('activity_type', 'CALL')
      .order('created_at', { ascending: true }).limit(40);
    for (const c of calls || []) {
      const dir = (c.direction || '').toLowerCase() === 'inbound' ? 'inbound' : 'outbound';
      const oc = (c.outcome || '').toLowerCase();
      const spoke = oc === 'spoke' || (c.duration_seconds || 0) > 30;
      const desc = spoke ? `Call (${dir}, spoke)` : oc === 'voicemail' ? `Call (${dir}, left voicemail)` : oc === 'no_answer' ? `Call (${dir}, no answer)` : `Call (${dir})`;
      const note = (c.message_content || '').trim();
      events.push({ at: c.created_at, line: `${desc}${note ? ': ' + note : ''}` });
    }

    events.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    const record = events.slice(-50).map((e) => `[${stamp(e.at)}] ${e.line}`).join('\n') || 'No notes, texts, or calls logged yet.';

    // ---- Property facts we know from the lead itself. ----
    const county = lead.property_county || lead.county || lead.form_data?.county || '';
    const state = lead.property_state || lead.state || lead.form_data?.state || '';
    const acres = lead.acreage || lead.acres || lead.form_data?.acreage || '';
    const apn = lead.parcel_id || lead.form_data?.parcel_id || lead.form_data?.apn || '';
    const stage = STAGE_LABEL(lead.pipeline_status || lead.status);
    const offer = lead.offer_amount ? `$${Number(lead.offer_amount).toLocaleString()}` : '';
    const priceRange = lead.form_data?.priceRange ? String(lead.form_data.priceRange).replace(/-/g, ' to ').replace('plus', '+').replace('under', 'under ') : '';
    const whySelling = lead.form_data?.whySelling || '';

    // Objective identifiers we can state plainly (location and parcel IDs, not
    // deal terms).
    const identifiers = [
      county ? `County: ${county} County` : '',
      state ? `State: ${state}` : '',
      apn ? `Parcel/APN on file: ${apn}` : '',
      `Pipeline stage: ${stage}`,
    ].filter(Boolean).join('\n') || 'None on file.';

    // Unverified system/intake fields. These are frequently WRONG: acreage is
    // often a county estimate, and the intake price range and offer field are
    // not parcel-specific and go stale. The model must not trust these over the
    // conversation, and must never present them as deal facts.
    const systemFields = [
      acres ? `Acreage (system estimate, often wrong): ${acres}` : '',
      priceRange ? `Intake price range (seller's rough form input, not a firm ask): ${priceRange}` : '',
      offer ? `Offer field value (may be stale or for a different parcel): ${offer}` : '',
      whySelling ? `Why selling (intake form): ${whySelling}` : '',
    ].filter(Boolean).join('\n') || 'None on file.';

    const system = `You write internal deal summaries for a land-buying company, in the voice of Jordan, the principal. Jordan pastes your summary into a partner's CRM so a co-buyer understands the deal. A WRONG summary is far worse than a short one: it makes Jordan look careless to his partners and can blow up a deal. Accuracy over completeness, always.

ABSOLUTE GROUNDING RULES (most important):
- The CONVERSATION RECORD (the team's notes, the texts, the call recaps) is the ONLY source of truth for deal terms: prices, who wants to sell what, motivation, condition, timeline. Derive every one of those from the record. If the record does not say it, do NOT write it.
- NEVER invent, estimate, average, or infer a price. Every dollar figure you write must appear in the record, and you must attribute it correctly: is it the SELLER'S asking price, OUR offer, or a COMP? If the record does not make a number's source clear, leave the number out.
- Do NOT trust the system/intake fields over the conversation. The acreage estimate, intake price range, and offer field are often wrong or belong to a different parcel. Use the identifiers (county, state, APN) for location only. Never state a price or motivation from a system field.
- MULTIPLE PARCELS: if the seller has more than one parcel, keep them SEPARATE. Never merge them or blend their acreage or prices. For each parcel, only if the record says it, state: which parcel, whether they want to SELL it or KEEP it, its acreage, and their price expectation. Getting which parcel is which wrong, or attaching a price to the wrong parcel, is the single worst mistake you can make. If the record is ambiguous about which parcel a detail belongs to, say it needs confirming rather than guessing.
- Do NOT smooth gaps into a clean story. If a key fact (price, which parcel, acreage) is unclear or missing, either leave it out or flag it plainly, e.g. "still need to confirm the acreage." A short summary that says only what is known beats a complete-sounding one that guesses.

VOICE: Write as Jordan, first person, direct and factual, no fluff, no hype, no sales language. Professional but human, like a sharp operator briefing a partner. Fix grammar and spelling. Do NOT sound like AI. Tone example of his real writing: "Spoke with Justin, they inherited this from his mother-in-law, Ann Hunter. Just looking to cash out. Power available at the road. Comps vary from $12K to $20K per acre, but I'm thinking it depends on if public water is available."

FORMAT:
- One tight paragraph, 2 to 6 sentences. Lead with where the deal sits and the seller's number(s) if the record gives them.
- Write numbers cleanly ($290K, 6 acres, $12K to $20K per acre).
- NEVER use em dashes or en dashes. Use commas, periods, or parentheses. Hard rule.
- Output ONLY the summary text. No preamble, no "Here is", no quotes, no labels.`;

    const user = `LOCATION / IDENTIFIERS (safe to state):
${identifiers}

SYSTEM / INTAKE FIELDS (unverified, often wrong, do NOT trust over the conversation, never state as deal facts):
${systemFields}

CONVERSATION RECORD (the source of truth; oldest first, each line timestamped; notes, texts, calls):
${record}

Write Jordan's partner summary now, grounded ONLY in the conversation record for all deal terms. If the record is thin, write a short accurate summary and flag what still needs confirming. Output only the summary text.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error?.message || 'AI error' }, { status: 502 });

    let summary = data.content?.[0]?.text?.trim() || '';
    // Belt and suspenders: strip any dash characters the model slips in, plus
    // stray wrapping quotes.
    summary = summary.replace(/\s*[—–]\s*/g, ', ').replace(/^["']|["']$/g, '').trim();
    if (!summary) return NextResponse.json({ error: 'Could not generate a summary' }, { status: 502 });

    return NextResponse.json({ ok: true, summary, whySelling });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
