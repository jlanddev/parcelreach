// Shared value-based-bidding compute, used by the live handler and the backfill.
// Pure calculation — no DB writes here.
import { fipsForCountyState, countyMedianPPA, stateMedianPPA } from '@/lib/landportal';

export const PROFIT_FLOOR = 15000; // must clear $15k gross profit or it's not a deal
export const BUY_RATIO = 0.5;      // we always buy at 50% of resale => profit = 50%

// Comp fallback ladder: exhaust real sold-comp data (county 2yr -> county 3yr ->
// state 3yr), median-based so outliers can't skew it, before any fallback value.
const T1_SOLD_DAYS = 730,  T1_MIN = 5; // county, 2yr, 5+ comps
const T2_SOLD_DAYS = 1095, T2_MIN = 3; // county, 3yr, 3+ comps
const T3_SOLD_DAYS = 1095, T3_MIN = 5; // state,  3yr, 5+ comps

// Anchors for the last rungs, set from the historical backfill (median of REAL-deal
// scores, excluding fallbacks). DISCOUNTED is for a confirmed thin resale market
// (comps too thin even at state level) — thin comps usually mean a thin market, so
// start at 60%. UNKNOWN is for a compute failure (no FIPS / error / timeout), which
// is NOT evidence of a thin market, so it looks average.
export const REAL_DEAL_MEDIAN = 84375;                               // median of real-deal scores, from the 1,198-lead backfill (2026-10-16)
export const DISCOUNT_RATIO = 0.6;
export const DISCOUNTED_FALLBACK = Math.round(REAL_DEAL_MEDIAN * DISCOUNT_RATIO);
export const UNKNOWN_FALLBACK = REAL_DEAL_MEDIAN;
export const FALLBACK_VALUE = UNKNOWN_FALLBACK; // back-comat for the handler's catch path

// "2-5 Acres" -> {min:2,max:5,rep:3.5}; "100+ Acres" -> {min:100,max:320,rep:100}
export function acreBand(acresStr) {
  const s = String(acresStr || '');
  const nums = (s.match(/\d+/g) || []).map(Number);
  if (!nums.length) return null;
  if (/\+/.test(s) || nums.length === 1) {
    const min = nums[0];
    return { min, max: Math.max(min * 3, min + 100), rep: min };
  }
  const [min, max] = [nums[0], nums[1]];
  return { min, max, rep: (min + max) / 2 };
}

// Walk the comp ladder; return the first rung with enough comps, else null.
async function resolvePPA(fips, band) {
  let r = await countyMedianPPA(fips, { acreMin: band.min, acreMax: band.max, soldDays: T1_SOLD_DAYS });
  if (r.medianPPA > 0 && r.N >= T1_MIN) return { ppa: r.medianPPA, comps: r.N, tier: 'county_2yr' };
  r = await countyMedianPPA(fips, { acreMin: band.min, acreMax: band.max, soldDays: T2_SOLD_DAYS });
  if (r.medianPPA > 0 && r.N >= T2_MIN) return { ppa: r.medianPPA, comps: r.N, tier: 'county_3yr' };
  const s = await stateMedianPPA(String(fips).slice(0, 2), { acreMin: band.min, acreMax: band.max, soldDays: T3_SOLD_DAYS });
  if (s.medianPPA > 0 && s.N >= T3_MIN) return { ppa: s.medianPPA, comps: s.N, tier: 'state_3yr' };
  return null;
}

// Compute the VBB value. Returns { value, fallback, reason, tier, ...breakdown }.
// tier: county_2yr | county_3yr | state_3yr (real) ; discounted | unknown | none (fallback/reject).
export async function computeVbbValue({ county, state, acres, isInherited }) {
  const inherited = /^(yes|true|1)$/i.test(String(isInherited ?? ''));
  const band = acreBand(acres);
  if (!band || band.min < 2) return { value: 0, fallback: false, reason: 'below_acre_floor', tier: 'none' };

  const fips = await fipsForCountyState(county, state);
  if (!fips) return { value: UNKNOWN_FALLBACK, fallback: true, reason: 'fips_unresolved', tier: 'unknown' };

  const resolved = await resolvePPA(fips, band);
  if (!resolved) {
    // Thin resale market everywhere we looked (county 2yr/3yr + state) -> discount.
    return { value: DISCOUNTED_FALLBACK, fallback: true, reason: 'thin_market', tier: 'discounted', fips };
  }

  const { ppa, comps, tier } = resolved;
  const resale = ppa * band.rep;
  const profit = resale * BUY_RATIO;
  const breakdown = { fips, ppa, resale: Math.round(resale), profit: Math.round(profit), comps, tier, inherited, floor: PROFIT_FLOOR };
  if (profit < PROFIT_FLOOR) return { value: 0, fallback: false, reason: 'under_profit_floor', ...breakdown };
  return { value: Math.round(profit * (inherited ? 2 : 1)), fallback: false, reason: 'ok', ...breakdown };
}
