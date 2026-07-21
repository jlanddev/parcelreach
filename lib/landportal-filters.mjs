// Pure translation layer: our clean parameter schema -> LandPortal v2 request body.
//
// Kept dependency-free and in .mjs so it can be unit-tested directly with
// `node --test` (the rest of the package is CommonJS and only runs through the
// Next bundler). lib/landportal.js re-exports these.
//
// v2 body shape (confirmed live in Phase 0, see docs/landportal_v2/):
//   { fips: [...] | geometry: { polygon | bbox }, filters: [ { key, operator, ... } ] }
// - `fips`/`geometry` are TOP-LEVEL; one is required.
// - `filters` is an ARRAY of { key, operator, comparison?, value, include_nulls? }.
// - range uses comparison:"is_between", include_nulls:false, value:{min,max} (min-only allowed).

// MLS/market filter keys. If any of these come back in meta.rejected_filters we
// treat the whole request as failed (account has no MLS data access).
export const MLS_KEYS = [
  'mls_for_sale', 'mls_sold', 'mls_propertytype',
  'mls_price', 'mls_priceperacre', 'active_listing_toggle', 'listing_sold_toggle',
];

export const LAND_PROPERTY_TYPE = '8'; // mls_propertytype dictionary: "8" = Land

// On-market plausibility ceiling. A county's active land listings number in the
// hundreds; its whole parcel base is tens of thousands. If a for_sale/sold query
// returns more than this, the MLS filter probably didn't apply (renamed key,
// silent no-op) even though the envelope looked fine. Flagged, not trusted.
export const ONMARKET_PLAUSIBILITY_CEILING = 5000;

const isNum = (v) => v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v));

// Build a range filter entry. Accepts min and/or max; omits the absent bound.
function range(key, min, max, includeNulls = false) {
  const value = {};
  if (isNum(min)) value.min = Number(min);
  if (isNum(max)) value.max = Number(max);
  if (Object.keys(value).length === 0) return null;
  return { key, operator: 'range', comparison: 'is_between', include_nulls: includeNulls, value };
}

const boolean = (key, val) => ({ key, operator: 'boolean', value: !!val });
const condition = (key, value, comparison = 'is') => ({ key, operator: 'condition', comparison, value });

/**
 * Translate our clean params into the v2 request body.
 *
 * Clean schema (all optional unless noted):
 *   Location:  fips:string[]   zip:string (single; multi-ZIP is a caller fan-out)
 *              polygon:string   bbox:string   (a location scope is required)
 *   Size:      acres_min  acres_max
 *   Market:    status: 'for_sale' | 'sold' | 'off_market'
 *              listed_within_days   (for_sale window; listing-age, NOT days-on-market)
 *              sold_within_days     (sold window)
 *              price_min price_max  ppa_min ppa_max
 *              mls_property_types: string[]  (defaults to ['8'] = Land on a market query)
 *              exclude_active_listings: bool
 *   Acquisition: vacant:bool  frontage_min:number  owner_out_of_state:bool
 *              exclude_wetlands:bool  exclude_flood:bool
 *              land_locked:bool (false => exclude land-locked; default-on for pulls, set by caller)
 *              exclude_do_not_mail:bool  last_sale_from/last_sale_to:'YYYY-MM-DD'
 *
 * Returns { body, submittedMlsKeys, isMarketQuery }.
 * Throws if no location scope is provided.
 */
export function buildFilterRequest(p = {}) {
  const filters = [];
  const body = {};

  // ---- Location scope (top-level; one of fips/polygon/bbox required) ----
  const fips = Array.isArray(p.fips) ? p.fips.filter(Boolean).map(String) : (p.fips ? [String(p.fips)] : []);
  if (fips.length) body.fips = fips;
  if (p.polygon) body.geometry = { ...(body.geometry || {}), polygon: p.polygon };
  if (p.bbox) body.geometry = { ...(body.geometry || {}), bbox: p.bbox };
  // A single ZIP rides in the filters array; it does NOT satisfy the top-level
  // scope requirement, so it must be paired with fips/geometry.
  if (p.zip && !Array.isArray(p.zip)) filters.push(condition('situszip5', String(p.zip)));

  if (!body.fips && !body.geometry) {
    throw new Error('A location scope is required: fips[], polygon, or bbox.');
  }

  // ---- Size ----
  const acres = range('lotsizeacres', p.acres_min, p.acres_max);
  if (acres) filters.push(acres);

  // ---- Market / MLS ----
  const submittedMlsKeys = [];
  const mlsTypes = Array.isArray(p.mls_property_types) && p.mls_property_types.length
    ? p.mls_property_types.map(String) : null;
  const isMarketQuery = p.status === 'for_sale' || p.status === 'sold';

  if (p.status === 'for_sale') {
    // Window is OPTIONAL. With no days, LandPortal returns ALL currently-active
    // listings regardless of list date (matches its UI). Only send days when the
    // caller provides one, else we silently drop still-active older listings.
    const f = { key: 'mls_for_sale', operator: 'mls_condition', value: 'active' };
    if (isNum(p.listed_within_days)) f.days = Number(p.listed_within_days);
    filters.push(f);
    submittedMlsKeys.push('mls_for_sale');
  } else if (p.status === 'sold') {
    // Sold DOES need a window (there is no "all sold ever"); default 365 when unset.
    const f = { key: 'mls_sold', operator: 'mls_condition', value: 'sold' };
    f.days = isNum(p.sold_within_days) ? Number(p.sold_within_days) : 365;
    filters.push(f);
    submittedMlsKeys.push('mls_sold');
  } else if (p.status === 'off_market') {
    filters.push({ key: 'active_listing_toggle', operator: 'active_listing_toggle', value: 'exclude' });
    submittedMlsKeys.push('active_listing_toggle');
  }

  if (p.exclude_active_listings && p.status !== 'off_market') {
    filters.push({ key: 'active_listing_toggle', operator: 'active_listing_toggle', value: 'exclude' });
    submittedMlsKeys.push('active_listing_toggle');
  }

  const priceF = range('mls_price', p.price_min, p.price_max);
  if (priceF) { filters.push(priceF); submittedMlsKeys.push('mls_price'); }
  const ppaF = range('mls_priceperacre', p.ppa_min, p.ppa_max);
  if (ppaF) { filters.push(ppaF); submittedMlsKeys.push('mls_priceperacre'); }

  // Property type is an OPTIONAL narrowing filter. We do NOT force Land by
  // default: LandPortal's "For Sale" default is not restricted to the Land code
  // (it includes mobile-on-acreage etc.), and forcing code 8 silently drops real
  // matches. Only send mls_propertytype when the caller explicitly asks for it.
  if (mlsTypes) {
    filters.push(condition('mls_propertytype', mlsTypes));
    submittedMlsKeys.push('mls_propertytype');
  }

  // ---- Acquisition ----
  if (p.vacant === true) filters.push(boolean('vacant', true));
  if (isNum(p.frontage_min)) {
    const f = range('road_frontage', p.frontage_min, undefined);
    if (f) filters.push(f);
  }
  if (p.owner_out_of_state === true) filters.push(boolean('out_of_state', true));
  if (p.land_locked === false) filters.push(boolean('land_locked', false));
  else if (p.land_locked === true) filters.push(boolean('land_locked', true));
  if (p.exclude_do_not_mail === true) filters.push(boolean('do_not_mail', false));

  // Exclusions as coverage ceilings; include_nulls keeps parcels where the field
  // is null/missing (treated as "none"), which is what we want to keep.
  if (p.exclude_wetlands === true) {
    filters.push({ key: 'wetlands_cover_percentage', operator: 'range', comparison: 'is_between', include_nulls: true, value: { max: 0 } });
  }
  if (p.exclude_flood === true) {
    filters.push({ key: 'fema_cover_percentage', operator: 'range', comparison: 'is_between', include_nulls: true, value: { max: 0 } });
  }

  if (p.last_sale_from || p.last_sale_to) {
    const value = {};
    if (p.last_sale_from) value.min = p.last_sale_from;
    if (p.last_sale_to) value.max = p.last_sale_to;
    filters.push({ key: 'currentsalerecordingdate', operator: 'date', comparison: 'is_between', include_nulls: false, value });
  }

  body.filters = filters;
  return { body, submittedMlsKeys, isMarketQuery };
}

// Single-ZIP filter entry, for the caller's multi-ZIP fan-out.
export const zipToFilter = (zip) => condition('situszip5', String(zip));

// Given a filter response's meta, return OUR submitted MLS keys that were
// rejected. Non-empty => treat as MLS access denied (fatal).
export function rejectedMlsKeys(meta, submittedMlsKeys = []) {
  const rejected = (meta && Array.isArray(meta.rejected_filters)) ? meta.rejected_filters : [];
  const rejectedKeys = new Set(rejected.map((r) => (typeof r === 'string' ? r : r?.key)).filter(Boolean));
  return submittedMlsKeys.filter((k) => rejectedKeys.has(k));
}

// Stable cache-key input: canonical JSON of the sorted, cleaned params.
export function canonicalParams(p = {}) {
  const clean = {};
  for (const k of Object.keys(p).sort()) {
    const v = p[k];
    if (v === undefined || v === null || v === '') continue;
    clean[k] = Array.isArray(v) ? [...v].map(String).sort() : v;
  }
  return JSON.stringify(clean);
}
