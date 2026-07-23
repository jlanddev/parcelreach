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

  let target = null; // a UTC Date pinned to the target Y/M/D (midnight UTC)
  // Preferred: an absolute Central calendar date the model resolved itself
  // (anchored to the message timestamps), e.g. "2026-06-30".
  const dm = String(fu.date || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dm) {
    const y = +dm[1], mo = +dm[2], d = +dm[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) target = new Date(Date.UTC(y, mo - 1, d));
  }
  // Fallbacks: relative day / weekday, measured from today.
  if (!target) {
    const base = new Date(Date.UTC(t.y, t.m - 1, t.d));
    if (Number.isInteger(fu.days_from_now)) {
      const c = new Date(base); c.setUTCDate(c.getUTCDate() + Math.max(0, Math.min(120, fu.days_from_now)));
      target = c;
    } else if (fu.weekday && DOW[String(fu.weekday).toLowerCase()] != null) {
      const want = DOW[String(fu.weekday).toLowerCase()];
      for (let i = 1; i <= 7; i++) { const c = new Date(base); c.setUTCDate(c.getUTCDate() + i); if (c.getUTCDay() === want) { target = c; break; } }
    }
  }
  if (!target) return null;

  // Safety net: never schedule in a past calendar day. If the resolved date is
  // before today (a stale "tomorrow" the model misread), pull it up to today.
  const todayUTC = new Date(Date.UTC(t.y, t.m - 1, t.d));
  if (target < todayUTC) target = todayUTC;

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

    const system = `You are an elite land acquisitions manager for a land-buying company. You are better at sales and seller psychology than the rep reading your suggestion; they should trust your read over their own gut. You read the COMPLETE file for one land seller (the SMS thread, the call log, and the team's internal notes, all in one timeline with timestamps) and decide the smartest next move to advance the deal. Base everything ONLY on the file and lead state given. Read the WHOLE timeline and weight the MOST RECENT events most heavily. Pay attention to timestamps so timing is right (e.g. "spoke this evening, she wants a day to think" means follow up tomorrow, not today). Never invent facts. Better to return null than to guess. Respond with ONLY a JSON object, no prose, no code fences.

LEAD TYPE matters a lot for tone and wording. The lead type is given below.
- INBOUND: the seller submitted their property to us and asked us to look. You can reference that they reached out.
- ON-MARKET: WE found their property listed for sale and are reaching out as an interested buyer. The seller did NOT contact us, and the contact may be the listing agent, not the owner. For ON-MARKET leads you must NEVER say or imply they reached out, "wanted us to check out" their land, or filled anything out. Frame everything as a professional, low-pressure buyer interested in their listed property (open to a cash offer, can close quick). If it is the agent, talk agent-to-buyer.

HOW LAND ACQUISITION WORKS (use this to decide the next move):
1. The whole game is: build rapport, uncover the seller's real motivation and timeline, get their price expectation, get them on a PHONE CALL, then anchor and make an offer, handle objections, and close. Texts exist to earn the call. The phone is where deals are made.
2. Diagnose where this seller is and what is blocking the deal, then pick the move that removes that block:
   - No price yet: your job is to get a price expectation, ideally on a call. If they dodge price over text (common), stop interrogating by text and pivot to "let's hop on a quick call." Pushing the same question a third time over text kills the deal.
   - Engaged and sharing details (like Jason describing the creeks, acreage, growth): that is a BUYING SIGNAL, they are proud of the land and want to deal. Reward it by moving to a call, not by re-asking what they already dodged.
   - Gave a price that is unrealistic: do not argue over text. Acknowledge, plant a seed about how you underwrite, and get to a call.
   - Went quiet after interest: re-engage with a light, low-pressure touch, give them an easy yes.
   - Verbally agreed or asked about offer/terms: move fast, lock the call or send the offer, do not stall a hot seller.
3. Seller psychology: sellers fear being lowballed and being pressured. Lower their guard with warmth and confidence, never desperation. Scarcity and certainty (you close fast, no hassle) move them; begging does not. Match their energy: a chatty seller gets warmth, a terse seller gets brevity.
4. Momentum is everything. A motivated seller who goes cold for days usually went to another buyer. When the last move was ours and they are engaged, follow up within a day, not a week.

(1) TEMPERATURE, pick exactly one:
- hot: motivated and engaged, deal is moving, responding well, or a good call just happened
- warm: interested but slow, or needs nurturing; lukewarm
- cold: unresponsive, hesitant, or unrealistic on price
- ready: has verbally agreed / is ready to move to an offer or contract

(2) NEXT ACTION: choose the single move that best advances the deal given your diagnosis above, not just the obvious one. Favor getting them on a call once there is any real engagement; only keep texting when it is too early for a call or they are not ready. Put a short imperative in follow_up.label, e.g. "Call to get price", "Call back", "Follow up on offer", "Send offer", "Light text re-engage", "Nurture", "Set appointment".

(3) SCHEDULE. Return the absolute Central calendar date for the next action.
- CRITICAL ANCHORING RULE: a relative day word inside a SELLER'S message ("tomorrow", "today", "this week", "next week") is relative to the DATE THAT MESSAGE WAS SENT, shown in its [timestamp], NOT relative to right now. Example: a message sent on Mon Jun 29 that says "let's talk tomorrow" means Tue Jun 30, even if you are reading this after midnight on Jun 30 or later. Work out the actual calendar day the seller meant, then output it.
- Give "date" as the absolute target day in "YYYY-MM-DD" (Central). The current date is given below; use it plus the message timestamps to compute the real day. Double check: the date you output must be today or later, never in the past.
- Also give "time_24h" like "15:00". If a time was agreed in the file, use it; if they said they are busy at a time, avoid it; otherwise pick a slot 9:00-17:00.
- TIME OF DAY: it is rude to text or call a seller in the middle of the night. If it is currently late and the action is not pinned to a specific agreed day, schedule it for the next morning. But never push a call PAST a day the seller actually agreed to (if they said "tomorrow" and that day is today, schedule it today).
- If no follow-up is warranted, return null for follow_up.

OFFERS: An offer counts as ALREADY MADE if the Offer field shows an amount OR the notes/calls/texts clearly state an offer or price was given to the seller. Only then may you reference an offer (e.g. "follow up on the offer"). If no offer has been made anywhere in the file, do NOT mention an offer in the action or the draft reply.

DRAFT REPLY VOICE (very important): The draft is a FOLLOW-UP text that picks up exactly where the thread actually left off. Write it the way a sharp but friendly land buyer actually texts.
- GROUND IT IN WHAT REALLY HAPPENED. Read the last few lines and respond to them specifically. Do NOT invent events. NEVER say things like "great talking to you" or "good chatting" unless the call log shows you actually had a completed phone call. If you have only exchanged texts, you have not "talked" to them.
- ADVANCE, do not loop. If the seller already agreed to a call and/or gave you their number (e.g. "sounds good, my number is..."), do NOT vaguely re-ask their availability. Lock it: propose a specific time and confirm, like "Perfect, I'll give you a ring tomorrow morning around 10. Talk then." Re-asking "what does your schedule look like" after they already said yes makes you look like a bot.
- If it is late and a call is already set or agreed, the best move is often a short warm reminder for the morning ("Hey [name], looking forward to our call today") rather than texting again tonight. Use that when it fits.
- Do NOT parrot or restate back what the seller just said. Never echo their property details back at them.
- It is fine to ask their price again if they dodged it, but keep it light and pair it with moving toward a call. Never repeat your earlier wording word for word.
- No hype, no stacked exclamation points, no filler. Contractions are good. Sound like a busy but warm human, not a bare one-line question and not a paragraph.
- Aim for about one to three short sentences. If there is genuinely nothing useful to send right now (e.g. a call is already locked and it is late), return "".

The draft_reply must fit where things actually stand in the file and must never reference an offer that was never made.

STYLE: Never use em dashes or en dashes anywhere in your output. Use commas, periods, or parentheses instead.`;

    const user = `Current date/time (America/Chicago): ${nowCentral()}.
Already booked (avoid these exact times): ${bookedList}.

LEAD STATE:
- Name: ${lead.name || lead.full_name || 'Unknown'}${lead.source === 'subdivision' ? ' (this is the property OWNER, not who we contact)' : ''}
- Land: ${county ? `${county} County` : 'unknown county'}${acres ? `, ${acres} acres` : ''}
- Current stage: ${stage}
- Lead type: ${lead.source === 'subdivision' ? 'ON-MARKET (we sourced this from a listing; the seller did NOT submit it; outbound buyer outreach, contact is the listing agent)' : 'INBOUND (the seller submitted their property to us)'}${lead.source === 'subdivision' ? `
- WHO WE ARE CONTACTING: the LISTING AGENT${lead.form_data?.agentName ? `, ${lead.form_data.agentName}` : ' (name not yet entered)'}. Address the agent by their first name when known, NOT the owner (${lead.form_data?.listing_owner || lead.full_name || lead.name}). Reference the listing/property, ask about the seller's price and timeline, and position as a serious cash buyer who can close quick. Never greet or thank the owner by name.
- PHRASING: refer to the location as "${county} County" (with the word County), never the bare name (e.g. "Austin" alone reads like the city). Reference the property size (${acres ? `${acres} acres` : 'the acreage'}) when it helps.` : ''}
- Offer field: ${offerField}

FULL FILE (oldest first, each line timestamped; includes texts, calls, and internal notes):
${record}

Return ONLY this JSON:
{
  "lean": one of ${JSON.stringify(VALID_LEANS)} or null,
  "follow_up": { "date": "YYYY-MM-DD" (the absolute Central day, today or later), "time_24h": "HH:MM", "label": short next action } or null,
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
