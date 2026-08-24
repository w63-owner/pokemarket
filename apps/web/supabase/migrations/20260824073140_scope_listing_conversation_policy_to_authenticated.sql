begin;

-- Anonymous visitors can read active listings, but they cannot read the
-- conversations table. Restrict this participant-only policy so Postgres does
-- not evaluate its conversations subquery for the anon role.
alter policy "listings_select_conversation_participant"
  on public.listings
  to authenticated;

commit;
