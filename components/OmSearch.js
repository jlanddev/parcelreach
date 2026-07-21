'use client';

import { useEffect, useMemo, useState } from 'react';

// OM Search: on-market (and off-market) listing search over the Land Portal v2
// proxy. This is the find half of the loop. Rows show property identity plus a
// "View listing" link; price/agent are entered after push (the API does not
// return listing-agent data). Save-to-pipeline + review queue land in the next
// step once the supporting tables exist.

// The 12 hot-market counties, for one-tap scoping.
const HOT_COUNTIES = [
  { fips: '04005', label: 'Coconino, AZ' },
  { fips: '04015', label: 'Mohave, AZ' },
  { fips: '06071', label: 'San Bernardino, CA' },
  { fips: '06037', label: 'Los Angeles, CA' },
  { fips: '08093', label: 'Park, CO' },
  { fips: '08023', label: 'Costilla, CO' },
  { fips: '37039', label: 'Cherokee, NC' },
  { fips: '55113', label: 'Sawyer, WI' },
  { fips: '53037', label: 'Kittitas, WA' },
  { fips: '53039', label: 'Klickitat, WA' },
  { fips: '47153', label: 'Sequatchie, TN' },
  { fips: '47123', label: 'Monroe, TN' },
];

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

function listingSearchUrl(p) {
  const parts = [p.street_address, p.county, p.state].filter(Boolean).join(' ');
  const q = encodeURIComponent(`${parts} land for sale`.trim());
  return `https://www.google.com/search?q=${q}`;
}

export default function OmSearch() {
  // ---- filter state ----
  const [countyDict, setCountyDict] = useState({});          // fips -> name
  const [countyQuery, setCountyQuery] = useState('');
  const [selected, setSelected] = useState([]);              // [{fips,label}]
  const [status, setStatus] = useState('for_sale');          // for_sale | sold | off_market
  const [daysWindow, setDaysWindow] = useState(90);                  // listed/sold within N days
  const [acresMin, setAcresMin] = useState(30);
  const [acresMax, setAcresMax] = useState(60);
  const [frontageMin, setFrontageMin] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [ppaMin, setPpaMin] = useState('');
  const [ppaMax, setPpaMax] = useState('');

  // ---- run state ----
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('lot_size_acres');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    let live = true;
    fetch('/api/landportal/counties')
      .then((r) => r.json())
      .then((d) => { if (live && d.ok) setCountyDict(Object.fromEntries(d.counties.map((c) => [c.fips, `${c.name}, ${c.state_fips}`]))); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const countyMatches = useMemo(() => {
    const q = countyQuery.trim().toLowerCase();
    if (!q) return [];
    const sel = new Set(selected.map((s) => s.fips));
    return Object.entries(countyDict)
      .filter(([fips, name]) => !sel.has(fips) && (name.toLowerCase().includes(q) || fips.includes(q)))
      .slice(0, 8)
      .map(([fips, name]) => ({ fips, label: name }));
  }, [countyQuery, countyDict, selected]);

  const addCounty = (c) => { setSelected((s) => (s.some((x) => x.fips === c.fips) ? s : [...s, c])); setCountyQuery(''); };
  const removeCounty = (fips) => setSelected((s) => s.filter((x) => x.fips !== fips));

  const buildParams = () => {
    const p = { fips: selected.map((s) => s.fips) };
    if (num(acresMin) !== undefined) p.acres_min = num(acresMin);
    if (num(acresMax) !== undefined) p.acres_max = num(acresMax);
    if (num(frontageMin) !== undefined) p.frontage_min = num(frontageMin);
    if (status) p.status = status;
    if (status === 'for_sale') p.listed_within_days = num(daysWindow) ?? 90;
    if (status === 'sold') p.sold_within_days = num(daysWindow) ?? 365;
    if (num(priceMin) !== undefined) p.price_min = num(priceMin);
    if (num(priceMax) !== undefined) p.price_max = num(priceMax);
    if (num(ppaMin) !== undefined) p.ppa_min = num(ppaMin);
    if (num(ppaMax) !== undefined) p.ppa_max = num(ppaMax);
    return p;
  };

  const runSearch = async () => {
    setError(null);
    if (!selected.length) { setError({ msg: 'Pick at least one county to search.' }); return; }
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/landportal/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildParams()),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError({ code: data.code, msg: data.error || 'Search failed.' });
      } else {
        setResult(data);
      }
    } catch (e) {
      setError({ msg: e.message || 'Search failed.' });
    } finally {
      setRunning(false);
    }
  };

  const rows = useMemo(() => {
    const list = result?.properties ? [...result.properties] : [];
    list.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1; if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [result, sortKey, sortDir]);

  const toggleSort = (k) => { if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(k); setSortDir('desc'); } };

  const quota = result?.meta?.requests_left;
  const isMarket = status === 'for_sale' || status === 'sold';

  return (
    <div className="p-4 space-y-4 text-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">OM Search</h2>
          <p className="text-xs text-slate-400">Find on-market land listings in your hot markets, then push matches into the pipeline.</p>
        </div>
        {quota != null && (
          <span className="text-xs text-slate-400">{quota.toLocaleString()} searches left today</span>
        )}
      </div>

      {/* Filter panel */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 space-y-4">
        {/* Counties */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Counties</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {HOT_COUNTIES.map((c) => {
              const on = selected.some((s) => s.fips === c.fips);
              return (
                <button key={c.fips} type="button" onClick={() => (on ? removeCounty(c.fips) : addCounty(c))}
                  className={`px-2 py-1 rounded-full text-[11px] border ${on ? 'bg-indigo-600/40 border-indigo-500 text-indigo-100' : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500'}`}>
                  {on ? '✓ ' : '+ '}{c.label}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <input value={countyQuery} onChange={(e) => setCountyQuery(e.target.value)} placeholder="Search any county by name or FIPS"
              className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
            {countyMatches.length > 0 && (
              <div className="absolute z-20 mt-1 left-0 right-0 bg-slate-800 border border-slate-600 rounded-md shadow-xl max-h-56 overflow-y-auto">
                {countyMatches.map((c) => (
                  <button key={c.fips} type="button" onClick={() => addCounty(c)} className="flex w-full justify-between px-3 py-1.5 text-sm text-left hover:bg-indigo-600/30">
                    <span>{c.label}</span><span className="text-slate-500">{c.fips}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selected.map((c) => (
                <span key={c.fips} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 text-[11px] border border-indigo-500/40">
                  {c.label}
                  <button type="button" onClick={() => removeCounty(c.fips)} className="text-indigo-300 hover:text-white">&times;</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Status + window */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Market status</label>
            <div className="flex gap-1">
              {[['for_sale', 'For Sale'], ['sold', 'Sold'], ['off_market', 'Off Market']].map(([v, lbl]) => (
                <button key={v} type="button" onClick={() => setStatus(v)}
                  className={`px-3 py-1.5 rounded-md text-sm border ${status === v ? 'bg-indigo-600/40 border-indigo-500 text-indigo-100' : 'bg-slate-800 border-slate-600 text-slate-300'}`}>{lbl}</button>
              ))}
            </div>
          </div>
          {isMarket && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{status === 'sold' ? 'Sold within (days)' : 'Listed within last (days)'}</label>
              <input type="number" value={daysWindow} onChange={(e) => setDaysWindow(e.target.value)} className="w-28 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
            </div>
          )}
        </div>

        {/* Acreage + frontage */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Acreage</label>
            <div className="flex items-center gap-1.5">
              <input type="number" value={acresMin} onChange={(e) => setAcresMin(e.target.value)} placeholder="min" className="w-24 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
              <span className="text-slate-500">to</span>
              <input type="number" value={acresMax} onChange={(e) => setAcresMax(e.target.value)} placeholder="max" className="w-24 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Road frontage (ft, min)</label>
            <input type="number" value={frontageMin} onChange={(e) => setFrontageMin(e.target.value)} placeholder="e.g. 800" className="w-32 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
          </div>
        </div>

        {/* Price / PPA (market only) */}
        {isMarket && (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">List price ($)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="min" className="w-28 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
                <span className="text-slate-500">to</span>
                <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="max" className="w-28 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Price per acre ($)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" value={ppaMin} onChange={(e) => setPpaMin(e.target.value)} placeholder="min" className="w-28 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
                <span className="text-slate-500">to</span>
                <input type="number" value={ppaMax} onChange={(e) => setPpaMax(e.target.value)} placeholder="max" className="w-28 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="button" onClick={runSearch} disabled={running}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold">
            {running ? 'Searching...' : 'Run search'}
          </button>
          <span className="text-xs text-slate-500">Land property type. Price and PPA apply to on-market listings only.</span>
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error.code === 'mls_access_denied' ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-red-500/50 bg-red-500/10 text-red-200'}`}>
          {error.code === 'mls_access_denied'
            ? 'This account does not have MLS data access. On-market search will not return listings until MLS data is enabled on the Land Portal account.'
            : error.msg}
        </div>
      )}

      {/* Suspicious-count guard */}
      {result?.suspicious && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          This on-market search returned {result.count?.toLocaleString()} results, which is unusually high for active land listings. The MLS filter may not have applied. Verify before trusting these rows.
        </div>
      )}

      {/* Results */}
      {result && !result.suspicious && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">{result.count?.toLocaleString()} {isMarket ? 'listings' : 'parcels'}</span>
            {result.properties?.length < result.count && <span className="text-slate-400">showing first {result.properties.length}</span>}
            {result.cached && <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 text-[11px]">cached, no quota used</span>}
            {result.warnings?.includes('overflow') && <span className="text-amber-300 text-xs">Over the result cap. Narrow your filters.</span>}
            <span className="text-slate-500 text-xs">across {selected.length} {selected.length === 1 ? 'county' : 'counties'}</span>
          </div>

          {result.properties?.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-400">
              No {isMarket ? 'listings' : 'parcels'} match. Try widening the acreage band or the {status === 'sold' ? 'sold' : 'listed-within'} window.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    {[['owner_full_name', 'Owner'], ['street_address', 'Address'], ['fips', 'County'], ['lot_size_acres', 'Acres'], ['apn', 'APN']].map(([k, lbl]) => (
                      <th key={k} onClick={() => toggleSort(k)} className="px-3 py-2 text-left font-medium cursor-pointer select-none hover:text-white">
                        {lbl}{sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium">Listing</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.property_id || `${p.fips}-${p.apn}`} className="border-t border-slate-700/60 hover:bg-slate-800/40">
                      <td className="px-3 py-2">{p.owner_full_name || '-'}</td>
                      <td className="px-3 py-2">{p.street_address || '-'}</td>
                      <td className="px-3 py-2 text-slate-400">{countyDict[p.fips] || p.fips}</td>
                      <td className="px-3 py-2">{p.lot_size_acres != null ? Number(p.lot_size_acres).toLocaleString() : '-'}</td>
                      <td className="px-3 py-2 text-slate-400">{p.apn || '-'}</td>
                      <td className="px-3 py-2">
                        <a href={listingSearchUrl(p)} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200 underline">View listing</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-slate-500">Push to pipeline and the review queue arrive in the next step. List price and listing agent are entered on the lead after push, since the Land Portal API does not return them.</p>
        </div>
      )}
    </div>
  );
}
