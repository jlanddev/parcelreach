import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { to, message, from } = await request.json();

    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message' }, { status: 400 });
    }

    // Default to primary Quo number if not specified
    const fromNumber = from || '+17068131205';

    const res = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': process.env.QUO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: message,
        from: fromNumber,
        to: [to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`]
      })
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data.message || 'Failed to send' }, { status: res.status });
    }

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error('[Quo SMS Error]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
