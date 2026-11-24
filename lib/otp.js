// Shared OTP helpers for the ParcelReach phone-verification service.
// One service, per-brand Telnyx Verify profile chosen by the calling site's
// origin. The Telnyx API key lives only in server env (TELNYX_API_KEY) and is
// never exposed to the static sites. Haven's own form uses its own endpoints
// in the haven-ground app and does NOT route through here.

// origin -> brand. Add a line per new property site.
const ORIGIN_BRAND = {
  'https://oakhillreserve.land': 'OHR',
  'https://www.oakhillreserve.land': 'OHR',
  'https://storied-daifuku-d264c3.netlify.app': 'OHR', // OHR preview
  'https://gowestcapital.land': 'GOWEST',
  'https://www.gowestcapital.land': 'GOWEST',
  'https://go-west-capital.netlify.app': 'GOWEST',
  'https://go-west-lands.netlify.app': 'GOWEST',
  'https://gilbertranchtx.com': 'GR',
  'https://www.gilbertranchtx.com': 'GR',
  'https://gilbert-ranch-tx.netlify.app': 'GR', // GR preview
};

export const ALLOWED_OTP_ORIGINS = Object.keys(ORIGIN_BRAND);

// Resolve the Telnyx Verify profile id for a site's origin (brand-correct text).
export function profileForOrigin(origin) {
  const brand = ORIGIN_BRAND[origin];
  if (brand === 'OHR') return process.env.TELNYX_OHR_PROFILE_ID || null;
  if (brand === 'GOWEST') return process.env.TELNYX_GOWEST_PROFILE_ID || null;
  if (brand === 'GR') return process.env.TELNYX_GR_PROFILE_ID || null;
  return null;
}

export function otpCors(origin) {
  const allow = ALLOWED_OTP_ORIGINS.includes(origin) ? origin : ALLOWED_OTP_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// US/CA (+1) only. Returns E.164 or null.
export function usPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) d = '1' + d;
  if (d.length !== 11 || d[0] !== '1') return null;
  return '+' + d;
}

export const TELNYX_BASE = 'https://api.telnyx.com/v2';
