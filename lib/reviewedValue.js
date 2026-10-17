// Reviewed-value math — the human-reviewed deal value we send to Google as offline
// conversions. PURE, no imports, so it's used on the client (CRM review panel) AND
// the server (recalc endpoint + hourly uploader). One source of truth.
//
// Value LADDER (2026-10-17): three conversions that add up to the real profit of a
// deal that goes all the way. profit = min(worth − offer, $100k).
//   Reviewed Lead  = profit × lean%
//   Contract Signed = profit × (75% − lean% at time of contract)
//   Closed Deal    = profit × 25%
// Sum for a closed deal = profit × (lean% + 75% − lean% + 25%) = profit × 100%.

export const VBB_PROFIT_CAP = 100000;

// Close chance by lean. Wide spread (2026-10-17): a seller who laughed at the offer
// must NOT score near a Hot deal we just contracted. "Rejected offer" is its own
// 0% lean, separate from Lost (a Lost lead leaves the pipeline; a Rejected one may
// still sit in it but is worth nothing to Google). Editable defaults.
export const VBB_CLOSE_CHANCE = {
  ready: 0.40,    // offer accepted
  hot: 0.10,
  warm: 0.03,
  cold: 0.005,
  rejected: 0,    // laughed at / rejected the offer
  '': 0.03,       // unleaned
};
export const VBB_DEAD_STATUSES = ['DEAD', 'LOST', 'WE_PASSED'];

export const CONTRACT_TOTAL = 0.75; // reviewed + contract together reach 75% of profit
export const CLOSED_SHARE = 0.25;   // closed adds the final 25%

export const closeChance = (lean) =>
  VBB_CLOSE_CHANCE[String(lean || '').toLowerCase()] ?? VBB_CLOSE_CHANCE[''];

// Human-reviewed profit for the REVIEWED stage: worth − offer if an offer is set,
// else half of worth (pre-offer estimate). Uncapped here; reviewedValue caps it.
export const reviewedProfit = ({ worth, offer }) => {
  const w = Math.max(0, Number(worth) || 0);
  const o = Number(offer) || 0;
  return o > 0 ? Math.max(0, w - o) : Math.round(w * 0.5);
};

// Realized profit for the CONTRACT / CLOSED stages: needs a real offer. Capped.
export const cappedProfit = ({ worth, offer }) =>
  Math.min(Math.max((Number(worth) || 0) - (Number(offer) || 0), 0), VBB_PROFIT_CAP);

export const reviewedValue = ({ profit, lean, deadLost }) => {
  if (deadLost) return 0; // Dead / Lost leads are worth nothing to Google
  const p = Math.min(Math.max(Number(profit) || 0, 0), VBB_PROFIT_CAP);
  return Math.round(p * closeChance(lean));
};

// Recompute a stored review's Reviewed-Lead value from its inputs + live offer/stage.
// Honors a manual override. Returns { value, profit }.
export const recomputeReview = (review, { offer, deadLost } = {}) => {
  if (!review) return { value: 0, profit: 0 };
  const effOffer = offer != null ? offer : Number(review.offer) || 0;
  const profit = reviewedProfit({ worth: review.worth, offer: effOffer });
  const value = review.override != null
    ? Math.round(Number(review.override))
    : reviewedValue({ profit, lean: review.lean, deadLost: !!deadLost });
  return { value, profit };
};

// Contract-Signed value: the profit between the lean% already credited at review and
// 75%. Needs a human-reviewed worth AND an offer. leanAtContract = the lean captured
// when the deal became a contract (falls back to the review's current lean).
export const contractValue = (review, { leanAtContract } = {}) => {
  const worth = Number(review?.worth) || 0;
  const offer = Number(review?.offer) || 0;
  if (!(worth > 0)) return { value: null, reason: 'needs_review' };
  if (!(offer > 0)) return { value: null, reason: 'needs_offer' };
  const profit = cappedProfit({ worth, offer });
  const leanPct = closeChance(leanAtContract != null ? leanAtContract : review.lean);
  const share = Math.max(0, CONTRACT_TOTAL - leanPct);
  return { value: Math.round(profit * share), reason: 'ok', profit, share };
};

// Closed-Deal value: the final 25% of profit. Needs a human-reviewed worth + offer.
export const closedValue = (review) => {
  const worth = Number(review?.worth) || 0;
  const offer = Number(review?.offer) || 0;
  if (!(worth > 0)) return { value: null, reason: 'needs_review' };
  if (!(offer > 0)) return { value: null, reason: 'needs_offer' };
  const profit = cappedProfit({ worth, offer });
  return { value: Math.round(profit * CLOSED_SHARE), reason: 'ok', profit };
};

// Display a close chance as a percent, keeping one decimal for sub-1% rates so Cold
// (0.5%) doesn't render as "1%" or "0%".
export const pctLabel = (cc) => {
  const p = (Number(cc) || 0) * 100;
  return (p > 0 && p < 1 ? p.toFixed(1) : String(Math.round(p))) + '%';
};
