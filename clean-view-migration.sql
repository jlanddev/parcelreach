-- Clean View: mark leads that have been pushed into the curated focus view.
-- Leads keep their real status/notes; this is just a membership flag.
alter table leads add column if not exists clean_view boolean not null default false;

-- Fast lookup of the (usually small) pushed set.
create index if not exists idx_leads_clean_view on leads (clean_view) where clean_view = true;
