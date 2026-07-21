# Phase 0 — Discovery Findings (LandPortal API v2)

Ran live against `https://api.landportal.com/v2` with `LANDPORTAL_JWT` (the `lp_live_...` key).
Raw artifacts: `docs/landportal_filters.json` (100 filters), `docs/landportal_fips_values.json`
(3,233 counties), `docs/landportal_mls_propertytype_values.json`.

## Auth / envelope (confirmed live)
- Bearer token in `Authorization`. The `lp_live_...` opaque key works; the JWT-style tokens 401.
- Success envelope: `{ data, meta }`. Errors: `{ message, error{ code, message, request_id, fields } }`.
- `POST /v2/filter-data` body shape (DIFFERENT from v1):
  - **`fips` is TOP-LEVEL** (array), OR `geometry.bbox` / `geometry.polygon` top-level. One is required.
  - **`filters` is an ARRAY** of `{ key, operator, ... }` objects (v1 used a keyed object).
  - `page_size` is NOT accepted; results cap at 100 rows/page, `data.next_page_token` cursors.
  - `range` operator uses `comparison:"is_between"`, `include_nulls:false`, `value:{min,max}` (min-only allowed).
- `meta` on a successful filter: `{ requests_left, results_limit }`.
  - Smoke test meta: `requests_left: 99998`, `results_limit: 50000`. **Daily quota is ~100k** (huge).
  - Overflow cap is 50,000 (same as v1) — surface "narrow your filters" if a query would exceed it.

## Smoke test (step 4) — PASSED
`fips 47153 (Sequatchie TN)` + `lotsizeacres 30-60` + `vacant true`:
- `data.count: 152`, 100 properties returned + `next_page_token`.
- Property projection: `apn, fips, lot_size_acres, owner_full_name, property_id, street_address`.
- No `rejected_filters`.

## MLS access (step: confirm MLS) — ACTIVE
`fips 53039 (Klickitat WA)` + `mls_for_sale active/180d` + `mls_propertytype [8=Land]`:
- `count: 235`, no `rejected_filters` -> **MLS filtering is entitled**. Phases 2 & 3 are viable.
- IMPORTANT: the filter response projection does NOT include MLS price/PPA/status/DOM even on MLS
  queries. Rich MLS fields must come from `GET /v2/properties/{id}` or the export/comp report.

## The four key-lists

### a) MLS / market (group "MLS", 7 keys)
| key | type | operator | notes |
|---|---|---|---|
| `mls_for_sale` | mls_condition | `{operator:"mls_condition", value:"active", days:N}` | active listings, N-day window |
| `mls_sold` | mls_condition | `{..., value:"sold", days:N}` | sold in last N days |
| `mls_propertytype` | condition (multi, dict) | `{comparison:"is", value:["8"]}` | **8=Land** (also 10 Mobile,13 Townhouse,3 Condo,4 MultiFamily,6 House) |
| `mls_price` | range | is_between {min,max} | |
| `mls_priceperacre` | range | is_between {min,max} | PPA |
| `active_listing_toggle` | active_listing_toggle | `{value:"exclude"|"include"}` | **exclude active MLS listings** (off-market pull) |
| `listing_sold_toggle` | listing_sold_toggle | `{value:"include"|"exclude", days:N}` | |
> **Days-on-market: NO dedicated filter key exists.** `days_on_market` appears on comp records but is
> not filterable. The `days` param on mls_for_sale/mls_sold is a listing-age window, not a DOM range.

### b) Road / access / frontage
| key | group | type | answer |
|---|---|---|---|
| **`road_frontage`** | Location | **range** | **YES, a frontage filter exists and it is a RANGE** (feet). frontage >= 800 => `{operator:"range", value:{min:800}}`. **No GIS step needed for Phase 4.** |
| `land_locked` | Location | boolean | `{value:true/false}` |
No "paved"/"access" keys. Frontage is server-side and numeric — this resolves the Phase 4 branch to the simplest path.

### c) Location
| key | type | notes |
|---|---|---|
| `fips` | condition (multi, dict) | **also settable top-level** (required scope) |
| `situszip5` | condition (vals: county) | ZIP — **supported** |
| `situscity` | condition (vals: county) | City |
| `polygon` | polygon | geometry — **supported** (top-level `geometry.polygon`) |
| `bbox` | bbox | bounding box — **supported** (top-level `geometry.bbox`) |
Plus census tract/block, subdivision, municipality, school district, zoning-area, etc. (30 Location keys total).

### d) Acquisition-relevant
| key | type | notes |
|---|---|---|
| `lotsizeacres` / `calc_acres` / `lotsizesqft` | range | acreage |
| `vacant` | boolean | vacant lots; `vacantflag` = vacant structures (dict) |
| `landusecode` | condition (dict) | land use |
| `out_of_state` / `out_of_county` | boolean | absentee owner |
| `corporate_owned`, `owneroccupied`, `otherpropertiesowned` | bool/dict/range | owner profile |
| `do_not_mail` | boolean | **suppress DNM before any mail export** |
| `currentsalerecordingdate` | date | last sale date, is_between {min,max} ISO |
| `taxdeliquent` (dict) / `taxdeliquentyear` (range) | | tax delinquency |
| `wetlands_cover_percentage` | range | wetlands % (exclude via max) |
| `flfemafloodzone` (dict) / `fema_cover_percentage` (range) | | flood zone / FEMA % |
| `sum_up_to_5/10/15`, `percentage_of_land_with_flat_slope_0_05` | range | slope buckets (min-only ok) |
| `buildability_total_perc`, `buildability_area` | range | buildability |

## Dedup across runs (Phase 4 note)
v2 filter response returns stable `property_id` per parcel — that is the key to persist for the
"never export/mail the same parcel twice" requirement. (Did not see v1's top-level `duplicates` /
`empty_mailing_addresses` params in the v2 filter list; to be confirmed against export docs, but
dedup-by-property_id on our side covers the cross-run requirement regardless.)

## Hot-market county list (all 12 verified in FIPS dict)
04005 Coconino AZ · 04015 Mohave AZ · 06071 San Bernardino CA · 06037 Los Angeles CA ·
08093 Park CO (35-ac subdivision rule — FLAG, don't auto-target) · 08023 Costilla CO (oversupply — let STR decide) ·
37039 Cherokee NC · 55113 Sawyer WI · 53037 Kittitas WA · 53039 Klickitat WA ·
47153 Sequatchie TN · 47123 Monroe TN. All resolved to correct county names.
