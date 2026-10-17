// Reviewed-value math — the human-reviewed deal value we send to Google as the
// offline-conversion value. PURE, no imports, so it's safe to use on the client
// (the CRM review panel) AND the server (recalc endpoint + hourly uploader). One
// source of truth so the number never drifts between where it's shown and sent.
//
// Reviewed Value = min(profit, $100k) × close-chance(lean) × resale-speed.
// profit = (reviewed worth − offer) when an offer is set, else worth × 50%.

export const VBB_PROFIT_CAP = 100000;

// Close chance by lean. Wide spread (2026-10-17): a Cold seller who laughed at the
// offer must NOT score near a Hot deal we just contracted. Editable defaults.
export const VBB_CLOSE_CHANCE = {
  ready: 0.40, // offer accepted
  hot: 0.10,
  warm: 0.03,
  cold: 0.005,
  '': 0.03,    // unleaned
};
export const VBB_RESALE_SPEED = { fast: 1.25, normal: 1.0, slow: 0.75, hard: 0.25 };
export const VBB_DEAD_STATUSES = ['DEAD', 'LOST', 'WE_PASSED'];

export const closeChance = (lean) =>
  VBB_CLOSE_CHANCE[String(lean || '').toLowerCase()] ?? VBB_CLOSE_CHANCE[''];
export const resaleSpeedMult = (speed) =>
  VBB_RESALE_SPEED[String(speed || 'normal').toLowerCase()] ?? 1;

// Human-reviewed profit: worth − offer if an offer is set, else half of worth.
export const reviewedProfit = ({ worth, offer }) => {
  const w = Math.max(0, Number(worth) || 0);
  const o = Number(offer) || 0;
  return o > 0 ? Math.max(0, w - o) : Math.round(w * 0.5);
};

export const reviewedValue = ({ profit, lean, speed, deadLost }) => {
  if (deadLost) return 0; // Dead / Lost leads are worth nothing to Google
  const p = Math.min(Math.max(Number(profit) || 0, 0), VBB_PROFIT_CAP);
  return Math.round(p * closeChance(lean) * resaleSpeedMult(speed));
};

// Recompute a stored review object's value from its own inputs plus the lead's
// CURRENT offer and stage. Honors a manual override. Returns { value, profit }.
export const recomputeReview = (review, { offer, deadLost } = {}) => {
  if (!review) return { value: 0, profit: 0 };
  const effOffer = offer != null ? offer : Number(review.offer) || 0;
  const profit = reviewedProfit({ worth: review.worth, offer: effOffer });
  const value = review.override != null
    ? Math.round(Number(review.override))
    : reviewedValue({ profit, lean: review.lean, speed: review.speed, deadLost: !!deadLost });
  return { value, profit };
};

// Contract-Signed value: needs a human-reviewed worth AND an offer. Returns the
// value, or null when it can't be computed (so the caller can flag it).
//   value = min(max(worth − offer, 0), $100k) × 75%
export const CONTRACT_RATIO = 0.75;
export const contractValue = (review) => {
  const worth = Number(review?.worth) || 0;
  const offer = Number(review?.offer) || 0;
  if (!(worth > 0)) return { value: null, reason: 'needs_review' }; // no human worth
  if (!(offer > 0)) return { value: null, reason: 'needs_offer' };  // no offer to profit against
  const profit = Math.min(Math.max(worth - offer, 0), VBB_PROFIT_CAP);
  return { value: Math.round(profit * CONTRACT_RATIO), reason: 'ok', profit };
};

// Display a close chance as a percent, keeping one decimal for sub-1% rates so
// Cold (0.5%) doesn't render as "1%" or "0%".
export const pctLabel = (cc) => {
  const p = (Number(cc) || 0) * 100;
  return (p > 0 && p < 1 ? p.toFixed(1) : String(Math.round(p))) + '%';
};
