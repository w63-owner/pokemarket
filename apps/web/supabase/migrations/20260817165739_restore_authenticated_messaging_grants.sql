-- Table privileges are checked before RLS. Restore only the operations used by
-- authenticated messaging clients; existing policies and triggers still
-- enforce participant scope and immutable fields.
revoke all on table public.conversations from public, anon, authenticated;
revoke all on table public.messages from public, anon, authenticated;
revoke all on table public.user_blocks from public, anon, authenticated;
revoke all on table public.conversation_participant_settings
  from public, anon, authenticated;
revoke all on table public.conversation_reports from public, anon, authenticated;

grant select, insert on table public.conversations to authenticated;
grant select, insert on table public.messages to authenticated;
grant update (read_at) on table public.messages to authenticated;
grant select on table public.listings to authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.transactions to authenticated;
grant select, insert, delete on table public.user_blocks to authenticated;
grant select, insert, update
  on table public.conversation_participant_settings
  to authenticated;
grant select, insert on table public.conversation_reports to authenticated;

grant all on table public.conversations to service_role;
grant all on table public.messages to service_role;
grant all on table public.user_blocks to service_role;
grant all on table public.conversation_participant_settings to service_role;
grant all on table public.conversation_reports to service_role;
grant select, insert, delete on table public.listings to service_role;

-- Offer mutations remain server-owned: authenticated receives table
-- reachability, while the intentionally absent INSERT/UPDATE RLS policies
-- continue to reject direct writes.
revoke all on table public.offers from public, anon, authenticated;
grant select, insert, update on table public.offers to authenticated;
grant all on table public.offers to service_role;
