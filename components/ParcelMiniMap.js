'use client';

import { useEffect, useState } from 'react';

// A lightweight parcel mini-map: Mapbox Static Images API (satellite base + the
// parcel boundary as a red GeoJSON overlay), rendered as a single <img>. Using
// the static API instead of live mapbox-gl means a results table can show dozens
// of maps at once with no GL instances.
//
// Boundary source is either passed directly (`geometry`, e.g. from a Land Portal
// hydrate) or looked up for free from Regrid via `lookup={{apn, fips, county}}`
// (works where the Regrid account/trial has coverage; elsewhere shows a
// "no boundary" placeholder).

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

// module-level cache so paging back / re-render never re-fetches a boundary
const geomCache = new Map();

export default function ParcelMiniMap({ geometry: geomProp, lookup, width = 200, height = 130, className = '' }) {
  const [geom, setGeom] = useState(geomProp || null);
  const [state, setState] = useState(geomProp ? 'ready' : (lookup ? 'loading' : 'empty'));

  useEffect(() => {
    if (geomProp) { setGeom(geomProp); setState('ready'); return; }
    if (!lookup || !lookup.apn) { setState('empty'); return; }
    const key = `${lookup.fips || ''}:${lookup.apn}`;
    if (geomCache.has(key)) { const g = geomCache.get(key); setGeom(g); setState(g ? 'ready' : 'none'); return; }
    let live = true;
    setState('loading');
    const qs = new URLSearchParams({ apn: lookup.apn, fips: lookup.fips || '', county: lookup.county || '' });
    fetch(`/api/regrid/geometry?${qs}`).then((r) => r.json()).then((d) => {
      if (!live) return;
      const g = d.ok ? d.geometry : null;
      geomCache.set(key, g);
      setGeom(g); setState(g ? 'ready' : 'none');
    }).catch(() => { if (live) setState('none'); });
    return () => { live = false; };
  }, [geomProp, lookup?.apn, lookup?.fips]);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const boxCls = `rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-500 text-center px-2 ${className}`;

  if (state === 'loading') return <div className={boxCls} style={{ width, height }}>Loading map...</div>;
  if (!geom || !geom.type || !token) return <div className={boxCls} style={{ width, height }}>{state === 'none' ? 'No boundary coverage' : 'No boundary'}</div>;

  const overlay = {
    type: 'Feature',
    properties: { stroke: '#ff3b30', 'stroke-width': 2.5, 'stroke-opacity': 1, 'fill-opacity': 0 },
    geometry: { ...geom, coordinates: roundCoords(geom.coordinates) },
  };
  const enc = encodeURIComponent(JSON.stringify(overlay));
  const base = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static`;
  const url = `${base}/geojson(${enc})/auto/${width}x${height}@2x?access_token=${token}&attribution=false&logo=false`;
  if (url.length > 8000) {
    const fp = firstPoint(geom);
    const center = fp ? `${fp[0]},${fp[1]},13` : '-98,39,3';
    return <img src={`${base}/${center}/${width}x${height}@2x?access_token=${token}&attribution=false&logo=false`} width={width} height={height} className={`rounded-md object-cover ${className}`} alt="parcel area" loading="lazy" />;
  }
  return <img src={url} width={width} height={height} className={`rounded-md object-cover ${className}`} alt="parcel boundary" loading="lazy" />;
}
