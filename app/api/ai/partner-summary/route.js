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

    const { leadId } = await request.json();
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

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

    const facts = [
      county ? `County: ${county} County` : '',
      state ? `State: ${state}` : '',
      acres ? `Acreage: ${acres} acres` : '',
      apn ? `Parcel/APN: ${apn}` : '',
      `Where it sits now: ${stage}`,
      offer ? `Our offer on record: ${offer}` : '',
      priceRange ? `Seller price range (from intake): ${priceRange}` : '',
      whySelling ? `Why selling (from intake): ${whySelling}` : '',
    ].filter(Boolean).join('\n');

    const system = `You write internal deal summaries for a land-buying company, in the voice of Jordan, the principal. Your job: turn the property facts and the team's notes, texts, and call recaps into ONE clean summary that Jordan will paste into a partner's CRM so a co-buyer or disposition partner understands the deal at a glance.

VOICE: Write as Jordan, first person, the way he actually writes: direct, factual, confident, no fluff, no hype, no sales language. Professional but human, like a sharp operator briefing a partner. Fix all grammar and spelling. Do NOT sound like AI. Model the tone on this real example of his corrected writing: "Spoke with Justin, they inherited this property from his mother-in-law, Ann Hunter. Just looking to cash out. Power available at the road. Pretty straightforward piece in a good market. Comps vary from $12K to $20K per acre, but I'm thinking it depends on if public water is available or not."

WHAT TO COVER (only what the file actually supports, in this order, as flowing prose not a bulleted list):
1. Where the deal currently sits (status, and the offer or the seller's number if there is one).
2. The property: acreage, county and state, and any physical detail from the notes (utilities, access, structures, water, road frontage).
3. The seller situation and motivation, only if the file shows it.
4. Your read on value or next step, only if the notes contain it. Do not invent a market read that is not in the file.

RULES:
- Use ONLY what is in the facts and the file. Never invent acreage, comps, prices, utilities, or motivation. If something is unknown, leave it out silently. Better short and true than padded.
- Pull real detail out of the SMS thread only when it adds something (a number, a condition, a timeline, a motivation). Ignore small talk.
- Keep it tight: 2 to 5 sentences, one short paragraph. This is a briefing, not an essay.
- Write numbers cleanly ($90K, 7.94 acres, $12K to $20K per acre).
- NEVER use em dashes or en dashes. Use commas, periods, or parentheses. This is a hard rule.
- Output ONLY the summary text. No preamble, no "Here is the summary", no quotes, no labels.`;

    const user = `PROPERTY FACTS:
${facts}

TEAM FILE (oldest first, timestamped; notes, texts, calls):
${record}

Write Jordan's partner summary now. Output only the summary text.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, temperature: 0.3, system, messages: [{ role: 'user', content: user }] }),
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
