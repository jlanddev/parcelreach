// Netlify scheduled function: ticks the campaign scheduler so due drip texts
// actually send. Runs every 30 minutes. It just calls the app's runner route
// (which has Project Blue + Supabase wired up).
export const config = { schedule: '*/30 * * * *' };

export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://parcelreach.ai';
  const secret = process.env.CAMPAIGN_RUN_SECRET || '';
  try {
    const res = await fetch(`${base}/api/campaigns/run`, {
      method: 'POST',
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
    const data = await res.json().catch(() => ({}));
    console.log('[campaign-runner]', JSON.stringify(data));
    return new Response(JSON.stringify(data), { status: 200 });
  } catch (e) {
    console.error('[campaign-runner] failed', e?.message);
    return new Response('error', { status: 500 });
  }
};
