// Generate a satellite + parcel-boundary map image and save it to a lead's map
// slot (lead-maps bucket -> map_image_url, map_uploaded=true). Shared by the
// "Save map from parcel" action and the OM Search push-to-pipeline flow.
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchParcelGeometry } from '@/lib/regrid';
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LABEL_FONT_B64 } from '@/lib/labelFont';

const xmlEsc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The serverless runtime has no system fonts, so we bundle one (base64) and hand
// sharp the file directly via `fontfile`. Written to /tmp once per warm instance.
let fontPath = null;
function ensureFont() {
  if (fontPath) return fontPath;
  try {
    const p = path.join(os.tmpdir(), 'pr-label-font.ttf');
    if (!fs.existsSync(p)) fs.writeFileSync(p, Buffer.from(LABEL_FONT_B64, 'base64'));
    fontPath = p;
    return p;
  } catch { return null; }
}

// Burn a County / State / APN label into the corner of the map PNG.
async function overlayLabel(pngBuffer, { line1, line2 }) {
  try {
    const fp = ensureFont();
    if (!fp) return pngBuffer;
    const meta = await sharp(pngBuffer).metadata();
    const W = meta.width || 2000;
    const dpi = Math.max(150, Math.round(W * 0.19)); // scale text to the image
    const markup = `<span foreground="white" weight="bold">${xmlEsc(line1)}</span>`
      + (line2 ? `\n<span foreground="#dbe4ee">${xmlEsc(line2)}</span>` : '');
    const txt = await sharp({ text: { text: markup, fontfile: fp, font: 'Roboto', rgba: true, dpi, align: 'left' } }).png().toBuffer();
    const t = await sharp(txt).metadata();
    const pad = Math.round(W * 0.011);
    const boxW = t.width + pad * 2;
    const boxH = t.height + pad * 2;
    const box = await sharp(Buffer.from(`<svg width="${boxW}" height="${boxH}"><rect width="${boxW}" height="${boxH}" rx="${Math.round(pad * 0.6)}" fill="black" fill-opacity="0.58"/></svg>`)).png().toBuffer();
    return await sharp(pngBuffer).composite([
      { input: box, top: pad, left: pad },
      { input: txt, top: pad * 2, left: pad * 2 },
    ]).png().toBuffer();
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
