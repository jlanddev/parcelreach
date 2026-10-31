# Haven Search/Conv Trial 220 — review + test proposals (read-only)

**Account:** 2875216984 · **Campaign:** "Haven Search/Conv  Trial 220" (id 22464770148, the only ENABLED campaign) · **Window:** LAST_30_DAYS unless noted · **Source:** Google Ads API v23.
**Nothing was changed.** All proposals are drafts awaiting your approval.

---

# PART 1 — REVIEW

## Headline numbers (cross-check these against your UI)
| | |
|---|---|
| Clicks | 1,144 |
| Cost | **$11,843.83** |
| Conversions (all Qualified_Lead) | 112.9 |
| Conversion value | **$113** |
| Cost per Qualified_Lead | ~$105 |
| Search Impression Share | **19.9%** |
| IS lost to **Ad Rank** | **80.1%** |
| IS lost to **budget** | **0.0%** |
| Bid strategy | Maximize Conversions (no tCPA / tROAS) |
| Daily budget | $500 |

### The single most important finding
**You lose 80% of available impressions to Ad Rank and 0% to budget.** More budget does almost nothing right now — you're only showing on 1 in 5 eligible searches because of rank (Quality Score × bid × assets). **Every high-value lever here is rank-related: ad relevance, Ad Strength, and assets.** That reframes the whole plan.

### Doubling check (you asked to verify before touching GA4)
- Google Ads Qualified_Lead (30d): **112.9** · Your CRM website-form leads (30d): **124**.
- 112.9 ≈ 91% of real leads — **NOT doubled.** Google Ads counts one conversion per click even though the GA4 event fires twice.
- **Conclusion:** the GA4 double-fire inflates GA4 reports only; it is **not** corrupting the Ads bidding signal. So the GA4 fix is reporting hygiene, not urgent. (Reviewed Lead = 8 and Contract Signed = 2 are tracked as *secondary* — they show in "all conv" but not in the bidding "conversions," and both carry $0 value — that's the value pipeline still not flowing.)

## Quality Score (active keywords, by spend)
Landing page experience is **"average" on essentially every money keyword, never "above"** — a QS ceiling across the board (the /sell-your-land experience). Below-average **ad relevance** shows up wherever the generic ad meets a specific theme:

| Keyword | Match | QS | exp CTR | ad rel | LP | Clicks | Cost | Conv |
|---|---|---|---|---|---|---|---|---|
| land buyers | BROAD | 8 | above | above | avg | 526 | $5,229 | **50.5** |
| sell property online | BROAD | 6 | avg | **BELOW** | above | 146 | $1,363 | 16.5 |
| selling land | EXACT | 7 | avg | above | avg | 33 | $416 | 2 |
| how to sell land by owner | EXACT | **3** | **BELOW** | **BELOW** | avg | 16 | $136 | 2 |
| land developers near me | EXACT | 5 | avg | **BELOW** | avg | 12 | $122 | 0 |
| sell land California | EXACT | 5 | avg | **BELOW** | avg | 9 | $179 | 1 |

- **"land buyers" (broad) is the workhorse** — 50.5 of 112.9 conversions and ~44% of spend, QS 8. This broad keyword + the inherited/tax ad is what's carrying the account.
- **Ad relevance is the fixable weak part** (LP is harder — UI is off-limits for now). Many state and "how to sell land in X" keywords are BELOW on ad relevance because one generic ad serves every theme.
- **307 enabled keywords, but ~250 have 0 impressions** (a 50-state "sell land in [State]" / "land buyers in [State]" expansion). This bloat dilutes the ad group's theme and drags ad relevance.

## Ads (4 total — 2 enabled, 2 paused)
| Ad | Status | Strength | Clicks | Cost | Conv | ~CPA |
|---|---|---|---|---|---|---|
| 779406220487 (inherited/taxes/closing) | ENABLED | **Average** | 796 | $8,588 | **88.9** | ~$97 |
| 802511265243 ("We Buy Land", 3 HL) | ENABLED | **Poor** | 348 | $3,255 | 24.0 | ~$136 |
| 747782993514 (5+ acre cash) | Paused | Poor | — | — | — | — |
| 802628739962 (offer today) | Paused | Poor | — | — | — | — |

**What works best:** the **inherited-land / too-many-taxes / we-handle-the-closing** angle (ad 779406220487) converts at ~$97 vs ~$136 for the generic "We Buy Land / cash" ad. Sellers respond to *"we'll take this problem off your hands and handle everything,"* not to urgency.

**Why Ad Strength is stuck at Average/Poor:**
- The workhorse ad has **every headline pinned** to H1/H2/H3. Pinning everything blocks Google from testing combinations — which is also why **per-headline performance labels all come back "not applicable"** (there's no combination test to grade). It caps strength at Average and hides which messages win.
- The Poor ad has only **3 headlines / 2 descriptions** (and a typo: *"cash for you land"*).

## Assets — what's there, what's missing
| Asset | Status |
|---|---|
| Sitelinks | **MISSING** (none in the account) — the single biggest gap |
| Callouts | 3 enabled, generic: "Get In Touch", "Browse Properties", "Simple Process" ("Browse Properties" is buyer-facing, off-message for a seller campaign) |
| Structured snippets | **PAUSED** (not live) — "Highlights" header only |
| Call asset | **MISSING** |
| Images | Attached but **likely not serving** (see below) |
| Business logo | **32×32 px — too small** (needs ≥128×128; won't render) |

### Why your image assets aren't showing
There are ~35 image assets in the account (drone shots, parcel overlays, generated images). On the campaign, **3 square 1024×1024 `AD_IMAGE` assets are enabled**, but:
1. **Only 1:1 squares are enabled** — the **1.91:1 landscape** versions (4032×2110, etc.) are **REMOVED**. Search image assets generally need a landscape 1.91:1 present to serve; square-only limits or blocks serving.
2. **Low Ad Rank.** Image assets render in **top / absolute-top** positions. With **80% of impressions lost to rank**, your ads rarely reach those positions — so images rarely get the chance to show.
3. **Logo is 32×32** — below the minimum, so the logo slot likely stays empty.
4. I **could not read approval/review status via the API** (came back empty) — check Assets → Images → "Status" in the UI to rule out a pending/limited policy state. But (1)–(3) are concrete and sufficient to explain it.

## Structure & themes
- **One ad group** ("Ad group 1") holds all 307 keywords and all 4 ads — inherited, state, cash, and general intent are mixed together. That's the root cause of the below-average ad relevance: a single generic ad can't be relevant to every theme at once.
- Match types are mixed (broad + exact) in the same group with no theme separation.
- **Which themes bring leads:** general seller intent — **"land buyers," "sell land," "sell my land," "we buy land," "sell land for cash"** — carries the conversions. The **state** keywords and **"how to sell land in [State]"** terms spend thinly with weak relevance and few conversions. "Inherited/tax" lives in the ad copy, not the keywords, and it's the best-converting *message*.

---

# PART 2 — PROPOSALS (goal: +10–15% reviewed-lead value / lower cost per good lead)

Measured on **reviewed-lead value and cost per good lead**, not clicks. Run **one test at a time**. Every ad draft is in your honest-land-expert voice (no "cash in 7 days" hype) and builds on the inherited/taxes/we-handle-closing angle that already converts. **Nothing goes live until you approve the drafts.**

## Recommended order (impact vs risk)

### ✅ Test 1 — Full asset set (do this first) — *highest value, lowest risk*
**What:** Add a complete, approved asset set at the campaign level:
- **Sitelinks (4):** `How It Works` · `What We Buy` · `Our Process` · `About Haven Ground` (each with 2 descriptions).
- **Callouts (6, replace the generic ones):** `No Realtor Fees` · `We Handle Closing` · `No Pressure, Ever` · `Local Land Experts` · `Fair, Explained Offers` · `You Pick the Timeline`.
- **Structured snippets** (un-pause + add): Header *Service catalog* → `Inherited land, Vacant land, Rural acreage, Tax-burden sales, Title help`.
- **Call asset:** your tracked number.
- **Images:** enable a **1.91:1 landscape (1200×628+) AND 1:1 square (1200×1200)** pair from your drone/parcel library; replace the **logo with a ≥1200×1200** version.

**Why (data):** assets are a direct Ad Rank input and add SERP real estate; you currently have no sitelinks, no call, paused snippets, and non-serving images. Fixing this lifts CTR and rank, which is exactly where you're losing 80% of impressions.
**Expected impact:** +5–10% CTR and a measurable IS gain at the same budget → more leads at similar CPA. Reasoning: sitelinks alone typically add several points of CTR; combined with rank gains you recover some of the 80% lost IS without spending more.
**Run:** 2–3 weeks. **Judge:** CTR, Search IS, and cost per good lead vs the prior 30 days. **Goes in directly on your approval (no experiment needed) since it's additive.**

### ✅ Test 2 — New RSA alongside the originals — *high value, low risk*
**What:** Add a **third enabled RSA** (never edit/pause 779406220487 or 802511265243). **Pin at most one headline** (the brand/identity line), leave the rest unpinned so Google can test combinations → target **Ad Strength Good/Excellent**.

Draft headlines (≤30 chars, honest-expert voice):
```
Land Is All We Do
Talk to a Real Land Expert
Inherited Land? We Can Help
Owe Taxes on Vacant Land?
We Handle the Whole Closing
No Realtor Fees or Commissions
Sell Your Land, No Pressure
A Fair Offer, Explained
Know What Your Land Is Worth
Local Land Buyers, Real People
Close On Your Schedule
Straightforward Land Sales
We Buy Land Direct
Honest Offer, Your Timeline
No Games, No Pressure
```
Draft descriptions (≤90 chars):
```
We're land specialists. We'll walk you through a fair, no-obligation offer — your call.
Inherited, taxed, or ready to move on? We handle title, closing, and the paperwork.
No agents, no commissions, no pressure — sell direct to people who know land.
Tell us about your land; we'll explain what it's worth and how a sale would work.
```
Pin suggestion: pin **"Land Is All We Do"** to H1 only (identity), nothing else.
**Why (data):** your best ad is only *Average* because every headline is pinned; an unpinned, 15-headline RSA in the winning voice should reach Good/Excellent and lift CTR/QS.
**Expected impact:** +0.5–1.0 QS on the main keywords over time → better rank → more of the lost 80% IS recovered; CPA flat-to-down. **Run:** 3–4 weeks (let it exit "Learning"). **Judge:** conv and cost/good-lead of the new ad vs the two originals.

### ✅ Test 3 — Themed ad groups, as a Google Ads Experiment (50/50, original untouched) — *highest ceiling, medium risk*
**What:** A **campaign experiment** whose treatment splits keywords into themed ad groups, each with a matching RSA:
- **Inherited Land** (inherited, estate, probate, "too much land", taxes)
- **State / geo** (the "[State]" keywords — with Text Customization, see Test 4)
- **Sell My Land** (general seller intent: sell land, sell my land, sell vacant land)
- **Cash / Direct** (we buy land, cash for land, companies that buy land)

Each group gets an RSA written to its theme (e.g., Inherited group leads with "Inherited Land? We Can Help / We Handle the Whole Closing"). The original ad group runs as the 50% control.
**Why (data):** ad relevance is BELOW precisely where one generic ad meets a specific theme; theming is the direct fix and should raise QS → rank → unlock the 80% lost IS. This is the biggest structural lever.
**Expected impact:** the +10–15% target most plausibly comes from here — lifting ad relevance from BELOW/avg to above on the themed terms. **Run:** 4–6 weeks (needs volume to read). **Judge:** experiment arm vs control on reviewed-lead value and cost per good lead.
**Risk control:** it's a 50/50 experiment — the original is untouched and you can end it anytime.

### ◻️ Test 4 — Text Customization (ad customizers), its own Experiment — *medium value, medium risk*
**What:** Use location/keyword **ad customizers** so the state terms render the seller's state dynamically (e.g., "Sell Your {State} Land — No Fees"). Run as a separate experiment on the State theme.
**Why (data):** the "[State]" keywords are weak on ad relevance; dynamic insertion makes the ad literally match the query.
**Expected impact:** CTR lift on state terms; smaller overall since state terms are a minority of spend. **Run:** 4 weeks. **Judge:** CTR + cost/good-lead on the State theme. **Do after Test 3** so the themed structure exists to attach it to.

### ◻️ Supporting cleanups (fold into Test 3, not standalone)
- **Prune dead keywords:** ~250 zero-impression keywords dilute theme relevance — remove or quarantine them in the restructure.
- **Negatives (revised per your note — you buy in OK/AZ/FL, so NO state negatives):** only the clear wrong-intent/competitor terms: `land developers near me`, `property investors near me`, `landforcash com`. (I've retracted the geo tier from the earlier search-terms draft.)
- **Fix the typo** in the Poor ad ("cash for you land") — but since we never edit originals, this is handled by Test 2 replacing it in rotation.

### ◻️ Sequenced, not a test yet — bid strategy
You're on **Maximize Conversions**, which optimizes for lead *count*. Your goal is reviewed-lead *value*. Once the uploader's real deal values are flowing to Google (they're currently $0 in the account), switch to **Maximize Conversion Value** (or tROAS). **Don't switch yet** — it needs value data first. This is the eventual highest-leverage change for "reviewed lead value."

## One-line ranking
1. **Assets** (do now, direct-in) → 2. **New RSA** (low risk, fixes pinning) → 3. **Themed ad groups experiment** (biggest ceiling) → 4. **Text customization experiment** → then **bid strategy to Max Conv Value** once value data flows.

---
*All drafts above are for your review. On your go, I can prepare any approved item — and I will show you the exact changes before anything is applied to Google.*
