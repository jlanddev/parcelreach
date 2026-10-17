import { NextResponse } from 'next/server';

// Step 1 of the one-time Google OAuth for offline-conversion uploads. Open this in a
// browser (with the run secret) and it bounces you to Google's consent screen:
//   https://parcelreach.ai/api/google-oauth/start?secret=YOUR_SECRET
// After you approve, Google redirects to /api/google-oauth/callback, which prints the
// refresh token to paste into GOOGLE_DM_REFRESH_TOKEN.
//
// Needs env: GOOGLE_OAUTH_CLIENT_ID (+ the matching secret used in the callback).
// Scope defaults to the Google Ads scope used for offline conversion uploads; override
// with GOOGLE_OAUTH_SCOPE if the Data Manager API wants a different one.

export const dynamic = 'force-dynamic';

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://parcelreach.ai'}/api/google-oauth/callback`;
const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/adwords';

export async function GET(req) {
  const u = new URL(req.url);
  const secret = process.env.CAMPAIGN_RUN_SECRET;
  if (secret && u.searchParams.get('secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'GOOGLE_OAUTH_CLIENT_ID not set' }, { status: 500 });

  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('redirect_uri', REDIRECT_URI);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', process.env.GOOGLE_OAUTH_SCOPE || DEFAULT_SCOPE);
  auth.searchParams.set('access_type', 'offline');   // ask for a refresh token
  auth.searchParams.set('prompt', 'consent');        // force a fresh refresh token every time
  auth.searchParams.set('include_granted_scopes', 'true');
  auth.searchParams.set('state', secret || 'ok');    // echoed back; the callback checks it
  return NextResponse.redirect(auth.toString());
}
