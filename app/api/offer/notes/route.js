import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveOffer } from '@/lib/offerTemplate';

export const runtime = 'nodejs';

// Produces the seller-facing "Notes on this Offer" section for the offer PDF.
// Two modes, mirroring the partner-summary flow:
//   POLISH  - Jordan typed his own take in the summary box. We turn it into a
//             clean, seller-facing note. His take may include internal thoughts
//             (what he does NOT like, negotiation angle); those never appear in
//             the note. We keep only what is appropriate to show a seller.
//   COMPILE - the box is blank. We write the note from the offer facts alone
//             (all cash, speed, respect for the family), the standard strong
//             cash-offer framing.
// Always three short paragraphs, seller-facing, no em dashes.

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    const { leadId, draft, terms } = await request.json();
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

    const supabase = supabaseAdmin();
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    // Fold any unsaved edits from the open modal in before resolving facts.
    const merged = { ...lead, offer_terms: { ...(lead.offer_terms || {}), ...(terms || {}) } };
    const o = resolveOffer(merged);

    const money = (n) => (Number(n) > 0 ? '$' + Math.round(Number(n)).toLocaleString('en-US') : '');
    const facts = [
      o.namesOnDeed ? `Sellers on deed: ${o.namesOnDeed}` : '',
      o.countyState ? `Location: ${o.countyState}` : '',
      o.apn ? `Parcel: ${o.apn}` : '',
      o.gisAcres ? `Size: about ${o.gisAcres} GIS acres${o.deededAcres ? `, ${o.deededAcres} deeded` : ''}` : '',
      o.price ? `Our offer: ${money(o.price)} all cash${o.perAcre ? ` (${money(o.perAcre)} per acre)` : ''}` : '',
      `Earnest money: ${money(o.earnest)}, deposited ${o.depositDays} business days after signing`,
      `Closing: on or before ${o.closingDays} days from execution`,
      `Survey: ${o.survey}`,
      `Title and escrow: ${o.titleEscrow}`,
      merged.form_data?.whySelling ? `Why the seller is selling (intake): ${merged.form_data.whySelling}` : '',
    ].filter(Boolean).join('\n');

    const typed = typeof draft === 'string' ? draft.trim() : '';
    const isPolish = typed.length > 0;

    const system = `You write the "Notes on this Offer" section of a land buyer's offer summary document. This note is read by the SELLER (and their family). It appears on a polished, respectful cash-offer PDF from ${o.buyerEntity}.

Write exactly THREE short paragraphs, each beginning with a short lead phrase followed by a period, in this order and spirit:
1. "All cash." The certainty of the offer: no lender, no loan approval, no financing contingency, proof of funds on request, nothing between contract and closing except title work.
2. "Speed." How fast and easy the close is: on or before ${o.closingDays} days, flexible to move sooner, and the survey handling (${o.survey}).
3. "Next step." A warm, non-binding close: this is a good-faith expression of interest with respect for the seller / family, and on acceptance the buyer executes a standard ${o.state || 'state'} purchase agreement and delivers earnest money to the title company.

TONE: calm, confident, respectful, plain. Like a serious buyer who wants to make this easy, not a salesman. No hype, no pressure, no adjectives like "amazing" or "incredible."

HARD RULES:
- This is SELLER-FACING. Never state anything negative about the property, the price, the title, the family, or your own reservations. If the input mentions downsides, concerns, what you do NOT like, or your negotiation strategy, DO NOT put any of it in the note. Use it only to understand the deal, never to write.
- Use only the offer facts given and (in polish mode) the positive, seller-appropriate substance of Jordan's take. Do not invent numbers, dates, names, or terms not in the facts.
- NEVER use em dashes or en dashes. Use commas, periods, or parentheses. Hard rule.
- Output ONLY the three paragraphs, separated by a single blank line. No preamble, no "Here is", no headings, no quotes.`;

    const user = isPolish
      ? `OFFER FACTS:\n${facts}\n\nJORDAN'S TAKE (his rough thoughts; keep only what is positive and appropriate to show the seller, drop anything negative or strategic):\n${typed}\n\nWrite the three-paragraph seller-facing Notes on this Offer now.`
      : `OFFER FACTS:\n${facts}\n\nThe summary box was left blank. Write the standard three-paragraph seller-facing Notes on this Offer from the facts above.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 700, temperature: 0.2, system, messages: [{ role: 'user', content: user }] }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error?.message || 'AI error' }, { status: 502 });

    let notes = (data.content?.[0]?.text || '').trim().replace(/\s*[—–]\s*/g, ', ').replace(/^["']|["']$/g, '').trim();
    if (!notes) return NextResponse.json({ error: 'Could not generate notes' }, { status: 502 });

    return NextResponse.json({ ok: true, notes, mode: isPolish ? 'polish' : 'compile' });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
