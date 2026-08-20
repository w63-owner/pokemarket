-- Close two transfer/recovery races introduced with traceable Connect transfers:
-- 1) prepare_seller_transfer cleared execution_started_at on lease reclaim, so a
--    refund/dispute could cancel while an earlier worker's Stripe transfer was
--    still in flight and later succeeded.
-- 2) record_seller_transfer_failure left execution_started_at set, so terminal
--    Stripe failures permanently blocked financial-recovery cancels
--    (TRANSFER_IN_FLIGHT_RETRY forever).

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
  -- Must exceed the financial outbox lease (180s) so a live worker is never
  -- reclaimed mid-Stripe-call. After this window the handshake is treated as
  -- abandoned and Stripe idempotency makes a retry safe.
  v_inflight_ttl interval := interval '10 minutes';
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
     OR v_tx.seller_refund_target_minor > 0
     OR v_tx.status IN ('REFUNDED', 'DISPUTED') THEN
    RAISE EXCEPTION 'TRANSFER_CANCELED_FINANCIAL_RECOVERY: transaction %',
      p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  -- A live execution handshake means another worker may still be talking to
  -- Stripe. Do not clear the flag or a concurrent refund cancel can race the
  -- in-flight transfer.create.
  IF v_transfer.execution_started_at IS NOT NULL
     AND v_transfer.stripe_transfer_id IS NULL
     AND v_transfer.execution_started_at > now() - v_inflight_ttl THEN
    RAISE EXCEPTION
      'TRANSFER_IN_FLIGHT_RETRY: transaction % transfer execution is unresolved',
      p_transaction_id
      USING ERRCODE = '40001';
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

CREATE OR REPLACE FUNCTION public.record_seller_transfer_failure(
  p_transaction_id uuid,
  p_failure_code text,
  p_failure_message text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.seller_transfers
  SET status = 'failed',
      processing_started_at = NULL,
      -- Clear the handshake so refund/dispute cancel is not stuck forever after
      -- a confirmed Stripe failure (no transfer id was persisted).
      execution_started_at = NULL,
      failure_code = left(p_failure_code, 255),
      failure_message = left(p_failure_message, 2000)
  WHERE transaction_id = p_transaction_id
    AND status IN ('queued', 'processing', 'failed');

  RETURN FOUND;
END;
$$;

-- Abandoned handshakes (worker died after confirm, never reached Stripe) must
-- not block refunds indefinitely. Once the TTL elapses with no transfer id,
-- allow cancel; a later orphan Stripe transfer is reconciled via the durable
-- transfer.created webhook + reversal path.
CREATE OR REPLACE FUNCTION private.cancel_transfer_for_financial_recovery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.seller_transfers%ROWTYPE;
  v_requires_cancel boolean;
  v_inflight_ttl interval := interval '10 minutes';
BEGIN
  v_requires_cancel :=
    NEW.seller_refund_target_minor > OLD.seller_refund_target_minor
    OR (
      NEW.status = 'DISPUTED'
      AND OLD.status IS DISTINCT FROM 'DISPUTED'
    );

  IF NOT v_requires_cancel THEN
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

  IF v_transfer.execution_started_at IS NOT NULL
     AND v_transfer.execution_started_at > now() - v_inflight_ttl THEN
    RAISE EXCEPTION
      'TRANSFER_IN_FLIGHT_RETRY: transaction % transfer execution is unresolved',
      NEW.id
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.seller_transfers
  SET cancellation_requested_at = COALESCE(cancellation_requested_at, now()),
      status = 'failed',
      processing_started_at = NULL,
      execution_started_at = NULL,
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
