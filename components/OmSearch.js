'use client';

import { useEffect, useMemo, useState } from 'react';
import ParcelMiniMap from '@/components/ParcelMiniMap';
import { US_STATES, abbrByFips, stateByFips } from '@/lib/usStates';

// OM Search: on-market land search over the Land Portal v2 proxy.
// - Search is FREE (filter pool). Results show property identity + a View-listing link.
// - "Run detailed" hydrates the visible set: quote the cost first, then fetch the
//   parcel boundary (mini-map) + Land Portal valuation per row, and receipt the spend.
//   Geometry/detail is metered (~7c once the small daily pool is spent) and cached
//   permanently by property_id, so each parcel costs at most one fetch ever.

// The hot markets. California (San Bernardino, Los Angeles) is deliberately
// excluded from the "1 yr STR" preset: CA's Subdivision Map Act makes the split
// model impractical. They can still be added manually via the picker.
const HOT_COUNTIES = [
  { fips: '04005', label: 'Coconino, AZ' },
  { fips: '04015', label: 'Mohave, AZ' },
  { fips: '08093', label: 'Park, CO' },
  { fips: '08023', label: 'Costilla, CO' },
  { fips: '37039', label: 'Cherokee, NC' },
  { fips: '55113', label: 'Sawyer, WI' },
  { fips: '53037', label: 'Kittitas, WA' },
  { fips: '53039', label: 'Klickitat, WA' },
  { fips: '47153', label: 'Sequatchie, TN' },
  { fips: '47123', label: 'Monroe, TN' },
];

// Saved-search presets. "1 yr STR" is the default on tab open, and is what the
// NL bar's "hot markets" resolves to.
const PRESETS = [{ id: '1yr-str', label: '1 yr STR', counties: HOT_COUNTIES }];

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));
const money = (c) => `$${(c / 100).toFixed(2)}`;
const usd = (n) => (n == null ? null : `$${Math.round(Number(n)).toLocaleString()}`);

function listingSearchUrl(p) {
  const parts = [p.street_address, p.county, p.state].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(`${parts} land for sale`.trim())}`;
}

// assessed vs calc acreage sanity (early proxy for the MLS-vs-calc rule; real rule
// needs MLS acres which the API does not return yet).
function acreageFlag(d) {
  const a = Number(d.lot_size_acres), c = Number(d.calc_acres);
  if (!a || !c) return null;
  const diff = Math.abs(a - c) / Math.max(a, c);
  return diff > 0.15 ? { assessed: a, calc: c, pct: Math.round(diff * 100) } : null;
}

export default function OmSearch() {
  const [countyDict, setCountyDict] = useState({});      // fips -> "Name, AB"
  const [countyList, setCountyList] = useState([]);      // [{fips,name,stateFips,abbr,label}]
  const [activeState, setActiveState] = useState('');    // state FIPS prefix chosen in the cascade
  const [countyQuery, setCountyQuery] = useState('');
  const [selected, setSelected] = useState(PRESETS[0].counties); // default: 1 yr STR preset
  const [mode, setMode] = useState('listings');          // 'listings' | 'deals'
  const [soldDays, setSoldDays] = useState(730);          // deal finder: sold comps window
  const [ratio, setRatio] = useState(0.5);               // deal finder: buy at this fraction of sold PPA
  const [status, setStatus] = useState('for_sale');
  const [daysWindow, setDaysWindow] = useState('');
  const [vacantOnly, setVacantOnly] = useState(true);           // default ON: land, no structures
  const [acresMin, setAcresMin] = useState(30);
  const [acresMax, setAcresMax] = useState(60);
  const [frontageMin, setFrontageMin] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [ppaMin, setPpaMin] = useState('');
  const [ppaMax, setPpaMax] = useState('');

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('lot_size_acres');
  const [sortDir, setSortDir] = useState('desc');

  // hydration (detailed) state
  const [details, setDetails] = useState({});                   // property_id -> detail
  const [quote, setQuote] = useState(null);                     // pending cost quote
  const [quoting, setQuoting] = useState(false);
  const [runningDetailed, setRunningDetailed] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [cap, setCap] = useState(50);
  const [daily, setDaily] = useState(null);                     // { spentCents, poolLeft }

  const enrich = (counties) => counties.map((c) => { const abbr = abbrByFips[c.state_fips] || c.state_fips; return { fips: c.fips, name: c.name, stateFips: c.state_fips, abbr, label: `${c.name}, ${abbr}` }; });

  useEffect(() => {
    let live = true;
    const loadCounties = (attempt = 0) => {
      fetch('/api/landportal/counties').then((r) => r.json())
        .then((d) => {
          if (!live) return;
          if (!d.ok || !Array.isArray(d.counties) || !d.counties.length) throw new Error('empty');
          const list = enrich(d.counties);
          setCountyList(list);
          setCountyDict(Object.fromEntries(list.map((c) => [c.fips, c.label])));
        })
        .catch(() => { if (live && attempt < 3) setTimeout(() => loadCounties(attempt + 1), 700 * (attempt + 1)); });
    };
    loadCounties();
    // seed the daily spend/pool indicator (empty quote spends nothing)
    fetch('/api/landportal/hydrate/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [] }) })
      .then((r) => r.json()).then((d) => { if (live && d.ok) setDaily({ spentCents: d.quote.dailyTokensSpentCents, poolLeft: d.quote.poolRemaining, ceilingCents: d.quote.dailyTokenCeilingCents }); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // States for the State select. Falls back to ALL states if the county
  // dictionary has not loaded yet, so the dropdown is never empty.
  const presentStates = useMemo(() => {
    if (!countyList.length) return US_STATES;
    const present = new Set(countyList.map((c) => c.stateFips));
    const filtered = US_STATES.filter((s) => present.has(s.fips));
    return filtered.length ? filtered : US_STATES;
  }, [countyList]);

  // Load a state's counties on demand if the full dictionary is not available
  // (belt-and-suspenders so picking a state always yields counties).
  useEffect(() => {
    if (!activeState || countyList.some((c) => c.stateFips === activeState)) return;
    let live = true;
    fetch(`/api/landportal/counties?state=${activeState}`).then((r) => r.json())
      .then((d) => {
        if (!live || !d.ok || !d.counties?.length) return;
        const add = enrich(d.counties);
        setCountyList((prev) => { const have = new Set(prev.map((x) => x.fips)); return [...prev, ...add.filter((x) => !have.has(x.fips))]; });
        setCountyDict((prev) => ({ ...prev, ...Object.fromEntries(add.map((c) => [c.fips, c.label])) }));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [activeState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Counties in the chosen state, filtered by the county search box.
  const countiesInState = useMemo(() => {
    if (!activeState) return [];
    const q = countyQuery.trim().toLowerCase();
    return countyList
      .filter((c) => c.stateFips === activeState && (!q || c.name.toLowerCase().includes(q) || c.fips.includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countyList, activeState, countyQuery]);

  const selSet = useMemo(() => new Set(selected.map((s) => s.fips)), [selected]);
  const addCounty = (c) => setSelected((s) => (s.some((x) => x.fips === c.fips) ? s : [...s, { fips: c.fips, label: c.label }]));
  const removeCounty = (fips) => setSelected((s) => s.filter((x) => x.fips !== fips));
  const addAllInState = () => setSelected((s) => { const have = new Set(s.map((x) => x.fips)); return [...s, ...countiesInState.filter((c) => !have.has(c.fips)).map((c) => ({ fips: c.fips, label: c.label }))]; });
  const loadPreset = (preset) => setSelected(preset.counties);

  const buildParams = () => {
    const p = { fips: selected.map((s) => s.fips) };
    if (num(acresMin) !== undefined) p.acres_min = num(acresMin);
    if (num(acresMax) !== undefined) p.acres_max = num(acresMax);
    if (num(frontageMin) !== undefined) p.frontage_min = num(frontageMin);
    if (vacantOnly) p.vacant = true;
    if (status) p.status = status;
    if (status === 'for_sale' && num(daysWindow) !== undefined) p.listed_within_days = num(daysWindow);
    if (status === 'sold' && num(daysWindow) !== undefined) p.sold_within_days = num(daysWindow);
    if (num(priceMin) !== undefined) p.price_min = num(priceMin);
    if (num(priceMax) !== undefined) p.price_max = num(priceMax);
    if (num(ppaMin) !== undefined) p.ppa_min = num(ppaMin);
    if (num(ppaMax) !== undefined) p.ppa_max = num(ppaMax);
    return p;
  };

  const runSearch = async () => {
    setError(null); setQuote(null); setReceipt(null);
    if (!selected.length) { setError({ msg: 'Pick at least one county to search.' }); return; }
    setRunning(true); setResult(null);
    try {
      const res = await fetch('/api/landportal/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildParams()) });
      const data = await res.json();
      if (!res.ok || !data.ok) setError({ code: data.code, msg: data.error || 'Search failed.' });
      else setResult(data);
    } catch (e) { setError({ msg: e.message || 'Search failed.' }); }
    finally { setRunning(false); }
  };

  // Exit (child) lot band derived from the parent band, per the rule of thumb:
  // 5-20 ac parents -> 1-3 ac lots, 20+ ac -> 5-10 ac lots.
  const bigParent = ((num(acresMin) ?? 30) + (num(acresMax) ?? 60)) / 2 >= 20;
  const exitBand = bigParent ? [5, 10] : [1, 3];

  // Merge per-county deal-finder responses into one result (dedupe listings).
  const mergeDeals = (list) => {
    const counties = list.flatMap((r) => r.counties || []);
    const seen = new Set();
    const properties = [];
    for (const r of list) for (const p of (r.properties || [])) {
      const id = String(p.property_id ?? `${p.fips}:${p.apn}`);
      if (!seen.has(id)) { seen.add(id); properties.push(p); }
    }
    return { ok: true, counties, properties, count: properties.length, params: list[0].params, meta: list[list.length - 1].meta };
  };

  const runDealFinder = async () => {
    setError(null); setQuote(null); setReceipt(null);
    if (!selected.length) { setError({ msg: 'Pick at least one county to search.' }); return; }
    setRunning(true); setResult(null);
    try {
      const cos = selected.map((s) => s.fips);
      const BATCH = 5; // small waves so LandPortal is not throttled at high county counts
      const results = [];
      let done = 0;
      for (let i = 0; i < cos.length; i += BATCH) {
        const wave = await Promise.all(cos.slice(i, i + BATCH).map(async (fips) => {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 28000); // never let one county freeze the run
          try {
            const res = await fetch('/api/landportal/deal-finder', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fips: [fips], parentMin: num(acresMin), parentMax: num(acresMax), soldDays: num(soldDays), ratio: Number(ratio), frontageMin: num(frontageMin) }),
              signal: ctrl.signal,
            });
            const d = JSON.parse(await res.text());
            return (res.ok && d.ok) ? d : null;
          } catch { return null; } finally { clearTimeout(to); }
        }));
        results.push(...wave);
        done += wave.length;
        const ok = results.filter(Boolean);
        if (ok.length) setResult({ ...mergeDeals(ok), progress: `${done}/${cos.length} counties` }); // stream in wave by wave
      }
      const ok = results.filter(Boolean);
      if (!ok.length) { setError({ msg: 'Deal finder failed. Try again.' }); return; }
      const failed = results.length - ok.length;
      setResult({ ...mergeDeals(ok), warnings: failed ? [`${failed} ${failed === 1 ? 'county' : 'counties'} timed out, run again to include them`] : [] });
    } catch (e) { setError({ msg: e.message || 'Deal finder failed.' }); }
    finally { setRunning(false); }
  };

  const clearAll = () => {
    setResult(null); setError(null); setQuote(null); setReceipt(null); setDetails({});
    setSelected([]); setActiveState(''); setCountyQuery('');
    setStatus('for_sale'); setDaysWindow(''); setVacantOnly(true);
    setAcresMin(30); setAcresMax(60); setFrontageMin(''); setPriceMin(''); setPriceMax(''); setPpaMin(''); setPpaMax('');
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

  const items = useMemo(() => rows.map((p) => ({ property_id: String(p.property_id), fips: String(p.fips) })).filter((i) => i.property_id), [rows]);

  // Step 1: quote the detailed run (no spend).
  const askQuote = async () => {
    setQuoting(true); setReceipt(null);
    try {
      const res = await fetch('/api/landportal/hydrate/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, cap }) });
      const d = await res.json();
      if (d.ok) setQuote(d.quote); else setError({ msg: d.error || 'Quote failed.' });
    } catch (e) { setError({ msg: e.message }); } finally { setQuoting(false); }
  };

  // Step 2: run it.
  const confirmRun = async () => {
    setRunningDetailed(true);
    try {
      const res = await fetch('/api/landportal/hydrate/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, cap }) });
      const d = await res.json();
      if (!res.ok || !d.ok) { setError({ msg: d.error || 'Detailed run failed.' }); }
      else {
        setDetails((prev) => ({ ...prev, ...d.details }));
        setReceipt(d.receipt);
        setDaily({ spentCents: d.receipt.dailyTokensSpentCents, poolLeft: d.receipt.poolLeft, ceilingCents: d.receipt.dailyTokenCeilingCents });
        setQuote(null);
      }
    } catch (e) { setError({ msg: e.message }); } finally { setRunningDetailed(false); }
  };

  // Push a listing into the CRM as a Subdivision Inflow lead (auto-saves the map).
  const [pushed, setPushed] = useState({});      // property_id -> { leadId, mapped }
  const [pushingId, setPushingId] = useState(null);
  const pushToInflow = async (p) => {
    setPushingId(String(p.property_id));
    try {
      const d = details[String(p.property_id)];
      const res = await fetch('/api/landportal/push-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property: { property_id: p.property_id, owner_full_name: p.owner_full_name, street_address: p.street_address, apn: p.apn, fips: p.fips, lot_size_acres: p.lot_size_acres, county: (countyDict[p.fips] || '').split(',')[0], state: (countyDict[p.fips] || '').split(', ')[1] },
          geometry: d?.geometry || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError({ msg: data.error || 'Push failed.' }); return; }
      setPushed((cur) => ({ ...cur, [String(p.property_id)]: { leadId: data.leadId, mapped: data.mapped, existing: data.existing } }));
    } catch (e) { setError({ msg: e.message }); } finally { setPushingId(null); }
  };

  const toggleSort = (k) => { if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(k); setSortDir('desc'); } };
  const quota = result?.meta?.requests_left;
  const isMarket = status === 'for_sale' || status === 'sold';
  const nUnhydrated = items.filter((i) => !details[i.property_id]).length;

  return (
    <div className="p-4 space-y-4 text-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">OM Search</h2>
          <p className="text-xs text-slate-400">Find on-market land listings in your hot markets. Search is free. Run detailed adds boundaries and valuation.</p>
        </div>
        <div className="text-right text-xs text-slate-400 space-y-0.5">
          {quota != null && <div>{quota.toLocaleString()} searches left today</div>}
          {daily && <div className="text-slate-500">Detail pool {daily.poolLeft}/8 left today{daily.spentCents ? ` · spent ${money(daily.spentCents)}` : ''}</div>}
        </div>
      </div>

      {/* Filter panel */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 space-y-4">
        {/* Mode: plain listing search vs deal finder (buy parent at a fraction of sold child PPA) */}
        <div className="flex gap-1 w-fit rounded-lg border border-slate-700 bg-slate-800 p-0.5">
          {[['listings', 'Listings'], ['deals', 'Deal finder']].map(([v, lbl]) => (
            <button key={v} type="button" onClick={() => { setMode(v); setResult(null); setError(null); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${mode === v ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'}`}>{lbl}</button>
          ))}
        </div>

        {/* Saved-search presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Saved</span>
          {PRESETS.map((preset) => (
            <button key={preset.id} type="button" onClick={() => loadPreset(preset)}
              className="px-3 py-1 rounded-full text-xs border border-indigo-500/50 bg-indigo-600/20 text-indigo-200 hover:bg-indigo-600/40">
              {preset.label} <span className="text-indigo-400">({preset.counties.length})</span>
            </button>
          ))}
        </div>

        {/* State -> County cascade. Pick a state, add its counties, switch states and add more. */}
        <div className="grid sm:grid-cols-2 gap-3 items-start">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">State</label>
            <select value={activeState} onChange={(e) => { setActiveState(e.target.value); setCountyQuery(''); }}
              className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              <option value="">Select a state</option>
              {presentStates.map((s) => <option key={s.fips} value={s.fips}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">County {activeState && <span className="text-slate-500 normal-case">in {stateByFips[activeState]?.name}</span>}</label>
            <input value={countyQuery} onChange={(e) => setCountyQuery(e.target.value)} disabled={!activeState}
              placeholder={activeState ? 'Filter counties' : 'Pick a state first'}
              className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50" />
            {activeState && (
              <div className="mt-1 border border-slate-600 rounded-md bg-slate-800/70 max-h-48 overflow-y-auto divide-y divide-slate-700/50">
                <button type="button" onClick={addAllInState} className="w-full text-left px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-600/20 sticky top-0 bg-slate-800">
                  + Add all {countiesInState.length} in {stateByFips[activeState]?.name}
                </button>
                {countiesInState.map((c) => {
                  const on = selSet.has(c.fips);
                  return (
                    <button key={c.fips} type="button" onClick={() => (on ? removeCounty(c.fips) : addCounty(c))}
                      className={`flex w-full justify-between px-3 py-1.5 text-sm text-left ${on ? 'bg-indigo-600/25 text-indigo-100' : 'hover:bg-slate-700/50'}`}>
                      <span>{on ? '✓ ' : ''}{c.name}</span><span className="text-slate-500">{c.fips}</span>
                    </button>
                  );
                })}
                {countiesInState.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No match</div>}
              </div>
            )}
          </div>
        </div>

        {/* Selected counties, across states */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Selected ({selected.length})</span>
            {selected.length > 0 && <button type="button" onClick={() => setSelected([])} className="text-[11px] text-slate-400 hover:text-white">Remove all</button>}
          </div>
          {selected.length === 0 ? (
            <p className="text-xs text-slate-500">No counties selected. Load a preset or pick a state above.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((c) => (
                <span key={c.fips} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 text-[11px] border border-indigo-500/40">
                  {c.label}<button type="button" onClick={() => removeCounty(c.fips)} className="text-indigo-300 hover:text-white">&times;</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {mode === 'listings' && (
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
                <input type="number" value={daysWindow} onChange={(e) => setDaysWindow(e.target.value)} placeholder={status === 'sold' ? '365' : 'all active'} className="w-28 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
                {status === 'for_sale' && <p className="text-[10px] text-slate-500 mt-1">Blank = all active listings</p>}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-1.5">
              <input type="checkbox" checked={vacantOnly} onChange={(e) => setVacantOnly(e.target.checked)} className="accent-indigo-500 w-4 h-4" />
              <span>Vacant land only <span className="text-slate-500 text-xs">(no structures)</span></span>
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{mode === 'deals' ? 'Parent parcel size (acres)' : 'Acreage'}</label>
            <div className="flex items-center gap-1.5">
              <input type="number" value={acresMin} onChange={(e) => setAcresMin(e.target.value)} placeholder="min" className="w-24 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
              <span className="text-slate-500">to</span>
              <input type="number" value={acresMax} onChange={(e) => setAcresMax(e.target.value)} placeholder="max" className="w-24 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
            </div>
          </div>
          {mode === 'listings' && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Road frontage (ft, min)</label>
              <input type="number" value={frontageMin} onChange={(e) => setFrontageMin(e.target.value)} placeholder="e.g. 800" className="w-32 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
            </div>
          )}
        </div>

        {mode === 'deals' && (
          <div className="rounded-lg border border-emerald-700/40 bg-emerald-900/10 p-3 space-y-3">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Sold comps window (days)</label>
                <input type="number" value={soldDays} onChange={(e) => setSoldDays(e.target.value)} className="w-28 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Road frontage (ft, min)</label>
                <input type="number" value={frontageMin} onChange={(e) => setFrontageMin(e.target.value)} placeholder="any" className="w-28 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div className="flex-1 min-w-[220px]">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Buy box: pay up to <span className="text-emerald-300">{Math.round(Number(ratio) * 100)}%</span> of sold PPA</label>
                <input type="range" min="0.3" max="1" step="0.05" value={ratio} onChange={(e) => setRatio(e.target.value)} className="w-full accent-emerald-500" />
                <div className="flex justify-between text-[10px] text-slate-500"><span>30%</span><span>50%</span><span>65%</span><span>100%</span></div>
              </div>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">Exit lots <span className="text-slate-200">{exitBand[0]}-{exitBand[1]} ac</span> (auto from parent size). Finds active vacant parents priced at or under <span className="text-slate-200">{Math.round(Number(ratio) * 100)}%</span> of each county&rsquo;s median sold PPA for that lot band.</p>
          </div>
        )}

        {mode === 'listings' && isMarket && (
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
          <button type="button" onClick={mode === 'deals' ? runDealFinder : runSearch} disabled={running}
            className={`px-4 py-2 rounded-lg disabled:opacity-50 text-white text-sm font-semibold ${mode === 'deals' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
            {running ? (mode === 'deals' ? 'Finding deals...' : 'Searching...') : (mode === 'deals' ? 'Find deals' : 'Run search')}
          </button>
          <button type="button" onClick={clearAll} className="px-3 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800">Clear</button>
          <span className="text-xs text-slate-500">{mode === 'deals' ? 'Sold comps from Land Portal, filter-pool only, free.' : 'Search is free. Price and PPA apply to on-market listings only.'}</span>
        </div>
      </div>

      {error && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error.code === 'mls_access_denied' ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-red-500/50 bg-red-500/10 text-red-200'}`}>
          {error.code === 'mls_access_denied'
            ? 'This account does not have MLS data access. On-market search will not return listings until MLS data is enabled on the Land Portal account.'
            : error.msg}
        </div>
      )}

      {result?.suspicious && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          This on-market search returned {result.count?.toLocaleString()} results, unusually high for active land listings. The MLS filter may not have applied. Verify before trusting these rows.
        </div>
      )}

      {result && !result.suspicious && (
        <div className="space-y-3">
          {/* Deal-finder benchmark banner (per county) */}
          {result.counties && (
            <div className="rounded-lg border border-emerald-600/40 bg-emerald-900/10 p-3 space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Buy box per county (median sold PPA of {result.params?.parentMin >= 20 || ((result.params?.parentMin + result.params?.parentMax) / 2 >= 20) ? '5-10' : '1-3'} ac lots)</div>
              <div className="flex flex-wrap gap-2">
                {result.counties.map((c) => (
                  <span key={c.fips} className="text-[11px] px-2 py-1 rounded bg-slate-800 border border-slate-700">
                    <span className="text-slate-200">{countyDict[c.fips] || c.fips}</span>{': '}
                    {c.soldCount ? <>sold ~${(c.medianPPA || 0).toLocaleString()}/ac{' '}<span className="text-emerald-300">→ buy ≤ ${(c.ceiling || 0).toLocaleString()}/ac</span>{' '}<span className="text-slate-500">({c.listingCount} match{c.listingCount === 1 ? '' : 'es'}, {c.soldCount} comps)</span></> : <span className="text-slate-500">no sold comps</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Results header + detailed controls */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">{result.count?.toLocaleString()} {result.counties ? 'deals' : (isMarket ? 'listings' : 'parcels')}</span>
            {result.raw_count != null && result.raw_count !== result.count && <span className="text-slate-500 text-xs">({result.raw_count.toLocaleString()} before dedupe)</span>}
            {result.cached && <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 text-[11px]">cached, no quota used</span>}
            {result.warnings?.includes('overflow') && <span className="text-amber-300 text-xs">Over the result cap. Narrow your filters.</span>}
            {rows.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-500">Sort</span>
                {[['lot_size_acres', 'Acres'], ['owner_full_name', 'Owner'], ['fips', 'County']].map(([k, lbl]) => (
                  <button key={k} onClick={() => toggleSort(k)} className={`text-xs px-2 py-1 rounded ${sortKey === k ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>{lbl}{sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                ))}
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={askQuote} disabled={quoting || runningDetailed || nUnhydrated === 0}
                className="px-4 py-2 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold">
                {quoting ? 'Checking cost...' : nUnhydrated === 0 ? 'All rows detailed' : `Run detailed (${nUnhydrated})`}
              </button>
              <span className="text-xs text-slate-500">Adds parcel boundary + Land Portal valuation. Quotes cost before spending.</span>
            </div>
          )}

          {/* Cost quote / confirm bar */}
          {quote && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm space-y-2">
              <div className="text-slate-200">
                {quote.total} results {'→'} {quote.cached} already cached (free) {'→'} <span className="font-semibold">{quote.new} new fetches</span>
                {quote.new > 0 && <> {'→'} {quote.fromPool} from today&rsquo;s pool + {quote.fromTokens} from tokens {'≈'} <span className="font-semibold">{money(quote.estCents)}</span></>}
              </div>
              {quote.overCap ? (
                <div className="text-amber-200">
                  {quote.new} new fetches is over the run cap of {quote.cap}. Narrow the search, or raise the cap deliberately:
                  <span className="ml-2 inline-flex items-center gap-1">
                    <input type="number" value={cap} min={1} max={quote.capCeiling} onChange={(e) => setCap(Math.min(quote.capCeiling, Math.max(1, Number(e.target.value) || 1)))} className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs" />
                    <button type="button" onClick={askQuote} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">Re-quote</button>
                    <span className="text-slate-500 text-xs">max {quote.capCeiling}</span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={confirmRun} disabled={runningDetailed}
                    className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold">
                    {runningDetailed ? 'Running...' : quote.new === 0 ? 'Nothing to fetch' : 'Run it'}
                  </button>
                  <button type="button" onClick={() => setQuote(null)} className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 text-xs">Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* Receipt */}
          {receipt && (
            <div className={`rounded-lg border px-4 py-2 text-xs ${receipt.stoppedShort ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-slate-600 bg-slate-800/60 text-slate-300'}`}>
              Fetched {receipt.fetched} {'·'} spent {money(receipt.spentCents)} {'·'} pool {receipt.poolLeft}/8 left today
              {receipt.stoppedShort && (
                <div className="mt-1 text-amber-200">
                  Stopped early: {receipt.stopReason || 'daily pool and tokens reached'}. Load export tokens in Land Portal to fetch more today, or try tomorrow (the free pool resets).
                </div>
              )}
            </div>
          )}

          {/* Result rows */}
          {rows.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-400">
              No {isMarket ? 'listings' : 'parcels'} match. Try widening the acreage band{vacantOnly ? ', unchecking Vacant land only,' : ''} or the {status === 'sold' ? 'sold' : 'listed-within'} window.
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((p) => {
                const d = details[String(p.property_id)];
                const flag = d ? acreageFlag(d) : null;
                return (
                  <div key={p.property_id || `${p.fips}-${p.apn}`} className="flex gap-3 rounded-lg border border-slate-700 bg-slate-900/40 p-2.5">
                    <div className="flex-shrink-0">
                      {/* Prefer the exact Land Portal boundary once hydrated; otherwise
                          auto-load a free Regrid boundary by APN (shows where covered). */}
                      {d?.geometry
                        ? <ParcelMiniMap geometry={d.geometry} width={200} height={130} />
                        : <ParcelMiniMap lookup={{ apn: (p.apn || '').trim(), fips: p.fips, county: (countyDict[p.fips] || '').split(',')[0] }} width={200} height={130} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.owner_full_name || 'Owner unknown'}</div>
                          <div className="text-sm text-slate-400 truncate">{p.street_address || 'No situs address'}</div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-3">
                          <a href={listingSearchUrl(p)} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200 text-sm underline">View listing</a>
                          {pushed[String(p.property_id)] ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2.5 py-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              {pushed[String(p.property_id)].existing ? 'Already in pipeline' : 'In Subdivision Inflow'}{pushed[String(p.property_id)].mapped ? ', mapped' : ''}
                            </span>
                          ) : (
                            <button type="button" onClick={() => pushToInflow(p)} disabled={pushingId === String(p.property_id)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-teal-600/90 hover:bg-teal-600 disabled:opacity-50 text-white">
                              {pushingId === String(p.property_id) ? 'Pushing...' : 'Push to Inflow'}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                        <span><span className="text-slate-500 text-xs">County </span>{countyDict[p.fips] || p.fips}</span>
                        <span><span className="text-slate-500 text-xs">Acres </span>{p.lot_size_acres != null ? Number(p.lot_size_acres).toLocaleString() : '-'}{d?.calc_acres != null && <span className="text-slate-500"> (calc {Number(d.calc_acres).toLocaleString()})</span>}</span>
                        <span className="text-slate-400"><span className="text-slate-500 text-xs">APN </span>{p.apn || '-'}</span>
                        {d && d.road_frontage != null && <span><span className="text-slate-500 text-xs">Frontage </span>{Number(d.road_frontage).toLocaleString()} ft</span>}
                        {d && d.tlp_ppa != null && <span><span className="text-slate-500 text-xs">LP est PPA </span>{usd(d.tlp_ppa)}/ac</span>}
                        {d && d.tlp_estimate != null && <span><span className="text-slate-500 text-xs">LP est value </span>{usd(d.tlp_estimate)}</span>}
                      </div>
                      {flag && (
                        <div className="mt-1.5 inline-block text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5">
                          Acreage check: assessed {flag.assessed} vs calc {flag.calc} ({flag.pct}% apart)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-slate-500">LP est values are Land Portal&rsquo;s own estimate, not the MLS list price (the API does not return list price or agent). Push to pipeline + review queue are the next step.</p>
        </div>
      )}
    </div>
  );
}
