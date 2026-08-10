import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Scans the CRM for the logged-in person and returns a short, prioritized read
// of their day: what's overdue, what's hot, what's slipping, what to do first.
export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    const { userId, cleanView, leadIds } = await request.json();

    const supabase = supabaseAdmin();
    const now = new Date();
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);

    // In Clean View, only consider the pushed leads (the client sends their ids,
    // or we fall back to the clean_view flag). Otherwise scan the whole board.
    let scopeIds = null;
    if (cleanView) {
      if (Array.isArray(leadIds) && leadIds.length) scopeIds = leadIds;
      else {
        const { data: cv } = await supabase.from('leads').select('id').eq('clean_view', true);
        scopeIds = (cv || []).map((l) => l.id);
      }
      if (scopeIds.length === 0) scopeIds = ['00000000-0000-0000-0000-000000000000']; // none -> empty scan
    }

    // Their pending tasks due through today (with the lead attached).
    let taskQ = supabase
      .from('scheduled_tasks')
      .select('id, lead_id, title, task_type, due_at, priority')
      .eq('status', 'pending')
      .lte('due_at', endToday.toISOString())
      .order('due_at', { ascending: true })
      .limit(60);
    if (scopeIds) taskQ = taskQ.in('lead_id', scopeIds);
    const { data: tasks } = await taskQ;
    const myTasks = tasks || [];

    const taskLeadIds = [...new Set((myTasks).map((t) => t.lead_id).filter(Boolean))];
    let leadsById = {};
    if (taskLeadIds.length) {
      const { data: leads } = await supabase.from('leads').select('id, full_name, name, pipeline_status, status, offer_amount, last_activity_at, property_county, county, acres, acreage').in('id', taskLeadIds);
      leadsById = Object.fromEntries((leads || []).map((l) => [l.id, l]));
    }

    // Leads that have gone quiet: pending offer / negotiating with no activity in 3+ days.
    let warmQ = supabase
      .from('leads')
      .select('id, full_name, name, pipeline_status, status, offer_amount, last_activity_at, property_county, county')
      .in('pipeline_status', ['OFFER_SENT', 'NEGOTIATING', 'APPT_SET_FOR_JORDAN', 'AGREEMENT_SENT'])
      .limit(80);
    if (scopeIds) warmQ = warmQ.in('id', scopeIds);
    const { data: warm } = await warmQ;
    const stale = (warm || []).filter((l) => {
      const t = l.last_activity_at ? new Date(l.last_activity_at).getTime() : 0;
      return t && (now.getTime() - t) > 3 * 24 * 3600 * 1000;
    }).slice(0, 15);

    const stamp = (d) => d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'unknown';
    const taskLines = myTasks.slice(0, 40).map((t) => {
      const l = leadsById[t.lead_id] || {};
      const nm = l.full_name || l.name || 'Lead';
      const overdue = new Date(t.due_at).getTime() < now.getTime() - 12 * 3600 * 1000;
      const stage = (l.pipeline_status || l.status || '').toUpperCase();
      return `- ${nm} (${stage || 'new'})${l.offer_amount ? `, offer $${Number(l.offer_amount).toLocaleString()}` : ''}: ${t.title || 'task'} due ${stamp(t.due_at)}${overdue ? ' [OVERDUE]' : ''}`;
    }).join('\n') || 'No tasks due today.';
    const staleLines = stale.map((l) => `- ${l.full_name || l.name || 'Lead'} (${(l.pipeline_status || l.status || '').toUpperCase()})${l.offer_amount ? `, offer $${Number(l.offer_amount).toLocaleString()}` : ''}: no activity since ${stamp(l.last_activity_at)}`).join('\n') || 'None.';

    const system = `You are the acquisitions coach for a land-buying team. You get a snapshot of one rep's day: their tasks due today and the warm deals that have gone quiet. Give a SHORT, punchy game plan for the day: what to hit first and why, which quiet deals need a nudge, and any risk of a deal slipping. Be specific with names. No fluff, no preamble. Plain text, a few short lines or a tight bulleted list. Never use em dashes.`;
    const user = `Current time (Central): ${stamp(now)}.

TASKS DUE TODAY:
${taskLines}

WARM DEALS GONE QUIET (3+ days no activity):
${staleLines}

Give the rep their game plan for today.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, temperature: 0.3, system, messages: [{ role: 'user', content: user }] }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error?.message || 'AI error' }, { status: 502 });
    let summary = (data.content?.[0]?.text || '').trim().replace(/\s*[—–]\s*/g, ', ');
    return NextResponse.json({ ok: true, summary, taskCount: myTasks.length, staleCount: stale.length });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
