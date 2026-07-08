import { NextResponse } from 'next/server';
import { mondayQuery } from '@/lib/monday';

// One-time helper to wire up a new partner: lists every active Monday board
// with its id and members (id + name), so we can read off the board id and the
// contact's user id to add to the push config. Filter with ?name=plg.
export async function GET(request) {
  try {
    const q = (new URL(request.url).searchParams.get('name') || '').trim().toLowerCase();
    const data = await mondayQuery(
      'query { boards(limit:200, state: active) { id name subscribers { id name email } } }'
    );
    let boards = (data.boards || []).map((b) => ({
      id: String(b.id),
      name: b.name,
      members: (b.subscribers || []).map((s) => ({ id: String(s.id), name: s.name, email: s.email })),
    }));
    if (q) boards = boards.filter((b) => (b.name || '').toLowerCase().includes(q));
    return NextResponse.json({ count: boards.length, boards });
  } catch (err) {
    console.error('[monday discover]', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
