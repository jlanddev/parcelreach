-- Durable partner-push tracking. The lead.partner_pushes jsonb column was the
-- only record of which partners a lead had been sent to, and a jsonb
-- read-modify-write can be clobbered by other lead updates or lost-update races,
-- so the history could quietly disappear over time. This table is the
-- authoritative, append-only record: one row per (lead, board), upserted on
-- re-push. It cannot be wiped by a lead-row update.

create table if not exists partner_pushes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  board_id text not null,
  board_name text,
  item_id text,
  tagged text,
  map_uploaded boolean default false,
  tag_in_bubble boolean default false,
  notified integer default 0,
  warnings jsonb default '[]'::jsonb,
  pushed_at timestamptz not null default now(),
  unique (lead_id, board_id)
);

create index if not exists partner_pushes_lead_idx on partner_pushes (lead_id);

-- Backfill from the existing jsonb so no prior history is lost.
insert into partner_pushes (lead_id, board_id, board_name, item_id, pushed_at)
select l.id,
       (p->>'board_id'),
       (p->>'board_name'),
       (p->>'item_id'),
       coalesce((p->>'pushed_at')::timestamptz, now())
from leads l
cross join lateral jsonb_array_elements(coalesce(l.partner_pushes, '[]'::jsonb)) as p
where (p->>'board_id') is not null
on conflict (lead_id, board_id) do nothing;
