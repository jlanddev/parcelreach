/**
 * Server-side rundown cadence — fired by real Project Blue activity so reps
 * don't have to click the manual buttons. Mirrors the client's
 * rundownSentMessage: completes the lead's open task(s) and schedules a
 * follow-up. Manual controls in the UI still work; this just automates the
 * common case (we actually texted the lead).
 *
 * Takes a service-role supabase client (RLS-bypassing).
 */

// Build a UTC Date for `hour`:00, `daysFromNow` days out, in the business
// timezone (America/Chicago) — so server-created tasks land at the right wall
// time regardless of the server running in UTC. DST-safe.
const BUSINESS_TZ = 'America/Chicago';
function businessTimeUTC(daysFromNow, hour) {
  const target = new Date(Date.now() + daysFromNow * 86400000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(target);
  const y = +parts.find((p) => p.type === 'year').value;
  const m = +parts.find((p) => p.type === 'month').value;
  const d = +parts.find((p) => p.type === 'day').value;
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  const asLocal = new Date(new Date(guess).toLocaleString('en-US', { timeZone: BUSINESS_TZ }));
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess + (asUtc.getTime() - asLocal.getTime()));
}

export async function autoCadenceOnOutboundText(supabase, leadId) {
  if (!leadId) return;
  try {
    // Complete the lead's open rundown task(s).
    const { data: pending } = await supabase
      .from('scheduled_tasks')
      .select('id, assigned_to, task_type')
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .order('due_at', { ascending: true });

    if (pending && pending.length) {
      await supabase
        .from('scheduled_tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('status', 'pending');
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('current_owner_id, full_name, name, pipeline_status, status')
      .eq('id', leadId)
      .maybeSingle();

    // Schedule the follow-up: tomorrow 10am CENTRAL, preserving task type + owner.
    const tmrw = businessTimeUTC(1, 10);
    await supabase.from('scheduled_tasks').insert({
      lead_id: leadId,
      assigned_to: (pending && pending[0]?.assigned_to) || lead?.current_owner_id || null,
      task_type: (pending && pending[0]?.task_type) || 'follow_up',
      title: `Follow Up: ${lead?.full_name || lead?.name || 'Lead'}`,
      description: 'Text sent, auto follow-up (Project Blue)',
      due_at: tmrw.toISOString(),
      status: 'pending',
      priority: 'normal',
    });

    // Advance a brand-new lead to CONTACTING.
    const s = (lead?.pipeline_status || lead?.status || '').toUpperCase();
    if (!s || s === 'NEW') {
      await supabase.from('leads').update({ status: 'contacting', pipeline_status: 'CONTACTING' }).eq('id', leadId);
    }
  } catch (e) {
    // Never let cadence break the send/webhook.
    console.error('[autoCadenceOnOutboundText]', e);
  }
}
