import { NextResponse } from 'next/server';

// Step 2 of the one-time Google OAuth. Google redirects here with ?code=...; we trade
// it for tokens and show the REFRESH TOKEN so you can paste it into the
// GOOGLE_DM_REFRESH_TOKEN env var in Netlify. The refresh token is long-lived; the
// access token is not and is re-minted from it on every upload run.
//
// Needs env: GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET. The redirect URI
// must EXACTLY match the one registered on the OAuth client:
//   https://parcelreach.ai/api/google-oauth/callback

export const dynamic = 'force-dynamic';

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://parcelreach.ai'}/api/google-oauth/callback`;

const page = (title, body) =>
  new NextResponse(`<!doctype html><meta charset=utf-8><title>${title}</title><body style="font:15px system-ui;max-width:720px;margin:48px auto;padding:0 20px;color:#111">${body}</body>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

export async function GET(req) {
  const u = new URL(req.url);
  const secret = process.env.CAMPAIGN_RUN_SECRET;
  if (secret && u.searchParams.get('state') !== secret) {
    return page('Unauthorized', '<h2>Unauthorized</h2><p>State did not match. Start again from /api/google-oauth/start?secret=…</p>');
  }
  const err = u.searchParams.get('error');
  if (err) return page('OAuth error', `<h2>Google returned an error</h2><pre>${err}</pre>`);
  const code = u.searchParams.get('code');
  if (!code) return page('Missing code', '<h2>No authorization code</h2><p>Start again from /api/google-oauth/start?secret=…</p>');

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return page('Not configured', '<h2>Missing client credentials</h2><p>Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.</p>');

  let data;
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
    });
    data = await resp.json();
    if (!resp.ok) return page('Token exchange failed', `<h2>Token exchange failed</h2><pre>${JSON.stringify(data, null, 2)}</pre>`);
  } catch (e) {
    return page('Token exchange error', `<h2>Token exchange error</h2><pre>${String(e)}</pre>`);
  }

  if (!data.refresh_token) {
    return page('No refresh token', `<h2>No refresh token returned</h2>
      <p>Google only returns one when it re-prompts for consent. Revoke the app's access at
      <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>
      and run <code>/api/google-oauth/start</code> again.</p>
      <pre>${JSON.stringify({ ...data, access_token: '…' }, null, 2)}</pre>`);
  }

  return page('Refresh token',
    `<h2>✅ Connected</h2>
     <p>Copy this into Netlify as <b>GOOGLE_DM_REFRESH_TOKEN</b>, then redeploy:</p>
     <pre style="white-space:pre-wrap;word-break:break-all;background:#f4f4f5;padding:14px;border-radius:8px">${data.refresh_token}</pre>
     <p style="color:#555">Scopes granted: <code>${data.scope || '(none reported)'}</code>. You can close this tab.</p>`);
}
