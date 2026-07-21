'use client';

import { useEffect, useState } from 'react';

// A lightweight parcel mini-map: Mapbox Static Images API (satellite base + the
// parcel boundary as a red GeoJSON overlay), rendered as a single <img>. Using
// the static API instead of live mapbox-gl means a results table can show dozens
// of maps at once with no GL instances. Click a map to expand it (larger view
// with surrounding context).
//
// Boundary source is either passed directly (`geometry`, e.g. from a Land Portal
// hydrate) or looked up for free from Regrid via `lookup={{apn, fips, county}}`.

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

const geomCache = new Map(); // key -> geometry|null, so paging back never re-fetches

function staticUrl(geometry, token, width, height, padding) {
  if (!geometry || !geometry.type || !token) return null;
  const overlay = {
    type: 'Feature',
    properties: { stroke: '#ff3b30', 'stroke-width': 3, 'stroke-opacity': 1, 'fill-opacity': 0.08, fill: '#ff3b30' },
    geometry: { ...geometry, coordinates: roundCoords(geometry.coordinates) },
  };
  const enc = encodeURIComponent(JSON.stringify(overlay));
  const base = 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static';
  const pad = padding ? `&padding=${padding}` : '';
  const url = `${base}/geojson(${enc})/auto/${width}x${height}@2x?access_token=${token}&attribution=false&logo=false${pad}`;
  if (url.length > 8000) {
    const fp = firstPoint(geometry);
    const center = fp ? `${fp[0]},${fp[1]},14` : '-98,39,3';
    return `${base}/${center}/${width}x${height}@2x?access_token=${token}&attribution=false&logo=false`;
  }
  return url;
}

export default function ParcelMiniMap({ geometry: geomProp, lookup, width = 200, height = 130, className = '' }) {
  const [geom, setGeom] = useState(geomProp || null);
  const [state, setState] = useState(geomProp ? 'ready' : (lookup ? 'loading' : 'empty'));
  const [expanded, setExpanded] = useState(false);

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

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const boxCls = `rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-500 text-center px-2 ${className}`;

  if (state === 'loading') return <div className={boxCls} style={{ width, height }}>Loading map...</div>;
  const thumbUrl = staticUrl(geom, token, width, height, 0);
  if (!thumbUrl) return <div className={boxCls} style={{ width, height }}>{state === 'none' ? 'No boundary coverage' : 'No boundary'}</div>;

  const bigUrl = staticUrl(geom, token, 1200, 760, 90);

  return (
    <>
      <button type="button" onClick={() => setExpanded(true)} className="block relative group" title="Click to expand" style={{ width, height }}>
        <img src={thumbUrl} width={width} height={height} className={`rounded-md object-cover ${className}`} alt="parcel boundary" loading="lazy" />
        <span className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">Expand</span>
      </button>

      {expanded && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setExpanded(false)}>
          <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <img src={bigUrl} className="max-w-full max-h-[85vh] rounded-lg shadow-2xl" alt="parcel boundary expanded" />
            <button type="button" onClick={() => setExpanded(false)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700 flex items-center justify-center text-lg leading-none">&times;</button>
          </div>
        </div>
      )}
    </>
  );
}
