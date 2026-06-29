import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getMessagesForPhone } from '@/lib/projectBlue';

// Reads a lead's recent text thread and suggests a substatus (lean), a follow-up
// date/time pulled from the conversation, and a draft reply. Suggestions only;
// the rep confirms in the UI. Phase 1 = texts (calls come later).

const VALID_LEANS = ['hot', 'warm', 'cold', 'ready'];

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

const CH = 'America/Chicago';
function nowCentral() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CH, weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date());
}
// Today's Y/M/D in Central.
function centralYMD() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: CH, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return { y: +p.find((x) => x.type === 'year').value, m: +p.find((x) => x.type === 'month').value, d: +p.find((x) => x.type === 'day').value };
}
// A Central wall-clock time → correct UTC instant (DST-safe).
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

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    const { leadId } = await request.json();
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

    const supabase = supabaseAdmin();
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    // Build the thread. Prefer Project Blue; fall back to the activity log.
    let thread = [];
    try {
      const msgs = await getMessagesForPhone(lead.phone);
      thread = (msgs || []).map((m) => ({
        who: m.direction === 'outbound' ? 'Us' : 'Seller',
        text: m.content || '',
        at: m.sent_at || m.created_at,
      }));
    } catch { /* fall back below */ }
    if (!thread.length) {
      const { data: acts } = await supabase
        .from('activities').select('direction, message_content, created_at')
        .eq('lead_id', leadId).eq('activity_type', 'TEXT')
        .order('created_at', { ascending: true }).limit(30);
      thread = (acts || []).map((a) => ({
        who: (a.direction || '').toUpperCase() === 'OUTBOUND' ? 'Us' : 'Seller',
        text: a.message_content || '', at: a.created_at,
      }));
    }
    thread = thread.filter((m) => m.text).slice(-25);
    if (!thread.length) return NextResponse.json({ error: 'No conversation to read yet.' }, { status: 400 });

    // Calendar awareness: what's already booked, so it spreads times out.
    const { data: booked } = await supabase
      .from('scheduled_tasks')
      .select('due_at, title')
      .eq('status', 'pending')
      .gte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })
      .limit(60);
    const bookedList = (booked || [])
      .map((t) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t.due_at)))
      .join('; ') || 'nothing booked';

    const county = lead.property_county || lead.county || '';
    const acres = lead.acreage || lead.acres || '';
    const stage = STAGE_LABEL(lead.pipeline_status || lead.status);
    const offerMade = lead.offer_amount ? `yes, $${Number(lead.offer_amount).toLocaleString()}` : 'NO, no offer has been made yet';
    const transcript = thread.map((m) => `${m.who}: ${m.text}`).join('\n');
    const system = `You are a careful lead-triage assistant for a land-buying company. You read the SMS thread between us (the buyer) and a land seller and answer three things: (1) how hot the lead is, (2) the single next action, (3) when to do it. Base everything ONLY on the thread and the lead state given. Never invent facts. It is better to return null than to guess. Respond with ONLY a JSON object, no prose, no code fences.

(1) TEMPERATURE, pick exactly one:
- hot: motivated and engaged, deal is moving, responding well
- warm: interested but slow, or needs nurturing; lukewarm
- cold: unresponsive, hesitant, or unrealistic on price
- ready: has verbally agreed / is ready to move to an offer or contract

(2) NEXT ACTION, put a short imperative in follow_up.label, e.g. "Call back", "Send offer", "Text follow-up", "Nurture", "Set appointment".
CRITICAL: Only suggest "Send offer" or anything about an offer if an offer has ALREADY been made is "yes". If no offer has been made, do NOT mention an offer in the action or the draft reply.

(3) SCHEDULE, describe WHEN relatively; do NOT compute calendar dates yourself.
- Use "days_from_now": 0 = today, 1 = tomorrow, 2 = day after, etc. Use this for relative references like "tomorrow" or "in a couple days".
- OR use "weekday": a day name ("monday".."friday") if the seller named a specific weekday.
- Always give "time_24h" like "15:00". If a time was agreed in the thread, use it; otherwise pick a weekday slot 9:00-17:00.
- If no follow-up is warranted, return null for follow_up.

The draft_reply must fit the current stage and must never reference an offer that hasn't been made.`;
    const user = `Current date/time (America/Chicago): ${nowCentral()}.
Already booked (avoid these times): ${bookedList}.

LEAD STATE:
- Name: ${lead.name || lead.full_name || 'Unknown'}
- Land: ${county ? `${county} County` : 'unknown county'}${acres ? `, ${acres} acres` : ''}
- Current stage: ${stage}
- Offer made: ${offerMade}

SMS thread (oldest first):
${transcript}

Return ONLY this JSON:
{
  "lean": one of ${JSON.stringify(VALID_LEANS)} or null,
  "follow_up": { "days_from_now": integer OR "weekday": day name, "time_24h": "HH:MM", "label": short next action } or null,
  "draft_reply": a short, friendly next text that fits the stage, or "",
  "summary": one short sentence on the lead's character and where they stand
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
    return NextResponse.json({
      ok: true,
      lean,
      follow_up: whenISO ? { when: whenISO, label: String(parsed.follow_up.label || 'Follow up') } : null,
      draft_reply: typeof parsed.draft_reply === 'string' ? parsed.draft_reply : '',
      summary: String(parsed.summary || ''),
    });
  } catch (err) {
    console.error('[ai suggest]', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
