-- Optional coordinates to send to a partner (e.g. PLG), composed on the lead's
-- card in the Partners tab (write or paste, then lock). Pushed into the Monday
-- update bubble under the tag/summary and above the map, only when set.

alter table leads add column if not exists partner_coordinates text;
