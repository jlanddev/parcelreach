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
  const url = new URL(request.url);
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    const q = url.searchParams.get('secret');
    if (auth !== `Bearer ${secret}` && q !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = supabaseAdmin();

  // SAFETY: nothing is sent for real unless CAMPAIGNS_LIVE === 'true'. Otherwise
  // (or with ?dry=1) this runs in DRY-RUN: it computes exactly what WOULD go out,
  // changes nothing, and returns the preview. Flip the env var to go live.
  const live = process.env.CAMPAIGNS_LIVE === 'true';
  const dryRun = !live || url.searchParams.get('dry') === '1';

  // Quiet hours (TCPA): only send 10am to 8pm Central (inside legal 8am-9pm in
  // every US timezone). Enforced only on real sends; a dry-run previews anytime.
  if (!dryRun) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false, hourCycle: 'h23' }).formatToParts(new Date());
    const chHour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    if (chHour < 10 || chHour >= 20) {
      return NextResponse.json({ ok: true, live, skipped: 'quiet hours (10am-8pm Central only)', hour: chHour, sent: 0 });
    }
  }

  const now = new Date().toISOString();
  const { data: due } = await supabase.from('campaign_queue')
    .select('id, lead_id, enrollment_id, message, type')
    .eq('status', 'pending').eq('type', 'text').lte('due_at', now)
    .order('due_at', { ascending: true }).limit(50);

  let sent = 0, skipped = 0, failed = 0; const preview = [];
  for (const item of due || []) {
    try {
      const { data: enr } = await supabase.from('campaign_enrollments').select('status').eq('id', item.enrollment_id).maybeSingle();
      if (enr && enr.status !== 'active') { if (!dryRun) await mark(supabase, item.id, 'cancelled'); skipped++; continue; }
      const { data: lead } = await supabase.from('leads').select('full_name, name, phone, sms_opt_out, last_contact_at, last_contact_dir').eq('id', item.lead_id).maybeSingle();
      if (!lead?.phone) { if (!dryRun) await mark(supabase, item.id, 'failed'); failed++; continue; }
      if (lead.sms_opt_out) { if (!dryRun) await mark(supabase, item.id, 'cancelled'); skipped++; continue; }

      // One automated text per lead per day. If we already texted them today
      // (Central), push this to tomorrow instead of stacking a second one.
      if (lead.last_contact_at && lead.last_contact_dir === 'outbound') {
        const dayOf = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(d));
        if (dayOf(lead.last_contact_at) === dayOf(new Date())) {
          if (!dryRun) {
            const tomorrow = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
            await supabase.from('campaign_queue').update({ due_at: tomorrow }).eq('id', item.id);
          }
          skipped++; continue;
        }
      }

      if (dryRun) {
        preview.push({ lead_id: item.lead_id, name: lead.full_name || lead.name || 'Lead', phone: lead.phone, message: item.message });
        continue;
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
      console.error('[campaign run] item failed, will retry', item.id, e?.message);
      failed++;
    }
  }

  if (!dryRun) {
    try {
      const enrollmentIds = [...new Set((due || []).map((d) => d.enrollment_id))];
      for (const eid of enrollmentIds) {
        const { count } = await supabase.from('campaign_queue').select('id', { count: 'exact', head: true }).eq('enrollment_id', eid).eq('status', 'pending');
        if ((count || 0) === 0) await supabase.from('campaign_enrollments').update({ status: 'done' }).eq('id', eid).eq('status', 'active');
      }
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ ok: true, live, dryRun, considered: (due || []).length, wouldSend: preview.length, preview: dryRun ? preview.slice(0, 50) : undefined, sent, skipped, failed });
}

export async function POST(request) { return run(request); }
export async function GET(request) { return run(request); }
