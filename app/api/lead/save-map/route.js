import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchParcelGeometry } from '@/lib/regrid';

// POST /api/lead/save-map
// Body: { leadId, apn?, fips?, state?, county?, geometry? }
// Generates a satellite + parcel-boundary map image and saves it to the lead's
// map slot (lead-maps bucket -> map_image_url), flagging map_uploaded=true.
// Replaces the manual screenshot-and-upload flow. Uses the boundary the caller
// already has (geometry) or resolves it from Regrid by APN.

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

export async function POST(request) {
  try {
    const { leadId, apn, fips, state, county, geometry } = await request.json();
    if (!leadId) return NextResponse.json({ ok: false, error: 'Missing leadId' }, { status: 400 });

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return NextResponse.json({ ok: false, error: 'Map token not configured' }, { status: 500 });

    const geo = geometry || await fetchParcelGeometry({ apn, fips, state, county });
    if (!geo || !geo.type) {
      return NextResponse.json({ ok: false, error: 'No parcel boundary available for this parcel (no coverage). Upload a screenshot instead.' }, { status: 404 });
    }

    const imgRes = await fetch(staticMapUrl(geo, token));
    if (!imgRes.ok) return NextResponse.json({ ok: false, error: 'Could not render map image' }, { status: 502 });
    const buf = Buffer.from(await imgRes.arrayBuffer());

    const sb = supabaseAdmin();
    const path = `${leadId}/${Date.now()}.png`;
    const { error: upErr } = await sb.storage.from('lead-maps').upload(path, buf, { contentType: 'image/png', upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = sb.storage.from('lead-maps').getPublicUrl(path);
    const publicUrl = urlData?.publicUrl;

    await sb.from('leads').update({ map_uploaded: true, map_image_url: publicUrl }).eq('id', leadId);
    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error('[lead save-map]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed' }, { status: 500 });
  }
}
