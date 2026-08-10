import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getMessagesForPhone } from '@/lib/projectBlue';

// Conversational assistant for one lead. The rep either asks for a read or tells
// it to do something (set a call/follow-up task). It reads the lead file and
// returns { reply, action }. The client executes the action (set_task/set_lean).
const CH = 'America/Chicago';
function stamp(at) {
  if (!at) return '';
  const d = new Date(at); if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: CH, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}
function todayCentral() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: CH, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value;
  return `${g('weekday')} ${g('year')}-${g('month')}-${g('day')}`;
}

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    const { leadId, instruction } = await request.json();
    if (!leadId || !instruction) return NextResponse.json({ error: 'Missing leadId or instruction' }, { status: 400 });

    const supabase = supabaseAdmin();
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    // Compact file: recent notes + texts + calls.
    const events = [];
    const { data: notes } = await supabase.from('lead_notes').select('content, created_at, user_id').eq('lead_id', leadId).order('created_at', { ascending: true }).limit(40);
    for (const n of notes || []) { const c = (n.content || '').replace(/@\w+/g, '').trim(); if (c && !/^\[[A-Za-z]+\]/.test(c)) events.push({ at: n.created_at, line: `Note: ${c}` }); }
    try {
      const msgs = await getMessagesForPhone(lead.phone);
      for (const m of (msgs || [])) if (m.content) events.push({ at: m.sent_at || m.created_at, line: `Text (${m.direction === 'outbound' ? 'us' : 'seller'}): ${m.content}` });
    } catch { /* ignore */ }
    const { data: calls } = await supabase.from('activities').select('direction, outcome, created_at, message_content').eq('lead_id', leadId).eq('activity_type', 'CALL').order('created_at', { ascending: true }).limit(20);
    for (const c of calls || []) events.push({ at: c.created_at, line: `Call (${(c.direction || '').toLowerCase()}, ${c.outcome || ''})${c.message_content ? ': ' + c.message_content : ''}` });
    events.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    const record = events.slice(-40).map((e) => `[${stamp(e.at)}] ${e.line}`).join('\n') || 'No texts, calls, or notes yet.';

    const county = lead.property_county || lead.county || '';
    const acres = lead.acreage || lead.acres || '';
    const stage = (lead.pipeline_status || lead.status || 'NEW').toUpperCase();
    const offer = lead.offer_amount ? `$${Number(lead.offer_amount).toLocaleString()}` : 'none';

    const system = `You are a sharp acquisitions assistant embedded in a land CRM, helping a rep work ONE seller lead. The rep will either ask you a question (give a tight, useful read) or tell you to do something. You can take ONE action:
- set_task: schedule a call or follow-up. Fields: in_days (integer from today) OR date ("YYYY-MM-DD"), optional time ("HH:MM", 24h, default 10:00), and a short label (e.g. "Call to follow up on offer").
- set_lean: set the lead temperature. lean is one of hot, warm, cold, ready.
If the rep is just asking for advice, take no action.

Read the lead file and the rep's instruction. Reply in 1-3 short sentences, plain and specific, like a helpful teammate. If you scheduled something, say when in plain words.

Respond with ONLY a JSON object, no prose, no code fences:
{ "reply": string, "action": null | { "type": "set_task", "in_days"?: int, "date"?: "YYYY-MM-DD", "time"?: "HH:MM", "label": string } | { "type": "set_lean", "lean": "hot"|"warm"|"cold"|"ready" } }

Rules: compute dates from today. Never use em dashes. If the rep says something like "follow up in 3 days", use in_days 3. If they name a weekday or date, resolve it to an absolute date. Only set_task when they ask to schedule/follow up/call, or when giving advice and a follow-up is clearly the move and they asked you to set it.`;

    const user = `Today: ${todayCentral()} (Central).
LEAD: ${lead.name || lead.full_name || 'Unknown'} | ${county ? county + ' County' : 'unknown county'}${acres ? `, ${acres} acres` : ''} | stage ${stage} | offer ${offer}
FILE (oldest first):
${record}

REP INSTRUCTION: ${instruction}

Return ONLY the JSON.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, temperature: 0.2, system, messages: [{ role: 'user', content: user }] }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error?.message || 'AI error' }, { status: 502 });
    let text = (data.content?.[0]?.text || '').trim().replace(/^```json\s*|\s*```$/g, '');
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { reply: text.replace(/\s*[—–]\s*/g, ', '), action: null }; }
    const reply = (parsed.reply || 'Done.').replace(/\s*[—–]\s*/g, ', ');
    return NextResponse.json({ ok: true, reply, action: parsed.action || null });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
