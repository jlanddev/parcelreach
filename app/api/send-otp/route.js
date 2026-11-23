import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ALLOWED_OTP_ORIGINS, profileForOrigin, otpCors, usPhone, TELNYX_BASE } from '@/lib/otp';

// POST /api/send-otp  { phone }
// Texts a verification code via Telnyx Verify, using the brand profile that
// matches the calling site's origin (so the SMS says "Oak Hill Reserve" /
// "Go West Land", never Haven Ground). Telnyx manages code, expiry and attempts.
// Abuse limits: US (+1) only, 30s resend, 3 codes/phone/hr, 10/IP/hr.

export async function OPTIONS(req) {
  return new NextResponse(null, { status: 204, headers: otpCors(req.headers.get('origin')) });
}

export async function POST(req) {
  const origin = req.headers.get('origin');
  const headers = otpCors(origin);
  if (!ALLOWED_OTP_ORIGINS.includes(origin)) {
    return NextResponse.json({ success: false, error: 'Origin not allowed' }, { status: 403, headers });
  }
  const profileId = profileForOrigin(origin);
  if (!profileId || !process.env.TELNYX_API_KEY) {
    return NextResponse.json({ success: false, error: 'Verification not configured' }, { status: 500, headers });
  }

  let body; try { body = await req.json(); } catch { body = {}; }
  const phone = usPhone(body.phone);
  if (!phone) {
    return NextResponse.json({ success: false, error: 'Enter a valid US phone number.' }, { status: 400, headers });
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

  // Rate limiting (best-effort; a limiter error must not block a real user).
  try {
    const sb = supabaseAdmin();
    const hourAgo = new Date(Date.now() - 3600e3).toISOString();
    const halfMin = new Date(Date.now() - 30e3).toISOString();
    const { data: recent } = await sb.from('otp_sends').select('created_at').eq('phone', phone).gte('created_at', hourAgo);
    const sends = recent || [];
    if (sends.some((r) => r.created_at > halfMin)) {
      return NextResponse.json({ success: false, error: 'Please wait 30 seconds before requesting another code.' }, { status: 429, headers });
    }
    if (sends.length >= 3) {
      return NextResponse.json({ success: false, error: 'Too many codes requested for this number. Try again later.' }, { status: 429, headers });
    }
    if (ip) {
      const { count } = await sb.from('otp_sends').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', hourAgo);
      if ((count || 0) >= 10) {
        return NextResponse.json({ success: false, error: 'Too many requests. Try again later.' }, { status: 429, headers });
      }
    }
  } catch { /* fail open */ }

  // Send the code via Telnyx Verify (key stays server-side).
  let data = {};
  try {
    const r = await fetch(`${TELNYX_BASE}/verifications/sms`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phone, verify_profile_id: profileId }),
    });
    data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return NextResponse.json({ success: false, error: data?.errors?.[0]?.detail || 'Could not send code.' }, { status: 400, headers });
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Could not send code. Try again.' }, { status: 502, headers });
  }

  try { await supabaseAdmin().from('otp_sends').insert([{ phone, ip }]); } catch { /* non-fatal */ }
  return NextResponse.json({ success: true }, { headers });
}
