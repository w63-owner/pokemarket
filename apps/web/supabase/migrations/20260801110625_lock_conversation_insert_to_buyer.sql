-- harden_messaging_integrity closed forged buyers in upsert_conversation, but
-- the legacy conversations_insert_participant policy still let any authenticated
-- user INSERT a conversation row naming themselves as buyer OR seller. That
-- bypasses the RPC and can:
--   1) let a seller forge a conversation for an arbitrary buyer
--   2) let an attacker join a non-public listing by UUID via
--      listings_select_conversation_participant
-- Mirror the RPC rules: only the authentic buyer may insert, and seller_id must
-- match the listing owner.

DROP POLICY IF EXISTS "conversations_insert_participant" ON public.conversations;

CREATE POLICY "conversations_insert_buyer_for_listing"
  ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = buyer_id
    AND buyer_id IS DISTINCT FROM seller_id
    AND seller_id = (
      SELECT listings.seller_id
      FROM public.listings
      WHERE listings.id = listing_id
    )
  );
