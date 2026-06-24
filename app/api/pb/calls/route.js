import { NextResponse } from 'next/server';
import { getCallLogsForPhone } from '@/lib/projectBlue';

// Recent Project Blue call logs involving a phone number (polled — PB has no
// call webhook and no per-number filter, so we page recent logs and match).
export async function GET(request) {
  const phone = new URL(request.url).searchParams.get('phone');
  if (!phone) return NextResponse.json({ error: 'Missing phone param' }, { status: 400 });
  try {
    const calls = await getCallLogsForPhone(phone);
    return NextResponse.json({ calls });
  } catch (err) {
    console.error('[PB calls]', err);
    return NextResponse.json({ error: err.message || 'Failed to load calls' }, { status: err.status || 500 });
  }
}
