// Netlify scheduled function: hourly VBB offline-conversion upload. The uploader
// enforces the 30-min review hold, the auto-upload kill switch, the volume-spike
// guard, and the 90-day window, so this just ticks it. When auto-upload is off it
// returns paused without sending.
export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://parcelreach.ai';
  const secret = process.env.CAMPAIGN_RUN_SECRET || '';
  try {
    const res = await fetch(`${base}/api/google-vbb-upload`, {
      method: 'POST',
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
    const json = await res.json().catch(() => ({}));
    console.log('[vbb-upload tick]', JSON.stringify(json));
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('[vbb-upload tick] failed', e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
  }
};

export const config = { schedule: '0 * * * *' }; // top of every hour
