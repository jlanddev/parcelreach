# Tracking & Google Ads — Change Log

Every change to tracking, click-ID capture, conversion uploads, OAuth/API access, and recoveries. Newest first. Times are US Central.
Format per entry: **What · Why · Tested/proof · Undo · Google Ads touched?**

---

## 2026-11-03

### [FIX 2026-11-03] Appointments not showing live on calendar/board -> scheduled_tasks added to realtime feed
- **Root cause (plain English):** Setting an appointment saves perfectly (new pending meeting task + lead moved to APPT_SET_FOR_JORDAN, verified on Michael Hall + Lisa Lindsay re-set). But the CRM subscribes to live `scheduled_tasks` changes while that table was NOT in Supabase's `supabase_realtime` publication. So the live feed for appointments was dead: when one person (Darwin) booked an appointment, anyone else's already-open tab (Jordan) never received the event, so it never appeared on the calendar / Mapped & Appointment Set / reminder banner until a full page reload. `leads` WAS on the feed, which is why stage changes seemed live but appointments did not.
- **Fix (SQL run, additive + reversible):**
  - `alter publication supabase_realtime add table public.scheduled_tasks;`
  - `alter table public.scheduled_tasks replica identity full;` (so UPDATE/DELETE events carry the row)
- **Verify:** scheduled_tasks now in the publication; both current appointments (Michael 52e57c97 due 11/4 18:00Z, Lisa 6a4d5ec7 due 11/4 21:00Z) are pending/assigned to Jordan and match exactly what the calendar load+filter render. A one-time reload shows the two existing ones; every NEW appointment now appears live without reload.
- **Undo:** `alter publication supabase_realtime drop table public.scheduled_tasks;`
- **Still open (optional guard):** add a count-mismatch banner on Mapped & Appointment Set so a staged appointment can never silently vanish even if the feed hiccups.


### [RESET 2026-11-03] Michael Hall + Lisa Lindsay moved to PPC Inflow, Wed appts cancelled
- **SQL run (reversible; snapshot above is the restore point):**
  - `update public.leads set pipeline_status='CONTACTING', status='contacting', updated_at=now() where id in ('3ad3bcbf-...michael','1cdd6495-...lisa');`
  - `update public.scheduled_tasks set status='cancelled', updated_at=now() where id in ('2c160960-...michael-mtg','126e59c0-...lisa-mtg') and task_type='meeting' and status='pending';`
- **Result:** both now CONTACTING (PPC Inflow), 0 pending meetings each. Meetings cancelled, NOT deleted (still in table with status=cancelled).
- **Undo:** set each lead pipeline_status/status back to APPT_SET_FOR_JORDAN and the two task rows back to status=pending (values in the SNAPSHOT block above).
- **Next:** re-set both appointments (Wed, same times, assigned to Jordan, map kept) and confirm they appear in Mapped & Appointment Set. Compare to snapshot if they still hide.


### [SNAPSHOT 2026-11-03] Michael Hall + Lisa Lindsay pre-reset evidence (appt-not-showing bug)
- **Why:** live test of appointments not appearing in "Mapped & Appointment Set". Full records + tasks captured before resetting, per Jordan.
- **Duplicate-phone check:** NONE. Michael (p10 6605255649) and Lisa (p10 8043147011) each have exactly one lead record.
- **Verified before reset:** both pipeline_status=APPT_SET_FOR_JORDAN, map_uploaded=true, no offer, not archived. Replaying the deployed board logic against live data puts Michael as card #2 and Lisa as card #5 of 96 in the appointment-set bucket (both within the visible 60) — i.e. by the code they SHOULD show.
- **Full snapshot JSON (all fields):**
```json
{
 "captured_at": "2026-11-03",
 "leads": [
  {
   "id": "1cdd6495-23e4-4893-8b2a-6656ffffe2dc",
   "name": "Lisa Lindsay",
   "email": "lisa.lindsay@cox.net",
   "phone": "(804) 314-7011",
   "address": "parcel 23-1-13",
   "city": "Scott County",
   "zip": null,
   "latitude": null,
   "longitude": null,
   "status": "appt_set_for_jordan",
   "created_at": "2026-11-03 14:25:40.651129+00",
   "updated_at": "2026-11-03 14:25:40.651129+00",
   "acreage": "7.13",
   "dealtype": "flips",
   "notes": null,
   "parcelgeometry": null,
   "team_id": null,
   "assigned_to": null,
   "offermade": false,
   "contractsigned": false,
   "offerprice": null,
   "projectedrevenue": null,
   "pictures": [],
   "contractfile": null,
   "parcelid": "23-1-13",
   "county": "Scott County",
   "source": "haven-ground",
   "parcel_id": "23-1-13",
   "state": "Virginia",
   "property_county": "Scott County",
   "property_state": "Virginia",
   "acres": "7.13",
   "full_name": "Lisa Lindsay",
   "names_on_deed": null,
   "street_address": "parcel 23-1-13",
   "sms_consent": false,
   "sms_verified": false,
   "purchased_by": null,
   "purchased_at": null,
   "price_paid": null,
   "parcel_geometry": null,
   "ip_address": null,
   "phone_verified": false,
   "form_data": {
    "vbb": {
     "ppa": 7500,
     "fips": "51169",
     "tier": "county_3yr",
     "comps": 6,
     "floor": 15000,
     "value": 46875,
     "profit": 46875,
     "reason": "ok",
     "resale": 93750,
     "fallback": false,
     "inherited": false,
     "computed_at": "2026-11-03T14:25:46.082Z"
    },
    "zip": null,
    "city": null,
    "acres": "5 - 20",
    "state": "Virginia",
    "county": "Scott County",
    "origin": "screenshot_upload",
    "acreage": "5 - 20",
    "acresRange": "5 - 20",
    "namesOnDeed": "The Kathy H. Collier Living Trust",
    "streetAddress": "parcel 23-1-13"
   },
   "price": null,
   "temperature": "HOT",
   "cadence_name": "NEW_LEAD",
   "cadence_step": 0,
   "cadence_started_at": "2026-11-03 14:25:40.651129",
   "next_action_type": null,
   "next_action_due": null,
   "next_action_script": null,
   "last_activity_at": "2026-11-03 15:15:49.694",
   "last_activity_type": null,
   "last_activity_outcome": null,
   "touch_count": 0,
   "call_count": 0,
   "text_count": 0,
   "email_count": 0,
   "nurture_until": null,
   "dead_reason": null,
   "map_uploaded": true,
   "map_image_url": "https://snfttvopjrpzsypteiby.supabase.co/storage/v1/object/public/lead-maps/1cdd6495-23e4-4893-8b2a-6656ffffe2dc/1793718673626-5321.png",
   "current_owner_id": "e22c5965-78d7-461e-bdbd-f1af6f415603",
   "pipeline_status": "APPT_SET_FOR_JORDAN",
   "sms_opt_out": false,
   "pb_line_id": null,
   "offer_amount": null,
   "offer_confirmed": false,
   "deal_direction": null,
   "follow_up_bucket": null,
   "follow_up_step": 0,
   "follow_up_started_at": null,
   "next_follow_up_at": null,
   "lost_reason": null,
   "last_contact_at": "2026-11-03 15:15:45.492+00",
   "last_contact_dir": "outbound",
   "last_contact_channel": "call",
   "last_contact_preview": "Call \u00b7 3m 45s",
   "last_call_at": "2026-11-03 15:15:45.492+00",
   "last_call_outcome": "spoke",
   "partner_pushes": [],
   "last_call_duration": 225,
   "partner_summary": null,
   "partner_coordinates": null,
   "clean_view": false,
   "clean_view_at": null,
   "lead_maps": [
    {
     "id": "1cdd6495-23e4-4893-8b2a-6656ffffe2dc/1793718673626-5321.png",
     "url": "https://snfttvopjrpzsypteiby.supabase.co/storage/v1/object/public/lead-maps/1cdd6495-23e4-4893-8b2a-6656ffffe2dc/1793718673626-5321.png",
     "kind": "upload",
     "label": "Kathy Collier"
    }
   ],
   "offer_terms": {},
   "offer_pdf_url": null,
   "clean_view_2": true,
   "clean_view_2_at": null,
   "gclid": null,
   "gbraid": null,
   "wbraid": null
  },
  {
   "id": "3ad3bcbf-338c-4384-aecf-c240bc607a76",
   "name": "Michael Hall ",
   "email": "addictionink2017@yahoo.com",
   "phone": "+16605255649",
   "address": "541731200085, Alamosa, Colorado",
   "city": null,
   "zip": null,
   "latitude": null,
   "longitude": null,
   "status": "appt_set_for_jordan",
   "created_at": "2026-11-03 05:51:50.085652+00",
   "updated_at": "2026-11-03 05:51:50.085652+00",
   "acreage": "40",
   "dealtype": "flips",
   "notes": "Position: sole-owner\nHome on property: no\nProperty listed: no\nInherited: no\nOwned 4+ years: yes\nWhy selling: Plans have changed and we won't be able to move any time soon due to helping family with my wife's sick grandfather.\nNames on deed: Michael Hall ",
   "parcelgeometry": null,
   "team_id": null,
   "assigned_to": null,
   "offermade": false,
   "contractsigned": false,
   "offerprice": null,
   "projectedrevenue": null,
   "pictures": [],
   "contractfile": null,
   "parcelid": "541731200085",
   "county": "Alamosa",
   "source": "Haven Ground - Sell Your Land Form",
   "parcel_id": "541731200085",
   "state": "Colorado",
   "property_county": "Alamosa",
   "property_state": "Colorado",
   "acres": "40",
   "full_name": "Michael Hall ",
   "names_on_deed": null,
   "street_address": "541731200085, Alamosa, Colorado",
   "sms_consent": false,
   "sms_verified": false,
   "purchased_by": null,
   "purchased_at": null,
   "price_paid": null,
   "parcel_geometry": null,
   "ip_address": "35.144.59.124",
   "phone_verified": true,
   "form_data": {
    "vbb": {
     "ppa": 5000,
     "fips": "08003",
     "tier": "county_2yr",
     "comps": 39,
     "floor": 15000,
     "value": 87500,
     "profit": 87500,
     "reason": "ok",
     "resale": 175000,
     "fallback": false,
     "inherited": false,
     "computed_at": "2026-11-03T05:52:21.892Z"
    },
    "acres": "20-50 Acres",
    "email": "addictionink2017@yahoo.com",
    "gclid": "CjwKCAiAhqHXBhAXEiwATbksU3_IuOrFSPqm2pD6cP8tvqzq061nK6MDhtSaxDG0t-fshbgcG5c8ihoCuJoQAvD_BwE",
    "phone": "+16605255649",
    "gbraid": null,
    "wbraid": null,
    "fullName": "Michael Hall ",
    "position": "sole-owner",
    "utm_medium": null,
    "utm_source": null,
    "whySelling": "Plans have changed and we won't be able to move any time soon due to helping family with my wife's sick grandfather.",
    "isInherited": "no",
    "landing_url": "https://havenground.com/lp/how-we-price-land?gad_source=1&gad_campaignid=22464770148&gclid=CjwKCAiAhqHXBhAXEiwATbksU3_IuOrFSPqm2pD6cP8tvqzq061nK6MDhtSaxDG0t-fshbgcG5c8ihoCuJoQAvD_BwE",
    "namesOnDeed": "Michael Hall ",
    "landing_page": "how-we-price-land",
    "utm_campaign": null,
    "propertyState": "Colorado",
    "streetAddress": "541731200085",
    "homeOnProperty": "no",
    "ownedFourYears": "yes",
    "propertyCounty": "Alamosa",
    "propertyListed": "no"
   },
   "price": null,
   "temperature": "HOT",
   "cadence_name": "NEW_LEAD",
   "cadence_step": 0,
   "cadence_started_at": "2026-11-03 05:51:50.085652",
   "next_action_type": null,
   "next_action_due": null,
   "next_action_script": null,
   "last_activity_at": "2026-11-03 16:18:21.284",
   "last_activity_type": null,
   "last_activity_outcome": null,
   "touch_count": 0,
   "call_count": 0,
   "text_count": 0,
   "email_count": 0,
   "nurture_until": null,
   "dead_reason": null,
   "map_uploaded": true,
   "map_image_url": "https://snfttvopjrpzsypteiby.supabase.co/storage/v1/object/public/lead-maps/3ad3bcbf-338c-4384-aecf-c240bc607a76/1793719739307-720.png",
   "current_owner_id": "e22c5965-78d7-461e-bdbd-f1af6f415603",
   "pipeline_status": "APPT_SET_FOR_JORDAN",
   "sms_opt_out": false,
   "pb_line_id": null,
   "offer_amount": null,
   "offer_confirmed": false,
   "deal_direction": null,
   "follow_up_bucket": null,
   "follow_up_step": 0,
   "follow_up_started_at": null,
   "next_follow_up_at": null,
   "lost_reason": null,
   "last_contact_at": "2026-11-03 16:18:17.277+00",
   "last_contact_dir": "outbound",
   "last_contact_channel": "call",
   "last_contact_preview": "Call \u00b7 4m 56s",
   "last_call_at": "2026-11-03 16:18:17.277+00",
   "last_call_outcome": "spoke",
   "partner_pushes": [],
   "last_call_duration": 296,
   "partner_summary": null,
   "partner_coordinates": null,
   "clean_view": false,
   "clean_view_at": null,
   "lead_maps": [
    {
     "id": "3ad3bcbf-338c-4384-aecf-c240bc607a76/1793719739307-720.png",
     "url": "https://snfttvopjrpzsypteiby.supabase.co/storage/v1/object/public/lead-maps/3ad3bcbf-338c-4384-aecf-c240bc607a76/1793719739307-720.png",
     "kind": "upload",
     "label": "Michael Hall"
    }
   ],
   "offer_terms": {},
   "offer_pdf_url": null,
   "clean_view_2": true,
   "clean_view_2_at": null,
   "gclid": "CjwKCAiAhqHXBhAXEiwATbksU3_IuOrFSPqm2pD6cP8tvqzq061nK6MDhtSaxDG0t-fshbgcG5c8ihoCuJoQAvD_BwE",
   "gbraid": null,
   "wbraid": null
  }
 ],
 "appointment_tasks": [
  {
   "id": "126e59c0-932e-457b-a0ca-43d9d3f8a3b6",
   "lead_id": "1cdd6495-23e4-4893-8b2a-6656ffffe2dc",
   "team_id": null,
   "assigned_to": "e22c5965-78d7-461e-bdbd-f1af6f415603",
   "created_by": "01bfe313-644a-40c6-847c-ae3a8426e54d",
   "task_type": "meeting",
   "title": "Appointment with Lisa Lindsay",
   "description": "Booked by Anthony \u00b7 ET",
   "due_at": "2026-11-04 21:00:00+00",
   "reminder_at": null,
   "status": "pending",
   "completed_at": null,
   "completed_by": null,
   "priority": "high",
   "metadata": {},
   "created_at": "2026-11-03 15:15:50.119341+00",
   "updated_at": "2026-11-03 15:15:50.119341+00",
   "source": null
  },
  {
   "id": "88b8b723-82cd-4dc9-a7a7-0f44c8f298ab",
   "lead_id": "3ad3bcbf-338c-4384-aecf-c240bc607a76",
   "team_id": null,
   "assigned_to": "01bfe313-644a-40c6-847c-ae3a8426e54d",
   "created_by": null,
   "task_type": "callback",
   "title": "Call Michael Hall  (no reply to text)",
   "description": "Texted, no reply yet, call to keep momentum",
   "due_at": "2026-11-04 15:00:00+00",
   "reminder_at": null,
   "status": "completed",
   "completed_at": "2026-11-03 16:12:15.972+00",
   "completed_by": null,
   "priority": "normal",
   "metadata": {},
   "created_at": "2026-11-03 15:31:07.897126+00",
   "updated_at": "2026-11-03 15:31:07.897126+00",
   "source": null
  },
  {
   "id": "2c160960-f666-4909-99d8-b85696e4b63d",
   "lead_id": "3ad3bcbf-338c-4384-aecf-c240bc607a76",
   "team_id": null,
   "assigned_to": "e22c5965-78d7-461e-bdbd-f1af6f415603",
   "created_by": "01bfe313-644a-40c6-847c-ae3a8426e54d",
   "task_type": "meeting",
   "title": "Appointment with Michael Hall ",
   "description": "Booked by Anthony \u00b7 CT",
   "due_at": "2026-11-04 18:00:00+00",
   "reminder_at": null,
   "status": "pending",
   "completed_at": null,
   "completed_by": null,
   "priority": "high",
   "metadata": {},
   "created_at": "2026-11-03 16:18:21.823727+00",
   "updated_at": "2026-11-03 16:18:21.823727+00",
   "source": null
  }
 ],
 "phone_dupe_check": [
  {
   "name": "Michael Hall ",
   "id": "3ad3bcbf-338c-4384-aecf-c240bc607a76",
   "pipeline_status": "APPT_SET_FOR_JORDAN",
   "status": "appt_set_for_jordan",
   "p10": "6605255649",
   "created_at": "2026-11-03 05:51:50.085652+00"
  },
  {
   "name": "Lisa Lindsay",
   "id": "1cdd6495-23e4-4893-8b2a-6656ffffe2dc",
   "pipeline_status": "APPT_SET_FOR_JORDAN",
   "status": "appt_set_for_jordan",
   "p10": "8043147011",
   "created_at": "2026-11-03 14:25:40.651129+00"
  }
 ]
}
```


### Starting price shows band "From the $150s" instead of exact dollar (haven-ground ee74d71)
- **What:** startingFromLots now returns the band "From the $Ns" (lowest lot price floored to $10k) instead of the exact "From $150,175". Still from the lot table so it auto-updates on repricing; fallback to price-range text when no priced lots. Applies to cards, map popups, detail hero, sticky bar. Files: `app/properties/page.js`, `app/properties/[slug]/page.js`.
- **Tested/proof:** deployed; live /properties shows Gilbert "From the $150s", Oak Hill "From the $90s", no exact-dollar prices.
- **Undo:** `git revert ee74d71`. **Google Ads touched?** No.

### Fixed wrong-listing (Mallards Bend) flash on listings not in bundled static data (haven-ground ae27e0b)
- **What:** Clicking a listing not in the bundled `propertiesData` (e.g. Gilbert Ranch, DB-only) briefly flashed Mallards Bend because initial state fell back to `propertiesData[0]` until the Supabase fetch resolved. Now a non-matching slug uses a neutral slug-keyed placeholder and shows a loading spinner until real data loads; static-matched slugs render instantly as before. File: `app/properties/[slug]/page.js` (makePlaceholderProperty + propertyLoaded guard).
- **Tested/proof:** build passed; deployed; Gilbert SSR HTML has 0 "Mallards Bend"; live /properties/gilbert-ranch shows Gilbert Ranch / Lovelady TX / Tract 1, no Mallards, no error.
- **Undo:** `git revert ae27e0b`. **Google Ads touched?** No.

### Listing face cards show auto starting price + map hardened; client-error note (haven-ground e989ff8)
- **What:** The /properties listing "face cards" and map popups were still showing the stale `priceRange` text ("From the $140s") while the detail page showed the auto "From $97,000". Added displayStartingPrice (lowest lot price from lotTable, fallback to price-range text) and applied it to the card + popup. Also hardened the detail map: lat/lng coerced to Number and map init skipped when not finite, so a coordinate-less listing can't throw on setView. File: `app/properties/page.js`, `app/properties/[slug]/page.js`.
- **Client-side error reported by Jordan ("error when you click a property"):** Could not reproduce on the live site after the map-fix deploy (9667a72) — every property renders clean (map + form + "From $97,000", no error boundary). Most likely cause was a stale-bundle / chunk-hash mismatch from the rapid broken intermediate deploys (9023cbb blank-map/zoom state): a tab holding old HTML tries to fetch a JS chunk the new deploy replaced -> ChunkLoadError. Resolves on a hard refresh; current deploy is stable. The null-coordinate map guard removes one real uncaught-throw path regardless.
- **Tested/proof:** build passed; deployed; verified live /properties shows Oak Hill card "From $97,000" (old "$140s" gone); /properties/oak-hill full page renders with no error.
- **Undo:** `git revert e989ff8`. **Google Ads touched?** No.

## 2026-11-02

### Oak Hill page: banners reworked, Schedule-a-Tour CTAs wired, auto starting price (haven-ground e818566, e625c6f)
- **What:** Added the two Oak Hill banners (TeraFab growth, Washington County location) before the inquiry form, each with its own short lead-in (no shared title, no extra button). Wired up the 7-step "Schedule Your Visit" scheduler (showCalendar) that previously no button ever opened: the sticky-bar CTA is now "Schedule a Tour" and opens it, the three dead lot-card "Schedule a Tour" buttons open it, and "Request Info" buttons scroll to the inquiry form. Hero + sticky price now derive the starting price from the lot table (startingFromLots -> "From $97,000") with fallback to the price-range field. File: `app/properties/[slug]/page.js`; banners in `public/property-banners/`.
- **Tested/proof:** build passed; deployed; verified in-browser on /properties/oak-hill: sticky reads "From $97,000" + "Schedule a Tour", clicking opens the scheduler (Step 1 of 7), banner button removed.
- **Undo:** `git revert e818566 e625c6f`. **Google Ads touched?** No.

## 2026-11-01

### Custom branded feature icons on property detail pages (haven-ground 787e424)
- **What:** Replaced the generic heroicons for Access / Power / Water / Sewer / Topography on the property detail page with Jordan's custom Oak Hill icon set (green line + tan accent). Icons in `public/property-icons/`, placed in the existing tiles. File: `app/properties/[slug]/page.js`.
- **Tested/proof:** build passed; deployed; verified in-browser on /properties/mallards-bend: all 5 `property-icons` images load (512x512) and render in the Features tiles.
- **Undo:** `git revert 787e424`. **Google Ads touched?** No.

### Plat/survey reader + documents (plat, survey, brochure) with show-on-site (haven-ground d21e8e7)
- **What:** Documents section UNDER the lot/tract table in the listing editor. "Plat / survey" upload stores the file (downloadable) AND reads its lots into the Tracts table via Claude vision (optional price-per-acre computes each lot price); "Brochure" upload stores only. Each doc shows a small preview (not photo-sized), a "Show on site" checkbox, open link, remove. Public property page renders Download links under the description for any doc marked Show on site. Files: `app/api/ai/read-plat/route.js` (new vision/PDF route), `lib/admin-properties.js` (uploadDoc + documents:[] in blankProperty), `app/admin/page.js` (Documents UI + handlers), `app/properties/[slug]/page.js` (public download links).
- **Why:** Jordan wanted to upload a plat to auto-curate lots/pricing, plus a brochure, with optional downloadable links on the site.
- **Storage:** reuses the pfbft `property-photos` bucket under `docs/<slug>/` (verified: public, no MIME restriction so PDFs upload, no size cap).
- **Tested/proof:** build passes, both AI routes registered; vision path returns clean JSON on a generated test image (no invented lots); prior tract-generation live test passed. Deployed (d21e8e7f8 ready): havenground.com/admin 200, /properties/gilbert-ranch 200, /properties 200, /api/ai/read-plat live (empty POST -> 400).
- **Follow-up (8e1e4f4):** plat read was failing with "Unexpected end of JSON input" (base64 PDF overran the function body limit / timed out). Fixed by sending Claude the file's public URL instead of base64; client parses defensively (file still saved on failure). Verified on the real Gilbert Ranch plat: read 5 tracts with acreages 10.58/10.92/11.19/12.7/21.29. Added a manual "Build / price tracts" box (count + acres each + price per acre -> Fill, or Apply $/acre to existing rows) for the no-plat case. UI: removed Windows-style blue focus outline on buttons/tabs (outline:none), active tab gets a soft brand ring.
- **Undo:** `git revert d21e8e7` (+ 8e1e4f4).
- **Follow-ups (d0b3a4a, 237941b):** added a per-document "Read lots" button to re-read an already-uploaded plat without re-uploading (shares readLotsFromUrl). Fixed editor losing state on refresh: the open listing is kept in the URL hash (#edit=<id>) and reopened after load, and the working copy is autosaved to localStorage per listing and restored on mount (cleared on Save/Back) so AI/plat edits survive a reload. "Fill tracts" now requires "Acres each" and points to Read lots for different-sized tracts instead of building empty rows. Verified: deployed, /admin 200; live read-plat endpoint reads the real Gilbert Ranch PDF in ~5s.
- **Follow-up (e1ea2b6):** price range auto-normalizes to the house convention "From the $Ns" (editor on blur + AI fill, and all public displays format any stored value), so a bare "$70s" shows "From the $70s". Verified live in-browser: ranches-at-forrest now renders "From the $70s" without re-saving.
- **Follow-ups (f42dcde, 1cf0662):** (a) editor was flashing the wrong listing on click (state reuse) -> now keyed by id for a fresh mount, and a restored draft must match the listing id; (b) public property page hides the "Speak with our agent" box when the agent fields are empty (per "drop anything not filled in"); (c) listings page loads live order first with a brief skeleton instead of flashing the stale static order; (d) lot prices auto-format to currency (editor on blur + public display formats any stored value, so "$387000" shows "$387,000"), ranges/words left untouched. Verified: deployed, /admin + /properties + /properties/gilbert-ranch all 200.
- **Google Ads touched?** No.

### AI draft box in the listing editor, Phase A (haven-ground b411eb9)
- **What:** New "Draft with AI" panel on the admin Edit-listing screen. Owner pastes freeform notes; Claude fills Basics/Description/Location fields + writes the description in HG voice, for review before Save. Files: `app/api/ai/listing-draft/route.js` (new server route), `app/admin/page.js` (AI panel + applyDraft merge).
- **Why:** Jordan wanted one box to fill the whole listing and craft the description from what he tells it. (Phases B = photos-from-link, C = plat upload -> lots/pricing still pending his two decisions.)
- **Rules enforced:** uses ONLY facts in the notes (never invents acreage/price/county/utilities), status/type picked from the allowed dropdown enums, NO em dashes (model instruction + server-side strip), never "owners anywhere". Nothing saves until the user hits Save. Uses existing ANTHROPIC_API_KEY, model claude-sonnet-4-5-20250929.
- **Tested/proof:** build passed, route registered; live Claude call on a Gilbert Ranch sample returned parseable JSON (title/location/status=coming-soon/type=single/price/acres/county/features/description), zero em dashes, no invented facts. Deployed (Netlify b411eb903 ready): havenground.com/admin 200, /api/ai/listing-draft live (empty POST -> 400 as designed).
- **Follow-ups same day:** (ab756c3) fixed empty "complete" message (filled-list was built inside setForm's updater, read before it ran) + added loud status banners (Drafting / green complete / red error), panel open by default. (0472613) AI now also fills the Lots/Tracts table: route returns lotUnit + lotTable when the notes give a lot count (uses given sizes, splits total acreage evenly, or computes price from price-per-acre); applyDraft normalizes blank/numeric lot names and clamps status to Available/Pending/Sold. Live-tested; both deployed (admin 200).
- **Undo:** `git revert b411eb9` (+ ab756c3, 0472613).
- **Google Ads touched?** No.

### Fixed properties reorder on havenground.com (haven-ground da2cf30)
- **What:** The public `/properties` page defaulted to "Featured First", which forced every non-featured listing below the featured ones and overrode the admin drag order (sort_order). Gilbert Ranch (sort_order 0, coming-soon/not featured) could never sit first. Files: `lib/properties-data.js` (keep sort_order on each returned listing), `app/properties/page.js` (new default sort "Recommended" = sort_order ascending; "Featured First" kept as an optional dropdown choice).
- **Why:** Jordan's admin reorder must be the order on the site. He chose "admin order wins."
- **Tested/proof:** build passed; CMS query confirms Gilbert Ranch sort_order=0 featured=false (matches admin list). Deployed (Netlify da2cf309d ready); live havenground.com/properties verified in-browser: default sort = "Recommended", order Gilbert Ranch -> Mallards Bend -> Oak Crest Estates (matches admin), 16 found. Smoke test: /, /properties, /sell-your-land, /thank-you, /lp/inherited-land all 200.
- **Undo:** `git revert da2cf30` (restores Featured First default).
- **Google Ads touched?** No.

### Dispo Center Phase 1 (DB): created buyer_leads + buyer_activities (snfttv/LandQueue)
- **What (SQL run via Supabase Management API, saved as `supabase/migrations/2026-11-01_buyer_leads.sql`):**
  - `create table public.buyer_leads (...)` with generated `phone_norm` (last 10 digits).
  - `create unique index buyer_leads_phone_norm_uidx on public.buyer_leads(phone_norm) where phone_norm <> ''` (DB-level duplicate-phone block).
  - `create index buyer_leads_stage_idx` ; `create index buyer_leads_created_idx`.
  - `create table public.buyer_activities (...)` + `create index buyer_activities_lead_idx`.
  - `alter table buyer_leads enable row level security` ; `alter table buyer_activities enable row level security`.
  - `create policy "buyer_leads authenticated all" ... for all` ; `create policy "buyer_activities authenticated all" ... for all`.
  - `alter policy "buyer_leads authenticated all" on public.buyer_leads to authenticated` ; same for buyer_activities (tightened role from public to authenticated).
- **Why:** Buyer pipeline fully separate from the seller `leads` table (no shared source). RLS + authenticated-only + service-role endpoint keep the public site key out. Unique index blocks duplicate buyers.
- **Tested/proof:** tables exist, `relrowsecurity=true` both; policies now `{authenticated}`; anon-key INSERT rejected with `42501 row-level security policy`; dup-phone test returned `dup_blocked=t phone_norm=5551112222` inside a rolled-back txn (table still `rows=0`, no test data left); daily backups confirmed enabled (8 daily physical backups, latest 2026-11-01, COMPLETED) before running.
- **Undo (needs Jordan's explicit yes):** `drop table public.buyer_activities; drop table public.buyer_leads;` (also in the migration file header).
- **Google Ads touched?** No.

### FINDING (not changed — needs explicit yes): seller `leads` table has RLS OFF -> anon key can read all leads
- **What:** `pg_class.relrowsecurity=false` on `public.leads`; a live read with the public anon key returned `content-range: 0-999/1291` (all seller leads, phones included). The anon key ships in the website client JS.
- **Why it matters:** anyone with the public key can pull every seller lead. Pre-existing; unrelated to the buyer work.
- **Proposed fix (await yes):** `alter table public.leads enable row level security;` (policies already exist: anon INSERT for the site form, authenticated SELECT/UPDATE for the CRM) after confirming CRM reads use an authenticated session, not the anon key. Undo: `alter table public.leads disable row level security;`
- **Google Ads touched?** No.


### 18:30 — Em-dash/copy rules applied: themed pages + RSA replacement
- **New standing copy rules:** NO em dashes anywhere (periods/commas; hyphens like 6-12 ok); never "live anywhere"/"owners anywhere" — say "we work with out-of-state owners."
- **Themed pages (haven-ground ee62ee1):** removed all em dashes from the 3 page subheads + the shared SellLandForm body copy; applied the approved inherited paragraph; replaced "owners anywhere" with "We buy parcels 2 acres and up and work with out-of-state owners every day." **Headline overflow fixed** — h1 now text-3xl→5xl + break-words + text-wrap:balance so long headlines wrap instead of clipping. Verified all 3 pages desktop + mobile.
- **New RSA replacement (Google Ads):** old 830246324765 was APPROVED (Realtor fine), so created dash-fixed replacement **830173261108** (ENABLED, unpinned, 15 headlines: "Skip 6-12 Months on Market"; D1 hyphen; D2 "We buy 2+ acre parcels and work with out-of-state and inherited owners every day.") then **removed 830246324765**. validateOnly passed first; read-back confirms. Other ads untouched (779406220487 ENABLED; 802511265243 now PAUSED — Jordan paused it himself; 747/802628 PAUSED).
- **Undo:** `git revert ee62ee1`; re-enable 830246324765 / remove 830173261108.
- **Google Ads touched?** Yes — RSA replaced (1 created, 1 removed). Additions + the approved replacement only; no other ad touched.

### 17:30 — ADDED 4 sitelinks to Trial 220 + fixed deleteLead tracking cleanup
- **Sitelinks (Google Ads, additions only):** created + linked 4 sitelinks to campaign 22464770148, all ENABLED: "Inherited Land" → /lp/inherited-land, "Tired of Land Taxes?" → /lp/back-taxes ("Paying taxes on land you don't use?" / "We can still make a fair offer"), "How We Price Land" → /lp/how-we-price-land, "Sell Your Land" → /sell-your-land. validateOnly passed first; read-back confirms all 4 ENABLED with correct text/URLs. New ad + existing ads untouched.
- **deleteLead fix (parcelreach e3d33b5):** `app/admin/land/LandApp.js` — tracking_step_events/tracking_click_events reference the STRING `session_id` ("ses_…"), not the integer `tracking_sessions.id`; the cleanup now deletes children by that string key only. Verified: a lead + tracking session + step event deletes cleanly (lead delete SUCCESS, 0 remaining). Build passed.
- **Undo:** remove the 4 sitelink campaign_assets; `git revert e3d33b5`.
- **Google Ads touched?** Yes — 4 sitelinks added (additions only).

### 16:10 — Stopped publishing the Change Log to the public website
- **What:** Deleted `public/changelog-tracking.md` (it was served at parcelreach.ai/changelog-tracking.md, exposing customer names + deal values publicly). The CRM "Change Log" tab now reads an **admin-only** route `GET /api/changelog` (Bearer session token; reads `docs/CHANGELOG-tracking.md` via fs, bundled via `outputFileTracingIncludes`). **No more public mirror** — this log lives only in the repo's `docs/` + the admin route.
- **Why:** The public copy leaked seller names and deal values on the open web.
- **Tested/proof:** Build passed; `/api/changelog` compiled; public file removed. (Note: `docs/CHANGELOG-tracking.md` still sits in the git repo — if that repo is public, say the word and I'll scrub names / move it out.)
- **Undo:** restore `public/changelog-tracking.md` and revert the CRM fetch.
- **Google Ads touched?** No.

### 16:00 — Themed pages post-deploy verification (GATE NOT yet met)
- **Qualified_Lead still fires TWICE** on /thank-you after the GA4 save (load `_s=2` + scroll `_s=4`). The browser sends `en=Qualified_Lead` directly, which points to the **GTM container (GTM-5VBRW53D)** firing a "Qualified_Lead" GA4 Event tag on **two triggers (page view + scroll depth)** — so the fix likely belongs in **GTM** (remove the scroll trigger), not the GA4 create-event rule. (Or GA4 change needs propagation time.)
- **Test lead not found:** no website-form lead saved in the last 12h; `landing_page` has never been populated by a real submission; most recent website-form lead was 2026-10-30. The submitted test did not reach the CRM — the lead only saves **after** phone OTP verifies, so the 16-step form wasn't fully completed. **The save path itself works** — verified the exact anon-key insert (source=website + gclid + landing_page) succeeds, then deleted it. Nothing to delete (no lead created).
- **Gate for sitelinks (still held):** Qualified_Lead firing once + a confirmed click-through lead. Neither met yet.
- **Google Ads touched?** No.


### 15:30 — DEPLOYED 3 themed landing pages (haven-ground addcc0c) — additions only, verified live
- **What:** `components/SellLandForm.js` (shared form, exact copy of the /sell-your-land submit flow) + `app/lp/inherited-land`, `app/lp/back-taxes`, `app/lp/how-we-price-land`. Copy leads with the winning message (inherited / too much land / tired of taxes). Staged 4 named files only (no git add -A, no designer WIP); `/sell-your-land` + homepage NOT edited.
- **Same tag confirmed:** insert writes `source: 'Haven Ground - Sell Your Land Form'` (SellLandForm.js:460) — identical to /sell-your-land, so the uploader sends these leads to Google — plus `form_data.landing_page` (:490) to tag the page.
- **Verified live:** homepage still "Our Land is Your Haven"; /sell-your-land still "Ready to Sell Your Land" (unchanged, 200); all 3 /lp pages 200. Click-ID capture on /lp/inherited-land: `hg_gclid=TEST123`, `hg_landing` = the themed page URL, `_gcl_aw` set. Save shape: inserted one lead per page (source=website, gclid=TEST123, landing_page set, landing_url set), **uploader-eligible=true**, then deleted (0 lingering).
- **Open:** (1) `/thank-you` still fires **Qualified_Lead twice** (load + scroll) — the GA4 page_view-only rule hasn't propagated yet; shared behavior, not page-specific. (2) Full click-through test is blocked by the form's real Telnyx OTP (no test bypass) — a true UI submission needs a real phone; code line + representative inserts stand in. 
- **Not done (held):** no sitelinks added, no ads pointed at these pages.
- **Google Ads touched?** No.

### 14:30 — Read-only ad audit: "#1" ad status, pinning vs performance, auto-apply (no changes)
- **Change history:** ad 802511265243 ("…Americas #1 Land Buyer", POOR) has **no status change in the last 30 days** — API `change_event` is hard-capped at 30 days (START_DATE_TOO_OLD), and it's served for 90+ days, so the re-enable predates the API window. When/who/tool is only in the **UI Change history**. Last 28 days: all 19 change events were `GOOGLE_ADS_API` (my additions); **no auto-apply (GOOGLE_ADS_RECOMMENDATIONS) or web-client changes**.
- **Auto-apply:** pending recommendations present (Search Partners opt-in, Display expansion, Performance Max opt-in, broad match, raise tCPA, dynamic image ext.) — the auto-apply ON/OFF toggle isn't API-readable; recommend turning it OFF in UI.
- **Performance (90d):** inherited 779406220487 = 11.85% conv rate / $99 cost-per-conv; "#1" 802511265243 = **8.63% / $108** (worst enabled). CTR nearly equal (6.7% vs 6.6%).
- **Pinning finding (corrects my earlier call):** the inherited ad is pinned **by role** (H1 hook / H2 benefit / H3 CTA) with multiple options each — not "every headline jammed in one slot." Equal CTR + far better conversion ⇒ the driver is the **message** (inherited/taxes/too-much-land → motivated sellers), not pinning. Ad Strength (AVERAGE) did not predict performance. **Retracting the blanket "unpin everything"** as a rule for this account.
- **Accountability:** earlier I listed this ad as ENABLED/POOR but did a "what to add" review, not "what to turn off" — I failed to flag it for pausing, missed the live "#1" claim (also in the inherited ad), and didn't check change history. Owned.
- **Recommendation (not applied):** pause 802511265243; keep 779406220487 (consider dropping its "#1" H1 option); let the new RSA run, judged on conversion rate vs the inherited ad; turn off auto-apply.
- **Google Ads touched?** No — read-only.

### 13:45 — ADDED to Google Ads: new unpinned RSA + 8 callouts + 1 snippet (approved, additions only)
- **What:** Created in campaign "Haven Search/Conv  Trial 220" (22464770148), ad group "Ad group 1" (177053741734):
  - **New RSA, ad id `830246324765`** — ENABLED, **unpinned** (0 pinned), 15 headlines (with the 3 approved swaps: "Haven Ground Land Buyers", "Sell Your Land the Simple Way", "Cash Offer for Your Land"; kept "Inherited Land Out of State?", "Sell Without Listing Your Land", "We Buy Land Nationwide"), 4 descriptions, final URL `/sell-your-land`, paths Sell-Your-Land/Fair-Offer.
  - **8 callouts + 1 structured snippet** (Service catalog) linked at the campaign level, all ENABLED.
- **Method/proof:** validateOnly:true passed first (nothing created), then real create. Read-back confirms: new ad ENABLED + unpinned + correct text, review_status=REVIEW_IN_PROGRESS; 9 campaign_assets ENABLED; the **4 existing ads untouched** (747782993514 PAUSED, 779406220487 ENABLED, 802511265243 ENABLED, 802628739962 PAUSED). No edits/pauses/removals of anything existing.
- **Pending:** ad is under Google review (strength=PENDING until it computes). If Google disapproves anything for "Realtor," swap to "Agent" (RSA text is immutable → create replacement, remove this one).
- **Undo:** set ad `830246324765` to PAUSED or REMOVED; remove the 9 campaign_assets (8 CALLOUT + 1 STRUCTURED_SNIPPET) from campaign 22464770148. Nothing else changes.
- **Google Ads touched?** YES — first additive change. Additions only; no bids/budget/goals/existing ads touched.

### 13:00 — Ad handoff drafts: revised RSA + themed page copy + 180-day market data (review only, nothing added/deployed)
- **What:** Revised RSA leading with the real pitch (skip 6–12 months on market / no listing / no realtor / sure closing) + 2+ acre qualifier + out-of-state-owner headlines; 15 headlines, 4 descriptions, 8 callouts, snippet — all verified within Google char limits. Themed page copy for inherited land, back taxes, how we price land (same form + /thank-you, FB pixel + Google tags only, 2+ acres + owner-anywhere). `docs/ad-handoff-rsa-pages-market-2026-10-31.md`.
- **180-day market data (CRM):** 793 website leads; proven deal value concentrates in **TX $400k, CA $340k, AL $290k, OK $200k, WA $200k, MI $180k**; AZ (49 leads/$0) + Costilla/Mohave counties = cheap-land volume with no proven value. Deal value = reviewed worth on contracts (a floor). Ads spend-by-state not included (geographic_view API field errors — use UI Locations report).
- **Guardrail:** additions only; nothing edits/pauses/removes anything in Trial 220. Sitelinks stay on hold until themed pages are live + verified. "We Buy Land Nationwide" flagged to confirm before use.
- **Undo:** N/A (drafts only). **Google Ads touched?** No.

### 12:15 — Ad drafts for review (nothing added to Google)
- **What:** Drafted the new unpinned RSA (15 headlines + 4 descriptions, honest-expert voice, all within Google char limits) and the full asset set (4 sitelinks → themed pages inherited/back-taxes/how-we-price-land + /sell-your-land; 8 callouts; 1 structured snippet; a held call asset; image/logo recommendations using the real drone/parcel photos + a ≥1200px logo to replace the 32×32). Lead-form asset skipped per request. `docs/ad-rank-ads-and-assets-drafts-2026-10-31.md`.
- **Guardrail baked in:** sitelinks stay on HOLD until their themed pages are live + verified (form submits, Qualified_Lead fires once, click ID saved); every sitelink lands on a page with the Sell Your Land form + /thank-you, never homepage/info pages.
- **"Dispo lead form" answered:** WEBPAGE_CODELESS / SUBMIT_LEAD_FORM, primary_for_goal=true but **include_in_conversions_metric=false** → Google auto-created, NOT in the conversions metric, so it does **not** drive the seller campaign's bidding. Tidy via UI: campaign-specific goals (Qualified_Lead only), then set Dispo to Secondary.
- **Undo:** N/A (drafts only).
- **Google Ads touched?** No.

### 11:30 — Click-ID coverage check + 6-point Google reporting verification (read-only) — 4/6 verified, 2 open
- **Coverage since Oct 16:** 49 website leads, **43 have a click ID (88%)**, 6 missing — all dated **Oct 16–27** (pre/at the capture fix), all with no landing URL. **Zero missing since Oct 28** → the leak appears plugged for recent leads (site-wide ClickIdCapture deployed 10-29, landing-URL 10-31). Missing: Oct 27 (no name), Oct 24 (no name), Oct 22 Donnell Smith, Oct 21 Benjamin Blanco, Oct 19 (no name), Oct 16 Cody Smith.
- **1) Named leads in Google — mostly ✓, one correction.** Benny Butler (Reviewed $6,500 + Contract $58,500), Spivey ($11,250 + $90,000), Newton ($7,000 + $63,000), Joe Borden ($4,000 + $36,000) — all uploaded 10-31 **with gclid (Click-ID match)**. **Killian:** only his archived echo (d00e7be4) exists; his $36k contract was uploaded **10-27 via enhanced (email/phone) match, NOT a click ID** — the earlier "re-sent with gclid on 40c80569" could not be confirmed (**that record does not exist in the DB**). No double (single send).
- **2) Uploader run log — ✓.** Hourly runs ok=true, 0 errors, caught up (sent=0/to_send=0; backlog cleared).
- **3) Offline/Data Manager diagnostics, no warnings — ✓.** `offline_conversion_upload_client_summary` status=**EXCELLENT**, 5/5 successful, 0 pending/failed. validateOnly preview accepted 28 Reviewed + 15 Contract, **0 rejected**.
- **4) Qualified_Lead only Primary + account-default OFF — ⚠️ PARTIAL.** Qualified_Lead = **Primary, in Conversions metric** ✓; Reviewed/Contract/Closed = **Secondary (not in metric)** ✓. BUT **"Dispo lead form" also shows primary_for_goal=true** (separate dispo goal, not in the conv metric), and the campaign's goals still mirror the **account defaults** (SUBMIT_LEAD_FORM + QUALIFIED_LEAD + CONVERTED_LEAD present). Needs a UI action: confirm Qualified_Lead is the only Primary and switch the campaign to campaign-specific goals (account-default OFF).
- **5) Enhanced Conversions active — ✓.** `enhanced_conversions_for_leads_enabled=true`, `accepted_customer_data_terms=true`; hashed uploads accepted.
- **6) GA4 Qualified_Lead page_view-only fix — ✗ NOT DONE.** Live test: Qualified_Lead **still fires twice** per /thank-you load (page_view `_s=2` + scroll `_s=4`), to GA4 and Google Ads. Before = 2, after = **still 2**. The GA4 "Create event" rule has not been scoped to `event_name = page_view`. This is a **GA4 Admin change only (no API/tool access here)** — cannot be done from code.
- **Conclusion:** Did **NOT** write "Google reporting verified" — points 4 (partial) and 6 (not done) do not pass. Open items: apply the GA4 page_view-only rule; in Google Ads UI confirm sole-Primary + account-default-off on the lead goals.
- **Google Ads touched?** No — all read-only.

### 10:30 — Manual Google Ads conversion backup + hand-upload files + on-lead Google Ads box (parcelreach a8e0b07)
- **What:** Built the same-day manual fallback for when the automatic uploader is off/broken.
  - `lib/googleConversions.js` + `/api/google-export` (admin-gated): **raw backup CSV** (every website lead — created date, name, phone, email, gclid/gbraid/wbraid, landing URL, lean, worth, reviewed/contract value + sent status) and **two classic "Upload conversions" CSVs** (Reviewed Lead, Contract Signed) with Google Click ID, Conversion Name, Conversion Time (+`Parameters:TimeZone=America/Chicago`), Value, Currency, and SHA-256 Email/Phone for enhanced conversions. Reuses the uploader's exact value + hashing.
  - **Daily snapshot** (`netlify/functions/lead-export-snapshot.mjs`, 07:30 UTC) writes all three to a **PRIVATE `lead-backups` Supabase bucket** (RLS, not public). Nothing in the repo or `/public`; no phone/email in any repo file.
  - **CRM:** "Download lead backup / Google file: Reviewed Lead / Contract Signed" buttons in the Google Upload Queue (with a "only hand-upload when Auto-upload is OFF — else double-count" warning), an **"Export for Google"** button on the leads toolbar, and a **"Google Ads" box on every lead** (click ID + red "⚠️ No click ID" warning, landing page, and what/when/how-much was sent to Google).
  - **Permanence verified (no code change needed):** dedupe is display-only, merges spread-merge `form_data`, and the lead-detail Save doesn't touch `form_data`/`gclid` — so click IDs/values are never overwritten on edit/merge/dup.
- **Proof:** backup rows **1,203 = 1,203** Supabase website leads (`match: true`). Google **validateOnly preview accepted 28/28 Reviewed + 15/15 Contract, 0 rejected** (request IDs returned; nothing recorded). Sample reviewed+sent lead retains gclid+gbraid+lean+worth ($70k)+review value ($175)+sent date — box screenshot sent. Build passed.
- **Undo:** `git revert a8e0b07`.
- **Google Ads touched?** No — validateOnly records nothing; the manual files are a **standby only** (do not hand-upload while the auto-uploader is ON, or Google double-counts).

### 09:45 — Themed landing pages plan + copy drafts (read-only, nothing built)
- **What:** Plan to match search themes to dedicated landing pages (we-buy, sell-general, inherited, optional state template), all reusing the identical submit flow + tagging `form_data.landing_page` to compare pages. Wrote `docs/themed-landing-pages-plan-2026-10-31.md`.
- **Key points:** Current /sell-your-land measured = 223KB transfer / 222KB JS / 50 req / FCP ~0.68s / load ~1.16s; FB Pixel alone is 219KB. Themed pages planned in an isolated route group with lean layout (GTM+GA4 only) → target <120KB JS, FCP <0.5s. Form is inline (1,711 lines) → extract flow into `components/SellLandForm.js` (copied logic, lean markup); original page untouched. Test = combined themed-ad-groups + pages campaign Experiment (50/50), or Final-URL-only 50/50 to isolate page effect. UI freeze = designer's in-flight visual redesign; new isolated routes don't touch it.
- **Undo:** N/A (read-only; nothing built).
- **Google Ads touched?** No.

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
