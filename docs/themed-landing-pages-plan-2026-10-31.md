# Themed landing pages — plan + copy drafts (read-only, build nothing)

Matches search themes to dedicated landing pages, to lift **ad relevance + landing-page experience** (the two QS levers the single generic page can't satisfy at once). Every page reuses the **exact same submit flow** and tags leads so we can compare pages. **Nothing is built. Copy is for your review.**

---

## Why this helps (from the theme analysis)
- Ad relevance is the costliest below-average component ($2,704, 23% of spend), concentrated in **sell-general (53% below)** and **state (38% below)** — one generic page/ad can't be relevant to every theme.
- Landing-page experience is "average" on **81% of spend** — a ceiling on *every* theme. Themed pages that match the searcher's exact situation are the lever to move LP from "average" toward "above."
- A matched page should lift both QS components *and* on-page conversion rate → lower cost per good lead and higher reviewed-lead value.

## Current page = the baseline to beat (measured live, desktop)
| Metric | /sell-your-land today |
|---|--:|
| Requests | 50 |
| Total transfer | 223 KB |
| JavaScript | 222 KB (26 files) |
| TTFB | 232 ms |
| First Contentful Paint | ~676 ms |
| DOMContentLoaded | ~662 ms |
| Load | ~1,160 ms |

**Biggest weights:** Facebook Pixel (`connect.facebook.net`) alone is **219 KB**, plus the 1,711-line form's JS. Clarity, Hyros, Attrios, Bing, and FB all load on this page via the shared root layout.

**Target for themed pages (mobile-first):** ship them in a **separate route group with their own lean layout** that keeps **only GTM + GA4** (needed for Qualified_Lead) and drops FB/Clarity/Hyros/Attrios/Bing. Goal: **< 120 KB JS, < 25 requests, FCP < 0.5 s, load < 0.9 s on 4G**, single-column, above-the-fold = headline + first form step. Dropping the 219 KB FB pixel alone roughly halves transfer.

---

## How the reuse works (exact same submit flow)
The form today is **inline in `app/sell-your-land/page.js` (1,711 lines)** — not a component. Plan:

1. Create **`components/SellLandForm.js`** carrying the **identical submit flow**, copied verbatim from the current page:
   - `ClickIdCapture`/`clickIdsRef` (gclid/gbraid/wbraid + `hg_landing`)
   - Supabase insert (`source: 'Haven Ground - Sell Your Land Form'`, gclid columns + `form_data`)
   - **`hg_ec` stash before the GHL webhook** (the fix we just shipped)
   - GHL webhook → 1s delay → redirect to `/thank-you` (where **Qualified_Lead** fires)
2. Add one new field on insert: **`form_data.landing_page`** (e.g., `"inherited" | "sell-general" | "we-buy" | "state:TX" | "control"`) — JSON, **no DB migration needed** (same place gclid/landing_url already live). This is how we compare pages by reviewed-lead value and cost per good lead in the CRM.
3. The component takes **props for copy** (`headline`, `subhead`, `points`, `landingPage`) and **lean mobile-first markup** — identical *logic*, fresh *layout*. Themed pages render `<SellLandForm landingPage="inherited" copy={…} />`.

**On "exact same form component":** what must be identical for valid tracking is the **submit flow/logic** — that's copied byte-for-byte. The *markup* is rebuilt lean so the pages are fast and so we **never touch the designer's in-flight visual work** (see UI-freeze note). If you'd rather the pages look pixel-identical to the current form, that waits on the designer's final version; I recommend identical-flow + lean-markup so this isn't blocked.

**Original stays untouched:** `app/sell-your-land/page.js` is **not edited** — it remains the control. The shared component is a vetted copy of its flow. (If you later want one source of truth, we can refactor the original to use the component in a behavior-preserving way — but that's optional and not needed for the test.)

---

## The pages (priority order)

### 1. We Buy Land — biggest pool
- **For:** sellers looking for a direct buyer. **URL:** `/lp/we-buy-land`
- **Ad group/keywords (we-buy/land-buyers):** we buy land, land buyers, land buyers near me, cash for land, companies that buy land, we buy land for cash, cash buyers for land. *(This theme = $6,414 / 60.9 leads / QS 8 — already relevance-strong; the page mainly lifts LP + conversion rate.)*
- **H1:** We Buy Land Directly From Owners
- **Subhead:** No brokers, no listings, no waiting. You deal with the people who actually buy and close the land — and get a fair offer you understand.
- **Key message (honest-expert):** We're the buyer, not a middleman. We'll look at your parcel, explain what we can pay and why, and handle the title and closing. You pick the timeline.
- **3 points:** "We're the buyer, not a broker" · "No realtor fees or commissions" · "We handle title & closing"

### 2. Sell Your Land — biggest relevance gap
- **For:** general sellers, ready now or exploring. **URL:** `/lp/sell-your-land`
- **Ad group/keywords (sell-general):** sell land, sell my land, sell vacant land, selling land, sell your land, sell my vacant land. *(= $2,834 / 28.5 leads / 53% below-relevance — the page that fixes the most ad-relevance waste.)*
- **H1:** Sell Your Land Without the Hassle
- **Subhead:** Whether you're ready to sell or just want to know what it's worth, we'll walk you through a fair offer and how a simple sale works — no pressure, ever.
- **Key message:** You don't need an agent or a listing to sell land. Tell us about your parcel and we'll explain its value and the steps. If it's a fit, we make a straightforward cash offer and handle the paperwork.
- **3 points:** "A fair offer, explained" · "No commissions, no closing costs for you" · "Close on your schedule"

### 3. Inherited Land — best message, untapped keywords
- **For:** people who inherited land (estate/probate, multiple heirs, back taxes). **URL:** `/lp/inherited-land`
- **Ad group/keywords (NEW — this theme has zero keywords today):** inherited land, sell inherited land, inherited property, land I inherited, estate land sale, probate land, selling inherited land, heir land sale. *(Inherited is your best-converting **message** (~$97 CPA) but isn't targeted as keywords — this page + these keywords open a motivated, often higher-value segment.)*
- **H1:** Inherited Land You Don't Want to Keep?
- **Subhead:** We help families sell inherited land simply — even with several heirs, back taxes, or unclear title. We'll explain your options with no pressure.
- **Key message:** Inherited land often comes with taxes, distance, and paperwork no one wants. We've handled these — multiple heirs, title questions, overdue taxes — and we'll walk you through a fair offer and take the closing work off your plate.
- **3 points:** "We handle multiple-heir & title paperwork" · "Behind on taxes? We can still help" · "A fair offer, clearly explained"

### 4. State template — optional, phase 2
- **For:** state-specific searchers. **URL:** one dynamic template, `/lp/sell-land/[state]` (e.g., `/lp/sell-land/texas`) — **one template, not 50 pages.**
- **Ad group/keywords (state/location):** sell land [State], land buyers in [State], sell land for cash in [State]. *(Thin economics — $133/lead, 12% of impressions — so low priority; pair with the Text-Customization experiment later.)*
- **H1:** Sell Your {State} Land — A Fair Offer, No Fees
- **Subhead:** We buy land across {State}. Straightforward, no commissions, and we handle the closing.
- **Key message:** Same honest-expert copy as "We Buy Land," with {State} inserted where natural. Requires a safelist of states you actually buy in (OK/AZ/FL included) so the token never renders a state you don't serve.

---

## How to test it

**Recommended: run pages *with* the themed ad groups, as one Google Ads campaign Experiment (50/50).**
- **Control (50%):** current campaign/ad group → current `/sell-your-land`. **Untouched.**
- **Trial (50%):** themed ad groups (we-buy / sell / inherited / [state]) → each ad's Final URL points to its themed page.
- **Why combined:** in practice you'd ship structure + page together, and the goal is the *outcome* (reviewed-lead value, cost per good lead), not attribution between the two. One experiment, clean control, original safe.
- **Judge on:** cost per good (reviewed-qualified) lead and reviewed-lead value, per `form_data.landing_page`, trial vs control. Secondary: QS ad-relevance & LP labels, on-page conversion rate, page speed.
- **Run:** 4–6 weeks / until ~30+ reviewed leads per arm.

**If you want to isolate the *page* effect specifically:** a separate **Final-URL-only 50/50 experiment** on the single biggest theme (we-buy) — same ads/keywords, only the landing page differs (current vs `/lp/we-buy-land`). Cleanest single-variable read, but slower to cover all themes. I'd do the combined test first for impact, this second only if you want to attribute the lift.

**Sequencing:** ship the **new RSA** first (already recommended, zero-risk). Then this pages+themed-ad-groups experiment. The two don't conflict.

---

## The "UI freeze" — what it is, and whether it blocks this
**What it refers to:** your marketing site (`~/haven-ground`) has a **designer actively reworking the visual design** (the homepage redesign that got swept live today was their in-progress work). The standing rule in my memory is *don't touch the site UI while the designer is working* — i.e., don't modify shared visual files (the homepage, `globals.css`, the root layout, or components they're restyling), because edits collide with their work or ship a half-done redesign.

**Does it block new landing pages? No — if we build them isolated:**
- New pages live at **new routes in a new route group** (`app/(lp)/lp/...`) with **their own scoped layout** and **self-contained styles** (Tailwind utilities / a CSS module) — they don't import or alter the designer's in-flight files.
- They reuse only **stable, non-visual logic**: the copied submit flow, `lib/supabase`, the tracking libs, `ClickIdCapture`. None of that is design work.
- The one thing to **avoid**: editing `app/sell-your-land/page.js`, `app/page.js`, `app/globals.css`, or `app/layout.js` (likely touched by the redesign). Our plan doesn't — the shared form component is a fresh file with copied logic, and the lean LP layout is scoped to the route group.
- **One coordination check before building:** confirm with you/the designer that nobody is mid-edit on `lib/supabase`, the tracking libs, or planning to move the `/sell-your-land` route — so our copy of the flow doesn't drift from a change in flight.

**Net:** new isolated landing pages are additive and safe; the freeze is about not disturbing the designer's visual redesign, which this plan explicitly avoids.

---

*All copy above is a draft for your review. On your go, I'll build the pages in an isolated route group, show you each before anything deploys, and keep the original page and campaign untouched.*
