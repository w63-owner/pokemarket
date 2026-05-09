-- Enforce that client-side message UPDATEs can only mark messages as read.
-- RLS decides who may update a row; this trigger enforces which columns may
-- change so a recipient cannot rewrite message content through the read policy.

CREATE OR REPLACE FUNCTION public.enforce_message_read_receipt_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.message_type IS DISTINCT FROM OLD.message_type
    OR NEW.offer_id IS DISTINCT FROM OLD.offer_id
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only read_at may be updated on messages'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_read_receipt_update_only ON public.messages;

CREATE TRIGGER messages_read_receipt_update_only
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_read_receipt_update();
