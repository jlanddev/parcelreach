# Tracking & Google Ads — Change Log

Every change to tracking, click-ID capture, conversion uploads, OAuth/API access, and recoveries. Newest first. Times are US Central.
Format per entry: **What · Why · Tested/proof · Undo · Google Ads touched?**

---

## 2026-10-31

### 09:15 — Theme-level rank analysis + recommended first action (read-only)
- **What:** Grouped the 307 keywords into 6 themes; pulled real keyword-level impression share + rank-loss (API supports it) and spend-weighted QS-component weakness. Wrote `docs/gads-themes-and-rank-action-2026-10-31.md`.
- **Key findings:** we-buy/land-buyers (~33,200 impr/mo lost to rank) + sell-general (~23,600) = **~91% of all lost rank**. Costliest below-average component = **ad relevance** ($2,704, 23% of spend), concentrated in sell-general (53% below) + state (38% below). we-buy is QS 8 / 0% below-relevance — its loss is **expected-CTR-gated** (the over-pinned ad), not relevance. Landing page = ceiling ("avg" on 81% of spend) but UI frozen. State/location is bloat (186 kw, 12% of impr, worst $133/lead).
- **Recommendation:** run a **new unpinned RSA (Good/Excellent) in the existing ad group first** — attacks the biggest (CTR-gated) pool additively, zero risk to the ~113 leads/mo. Themed ad groups second (higher relevance ceiling, medium risk). Full 15-headline / 4-description draft in honest-expert voice included.
- **Undo:** N/A (read-only).
- **Google Ads touched?** No — read-only; draft only, nothing applied.

### 08:30 — Read-only review of "Haven Search/Conv  Trial 220" + test proposals (nothing changed)
- **What:** Full Google Ads API v23 read of campaign 22464770148 — QS per keyword + 3 parts, ads/pinning/strength, assets + image policy, impression share, bid strategy. Wrote `docs/gads-review-proposals-2026-10-31.md`.
- **Key findings:** 30d = 1,144 clicks / $11,843.83 / 112.9 conv / **$113 value**. **IS 19.9%, lost to Ad Rank 80.1%, lost to budget 0.0%** — rank is the constraint, not budget. One ad group holds 307 keywords (~250 with 0 impressions). Best ad strength = Average (every headline pinned → no combination learning). No sitelinks, no call asset, snippets paused, images not serving (square-only + logo 32×32 + low rank). Landing-page experience "avg" across the board.
- **CORRECTION to the 07:05 finding:** Google Ads is **NOT doubled**. Conversion-action breakdown: Qualified_Lead = 112.9; CRM website-form leads same 30d = **124**. 112.9 ≈ 91% of real leads, so Ads counts one per click (count="One"). The GA4 double-fire inflates **GA4 reports only**, not the Ads bidding signal — so the GA4 fix is hygiene, not a bidding emergency. (The 07:05 "~2× corrupts bidding" was wrong; verified against the account.)
- **Proposals (drafts, not applied):** 1) full asset set (direct-in), 2) new RSA ≤1 pin in honest-expert voice, 3) themed ad groups as a 50/50 experiment, 4) text customization experiment; then switch to Max Conversion Value once real deal values flow. Negatives revised: **no geo negatives** (buys in OK/AZ/FL) — only wrong-intent/competitor terms.
- **Undo:** N/A (read-only).
- **Google Ads touched?** No — read-only queries only.

### 07:20 — Step 6: pulled search terms (last 60 days) + drafted negative keywords (NOT applied)
- **What:** Read-only Google Ads API v23 query of `search_term_view` for 2026-09-01→10-31 on account 2875216984. Wrote `docs/search-terms-negatives-2026-10-31.md` with totals, top-25-by-spend, and a tiered draft negative list.
- **Why:** Step 6 of the Google plan — cut wasted spend, but carefully.
- **Tested/proof:** 1,663 terms, 625 clicks, **$7,438.81** spend, 65.9 conversions, **$66** conversion value. 190 terms (54% of spend, $4,006) had 0 recorded conversions. Draft negatives split into Tier 1 (relevance-safe: out-of-geo FL/AZ/AK/OK + buyer-intent + competitor) vs Tier 2 (performance-based — held, because 0-conv is unreliable while tracking is under-counting).
- **Undo:** N/A (read-only; nothing applied to Google).
- **Google Ads touched?** No — read-only query; no negatives applied.

### 07:12 — Step 5: end-to-end test with ?gclid=TEST123 (PASS; nothing sent to Google)
- **What:** Full chain. (1) Browser: landed on `/sell-your-land?gclid=TEST123&utm_...`; confirmed `hg_gclid=TEST123`, `hg_landing`=full ad URL, `_gcl_aw`=TEST123. (2) Inserted a website-form test lead carrying gclid=TEST123 (service role). (3) Ran the uploader in `dry=1` (no Google call) against only that lead. (4) Deleted the test lead; verified 0 lingering.
- **Why:** Prove ad click → CRM → upload end to end.
- **Tested/proof:** Dry-run built **Contract Signed $14,550 + Reviewed Lead** with `hasClickId:true`, `hasHashedPII:true`, `unmatchable:0` → match = Click ID. Test lead `54c357da…` deleted (ok); cleanup query returned 0 E2E leads.
- **Undo:** N/A (test lead already deleted; dry-run sent nothing).
- **Google Ads touched?** No — `dry=1` returns before any upload; nothing reached Google.

### 07:05 — FINDING (NOT fixed — needs your GA4 change): Qualified_Lead fires ~2× per thank-you load
- **What:** On a single `/thank-you` load, Qualified_Lead fires **twice** — once on `page_view` (`_s=2`) and again on `gtm.scrollDepth` (`_s=4`) — to both GA4 (G-KRZH94TT88) and Google Ads (AW-16958771650). `page_view` itself fires once, so it's not double GA4 tagging. No Qualified_Lead is pushed to the dataLayer, so it's a **GA4 "Create event" rule scoped to all events on `/thank-you`** instead of only `page_view`.
- **Why it matters:** ~2× conversion inflation → corrupts bidding and the conversion counts.
- **Fix (for you, in GA4 Admin — I won't touch GA4 without your OK):** On the Qualified_Lead create-event / key-event rule, add the condition **`event_name` equals `page_view`** alongside the `page_location` contains `/thank-you` condition, so exactly one Qualified_Lead is created per visit.
- **Tested/proof:** Clean single-load Playwright capture: GA4 `en=Qualified_Lead` ×2, Google Ads `measurement/conversion en=Qualified_Lead` ×2, `page_view` ×1. dataLayer Qualified_Lead pushes: 0.
- **Google Ads touched?** No.

### 07:00 — Stash hg_ec BEFORE the GHL webhook (haven-ground 9a5234f)
- **What:** Moved the `sessionStorage.setItem('hg_ec', …)` in `app/sell-your-land/page.js` to run **before** the GHL webhook fetch (was after a successful webhook).
- **Why:** If the webhook threw, the catch block still redirected to `/thank-you` but hg_ec was never set, dropping the enhanced-conversion email/phone. Now it survives a webhook failure.
- **Tested/proof:** Build passed; deployed. Live chunk confirms the stash now precedes "Sending webhook to GHL". File changed: only `app/sell-your-land/page.js`.
- **Undo:** `git revert 9a5234f` in haven-ground.
- **Google Ads touched?** No.

### 06:31 — INCIDENT + FIX: reverted designer's unfinished homepage that a `git add -A` pushed live (haven-ground 7490b0e)
- **What:** The Step 3 commit below (8582fc3) was supposed to be the thank-you page only, but it was committed with `git add -A`, which also swept in the designer's in-progress homepage redesign and pushed it live. Reverted every non-mine file back to its pre-redesign state.
  - **Reverted (not mine):** `app/page.js` (homepage hero), `app/globals.css`, `app/properties/page.js`, deleted new `public/images/haven-logo-2026.png`, plus ~174 local agent-tooling files (`.agents/…`, `.claude/…`, `.codex/hooks.json`, `skills-lock.json`).
  - **Kept (mine):** `app/thank-you/page.js` (the actual Step 3 change).
  - Designer's WIP preserved in git tag `swept-wip-8582fc3` — nothing lost.
- **Why:** The homepage changed publicly without approval; UI is off-limits (designer incoming). Leads were NOT affected (ads point at /sell-your-land).
- **Tested/proof:** Live homepage re-screenshotted — back to "Our Land is Your Haven / built on / Integrity, Honor, and Heart", old logo, sketch landscape, no empty-grid redesign. New logo URL now 404s; old logo 200s. `/sell-your-land` loads clean ("Ready to Sell Your Land? … CLICK FOR MY OFFER"). Thank-you re-verified (see Step 3).
- **Undo:** `git revert 7490b0e`, or `git checkout swept-wip-8582fc3 -- <file>` to restore any designer file.
- **Google Ads touched?** No.
- **New standing rule:** never `git add -A`/`git add .` — stage named files only; show the file list and confirm each is mine before commit; never deploy others' WIP; after every deploy verify homepage + /sell-your-land + thank-you + Qualified_Lead; log exact files here.

### 06:18 — Step 3: normalized enhanced-conversion email/phone on thank-you + removed dead AW stub (haven-ground, in 7490b0e)
- **What:** On `app/thank-you/page.js`, the seller's email is now trimmed + lowercased and the phone forced to E.164 before `gtag('set','user_data', …)`, per Google's enhanced-conversions-for-leads spec. Removed the misleading `// TODO: Add Google Ads conversion (AW-…)` stub — Google Ads receives the conversion via the GA4 **import** of Qualified_Lead, not a separate AW tag.
- **Why:** Un-normalized contact data hashes to the wrong value and won't match; the AW stub implied a tag that never existed and confused the picture.
- **Tested/proof (live, Playwright network capture):** Stashed a deliberately messy email `"  TestSeller@EXAMPLE.Com  "`; on /thank-you it reached gtag as `testseller@example.com` (normalized). Network hits fired: GA4 `g/collect en=Qualified_Lead tid=G-KRZH94TT88` (204); Google Ads `measurement/conversion en=Qualified_Lead` → AW-16958771650 (302); `measurement/1p-conversion en=Qualified_Lead` carrying the hashed `crd=…` enhanced-conversion payload (200). Changing the email/phone changed the `crd` blob — proof the contact data is encoded and transmitted. Re-verified identical after the 06:31 revert.
- **Undo:** `git checkout 8f13682 -- app/thank-you/page.js` (restores the prior thank-you with the AW TODO stub).
- **Google Ads touched?** No new conversion action created. The existing Qualified_Lead conversion now carries hashed email/phone from the site.

### 06:12 — Merged Killian McElroy's duplicate + re-sent his contract with the click ID (Step 2)
- **What:** His contract work ($60k offer / $36k value) sat on the GHL echo record (no gclid); the gclid was on his website twin. Merged the contract/review onto the website record (which has the gclid), cleared `sent_at`, re-ran the uploader; archived the echo.
- **Why:** The matched conversion needs the record that both (a) is a website lead and (b) carries the click ID.
- **Tested/proof:** Website record `40c80569` now UNDER_CONTRACT, gclid SET, `contract_upload.sent_at = 2026-10-31T06:12:48`, value $36,000, match = Click ID. Echo `d00e7be4` archived with `archived_reason`.
- **Undo:** Un-archive the echo; null the website record's `contract_upload.sent_at` and revert its status to CONTACTING. Google: retract via `?retract=40c80569&kind=contract`.
- **Google Ads touched?** Yes — 1 contract conversion ($36k) uploaded with gclid (Contract Signed 7851058931). The echo's earlier email/phone upload was unmatched (harmless).

### 05:xx — Step 1: full landing URL captured site-wide + stored on every lead (haven-ground 8f13682)
- **What:** `ClickIdCapture` now stores the first-touch full landing URL in a 90-day `hg_landing` cookie; the sell-your-land form and `/api/submit-lead` write `form_data.landing_url` on the lead.
- **Why:** So a lead can always be traced to its exact ad click even if the gclid wasn't individually parsed.
- **Tested/proof:** Build passed; deployed (Netlify ready). End-to-end verification with `?gclid=TEST123` pending (Step 5).
- **Undo:** `git revert 8f13682` in haven-ground.
- **Google Ads touched?** No.

### 03:xx — Exclude non-website (manually-added) leads from Google uploads
- **What:** Uploader (`google-vbb-upload`) now filters to `source = 'Haven Ground - Sell Your Land Form'` only. Manual leads (LeadBid, on-market/subdivision, referral, admin-upload, GHL "haven-ground" echoes) are never sent to Google.
- **Why:** Only website-form leads come from an ad click; manual leads aren't Google Ads leads and were polluting uploads (found 4 admin-upload + 2 echoes in the upload set).
- **Tested/proof:** Source audit — upload set was 66 website + 6 non-website; after filter, only the 66 website leads qualify. Build passed.
- **Undo:** Remove the `.eq('source', WEBSITE_SOURCE)` filter in `fetchLeads`.
- **Google Ads touched?** Yes going forward — 6 non-website conversions will no longer be uploaded. Already-sent ones can be retracted with `?retract=<leadId>`.

### 02:xx — Google Ads API read-only access established (v23)
- **What:** Confirmed the OAuth refresh token (scopes: adwords + datamanager) can call the Google Ads API at **v23** with **no developer-token header** (dev tokens sunset Sep 2026). Account **2875216984 "Haven Ground"** is the live ad account.
- **Why:** To audit auto-tagging, conversion actions, campaign templates, and clicks/conversions directly from Google.
- **Tested/proof:** `listAccessibleCustomers` → HTTP 200 `["customers/4560865013","customers/2875216984"]`. Verified `FROM campaign` clicks/cost for Oct 8–14 = **286 clicks / $3,194.09**, matching the UI exactly.
- **Undo:** N/A (read-only, no change made).
- **Google Ads touched?** No — read-only queries only.

### 02:xx — Recovered 3 click IDs from stored session landing URLs, re-sent conversions
- **What:** `tracking_sessions.referrer` stores the full landing URL (with gclid). Pulled gclids for **Andrew Spivey, Lawrence Newton, Joe Borden**, wrote them to the lead (`gclid` col + `form_data.gclid`), cleared their `sent_at`, and re-ran the uploader.
- **Why:** Their contracts had no click ID on the lead (capture bug) but the gclid was in the session.
- **Tested/proof:** Uploader re-sent **Spivey ($90k)** + **Newton ($63k)** with `contract_upload.sent_at` stamped 04:52 and match = Click ID. Borden's gclid attached; contract pending a value.
- **Undo:** Backups of prior lead state not separately saved; the gclid fields can be nulled per lead. Conversions sent to Google can be retracted via `?retract=<leadId>&kind=contract`.
- **Google Ads touched?** Yes — 2 offline conversions re-uploaded (Contract Signed action 7851058931). Change History: offline conversion import.

## 2026-10-29

### 20:20 — Click-ID coverage % on Upload Queue + duplicate click-ID inheritance (commit cc2c30c)
- **What:** New `/api/stats/click-coverage`; Upload Queue footer shows "% of form leads with a click ID (since Oct 16)". Uploader now inherits a click ID from a duplicate lead (same phone/email) when the uploaded record has none.
- **Why:** Visibility into capture health + stop stranding a click ID on a duplicate copy.
- **Tested/proof:** Endpoint returns real/haven-ground split (85% / 0%). Build passed, deployed.
- **Undo:** `git revert cc2c30c`.
- **Google Ads touched?** No code change to what's sent; may cause more uploads to carry a gclid going forward.

### 20:12 — VBB spike-hold made sane + de-spammed (commit 5766403)
- **What:** Hold a run only if `toSend > max(20, 2× recent avg)`; alert at most once per 6h.
- **Why:** It was holding 3-conversion batches and notifying hourly, so nothing uploaded.
- **Tested/proof:** Cleared 10 stuck "HELD" notifications; manual run sent 4 conversions.
- **Undo:** `git revert 5766403`.
- **Google Ads touched?** Indirectly — previously-held conversions now upload. (Superseded by the Step-4 threshold below once applied.)

### ~20:00 — Cleared stuck VBB "HELD" spam + flushed held conversions
- **What:** Deleted 10 "VBB upload HELD" notifications across users; triggered a real upload.
- **Why:** Bell was being spammed hourly; conversions were stuck.
- **Tested/proof:** Bell count for those → 0; run reported `sent=4`.
- **Undo:** N/A (notifications are transient).
- **Google Ads touched?** Yes — the 4 flushed conversions uploaded.

## 2026-10-29 (site)

### 20:18 — Haven Ground: site-wide click-ID capture + submit-lead saves click IDs (haven-ground commit d360b27)
- **What:** `components/ClickIdCapture.js` added to the root layout captures gclid/gbraid/wbraid on **every** page into a 90-day cookie. `/api/submit-lead` now saves gclid/gbraid/wbraid from body or cookie (previously saved none).
- **Why:** Capture only ran on `/sell-your-land`; ads landing elsewhere lost the click ID. The "haven-ground" intake saved nothing.
- **Tested/proof:** Build passed; deployed (Netlify ready). Redirect test: `?gclid` survives http→https/www/trailing-slash.
- **Undo:** `git revert d360b27` in haven-ground.
- **Google Ads touched?** No.

## 2026-10-16 to 10-17 — Initial VBB / conversion-upload build (pre-leak-fix)
- **Site (haven-ground):** capture gclid on leads (0b5f711), mirror to columns (9fdf59a), pass email/phone as enhanced-conversion user data on thank-you (71ce159). *Note: the Google Ads (AW) conversion event on thank-you is still a TODO stub — never fires. Flagged for Step 2/3.*
- **CRM/uploader (parcelreach):** OAuth datamanager+adwords scope (69e4565); Data Manager `events:ingest` uploader (e85a115) with `eventSource: WEB` (48376fe); hourly scheduled upload + kill switch + hold + manual run (f20af80); Upload Queue CRM tab + redesign (6105217, 9edad1d); value ladder + review panel (multiple).
- **Why:** Stand up value-based-bidding offline conversion upload (Reviewed / Contract / Closed).
- **Tested/proof:** `validateOnly` runs then live; 2 gclid-bearing contracts matched in Google ($103,500).
- **Undo:** per-commit `git revert`.
- **Google Ads touched?** Yes — offline conversion actions created/used (Reviewed Lead 7851053417, Contract Signed 7851058931, Closed Deal 7851186474), all **Secondary**.

---

*Non-tracking CRM changes in this window (OM Search partner access, campaigns, moderation tooling, LandPortal key rotation) are tracked in git but omitted here to keep this log focused on tracking & Google Ads.*
