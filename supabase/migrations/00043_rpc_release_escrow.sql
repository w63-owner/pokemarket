-- 00043: Atomic escrow release RPC
--
-- Closes the critical gap where pending_balance was never moved to
-- available_balance when a buyer confirmed reception.
--
-- This single SECURITY DEFINER function replaces the two-step pattern
-- (app UPDATE status → separate wallet mutation) with one atomic operation:
--   1. Lock the transaction row (FOR UPDATE) — no race conditions
--   2. Validate ownership + status
--   3. Set status → COMPLETED
--   4. Move seller_net from pending_balance → available_balance
--
-- seller_net formula (mirrors src/lib/pricing.ts):
--   seller_net = total_amount - fee_amount - shipping_cost
--
-- The existing status-transition trigger (00041) still fires for the status
-- UPDATE inside this function; it will pass because:
--   • Regular buyer call: auth.uid() = p_buyer_id = tx.buyer_id ✓
--   • Admin call (role='admin'): trigger's admin check exempts them ✓
--   • service_role call (auth.uid() IS NULL): trigger allows NULL ✓
--
-- Permissions: authenticated users + service_role only.
--              Public (anon) is explicitly revoked.

CREATE OR REPLACE FUNCTION public.release_escrow_funds(
  p_transaction_id UUID,
  p_buyer_id       UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id   UUID;
  v_is_admin    BOOLEAN := FALSE;
  v_tx          RECORD;
  v_seller_net  NUMERIC(10,2);
  v_rows_wallet INTEGER;
BEGIN
  -- ── 0. Authorization ─────────────────────────────────────────────────────
  -- auth.uid() is NULL for service_role (webhooks, Server Actions via admin
  -- client) → unconditionally allowed.
  -- Regular JWTs must either be the buyer themselves or have role = 'admin'.
  v_caller_id := auth.uid();

  IF v_caller_id IS NOT NULL THEN
    SELECT (role = 'admin')
      INTO v_is_admin
      FROM public.profiles
     WHERE id = v_caller_id;

    IF NOT COALESCE(v_is_admin, FALSE) AND v_caller_id != p_buyer_id THEN
      RAISE EXCEPTION 'FORBIDDEN: caller % is not the buyer (%) or an admin',
        v_caller_id, p_buyer_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── 1. Lock the transaction row (prevents concurrent release) ─────────────
  SELECT *
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction % does not exist', p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 2. Ownership + status validation ──────────────────────────────────────
  -- Admins may release escrow on behalf of any buyer (e.g. dispute resolution).
  IF NOT COALESCE(v_is_admin, FALSE) AND v_caller_id IS NOT NULL
     AND v_tx.buyer_id != p_buyer_id THEN
    RAISE EXCEPTION 'FORBIDDEN: transaction % does not belong to buyer %',
      p_transaction_id, p_buyer_id
      USING ERRCODE = '42501';
  END IF;

  -- Only SHIPPED transactions can be completed; all other transitions are invalid.
  IF v_tx.status != 'SHIPPED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: expected SHIPPED but got % for transaction %',
      v_tx.status, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 3. Compute seller net ─────────────────────────────────────────────────
  -- seller_net = total_amount − fee_amount − shipping_cost
  -- This mirrors calcPriceSeller() in src/lib/pricing.ts but uses the amounts
  -- already persisted on the transaction row (source of truth).
  v_seller_net := ROUND(
    COALESCE(v_tx.total_amount, 0::NUMERIC)
    - COALESCE(v_tx.fee_amount, 0::NUMERIC)
    - COALESCE(v_tx.shipping_cost, 0::NUMERIC),
    2
  );

  IF v_seller_net <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: seller_net is % (must be > 0) for transaction %',
      v_seller_net, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 4. Mark transaction as COMPLETED ──────────────────────────────────────
  -- The status-transition trigger (00041) validates this UPDATE independently.
  UPDATE public.transactions
     SET status = 'COMPLETED'
   WHERE id = p_transaction_id;

  -- ── 5. Release escrow: pending_balance → available_balance ────────────────
  -- The WHERE pending_balance >= v_seller_net guard prevents the wallet going
  -- negative if the webhook that credited pending_balance ever failed.
  -- We use a single atomic UPDATE (no separate SELECT) to avoid TOCTOU.
  UPDATE public.wallets
     SET pending_balance   = ROUND(pending_balance   - v_seller_net, 2),
         available_balance = ROUND(available_balance + v_seller_net, 2)
   WHERE user_id           = v_tx.seller_id
     AND pending_balance  >= v_seller_net;

  GET DIAGNOSTICS v_rows_wallet = ROW_COUNT;

  IF v_rows_wallet = 0 THEN
    -- Transaction is COMPLETED (buyer unblocked) but the wallet balance was
    -- insufficient (likely because the Stripe webhook never credited it).
    -- Log a critical warning — operations must reconcile manually.
    RAISE WARNING
      'ESCROW_BALANCE_MISMATCH: seller % wallet has insufficient pending_balance '
      'for transaction % (seller_net = %). Manual reconciliation required.',
      v_tx.seller_id, p_transaction_id, v_seller_net;
  END IF;

  -- ── 6. Return success ─────────────────────────────────────────────────────
  RETURN TRUE;

EXCEPTION
  -- Re-raise any FORBIDDEN / NOT_FOUND / INVALID_STATUS exceptions as-is so
  -- the caller (PostgREST or application code) receives the exact error code.
  WHEN SQLSTATE '42501' OR SQLSTATE 'P0001' OR SQLSTATE 'P0002' THEN
    RAISE;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.release_escrow_funds(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO service_role;
