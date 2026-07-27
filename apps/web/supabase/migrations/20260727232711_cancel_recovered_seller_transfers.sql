-- Prevent a queued transfer from escaping after a refund/dispute has already
-- consumed its ledger balance. A tiny execution handshake closes the gap
-- between preparing a DB job and calling Stripe over the network.

ALTER TABLE public.seller_transfers
  ADD COLUMN cancellation_requested_at timestamptz,
  ADD COLUMN execution_started_at timestamptz;

CREATE OR REPLACE FUNCTION private.cancel_transfer_for_financial_recovery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.seller_transfers%ROWTYPE;
  v_requires_cancel boolean;
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

  -- Once the execution handshake has started, Stripe might have accepted the
  -- transfer even if no id has reached Postgres yet. Roll the entire refund or
  -- dispute transaction back so webhook redelivery retries after reconciliation
  -- and takes the transfer-reversal path.
  IF v_transfer.execution_started_at IS NOT NULL THEN
    RAISE EXCEPTION
      'TRANSFER_IN_FLIGHT_RETRY: transaction % transfer execution is unresolved',
      NEW.id
      USING ERRCODE = '40001';
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

CREATE TRIGGER transactions_cancel_transfer_on_recovery
  BEFORE UPDATE OF seller_refund_target_minor, status
  ON public.transactions
  FOR EACH ROW
  WHEN (
    OLD.seller_refund_target_minor IS DISTINCT FROM NEW.seller_refund_target_minor
    OR OLD.status IS DISTINCT FROM NEW.status
  )
  EXECUTE FUNCTION private.cancel_transfer_for_financial_recovery();

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
     OR v_tx.seller_refund_target_minor > 0
     OR v_tx.status IN ('REFUNDED', 'DISPUTED') THEN
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

  IF NOT FOUND
     OR v_tx.seller_refund_target_minor > 0
     OR v_tx.status IN ('REFUNDED', 'DISPUTED') THEN
    RETURN false;
  END IF;

  UPDATE public.seller_transfers
  SET execution_started_at = COALESCE(execution_started_at, now())
  WHERE transaction_id = p_transaction_id
    AND status = 'processing'
    AND cancellation_requested_at IS NULL
    AND stripe_transfer_id IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_seller_transfer_execution(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_seller_transfer_execution(uuid)
  TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;
