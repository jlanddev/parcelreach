// Shared campaign enrollment: expands a campaign's steps into the text queue and
// call tasks for one lead. Used by the enroll API and the scheduler's auto-enroll.
import { fillTokens } from '@/lib/messageTokens';
const DAY = 86400000;
const fill = (msg, l) => fillTokens(msg, l);

const LEAD_COLS = 'id, full_name, name, phone, sms_opt_out, status, pipeline_status, offer_amount, last_contact_dir, property_county, county, form_data';

// Which CRM TAB a lead actually shows in — mirrors page.js homeTab(), including the
// "has an offer entered" rule. A CONTACTING lead WITH an offer lives in Offer
// Curated, not PPC Inflow, so a PPC-Inflow drip must NOT include it.
export function campaignTab(l) {
  if (String(l.status || '').toLowerCase() === 'archived') return 'archive';
  const s = String(l.pipeline_status || l.status || '').toUpperCase();
  const hasOffer = l.offer_amount != null && Number(l.offer_amount) !== 0;
  if (s === 'LOST') return 'lost';
  if (s === 'DEAD' || s === 'WE_PASSED') return 'lost';
  if (s === 'NURTURE') return 'nurture';
  if (s === 'FOLLOW_UP') return 'follow-up';
  if (['AGREEMENT_SENT', 'UNDER_CONTRACT', 'CLOSED'].includes(s)) return 'agreement-sent';
  if (['OFFER_SENT', 'NEGOTIATING'].includes(s)) return 'offer-made';
  const early = ['', 'NEW', 'CONTACTING', 'CONTACTED', 'ANTHONY_CONTACTED', 'ANTHONY_FOLLOW_UP', 'OFFER_CURATED'];
  if (hasOffer && [...early, 'APPT_SET_FOR_JORDAN'].includes(s)) return 'offer-curated';
  if (s === 'APPT_SET_FOR_JORDAN') return 'appointment-set';
  return 'ppc-inflow';
}

// Committed or closed deals that a bulk drip must NEVER touch, even if explicitly
// targeted: a signed contract, a closed/dead/passed deal, or an archived lead.
// Mid-funnel stages (offer curated/sent, negotiating, appt set) are allowed when
// the campaign explicitly targets them.
export const PROTECTED_STAGES = ['UNDER_CONTRACT', 'CLOSED', 'DEAD', 'WE_PASSED', 'ARCHIVED'];

// Find leads matching a bulk-drip rule. Includes leads we've NEVER contacted
// (null timestamps) as long as they're older than the window, so "haven't texted
// or called in 30 days" actually returns people. ALWAYS skips: leads with no
// name, leads whose last message was inbound (they replied, don't cold-blast
// them), opted-out/archived, and (except the stage rule) any protected stage.
const TAB_KEYS = ['ppc-inflow', 'appointment-set', 'offer-curated', 'offer-made', 'nurture', 'follow-up', 'lost', 'agreement-sent', 'archive'];

export async function leadsForRule(sb, { rule, stage, stages, tabs, days }) {
  const cutoff = new Date(Date.now() - Math.max(1, Number(days) || 30) * DAY).toISOString();
  // Targeting: prefer `tabs` (CRM tab keys, offer-aware). Fall back to legacy
  // `stages`/`stage` (raw pipeline_status) for campaigns created before tabs.
  const raw = Array.isArray(tabs) && tabs.length ? tabs : (Array.isArray(stages) && stages.length ? stages : (stage ? [stage] : []));
  const asTabs = raw.map(x => String(x).toLowerCase()).filter(x => TAB_KEYS.includes(x));
  const tabFilter = asTabs.length ? asTabs : null;
  const stageFilter = tabFilter ? [] : raw.map(s => String(s).toUpperCase());
  let cand = [];
  const r = rule === 'untouched' ? 'nocontact' : rule;
  if (r === 'nocontact') {
    ({ data: cand } = await sb.from('leads').select(LEAD_COLS)
      .or(`last_contact_at.lt.${cutoff},and(last_contact_at.is.null,created_at.lt.${cutoff})`).limit(600));
  } else if (r === 'nocall') {
    ({ data: cand } = await sb.from('leads').select(LEAD_COLS)
      .lt('created_at', cutoff).or(`last_call_at.lt.${cutoff},last_call_at.is.null`).limit(600));
  } else if (r === 'notext') {
    const { data: recent } = await sb.from('activities')
      .select('lead_id').eq('activity_type', 'TEXT').eq('direction', 'OUTBOUND').gte('created_at', cutoff).limit(8000);
    const textedRecently = new Set((recent || []).map(x => x.lead_id));
    const { data: pool } = await sb.from('leads').select(LEAD_COLS).lt('created_at', cutoff).limit(900);
    cand = (pool || []).filter(l => !textedRecently.has(l.id));
  } else if (r === 'noactivity') {
    // Nothing has happened on the lead (no activity) for N+ days.
    ({ data: cand } = await sb.from('leads').select(LEAD_COLS)
      .or(`last_activity_at.lt.${cutoff},and(last_activity_at.is.null,created_at.lt.${cutoff})`).limit(600));
  } else if (r === 'noappt') {
    // No appointment ever booked, and the lead has been in the door N+ days.
    // (Used for "came in but never scheduled with us" after e.g. 7 days.)
    const { data: meetings } = await sb.from('scheduled_tasks')
      .select('lead_id').eq('task_type', 'meeting').limit(8000);
    const hasMeeting = new Set((meetings || []).map(m => m.lead_id).filter(Boolean));
    const { data: pool } = await sb.from('leads').select(LEAD_COLS).lt('created_at', cutoff).limit(900);
    cand = (pool || []).filter(l => !hasMeeting.has(l.id));
  }
  const hasName = (l) => String(l.full_name || l.name || '').trim().length > 0;
  const replied = (l) => String(l.last_contact_dir || '').toLowerCase() === 'inbound';
  return (cand || []).filter(l => {
    const st = String(l.pipeline_status || '').toUpperCase();
    if (!l.phone || l.sms_opt_out || l.status === 'archived') return false;
    if (!hasName(l) || replied(l)) return false;
    if (PROTECTED_STAGES.includes(st)) return false; // never a deal in progress / closed
    if (tabFilter) {
      // Offer-aware: match the lead's REAL CRM tab (a CONTACTING lead with an
      // offer is Offer Curated, not PPC Inflow), so we never drip the wrong group.
      if (!tabFilter.includes(campaignTab(l))) return false;
    } else if (stageFilter.length && !stageFilter.includes(st)) {
      return false; // legacy status match
    }
    return true;
  });
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
