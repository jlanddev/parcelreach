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

  // The API can return the same parcel more than once (observed: a listing
  // appearing 3x). Dedupe by property_id (fall back to fips:apn). When the full
  // result set fit in the response (not truncated by the 100-row page), the
  // deduped length is the true unique count; otherwise keep the API's raw count.
  const rawCount = count;
  const truncated = Array.isArray(properties) && count != null && properties.length < count;
  const seenIds = new Set();
  properties = (properties || []).filter((p) => {
    const id = String(p.property_id ?? p.propertyid ?? `${p.fips}:${p.apn}`);
    if (seenIds.has(id)) return false;
    seenIds.add(id); return true;
  });
  if (!truncated) count = properties.length;

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
    raw_count: rawCount,
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

// Estimate the median from cumulative bracket counts (edges + count of items
// with value <= each edge), interpolating within the median bracket.
function estimateMedian(edges, cum, N) {
  if (!N) return null;
  const target = N / 2;
  let prevEdge = 0, prevCum = 0;
  for (let i = 0; i < edges.length; i++) {
    if (cum[i] >= target) {
      const span = edges[i] - prevEdge;
      const denom = cum[i] - prevCum;
      const frac = denom ? (target - prevCum) / denom : 0.5;
      return Math.round(prevEdge + frac * span);
    }
    prevEdge = edges[i]; prevCum = cum[i];
  }
  return edges[edges.length - 1]; // median is above the top edge
}

/**
 * Deal finder: per county, estimate the median SOLD price-per-acre of small
 * child lots (vacant, child band, sold window) by bracket-counting, set a
 * for-sale PPA ceiling at `ratio` of that median (default half), and return the
 * for-sale PARENT listings (vacant, parent band) priced under the ceiling.
 * All filter-pool calls, no metered hydration.
 */
export async function findDeals(params = {}, { noCache = false } = {}) {
  const fips = (Array.isArray(params.fips) ? params.fips : []).filter(Boolean).map(String);
  if (!fips.length) throw new LandPortalError('Pick at least one county.', { code: 'bad_request', status: 400 });
  const parentMin = params.parentMin ?? 30, parentMax = params.parentMax ?? 60;
  const soldDays = params.soldDays ?? 730, ratio = params.ratio ?? 0.5;
  const frontageMin = params.frontageMin; // optional, applied to the parent listings
  // Jordan's rule of thumb for the exit (child) lot band the comps benchmark
  // against: 5-20 ac parents subdivide into 1-3 ac lots; 20+ ac parents into
  // 5-10 ac lots. Auto-derived from the parent band unless explicitly overridden.
  const bigParent = (parentMin + parentMax) / 2 >= 20;
  const childMin = params.childMin ?? (bigParent ? 5 : 1);
  const childMax = params.childMax ?? (bigParent ? 10 : 3);

  const canonical = canonicalParams({ ...params, __mode: 'deals' });
  const hash = hashOf(canonical);
  if (!noCache) { const hit = await cacheGet(hash); if (hit) return { ...hit, cached: true }; }

  // Price-per-acre ladder wide enough for metro markets (small lots >$100k/ac)
  // without too many calls per county. Empty brackets cost 0 quota.
  const EDGES = [10000, 25000, 50000, 100000, 200000, 400000];
  const range = (key, v) => ({ key, operator: 'range', comparison: 'is_between', include_nulls: false, value: v });
  const soldBase = [
    { key: 'mls_sold', operator: 'mls_condition', value: 'sold', days: soldDays },
    // Exclude anything still actively listed so the benchmark is real closed
    // sales, not current listings bleeding into the sold query.
    { key: 'active_listing_toggle', operator: 'active_listing_toggle', value: 'exclude' },
    { key: 'vacant', operator: 'boolean', value: true },
    range('lotsizeacres', { min: childMin, max: childMax }),
    // Require the geometry-derived acreage to also be in band, so listings that
    // market a piece of a bigger parcel (unrecorded split: calc 60, listed 15)
    // are excluded from the benchmark.
    range('calc_acres', { min: childMin, max: childMax }),
  ];

  let meta = null;
  // Run all counties concurrently (each county's bracket calls are already
  // parallel). Sequential counties blew past the serverless timeout at 10 markets.
  const perCounty = await Promise.all(fips.map(async (county) => {
    const totalP = rawFilter({ fips: [county], filters: soldBase });
    const cumP = EDGES.map((e) => rawFilter({ fips: [county], filters: [...soldBase, range('mls_priceperacre', { max: e })] }));
    const [total, ...cum] = await Promise.all([totalP, ...cumP]);
    meta = total.meta || meta;
    const N = total.count || 0;
    const medianPPA = estimateMedian(EDGES, cum.map((r) => r.count || 0), N);
    const ceiling = medianPPA ? Math.round(medianPPA * ratio) : null;
    let listings = [], listingCount = 0;
    if (ceiling) {
      const parents = await rawFilter({ fips: [county], filters: [
        { key: 'mls_for_sale', operator: 'mls_condition', value: 'active' },
        { key: 'vacant', operator: 'boolean', value: true },
        range('lotsizeacres', { min: parentMin, max: parentMax }),
        // Geometry acres in band too -> drops unrecorded splits (calc 60 / listed 15).
        range('calc_acres', { min: parentMin, max: parentMax }),
        range('mls_priceperacre', { max: ceiling }),
        ...((frontageMin != null && frontageMin !== '' && Number(frontageMin) > 0) ? [range('road_frontage', { min: Number(frontageMin) })] : []),
      ] });
      meta = parents.meta || meta;
      listingCount = parents.count || 0;
      listings = parents.properties || [];
    }
    return { fips: county, soldCount: N, medianPPA, ceiling, listingCount, listings };
  }));

  const counties = perCounty.map(({ listings, ...c }) => c);
  const allProps = [];
  const seen = new Set();
  for (const pc of perCounty) {
    for (const p of pc.listings) {
      const id = String(p.property_id ?? `${p.fips}:${p.apn}`);
      if (!seen.has(id)) { seen.add(id); allProps.push({ ...p, __ceiling: pc.ceiling, __medianPPA: pc.medianPPA }); }
    }
  }

  const payload = {
    cached: false,
    mode: 'deals',
    count: allProps.length,
    properties: allProps,
    counties,
    meta: { requests_left: meta?.requests_left ?? null, results_limit: meta?.results_limit ?? null },
    params: { childMin, childMax, parentMin, parentMax, soldDays, ratio },
    warnings: [],
  };
  if (!noCache) await cacheSet(hash, payload);
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

// ---------------------------------------------------------------------------
// Detailed hydration: parcel boundary + valuation from the metered single-
// property pool, with a quote-before-spend + receipt-after flow and hard
// server-side guardrails. Geometry is cached PERMANENTLY by property_id
// (boundaries never change), so each parcel costs at most one fetch ever.
// ---------------------------------------------------------------------------
export const HYDRATION = {
  TOKEN_CENTS: 7,               // ~$0.07 per boundary once the daily pool is spent
  DAILY_POOL_MAX: 8,            // observed free single-property calls/day (self-corrects from meta)
  RUN_CAP_DEFAULT: 50,         // never auto-fetch more new boundaries than this in one run
  RUN_CAP_CEILING: 200,        // the most the cap may be raised to
  DAILY_TOKEN_CEILING_CENTS: 1000, // $10/day hard circuit breaker across all token spend
};

async function getCachedDetails(propertyIds = []) {
  const out = {};
  const ids = propertyIds.map(String).filter(Boolean);
  if (!ids.length) return out;
  try {
    const sb = supabaseAdmin();
    // chunk to stay under URL limits on the .in() filter
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('landportal_property_cache').select('property_id, detail').in('property_id', ids.slice(i, i + 200));
      for (const row of data || []) out[String(row.property_id)] = row.detail;
    }
  } catch { /* table may not be migrated yet */ }
  return out;
}

async function cacheDetail(propertyId, fips, detail) {
  try {
    const sb = supabaseAdmin();
    await sb.from('landportal_property_cache').upsert(
      { property_id: String(propertyId), fips: String(fips || ''), detail, fetched_at: new Date().toISOString() },
      { onConflict: 'property_id' });
  } catch { /* cache optional */ }
}

// In-process quota fallback so the ledger still tracks within a warm instance
// even before the landportal_quota table is migrated (e.g. remembering pool=0
// after a 403 so the next quote is honest).
let memQuota = null; // { day, pool_remaining, tokens_spent_cents, fetches }

async function getQuotaToday() {
  const day = todayKey();
  if (memQuota && memQuota.day === day) return { pool_remaining: memQuota.pool_remaining, tokens_spent_cents: memQuota.tokens_spent_cents, fetches: memQuota.fetches };
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from('landportal_quota').select('*').eq('quota_date', day).maybeSingle();
    if (data) {
      const q = { pool_remaining: data.pool_remaining, tokens_spent_cents: data.tokens_spent_cents || 0, fetches: data.fetches || 0 };
      memQuota = { day, ...q };
      return q;
    }
  } catch { /* table optional */ }
  return { pool_remaining: null, tokens_spent_cents: 0, fetches: 0 };
}

async function saveQuotaToday(q) {
  const day = todayKey();
  memQuota = { day, pool_remaining: q.pool_remaining ?? null, tokens_spent_cents: q.tokens_spent_cents || 0, fetches: q.fetches || 0 };
  try {
    const sb = supabaseAdmin();
    await sb.from('landportal_quota').upsert(
      { quota_date: day, pool_remaining: q.pool_remaining, tokens_spent_cents: q.tokens_spent_cents, fetches: q.fetches },
      { onConflict: 'quota_date' });
  } catch { /* optional */ }
}

// Best estimate of free-pool calls left today: authoritative value from the last
// detail call's meta if we have it, else the daily max minus fetches so far.
function poolRemainingEst(q) {
  if (q.pool_remaining != null) return q.pool_remaining;
  return Math.max(0, HYDRATION.DAILY_POOL_MAX - (q.fetches || 0));
}

/** Cost quote for hydrating a set of listings. No spend. */
export async function quoteHydration(items = [], { cap = HYDRATION.RUN_CAP_DEFAULT } = {}) {
  const ids = items.map((i) => String(i.property_id)).filter(Boolean);
  const cached = await getCachedDetails(ids);
  const newCount = ids.filter((id) => !cached[id]).length;
  const q = await getQuotaToday();
  const poolRem = poolRemainingEst(q);
  const fromPool = Math.min(newCount, poolRem);
  const fromTokens = newCount - fromPool;
  return {
    total: ids.length,
    cached: ids.length - newCount,
    new: newCount,
    poolRemaining: poolRem,
    fromPool,
    fromTokens,
    estCents: fromTokens * HYDRATION.TOKEN_CENTS,
    cap,
    capCeiling: HYDRATION.RUN_CAP_CEILING,
    overCap: newCount > cap,
    dailyTokensSpentCents: q.tokens_spent_cents,
    dailyTokenCeilingCents: HYDRATION.DAILY_TOKEN_CEILING_CENTS,
  };
}

/**
 * Hydrate a set of listings, spending pool then tokens. Enforces (server-side):
 * per-run cap, the $10/day token circuit breaker, and graceful stop when the
 * account 403s (pool + tokens exhausted). Returns cached+fresh details + a receipt.
 */
export async function runHydration(items = [], { cap = HYDRATION.RUN_CAP_DEFAULT } = {}) {
  const safeCap = Math.min(Math.max(1, cap), HYDRATION.RUN_CAP_CEILING);
  const ids = items.map((i) => String(i.property_id)).filter(Boolean);
  const cached = await getCachedDetails(ids);
  const newItems = items.filter((i) => !cached[String(i.property_id)]);

  // GUARD 1: per-run cap. Never partial-spend into a set larger than the cap.
  if (newItems.length > safeCap) {
    throw new LandPortalError(
      `This run would fetch ${newItems.length} new boundaries, over the cap of ${safeCap}. Narrow the search or raise the cap.`,
      { code: 'run_cap_exceeded', status: 400 });
  }

  const q = await getQuotaToday();
  // GUARD 2: daily token circuit breaker (pre-flight estimate).
  const estTokenFetches = Math.max(0, newItems.length - poolRemainingEst(q));
  if (q.tokens_spent_cents + estTokenFetches * HYDRATION.TOKEN_CENTS > HYDRATION.DAILY_TOKEN_CEILING_CENTS) {
    throw new LandPortalError(
      `This run would exceed the $${(HYDRATION.DAILY_TOKEN_CEILING_CENTS / 100).toFixed(0)}/day token ceiling. Raise the ceiling in config to proceed.`,
      { code: 'token_ceiling', status: 400 });
  }

  const details = { ...cached };
  let fetched = 0, spentCents = 0, stoppedShort = false, stopReason = null;
  for (const it of newItems) {
    const before = poolRemainingEst(q);
    // GUARD 3: re-check the breaker each iteration in case of drift.
    if (q.tokens_spent_cents >= HYDRATION.DAILY_TOKEN_CEILING_CENTS) { stoppedShort = true; stopReason = 'Daily token ceiling reached.'; break; }
    let res;
    try {
      res = await getPropertyDetail(it.property_id, it.fips);
    } catch (e) {
      // Pool + export tokens exhausted (LP may answer 403 or 429, or spell it
      // out in the message). Stop gracefully and remember the pool is empty so
      // the next quote is honest, instead of surfacing a scary error.
      const quotaHit = e instanceof LandPortalError && (e.code === 'forbidden' || e.code === 'rate_limited' || /limit|exhaust|token/i.test(e.message || ''));
      if (quotaHit) { stoppedShort = true; stopReason = e.message; q.pool_remaining = 0; break; }
      throw e;
    }
    const detail = res.property || {};
    if (res.geometry) detail.geometry = res.geometry;
    detail.__fips = String(it.fips || detail.fips || '');
    await cacheDetail(it.property_id, it.fips, detail);
    details[String(it.property_id)] = detail;
    fetched++;
    const usedToken = before <= 0;
    if (usedToken) { spentCents += HYDRATION.TOKEN_CENTS; q.tokens_spent_cents += HYDRATION.TOKEN_CENTS; }
    q.fetches += 1;
    const left = res.meta?.requests_left;
    q.pool_remaining = (left != null) ? left : Math.max(0, before - 1);
  }
  await saveQuotaToday(q);
  return {
    details,
    receipt: {
      fetched,
      spentCents,
      poolLeft: poolRemainingEst(q),
      dailyTokensSpentCents: q.tokens_spent_cents,
      dailyTokenCeilingCents: HYDRATION.DAILY_TOKEN_CEILING_CENTS,
      stoppedShort,
      stopReason,
    },
  };
}

export { MLS_KEYS, LAND_PROPERTY_TYPE };
