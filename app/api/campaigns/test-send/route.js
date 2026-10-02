import { NextResponse } from 'next/server';
import { sendMessage } from '@/lib/projectBlue';

// POST /api/campaigns/test-send  { phone, message }
// Fires ONE real text immediately via Project Blue so you can verify sending
// works end-to-end (text your own phone). Bypasses the campaign queue/gate on
// purpose; it's a manual one-off, not automated.
export async function POST(request) {
  try {
    const { phone, message } = await request.json();
    if (!phone || !message) return NextResponse.json({ ok: false, error: 'phone and message required' }, { status: 400 });
    await sendMessage({ to: phone, message });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[campaign test-send]', e?.message);
    return NextResponse.json({ ok: false, error: e?.message || 'send failed' }, { status: 500 });
  }
}
