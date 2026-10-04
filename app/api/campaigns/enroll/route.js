import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fillTokens } from '@/lib/messageTokens';
import { leadsForRule } from '@/lib/campaignEnroll';

// POST /api/campaigns/enroll
// Body: { campaignId, leadIds?: [uuid], rule?: 'silent-inflow', days?: number, moveOut?: bool }
// Enrolls leads into a campaign: creates campaign_enrollments and expands the
// campaign's steps into campaign_queue (text steps) + scheduled_tasks (call
// steps), with {{first}}/{{sender}} filled in. If `rule` is 'silent-inflow',
// it finds inflow leads we texted but who haven't replied in `days` days and
// enrolls those. With moveOut, enrolled leads leave inflow (status FOLLOW_UP).

const DAY = 86400000;
const fill = (msg, l) => fillTokens(msg, l);

export async function POST(request) {
  try {
    const body = await request.json();
    const { campaignId, moveOut } = body;
    if (!campaignId) return NextResponse.json({ ok: false, error: 'campaignId required' }, { status: 400 });

    const sb = supabaseAdmin();
    const { data: campaign, error: cErr } = await sb.from('campaigns').select('id, name, steps, active').eq('id', campaignId).maybeSingle();
    if (cErr || !campaign) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
    const steps = Array.isArray(campaign.steps) ? campaign.steps : [];

    // Resolve the lead set.
    let leads = [];
    if (Array.isArray(body.leadIds) && body.leadIds.length) {
      const { data } = await sb.from('leads').select('id, full_name, name, phone, pipeline_status, status, property_county, county, form_data').in('id', body.leadIds);
      leads = data || [];
    } else if (body.rule === 'silent-inflow') {
      const days = Number(body.days) > 0 ? Number(body.days) : 7;
      const cutoff = new Date(Date.now() - days * DAY).toISOString();
      const inflow = ['NEW', 'CONTACTING', 'CONTACTED', 'ANTHONY_CONTACTED', 'ANTHONY_FOLLOW_UP'];
      // texted them, last contact was outbound, and nothing since the cutoff
      const { data } = await sb.from('leads')
        .select('id, full_name, name, phone, pipeline_status, status, last_contact_at, last_contact_dir, property_county, county, form_data')
        .in('pipeline_status', inflow)
        .eq('last_contact_dir', 'outbound')
        .lt('last_contact_at', cutoff)
        .limit(500);
      leads = (data || []).filter(l => l.status !== 'archived' && l.phone);
    } else if (['nocontact', 'notext', 'nocall', 'stage'].includes(body.rule)) {
      leads = await leadsForRule(sb, { rule: body.rule, stage: body.stage, stages: body.stages, tabs: body.tabs, days: body.days });
    } else {
      return NextResponse.json({ ok: false, error: 'Provide leadIds or rule' }, { status: 400 });
    }

    // Count-only mode: how many leads would be added (minus those already in),
    // without changing anything. Used by the "Populate now" confirm dialog.
    if (body.countOnly) {
      const ids = leads.map(l => l.id);
      let alreadyIn = 0;
      if (ids.length) {
        const { data: existing } = await sb.from('campaign_enrollments').select('lead_id').eq('campaign_id', campaignId).in('lead_id', ids);
        alreadyIn = (existing || []).length;
      }
      return NextResponse.json({ ok: true, considered: leads.length, wouldAdd: Math.max(0, leads.length - alreadyIn), alreadyIn });
    }

    let enrolled = 0, already = 0, queued = 0, calls = 0;
    for (const lead of leads) {
      // Create the enrollment (skip if already enrolled in this campaign).
      const { data: enr, error: eErr } = await sb.from('campaign_enrollments')
        .insert({ lead_id: lead.id, campaign_id: campaignId, status: 'active', enrolled_by: body.userId || null })
        .select('id').maybeSingle();
      if (eErr) {
        // Unique (lead, campaign) violation => already enrolled.
        already++; continue;
      }
      if (!enr) { already++; continue; }
      enrolled++;

      // Expand steps.
      const textRows = [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const offMin = step.delayMin != null ? Number(step.delayMin) : (Number(step.day) || 0) * 1440;
        const dueAt = new Date(Date.now() + offMin * 60000).toISOString();
        if (step.type === 'call') {
          const callRow = {
            lead_id: lead.id, task_type: 'callback', title: step.label || `Follow-up call: ${campaign.name}`,
            description: `Campaign: ${campaign.name}`, due_at: dueAt, status: 'pending', priority: 'normal', source: 'campaign',
          };
          let { error: ce } = await sb.from('scheduled_tasks').insert(callRow);
          if (ce) { const { source, ...noSrc } = callRow; await sb.from('scheduled_tasks').insert(noSrc).then(() => {}, () => {}); }
          calls++;
        } else {
          textRows.push({
            enrollment_id: enr.id, lead_id: lead.id, campaign_id: campaignId, step_index: i,
            type: 'text', message: fill(step.message, lead), label: step.label || null,
            due_at: dueAt, status: 'pending',
          });
        }
      }
      if (textRows.length) {
        const { error: qErr } = await sb.from('campaign_queue').insert(textRows);
        if (!qErr) queued += textRows.length;
      }

      // Optionally move the lead out of inflow onto the drip.
      if (moveOut) {
        await sb.from('leads').update({ pipeline_status: 'FOLLOW_UP', last_activity_at: new Date().toISOString() }).eq('id', lead.id).then(() => {}, () => {});
      }
    }

    return NextResponse.json({ ok: true, considered: leads.length, enrolled, already, queued, calls });
  } catch (err) {
    console.error('[campaigns enroll]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Enroll failed' }, { status: 500 });
  }
}
