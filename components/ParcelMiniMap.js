'use client';

// A lightweight parcel mini-map: Mapbox Static Images API (satellite base + the
// parcel boundary as a red GeoJSON overlay), rendered as a single <img>. Using
// the static API instead of live mapbox-gl means a results table can show dozens
// of maps at once with no GL instances. Boundary comes from the cached property
// detail (geometry MultiPolygon). Falls back to a placeholder when missing.

// Round coordinates so the encoded GeoJSON stays well under Mapbox's URL limit.
function roundCoords(x, dp = 5) {
  if (typeof x === 'number') return Math.round(x * 10 ** dp) / 10 ** dp;
  if (Array.isArray(x)) return x.map((y) => roundCoords(y, dp));
  return x;
}

export default function ParcelMiniMap({ geometry, width = 200, height = 130, className = '' }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const box = `rounded-md bg-slate-800 border border-slate-700 ${className}`;
  if (!geometry || !geometry.type || !token) {
    return <div className={box} style={{ width, height }} title="No boundary" />;
  }
  const overlay = {
    type: 'Feature',
    properties: { stroke: '#ff3b30', 'stroke-width': 2.5, 'stroke-opacity': 1, 'fill-opacity': 0 },
    geometry: { ...geometry, coordinates: roundCoords(geometry.coordinates) },
  };
  const enc = encodeURIComponent(JSON.stringify(overlay));
  // Static API path: /static/geojson(...)/auto/WxH@2x. `auto` frames to the overlay.
  const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/geojson(${enc})/auto/${width}x${height}@2x?access_token=${token}&attribution=false&logo=false`;

  // Mapbox rejects overly long URLs (~8192). If the polygon is too detailed to
  // fit, drop back to a plain satellite frame centered on the boundary's first point.
  if (url.length > 8000) {
    const first = firstPoint(geometry);
    const center = first ? `${first[0]},${first[1]},13` : '-98,39,3';
    const fallback = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${center}/${width}x${height}@2x?access_token=${token}&attribution=false&logo=false`;
    return <img src={fallback} width={width} height={height} className={`rounded-md object-cover ${className}`} alt="parcel area" loading="lazy" />;
  }
  return <img src={url} width={width} height={height} className={`rounded-md object-cover ${className}`} alt="parcel boundary" loading="lazy" />;
}

function firstPoint(geometry) {
  let c = geometry.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) && typeof c[0] === 'number' ? c : null;
}
