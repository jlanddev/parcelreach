-- Land Portal integration tables. Safe to run multiple times.

-- Same-day search cache (identical searches return free, zero quota).
create table if not exists landportal_cache (
  filter_hash text not null,
  cache_date  date not null,
  response    jsonb not null,
  created_at  timestamptz default now(),
  primary key (filter_hash, cache_date)
);

-- Permanent parcel-detail cache (boundary geometry + valuation). Boundaries
-- never change, so each parcel is fetched from the metered pool at most once ever.
create table if not exists landportal_property_cache (
  property_id text primary key,
  fips        text,
  detail      jsonb not null,
  fetched_at  timestamptz default now()
);

-- Daily spend ledger for the detail pool + token spillover (drives the cost
-- quote, the $10/day circuit breaker, and the "pool N/8 left today" indicator).
create table if not exists landportal_quota (
  quota_date         date primary key,
  pool_remaining     int,
  tokens_spent_cents int default 0,
  fetches            int default 0
);

-- Permanent Regrid parcel-boundary cache (each parcel billed once, cached forever).
create table if not exists regrid_geometry_cache (
  cache_key  text primary key,
  geometry   jsonb,
  fetched_at timestamptz default now()
);
