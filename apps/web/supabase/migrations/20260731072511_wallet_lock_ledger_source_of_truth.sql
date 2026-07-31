-- Sprint 7: Make ledger the sole source of truth for wallet balances.
--
-- Previously, `private.capture_wallet_projection_change` captured direct
-- wallet writes as a compatibility `wallet_adjustment` journal so they could
-- be recovered. Now that all code paths go through the ledger first
-- (finalize_paid_transaction, release_escrow_funds, execute_payout, refunds,
-- disputes), there is no legitimate reason to write to `wallets` outside of
-- `private.rebuild_wallet_projection`.
--
-- This migration removes the compatibility trigger and replaces it with a
-- hard guard that rejects any direct wallet mutation, preventing accidental
-- out-of-ledger balance changes in future code paths.

-- 1. Remove the compatibility capture trigger first so we can also drop the
--    backing function cleanly.
DROP TRIGGER IF EXISTS wallets_capture_ledger_adjustment ON public.wallets;
DROP FUNCTION IF EXISTS private.capture_wallet_projection_change();

-- 2. Add a deny trigger.  `private.rebuild_wallet_projection` sets
--    `pokemarket.rebuilding_wallet_projection = 'on'` inside its transaction
--    before updating `wallets`, so that path is still allowed.  Any other
--    UPDATE is rejected with an informative error code.
CREATE OR REPLACE FUNCTION private.deny_direct_wallet_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('pokemarket.rebuilding_wallet_projection', true) = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'WALLET_DIRECT_WRITE_FORBIDDEN: wallet balances are managed exclusively '
    'by the ledger. Call private.rebuild_wallet_projection() to resync.'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER wallets_deny_direct_writes
  BEFORE UPDATE OF pending_balance, available_balance ON public.wallets
  FOR EACH ROW
  WHEN (
    OLD.pending_balance IS DISTINCT FROM NEW.pending_balance
    OR OLD.available_balance IS DISTINCT FROM NEW.available_balance
  )
  EXECUTE FUNCTION private.deny_direct_wallet_write();
