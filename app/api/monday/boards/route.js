import { NextResponse } from 'next/server';
import { listPartnerBoards } from '@/lib/monday';

// Partner boards to offer as push targets in the card dropdown.
export async function GET() {
  try {
    const boards = await listPartnerBoards();
    return NextResponse.json({ boards });
  } catch (err) {
    console.error('[monday boards]', err);
    return NextResponse.json({ error: err.message || 'Failed to load boards' }, { status: 500 });
  }
}
