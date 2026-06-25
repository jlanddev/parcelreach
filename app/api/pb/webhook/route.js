import { NextResponse } from 'next/server';
import { supabaseAdmin, findLeadByPhone } from '@/lib/supabaseAdmin';
import { last10 } from '@/lib/projectBlue';
import { autoCadenceOnOutboundText } from '@/lib/cadence';

/**
 * Project Blue inbound message webhook.
 * Configure at: Project Blue → Settings → Webhooks
 *   https://parcelreach.ai/api/pb/webhook?secret=<PROJECT_BLUE_WEBHOOK_SECRET>
 *
 * Payload: { message, destination, direction, messageId, guid, linePhoneNumber, receivedAt }
 * `destination` = contact (lead) number; `linePhoneNumber` = our PB line.
 * Always responds 200 so Project Blue doesn't retry-storm.
 */
const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'OPT-OUT'];
const START_WORDS = ['START', 'UNSTOP'];

export async function POST(request) {
  try {
    const secret = process.env.PROJECT_BLUE_WEBHOOK_SECRET;
    if (secret) {
      const provided = new URL(request.url).searchParams.get('secret');
      if (provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { message, destination, direction, guid, linePhoneNumber, receivedAt } = body;
    const contactPhone = destination;
    if (!message || !contactPhone) return NextResponse.json({ ok: true });

    const supabase = supabaseAdmin();
    const inbound = direction !== 'outbound';

    // Idempotency: skip if we've already stored this Project Blue message.
    if (guid) {
      const { data: existing } = await supabase
        .from('activities')
        .select('id')
        .eq('pb_guid', guid)
        .maybeSingle();
      if (existing) return NextResponse.json({ ok: true, deduped: true });
    }

    const lead = await findLeadByPhone(supabase, contactPhone);
    if (!lead) {
      console.log('[PB webhook] no lead match for', contactPhone);
      return NextResponse.json({ ok: true, matched: false });
    }

    // Outbound we send via /api/pb/send-sms is already logged at send time. Try
    // to claim that row with the guid (dedupe); only insert if it was sent from
    // the Project Blue app directly (no matching local row).
    if (!inbound) {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      try {
        const { data: recent } = await supabase
          .from('activities')
          .select('id')
          .eq('lead_id', lead.id)
          .eq('direction', 'OUTBOUND')
          .is('pb_guid', null)
          .eq('message_content', message)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recent) {
          await supabase.from('activities').update({ pb_guid: guid || null }).eq('id', recent.id);
          return NextResponse.json({ ok: true, claimed: true });
        }
      } catch {
        /* column may not exist pre-migration — fall through to insert */
      }
    }

    const base = {
      lead_id: lead.id,
      user_id: null,
      activity_type: 'TEXT',
      direction: inbound ? 'INBOUND' : 'OUTBOUND',
      outcome: inbound ? 'RECEIVED' : 'SENT',
      message_content: message,
      created_at: receivedAt || new Date().toISOString(),
    };
    const full = {
      ...base,
      pb_guid: guid || null,
      pb_line_id: last10(linePhoneNumber) || null,
      read_at: inbound ? null : new Date().toISOString(),
    };
    // Insert with the new columns; fall back if the migration isn't applied yet.
    const { error } = await supabase.from('activities').insert(full);
    if (error) await supabase.from('activities').insert(base);

    await supabase.from('leads').update({ last_activity_at: new Date().toISOString() }).eq('id', lead.id);

    if (inbound) {
      const text = String(message).trim().toUpperCase();
      if (STOP_WORDS.includes(text)) {
        await supabase.from('leads').update({ sms_opt_out: true }).eq('id', lead.id).then(() => {}, () => {});
      } else if (START_WORDS.includes(text)) {
        await supabase.from('leads').update({ sms_opt_out: false }).eq('id', lead.id).then(() => {}, () => {});
      }
      // First inbound reply nudges a NEW lead to CONTACTED.
      if (lead.pipeline_status === 'NEW' || lead.status === 'new') {
        await supabase.from('leads').update({ status: 'contacted' }).eq('id', lead.id);
      }

      // Notify the lead's owner (or the acquisition manager) so the bell lights
      // up on an inbound text.
      try {
        let notifyUserId = lead.current_owner_id;
        if (!notifyUserId) {
          const { data: am } = await supabase.from('users').select('id').eq('role', 'acquisition_manager').limit(1).maybeSingle();
          notifyUserId = am?.id || null;
        }
        if (notifyUserId) {
          const leadName = lead.full_name || lead.name || 'a lead';
          // `view=sms` tells the click handler to open the conversation. The
          // notifications.type CHECK only allows mention/lead_assigned/team_invite,
          // so try sms_inbound then fall back to mention.
          const notif = {
            user_id: notifyUserId,
            from_user_id: null,
            title: `New text from ${leadName}`,
            message: String(message).slice(0, 200),
            link: `/admin/land?lead=${lead.id}&view=sms`,
          };
          const { error: nerr } = await supabase.from('notifications').insert({ ...notif, type: 'sms_inbound' });
          if (nerr) await supabase.from('notifications').insert({ ...notif, type: 'mention' });
        }
      } catch (e) {
        console.error('[PB webhook] notify failed', e);
      }
    } else {
      // App-direct outbound text (not sent through our app, so send-sms didn't
      // run): advance the rundown cadence here.
      await autoCadenceOnOutboundText(supabase, lead.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PB webhook]', err);
    return NextResponse.json({ ok: true }); // never 500 a webhook
  }
}
