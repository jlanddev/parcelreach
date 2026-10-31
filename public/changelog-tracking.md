# Tracking & Google Ads — Change Log

Every change to tracking, click-ID capture, conversion uploads, OAuth/API access, and recoveries. Newest first. Times are US Central.
Format per entry: **What · Why · Tested/proof · Undo · Google Ads touched?**

---

## 2026-10-31

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
