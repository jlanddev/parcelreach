// Shared value-based-bidding compute, used by the live handler and the backfill.
// Pure calculation — no DB writes here. See /api/google-vbb-handler (live scoring)
// and /api/landportal/vbb-backfill (historical pre-warm + per-lead score logging).
import { fipsForCountyState, countyMedianPPA } from '@/lib/landportal';

export const PROFIT_FLOOR = 15000; // must clear $15k gross profit or it's not a deal
export const BUY_RATIO = 0.5;      // we always buy at 50% of resale => profit = 50%
export const MIN_COMPS = 5;        // fewer sold comps than this => too thin to trust

// Unknown-value fallback. Set to the MEDIAN of historical qualified VBB scores (from
// the backfill) so an unscoreable lead looks AVERAGE to Google, not worthless. Until
// the backfill computes it, this placeholder stands. Update here = handler + backfill.
export const FALLBACK_VALUE = 1;

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

// Compute the VBB value for a lead. Returns { value, fallback, reason, ...breakdown }.
// fallback=true means we couldn't score it and used FALLBACK_VALUE (logged so we can
// see how often it happens). value 0 is a DELIBERATE reject (below acre/profit floor),
// NOT a fallback.
export async function computeVbbValue({ county, state, acres, isInherited }) {
  const inherited = /^(yes|true|1)$/i.test(String(isInherited ?? ''));
  const band = acreBand(acres);
  if (!band || band.min < 2) return { value: 0, fallback: false, reason: 'below_acre_floor' };

  const fips = await fipsForCountyState(county, state);
  if (!fips) return { value: FALLBACK_VALUE, fallback: true, reason: 'fips_unresolved' };

  const { medianPPA: ppa, N } = await countyMedianPPA(fips, { acreMin: band.min, acreMax: band.max });
  if (!ppa || ppa <= 0) return { value: FALLBACK_VALUE, fallback: true, reason: 'no_comps', comps: N, fips };
  if (N < MIN_COMPS) return { value: FALLBACK_VALUE, fallback: true, reason: 'low_confidence_comps', comps: N, ppa, fips };

  const resale = ppa * band.rep;
  const profit = resale * BUY_RATIO;
  const breakdown = { fips, ppa, resale: Math.round(resale), profit: Math.round(profit), comps: N, inherited, floor: PROFIT_FLOOR };
  if (profit < PROFIT_FLOOR) return { value: 0, fallback: false, reason: 'under_profit_floor', ...breakdown };

  return { value: Math.round(profit * (inherited ? 2 : 1)), fallback: false, reason: 'ok', ...breakdown };
}
