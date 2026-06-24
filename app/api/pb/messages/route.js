import { NextResponse } from 'next/server';
import { getMessagesForPhone } from '@/lib/projectBlue';

// Full message thread with a phone number (inbound + outbound, chronological).
export async function GET(request) {
  const phone = new URL(request.url).searchParams.get('phone');
  if (!phone) return NextResponse.json({ error: 'Missing phone param' }, { status: 400 });
  try {
    const messages = await getMessagesForPhone(phone);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error('[PB messages]', err);
    return NextResponse.json({ error: err.message || 'Failed to load messages' }, { status: err.status || 500 });
  }
}
