# LandPortal API v2 — Errors, Rate Limits, Pagination (captured from docs)

## Error envelope (all errors)
```json
{
  "message": "Human-readable error description",
  "error": { "code": "invalid_request", "message": "...", "request_id": "abc123" }
}
```
Validation failures add a `fields` map keyed by the offending input:
```json
{ "message": "Validation failed",
  "error": { "code": "bad_request", "message": "Validation failed",
             "request_id": "abc123", "fields": { "radius_km": "must be between 0 and 200" } } }
```

## Status codes
| Status | code | When |
|---|---|---|
| 400 | `bad_request` | Malformed request or failed validation |
| 401 | `unauthorized` | Missing, invalid, or expired token |
| 403 | `forbidden` | Plan or scope does not allow the operation |
| 404 | `not_found` | Resource (or disabled feature) does not exist |
| 429 | `rate_limited` | Rate or quota exhausted — honour `Retry-After` |
| 5xx | `internal` | Unexpected server error — safe to retry with backoff |

Always log `request_id`.

## Retry policy (maps to our ground rules)
- Retry ONLY 5xx and network/timeout errors: exponential backoff w/ jitter 1s -> 2s -> 4s, cap 30s.
- On 429: honour the `Retry-After` header. Never retry 4xx (400/401/403/404).

## Rate limits
- Baseline: **60 requests / minute per token**. Exceed -> 429 + `Retry-After`.
- Plan quotas tracked separately, surfaced in `meta` (e.g. `meta.requests_left`).

## Pagination
- Listing endpoints cap page size at **100**.
- `page_size` sizes each page; the opaque cursor comes back in `meta.page_token`.
- Pass it back as `page_token`. Absent/empty `page_token` = no more results.
- Treat the token as opaque — do not parse or construct it.
```json
{ "data": [ ... ], "meta": { "page_token": "eyJvZmZzZXQiOjUwfQ" } }
```
