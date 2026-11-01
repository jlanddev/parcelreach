# Ad handoff — revised RSA + themed page copy + 180-day market data (review only)

**Hard rule honored:** additions only. Nothing here is live; nothing edits, pauses, removes, or reorders anything in "Haven Search/Conv  Trial 220" (ads, groups, keywords, settings, bids, budget, goals). Each approved item gets a Change-history screenshot showing only that change.

**Core message (leads the ad + the pages):** people sell to you to **skip the 6–12 months a listing takes, avoid a realtor, and get a sure closing they know will happen.** Every claim below is written to be something you actually deliver — flag any that isn't and I'll cut it.

---

## 1) New RSA — revised draft (unpinned, review only)

Still unpinned (so Ad Strength can reach Excellent). Leads with the skip-the-market / no-listing / sure-closing pitch, adds the **2+ acre qualifier** (keeps the wrong people from clicking) and **out-of-state owner** lines. Note: these say the *owner* can be out of state — Google never uses the searcher's location as the land's state, so a Texan who owns Pennsylvania land still fits.

**15 headlines (all ≤30 characters, verified):**
```
Skip 6–12 Months on Market
No Listing. No Realtor.
A Closing You Can Count On
Sell Without Listing Your Land
We Buy 2+ Acres
Land Parcels 2 Acres & Up
Own Land in Another State?
Inherited Land Out of State?
We Buy Land Nationwide
We Handle the Whole Closing
No Realtor Fees or Commissions
A Fair Offer, Explained
Inherited Land? We Can Help
Owe Taxes on Vacant Land?
We Buy Land Direct
```

**4 descriptions (all ≤90 characters, verified):**
```
Skip 6–12 months on the market. No realtor, no listing. A closing you can count on.
We buy land 2+ acres and you can live anywhere — out-of-state and inherited are fine.
No agents, no commissions, no pressure. Sell direct to people who know land.
Tell us about your land and we'll explain what it's worth and how a sale works.
```

**8 callouts (all ≤25, verified):**
```
No Listing, No Realtor
Skip Months on Market
Closing You Can Count On
We Buy 2+ Acres
Out-of-State Owners OK
No Realtor Fees
We Handle Closing
No Pressure, Ever
```

**Structured snippet** — Header: **Service catalog** → `Inherited land sales` · `Back-tax land` · `Out-of-state owners` · `Vacant & rural acreage` · `Direct cash offers`

**Two claims to confirm before it goes live:**
- **"We Buy Land Nationwide"** — keep only if you truly buy in all 50 states. If it's "most states," I'll swap to a safer line.
- Dropped **"We Close When We Say We Will"** (you flagged it as conditional) — **"A Closing You Can Count On"** carries the same promise more safely. Say the word if closings are reliably on-date and I'll add the stronger version.

---

## 2) Themed landing page copy — draft only (do NOT deploy)

Three **new** pages, each using the **same Sell Your Land form component + the same `/thank-you`** (Qualified_Lead). **Do not touch `/sell-your-land`.** Keep only the **Facebook pixel + the existing Google tags (GTM/GA4)** on these pages — drop Clarity/Hyros/Attrios/Bing for speed. Each mentions **2+ acres** and that the **owner can live anywhere**.

### a) Inherited Land — `/lp/inherited-land`
- **H1:** Inherited Land You Don't Want to Keep?
- **Sub:** Skip the 6–12 months a listing takes — no realtor, no showings, just a fair offer and a closing you can count on. We buy land 2+ acres, and you can live anywhere.
- **Points:** We handle multiple heirs, title & probate paperwork · Behind on taxes? We can still help · A fair offer, clearly explained · You pick the closing date
- Form → `/thank-you`.

### b) Back Taxes — `/lp/back-taxes`
- **H1:** Behind on Taxes for Land You Don't Use?
- **Sub:** Stop paying taxes on vacant land you're not using. No listing, no realtor, no 6–12 month wait — a fair offer and a sure closing. We buy parcels 2+ acres; owners anywhere.
- **Points:** Owe back taxes? We can still make an offer · We handle the title and closing · No fees or commissions · Close on your timeline
- Form → `/thank-you`.

### c) How We Price Land — `/lp/how-we-price-land`
- **H1:** How We Price Your Land
- **Sub:** No guesswork, no pressure. We look at your parcel, explain what we can pay and why, and give you a fair offer you can actually understand — then a closing you can count on. 2+ acres, owners anywhere.
- **Points:** We research comparable land sales · We factor acreage, access, and use · We explain the number, we don't just quote it · No listing, no realtor, no 6–12 month wait
- Form → `/thank-you`.

*(Sitelinks for these stay on HOLD until each page is live and verified: form submits, Qualified_Lead fires once, click ID saved.)*

---

## 3) Market data — last 180 days, by state & county (read-only)

**Scope:** website-form leads (the ad-driven ones), 2026-05-04 → 2026-10-31. **Deal value = sum of the reviewed "worth" on contracted leads** — so it's **understated** where a contract wasn't given a reviewed worth (several states show contracts with $0 because worth wasn't recorded). Treat recorded value as the floor.

**Where the money actually is (states with proven deal value):**
| State | Leads | Reviewed | Contracts | Deal value (floor) |
|---|--:|--:|--:|--:|
| **Texas** | 67 | 3 | 2 | **$400,000** |
| **California** | 73 | 6 | 8 | **$340,000** |
| **Alabama** | 31 | 2 | 3 | **$290,000** |
| **Oklahoma** | 30 | 2 | 3 | **$200,000** |
| **Washington** | 13 | 1 | 1 | **$200,000** |
| **Michigan** | 9 | 1 | 1 | **$180,000** |
| North Carolina | 27 | 2 | 1 | $100,000 |
| Colorado | 39 | 2 | 1 | $60,000 |
| Missouri | 24 | 2 | 1 | $35,000 |

**High volume, no proven value yet (watch — may be low-value land or just unworked):**
Arizona (49 leads, $0), Georgia (34, $0), Kentucky (28, $0), Arkansas (28, $0), Florida (25, $0), Tennessee (25, $0), Virginia (24, $0), South Carolina (22, 2 contracts/$0), Mississippi (19, 4 contracts/$0). Total 793 website leads across all states.

**Top counties by leads:** San Bernardino CA (20 leads, 1 contract, $50k) · Costilla CO (18, 0 — cheap CO land) · Mohave AZ (12, 0) · Los Angeles CA (8) · Riverside CA (7, 2 contracts, $90k) · Butte CA (4, 1 contract, $100k) · Apache AZ (7, 1) · Kern CA (7) · Hudspeth TX (7).

**Read for planning:** value concentrates in **TX, CA, AL, OK, WA, MI**. **Arizona and the Costilla/Mohave-type counties pull lots of cheap-land leads with little proven value** — likely where to tighten, not double down. **California and Riverside/Butte** convert at real value. Before shifting spend, the honest next step is to confirm these with the Ads **spend-by-location** numbers.

**Note:** the Ads **spend/clicks by state** query hit repeated API field errors (the geographic segment wasn't accepted with these fields). That one slice is cleanest from the Ads UI **Locations** report (or I can keep iterating the API query) — tell me which and I'll get it. Everything above is from your own CRM data.

---

## 4) "Dispo lead form" (answered earlier, recap)
`WEBPAGE_CODELESS`, category `SUBMIT_LEAD_FORM`, primary-for-goal but **not in the Conversions metric** → Google auto-created it; it does **not** drive the seller campaign's bidding. Tidy via UI: set Trial 220 to campaign-specific goals (Qualified_Lead only), then demote Dispo to Secondary. Not urgent.

## 5) Images
Sending alongside this doc: a few **real drone land photos** (Colorado / Oak Crest — open, buildable land, not houses) and your **large logo** (1536×512). For Google they'd be cropped to **1.91:1 landscape + 1:1 square**, and the logo needs a **≥1200×1200 square** version for the logo slot. Review and tell me which photos you like.

---
*Nothing is added or deployed. Approve piece by piece and I'll prepare each one and show you the exact build (and, after it's live, a Change-history screenshot of just that change).*
