// Netlify scheduled function: ticks the campaign sender every 30 minutes.
// The sender itself enforces quiet hours and the CAMPAIGNS_LIVE gate, so while
// CAMPAIGNS_LIVE is unset this fires but sends nothing (dry-run).
export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://parcelreach.ai';
  const secret = process.env.CAMPAIGN_RUN_SECRET || '';
  try {
    const res = await fetch(`${base}/api/campaigns/run`, {
      method: 'POST',
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
    const json = await res.json().catch(() => ({}));
    console.log('[campaigns-run tick]', JSON.stringify(json));
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('[campaigns-run tick] failed', e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
  }
};

export const config = { schedule: '*/30 * * * *' };
