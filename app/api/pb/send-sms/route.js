import { NextResponse } from 'next/server';
import { sendMessage } from '@/lib/projectBlue';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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
        /* sms_opt_out column may not exist pre-migration — allow send */
      }
    }

    const result = await sendMessage({ to, message, lineId });

    // Best-effort timeline log — don't fail the send if logging hiccups.
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
        await supabase.from('leads').update({ last_activity_at: new Date().toISOString() }).eq('id', leadId);
      } catch (e) {
        console.error('[PB send-sms] timeline log failed', e);
      }
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error('[PB send-sms]', err);
    return NextResponse.json({ error: err.message || 'Failed to send' }, { status: err.status || 500 });
  }
}
