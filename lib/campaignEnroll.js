// Shared campaign enrollment: expands a campaign's steps into the text queue and
// call tasks for one lead. Used by the enroll API and the scheduler's auto-enroll.
import { fillTokens } from '@/lib/messageTokens';
const DAY = 86400000;
const fill = (msg, l) => fillTokens(msg, l);

const LEAD_COLS = 'id, full_name, name, phone, sms_opt_out, status, property_county, county, form_data';

// Find leads matching a bulk-drip rule. Crucially includes leads we've NEVER
// contacted/called (null timestamps) as long as they're older than the window,
// so "haven't texted or called in 30 days" actually returns people.
export async function leadsForRule(sb, { rule, stage, days }) {
  const cutoff = new Date(Date.now() - Math.max(1, Number(days) || 30) * DAY).toISOString();
  let cand = [];
  if (rule === 'nocontact' || rule === 'untouched') {
    ({ data: cand } = await sb.from('leads').select(LEAD_COLS)
      .or(`last_contact_at.lt.${cutoff},and(last_contact_at.is.null,created_at.lt.${cutoff})`).limit(300));
  } else if (rule === 'nocall') {
    ({ data: cand } = await sb.from('leads').select(LEAD_COLS)
      .lt('created_at', cutoff).or(`last_call_at.lt.${cutoff},last_call_at.is.null`).limit(300));
  } else if (rule === 'stage') {
    ({ data: cand } = await sb.from('leads').select(LEAD_COLS)
      .eq('pipeline_status', String(stage || '').toUpperCase())
      .or(`last_activity_at.lt.${cutoff},last_activity_at.is.null`).limit(300));
  } else if (rule === 'notext') {
    const { data: recent } = await sb.from('activities')
      .select('lead_id').eq('activity_type', 'TEXT').eq('direction', 'OUTBOUND').gte('created_at', cutoff).limit(8000);
    const textedRecently = new Set((recent || []).map(r => r.lead_id));
    const { data: pool } = await sb.from('leads').select(LEAD_COLS).lt('created_at', cutoff).limit(600);
    cand = (pool || []).filter(l => !textedRecently.has(l.id));
  }
  return (cand || []).filter(l => l.phone && !l.sms_opt_out && l.status !== 'archived');
}

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
    // Timing: delayMin (minutes after enrollment) is authoritative; fall back to day.
    const offMin = step.delayMin != null ? Number(step.delayMin) : (Number(step.day) || 0) * 1440;
    const dueAt = new Date(Date.now() + offMin * 60000).toISOString();
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
