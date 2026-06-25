import { NextResponse } from 'next/server';
import twilio from 'twilio';

// Mint a Twilio Voice access token for the browser SDK. Identity = the CRM
// user id so calls can be attributed. Caller ID + dial logic live in Project
// Blue's TwiML app (outgoingApplicationSid).
export async function GET(request) {
  try {
    const identity = new URL(request.url).searchParams.get('identity') || 'agent';
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY_SID,
      process.env.TWILIO_API_KEY_SECRET,
      { identity, ttl: 3600 },
    );
    token.addGrant(
      new VoiceGrant({
        outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
        incomingAllow: false,
      }),
    );

    return NextResponse.json({ token: token.toJwt(), identity });
  } catch (err) {
    console.error('[twilio token]', err);
    return NextResponse.json({ error: err.message || 'Token error' }, { status: 500 });
  }
}
