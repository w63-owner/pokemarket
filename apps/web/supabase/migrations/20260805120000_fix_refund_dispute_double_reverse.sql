-- Fix refund vs dispute lock double Connect reverse.
--
-- apply_stripe_refund previously selected (locked_minor - consumed_minor) but
-- computed the seller delta using only consumed_minor. After a completed
-- dispute recovery (funds in seller_locked, locked_minor > consumed_minor), a
-- refund webhook queued a second transfer_reversal for the same liability.
--
-- Also: a dispute that closes as won/warning_closed before the queued dispute
-- recovery runs left the reverse job executable, wrongly reclaiming seller
-- Connect funds after a seller win.

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
  v_need bigint;
  v_delta bigint;
  v_from_lock bigint := 0;
  v_applied bigint := 0;
  v_debt bigint := 0;
  v_recovery boolean := false;
  v_key text;
  v_dispute_id uuid;
  v_dispute_available_minor bigint := 0;
  v_dispute_consumed_minor bigint := 0;
  v_inflight_dispute_minor bigint := 0;
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

  -- Refund owns recovery from this point: cancel incomplete dispute reverses
  -- so we never stack a second Stripe reverse for the same liability.
  UPDATE public.financial_recoveries
  SET status = 'canceled',
      last_error = left('superseded by refund application', 2000)
  WHERE transaction_id = v_tx.id
    AND kind = 'dispute'
    AND status IN ('queued', 'failed');

  SELECT COALESCE(SUM(target_amount_minor - completed_amount_minor), 0)
  INTO v_inflight_dispute_minor
  FROM public.financial_recoveries
  WHERE transaction_id = v_tx.id
    AND kind = 'dispute'
    AND status = 'processing';

  v_need := GREATEST(
    v_target - v_tx.seller_refunded_minor - v_dispute_consumed_minor,
    0
  );

  -- Consume unconsumed dispute locks before asking Stripe for another reverse.
  v_from_lock := LEAST(v_need, v_dispute_available_minor);
  IF v_from_lock > 0 THEN
    v_key := 'refund-from-dispute-lock:' || v_tx.id::text || ':'
      || v_target::text;
    v_applied := private.move_seller_funds(
      v_tx,
      v_from_lock,
      'platform_cash',
      'refund_applied',
      v_key,
      p_stripe_refund_id,
      NULL
    );
    IF v_dispute_id IS NOT NULL AND v_applied > 0 THEN
      UPDATE public.stripe_disputes
      SET consumed_minor = consumed_minor + v_applied,
          last_synced_at = now()
      WHERE id = v_dispute_id;
      v_dispute_available_minor := GREATEST(
        v_dispute_available_minor - v_applied,
        0
      );
    END IF;
  END IF;

  v_delta := GREATEST(
    v_need - v_applied - v_inflight_dispute_minor,
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
        seller_refunded_minor = LEAST(
          GREATEST(seller_refund_target_minor, v_target),
          seller_refunded_minor + v_applied
        ),
        refunded_amount = GREATEST(
          COALESCE(refunded_amount, 0),
          p_cumulative_refund_minor::numeric / 100
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
    RETURN QUERY SELECT v_tx.id, v_need, v_applied, false, 0::bigint;
    RETURN;
  END IF;

  v_key := 'refund:' || v_tx.id::text || ':' || v_target::text;

  SELECT *
  INTO v_transfer
  FROM public.seller_transfers
  WHERE transaction_id = v_tx.id
  FOR UPDATE;

  IF NOT FOUND OR v_transfer.stripe_transfer_id IS NULL THEN
    v_applied := v_applied + private.move_seller_funds(
      v_tx,
      v_delta,
      'platform_cash',
      'refund_applied',
      v_key,
      p_stripe_refund_id,
      NULL
    );
    IF v_applied < v_need - v_inflight_dispute_minor THEN
      v_debt := private.record_seller_debt(
        v_tx,
        (v_need - v_inflight_dispute_minor) - v_applied,
        v_key || ':debt',
        'seller_debt_incurred',
        p_stripe_refund_id,
        NULL
      );
    END IF;
  ELSIF v_transfer.paid_minor > 0 OR v_transfer.status = 'paid' THEN
    v_debt := private.record_seller_debt(
      v_tx,
      v_delta,
      v_key || ':debt',
      'seller_debt_incurred',
      p_stripe_refund_id,
      NULL
    );
    v_applied := v_applied + v_debt;
  ELSE
    PERFORM private.insert_recovery_job(
      v_tx,
      'refund',
      v_tx.seller_refunded_minor + v_applied + v_delta,
      NULL
    );
    v_recovery := true;
  END IF;

  IF v_dispute_id IS NOT NULL AND v_applied > v_from_lock
     AND v_dispute_available_minor > 0 THEN
    UPDATE public.stripe_disputes
    SET consumed_minor = consumed_minor
          + LEAST(v_applied - v_from_lock, v_dispute_available_minor),
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

  RETURN QUERY SELECT v_tx.id, v_need, v_applied, v_recovery, v_debt;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_stripe_dispute(
  p_stripe_dispute_id text,
  p_outcome text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_dispute public.stripe_disputes%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_transfer public.seller_transfers%ROWTYPE;
  v_moved bigint;
  v_destination text;
BEGIN
  IF p_outcome NOT IN ('won', 'lost', 'charge_refunded', 'warning_closed') THEN
    RAISE EXCEPTION 'INVALID_DISPUTE_OUTCOME: %', p_outcome
      USING ERRCODE = '22023';
  END IF;

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

  IF p_outcome IN ('won', 'warning_closed') THEN
    -- Seller won before the Connect reverse executed: drop the queued job.
    UPDATE public.financial_recoveries
    SET status = 'canceled',
        last_error = left(
          'canceled because dispute resolved in seller favor',
          2000
        )
    WHERE stripe_dispute_id = p_stripe_dispute_id
      AND kind = 'dispute'
      AND status IN ('queued', 'failed');

    IF v_dispute.locked_minor > v_dispute.consumed_minor THEN
      SELECT *
      INTO v_transfer
      FROM public.seller_transfers
      WHERE transaction_id = v_tx.id;

      IF v_transfer.stripe_transfer_id IS NOT NULL THEN
        v_moved := v_dispute.locked_minor - v_dispute.consumed_minor;
        PERFORM private.insert_recovery_job(
          v_tx, 'dispute_restore', v_moved, p_stripe_dispute_id
        );
      ELSE
        v_destination := CASE
          WHEN v_tx.status IN ('COMPLETED', 'DISPUTED') THEN 'seller_available'
          ELSE 'seller_pending'
        END;
        v_moved := private.move_seller_funds(
          v_tx,
          v_dispute.locked_minor - v_dispute.consumed_minor,
          v_destination,
          'dispute_released',
          'dispute-release:' || p_stripe_dispute_id,
          NULL,
          p_stripe_dispute_id
        );
      END IF;
    END IF;

    UPDATE public.transactions
    SET status = CASE
      WHEN refunded_amount_minor >= round(total_amount * 100)::bigint
        THEN 'REFUNDED'
      WHEN EXISTS (
        SELECT 1 FROM public.seller_transfers st
        WHERE st.transaction_id = v_tx.id
      ) THEN 'COMPLETED'
      ELSE 'PAID'
    END
    WHERE id = v_tx.id
      AND status = 'DISPUTED';
  ELSE
    IF v_dispute.locked_minor > v_dispute.consumed_minor THEN
      v_moved := private.move_seller_funds(
        v_tx,
        v_dispute.locked_minor - v_dispute.consumed_minor,
        'platform_cash',
        'dispute_lost',
        'dispute-lost:' || p_stripe_dispute_id,
        NULL,
        p_stripe_dispute_id
      );
      UPDATE public.stripe_disputes
      SET consumed_minor = consumed_minor + v_moved
      WHERE id = v_dispute.id;
    END IF;
  END IF;

  PERFORM private.refresh_seller_risk_account(v_tx.seller_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_financial_recovery(
  p_recovery_id uuid
)
RETURNS TABLE (
  id uuid,
  transaction_id uuid,
  seller_id uuid,
  kind public.financial_recovery_kind,
  target_amount_minor bigint,
  completed_amount_minor bigint,
  stripe_transfer_id text,
  stripe_account_id text,
  source_charge_id text,
  stripe_dispute_id text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_recovery public.financial_recoveries%ROWTYPE;
  v_dispute_status text;
BEGIN
  SELECT *
  INTO v_recovery
  FROM public.financial_recoveries
  WHERE public.financial_recoveries.id = p_recovery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_recovery.status = 'canceled' THEN
    RETURN;
  END IF;

  IF v_recovery.status = 'completed'
     AND v_recovery.completed_amount_minor >= v_recovery.target_amount_minor THEN
    RETURN;
  END IF;

  -- Re-check dispute outcome before reclaiming a reverse that may have been
  -- queued before charge.dispute.closed arrived.
  IF v_recovery.kind = 'dispute'
     AND v_recovery.stripe_dispute_id IS NOT NULL THEN
    SELECT d.status
    INTO v_dispute_status
    FROM public.stripe_disputes d
    WHERE d.stripe_dispute_id = v_recovery.stripe_dispute_id;

    IF v_dispute_status IN ('won', 'warning_closed') THEN
      UPDATE public.financial_recoveries
      SET status = 'canceled',
          last_error = left(
            'canceled because dispute resolved in seller favor',
            2000
          )
      WHERE public.financial_recoveries.id = p_recovery_id;
      RETURN;
    END IF;
  END IF;

  UPDATE public.financial_recoveries
  SET status = 'processing',
      attempts = attempts + 1,
      last_error = NULL
  WHERE public.financial_recoveries.id = p_recovery_id
    AND status IN ('queued', 'processing', 'failed');

  RETURN QUERY
  SELECT
    r.id,
    r.transaction_id,
    r.seller_id,
    r.kind,
    r.target_amount_minor,
    r.completed_amount_minor,
    r.stripe_transfer_id,
    st.stripe_account_id,
    st.source_charge_id,
    r.stripe_dispute_id
  FROM public.financial_recoveries r
  JOIN public.seller_transfers st ON st.transaction_id = r.transaction_id
  WHERE r.id = p_recovery_id
    AND r.status = 'processing';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_financial_recovery(
  p_recovery_id uuid,
  p_completed_amount_minor bigint,
  p_stripe_object_id text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_recovery public.financial_recoveries%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_delta bigint;
  v_moved bigint := 0;
  v_refund_gap bigint := 0;
  v_consume bigint := 0;
BEGIN
  SELECT *
  INTO v_recovery
  FROM public.financial_recoveries
  WHERE id = p_recovery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_recovery.status = 'canceled' THEN
    RETURN false;
  END IF;

  IF p_completed_amount_minor < v_recovery.completed_amount_minor
     OR p_completed_amount_minor > v_recovery.target_amount_minor THEN
    RAISE EXCEPTION 'INVALID_RECOVERY_AMOUNT: recovery % amount %',
      p_recovery_id, p_completed_amount_minor
      USING ERRCODE = '23514';
  END IF;

  v_delta := p_completed_amount_minor - v_recovery.completed_amount_minor;
  SELECT * INTO STRICT v_tx
  FROM public.transactions
  WHERE id = v_recovery.transaction_id
  FOR UPDATE;

  IF v_delta > 0 AND v_recovery.kind = 'refund' THEN
    v_moved := private.move_seller_funds(
      v_tx,
      v_delta,
      'platform_cash',
      'refund_applied',
      'refund-recovery:' || p_recovery_id::text || ':'
        || p_completed_amount_minor::text,
      NULL,
      NULL
    );
    UPDATE public.transactions
    SET seller_refunded_minor = LEAST(
      seller_refund_target_minor,
      seller_refunded_minor + v_moved
    )
    WHERE id = v_tx.id;
  ELSIF v_delta > 0 AND v_recovery.kind = 'dispute' THEN
    UPDATE public.stripe_disputes
    SET locked_minor = locked_minor + v_delta,
        last_synced_at = now()
    WHERE stripe_dispute_id = v_recovery.stripe_dispute_id;

    -- If a refund already claimed this in-flight dispute reverse, consume the
    -- newly locked funds toward the refund instead of leaving them stranded.
    v_refund_gap := GREATEST(
      v_tx.seller_refund_target_minor - v_tx.seller_refunded_minor,
      0
    );
    IF v_refund_gap > 0 THEN
      v_consume := LEAST(v_delta, v_refund_gap);
      v_moved := private.move_seller_funds(
        v_tx,
        v_consume,
        'platform_cash',
        'refund_applied',
        'refund-from-inflight-dispute:' || p_recovery_id::text || ':'
          || p_completed_amount_minor::text,
        NULL,
        v_recovery.stripe_dispute_id
      );
      IF v_moved > 0 THEN
        UPDATE public.stripe_disputes
        SET consumed_minor = consumed_minor + v_moved,
            last_synced_at = now()
        WHERE stripe_dispute_id = v_recovery.stripe_dispute_id;
        UPDATE public.transactions
        SET seller_refunded_minor = LEAST(
          seller_refund_target_minor,
          seller_refunded_minor + v_moved
        )
        WHERE id = v_tx.id;
      END IF;
    END IF;
  ELSIF v_delta > 0 AND v_recovery.kind = 'dispute_restore' THEN
    v_moved := private.move_seller_funds(
      v_tx,
      v_delta,
      'seller_connected',
      'dispute_retransferred',
      'dispute-retransfer:' || p_recovery_id::text,
      NULL,
      v_recovery.stripe_dispute_id
    );
  END IF;

  UPDATE public.financial_recoveries
  SET completed_amount_minor = p_completed_amount_minor,
      status = CASE
        WHEN p_completed_amount_minor >= target_amount_minor
          THEN 'completed'::public.financial_recovery_status
        ELSE 'queued'::public.financial_recovery_status
      END,
      stripe_reversal_id = CASE
        WHEN kind IN ('refund', 'dispute') THEN p_stripe_object_id
        ELSE stripe_reversal_id
      END,
      stripe_restore_transfer_id = CASE
        WHEN kind = 'dispute_restore' THEN p_stripe_object_id
        ELSE stripe_restore_transfer_id
      END,
      completed_at = CASE
        WHEN p_completed_amount_minor >= target_amount_minor THEN now()
        ELSE NULL
      END
  WHERE id = p_recovery_id;

  PERFORM private.refresh_seller_risk_account(v_tx.seller_id);
  RETURN true;
END;
$$;
