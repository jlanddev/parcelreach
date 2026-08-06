-- Clean View: mark leads that have been pushed into the curated focus view.
-- Leads keep their real status/notes; this is just a membership flag.
alter table leads add column if not exists clean_view boolean not null default false;

-- Fast lookup of the (usually small) pushed set.
create index if not exists idx_leads_clean_view on leads (clean_view) where clean_view = true;

-- Follow-up (2026-08-04): stamp when a lead was pushed into Clean View so the
-- board can sort newest-pushed first (the default sort while in Clean View).
alter table leads add column if not exists clean_view_at timestamptz;
