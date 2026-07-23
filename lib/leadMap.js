// Generate a satellite + parcel-boundary map image and save it to a lead's map
// slot (lead-maps bucket -> map_image_url, map_uploaded=true). Shared by the
// "Save map from parcel" action and the OM Search push-to-pipeline flow.
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchParcelGeometry } from '@/lib/regrid';
import sharp from 'sharp';

const xmlEsc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Burn a County / State / APN label into the corner of the map PNG.
async function overlayLabel(pngBuffer, { line1, line2 }) {
  try {
    const meta = await sharp(pngBuffer).metadata();
    const w = meta.width || 2000;
    const h = meta.height || 1500;
    const pad = Math.round(w * 0.012);
    const fs1 = Math.round(w * 0.026);
    const fs2 = Math.round(w * 0.021);
    const longest = Math.max((line1 || '').length, (line2 || '').length);
    const boxW = Math.round(longest * fs1 * 0.56) + pad * 2;
    const boxH = pad * 2 + fs1 + (line2 ? fs2 + Math.round(fs1 * 0.35) : 0);
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${pad}" y="${pad}" width="${boxW}" height="${boxH}" rx="${Math.round(pad * 0.6)}" fill="black" fill-opacity="0.58"/>
      <text x="${pad + Math.round(pad * 0.8)}" y="${pad + Math.round(pad * 0.8) + fs1}" font-family="Arial, Helvetica, sans-serif" font-size="${fs1}" font-weight="700" fill="#ffffff">${xmlEsc(line1)}</text>
      ${line2 ? `<text x="${pad + Math.round(pad * 0.8)}" y="${pad + Math.round(pad * 0.8) + fs1 + Math.round(fs1 * 0.35) + fs2}" font-family="Arial, Helvetica, sans-serif" font-size="${fs2}" fill="#dbe4ee">${xmlEsc(line2)}</text>` : ''}
    </svg>`;
    return await sharp(pngBuffer).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  } catch {
    return pngBuffer; // fall back to the plain map if compositing fails
  }
}

function roundCoords(x, dp = 5) {
  if (typeof x === 'number') return Math.round(x * 10 ** dp) / 10 ** dp;
  if (Array.isArray(x)) return x.map((y) => roundCoords(y, dp));
  return x;
}
function firstPoint(geometry) {
  let c = geometry.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) && typeof c[0] === 'number' ? c : null;
}
function staticMapUrl(geometry, token) {
  const overlay = {
    type: 'Feature',
    properties: { stroke: '#ff3b30', 'stroke-width': 3, 'stroke-opacity': 1, 'fill-opacity': 0.08, fill: '#ff3b30' },
    geometry: { ...geometry, coordinates: roundCoords(geometry.coordinates) },
  };
  const enc = encodeURIComponent(JSON.stringify(overlay));
  const base = 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static';
  const url = `${base}/geojson(${enc})/auto/1000x750@2x?access_token=${token}&attribution=false&logo=false&padding=80`;
  if (url.length > 8000) {
    const fp = firstPoint(geometry);
    const center = fp ? `${fp[0]},${fp[1]},14` : '-98,39,3';
    return `${base}/${center}/1000x750@2x?access_token=${token}&attribution=false&logo=false`;
  }
  return url;
}

/**
 * Generate + store the parcel map for a lead. Returns { url } on success, or
 * { url: null, reason } when there is no boundary coverage (caller degrades).
 * Pass `geometry` if you already have it (LP hydrate); else it is resolved from
 * Regrid by APN.
 */
export async function generateAndSaveLeadMap({ leadId, geometry, apn, fips, state, county }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return { url: null, reason: 'Map token not configured' };
  const geo = geometry || await fetchParcelGeometry({ apn, fips, state, county });
  if (!geo || !geo.type) return { url: null, reason: 'no_boundary_coverage' };

  const imgRes = await fetch(staticMapUrl(geo, token));
  if (!imgRes.ok) return { url: null, reason: 'render_failed' };
  let buf = Buffer.from(await imgRes.arrayBuffer());

  // Stamp County, State + APN into the corner so the saved map is self-identifying.
  const line1 = [county, state].filter(Boolean).join(', ');
  const line2 = apn ? `APN ${apn}` : '';
  if (line1 || line2) buf = await overlayLabel(buf, { line1, line2 });

  const sb = supabaseAdmin();
  const path = `${leadId}/${Date.now()}.png`;
  const { error: upErr } = await sb.storage.from('lead-maps').upload(path, buf, { contentType: 'image/png', upsert: true });
  if (upErr) return { url: null, reason: upErr.message };
  const { data: urlData } = sb.storage.from('lead-maps').getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;
  await sb.from('leads').update({ map_uploaded: true, map_image_url: publicUrl }).eq('id', leadId);
  return { url: publicUrl };
}
