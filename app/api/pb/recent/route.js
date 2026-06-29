import { NextResponse } from 'next/server';
import { getRecentMessages } from '@/lib/projectBlue';

// Recent messages across all contacts, powers the lead cards' Last Contacted
// header, on-card snippet, and unread badge in one request.
export async function GET(request) {
  const limit = Number(new URL(request.url).searchParams.get('limit')) || 100;
  try {
    const messages = await getRecentMessages({ limit });
    return NextResponse.json({ messages });
  } catch (err) {
    console.error('[PB recent]', err);
    return NextResponse.json({ error: err.message || 'Failed to load recent' }, { status: err.status || 500 });
  }
}
