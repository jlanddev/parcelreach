// Shared campaign enrollment: expands a campaign's steps into the text queue and
// call tasks for one lead. Used by the enroll API and the scheduler's auto-enroll.
const DAY = 86400000;
const firstNameOf = (l) => String(l.full_name || l.name || '').trim().split(/\s+/)[0] || 'there';
const fill = (msg, l) => String(msg || '').replace(/\{\{\s*first\s*\}\}/gi, firstNameOf(l)).replace(/\{\{\s*sender\s*\}\}/gi, 'Jordan');

export async function enrollLead(sb, campaign, lead) {
  let { data: enr, error } = await sb.from('campaign_enrollments')
    .insert({ lead_id: lead.id, campaign_id: campaign.id, status: 'active' })
    .select('id').maybeSingle();
  if (error || !enr) return { already: true };
  const steps = Array.isArray(campaign.steps) ? campaign.steps : [];
  const textRows = [];
  let calls = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === 'rule') continue; // meta, not a sendable step
    const dueAt = new Date(Date.now() + (Number(step.day) || 0) * DAY).toISOString();
    if (step.type === 'call') {
      const row = { lead_id: lead.id, task_type: 'callback', title: step.label || `Follow-up call: ${campaign.name}`, description: `Campaign: ${campaign.name}`, due_at: dueAt, status: 'pending', priority: 'normal', source: 'campaign' };
      const { error: ce } = await sb.from('scheduled_tasks').insert(row);
      if (ce) { const { source, ...noSrc } = row; await sb.from('scheduled_tasks').insert(noSrc).then(() => {}, () => {}); }
      calls++;
    } else {
      textRows.push({ enrollment_id: enr.id, lead_id: lead.id, campaign_id: campaign.id, step_index: i, type: 'text', message: fill(step.message, lead), label: step.label || null, due_at: dueAt, status: 'pending' });
    }
  }
  if (textRows.length) await sb.from('campaign_queue').insert(textRows);
  return { enrolled: true, queued: textRows.length, calls };
}
