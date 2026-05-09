import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const payload = await request.json();
    const event = payload.type || payload.event;
    const data = payload.data || payload;

    console.log('[Quo Webhook]', event, JSON.stringify(data).slice(0, 500));

    if (event === 'call.completed') {
      await handleCallCompleted(data);
    } else if (event === 'call.recording.completed') {
      await handleRecording(data);
    } else if (event === 'call.transcript.completed') {
      await handleTranscript(data);
    } else if (event === 'call.summary.completed') {
      await handleSummary(data);
    } else if (event === 'message.received') {
      await handleMessageReceived(data);
    } else if (event === 'message.delivered') {
      await handleMessageDelivered(data);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Quo Webhook Error]', err);
    return NextResponse.json({ ok: true }); // Always 200 so Quo doesn't retry
  }
}

// Normalize phone to digits only for matching
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10);
}

// Find lead by phone number
async function findLeadByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 7) return null;

  const { data: leads } = await supabase
    .from('leads')
    .select('id, full_name, name, phone, status, pipeline_status')
    .or(`phone.ilike.%${normalized}%,owner_phone.ilike.%${normalized}%`)
    .limit(1);

  return leads?.[0] || null;
}

// Determine the external party phone (not our Quo number)
function getExternalPhone(callData) {
  // For completed calls, check participants or from/to
  const participants = callData.participants || [];
  const from = callData.from;
  const to = callData.to;

  // Our Quo numbers
  const quoNumbers = ['+13464366735', '+17068131205', '+17019227150', '+15722282503', '+16614868369'];
  const isOurNumber = (n) => quoNumbers.some(q => normalizePhone(q) === normalizePhone(n));

  // Find external participant
  for (const p of participants) {
    const num = p.phoneNumber || p.number || p;
    if (typeof num === 'string' && !isOurNumber(num)) return num;
  }

  if (from && !isOurNumber(from)) return from;
  if (to && !isOurNumber(to)) return to;

  return null;
}

async function handleCallCompleted(data) {
  const externalPhone = getExternalPhone(data);
  if (!externalPhone) return;

  const lead = await findLeadByPhone(externalPhone);
  if (!lead) {
    console.log('[Quo] No lead found for phone:', externalPhone);
    return;
  }

  const direction = data.direction || 'unknown';
  const duration = data.duration || 0;
  const durationMin = Math.round(duration / 60);
  const answered = data.status === 'completed' && duration > 0;

  let outcome, note;

  if (!answered || duration < 5) {
    // Missed or very short call
    outcome = direction === 'inbound' ? 'MISSED_INBOUND' : 'VM';
    note = `[Auto] ${direction === 'inbound' ? 'Missed inbound call' : 'No answer / left VM'} from Quo`;
  } else {
    // Connected call
    outcome = 'SPOKE';
    note = `[Auto] ${direction === 'inbound' ? 'Inbound' : 'Outbound'} call via Quo (${durationMin}m ${duration % 60}s)`;
  }

  // Update lead status based on outcome
  const updates = { updated_at: new Date().toISOString() };

  if (outcome === 'SPOKE') {
    const currentStatus = (lead.pipeline_status || lead.status || '').toUpperCase();
    if (!currentStatus || currentStatus === 'NEW' || currentStatus === 'CONTACTING') {
      updates.status = 'contacted';
      updates.pipeline_status = 'CONTACTED';
    }
  }

  await supabase.from('leads').update(updates).eq('id', lead.id);

  // Schedule follow-up task for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const taskType = outcome === 'SPOKE' ? 'Follow Up' : 'Discovery Call';

  // Check if there's already a pending task for this lead
  const { data: existingTasks } = await supabase
    .from('scheduled_tasks')
    .select('id')
    .eq('lead_id', lead.id)
    .eq('status', 'pending')
    .limit(1);

  if (!existingTasks || existingTasks.length === 0) {
    await supabase.from('scheduled_tasks').insert({
      lead_id: lead.id,
      task_type: taskType,
      description: note,
      due_at: tomorrow.toISOString(),
      status: 'pending',
      created_at: new Date().toISOString()
    });
  }

  console.log(`[Quo] Logged ${outcome} for lead ${lead.full_name || lead.name} (${lead.id})`);
}

async function handleRecording(data) {
  const callId = data.callId;
  if (!callId) return;
  // Recording URL will be available in data.url or data.recordingUrl
  console.log('[Quo] Recording ready for call:', callId);
}

async function handleTranscript(data) {
  const callId = data.callId;
  if (!callId) return;
  console.log('[Quo] Transcript ready for call:', callId);
  // Future: parse transcript for callback dates and auto-schedule
}

async function handleSummary(data) {
  const callId = data.callId;
  if (!callId) return;
  console.log('[Quo] Summary ready for call:', callId);
}

async function handleMessageReceived(data) {
  const from = data.from;
  if (!from) return;

  const lead = await findLeadByPhone(from);
  if (!lead) return;

  console.log(`[Quo] Inbound SMS from lead ${lead.full_name || lead.name}`);

  // Schedule callback task
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const { data: existingTasks } = await supabase
    .from('scheduled_tasks')
    .select('id')
    .eq('lead_id', lead.id)
    .eq('status', 'pending')
    .limit(1);

  if (!existingTasks || existingTasks.length === 0) {
    await supabase.from('scheduled_tasks').insert({
      lead_id: lead.id,
      task_type: 'Follow Up',
      description: `[Auto] Lead texted back via Quo`,
      due_at: tomorrow.toISOString(),
      status: 'pending',
      created_at: new Date().toISOString()
    });
  }
}

async function handleMessageDelivered(data) {
  const to = data.to?.[0] || data.to;
  if (!to) return;

  const lead = await findLeadByPhone(to);
  if (!lead) return;

  console.log(`[Quo] Outbound SMS delivered to lead ${lead.full_name || lead.name}`);
}
