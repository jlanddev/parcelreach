# LandPortal API v2 — Overview (captured from api.landportal.com docs)

Spec: **v2.4.0**, OAS 3.1.0
Server: `https://api.landportal.com`

## Authentication
Every endpoint requires an opaque bearer token:

```
Authorization: Bearer <access_token>
```

Tokens are validated by hashed lookup + plan enforcement.
- Invalid / revoked / deleted / expired token -> **401** (`unauthorized` error code)
- Missing scope or plan restriction -> **403**
- Rate / quota exhaustion -> **429**

(We store this token as `LANDPORTAL_JWT` in `.env`, server-side only.)

## Response envelope
Success:
```json
{
  "data": { },
  "meta": { "total": 42 },
  "message": "optional human-readable status"
}
```

Error:
```json
{
  "message": "Human-readable error description",
  "error": {
    "code": "invalid_request",
    "message": "radius_km must be between 0 and 200",
    "request_id": "abc123"
  }
}
```

Validation errors may add a `fields` map inside `error`:
```json
{
  "message": "Validation failed",
  "error": {
    "code": "bad_request",
    "message": "Validation failed",
    "request_id": "abc123",
    "fields": { "radius_km": "must be between 0 and 200" }
  }
}
```
Always surface `request_id` when reporting issues (keys into their logs/traces).

## Rate limits & pagination
- Baseline: **60 requests / minute per token**.
- Listing endpoints cap page size at **100**.
- Use `limit` + cursor-style follow-ups (page_token / next_page_token) rather than scanning.

## Endpoint inventory (v2)

### Properties
- `GET  /v2/properties`               — search/resolve a parcel/APN or owner query into a property id (interactive lookup, not bulk)
- `GET  /v2/properties/point`         — lookup by lat/lng point
- `GET  /v2/properties/{propertyId}`  — full property record (scoped by entitlements/quota)

### Filter Data
- `POST /v2/filter-data`                              — run a filtered property query
- `GET  /v2/filter-data/filters`                      — list supported filter keys (SOURCE OF TRUTH for Phase 0)
- `GET  /v2/filter-data/filters/{filterKey}/values`   — selectable values for a dictionary filter (e.g. mls_propertytype, fips)

### Exports (async)
- `GET  /v2/exports`               — list export tasks
- `POST /v2/exports`               — create export; consumes property export ROW balance immediately; `meta.rows_left`
- `GET  /v2/exports/{exportId}`    — task status; completed tasks return temporary download URLs

### Comps (async) — Comparable Sales Reports
- `GET  /v2/reports/comps`               — list reports (filters: date, property_id, status; page_size 1-50, page_token)
- `POST /v2/reports/comps`               — queue a report (body `{ property_id }`); decrements comp_reports_limit; returns UUID report_id
- `GET  /v2/reports/comps/{reportId}`    — fetch report data once status=completed (no quota); includes wetlands %, slope buckets, valuation

## Key differences vs the v1 PDF (background)
| Concept | v1 | v2 |
|---|---|---|
| Base URL | `landportal.com/wp-json/lp-rest-api/v1` | `api.landportal.com/v2` |
| Filters list | `GET /filter-data/filters-list` | `GET /v2/filter-data/filters` |
| Filter values | `GET /filter-data/filter-values?filter=X` | `GET /v2/filter-data/filters/{filterKey}/values` |
| Run filter | `POST /filter-data/filter` | `POST /v2/filter-data` |
| Envelope | `{ success, data }` | `{ data, meta, message }` (no `success`) |
| Error shape | `{ success:false, message }` | `{ message, error:{ code, message, request_id, fields } }` |
| Export create | `POST /export` (export tokens) | `POST /v2/exports` (row balance, `meta.rows_left`) |
| Comp id | `task_id` (int) | `report_id` (UUID) |
| Quota exhaustion | 403 | **429** (rate/quota), 403 = scope/plan |

## Unauthenticated probe (confirmed live, no token)
- `GET /v2/filter-data/filters` -> **401** (endpoint real, needs auth)
- `GET /v2/filter-data`         -> 404 (bare path not a route; POST-only)
- `GET https://api.landportal.com/` -> 302

## Comps report — response detail (fully captured)
`GET /v2/reports/comps/{reportId}` `data` includes: `address`, `apn`, `comparables[]`
(each: apn, area_acres, days_on_market, distance_miles, fema_cover_percentage, fips,
land_locked, land_use_code, last_sale_date, less_10_slope, mls_price, mls_status[sold/...],
price_per_acre, property_id, road_frontage, state, wetlands_cover_percentage, zipcode),
`comparables_count`, `current_sales_price`, `elevation_average`, `fema_cover_percentage`,
`land_locked`, `land_use`, `location`, `predictions[]`, `road_frontage`, `size_acres`,
`slope{ flat_0_05, minimal_05_5, moderate_5_10, heavy_10_15, extreme_15_plus }`,
`valuation{ estimated_value, price_per_acre, price_per_acre_county, price_per_acre_mean, price_per_acre_zip }`,
`wetlands_cover_percentage`, `zipcode`, plus image/satellite asset paths.

> NOTE: `road_frontage`, `land_locked`, `wetlands_cover_percentage`, and the `slope` buckets
> appear on comp records here — strong signal these exist as filter keys too (confirm in
> `GET /v2/filter-data/filters`). This directly informs the Phase 4 frontage branch.
