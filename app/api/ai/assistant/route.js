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
function nowCentral() {
  // Exact current date AND time in Central, so "call back Tuesday at 2" or
  // "in 3 days" resolve to the right moment.
  const p = new Intl.DateTimeFormat('en-US', { timeZone: CH, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value;
  return `${g('weekday')} ${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')} ${g('dayPeriod')}`;
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

    // Active campaigns the assistant can drop the lead into by name.
    let campaignList = 'none set up yet';
    try {
      const { data: camps } = await supabase.from('campaigns').select('name, description').eq('active', true);
      if (camps?.length) campaignList = camps.map((c) => `"${c.name}"${c.description ? ` (${c.description})` : ''}`).join(', ');
    } catch { /* table may not exist yet */ }

    const system = `You are a sharp acquisitions assistant embedded in a land CRM, helping a rep work ONE seller lead. After a call or at any time, the rep types what happened or what they want in plain language (e.g. "still needs time, getting closer to offer", "call her back Tuesday at 2", "put him in the family drip", "she is ready, moving to offer"). You read the lead file, understand it, and either give a short read or take ONE action to route the lead. The overarching goal is always to get the seller back on the phone and move toward a signed contract. Nothing should ever just sit: if there is no clear next move, schedule a follow-up.

ACTIONS (pick at most one):
- set_task: schedule a call/follow-up. Fields: in_days (int from now) OR date ("YYYY-MM-DD"), optional time ("HH:MM" 24h, default 10:00), short label.
- enroll_campaign: drop the lead into a nurture drip by name. Field: campaign (must match one of the available campaign names). Use this for "keep them in the drip", "needs time", "talking to family", etc.
- set_stage: move the pipeline stage. Field: stage, one of NEW, CONTACTING, OFFER_CURATED, APPT_SET_FOR_JORDAN, OFFER_SENT, NEGOTIATING, AGREEMENT_SENT, UNDER_CONTRACT, CLOSED, FOLLOW_UP, LOST, NURTURE. Use when they say things like "moving to offer", "she signed", "not interested" (LOST or NURTURE).
- set_lean: set temperature. lean one of hot, warm, cold, ready.

AVAILABLE CAMPAIGNS: ${campaignList}.

Reply in 1-3 short sentences, plain and specific, like a helpful teammate. If you scheduled or routed something, say what and when in plain words. If the rep only asked for advice, action null.

Respond with ONLY a JSON object, no prose, no code fences:
{ "reply": string, "action": null | {"type":"set_task","in_days"?:int,"date"?:"YYYY-MM-DD","time"?:"HH:MM","label":string} | {"type":"enroll_campaign","campaign":string} | {"type":"set_stage","stage":string} | {"type":"set_lean","lean":"hot"|"warm"|"cold"|"ready"} }

Rules: resolve all dates/times from the exact current time given below (a weekday or "Tuesday at 2" becomes an absolute date/time; "in 3 days" becomes in_days 3). Never schedule in the past. Never use em dashes. Only enroll_campaign with a name from the available list.`;

    const user = `Exact current time (Central): ${nowCentral()}.
LEAD: ${lead.name || lead.full_name || 'Unknown'} | ${county ? county + ' County' : 'unknown county'}${acres ? `, ${acres} acres` : ''} | stage ${stage} | offer ${offer}
FILE (oldest first):
${record}

REP TYPED: ${instruction}

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
