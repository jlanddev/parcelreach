/**
 * Server-side rundown cadence — fired by real Project Blue activity so reps
 * don't have to click the manual buttons. Mirrors the client's
 * rundownSentMessage: completes the lead's open task(s) and schedules a
 * follow-up. Manual controls in the UI still work; this just automates the
 * common case (we actually texted the lead).
 *
 * Takes a service-role supabase client (RLS-bypassing).
 */
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

    // Schedule the follow-up: tomorrow 10am, preserving task type + owner.
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    tmrw.setHours(10, 0, 0, 0);
    await supabase.from('scheduled_tasks').insert({
      lead_id: leadId,
      assigned_to: (pending && pending[0]?.assigned_to) || lead?.current_owner_id || null,
      task_type: (pending && pending[0]?.task_type) || 'follow_up',
      title: `Follow Up: ${lead?.full_name || lead?.name || 'Lead'}`,
      description: 'Text sent — auto follow-up (Project Blue)',
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
