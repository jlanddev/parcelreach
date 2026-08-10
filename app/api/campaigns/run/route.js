import { NextResponse } from 'next/server';
import { sendMessage } from '@/lib/projectBlue';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Campaign scheduler tick. Sends any drip texts that are due, logs them to the
// lead timeline (same as a manual text), and marks the queue item done. Call
// steps are already scheduled_tasks, so this only handles text steps. Skips
// leads that opted out or whose enrollment was stopped (e.g. they replied).
// Invoked by the Netlify scheduled function; protect with CAMPAIGN_RUN_SECRET.
async function mark(supabase, id, status) {
  await supabase.from('campaign_queue').update({ status, processed_at: new Date().toISOString() }).eq('id', id);
}

async function run(request) {
  const secret = process.env.CAMPAIGN_RUN_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    const q = new URL(request.url).searchParams.get('secret');
    if (auth !== `Bearer ${secret}` && q !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = supabaseAdmin();

  // Quiet hours (TCPA): only send 10am to 8pm Central. That window is inside the
  // legal 8am to 9pm in the recipient's local time across every US timezone, so
  // no lead is ever texted too early or too late. Outside it, we send nothing;
  // due texts wait and go out when the window opens.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false, hourCycle: 'h23' }).formatToParts(new Date());
  const chHour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  if (chHour < 10 || chHour >= 20) {
    return NextResponse.json({ ok: true, skipped: 'quiet hours (10am-8pm Central only)', hour: chHour, sent: 0 });
  }

  const now = new Date().toISOString();
  const { data: due } = await supabase.from('campaign_queue')
    .select('id, lead_id, enrollment_id, message, type')
    .eq('status', 'pending').eq('type', 'text').lte('due_at', now)
    .order('due_at', { ascending: true }).limit(50);

  let sent = 0, skipped = 0, failed = 0;
  for (const item of due || []) {
    try {
      const { data: enr } = await supabase.from('campaign_enrollments').select('status').eq('id', item.enrollment_id).maybeSingle();
      if (enr && enr.status !== 'active') { await mark(supabase, item.id, 'cancelled'); skipped++; continue; }
      const { data: lead } = await supabase.from('leads').select('phone, sms_opt_out, last_contact_at, last_contact_dir').eq('id', item.lead_id).maybeSingle();
      if (!lead?.phone) { await mark(supabase, item.id, 'failed'); failed++; continue; }
      if (lead.sms_opt_out) { await mark(supabase, item.id, 'cancelled'); skipped++; continue; }

      // One automated text per lead per day. If we already sent this lead
      // something today (Central), don't stack a second on top, push this one
      // to tomorrow so it goes out then instead. Manual texts are unaffected.
      if (lead.last_contact_at && lead.last_contact_dir === 'outbound') {
        const dayOf = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(d));
        if (dayOf(lead.last_contact_at) === dayOf(new Date())) {
          const tomorrow = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
          await supabase.from('campaign_queue').update({ due_at: tomorrow }).eq('id', item.id);
          skipped++; continue;
        }
      }

      await sendMessage({ to: lead.phone, message: item.message });

      const nowIso = new Date().toISOString();
      const row = { lead_id: item.lead_id, activity_type: 'TEXT', direction: 'OUTBOUND', outcome: 'SENT', message_content: item.message, created_at: nowIso };
      const { error } = await supabase.from('activities').insert({ ...row, read_at: nowIso });
      if (error) await supabase.from('activities').insert(row);
      await supabase.from('leads').update({ last_activity_at: nowIso, last_contact_at: nowIso, last_contact_dir: 'outbound', last_contact_channel: 'text', last_contact_preview: String(item.message).slice(0, 200) }).eq('id', item.lead_id);
      await mark(supabase, item.id, 'sent');
      sent++;
    } catch (e) {
      // Leave it PENDING so a transient Project Blue error retries next run
      // instead of permanently dropping the text.
      console.error('[campaign run] item failed, will retry', item.id, e?.message);
      failed++;
    }
  }

  // Close out enrollments that have no pending queue items left.
  try {
    const enrollmentIds = [...new Set((due || []).map((d) => d.enrollment_id))];
    for (const eid of enrollmentIds) {
      const { count } = await supabase.from('campaign_queue').select('id', { count: 'exact', head: true }).eq('enrollment_id', eid).eq('status', 'pending');
      if ((count || 0) === 0) await supabase.from('campaign_enrollments').update({ status: 'done' }).eq('id', eid).eq('status', 'active');
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, considered: (due || []).length, sent, skipped, failed });
}

export async function POST(request) { return run(request); }
export async function GET(request) { return run(request); }
