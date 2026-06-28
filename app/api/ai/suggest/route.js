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

    const county = lead.property_county || lead.county || '';
    const transcript = thread.map((m) => `${m.who}: ${m.text}`).join('\n');
    const system = `You are a lead-triage assistant for a land-buying CRM. Read the SMS thread between us (the buyer) and a land seller, then suggest the next steps. Respond with ONLY a JSON object, no prose, no code fences.`;
    const user = `Current date/time: ${nowCentral()}.
Lead: ${lead.name || lead.full_name || 'Unknown'}${county ? `, land in ${county} County` : ''}.

SMS thread (oldest first):
${transcript}

Return ONLY this JSON:
{
  "lean": one of ${JSON.stringify(VALID_LEANS)} or null,  // deal temperature/substatus that best fits
  "follow_up": { "when": ISO-8601 datetime with timezone offset or null, "label": short action like "Call back" },  // if a time was agreed or implied (e.g. "tomorrow ~12"), resolve it to a real datetime
  "draft_reply": a short, friendly next text to send (or ""),
  "summary": one short sentence on where this lead stands
}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, system, messages: [{ role: 'user', content: user }] }),
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
