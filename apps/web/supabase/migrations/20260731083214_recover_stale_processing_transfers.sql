-- Sprint 7: Bounded recovery for seller_transfers stuck in 'processing'.
--
-- When a worker crashes or is killed after calling prepare_seller_transfer but
-- before calling record_seller_transfer_success / record_seller_transfer_failure,
-- the row stays in 'processing' forever.  This function moves such rows back to
-- 'queued' so the next worker run retries them, WITHOUT creating a new Stripe
-- Transfer (the previous attempt may already have landed; the worker must first
-- check for an existing transfer with the same idempotency key before re-sending).
--
-- The function is intentionally idempotent: re-running it only resets rows
-- whose lease is still expired at the time of the call.

CREATE OR REPLACE FUNCTION public.recover_stale_processing_transfers(
  p_lease_seconds integer DEFAULT 600
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_lease_seconds <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_lease_seconds must be positive'
      USING ERRCODE = '22023';
  END IF;

  WITH recovered AS (
    UPDATE public.seller_transfers
    SET status = 'queued',
        processing_started_at = NULL,
        failure_code = 'lease_expired',
        failure_message = format(
          'Transfer stuck in processing since %s (lease of %s s expired); '
          'reset to queued for retry without new Stripe transfer.',
          processing_started_at,
          p_lease_seconds
        )
    WHERE status = 'processing'
      AND processing_started_at IS NOT NULL
      AND processing_started_at < now() - (p_lease_seconds || ' seconds')::interval
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM recovered;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.recover_stale_processing_transfers(integer) IS
  'Resets seller_transfers stuck in processing with an expired lease back to '
  'queued. Does not create or cancel Stripe Transfers; the worker must check '
  'for an existing idempotent transfer before re-sending.';;
