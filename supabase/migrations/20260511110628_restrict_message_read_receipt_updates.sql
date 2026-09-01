-- Harden message read-receipt updates.
--
-- The messages_mark_read RLS policy allows recipients to UPDATE unread
-- messages so the client can set read_at. RLS WITH CHECK only validates the
-- final row, so a direct API caller could also change content/message_type/etc.
-- Keep the policy for row ownership, and add a column-level trigger guard.

CREATE OR REPLACE FUNCTION public.ensure_message_read_receipt_update_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Restrict browser/API roles while leaving service-role/admin maintenance
  -- paths available for trusted repairs and future migrations.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.message_type IS DISTINCT FROM OLD.message_type
    OR NEW.offer_id IS DISTINCT FROM OLD.offer_id
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only message read receipts can be updated'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    RAISE EXCEPTION 'Message read receipts cannot be changed once set'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_message_read_receipt_update_only ON public.messages;
CREATE TRIGGER ensure_message_read_receipt_update_only
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_message_read_receipt_update_only();
