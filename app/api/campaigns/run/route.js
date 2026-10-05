import { NextResponse } from 'next/server';
import { sendMessage } from '@/lib/projectBlue';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enrollLead, leadsForRule, PROTECTED_STAGES } from '@/lib/campaignEnroll';
import { fillTokens } from '@/lib/messageTokens';

const DAY = 86400000;

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

  const previewOnly = url.searchParams.get('dry') === '1';

  // Quiet hours (TCPA): real sends only 10am-8pm Central (inside legal everywhere).
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false, hourCycle: 'h23' }).formatToParts(new Date());
  const chHour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const quiet = chHour < 10 || chHour >= 20;

  // TWO SEPARATE GATES:
  // - BULK DRIP + auto-enroll: only real when CAMPAIGNS_LIVE === 'true'. This is
  //   the big risky one, kept behind the env flag.
  // - APPOINTMENT REMINDERS: transactional, low volume, tied to a booked meeting.
  //   They send on any real scheduled tick (outside quiet hours) whenever the
  //   reminder campaign is active, REGARDLESS of CAMPAIGNS_LIVE, so pausing the
  //   drip never silences appointment reminders.
  const live = process.env.CAMPAIGNS_LIVE === 'true';
  const dryRun = previewOnly || !live || quiet;        // bulk drip / auto-enroll
  const remindersDry = previewOnly || quiet;            // appointment reminders

  // DRIP THROTTLE: never fire a big burst (carriers flag high velocity as spam).
  // Only a handful go out per run; the rest stay pending for the next tick. With
  // the scheduler every 30 min, this meters a backlog out gradually.
  const MAX_PER_RUN = Math.max(1, Number(process.env.CAMPAIGN_MAX_PER_RUN) || 8);

  const now = new Date().toISOString();
  const { data: due } = await supabase.from('campaign_queue')
    .select('id, lead_id, enrollment_id, message, type')
    .eq('status', 'pending').eq('type', 'text').lte('due_at', now)
    .order('due_at', { ascending: true }).limit(100);

  let sent = 0, skipped = 0, failed = 0; const preview = [];
  const perLeadSent = new Set();  // leads we REALLY texted this run (drip + reminder share it)
  const previewLeads = new Set(); // leads already shown in the dry preview
  for (const item of due || []) {
    try {
      // Throttle: once we've fired the per-run cap, stop; the rest wait for the next tick.
      if ((dryRun ? preview.length : sent) >= MAX_PER_RUN) break;
      // One message per person per run. In dry mode nothing is really sent, so
      // only dedup the preview (perLeadSent must reflect REAL sends only, so it
      // doesn't wrongly block this lead's appointment reminder below).
      if (dryRun ? previewLeads.has(item.lead_id) : perLeadSent.has(item.lead_id)) { skipped++; continue; }
      const { data: enr } = await supabase.from('campaign_enrollments').select('status').eq('id', item.enrollment_id).maybeSingle();
      if (enr && enr.status !== 'active') { if (!dryRun) await mark(supabase, item.id, 'cancelled'); skipped++; continue; }
      const { data: lead } = await supabase.from('leads').select('full_name, name, phone, sms_opt_out, pipeline_status, last_contact_at, last_contact_dir, property_county, county, form_data').eq('id', item.lead_id).maybeSingle();
      if (!lead?.phone) { if (!dryRun) await mark(supabase, item.id, 'failed'); failed++; continue; }
      if (lead.sms_opt_out) { if (!dryRun) await mark(supabase, item.id, 'cancelled'); skipped++; continue; }
      // Never drip a deal in progress or a closed deal, even if it got queued.
      if (PROTECTED_STAGES.includes(String(lead.pipeline_status || '').toUpperCase())) {
        if (!dryRun) { await supabase.from('campaign_enrollments').update({ status: 'cancelled' }).eq('id', item.enrollment_id); await mark(supabase, item.id, 'cancelled'); }
        skipped++; continue;
      }
      // If they've replied to us (last message inbound), never auto-drip over it.
      // Pause the enrollment so a human handles it, and stop queued texts for them.
      if (String(lead.last_contact_dir || '').toLowerCase() === 'inbound') {
        if (!dryRun) {
          await supabase.from('campaign_enrollments').update({ status: 'replied' }).eq('id', item.enrollment_id).eq('status', 'active');
          await mark(supabase, item.id, 'cancelled');
        }
        skipped++; continue;
      }
      // Safety net: re-run token fill so no raw {{...}} can ever go out, even if a
      // queued message somehow still has one. Already-filled text is left as-is.
      const outMsg = fillTokens(item.message, lead);

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
        previewLeads.add(item.lead_id);
        preview.push({ lead_id: item.lead_id, name: lead.full_name || lead.name || 'Lead', phone: lead.phone, message: outMsg });
        continue;
      }

      perLeadSent.add(item.lead_id); // real send only
      await sendMessage({ to: lead.phone, message: outMsg });

      const nowIso = new Date().toISOString();
      const row = { lead_id: item.lead_id, activity_type: 'TEXT', direction: 'OUTBOUND', outcome: 'SENT', message_content: outMsg, created_at: nowIso };
      const { error } = await supabase.from('activities').insert({ ...row, read_at: nowIso });
      if (error) await supabase.from('activities').insert(row);
      await supabase.from('leads').update({ last_activity_at: nowIso, last_contact_at: nowIso, last_contact_dir: 'outbound', last_contact_channel: 'text', last_contact_preview: String(outMsg).slice(0, 200) }).eq('id', item.lead_id);
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

  // ---- Appointment reminders: text the seller before their meeting. Supports
  // MULTIPLE reminders (e.g. 24h before AND 3h before), editable in the hidden
  // '__settings:appointment_reminder' row (steps = array of {enabled,hoursBefore,message}).
  // Each reminder is sent at most once per appointment, tracked with a [reminded:i]
  // marker. One text per lead per run (shared with the drip) still holds. ----
  let reminded = 0;
  try {
    const DEFAULT_REM = [{ enabled: true, hoursBefore: 3, message: 'Hi {{first}}, this is Jordan with Haven Ground. Reminder of our appointment today at {{time}} to talk about your land. Looking forward to it!' }];
    let remList = DEFAULT_REM;
    let remActive = true;
    try {
      // Reminders now live in a normal campaign row; fall back to the legacy settings row.
      let { data: s } = await supabase.from('campaigns').select('steps, active').eq('name', 'Appointment Reminders').maybeSingle();
      if (!s) ({ data: s } = await supabase.from('campaigns').select('steps, active').eq('name', '__settings:appointment_reminder').maybeSingle());
      if (s?.steps && Array.isArray(s.steps) && s.steps.length) remList = s.steps;
      if (s) remActive = s.active !== false;
    } catch { /* use defaults */ }
    // Keep original indices so the [reminded:i] marker is stable, then drop disabled ones.
    const active = !remActive ? [] : remList.map((r, i) => ({ ...r, i, H: Number(r.hoursBefore) > 0 ? Number(r.hoursBefore) : 3 })).filter(r => r.enabled !== false);
    const maxH = active.length ? Math.max(...active.map(r => r.H)) : 0;
    const TZ_BY_ABBR = { ET: 'America/New_York', CT: 'America/Chicago', MT: 'America/Denver', PT: 'America/Los_Angeles' };
    const soon = new Date(Date.now() + maxH * 3600 * 1000).toISOString();
    const { data: meetings } = !active.length ? { data: [] } : await supabase.from('scheduled_tasks')
      .select('id, lead_id, due_at, description, title')
      .eq('task_type', 'meeting').eq('status', 'pending')
      .gte('due_at', now).lte('due_at', soon).limit(50);
    for (const m of meetings || []) {
      if (/^BLOCKED/i.test(m.title || '') || !m.lead_id) continue;
      if (perLeadSent.has(m.lead_id)) continue; // already messaging them this run
      const hoursUntil = (new Date(m.due_at).getTime() - Date.now()) / 3600000;
      // Pick the largest-window reminder that is due now and not yet sent, one per run.
      let pick = null;
      for (const r of active) {
        if (hoursUntil <= r.H && !(m.description || '').includes(`[reminded:${r.i}]`)) {
          if (!pick || r.H > pick.H) pick = r;
        }
      }
      if (!pick) continue;
      const { data: lead } = await supabase.from('leads').select('full_name, name, phone, sms_opt_out, property_county, county, form_data').eq('id', m.lead_id).maybeSingle();
      if (!lead?.phone || lead.sms_opt_out) continue;
      perLeadSent.add(m.lead_id);
      const abbr = (String(m.description || '').match(/·\s*(ET|CT|MT|PT)/i) || [])[1];
      const tz = TZ_BY_ABBR[(abbr || 'CT').toUpperCase()] || 'America/Chicago';
      const tLabel = new Date(m.due_at).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
      const msg = fillTokens(pick.message || DEFAULT_REM[0].message, lead, { time: tLabel });
      if (remindersDry) { preview.push({ lead_id: m.lead_id, name: lead.full_name || lead.name || 'Lead', phone: lead.phone, message: `[REMINDER] ${msg}` }); continue; }
      await sendMessage({ to: lead.phone, message: msg });
      const ri = new Date().toISOString();
      await supabase.from('activities').insert({ lead_id: m.lead_id, activity_type: 'TEXT', direction: 'OUTBOUND', outcome: 'SENT', message_content: msg, created_at: ri, read_at: ri }).then(() => {}, () => {});
      await supabase.from('scheduled_tasks').update({ description: `${m.description || ''} [reminded:${pick.i}]`.trim() }).eq('id', m.id);
      reminded++;
    }
  } catch (e) { console.error('[campaign run] reminders failed', e?.message); }

  // ---- Rule-based auto-enroll (bulk drip): any active campaign whose description
  // carries an [auto:<rule>:N] marker pulls in everyone matching that rule who isn't
  // already enrolled, then expands its steps for them. Rules:
  //   nocontact (or legacy untouched) - no text/call in N+ days
  //   notext  - no OUTBOUND text in N+ days (and the lead is older than N days)
  //   nocall  - no call in N+ days
  // Optional stage filter: [auto:<rule>:N:STAGE1,STAGE2] limits to those stages.
  // Protected stages (deals in progress/closed) and repliers are always excluded.
  // Capped per run so a big backlog trickles in over several ticks. ----
  let autoEnrolled = 0; const autoPreview = [];
  try {
    const { data: camps } = await supabase.from('campaigns')
      .select('id, name, steps, description, active').eq('active', true);
    for (const camp of camps || []) {
      if (String(camp.name || '').startsWith('__settings') || camp.name === 'Appointment Reminders') continue;
      const desc = String(camp.description || '');
      const stageM = desc.match(/\[auto:stage:([A-Za-z_]+):(\d+)\]/i); // legacy single-status marker
      const ruleM = desc.match(/\[auto:(nocontact|notext|nocall|noactivity|noappt|nevercontacted|untouched):(\d+)(?::([A-Za-z0-9_,-]+))?\]/i);
      if (!stageM && !ruleM) continue;
      const rule = stageM ? 'nocontact' : (ruleM[1].toLowerCase() === 'untouched' ? 'nocontact' : ruleM[1].toLowerCase());
      const days = Math.max(1, Number((stageM ? stageM[2] : ruleM[2])) || 30);
      // Tokens after the days are CRM tab keys (new) or raw statuses (legacy);
      // leadsForRule figures out which and filters offer-aware for tab keys.
      const tokens = stageM ? [stageM[1]] : (ruleM[3] ? ruleM[3].split(',').filter(Boolean) : []);
      // Enrollment is cheap (just moves leads into the campaign / out of inflow);
      // SENDING stays throttled separately at MAX_PER_RUN. So clear a backlog fast.
      const AUTO_ENROLL_PER_RUN = Math.max(1, Number(process.env.CAMPAIGN_AUTOENROLL_PER_RUN) || 150);
      const cand = (await leadsForRule(supabase, { rule, tabs: tokens, stages: tokens, days })).slice(0, AUTO_ENROLL_PER_RUN);

      for (const lead of cand) {
        const { data: ex } = await supabase.from('campaign_enrollments')
          .select('id').eq('lead_id', lead.id).eq('campaign_id', camp.id).maybeSingle();
        if (ex) continue;
        if (dryRun) { autoEnrolled++; autoPreview.push({ campaign: camp.name, lead_id: lead.id, name: lead.full_name || lead.name || 'Lead' }); continue; }
        const r = await enrollLead(supabase, camp, lead);
        if (r.enrolled) autoEnrolled++;
      }
    }
  } catch (e) { console.error('[campaign run] auto-enroll failed', e?.message); }

  return NextResponse.json({ ok: true, live, dryRun, considered: (due || []).length, wouldSend: preview.length, preview: dryRun ? preview.slice(0, 50) : undefined, sent, reminded, skipped, failed, autoEnrolled, autoEnrollPreview: dryRun ? autoPreview.slice(0, 50) : undefined });
}

export async function POST(request) { return run(request); }
export async function GET(request) { return run(request); }
