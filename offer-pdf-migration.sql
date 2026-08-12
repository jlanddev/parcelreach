-- Offer PDF feature: multi-map storage, offer terms, generated PDF pointer.
-- Run in the Supabase SQL editor.

alter table leads add column if not exists lead_maps    jsonb not null default '[]'::jsonb;
alter table leads add column if not exists offer_terms  jsonb not null default '{}'::jsonb;
alter table leads add column if not exists offer_pdf_url text;

-- Public bucket the generated offer PDFs are stored in (server writes via the
-- service role; public read for the download link).
insert into storage.buckets (id, name, public)
values ('offer-pdfs', 'offer-pdfs', true)
on conflict (id) do nothing;
