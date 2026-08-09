-- ============================================================================
-- Campaigns: nurture sequences that drip texts and schedule call reminders so
-- leads never sit in limbo. A campaign is a list of steps (text or call) each
-- with a day offset. Enrolling a lead expands the steps into a due queue; the
-- scheduler sends due texts (Project Blue) and creates due call tasks. An
-- inbound reply stops the sequence.
-- ============================================================================
create extension if not exists pgcrypto;

create table if not exists campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  steps       jsonb not null default '[]'::jsonb,  -- [{day:int, type:'text'|'call', message?, label?}]
  active      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists campaign_enrollments (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null,
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  status        text default 'active',   -- active | done | stopped
  stopped_reason text,
  enrolled_at   timestamptz default now(),
  enrolled_by   uuid
);
create unique index if not exists uniq_active_enrollment on campaign_enrollments (lead_id, campaign_id);

create table if not exists campaign_queue (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references campaign_enrollments(id) on delete cascade,
  lead_id       uuid not null,
  campaign_id   uuid not null,
  step_index    int not null,
  type          text not null,           -- 'text' | 'call'
  message       text,
  label         text,
  due_at        timestamptz not null,
  status        text default 'pending',  -- pending | sent | done | cancelled | failed
  processed_at  timestamptz,
  created_at    timestamptz default now()
);
create index if not exists idx_campaign_queue_due on campaign_queue (status, due_at);
create index if not exists idx_campaign_queue_lead on campaign_queue (lead_id);

-- Seed 3 starter campaigns (edit or add your own in the Campaigns tab).
-- {{first}} is replaced with the seller's first name at send time.
insert into campaigns (name, description, steps) values
('New Lead, No Contact',
 'Brand new lead that has not answered. Warm drips plus periodic calls.',
 '[
   {"day":0,"type":"text","message":"Hi {{first}}, this is Jordan with Harmon Land. Saw you reached out about your property, I would love to help. When is a good time to connect?"},
   {"day":1,"type":"text","message":"Hey {{first}}, just following up. Happy to answer any questions and there is no pressure at all. What works for a quick call?"},
   {"day":2,"type":"call","label":"Call new lead"},
   {"day":4,"type":"text","message":"Hi {{first}}, still interested in helping with your land whenever the timing is right for you. Shoot me a text anytime."},
   {"day":7,"type":"call","label":"Call new lead"},
   {"day":10,"type":"text","message":"Hey {{first}}, checking in one more time. If now is not the right time no worries, I am here when you are ready."}
 ]'::jsonb),
('Talking to Family',
 'Seller is interested but wants to talk it over with family. Give them room, stay in touch.',
 '[
   {"day":3,"type":"call","label":"Follow up after family talk"},
   {"day":7,"type":"text","message":"Hi {{first}}, hope you and the family had a chance to talk it over. Happy to answer anything that came up. No rush."},
   {"day":14,"type":"call","label":"Follow up: family decision"}
 ]'::jsonb),
('Offer Pending',
 'Offer is out and the seller is deciding. Keep it warm without pushing.',
 '[
   {"day":2,"type":"call","label":"Follow up on offer"},
   {"day":5,"type":"text","message":"Hi {{first}}, just circling back on our offer. Any questions I can answer to make this easy for you?"},
   {"day":10,"type":"call","label":"Follow up on offer"}
 ]'::jsonb)
on conflict do nothing;
