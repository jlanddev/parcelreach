import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getMessagesForPhone } from '@/lib/projectBlue';

// Reads a lead's WHOLE file (text thread + call log + collaborative notes, all
// timestamped) and suggests a temperature (lean), a single next action, a
// follow-up date/time, and a draft reply. Suggestions only; the rep confirms in
// the UI. Both the message brain and the notes brain call this same endpoint so
// they always read the same full picture.

const VALID_LEANS = ['hot', 'warm', 'cold', 'ready'];

const CH = 'America/Chicago';
function nowCentral() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CH, weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date());
}
// Stamp an instant as a short Central date+time, e.g. "Mon Jun 29, 5:10 PM".
function stamp(at) {
  if (!at) return 'unknown time';
  const d = new Date(at);
  if (isNaN(d.getTime())) return 'unknown time';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CH, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d);
}
// Today's Y/M/D in Central.
function centralYMD() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: CH, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return { y: +p.find((x) => x.type === 'year').value, m: +p.find((x) => x.type === 'month').value, d: +p.find((x) => x.type === 'day').value };
}
// A Central wall-clock time -> correct UTC instant (DST-safe).
function centralToUTC(y, m, d, hh, mm) {
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const asLocal = new Date(new Date(guess).toLocaleString('en-US', { timeZone: CH }));
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess + (asUtc.getTime() - asLocal.getTime()));
}
// Resolve the model's RELATIVE day (no calendar math by the model) into an ISO.
const DOW = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
function resolveWhen(fu) {
  if (!fu) return null;
  const tm = String(fu.time_24h || '').match(/(\d{1,2}):?(\d{2})?/);
  const hh = tm ? Math.min(23, +tm[1]) : 10;
  const mm = tm && tm[2] ? Math.min(59, +tm[2]) : 0;
  const t = centralYMD();
  const base = new Date(Date.UTC(t.y, t.m - 1, t.d));
  let target = null;
  if (Number.isInteger(fu.days_from_now)) {
    const c = new Date(base); c.setUTCDate(c.getUTCDate() + Math.max(0, Math.min(120, fu.days_from_now)));
    target = c;
  } else if (fu.weekday && DOW[String(fu.weekday).toLowerCase()] != null) {
    const want = DOW[String(fu.weekday).toLowerCase()];
    for (let i = 1; i <= 7; i++) { const c = new Date(base); c.setUTCDate(c.getUTCDate() + i); if (c.getUTCDay() === want) { target = c; break; } }
  }
  if (!target) return null;
  return centralToUTC(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), hh, mm).toISOString();
}

const STAGE_LABEL = (s) => {
  s = (s || '').toUpperCase();
  if (!s || s === 'NEW') return 'New (not reached yet)';
  if (['CONTACTING', 'CONTACTED', 'ANTHONY_CONTACTED', 'ANTHONY_FOLLOW_UP'].includes(s)) return 'In contact';
  if (s === 'APPT_SET_FOR_JORDAN') return 'Appointment set';
  if (['OFFER_SENT', 'OFFER_MADE', 'NEGOTIATING'].includes(s)) return 'Offer made';
  if (s === 'AGREEMENT_SENT') return 'Agreement sent';
  if (s === 'UNDER_CONTRACT') return 'Under contract';
  if (s === 'FOLLOW_UP') return 'Follow-up (parked)';
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

    // ---- Assemble the full file as one chronological, timestamped record. ----
    const events = []; // { at, kind, line }

    // 1) Text thread (Project Blue, fall back to the activity log).
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
      events.push({ at: t.at, kind: 'text', line: `Text (${t.who}): ${t.text}` });
    }

    // 2) Call log: outcome + duration + when. This is how the brain "keeps track
    // of timing" of real conversations, not just texts.
    const { data: calls } = await supabase
      .from('activities')
      .select('direction, outcome, duration_seconds, created_at, message_content')
      .eq('lead_id', leadId).eq('activity_type', 'CALL')
      .order('created_at', { ascending: true }).limit(40);
    for (const c of calls || []) {
      const dir = (c.direction || '').toLowerCase() === 'inbound' ? 'inbound' : 'outbound';
      const oc = (c.outcome || '').toLowerCase();
      const spoke = oc === 'spoke' || (c.duration_seconds || 0) > 30;
      const mins = Math.round((c.duration_seconds || 0) / 60);
      const desc = spoke
        ? `Call (${dir}, spoke${mins ? `, ${mins}m` : ''})`
        : oc === 'voicemail' ? `Call (${dir}, left voicemail)` : oc === 'no_answer' ? `Call (${dir}, no answer)` : `Call (${dir})`;
      const note = (c.message_content || '').trim();
      events.push({ at: c.created_at, kind: 'call', line: `${desc}${note ? ': ' + note : ''}` });
    }

    // 3) Collaborative notes (the rep's own write-ups, incl. call recaps and
    // verbal offers). Skip pure system log lines like [VM]/[CALL]/[TEXT].
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
      const c = (n.content || '').trim();
      if (!c || /^\[[A-Za-z]+\]/.test(c)) continue;
      const who = authorById[n.user_id] || 'Team';
      events.push({ at: n.created_at, kind: 'note', line: `Note (${who}): ${c}` });
    }

    if (!events.length) return NextResponse.json({ error: 'Nothing to read yet (no texts, calls, or notes).' }, { status: 400 });

    // Sort the whole file by time and label each line with its timestamp.
    events.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    const recordLines = events.slice(-50).map((e) => `[${stamp(e.at)}] ${e.line}`);
    const record = recordLines.join('\n');

    // Calendar awareness: what's already booked, so it spreads times out.
    const { data: booked } = await supabase
      .from('scheduled_tasks')
      .select('due_at, title')
      .eq('status', 'pending')
      .gte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })
      .limit(60);
    const bookedList = (booked || [])
      .map((t) => stamp(t.due_at))
      .join('; ') || 'nothing booked';

    const county = lead.property_county || lead.county || '';
    const acres = lead.acreage || lead.acres || '';
    const stage = STAGE_LABEL(lead.pipeline_status || lead.status);
    const offerField = lead.offer_amount ? `$${Number(lead.offer_amount).toLocaleString()}` : 'none entered in the offer field';

    const system = `You are a careful lead-triage assistant for a land-buying company. You read the COMPLETE file for one land seller: the SMS thread, the call log, and the team's internal notes, all in one timeline with timestamps. You answer three things: (1) how hot the lead is, (2) the single next action, (3) when to do it. Base everything ONLY on the file and lead state given. Read the WHOLE timeline and weight the MOST RECENT events most heavily. Pay attention to timestamps so timing is right (e.g. "spoke this evening, she wants a day to think" means follow up tomorrow, not today). Never invent facts. Better to return null than to guess. Respond with ONLY a JSON object, no prose, no code fences.

(1) TEMPERATURE, pick exactly one:
- hot: motivated and engaged, deal is moving, responding well, or a good call just happened
- warm: interested but slow, or needs nurturing; lukewarm
- cold: unresponsive, hesitant, or unrealistic on price
- ready: has verbally agreed / is ready to move to an offer or contract

(2) NEXT ACTION, a short imperative in follow_up.label, e.g. "Call back", "Follow up on offer", "Send offer", "Text follow-up", "Nurture", "Set appointment".

(3) SCHEDULE, describe WHEN relatively; do NOT compute calendar dates yourself.
- Use "days_from_now": 0 = today, 1 = tomorrow, 2 = day after. Use this for relative references like "tomorrow" or "in a couple days".
- OR use "weekday": a day name ("monday".."friday") if a specific weekday was named.
- Always give "time_24h" like "15:00". If a time was agreed in the file, use it; otherwise pick a slot 9:00-17:00.
- If no follow-up is warranted, return null for follow_up.

OFFERS: An offer counts as ALREADY MADE if the Offer field shows an amount OR the notes/calls/texts clearly state an offer or price was given to the seller. Only then may you reference an offer (e.g. "follow up on the offer"). If no offer has been made anywhere in the file, do NOT mention an offer in the action or the draft reply.

DRAFT REPLY VOICE (very important): Write it the way a real person texts, not like an AI or a salesperson. Rules:
- Short. One or two sentences, like a real text message.
- Do NOT parrot or restate back what the seller just said. They know what they told you. Lines like "sounds like a really special piece of land with the creeks and old growth" are robotic; never echo their details back at them.
- Do NOT re-ask a question that was already asked anywhere in the thread. If they dodged it (e.g. you asked their price and they changed the subject), either move the conversation forward or ask it once in a different, lighter way, never the same words again.
- No hype, no stacked exclamation points, no filler pleasantries. Plain, warm, direct.
- Contractions are good. Sound like a normal human who is busy but friendly.
- Just write the next thing a sharp land buyer would actually send. If there is nothing useful to say, return "".

The draft_reply must fit where things actually stand in the file and must never reference an offer that was never made.

STYLE: Never use em dashes or en dashes anywhere in your output. Use commas, periods, or parentheses instead.`;

    const user = `Current date/time (America/Chicago): ${nowCentral()}.
Already booked (avoid these exact times): ${bookedList}.

LEAD STATE:
- Name: ${lead.name || lead.full_name || 'Unknown'}
- Land: ${county ? `${county} County` : 'unknown county'}${acres ? `, ${acres} acres` : ''}
- Current stage: ${stage}
- Offer field: ${offerField}

FULL FILE (oldest first, each line timestamped; includes texts, calls, and internal notes):
${record}

Return ONLY this JSON:
{
  "lean": one of ${JSON.stringify(VALID_LEANS)} or null,
  "follow_up": { "days_from_now": integer OR "weekday": day name, "time_24h": "HH:MM", "label": short next action } or null,
  "draft_reply": a short, friendly next text that fits where things stand, or "",
  "summary": one short sentence on the lead's character and where they stand right now
}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error?.message || 'AI error' }, { status: 502 });

    let text = data.content?.[0]?.text?.trim() || '';
    const m = text.match(/\{[\s\S]*\}/);
    let parsed;
    try { parsed = JSON.parse(m ? m[0] : text); } catch { return NextResponse.json({ error: 'Could not parse suggestion', raw: text }, { status: 502 }); }

    const lean = VALID_LEANS.includes(parsed.lean) ? parsed.lean : null;
    const whenISO = resolveWhen(parsed.follow_up); // date computed in code, not by the model
    const noDash = (s) => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/[—–]/g, '-');
    return NextResponse.json({
      ok: true,
      lean,
      follow_up: whenISO ? { when: whenISO, label: noDash(parsed.follow_up.label || 'Follow up') } : null,
      draft_reply: noDash(typeof parsed.draft_reply === 'string' ? parsed.draft_reply : ''),
      summary: noDash(parsed.summary || ''),
    });
  } catch (err) {
    console.error('[ai suggest]', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
