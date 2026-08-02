-- Partial refunds/disputes before Stripe Connect execution must not strand the
-- residual seller balance. Resize the queued transfer to the remaining
-- transferable amount; only cancel when nothing remains.
-- Also: release_escrow must transfer the post-refund pending balance, and
-- complete_financial_recovery must debt any move_seller_funds shortfall.

CREATE OR REPLACE FUNCTION private.cancel_transfer_for_financial_recovery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.seller_transfers%ROWTYPE;
  v_requires_adjust boolean;
  v_residual bigint;
BEGIN
  v_requires_adjust :=
    NEW.seller_refund_target_minor > OLD.seller_refund_target_minor
    OR (
      NEW.status = 'DISPUTED'
      AND OLD.status IS DISTINCT FROM 'DISPUTED'
    )
    OR (
      NEW.status = 'REFUNDED'
      AND OLD.status IS DISTINCT FROM 'REFUNDED'
    );

  IF NOT v_requires_adjust THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_transfer
  FROM public.seller_transfers
  WHERE transaction_id = NEW.id
  FOR UPDATE;

  IF NOT FOUND OR v_transfer.stripe_transfer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Once the execution handshake has started, Stripe might have accepted the
  -- transfer even if no id has reached Postgres yet. Roll the refund/dispute
  -- transaction back so webhook redelivery retries after reconciliation.
  IF v_transfer.execution_started_at IS NOT NULL THEN
    RAISE EXCEPTION
      'TRANSFER_IN_FLIGHT_RETRY: transaction % transfer execution is unresolved',
      NEW.id
      USING ERRCODE = '40001';
  END IF;

  -- Pending/available is what a pre-Stripe transfer can still move. Locked
  -- dispute funds and refunded platform_cash are excluded automatically.
  -- Using the ledger (not amount_minor - target) keeps successive partial
  -- refunds correct after earlier resizes.
  IF NEW.status = 'REFUNDED' THEN
    v_residual := 0;
  ELSE
    SELECT GREATEST(COALESCE(sum(e.amount_minor), 0), 0)
    INTO v_residual
    FROM public.ledger_accounts a
    LEFT JOIN public.ledger_entries e ON e.account_id = a.id
    WHERE a.transaction_id = NEW.id
      AND a.account_type IN ('seller_pending', 'seller_available');
  END IF;

  IF v_residual > 0 THEN
    UPDATE public.seller_transfers
    SET amount_minor = v_residual,
        cancellation_requested_at = NULL,
        status = CASE
          WHEN status = 'failed' THEN 'queued'::public.seller_transfer_status
          ELSE status
        END,
        processing_started_at = CASE
          WHEN status = 'failed' THEN NULL
          ELSE processing_started_at
        END,
        failure_code = NULL,
        failure_message = NULL
    WHERE id = v_transfer.id;

    -- Keep the outbox reclaimable so the residual can still be transferred.
    UPDATE public.financial_outbox
    SET status = CASE
          WHEN status = 'COMPLETED' THEN 'PENDING'
          ELSE status
        END,
        completed_at = CASE
          WHEN status = 'COMPLETED' THEN NULL
          ELSE completed_at
        END,
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error = NULL,
        next_attempt_at = CASE
          WHEN status = 'COMPLETED' THEN now()
          ELSE next_attempt_at
        END
    WHERE event_type = 'transfer_requested'
      AND aggregate_id = NEW.id
      AND status IN ('PENDING', 'PROCESSING', 'FAILED', 'COMPLETED');

    RETURN NEW;
  END IF;

  UPDATE public.seller_transfers
  SET cancellation_requested_at = COALESCE(cancellation_requested_at, now()),
      status = 'failed',
      processing_started_at = NULL,
      failure_code = 'financial_recovery_before_transfer',
      failure_message =
        'Transfer canceled because a refund or dispute consumed the order funds'
  WHERE id = v_transfer.id;

  UPDATE public.financial_outbox
  SET status = 'COMPLETED',
      completed_at = COALESCE(completed_at, now()),
      lease_token = NULL,
      lease_expires_at = NULL,
      last_error = NULL
  WHERE event_type = 'transfer_requested'
    AND aggregate_id = NEW.id
    AND status IN ('PENDING', 'PROCESSING', 'FAILED');

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_seller_transfer(
  p_transaction_id uuid
)
RETURNS SETOF public.seller_transfers
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_transfer public.seller_transfers%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  SELECT *
  INTO v_transfer
  FROM public.seller_transfers
  WHERE transaction_id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSFER_NOT_FOUND: transaction %', p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_transfer.cancellation_requested_at IS NOT NULL
     OR v_transfer.amount_minor <= 0
     OR v_tx.status = 'REFUNDED' THEN
    RAISE EXCEPTION 'TRANSFER_CANCELED_FINANCIAL_RECOVERY: transaction %',
      p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.seller_transfers st
  SET stripe_account_id = COALESCE(st.stripe_account_id, p.stripe_account_id),
      source_charge_id = COALESCE(st.source_charge_id, t.stripe_charge_id)
  FROM public.transactions t
  JOIN public.profiles p ON p.id = t.seller_id
  WHERE st.id = v_transfer.id
    AND t.id = st.transaction_id
  RETURNING st.* INTO v_transfer;

  IF v_transfer.stripe_account_id IS NULL THEN
    RAISE EXCEPTION 'TRANSFER_ACCOUNT_MISSING: transaction %', p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_transfer.source_charge_id IS NULL THEN
    RAISE EXCEPTION 'TRANSFER_CHARGE_MISSING: transaction %', p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_transfer.status IN ('queued', 'processing', 'failed') THEN
    UPDATE public.seller_transfers
    SET status = 'processing',
        processing_started_at = now(),
        execution_started_at = NULL,
        failure_code = NULL,
        failure_message = NULL
    WHERE id = v_transfer.id
    RETURNING * INTO v_transfer;
  END IF;

  RETURN NEXT v_transfer;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_seller_transfer_execution(
  p_transaction_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND OR v_tx.status = 'REFUNDED' THEN
    RETURN false;
  END IF;

  UPDATE public.seller_transfers
  SET execution_started_at = COALESCE(execution_started_at, now())
  WHERE transaction_id = p_transaction_id
    AND status = 'processing'
    AND cancellation_requested_at IS NULL
    AND amount_minor > 0
    AND stripe_transfer_id IS NULL;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION private.release_escrow_funds(
  p_transaction_id uuid,
  p_buyer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin boolean := false;
  v_tx public.transactions%ROWTYPE;
  v_seller_minor bigint;
  v_pending_balance_minor bigint;
  v_locked_balance_minor bigint := 0;
  v_release_minor bigint;
  v_release_ledger_id uuid;
  v_pending_account_id uuid;
  v_locked_account_id uuid;
  v_available_account_id uuid;
BEGIN
  v_caller_id := auth.uid();

  SELECT *
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction % does not exist', p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_caller_id IS NOT NULL THEN
    SELECT role = 'admin'
      INTO v_is_admin
      FROM public.profiles
     WHERE id = v_caller_id;

    IF NOT COALESCE(v_is_admin, false)
       AND (
         v_caller_id IS DISTINCT FROM p_buyer_id
         OR v_tx.buyer_id IS DISTINCT FROM p_buyer_id
       ) THEN
      RAISE EXCEPTION 'FORBIDDEN: only the buyer can release escrow'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id
    INTO v_release_ledger_id
    FROM public.ledger_transactions
   WHERE idempotency_key = 'escrow-release:' || p_transaction_id::text;

  IF v_tx.status = 'COMPLETED' AND v_release_ledger_id IS NOT NULL THEN
    RETURN true;
  END IF;

  IF v_tx.status NOT IN ('SHIPPED', 'COMPLETED') THEN
    RAISE EXCEPTION
      'INVALID_STATUS: expected SHIPPED or recoverable COMPLETED but got % for transaction %',
      v_tx.status, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.ledger_transactions
     WHERE idempotency_key = 'payment:' || v_tx.id::text
  ) THEN
    RAISE EXCEPTION
      'MISSING_PAYMENT_LEDGER: transaction % cannot release escrow safely',
      v_tx.id
      USING ERRCODE = 'P0001';
  END IF;

  v_seller_minor :=
    round((v_tx.total_amount - v_tx.fee_amount) * 100)::bigint;

  v_pending_account_id := private.get_or_create_ledger_account(
    'seller_pending', v_tx.seller_id, v_tx.id, 'EUR'
  );

  SELECT COALESCE(sum(amount_minor), 0)
    INTO v_pending_balance_minor
    FROM public.ledger_entries
   WHERE account_id = v_pending_account_id;

  -- Partial refunds/disputes may have already removed seller liability from
  -- pending. Release exactly what remains, but still reject unexplained
  -- underfunding (pending + refunded + locked < original seller share).
  v_locked_account_id := private.get_or_create_ledger_account(
    'seller_locked', v_tx.seller_id, v_tx.id, 'EUR'
  );
  SELECT COALESCE(sum(amount_minor), 0)
    INTO v_locked_balance_minor
    FROM public.ledger_entries
   WHERE account_id = v_locked_account_id;

  IF v_pending_balance_minor < 0 OR v_locked_balance_minor < 0 THEN
    RAISE EXCEPTION
      'ESCROW_BALANCE_MISMATCH: seller % transaction % has negative balances',
      v_tx.seller_id, v_tx.id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_pending_balance_minor > v_seller_minor THEN
    RAISE EXCEPTION
      'ESCROW_BALANCE_MISMATCH: seller % transaction % has % pending, max %',
      v_tx.seller_id, v_tx.id, v_pending_balance_minor, v_seller_minor
      USING ERRCODE = 'P0001';
  END IF;

  IF v_pending_balance_minor
       + COALESCE(v_tx.seller_refunded_minor, 0)
       + v_locked_balance_minor
     < v_seller_minor THEN
    RAISE EXCEPTION
      'ESCROW_BALANCE_MISMATCH: seller % transaction % has % pending, requires %',
      v_tx.seller_id, v_tx.id, v_pending_balance_minor, v_seller_minor
      USING ERRCODE = 'P0001';
  END IF;

  v_release_minor := v_pending_balance_minor;

  IF v_release_minor = 0 THEN
    IF v_tx.status = 'SHIPPED' THEN
      UPDATE public.transactions
         SET status = 'COMPLETED'
       WHERE id = v_tx.id;
    END IF;
    RETURN true;
  END IF;

  INSERT INTO public.ledger_transactions (
    transaction_id,
    journal_type,
    idempotency_key,
    business_reference,
    metadata
  )
  VALUES (
    v_tx.id,
    'escrow_released',
    'escrow-release:' || v_tx.id::text,
    'order-escrow-release:' || v_tx.id::text,
    jsonb_build_object(
      'seller_minor', v_seller_minor,
      'release_minor', v_release_minor,
      'seller_refunded_minor', v_tx.seller_refunded_minor
    )
  )
  RETURNING id INTO v_release_ledger_id;

  v_available_account_id := private.get_or_create_ledger_account(
    'seller_available', v_tx.seller_id, v_tx.id, 'EUR'
  );

  INSERT INTO public.ledger_entries (
    ledger_transaction_id,
    account_id,
    amount_minor
  )
  VALUES
    (v_release_ledger_id, v_pending_account_id, -v_release_minor),
    (v_release_ledger_id, v_available_account_id, v_release_minor);

  IF v_tx.status = 'SHIPPED' THEN
    UPDATE public.transactions
       SET status = 'COMPLETED'
     WHERE id = v_tx.id;
  END IF;

  PERFORM private.rebuild_wallet_projection(v_tx.seller_id);

  INSERT INTO public.financial_outbox (
    event_type,
    aggregate_id,
    idempotency_key,
    payload
  )
  VALUES (
    'transfer_requested',
    v_tx.id,
    'transfer-requested:' || v_tx.id::text,
    jsonb_build_object(
      'transaction_id', v_tx.id,
      'seller_id', v_tx.seller_id,
      'amount_minor', v_release_minor,
      'currency', 'EUR'
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN true;
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
  v_shortfall bigint;
BEGIN
  SELECT *
  INTO v_recovery
  FROM public.financial_recoveries
  WHERE id = p_recovery_id
  FOR UPDATE;

  IF NOT FOUND THEN
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
    -- move_seller_funds returns 0 on idempotent journal replay; only a
    -- positive partial move is a true shortfall (zero funds raises).
    IF v_moved = 0 THEN
      v_moved := v_delta;
    ELSIF v_moved < v_delta THEN
      v_shortfall := v_delta - v_moved;
      PERFORM private.record_seller_debt(
        v_tx,
        v_shortfall,
        'refund-recovery-shortfall:' || p_recovery_id::text || ':'
          || p_completed_amount_minor::text,
        'seller_debt_incurred',
        NULL,
        NULL
      );
    END IF;
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
    IF v_moved = 0 THEN
      v_moved := v_delta;
    ELSIF v_moved < v_delta THEN
      v_shortfall := v_delta - v_moved;
      PERFORM private.record_seller_debt(
        v_tx,
        v_shortfall,
        'dispute-retransfer-shortfall:' || p_recovery_id::text,
        'seller_debt_incurred',
        NULL,
        v_recovery.stripe_dispute_id
      );
    END IF;
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

REVOKE ALL ON FUNCTION public.confirm_seller_transfer_execution(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_seller_transfer_execution(uuid)
  TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;
