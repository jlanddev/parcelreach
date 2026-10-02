import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// POST /api/campaigns/enroll
// Body: { campaignId, leadIds?: [uuid], rule?: 'silent-inflow', days?: number, moveOut?: bool }
// Enrolls leads into a campaign: creates campaign_enrollments and expands the
// campaign's steps into campaign_queue (text steps) + scheduled_tasks (call
// steps), with {{first}}/{{sender}} filled in. If `rule` is 'silent-inflow',
// it finds inflow leads we texted but who haven't replied in `days` days and
// enrolls those. With moveOut, enrolled leads leave inflow (status FOLLOW_UP).

const DAY = 86400000;
const firstNameOf = (l) => String(l.full_name || l.name || '').trim().split(/\s+/)[0] || 'there';
const fill = (msg, l) => String(msg || '').replace(/\{\{\s*first\s*\}\}/gi, firstNameOf(l)).replace(/\{\{\s*sender\s*\}\}/gi, 'Jordan');

export async function POST(request) {
  try {
    const body = await request.json();
    const { campaignId, moveOut } = body;
    if (!campaignId) return NextResponse.json({ ok: false, error: 'campaignId required' }, { status: 400 });

    const sb = supabaseAdmin();
    const { data: campaign, error: cErr } = await sb.from('campaigns').select('id, steps, active').eq('id', campaignId).maybeSingle();
    if (cErr || !campaign) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
    const steps = Array.isArray(campaign.steps) ? campaign.steps : [];

    // Resolve the lead set.
    let leads = [];
    if (Array.isArray(body.leadIds) && body.leadIds.length) {
      const { data } = await sb.from('leads').select('id, full_name, name, phone, pipeline_status, status').in('id', body.leadIds);
      leads = data || [];
    } else if (body.rule === 'silent-inflow') {
      const days = Number(body.days) > 0 ? Number(body.days) : 7;
      const cutoff = new Date(Date.now() - days * DAY).toISOString();
      const inflow = ['NEW', 'CONTACTING', 'CONTACTED', 'ANTHONY_CONTACTED', 'ANTHONY_FOLLOW_UP'];
      // texted them, last contact was outbound, and nothing since the cutoff
      const { data } = await sb.from('leads')
        .select('id, full_name, name, phone, pipeline_status, status, last_contact_at, last_contact_dir')
        .in('pipeline_status', inflow)
        .eq('last_contact_dir', 'outbound')
        .lt('last_contact_at', cutoff)
        .limit(500);
      leads = (data || []).filter(l => l.status !== 'archived' && l.phone);
    } else {
      return NextResponse.json({ ok: false, error: 'Provide leadIds or rule' }, { status: 400 });
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
        const dayOffset = Number(step.day) || 0;
        const dueAt = new Date(Date.now() + dayOffset * DAY).toISOString();
        if (step.type === 'call') {
          await sb.from('scheduled_tasks').insert({
            lead_id: lead.id, task_type: 'callback', title: step.label || 'Campaign call',
            description: 'Campaign step', due_at: dueAt, status: 'pending', priority: 'normal',
          }).then(() => { calls++; }, () => {});
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
