-- Critical money-path hardening for post-transfer refunds/disputes:
-- 1) Partial Connect reversals must not permanently mark the transfer reversed
--    (residual Connect balance would become unpayoutable).
-- 2) Concurrent recovery workers must not both call Stripe createReversal.
-- 3) payout_pending is treated like paid for seller debt (funds already reserved
--    for bank payout; Connect reverse commonly fails).
-- 4) Terminal reverse failure records seller_debt so the platform does not eat
--    the loss after outbox retries are exhausted.
-- 5) Payouts are blocked while an incomplete recovery / open dispute / unpaid
--    refund target is outstanding for the seller.

CREATE OR REPLACE FUNCTION public.apply_stripe_transfer_reversal(
  p_stripe_transfer_id text,
  p_amount_reversed_minor bigint
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_transfer public.seller_transfers%ROWTYPE;
  v_delta bigint;
  v_remaining bigint;
  v_take bigint;
  v_balance bigint;
  v_journal_id uuid;
  v_source_account_id uuid;
  v_locked_account_id uuid;
  v_debt_account_id uuid;
  v_source_type text;
BEGIN
  SELECT *
  INTO v_transfer
  FROM public.seller_transfers
  WHERE stripe_transfer_id = p_stripe_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_amount_reversed_minor < v_transfer.amount_reversed_minor
     OR p_amount_reversed_minor > v_transfer.amount_minor THEN
    RAISE EXCEPTION 'INVALID_TRANSFER_REVERSAL_AMOUNT: transfer % amount %',
      p_stripe_transfer_id, p_amount_reversed_minor
      USING ERRCODE = '23514';
  END IF;

  v_delta := p_amount_reversed_minor - v_transfer.amount_reversed_minor;
  IF v_delta = 0 THEN
    RETURN true;
  END IF;

  INSERT INTO public.ledger_transactions (
    transaction_id,
    journal_type,
    idempotency_key,
    business_reference,
    stripe_transfer_id,
    metadata
  )
  VALUES (
    v_transfer.transaction_id,
    'transfer_reversed',
    'transfer-reversal:' || p_stripe_transfer_id || ':' || p_amount_reversed_minor::text,
    'order-transfer-reversal:' || v_transfer.transaction_id::text
      || ':' || p_amount_reversed_minor::text,
    p_stripe_transfer_id,
    jsonb_build_object(
      'delta_minor', v_delta,
      'total_reversed_minor', p_amount_reversed_minor
    )
  )
  RETURNING id INTO v_journal_id;

  v_locked_account_id := private.get_or_create_ledger_account(
    'seller_locked',
    v_transfer.seller_id,
    v_transfer.transaction_id,
    v_transfer.currency
  );
  v_remaining := v_delta;

  FOREACH v_source_type IN ARRAY ARRAY[
    'seller_connected',
    'seller_payout_pending',
    'seller_paid'
  ]
  LOOP
    EXIT WHEN v_remaining = 0;
    v_source_account_id := private.get_or_create_ledger_account(
      v_source_type,
      v_transfer.seller_id,
      v_transfer.transaction_id,
      v_transfer.currency
    );
    SELECT COALESCE(sum(amount_minor), 0)
    INTO v_balance
    FROM public.ledger_entries
    WHERE account_id = v_source_account_id;

    v_take := LEAST(GREATEST(v_balance, 0), v_remaining);
    IF v_take > 0 THEN
      INSERT INTO public.ledger_entries (
        ledger_transaction_id,
        account_id,
        amount_minor
      )
      VALUES (v_journal_id, v_source_account_id, -v_take);
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;

  IF v_remaining > 0 THEN
    v_debt_account_id := private.get_or_create_ledger_account(
      'seller_debt',
      v_transfer.seller_id,
      v_transfer.transaction_id,
      v_transfer.currency
    );
    INSERT INTO public.ledger_entries (
      ledger_transaction_id,
      account_id,
      amount_minor
    )
    VALUES (v_journal_id, v_debt_account_id, -v_remaining);
    PERFORM private.refresh_seller_risk_account(v_transfer.seller_id);
  END IF;

  INSERT INTO public.ledger_entries (
    ledger_transaction_id,
    account_id,
    amount_minor
  )
  VALUES (v_journal_id, v_locked_account_id, v_delta);

  UPDATE public.seller_transfers
  SET status = CASE
        WHEN p_amount_reversed_minor >= amount_minor
          THEN 'reversed'::public.seller_transfer_status
        -- Keep payout-race statuses so apply_stripe_payout_transition can clear
        -- reservations without double-moving ledger balances.
        WHEN status IN ('payout_pending', 'paid', 'reversed') THEN status
        ELSE 'transferred'::public.seller_transfer_status
      END,
      amount_reversed_minor = p_amount_reversed_minor,
      reversed_at = CASE
        WHEN p_amount_reversed_minor >= amount_minor THEN now()
        ELSE reversed_at
      END
  WHERE id = v_transfer.id;

  PERFORM private.rebuild_wallet_projection(v_transfer.seller_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION private.insert_recovery_job(
  p_transaction public.transactions,
  p_kind public.financial_recovery_kind,
  p_target_amount_minor bigint,
  p_stripe_dispute_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.seller_transfers%ROWTYPE;
  v_recovery_id uuid;
  v_key text;
  v_event_type text;
BEGIN
  IF p_target_amount_minor <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_transfer
  FROM public.seller_transfers
  WHERE transaction_id = p_transaction.id
  FOR UPDATE;

  IF NOT FOUND OR v_transfer.stripe_transfer_id IS NULL THEN
    RAISE EXCEPTION 'RECOVERY_TRANSFER_MISSING: transaction %', p_transaction.id
      USING ERRCODE = 'P0001';
  END IF;

  v_key := p_kind::text || ':' || p_transaction.id::text || ':'
    || COALESCE(p_stripe_dispute_id, 'none');
  v_event_type := CASE
    WHEN p_kind = 'dispute_restore' THEN 'dispute_retransfer_requested'
    ELSE 'transfer_reversal_requested'
  END;

  INSERT INTO public.financial_recoveries (
    transaction_id,
    seller_id,
    stripe_dispute_id,
    kind,
    target_amount_minor,
    stripe_transfer_id,
    idempotency_key
  )
  VALUES (
    p_transaction.id,
    p_transaction.seller_id,
    p_stripe_dispute_id,
    p_kind,
    p_target_amount_minor,
    v_transfer.stripe_transfer_id,
    v_key
  )
  ON CONFLICT ON CONSTRAINT financial_recoveries_logical_key DO UPDATE
  SET target_amount_minor = GREATEST(
        public.financial_recoveries.target_amount_minor,
        EXCLUDED.target_amount_minor
      ),
      status = CASE
        WHEN public.financial_recoveries.completed_amount_minor
          >= GREATEST(
            public.financial_recoveries.target_amount_minor,
            EXCLUDED.target_amount_minor
          )
          THEN 'completed'::public.financial_recovery_status
        -- Never demote an in-flight worker to queued: that races a second
        -- Stripe reversal against the same Connect transfer.
        WHEN public.financial_recoveries.status = 'processing'
          THEN 'processing'::public.financial_recovery_status
        ELSE 'queued'::public.financial_recovery_status
      END,
      last_error = NULL
  RETURNING id INTO v_recovery_id;

  -- One durable outbox row per recovery. Target amount lives on the recovery
  -- row; workers always re-read it via prepare_financial_recovery.
  INSERT INTO public.financial_outbox (
    event_type,
    aggregate_id,
    idempotency_key,
    payload
  )
  VALUES (
    v_event_type,
    p_transaction.id,
    'recovery-job:' || v_recovery_id::text,
    jsonb_build_object(
      'recovery_id', v_recovery_id,
      'target_amount_minor', p_target_amount_minor
    )
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET status = CASE
        WHEN public.financial_outbox.status IN ('COMPLETED', 'FAILED')
          THEN 'PENDING'
        ELSE public.financial_outbox.status
      END,
      attempts = CASE
        WHEN public.financial_outbox.status IN ('COMPLETED', 'FAILED')
          THEN 0
        ELSE public.financial_outbox.attempts
      END,
      next_attempt_at = CASE
        WHEN public.financial_outbox.status IN ('COMPLETED', 'FAILED')
          THEN now()
        ELSE public.financial_outbox.next_attempt_at
      END,
      completed_at = CASE
        WHEN public.financial_outbox.status IN ('COMPLETED', 'FAILED')
          THEN NULL
        ELSE public.financial_outbox.completed_at
      END,
      last_error = CASE
        WHEN public.financial_outbox.status IN ('COMPLETED', 'FAILED')
          THEN NULL
        ELSE public.financial_outbox.last_error
      END,
      payload = jsonb_build_object(
        'recovery_id', v_recovery_id,
        'target_amount_minor', p_target_amount_minor
      );

  RETURN v_recovery_id;
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
  v_stale_after interval := interval '10 minutes';
BEGIN
  UPDATE public.financial_recoveries
  SET status = 'processing',
      attempts = attempts + 1,
      last_error = NULL
  WHERE public.financial_recoveries.id = p_recovery_id
    AND (
      status IN ('queued', 'failed')
      OR (
        status = 'processing'
        AND updated_at < now() - v_stale_after
      )
    );

  IF NOT FOUND THEN
    RETURN;
  END IF;

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
  WHERE r.id = p_recovery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.abandon_financial_recovery(
  p_recovery_id uuid,
  p_error text DEFAULT 'recovery abandoned after terminal outbox failure'
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_recovery public.financial_recoveries%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_remaining bigint;
  v_debt bigint := 0;
BEGIN
  SELECT *
  INTO v_recovery
  FROM public.financial_recoveries
  WHERE id = p_recovery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_recovery.status = 'completed' THEN
    RETURN true;
  END IF;

  IF v_recovery.status = 'canceled'
     AND v_recovery.completed_amount_minor >= v_recovery.target_amount_minor THEN
    RETURN true;
  END IF;

  v_remaining := v_recovery.target_amount_minor - v_recovery.completed_amount_minor;

  SELECT *
  INTO STRICT v_tx
  FROM public.transactions
  WHERE id = v_recovery.transaction_id
  FOR UPDATE;

  IF v_remaining > 0 AND v_recovery.kind IN ('refund', 'dispute') THEN
    v_debt := private.record_seller_debt(
      v_tx,
      v_remaining,
      'recovery-abandon:' || p_recovery_id::text || ':' || v_remaining::text,
      'seller_debt_incurred',
      NULL,
      v_recovery.stripe_dispute_id
    );

    IF v_recovery.kind = 'refund' AND v_debt > 0 THEN
      UPDATE public.transactions
      SET seller_refunded_minor = LEAST(
        seller_refund_target_minor,
        seller_refunded_minor + v_debt
      )
      WHERE id = v_tx.id;
    ELSIF v_recovery.kind = 'dispute' AND v_debt > 0 THEN
      UPDATE public.stripe_disputes
      SET debt_minor = debt_minor + v_debt,
          last_synced_at = now()
      WHERE stripe_dispute_id = v_recovery.stripe_dispute_id;
    END IF;
  END IF;

  UPDATE public.financial_recoveries
  SET status = 'canceled',
      last_error = left(p_error, 2000),
      completed_at = COALESCE(completed_at, now())
  WHERE id = p_recovery_id;

  PERFORM private.refresh_seller_risk_account(v_tx.seller_id);
  RETURN true;
END;
$$;

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
  ELSIF v_transfer.status IN ('paid', 'payout_pending')
     OR v_transfer.paid_minor > 0 THEN
    -- Funds already reserved for / sent to the seller's bank cannot be
    -- reliably pulled back via Connect reverse. Record debt immediately.
    v_debt := private.record_seller_debt(
      v_tx,
      v_delta,
      v_key || ':debt',
      'seller_debt_incurred',
      p_stripe_refund_id,
      NULL
    );
    v_applied := v_debt;
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
  ELSIF v_transfer.status IN ('paid', 'payout_pending')
     OR v_transfer.paid_minor > 0 THEN
    v_debt := private.record_seller_debt(
      v_tx,
      v_delta,
      'dispute-debt:' || p_stripe_dispute_id || ':' || v_target::text,
      'seller_debt_incurred',
      NULL,
      p_stripe_dispute_id
    );
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

CREATE OR REPLACE FUNCTION public.reserve_seller_payout(
  p_seller_id uuid
)
RETURNS TABLE (
  payout_id uuid,
  amount_minor bigint,
  currency text,
  risk_reserve_minor bigint,
  payout_delay_days integer
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM private.refresh_seller_risk_account(p_seller_id);

  IF EXISTS (
    SELECT 1
    FROM public.seller_risk_accounts
    WHERE seller_id = p_seller_id
      AND payouts_blocked
  ) THEN
    RAISE EXCEPTION 'PAYOUT_BLOCKED_BY_SELLER_DEBT: seller %', p_seller_id
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.financial_recoveries
    WHERE seller_id = p_seller_id
      AND status IN ('queued', 'processing', 'failed')
      AND completed_amount_minor < target_amount_minor
  ) THEN
    RAISE EXCEPTION 'PAYOUT_BLOCKED_BY_OPEN_RECOVERY: seller %', p_seller_id
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE seller_id = p_seller_id
      AND status = 'DISPUTED'
  ) THEN
    RAISE EXCEPTION 'PAYOUT_BLOCKED_BY_OPEN_DISPUTE: seller %', p_seller_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT * FROM public.reserve_seller_payout_original(p_seller_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_financial_outbox(
  p_id uuid,
  p_lease_token uuid,
  p_delay_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_updated boolean;
BEGIN
  UPDATE public.financial_outbox
     SET status = 'PENDING',
         -- Undo the claim increment so a busy peer does not burn toward
         -- terminal FAILED / seller-debt abandonment.
         attempts = GREATEST(attempts - 1, 0),
         next_attempt_at = now() + make_interval(
           secs => LEAST(GREATEST(COALESCE(p_delay_seconds, 30), 1), 900)
         ),
         lease_expires_at = NULL,
         lease_token = NULL,
         last_error = NULL
   WHERE id = p_id
     AND status = 'PROCESSING'
     AND lease_token = p_lease_token
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

REVOKE ALL ON FUNCTION public.abandon_financial_recovery(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_financial_outbox(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_financial_recovery(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_financial_outbox(uuid, uuid, integer)
  TO service_role;
