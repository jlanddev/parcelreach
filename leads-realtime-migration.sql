-- Live board: let the CRM receive realtime changes on the leads table so a lead
-- pushed to Clean View or a stage change shows up on other sessions without a
-- refresh (and can ding). Safe to run more than once.
do $$
begin
  alter publication supabase_realtime add table leads;
exception when duplicate_object then null;
end $$;

-- So realtime UPDATE payloads carry the full new row (needed to read clean_view
-- and pipeline_status on change).
alter table leads replica identity full;
