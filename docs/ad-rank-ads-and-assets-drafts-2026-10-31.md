# Ad Rank — new ad + full asset set (DRAFTS for review, nothing added)

Everything here is a draft for your approval. **Nothing has been added to Google.** The new ad goes *alongside* your current ads (nothing replaced or paused). Voice throughout: knowledgeable, honest land expert — no hype, no "cash in 7 days," no "#1 buyer" claims.

---

## 1) New Responsive Search Ad (unpinned, targets Good/Excellent)

Goes in the existing ad group alongside the two live ads. **Pin nothing** so Ad Strength can reach Excellent and Google can test combinations (this is what frees up the expected-CTR that the current all-pinned ad throttles). If you want one brand anchor, pin only **"We Buy Land Direct"** to Headline 1 — nothing else.

**15 headlines (all ≤30 characters):**
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

**4 descriptions (all ≤90 characters):**
```
We're land specialists. We'll walk you through a fair, no-obligation offer — your call.
Inherited, taxed, or just ready to move on? We handle title, closing, and paperwork.
No agents, no commissions, no pressure. Sell direct to people who know land.
Tell us about your land and we'll explain what it's worth and how a sale works.
```

**Display paths:** `/Sell-Your-Land` · `/Fair-Offer`  ·  **Final URL:** `/sell-your-land` (until the themed pages are live, then the themed page per ad group).

---

## 2) Full asset set

> **Rule you set, baked in:** every sitelink lands on a page that has the **same Sell Your Land form + /thank-you** (Qualified_Lead). No homepage, no form-less info pages. The themed sitelink pages below **are not yet built** — do not add these sitelinks until each page is **live and verified**: form submits → Qualified_Lead fires **once** → click ID saved. The three themed pages (inherited, back taxes, how we price land) are new builds; `/sell-your-land` already exists and is verified.

### Sitelinks (4) — HOLD until the target pages are live & verified
| Link text | Lands on | Desc line 1 | Desc line 2 | Status |
|---|---|---|---|---|
| Inherited Land | `/lp/inherited-land` *(build)* | Sell inherited or estate land | We handle heirs, title & taxes | hold |
| Behind on Land Taxes? | `/lp/back-taxes` *(build)* | Owe back taxes on vacant land? | We can still make a fair offer | hold |
| How We Price Land | `/lp/how-we-price-land` *(build)* | See how we value your parcel | A fair offer, clearly explained | hold |
| Sell Your Land | `/sell-your-land` *(live)* | Start your no-obligation offer | No agents, no commissions | ready once approved |

*(Each page must carry the exact same form component + /thank-you flow per the landing-pages plan. "Back taxes" and "How we price land" are new themes you named — I'll draft their page copy next if you want them built.)*

### Callouts (8) — ready to add on approval (no landing page dependency)
```
No Realtor Fees
We Handle Closing
No Pressure, Ever
Local Land Experts
Fair Offers, Explained
You Pick the Timeline
Title & Probate Help
Direct Buyer, No Brokers
```

### Structured snippets (1) — ready to add on approval
- **Header:** Service catalog
- **Values:** `Inherited land sales` · `Back-tax land` · `Vacant & rural acreage` · `Title & probate help` · `Direct cash offers`

### Call asset — DRAFT only, do NOT add until you decide
- Number: **[your call-tracking number]** (use a line you actually answer / that's call-tracked; I won't invent one).
- Call reporting on, schedule to your hours. Held per your instruction until you decide.

### Images + logo — ready to add on approval
Your account already has real drone/parcel photos — those fit the honest brand far better than the AI "Generated image" assets, which I'd skip. Google needs **both** a landscape and a square to serve reliably (the current setup only has 1:1 squares enabled, which is part of why images weren't showing):
- **Landscape 1.91:1** (rec 1200×628): a real land/drone shot — e.g., the `DJI_0446_1.91:1` / `DJI_0442_1.91:1` crops (4000×2093) already in the library.
- **Square 1:1** (rec 1200×1200): the `DJI_0446_1:1` / `DJI_0445_1:1` crops (2250×2250).
- **Logo:** replace the current **32×32** logo (too small to render) with a **≥1200×1200 square** version (and a 1200×300 landscape logo if you have one).
- Pick 2–3 photos that show open, buildable land (not houses) — matches "we buy land," not "we buy homes."

### Skipped per your instruction
- **Lead form asset** — skipped.

---

## 3) Your "Dispo lead form" question — answered (read-only)

**What it is:** `Dispo lead form (havenground.com/)` — type **WEBPAGE_CODELESS**, category **SUBMIT_LEAD_FORM**, origin WEBSITE, status ENABLED. "Codeless" means **Google auto-created it** from activity it detected on havenground.com (a form submit / button it guessed was a lead form) — you didn't place a tag for it. It reads **primary_for_goal = true**, but **include_in_conversions_metric = false**.

**Does it matter for the seller campaign?** **Not for bidding.** Because it's *not* in the Conversions metric, it does **not** feed Trial 220's Maximize Conversions optimization — that still runs on **Qualified_Lead** only. It's effectively a Google auto-detected duplicate of your form activity sitting in its own "Submit lead form" goal.

**Recommendation (UI, your call — I won't touch it):**
1. Make sure Trial 220 uses **campaign-specific goals = Qualified_Lead only**, so this codeless action can't attach to the seller campaign. (This is the same "account-default OFF" item from the reporting check.)
2. Then set "Dispo lead form" to **Secondary** (observe-only) if it's redundant with Qualified_Lead. Don't delete it blind — first confirm in the UI's conversion view that it isn't the only record of any real buyer/dispo inquiries; if it's just Google's auto-guess of the seller form, demoting it is clean.

It's not urgent (it isn't moving your bids), just worth tidying so "Qualified_Lead is the only Primary" is actually true.

---

*Approve piece by piece. On each approval I'll prepare that item and show you the exact build before anything goes live. Sitelinks stay on hold until their pages are live and verified.*
