// Netlify scheduled function: daily archive of the lead backup + Google manual-
// upload files to the PRIVATE `lead-backups` Supabase bucket. This is the standby
// for hand-uploading conversions if the automatic uploader is ever off/broken.
// Writes nothing to the repo or /public. Sends nothing to Google.
export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://parcelreach.ai';
  const secret = process.env.CAMPAIGN_RUN_SECRET || '';
  try {
    const res = await fetch(`${base}/api/google-export?snapshot=1`, {
      method: 'GET',
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
    const json = await res.json().catch(() => ({}));
    console.log('[lead-export-snapshot]', JSON.stringify(json).slice(0, 500));
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('[lead-export-snapshot] failed', e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
  }
};

export const config = { schedule: '30 7 * * *' }; // 07:30 UTC daily (~1:30am US Central)
