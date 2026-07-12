import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pushLeadToBoard } from '@/lib/monday';

// Push a lead to a partner's Monday board: creates the item in the New Leads
// group with the standard columns, plus an update bubble with property notes
// and the parcel map image.
export async function POST(request) {
  try {
    const { leadId, boardId, summary, coordinates } = await request.json();
    if (!leadId || !boardId) {
      return NextResponse.json({ error: 'Missing leadId or boardId' }, { status: 400 });
    }
    const supabase = supabaseAdmin();
    const { data: lead, error } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    // The summary/coordinates typed on the card take priority over whatever is
    // stored, so a push always sends what the rep sees, even if they didn't Lock.
    if (typeof summary === 'string') lead.partner_summary = summary;
    if (typeof coordinates === 'string') lead.partner_coordinates = coordinates;
    // Best-effort persist so the card stays in sync (ignored if columns missing).
    const persist = {};
    if (typeof summary === 'string') persist.partner_summary = summary;
    if (typeof coordinates === 'string') persist.partner_coordinates = coordinates;
    if (Object.keys(persist).length) await supabase.from('leads').update(persist).eq('id', leadId).then(() => {}, () => {});

    // Pull the lead's notes so the update bubble is a real note summary.
    const { data: notes } = await supabase
      .from('lead_notes')
      .select('content, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true });
    lead.notes = notes || [];

    const result = await pushLeadToBoard(boardId, lead);

    // Record this push. The durable, append-only partner_pushes TABLE is the
    // source of truth (one row per lead+board, upserted on re-push) so the
    // history can never be clobbered by a lead-row update or lost-update race.
    const pushedAt = new Date().toISOString();
    const entry = {
      board_id: String(boardId),
      board_name: result.board,
      item_id: String(result.itemId),
      pushed_at: pushedAt,
      tagged: result.tagged || null,
      map_uploaded: !!result.mapUploaded,
      tag_in_bubble: !!result.tagInBubble,
      notified: result.notified || 0,
      warnings: result.warnings || [],
    };
    let tableOk = false;
    try {
      const { error: upErr } = await supabase
        .from('partner_pushes')
        .upsert({
          lead_id: leadId,
          board_id: String(boardId),
          board_name: result.board,
          item_id: String(result.itemId),
          tagged: result.tagged || null,
          map_uploaded: !!result.mapUploaded,
          tag_in_bubble: !!result.tagInBubble,
          notified: result.notified || 0,
          warnings: result.warnings || [],
          pushed_at: pushedAt,
        }, { onConflict: 'lead_id,board_id' });
      tableOk = !upErr;
    } catch { /* table may not be migrated yet; jsonb mirror below still works */ }

    // Mirror to the lead.partner_pushes jsonb too (belt and suspenders, and so
    // pre-migration installs still track). Read fresh prior to merge.
    const prior = Array.isArray(lead.partner_pushes) ? lead.partner_pushes : [];
    const partner_pushes = [...prior.filter((p) => String(p.board_id) !== String(boardId)), entry];
    await supabase.from('leads').update({ partner_pushes }).eq('id', leadId).then(() => {}, () => {});

    return NextResponse.json({ ok: true, ...result, partner_pushes, durable: tableOk });
  } catch (err) {
    console.error('[monday push]', err);
    return NextResponse.json({ error: err.message || 'Push failed' }, { status: 500 });
  }
}
