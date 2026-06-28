import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pushLeadToBoard } from '@/lib/monday';

// Push a lead to a partner's Monday board: creates the item in the New Leads
// group with the standard columns, plus an update bubble with property notes
// and the parcel map image.
export async function POST(request) {
  try {
    const { leadId, boardId } = await request.json();
    if (!leadId || !boardId) {
      return NextResponse.json({ error: 'Missing leadId or boardId' }, { status: 400 });
    }
    const supabase = supabaseAdmin();
    const { data: lead, error } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const result = await pushLeadToBoard(boardId, lead);

    // Record this push on the lead so the card shows every partner it's gone to.
    // One entry per board (re-sending the same partner refreshes it).
    const prior = Array.isArray(lead.partner_pushes) ? lead.partner_pushes : [];
    const entry = {
      board_id: String(boardId),
      board_name: result.board,
      item_id: String(result.itemId),
      pushed_at: new Date().toISOString(),
    };
    const partner_pushes = [...prior.filter((p) => String(p.board_id) !== String(boardId)), entry];
    await supabase.from('leads').update({ partner_pushes }).eq('id', leadId).then(() => {}, () => {});

    return NextResponse.json({ ok: true, ...result, partner_pushes });
  } catch (err) {
    console.error('[monday push]', err);
    return NextResponse.json({ error: err.message || 'Push failed' }, { status: 500 });
  }
}
