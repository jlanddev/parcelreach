// Follow-up sequences, deal-direction tags, and offer formatting for the CRM.
//
// One "direction" field tells you which way a deal is going. Its options depend
// on where the lead sits: live offers get live labels, parked (Follow-Up) leads
// show their bucket. The four Follow-Up buckets each carry a drip sequence with
// the exact copy to send on each touch. We schedule only the NEXT touch; when
// it's done the next one is computed from these offsets.

// Direction tags for LIVE offers (the Offer Made bucket).
export const OFFER_DIRECTIONS = [
  { value: 'verbal_yes', label: 'Verbal yes', dot: 'bg-green-500', text: 'text-green-300' },
  { value: 'negotiating', label: 'Negotiating', dot: 'bg-blue-500', text: 'text-blue-300' },
  { value: 'reviewing', label: 'Reviewing', dot: 'bg-amber-500', text: 'text-amber-300' },
  { value: 'cooling', label: 'Cooling off', dot: 'bg-orange-500', text: 'text-orange-300' },
];

// Direction tags everywhere else (pre-offer stages).
export const GENERAL_DIRECTIONS = [
  { value: 'hot', label: 'Hot', dot: 'bg-green-500', text: 'text-green-300' },
  { value: 'working', label: 'Working', dot: 'bg-blue-500', text: 'text-blue-300' },
  { value: 'stalled', label: 'Stalled', dot: 'bg-amber-500', text: 'text-amber-300' },
  { value: 'long_shot', label: 'Long shot', dot: 'bg-slate-500', text: 'text-slate-300' },
];

// The four Follow-Up buckets and their drip sequences. `day` is days after the
// lead was parked. After the scripted steps, `tail` repeats indefinitely.
export const FOLLOWUP_BUCKETS = {
  price_gap: {
    label: 'Price gap',
    blurb: 'Offer rejected on the number. Hold the offer, drip, let time erode the anchor.',
    dot: 'bg-rose-500',
    text: 'text-rose-300',
    steps: [
      { day: 0, channel: 'note', script: `Acknowledge their number, do NOT counter. Say: "Understood, that's higher than the property works for us at today's numbers. I'll keep it in our pipeline and reach back out if anything changes on our end."` },
      { day: 14, channel: 'text', script: `Hey {first}, quick note, no ask. Land in {county} has stayed active lately and we're still buying in the area. Just keeping you on our radar if anything ever changes.` },
      { day: 45, channel: 'call', script: `Light re-engage. "Hey {first}, has anything changed on your end with the {county} land? We sometimes revisit deals when our buyer appetite shifts."` },
      { day: 90, channel: 'text', script: `Hey {first}, taking a fresh look at the land in {county}. We can do {offer} and close clean and fast, no commissions, no hassle. Worth a quick conversation?` },
    ],
    tail: { everyDays: 90, channel: 'text', script: `Hey {first}, checking back on the land in {county}. Still happy to close fast and clean at {offer} if the timing's better now. No pressure either way.` },
  },
  listing: {
    label: 'Listing it',
    blurb: 'Going to list with an agent or FSBO. Be the easy backup when it stalls or expires.',
    dot: 'bg-sky-500',
    text: 'text-sky-300',
    steps: [
      { day: 0, channel: 'note', script: `Plant the seed, no pressure. "Makes sense, listing can be the right move. If it works, great. If it stalls or you get tired of the showings and contingencies, we close fast with no commissions. I'll check back in."` },
      { day: 30, channel: 'text', script: `Hey {first}, how's the listing going on the {county} land? Any bites yet?` },
      { day: 60, channel: 'text', script: `Hey {first}, still thinking about you and the {county} land. If the listing's dragging, we close fast with zero commissions whenever you want a clean exit.` },
      { day: 90, channel: 'call', script: `Check in on the listing. "Any luck with the {county} listing? If it's run its course, we can close fast and net you a clean number with no fees."` },
      { day: 180, channel: 'text', script: `Hey {first}, did the listing on the {county} land run its course? If it expired or you're tired of waiting, we close fast with no commissions. Want to talk?` },
    ],
    tail: { everyDays: 90, channel: 'text', script: `Hey {first}, circling back on the {county} land. If you ever want a fast, clean close with no commissions, we're here. No rush.` },
  },
  other_offer: {
    label: 'Other offer',
    blurb: 'Has another offer / selling to someone else. Stay warm, catch the fallout.',
    dot: 'bg-violet-500',
    text: 'text-violet-300',
    steps: [
      { day: 0, channel: 'text', script: `Hey {first}, congrats, hope it closes smoothly. These things fall through more than people expect, so if anything slips on the {county} land, call me first and we'll move quick.` },
      { day: 21, channel: 'call', script: `Check if it closed. "Hey {first}, did everything go through alright on the {county} land?" If it fell apart, you're the warm, drama-free option, move to close. If it closed, mark Lost.` },
    ],
    tail: { everyDays: 120, channel: 'text', script: `Hey {first}, just keeping in touch. If that deal ever fell through, or you've got other land to move, we close fast and clean. We're here whenever.` },
  },
  needs_time: {
    label: 'Needs time',
    blurb: 'Needs time / talking to family / general stall. Stay top of mind, make it easy to say yes later.',
    dot: 'bg-teal-500',
    text: 'text-teal-300',
    steps: [
      { day: 3, channel: 'text', script: `Hey {first}, did you get a chance to talk it over? Happy to answer any questions you or the family have about the {county} land.` },
      { day: 10, channel: 'text', script: `Hey {first}, a lot of folks ask what they'd actually net. With us there are no commissions and we cover closing costs, so the number we agree on is basically what you walk away with. Happy to break it down.` },
      { day: 21, channel: 'text', script: `Hey {first}, still here whenever the timing's right on the {county} land. No rush on our end at all.` },
      { day: 45, channel: 'call', script: `Light human check-in. Reference something specific about their {county} property so it doesn't feel automated. "Just checking in, hope all's well. We're around whenever you're ready."` },
    ],
    tail: { everyDays: 30, channel: 'text', script: `Hey {first}, checking in on the land in {county}. Hope all's well with you and the family. We're here whenever you're ready, no pressure.` },
  },
};

export const FOLLOWUP_KEYS = Object.keys(FOLLOWUP_BUCKETS);

// Lost reasons (kept short).
export const LOST_REASONS = [
  { value: 'sold_elsewhere', label: 'Sold to someone else' },
  { value: 'price_walked', label: 'Price too far apart, walked' },
  { value: 'not_owner', label: 'Not the owner / bad info' },
  { value: 'refused', label: 'Refused, not selling' },
  { value: 'unreachable', label: 'Unreachable / ghosted' },
];

export function formatOffer(amount) {
  const n = Number(amount);
  if (!n || Number.isNaN(n)) return 'our offer';
  if (n >= 1000) {
    const k = n / 1000;
    return `$${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `$${n.toLocaleString()}`;
}

// Fill {first} {county} {offer} {rep} in a script from the lead.
export function mergeScript(text, lead, repName) {
  const first = (lead?.name || lead?.full_name || lead?.owner_name || 'there').trim().split(/\s+/)[0];
  const county = lead?.property_county || lead?.county || lead?.form_data?.propertyCounty || lead?.form_data?.county || 'your area';
  const offer = lead?.offer_amount ? formatOffer(lead.offer_amount) : 'our offer';
  const rep = (repName || '').trim().split(/\s+/)[0] || 'the team';
  return (text || '')
    .replace(/\{first\}/g, first)
    .replace(/\{county\}/g, county)
    .replace(/\{offer\}/g, offer)
    .replace(/\{rep\}/g, rep);
}

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

// The touch for a given step (returns null if the bucket is unknown).
export function touchForStep(bucketKey, step, startedAt) {
  const bucket = FOLLOWUP_BUCKETS[bucketKey];
  if (!bucket) return null;
  const start = startedAt ? new Date(startedAt) : new Date();
  if (step < bucket.steps.length) {
    const s = bucket.steps[step];
    return { at: addDays(start, s.day), channel: s.channel, script: s.script, isTail: false };
  }
  // Tail: repeats every N days from now.
  return { at: addDays(new Date(), bucket.tail.everyDays), channel: bucket.tail.channel, script: bucket.tail.script, isTail: true };
}

// When you park a lead: step 0, next touch = its day-0 (or first) offset from now.
export function firstTouch(bucketKey, startedAt) {
  return touchForStep(bucketKey, 0, startedAt);
}
