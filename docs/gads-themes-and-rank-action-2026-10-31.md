# Theme-level rank analysis + the one action to run first (read-only)

**Campaign:** Haven Search/Conv  Trial 220 (22464770148) · **Window:** LAST_30_DAYS · **Source:** Google Ads API v23. Nothing changed.
**Note on data:** keyword-level impression-share *is* available from the API, so the per-theme IS / rank-loss below is real (impression-weighted), not a proxy. The QS-component weakness is spend-weighted. Themes assigned by keyword text (priority: inherited → how-to/by-owner → state/location → we-buy/land-buyers → cash/sell-fast → sell-general).

---

## A. Per-theme performance
| Theme | Kw | Impr | Clicks | Spend | Leads | $/lead | wAvg QS | IS | Lost→Rank | **Est. impr lost to rank/mo** |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| we-buy / land-buyers | 16 | 10,027 | 631 | $6,414 | 60.9 | $105 | **8.0** | 23% | 77% | **~33,200** |
| sell (general) | 18 | 4,886 | 286 | $2,834 | 28.5 | $100 | 6.5 | 17% | 83% | **~23,600** |
| state / location | 186 | 2,235 | 148 | $1,659 | 12.5 | $133 | 6.3 | 38% | 62% | ~3,600 |
| cash / sell-fast | 12 | 470 | 32 | $464 | 5.0 | $93 | 8.3 | 35% | 65% | ~900 |
| by-owner / how-to | 73 | 783 | 47 | $472 | 6.0 | $79 | **4.3** | 36% | 64% | ~1,400 |
| other | 2 | 0 | 0 | $0 | 0 | — | — | — | — | — |
| **Total** | **307** | **18,401** | **1,144** | **$11,844** | **112.9** | **$105** | | **19.9%** | **80.1%** | **~62,700** |

**The money is in two themes.** we-buy/land-buyers + sell-general = 72% of spend, 79% of leads, and **~91% of all impressions lost to Ad Rank**. State/location looks like a lot of keywords (186) but it's thin: 13% of impressions, 11% of leads, and the worst $/lead ($133). The 50-state expansion is bloat.

## B. Quality Score weakness by theme (spend behind each below-average part)
| Theme | Spend | exp CTR below | **ad rel below** | LP below | LP "not above" (ceiling) |
|---|--:|--:|--:|--:|--:|
| we-buy / land-buyers | $6,414 | 0% | **0%** | 0% | 97% |
| sell (general) | $2,834 | 0% | **53%** | 0% | 49% |
| state / location | $1,659 | 3% | **38%** | 0% | 88% |
| cash / sell-fast | $464 | 0% | **35%** | 0% | 37% |
| by-owner / how-to | $472 | 64% | **82%** | 0% | 87% |
| **Account-wide** | $11,844 | **$343 (3%)** | **$2,704 (23%)** | **$8 (0%)** | **$9,634 (81%)** |

### The single component costing the most
**Ad relevance.** $2,704 of spend (23%) sits on keywords where ad relevance is *below average*; expected CTR below is only 3%, and landing-page is almost never *below* (0%). **But read it carefully:**
- Ad relevance is the biggest **fixable below-average** problem — and it's concentrated in **sell-general ($2,834 @ 53% below)** and **state/location ($1,659 @ 38% below)**. One generic ad can't be relevant to those themes.
- Landing page is the biggest **ceiling**: "average" on **81% of spend**, almost never "above." It caps QS everywhere (including the otherwise-perfect we-buy theme) — but it's a site/UX fix, and UI is frozen for the designer.
- we-buy/land-buyers ($6,414, the biggest pool) is **already strong on relevance (QS 8, 0% below)** — its rank loss is **not** a relevance problem. It's gated by **expected CTR** (the current ad has *every headline pinned*, which throttles CTR) and the LP ceiling.

## C. Where the generic ad matches worst (lowest relevance × highest spend)
Ranked by "wasted relevance" = spend × share below-average on ad relevance:
1. **sell (general)** — $2,834 × 53% = **~$1,500** of spend on below-relevance. Highest.
2. **state / location** — $1,659 × 38% = ~$630.
3. by-owner/how-to — $472 × 82% = ~$387 (tiny spend, worst QS 4.3).
4. cash/sell-fast — $464 × 35% = ~$162.
5. we-buy/land-buyers — **$0** (relevance already above-average).

So the generic inherited/tax-pinned ad matches **sell-general** and **state** worst. we-buy it matches *well*.

## D. Estimated rank win-back per proposed action (with reasoning)
Baseline: ~62,700 impr/mo lost to rank; CTR ~6.2%; lead rate ~9.9%; $105/lead. Budget has headroom (spending ~$395/day vs $500 cap, 0% IS lost to budget). Estimates are directional.

| Action | Est. rank win-back | Reasoning from our data | Risk to lead flow |
|---|---|---|---|
| **New RSA (unpinned, Good/Excellent)** | **~8–15% of the CTR-gated pool (~5,000–8,000 impr/mo)**; and QS/CTR lift → **~5–12% lower cost/lead** on we-buy + sell | The biggest lost-rank pool (we-buy, 33k) is gated by **expected CTR**, which the current *all-headlines-pinned* ad suppresses. An unpinned 15-headline RSA lets Google optimize combinations → higher CTR → higher Ad Rank → lower CPC within budget. Hits the two themes that are 91% of lost rank. | **None** — additive; originals untouched; no keyword/structure change |
| **Full asset set (sitelinks/callouts/snippets/call/images)** | ~5–10% broad (~3,000–6,000 impr/mo) | Assets are a direct Ad Rank input + more SERP space; you have none live (no sitelinks/call, snippets paused, images not serving). Lifts CTR account-wide. | Very low — additive |
| **Themed ad groups (experiment)** | ~15–25% of sell-general + state lost rank (~4,000–7,000 impr/mo) | Directly fixes the **ad-relevance** deficit (the costliest below-average component) where it lives — sell-general (53% below) and state (38% below). Highest *relevance* ceiling. | **Medium** — a 50/50 experiment halves control traffic during the test |
| **Text Customization (experiment)** | ~1–3% (~500–1,000 impr/mo) | Only helps state/location relevance; that theme is just 12% of impressions. Small pool. | Medium |
| **Clean up 250 zero-impression keywords** | **~0 direct** | They have **0 impressions**, so removing them recovers no impressions directly. Benefit is indirect: a tighter ad group improves thematic coherence and makes the themed restructure cleaner. It's an **enabler**, not a rank win by itself. | Low (but ~0 benefit alone) |
| **Landing-page experience** | **Highest ceiling: ~15–25% (~10,000–18,000 impr/mo)** | LP is "average" on **81% of spend** and caps QS on *every* theme, including the maxed-out we-buy pool. Moving LP avg→above is the only lever that lifts the biggest pool further. | **Blocked now** (UI frozen for designer) + slow to show |

## E. Recommendation — the most Ad Rank for the least risk

### ▶ Run a new Responsive Search Ad (unpinned, Good/Excellent) in the existing ad group. First. Alone.

**Why this one:** The single biggest pool of lost rank is **we-buy/land-buyers (~33,200 impr/mo, 53% of all lost rank)**, and its constraint is **expected CTR**, not relevance — caused by the current ad having *every headline pinned*. A fresh, unpinned RSA is the **only** action that attacks that pool, and it does so **additively**: originals stay untouched, no keyword or structure change, no experiment splitting traffic. That's maximum rank recovery at **zero risk to the current ~113 leads/month**. Themed ad groups have a higher *relevance* ceiling but touch structure and split traffic (medium risk) — do that **second**, once this low-risk ad proves the voice. Landing-page is the true highest ceiling but is blocked by the UI freeze.

**Where it goes:** existing campaign 22464770148 → existing "Ad group 1" (keeps current keywords). No new ad groups or keywords are created by this action (so there are none to draft) — it's one new ad added alongside the two live ones.

### Full draft — new RSA (honest land-expert voice, no hype)

**Pinning:** pin **nothing** to let Ad Strength reach Excellent (recommended). If you want one brand anchor, pin only **"We Buy Land Direct"** to Headline position 1 — nothing else.

**Headlines (15 — all ≤30 chars):**
```
We Buy Land Direct
Talk to a Real Land Buyer
Sell Your Land, No Pressure
Sell Land Without the Hassle
Inherited Land? We Can Help
Owe Taxes on Vacant Land?
We Handle the Whole Closing
No Realtor Fees or Commissions
A Fair Offer, Explained
Know What Your Land Is Worth
Land Experts Who Listen
Close On Your Timeline
Straightforward Land Sales
Cash Offer, No Obligation
We Make Selling Land Simple
```

**Descriptions (4 — all ≤90 chars):**
```
We're land specialists. We'll walk you through a fair, no-obligation offer — your call.
Inherited, taxed, or just ready to move on? We handle title, closing, and paperwork.
No agents, no commissions, no pressure. Sell direct to people who know land.
Tell us about your land and we'll explain what it's worth and how a sale works.
```

**Display paths (optional):** `/Sell-Your-Land` · `/Fair-Offer`
**Final URL:** your current /sell-your-land landing page.

**Why these specifically (from the data):**
- Covers the **we-buy/land-buyers** intent (biggest spend, already-strong relevance) with "We Buy Land Direct", "Talk to a Real Land Buyer", "Cash Offer, No Obligation" — so relevance holds on the top theme while CTR is freed up.
- Carries the **best-converting message** (inherited / taxes / we-handle-the-closing — the ~$97 CPA angle) without pinning it, so Google can pair it with the matching query.
- Serves **sell-general** terms with "Sell Your Land, No Pressure", "Sell Land Without the Hassle", "We Make Selling Land Simple" — lifting relevance there vs the current ad.
- Voice is honest-expert throughout: no "cash in 7 days", no "#1 buyer" claim, no urgency gimmicks.

### How we'll judge it (not clicks)
- **Primary:** cost per good lead (spend ÷ reviewed-qualified leads) for the new ad vs the two originals, and the campaign's Search IS / rank-lost trend.
- **Secondary:** Ad Strength (target Good/Excellent), CTR, and expected-CTR/ad-relevance labels moving up.
- **Run:** 3–4 weeks (let it exit "Learning" and accumulate ~30+ leads before judging).
- **Guardrail:** if the new ad underperforms the originals on cost/good-lead after the window, pause just the new ad — originals never changed, so lead flow is protected throughout.

*On your go, I'll prepare this exact ad and show you the final build before anything is added to Google. Nothing applied yet.*
