import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getMessagesForPhone } from '@/lib/projectBlue';

// Reads a lead's recent text thread and suggests a substatus (lean), a follow-up
// date/time pulled from the conversation, and a draft reply. Suggestions only;
// the rep confirms in the UI. Phase 1 = texts (calls come later).

const VALID_LEANS = ['verbal_yes', 'negotiating', 'reviewing', 'cooling', 'hot', 'working', 'stalled', 'long_shot'];

function nowCentral() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date());
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
    const transcript = thread.map((m) => `${m.who}: ${m.text}`).join('\n');
    const system = `You are a careful lead-triage assistant for a land-buying CRM. You read the SMS thread between us (the buyer) and a land seller and suggest the next step. Be conservative: only suggest what the conversation clearly supports. It is better to leave a field null than to guess. Respond with ONLY a JSON object, no prose, no code fences.

Lean definitions (pick the single best fit ONLY if the thread clearly supports it, else null):
- verbal_yes: seller verbally agreed to sell / accepted terms
- negotiating: actively going back and forth on price or terms
- reviewing: engaged, considering, will get back to us
- cooling: was engaged, now going quiet or hesitant
- hot: brand-new strong interest, motivated, no offer yet
- working: normal active conversation, no strong signal yet
- stalled: stuck, no movement
- long_shot: low odds (unrealistic price, barely engaged)

Scheduling rules:
- If a specific time was agreed in the thread, use that exact time.
- Otherwise, only propose a follow-up if one is clearly warranted; pick a sensible slot on a WEEKDAY between 9:00 AM and 5:00 PM America/Chicago.
- Do NOT reuse a time that is already booked (see the list). Spread suggestions out; avoid clustering everything at the same hour.
- If no follow-up is warranted, return null.`;
    const user = `Current date/time (America/Chicago): ${nowCentral()}.
Already booked (avoid these exact times, weekdays/business hours only): ${bookedList}.

Lead: ${lead.name || lead.full_name || 'Unknown'}${county ? `, land in ${county} County` : ''}.

SMS thread (oldest first):
${transcript}

Return ONLY this JSON:
{
  "lean": one of ${JSON.stringify(VALID_LEANS)} or null,
  "follow_up": { "when": ISO-8601 datetime with timezone offset, "label": short action } or null,
  "draft_reply": a short, friendly next text to send, or "",
  "summary": one short sentence on where this lead stands
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
    return NextResponse.json({
      ok: true,
      lean,
      follow_up: parsed.follow_up && parsed.follow_up.when ? { when: parsed.follow_up.when, label: String(parsed.follow_up.label || 'Follow up') } : null,
      draft_reply: typeof parsed.draft_reply === 'string' ? parsed.draft_reply : '',
      summary: String(parsed.summary || ''),
    });
  } catch (err) {
    console.error('[ai suggest]', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
