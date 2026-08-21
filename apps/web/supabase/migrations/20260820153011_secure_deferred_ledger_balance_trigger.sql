-- The balance constraint trigger is DEFERRABLE INITIALLY DEFERRED. When an
-- authenticated buyer invokes public.release_escrow_funds(), PostgreSQL runs
-- this trigger after the SECURITY DEFINER RPC has returned. Its original
-- SECURITY INVOKER context therefore tried to read ledger_entries as the
-- authenticated role, which has intentionally had all table access revoked.
--
-- Keep the ledger private and execute the invariant check as its owner.
CREATE OR REPLACE FUNCTION private.assert_balanced_ledger_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ledger_transaction_id uuid;
  v_balance bigint;
BEGIN
  v_ledger_transaction_id :=
    COALESCE(NEW.ledger_transaction_id, OLD.ledger_transaction_id);

  SELECT COALESCE(sum(amount_minor), 0)
    INTO v_balance
    FROM public.ledger_entries
   WHERE ledger_transaction_id = v_ledger_transaction_id;

  IF v_balance <> 0 THEN
    RAISE EXCEPTION
      'UNBALANCED_LEDGER_TRANSACTION: % has balance % minor units',
      v_ledger_transaction_id,
      v_balance
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
  ON FUNCTION private.assert_balanced_ledger_transaction()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION private.assert_balanced_ledger_transaction()
  TO service_role;
