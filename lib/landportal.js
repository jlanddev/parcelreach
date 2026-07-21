// LandPortal API v2 client (server-side only). All Land Portal traffic goes
// through here so the token never touches the frontend and every response is
// normalized, cached, and guarded (MLS-rejection + on-market plausibility).
//
// See docs/landportal_v2/ for the confirmed v2 contract.
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  buildFilterRequest, zipToFilter, rejectedMlsKeys, canonicalParams,
  MLS_KEYS, LAND_PROPERTY_TYPE, ONMARKET_PLAUSIBILITY_CEILING,
} from '@/lib/landportal-filters.mjs';

const LP_BASE = 'https://api.landportal.com/v2';

function token() {
  const t = process.env.LANDPORTAL_JWT; // the lp_live_... API key
  if (!t) throw new Error('LANDPORTAL_JWT is not configured');
  return t;
}

// Typed error so routes can map to clean user messages / status codes.
export class LandPortalError extends Error {
  constructor(message, { code = 'internal', status = 500, requestId = null, fields = null } = {}) {
    super(message);
    this.name = 'LandPortalError';
    this.code = code; this.status = status; this.requestId = requestId; this.fields = fields;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Low-level fetch with the retry policy from our ground rules: exponential
 * backoff w/ jitter (1s,2s,4s, cap 30s) on 5xx and network errors ONLY. Never
 * retries 4xx. Maps error envelopes to LandPortalError.
 */
async function lpFetch(path, { method = 'GET', body } = {}) {
  const url = `${LP_BASE}${path}`;
  const headers = { Authorization: `Bearer ${token()}` };
  if (body) headers['Content-Type'] = 'application/json';
  const init = { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) };

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250));
    let res;
    try {
      res = await fetch(url, init);
    } catch (netErr) {
      lastErr = new LandPortalError(`Network error contacting LandPortal: ${netErr.message}`, { code: 'network', status: 502 });
      continue; // retry network errors
    }
    let json = null;
    try { json = await res.json(); } catch { /* some errors may have no body */ }

    if (res.ok) return { json, meta: json?.meta || null };

    // Non-2xx: map. Only 5xx is retryable.
    const err = json?.error || {};
    const code = err.code || (res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden'
      : res.status === 404 ? 'not_found' : res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'internal' : 'bad_request');
    const lpErr = new LandPortalError(err.message || json?.message || `LandPortal ${res.status}`, {
      code, status: res.status, requestId: err.request_id || null, fields: err.fields || null,
    });
    if (res.status >= 500) { lastErr = lpErr; continue; } // retry 5xx
    throw lpErr; // 4xx: do not retry
  }
  throw lastErr || new LandPortalError('LandPortal request failed after retries', { code: 'internal', status: 502 });
}

// ---------------------------------------------------------------------------
// Cache: durable Supabase table `landportal_cache` keyed by (filter_hash, cache_date),
// with an in-process Map fallback so it still works pre-migration / on cold rows.
// ---------------------------------------------------------------------------
const memCache = new Map(); // key -> { day, payload }
const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const hashOf = (canonical) => crypto.createHash('sha1').update(canonical).digest('hex');

async function cacheGet(hash) {
  const day = todayKey();
  const mem = memCache.get(hash);
  if (mem && mem.day === day) return mem.payload;
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from('landportal_cache')
      .select('response').eq('filter_hash', hash).eq('cache_date', day).maybeSingle();
    if (data?.response) { memCache.set(hash, { day, payload: data.response }); return data.response; }
  } catch { /* table may not exist yet */ }
  return null;
}

async function cacheSet(hash, payload) {
  const day = todayKey();
  memCache.set(hash, { day, payload });
  try {
    const sb = supabaseAdmin();
    await sb.from('landportal_cache')
      .upsert({ filter_hash: hash, cache_date: day, response: payload }, { onConflict: 'filter_hash,cache_date' });
  } catch { /* durable cache optional */ }
}

// Extract the list of properties + count from a filter response, tolerant of shape.
function readFilterData(json) {
  const data = json?.data || {};
  const properties = data.properties || data.results || data.items || [];
  return { properties: Array.isArray(properties) ? properties : [], count: data.count ?? data.total ?? null, next_page_token: data.next_page_token || null };
}

/** One raw filter POST (no cache, no fan-out). Returns { properties, count, next_page_token, meta }. */
async function rawFilter(body) {
  const { json, meta } = await lpFetch('/filter-data', { method: 'POST', body });
  return { ...readFilterData(json), meta };
}

/**
 * Search properties from our clean params. Handles: cache, multi-ZIP fan-out,
 * the fatal MLS-rejection guard, and the on-market plausibility ceiling.
 * Returns a normalized envelope the UI can render directly.
 */
export async function searchProperties(cleanParams = {}, { noCache = false } = {}) {
  const canonical = canonicalParams(cleanParams);
  const hash = hashOf(canonical);
  if (!noCache) {
    const hit = await cacheGet(hash);
    if (hit) return { ...hit, cached: true };
  }

  const zips = Array.isArray(cleanParams.zip) ? cleanParams.zip.filter(Boolean).map(String) : null;
  const warnings = [];
  let properties = [];
  let count = 0;
  let next_page_token = null;
  let meta = null;
  let submittedMlsKeys = [];
  let isMarketQuery = false;

  if (zips && zips.length > 1) {
    // Multi-ZIP: one query per ZIP, merge + dedupe by property_id. A parcel is in
    // exactly one ZIP so counts sum without double-counting. Paging not supported
    // in fan-out mode (first page per ZIP), which is plenty for hundreds of listings.
    const seen = new Set();
    for (const zip of zips) {
      const built = buildFilterRequest({ ...cleanParams, zip });
      submittedMlsKeys = built.submittedMlsKeys; isMarketQuery = built.isMarketQuery;
      const r = await rawFilter(built.body);
      guardMls(r.meta, submittedMlsKeys);
      meta = r.meta || meta;
      count += r.count || 0;
      for (const p of r.properties) {
        const id = String(p.property_id ?? p.propertyid ?? `${p.fips}:${p.apn}`);
        if (!seen.has(id)) { seen.add(id); properties.push(p); }
      }
    }
    warnings.push('multi_zip_fanout');
  } else {
    const params = zips && zips.length === 1 ? { ...cleanParams, zip: zips[0] } : cleanParams;
    const built = buildFilterRequest(params);
    submittedMlsKeys = built.submittedMlsKeys; isMarketQuery = built.isMarketQuery;
    const r = await rawFilter(built.body);
    guardMls(r.meta, submittedMlsKeys);
    ({ properties, count, next_page_token, meta } = r);
  }

  // Overflow: server caps result sets (50k). Surface it as a narrow-your-filters signal.
  const resultsLimit = meta?.results_limit ?? null;
  if (resultsLimit && count != null && count > resultsLimit) {
    warnings.push('overflow'); // count is real but properties may be empty; tell the user to narrow
  }

  // On-market plausibility ceiling: catches an MLS filter that silently no-oped
  // (renamed key, bad operator) despite a clean envelope. Hundreds, not thousands.
  let suspicious = false;
  if (isMarketQuery && count != null && count > ONMARKET_PLAUSIBILITY_CEILING) {
    suspicious = true;
    warnings.push('onmarket_count_suspicious');
  }

  const payload = {
    cached: false,
    count,
    properties,
    page: properties.slice(0, 100),
    next_page_token,
    meta: { requests_left: meta?.requests_left ?? null, results_limit: resultsLimit },
    applied: appliedSummary(cleanParams, submittedMlsKeys, isMarketQuery),
    warnings,
    suspicious,
  };
  if (!noCache && !suspicious) await cacheSet(hash, payload); // never cache a suspicious result
  return payload;
}

// Fatal MLS guard: if any MLS key we submitted was rejected, the account lacks
// MLS data access. Do NOT return the (un-MLS-filtered) results as if valid.
function guardMls(meta, submittedMlsKeys) {
  const rejected = rejectedMlsKeys(meta, submittedMlsKeys);
  if (rejected.length) {
    throw new LandPortalError('This account does not have MLS data access.', {
      code: 'mls_access_denied', status: 403,
    });
  }
}

// Echo of what we actually sent, so the UI can show which filters applied.
function appliedSummary(p, submittedMlsKeys, isMarketQuery) {
  return {
    location: { fips: p.fips || null, zip: p.zip || null, polygon: !!p.polygon, bbox: !!p.bbox },
    acres: (p.acres_min || p.acres_max) ? { min: p.acres_min ?? null, max: p.acres_max ?? null } : null,
    status: p.status || null,
    frontage_min: p.frontage_min ?? null,
    exclude: {
      wetlands: !!p.exclude_wetlands, flood: !!p.exclude_flood,
      active_listings: !!p.exclude_active_listings, land_locked: p.land_locked === false,
    },
    mls_keys_sent: submittedMlsKeys,
    is_market_query: isMarketQuery,
  };
}

// ---------------------------------------------------------------------------
// County dictionary (FIPS -> name), cached for the county picker.
// ---------------------------------------------------------------------------
let countyMem = null; // { day, dict }
export async function getCountyDictionary() {
  const day = todayKey();
  if (countyMem && countyMem.day === day) return countyMem.dict;
  const { json } = await lpFetch('/filter-data/filters/fips/values');
  const dict = json?.data?.values || {};
  countyMem = { day, dict };
  return dict;
}

// Dictionary values for any dictionary-backed filter (e.g. mls_propertytype).
export async function getFilterValues(filterKey) {
  const { json } = await lpFetch(`/filter-data/filters/${encodeURIComponent(filterKey)}/values`);
  return json?.data?.values || {};
}

/**
 * Hydrate one property's full detail. Draws from the SMALL single-property daily
 * pool (not the ~100k filter quota), so callers must treat it as scarce and
 * lazy-only. Returns { property, meta:{ requests_left } }.
 */
export async function getPropertyDetail(propertyId, fips) {
  const qs = fips ? `?fips=${encodeURIComponent(fips)}` : '';
  const { json, meta } = await lpFetch(`/properties/${encodeURIComponent(propertyId)}${qs}`);
  const feat = json?.data || {};
  const property = feat.properties && typeof feat.properties === 'object' ? feat.properties : feat;
  return { property, geometry: feat.geometry || null, meta };
}

export { MLS_KEYS, LAND_PROPERTY_TYPE };
