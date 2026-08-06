-- Store the exact note sent to each partner on a push. Partners are not
-- connected, so the same property can go out with a different note per partner.
-- The lead.partner_pushes jsonb mirror already carries `note`; this adds it to
-- the durable table too.
alter table partner_pushes add column if not exists note text;
