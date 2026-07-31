-- After a bank payout (or payout reservation), seller_transfers.paid_minor /
-- payout_reserved_minor can leave residual funds on Stripe Connect while
-- paid_minor > 0. apply_stripe_refund / lock_stripe_dispute previously treated
-- that as "fully paid out" and recorded seller_debt for the entire liability,
-- never queueing a Connect reverse for the residual.
--
-- With dispute_reserve_bps defaulting to 10%, almost every first payout leaves
-- residual Connect balance — so refunds/disputes after payout stranded money
-- on the connected account and over-stated recoverable debt.
--
-- Fix: reverse min(delta, reversible Connect remainder) and debt only the
-- non-reversible portion (already paid out or reserved for payout).

CREATE OR REPLACE FUNCTION private.seller_transfer_reversible_minor(
  p_transfer public.seller_transfers
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT GREATEST(
    p_transfer.amount_minor
      - p_transfer.amount_reversed_minor
      - p_transfer.paid_minor
      - p_transfer.payout_reserved_minor,
    0
  );
$$;

COMMENT ON FUNCTION private.seller_transfer_reversible_minor(public.seller_transfers) IS
  'Connect balance still reversible for a seller_transfer: '
  'amount - reversed - paid - payout_reserved.';

CREATE OR REPLACE FUNCTION public.apply_stripe_refund(
  p_stripe_charge_id text,
  p_cumulative_refund_minor bigint,
  p_stripe_refund_id text DEFAULT NULL
)
RETURNS TABLE (
  transaction_id uuid,
  seller_delta_minor bigint,
  applied_minor bigint,
  recovery_queued boolean,
  debt_minor bigint
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_transfer public.seller_transfers%ROWTYPE;
  v_target bigint;
  v_delta bigint;
  v_applied bigint := 0;
  v_debt bigint := 0;
  v_recovery boolean := false;
  v_key text;
  v_dispute_id uuid;
  v_dispute_available_minor bigint := 0;
  v_dispute_consumed_minor bigint := 0;
  v_reversible bigint;
  v_to_reverse bigint;
  v_to_debt bigint;
  v_recovery_target bigint;
BEGIN
  SELECT *
  INTO v_tx
  FROM public.transactions
  WHERE stripe_charge_id = p_stripe_charge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_cumulative_refund_minor < v_tx.refunded_amount_minor THEN
    RETURN QUERY SELECT v_tx.id, 0::bigint, 0::bigint, false, 0::bigint;
    RETURN;
  END IF;

  v_target := private.seller_liability_for_gross_refund(
    v_tx, p_cumulative_refund_minor
  );

  SELECT
    id,
    GREATEST(locked_minor - consumed_minor, 0),
    consumed_minor
  INTO v_dispute_id, v_dispute_available_minor, v_dispute_consumed_minor
  FROM public.stripe_disputes
  WHERE transaction_id = v_tx.id
    AND status IN (
      'warning_needs_response',
      'warning_under_review',
      'needs_response',
      'under_review',
      'charge_refunded',
      'lost'
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  v_delta := GREATEST(
    v_target - v_tx.seller_refunded_minor - v_dispute_consumed_minor,
    0
  );
  IF v_delta <= 0 THEN
    UPDATE public.transactions
    SET refunded_amount_minor = GREATEST(
          refunded_amount_minor,
          p_cumulative_refund_minor
        ),
        seller_refund_target_minor = GREATEST(
          seller_refund_target_minor,
          v_target
        ),
        refunded_amount = GREATEST(
          COALESCE(refunded_amount, 0),
          p_cumulative_refund_minor::numeric / 100
        )
    WHERE id = v_tx.id;
    RETURN QUERY SELECT v_tx.id, 0::bigint, 0::bigint, false, 0::bigint;
    RETURN;
  END IF;

  v_key := 'refund:' || v_tx.id::text || ':' || v_target::text;

  SELECT *
  INTO v_transfer
  FROM public.seller_transfers
  WHERE transaction_id = v_tx.id
  FOR UPDATE;

  IF NOT FOUND OR v_transfer.stripe_transfer_id IS NULL THEN
    v_applied := private.move_seller_funds(
      v_tx,
      v_delta,
      'platform_cash',
      'refund_applied',
      v_key,
      p_stripe_refund_id,
      NULL
    );
    IF v_applied < v_delta THEN
      v_debt := private.record_seller_debt(
        v_tx,
        v_delta - v_applied,
        v_key || ':debt',
        'seller_debt_incurred',
        p_stripe_refund_id,
        NULL
      );
    END IF;
  ELSIF v_transfer.paid_minor > 0
     OR v_transfer.status IN ('paid', 'payout_pending') THEN
    -- Partial bank payout / reservation: claw back residual Connect funds,
    -- debt only what has already left (or is reserved to leave) Connect.
    v_reversible := private.seller_transfer_reversible_minor(v_transfer);
    v_to_reverse := LEAST(v_delta, v_reversible);
    v_to_debt := v_delta - v_to_reverse;

    IF v_to_debt > 0 THEN
      v_debt := private.record_seller_debt(
        v_tx,
        v_to_debt,
        v_key || ':debt',
        'seller_debt_incurred',
        p_stripe_refund_id,
        NULL
      );
      v_applied := v_debt;
    END IF;

    IF v_to_reverse > 0 THEN
      SELECT COALESCE(fr.completed_amount_minor, 0)
      INTO v_recovery_target
      FROM public.financial_recoveries fr
      WHERE fr.transaction_id = v_tx.id
        AND fr.kind = 'refund'
        AND fr.stripe_dispute_id IS NULL;

      v_recovery_target := COALESCE(v_recovery_target, 0) + v_to_reverse;

      PERFORM private.insert_recovery_job(
        v_tx,
        'refund',
        v_recovery_target,
        NULL
      );
      v_recovery := true;
    END IF;
  ELSE
    PERFORM private.insert_recovery_job(
      v_tx,
      'refund',
      v_tx.seller_refunded_minor + v_delta,
      NULL
    );
    v_recovery := true;
  END IF;

  IF v_dispute_id IS NOT NULL AND v_applied > 0
     AND v_dispute_available_minor > 0 THEN
    UPDATE public.stripe_disputes
    SET consumed_minor = consumed_minor
          + LEAST(v_applied, v_dispute_available_minor),
        last_synced_at = now()
    WHERE id = v_dispute_id;
  END IF;

  UPDATE public.transactions
  SET refunded_amount_minor = p_cumulative_refund_minor,
      refunded_amount = p_cumulative_refund_minor::numeric / 100,
      seller_refund_target_minor = v_target,
      seller_refunded_minor = LEAST(
        v_target,
        seller_refunded_minor + v_applied
      ),
      refunded_at = CASE
        WHEN p_cumulative_refund_minor >= round(total_amount * 100)::bigint
          THEN COALESCE(refunded_at, now())
        ELSE refunded_at
      END,
      status = CASE
        WHEN p_cumulative_refund_minor >= round(total_amount * 100)::bigint
          THEN 'REFUNDED'
        ELSE status
      END
  WHERE id = v_tx.id;

  RETURN QUERY SELECT v_tx.id, v_delta, v_applied, v_recovery, v_debt;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_stripe_dispute(
  p_stripe_dispute_id text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_dispute public.stripe_disputes%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_transfer public.seller_transfers%ROWTYPE;
  v_target bigint;
  v_delta bigint;
  v_locked bigint := 0;
  v_debt bigint := 0;
  v_reversible bigint;
  v_to_reverse bigint;
  v_to_debt bigint;
  v_recovery_target bigint;
BEGIN
  SELECT *
  INTO v_dispute
  FROM public.stripe_disputes
  WHERE stripe_dispute_id = p_stripe_dispute_id
  FOR UPDATE;

  IF NOT FOUND OR v_dispute.transaction_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
  INTO STRICT v_tx
  FROM public.transactions
  WHERE id = v_dispute.transaction_id
  FOR UPDATE;

  v_target := GREATEST(
    private.seller_liability_for_gross_refund(v_tx, v_dispute.amount_minor)
      - v_tx.seller_refund_target_minor,
    0
  );
  v_delta := v_target - v_dispute.seller_liability_minor;
  IF v_delta <= 0 THEN
    RETURN true;
  END IF;

  SELECT *
  INTO v_transfer
  FROM public.seller_transfers
  WHERE transaction_id = v_tx.id
  FOR UPDATE;

  IF NOT FOUND OR v_transfer.stripe_transfer_id IS NULL THEN
    v_locked := private.move_seller_funds(
      v_tx,
      v_delta,
      'seller_locked',
      'dispute_locked',
      'dispute-lock:' || p_stripe_dispute_id || ':' || v_target::text,
      NULL,
      p_stripe_dispute_id
    );
  ELSIF v_transfer.paid_minor > 0
     OR v_transfer.status IN ('paid', 'payout_pending') THEN
    v_reversible := private.seller_transfer_reversible_minor(v_transfer);
    v_to_reverse := LEAST(v_delta, v_reversible);
    v_to_debt := v_delta - v_to_reverse;

    IF v_to_debt > 0 THEN
      v_debt := private.record_seller_debt(
        v_tx,
        v_to_debt,
        'dispute-debt:' || p_stripe_dispute_id || ':' || v_target::text,
        'seller_debt_incurred',
        NULL,
        p_stripe_dispute_id
      );
    END IF;

    IF v_to_reverse > 0 THEN
      SELECT COALESCE(fr.completed_amount_minor, 0)
      INTO v_recovery_target
      FROM public.financial_recoveries fr
      WHERE fr.transaction_id = v_tx.id
        AND fr.kind = 'dispute'
        AND fr.stripe_dispute_id = p_stripe_dispute_id;

      v_recovery_target := COALESCE(v_recovery_target, 0) + v_to_reverse;

      PERFORM private.insert_recovery_job(
        v_tx,
        'dispute',
        v_recovery_target,
        p_stripe_dispute_id
      );
    END IF;
  ELSE
    PERFORM private.insert_recovery_job(
      v_tx, 'dispute', v_target, p_stripe_dispute_id
    );
  END IF;

  UPDATE public.stripe_disputes
  SET seller_liability_minor = v_target,
      locked_minor = locked_minor + v_locked,
      debt_minor = debt_minor + v_debt,
      last_synced_at = now()
  WHERE id = v_dispute.id;

  UPDATE public.transactions
  SET status = 'DISPUTED'
  WHERE id = v_tx.id
    AND status <> 'REFUNDED';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.seller_transfer_reversible_minor(public.seller_transfers)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.seller_transfer_reversible_minor(public.seller_transfers)
  TO service_role;
