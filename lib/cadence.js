/**
 * Server-side rundown cadence, fired by real Project Blue activity so reps
 * don't have to click the manual buttons. Mirrors the client's
 * rundownSentMessage: completes the lead's open task(s) and schedules a
 * follow-up. Manual controls in the UI still work; this just automates the
 * common case (we actually texted the lead).
 *
 * Takes a service-role supabase client (RLS-bypassing).
 */

// Build a UTC Date for `hour`:00, `daysFromNow` days out, in the business
// timezone (America/Chicago), so server-created tasks land at the right wall
// time regardless of the server running in UTC. DST-safe.
const BUSINESS_TZ = 'America/Chicago';
function businessTimeUTC(daysFromNow, hour, minute = 0) {
  const target = new Date(Date.now() + daysFromNow * 86400000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(target);
  const y = +parts.find((p) => p.type === 'year').value;
  const m = +parts.find((p) => p.type === 'month').value;
  const d = +parts.find((p) => p.type === 'day').value;
  const guess = Date.UTC(y, m - 1, d, hour, minute, 0);
  const asLocal = new Date(new Date(guess).toLocaleString('en-US', { timeZone: BUSINESS_TZ }));
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess + (asUtc.getTime() - asLocal.getTime()));
}

// Find the next open 30-minute slot on the OWNER's schedule so the day's auto
// calls line up back to back (9:00, 9:30, 10:00 ...) instead of all landing at
// the same time. Slots run 9:00 to 4:30pm Central; a slot is free if no pending
// task for that owner sits within 30 minutes of it. When a day fills up, it
// spills to the next day. Per-owner so Anthony's calls pack against Anthony's.
async function nextOpenSlot(supabase, ownerId, startDay = 1) {
  const HALF = 30 * 60 * 1000;
  for (let day = startDay; day < startDay + 6; day++) {
    const slots = [];
    for (let h = 9; h < 17; h++) { slots.push(businessTimeUTC(day, h, 0)); slots.push(businessTimeUTC(day, h, 30)); }
    const dayStart = businessTimeUTC(day, 0, 0).toISOString();
    const dayEnd = businessTimeUTC(day, 23, 59).toISOString();
    let q = supabase.from('scheduled_tasks').select('due_at').eq('status', 'pending').gte('due_at', dayStart).lte('due_at', dayEnd);
    q = ownerId ? q.eq('assigned_to', ownerId) : q.is('assigned_to', null);
    const { data: existing } = await q;
    const taken = (existing || []).map((t) => new Date(t.due_at).getTime()).filter((n) => !Number.isNaN(n));
    for (const s of slots) {
      if (!taken.some((x) => Math.abs(x - s.getTime()) < HALF)) return s;
    }
  }
  return businessTimeUTC(startDay, 10); // everything full: fall back to 10am
}

export async function autoCadenceOnOutboundText(supabase, leadId) {
  if (!leadId) return;
  try {
    // IMPORTANT: sending a text must NOT complete the lead's existing tasks.
    // A pending call you still owe the seller has to stay in the bell until you
    // actually make it; texting him is not the same as calling him. So if the
    // lead already has a pending follow-up or callback, leave it untouched and
    // don't stack a second one.
    const { data: existing } = await supabase
      .from('scheduled_tasks')
      .select('id')
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .in('task_type', ['follow_up', 'callback'])
      .limit(1);
    if (existing && existing.length) return;

    const { data: lead } = await supabase
      .from('leads')
      .select('current_owner_id, full_name, name')
      .eq('id', leadId)
      .maybeSingle();

    // No pending follow-up yet, so schedule the momentum one into the next open
    // 30-min slot on the owner's schedule (starting the next business day) so the
    // day's calls spread out instead of stacking at one time. Framed as a call,
    // since a cold thread is a cue to pick up the phone.
    const slot = await nextOpenSlot(supabase, lead?.current_owner_id || null, 1);
    await supabase.from('scheduled_tasks').insert({
      lead_id: leadId,
      assigned_to: lead?.current_owner_id || null,
      task_type: 'callback',
      title: `Call ${lead?.full_name || lead?.name || 'Lead'} (no reply to text)`,
      description: 'Texted, no reply yet, call to keep momentum',
      due_at: slot.toISOString(),
      status: 'pending',
      priority: 'normal',
    });

    // NOTE: we intentionally do NOT change the lead's status here. Sending a text
    // is not "contacted", the lead may never respond. Status only advances to
    // In Contact on a reply, a completed call, or a manual change.
  } catch (e) {
    // Never let cadence break the send/webhook.
    console.error('[autoCadenceOnOutboundText]', e);
  }
}
