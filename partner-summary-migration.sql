-- A purpose-written summary for partners, composed on the lead's card in the
-- Partners tab (write or paste, then lock). This is the ONLY note text that
-- gets pushed to a partner's Monday board, so internal collaborative notes can
-- never leak. Pushed as: @Partner <summary>, with the parcel map below it.

alter table leads add column if not exists partner_summary text;
