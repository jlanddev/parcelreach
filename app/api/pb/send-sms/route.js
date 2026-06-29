import { NextResponse } from 'next/server';
import { sendMessage } from '@/lib/projectBlue';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { autoCadenceOnOutboundText } from '@/lib/cadence';

// Send a text via Project Blue and log it to the lead timeline.
export async function POST(request) {
  try {
    const { to, message, leadId, userId, lineId } = await request.json();
    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Respect opt-out (STOP). Degrades gracefully if the column isn't there yet.
    if (leadId) {
      try {
        const { data: lead } = await supabase.from('leads').select('sms_opt_out').eq('id', leadId).maybeSingle();
        if (lead?.sms_opt_out) {
          return NextResponse.json({ error: 'This lead has opted out of texts (replied STOP).' }, { status: 403 });
        }
      } catch {
        /* sms_opt_out column may not exist pre-migration, allow send */
      }
    }

    const result = await sendMessage({ to, message, lineId });

    // Best-effort timeline log, don't fail the send if logging hiccups.
    if (leadId) {
      try {
        const row = {
          lead_id: leadId,
          user_id: userId || null,
          activity_type: 'TEXT',
          direction: 'OUTBOUND',
          outcome: 'SENT',
          message_content: message,
          created_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('activities').insert({ ...row, read_at: new Date().toISOString() });
        if (error) await supabase.from('activities').insert(row);
        const nowIso = new Date().toISOString();
        const lp = {
          last_activity_at: nowIso,
          last_contact_at: nowIso,
          last_contact_dir: 'outbound',
          last_contact_channel: 'text',
          last_contact_preview: String(message).slice(0, 200),
        };
        const { error: lpErr } = await supabase.from('leads').update(lp).eq('id', leadId);
        if (lpErr) await supabase.from('leads').update({ last_activity_at: nowIso }).eq('id', leadId);
        // Texting an unowned lead claims it for the sender (don't steal owned ones).
        if (userId) {
          await supabase.from('leads').update({ current_owner_id: userId }).eq('id', leadId).is('current_owner_id', null);
        }
      } catch (e) {
        console.error('[PB send-sms] timeline log failed', e);
      }
      // Auto-advance the rundown cadence (complete open task + schedule follow-up).
      await autoCadenceOnOutboundText(supabase, leadId);
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error('[PB send-sms]', err);
    return NextResponse.json({ error: err.message || 'Failed to send' }, { status: err.status || 500 });
  }
}
