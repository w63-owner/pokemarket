-- Sprint 7: Activate the proportional dispute reserve in payout computation.
--
-- Sprint 5 added `dispute_reserve_bps` to `financial_payout_config` (default
-- 1000 = 10%) but did not wire it into the reserve calculation. The payout
-- amount was computed as `total_available - risk_reserve_minor` (flat) only.
--
-- This migration replaces `reserve_seller_payout_original` so the effective
-- reserve combines the flat component and a percentage of total available
-- funds:
--
--   effective_reserve = risk_reserve_minor
--                     + round(total_available * dispute_reserve_bps / 10000)
--
-- The effective reserve actually applied is persisted in
-- `payouts.risk_reserve_minor` so the admin UI and reconciliation scripts can
-- audit it without recomputing.

CREATE OR REPLACE FUNCTION public.reserve_seller_payout_original(
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
DECLARE
  v_config public.financial_payout_config%ROWTYPE;
  v_stripe_account_id text;
  v_total_available bigint;
  v_proportional_reserve bigint;
  v_effective_reserve bigint;
  v_payout_amount bigint;
  v_remaining bigint;
  v_allocate bigint;
  v_payout_id uuid := gen_random_uuid();
  v_transfer public.seller_transfers%ROWTYPE;
  v_journal_id uuid;
  v_connected_account_id uuid;
  v_pending_account_id uuid;
BEGIN
  SELECT *
  INTO STRICT v_config
  FROM public.financial_payout_config
  WHERE singleton;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_seller_id::text, 0));

  SELECT stripe_account_id
  INTO v_stripe_account_id
  FROM public.profiles
  WHERE id = p_seller_id;

  IF v_stripe_account_id IS NULL THEN
    RAISE EXCEPTION 'PAYOUT_ACCOUNT_MISSING: seller %', p_seller_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(sum(
    amount_minor - amount_reversed_minor - payout_reserved_minor - paid_minor
  ), 0)
  INTO v_total_available
  FROM public.seller_transfers
  WHERE seller_id = p_seller_id
    AND status IN ('transferred', 'paid')
    AND transferred_at <= now() - make_interval(days => v_config.payout_delay_days);

  -- Effective reserve = flat component + proportional dispute component.
  v_proportional_reserve :=
    round(v_total_available::numeric * v_config.dispute_reserve_bps / 10000)::bigint;
  v_effective_reserve := v_config.risk_reserve_minor + v_proportional_reserve;

  v_payout_amount := GREATEST(v_total_available - v_effective_reserve, 0);

  IF v_payout_amount < v_config.minimum_payout_minor THEN
    RAISE EXCEPTION
      'PAYOUT_BELOW_MINIMUM: available=% flat_reserve=% proportional_reserve=% effective_reserve=% minimum=%',
      v_total_available,
      v_config.risk_reserve_minor,
      v_proportional_reserve,
      v_effective_reserve,
      v_config.minimum_payout_minor
      USING ERRCODE = 'P0001';
  END IF;

  -- Persist the effective reserve so the admin UI and audits can verify it.
  INSERT INTO public.payouts (
    id,
    user_id,
    amount,
    amount_minor,
    currency,
    status,
    stripe_account_id,
    idempotency_key,
    risk_reserve_minor,
    payout_delay_days
  )
  VALUES (
    v_payout_id,
    p_seller_id,
    v_payout_amount::numeric / 100,
    v_payout_amount,
    'EUR',
    'pending',
    v_stripe_account_id,
    'payout:' || v_payout_id::text,
    v_effective_reserve,
    v_config.payout_delay_days
  );

  v_remaining := v_payout_amount;

  FOR v_transfer IN
    SELECT *
    FROM public.seller_transfers
    WHERE seller_id = p_seller_id
      AND status IN ('transferred', 'paid')
      AND transferred_at <= now() - make_interval(days => v_config.payout_delay_days)
      AND amount_minor - amount_reversed_minor
          - payout_reserved_minor - paid_minor > 0
    ORDER BY transferred_at, created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;

    v_allocate := LEAST(
      v_remaining,
      v_transfer.amount_minor - v_transfer.amount_reversed_minor
        - v_transfer.payout_reserved_minor - v_transfer.paid_minor
    );

    INSERT INTO public.payout_items (
      payout_id,
      seller_transfer_id,
      transaction_id,
      amount_minor
    )
    VALUES (
      v_payout_id,
      v_transfer.id,
      v_transfer.transaction_id,
      v_allocate
    );

    UPDATE public.seller_transfers
    SET status = 'payout_pending',
        payout_reserved_minor = payout_reserved_minor + v_allocate
    WHERE id = v_transfer.id;

    INSERT INTO public.ledger_transactions (
      transaction_id,
      journal_type,
      idempotency_key,
      business_reference,
      metadata
    )
    VALUES (
      v_transfer.transaction_id,
      'payout_reserved',
      'payout-reserve:' || v_payout_id::text || ':' || v_transfer.transaction_id::text,
      'seller-payout-reserve:' || v_payout_id::text || ':' || v_transfer.transaction_id::text,
      jsonb_build_object(
        'payout_id', v_payout_id,
        'amount_minor', v_allocate
      )
    )
    RETURNING id INTO v_journal_id;

    v_connected_account_id := private.get_or_create_ledger_account(
      'seller_connected',
      p_seller_id,
      v_transfer.transaction_id,
      v_transfer.currency
    );
    v_pending_account_id := private.get_or_create_ledger_account(
      'seller_payout_pending',
      p_seller_id,
      v_transfer.transaction_id,
      v_transfer.currency
    );

    INSERT INTO public.ledger_entries (
      ledger_transaction_id,
      account_id,
      amount_minor
    )
    VALUES
      (v_journal_id, v_connected_account_id, -v_allocate),
      (v_journal_id, v_pending_account_id, v_allocate);

    v_remaining := v_remaining - v_allocate;
  END LOOP;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'PAYOUT_ALLOCATION_MISMATCH: remaining=%', v_remaining
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM private.rebuild_wallet_projection(p_seller_id);

  RETURN QUERY
  SELECT
    v_payout_id,
    v_payout_amount,
    'EUR'::text,
    v_effective_reserve,
    v_config.payout_delay_days;
END;
$$;

COMMENT ON FUNCTION public.reserve_seller_payout_original(uuid) IS
  'Core payout reservation. Effective reserve = risk_reserve_minor (flat) '
  '+ round(total_available * dispute_reserve_bps / 10_000) (proportional). '
  'The effective reserve is persisted on payouts.risk_reserve_minor.';;
