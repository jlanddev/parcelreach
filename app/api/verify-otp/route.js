import { NextResponse } from 'next/server';
import { ALLOWED_OTP_ORIGINS, profileForOrigin, otpCors, usPhone, TELNYX_BASE } from '@/lib/otp';

// POST /api/verify-otp  { phone, code }
// Checks the code with Telnyx Verify using the brand profile for the origin.
// Returns { success, verified }. The site should only submit the lead when
// verified === true.

export async function OPTIONS(req) {
  return new NextResponse(null, { status: 204, headers: otpCors(req.headers.get('origin')) });
}

export async function POST(req) {
  const origin = req.headers.get('origin');
  const headers = otpCors(origin);
  if (!ALLOWED_OTP_ORIGINS.includes(origin)) {
    return NextResponse.json({ success: false, verified: false, error: 'Origin not allowed' }, { status: 403, headers });
  }
  const profileId = profileForOrigin(origin);
  if (!profileId || !process.env.TELNYX_API_KEY) {
    return NextResponse.json({ success: false, verified: false, error: 'Verification not configured' }, { status: 500, headers });
  }

  let body; try { body = await req.json(); } catch { body = {}; }
  const phone = usPhone(body.phone);
  const code = String(body.code || '').replace(/\D/g, '');
  if (!phone || !code) {
    return NextResponse.json({ success: false, verified: false, error: 'Enter the code we texted you.' }, { status: 400, headers });
  }

  try {
    const r = await fetch(`${TELNYX_BASE}/verifications/by_phone_number/${encodeURIComponent(phone)}/actions/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, verify_profile_id: profileId }),
    });
    const data = await r.json().catch(() => ({}));
    if (data?.data?.response_code === 'accepted') {
      return NextResponse.json({ success: true, verified: true }, { headers });
    }
    return NextResponse.json({ success: false, verified: false, error: 'That code is not valid. Check it and try again.' }, { status: 400, headers });
  } catch (e) {
    return NextResponse.json({ success: false, verified: false, error: 'Could not verify. Try again.' }, { status: 502, headers });
  }
}
