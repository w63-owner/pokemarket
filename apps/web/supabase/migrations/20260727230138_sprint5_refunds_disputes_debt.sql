-- Sprint 5: refunds, disputes, transfer reversals and seller debt.
--
-- All public functions below are backend-only. Monetary amounts are integer
-- minor units and every state transition is idempotent under webhook replay.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS refunded_amount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_refund_target_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_refunded_minor bigint NOT NULL DEFAULT 0;

UPDATE public.transactions
SET refunded_amount_minor = round(COALESCE(refunded_amount, 0) * 100)::bigint
WHERE refunded_amount_minor = 0
  AND COALESCE(refunded_amount, 0) > 0;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_refunded_amount_minor_nonnegative
    CHECK (refunded_amount_minor >= 0),
  ADD CONSTRAINT transactions_seller_refund_target_minor_nonnegative
    CHECK (seller_refund_target_minor >= 0),
  ADD CONSTRAINT transactions_seller_refunded_minor_nonnegative
    CHECK (
      seller_refunded_minor >= 0
      AND seller_refunded_minor <= seller_refund_target_minor
    );

ALTER TABLE public.stripe_disputes
  ADD COLUMN IF NOT EXISTS amount_minor bigint,
  ADD COLUMN IF NOT EXISTS seller_liability_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consumed_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debt_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evidence_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NOT NULL DEFAULT now();

UPDATE public.stripe_disputes
SET amount_minor = round(amount * 100)::bigint
WHERE amount_minor IS NULL;

ALTER TABLE public.stripe_disputes
  ALTER COLUMN amount_minor SET NOT NULL,
  ADD CONSTRAINT stripe_disputes_minor_amounts_valid CHECK (
    amount_minor > 0
    AND seller_liability_minor >= 0
    AND locked_minor >= 0
    AND consumed_minor >= 0
    AND debt_minor >= 0
    AND consumed_minor <= seller_liability_minor
  );

ALTER TABLE public.ledger_transactions
  DROP CONSTRAINT ledger_transactions_journal_type_check,
  DROP CONSTRAINT ledger_transactions_reference_shape;

ALTER TABLE public.ledger_transactions
  ADD COLUMN IF NOT EXISTS stripe_refund_id text,
  ADD COLUMN IF NOT EXISTS stripe_dispute_id text,
  ADD CONSTRAINT ledger_transactions_journal_type_check CHECK (journal_type IN (
    'payment_captured',
    'escrow_released',
    'transfer_to_connect',
    'transfer_reversed',
    'payout_reserved',
    'payout_paid',
    'payout_restored',
    'refund_applied',
    'dispute_locked',
    'dispute_released',
    'dispute_lost',
    'seller_debt_incurred',
    'seller_debt_recovered',
    'dispute_retransferred',
    'opening_balance',
    'wallet_adjustment',
    'projection_adjustment'
  )),
  ADD CONSTRAINT ledger_transactions_reference_shape CHECK (
    (
      journal_type IN (
        'payment_captured',
        'escrow_released',
        'transfer_to_connect',
        'transfer_reversed',
        'payout_reserved',
        'payout_paid',
        'payout_restored',
        'refund_applied',
        'dispute_locked',
        'dispute_released',
        'dispute_lost',
        'seller_debt_incurred',
        'seller_debt_recovered',
        'dispute_retransferred'
      )
      AND transaction_id IS NOT NULL
    )
    OR
    (
      journal_type IN (
        'opening_balance',
        'wallet_adjustment',
        'projection_adjustment'
      )
      AND transaction_id IS NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS ledger_transactions_refund_reference_unique
  ON public.ledger_transactions (stripe_refund_id, transaction_id)
  WHERE stripe_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ledger_transactions_dispute_idx
  ON public.ledger_transactions (stripe_dispute_id)
  WHERE stripe_dispute_id IS NOT NULL;

ALTER TABLE public.financial_outbox
  DROP CONSTRAINT financial_outbox_event_type_check;

ALTER TABLE public.financial_outbox
  ADD CONSTRAINT financial_outbox_event_type_check CHECK (event_type IN (
    'payment_finalized',
    'transfer_requested',
    'transfer_reversal_requested',
    'dispute_retransfer_requested'
  ));

CREATE TYPE public.financial_recovery_kind AS ENUM (
  'refund',
  'dispute',
  'dispute_restore'
);

CREATE TYPE public.financial_recovery_status AS ENUM (
  'queued',
  'processing',
  'completed',
  'failed',
  'canceled'
);

CREATE TABLE public.financial_recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  stripe_dispute_id text,
  kind public.financial_recovery_kind NOT NULL,
  status public.financial_recovery_status NOT NULL DEFAULT 'queued',
  target_amount_minor bigint NOT NULL CHECK (target_amount_minor > 0),
  completed_amount_minor bigint NOT NULL DEFAULT 0 CHECK (completed_amount_minor >= 0),
  stripe_transfer_id text,
  stripe_reversal_id text,
  stripe_restore_transfer_id text,
  idempotency_key text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT financial_recoveries_amounts_fit
    CHECK (completed_amount_minor <= target_amount_minor),
  CONSTRAINT financial_recoveries_logical_key
    UNIQUE NULLS NOT DISTINCT (transaction_id, stripe_dispute_id, kind)
);

CREATE INDEX financial_recoveries_status_idx
  ON public.financial_recoveries (status, updated_at);

CREATE TRIGGER set_financial_recoveries_updated_at
  BEFORE UPDATE ON public.financial_recoveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.financial_recoveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_recoveries FROM PUBLIC, anon, authenticated;

CREATE TABLE public.seller_risk_accounts (
  seller_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  debt_minor bigint NOT NULL DEFAULT 0 CHECK (debt_minor >= 0),
  locked_minor bigint NOT NULL DEFAULT 0 CHECK (locked_minor >= 0),
  payouts_blocked boolean NOT NULL DEFAULT false,
  alert_level text NOT NULL DEFAULT 'none'
    CHECK (alert_level IN ('none', 'warning', 'critical')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_seller_risk_accounts_updated_at
  BEFORE UPDATE ON public.seller_risk_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.seller_risk_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view their own risk account"
  ON public.seller_risk_accounts FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Admins can view seller risk accounts"
  ON public.seller_risk_accounts FOR SELECT
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

REVOKE ALL ON public.seller_risk_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.seller_risk_accounts TO authenticated;

ALTER TABLE public.financial_payout_config
  ADD COLUMN IF NOT EXISTS debt_warning_minor bigint NOT NULL DEFAULT 5000
    CHECK (debt_warning_minor > 0),
  ADD COLUMN IF NOT EXISTS debt_critical_minor bigint NOT NULL DEFAULT 25000
    CHECK (debt_critical_minor >= debt_warning_minor),
  ADD COLUMN IF NOT EXISTS dispute_reserve_bps integer NOT NULL DEFAULT 1000
    CHECK (dispute_reserve_bps BETWEEN 0 AND 10000);

CREATE OR REPLACE FUNCTION private.seller_liability_for_gross_refund(
  p_transaction public.transactions,
  p_cumulative_refund_minor bigint
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_total_minor bigint := round(p_transaction.total_amount * 100)::bigint;
  v_shipping_minor bigint := round(COALESCE(p_transaction.shipping_cost, 0) * 100)::bigint;
  v_fee_minor bigint := round(COALESCE(p_transaction.fee_amount, 0) * 100)::bigint;
  v_card_minor bigint;
  v_card_seller_minor bigint;
  v_refund_minor bigint;
  v_shipping_refund_minor bigint;
  v_card_refund_minor bigint;
BEGIN
  v_card_minor := v_total_minor - v_shipping_minor;
  v_card_seller_minor := GREATEST(v_card_minor - v_fee_minor, 0);
  v_refund_minor := LEAST(GREATEST(p_cumulative_refund_minor, 0), v_total_minor);
  v_shipping_refund_minor := LEAST(v_refund_minor, v_shipping_minor);
  v_card_refund_minor := LEAST(
    GREATEST(v_refund_minor - v_shipping_minor, 0),
    v_card_minor
  );

  RETURN LEAST(
    v_total_minor - v_fee_minor,
    v_shipping_refund_minor
      + CASE
          WHEN v_card_minor = 0 THEN 0
          ELSE round(
            v_card_refund_minor::numeric
              * v_card_seller_minor::numeric
              / v_card_minor::numeric
          )::bigint
        END
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.refresh_seller_risk_account(p_seller_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_debt_minor bigint;
  v_locked_minor bigint;
  v_warning_minor bigint;
  v_critical_minor bigint;
BEGIN
  SELECT
    GREATEST(-COALESCE(sum(e.amount_minor) FILTER (
      WHERE a.account_type = 'seller_debt'
    ), 0), 0),
    GREATEST(COALESCE(sum(e.amount_minor) FILTER (
      WHERE a.account_type = 'seller_locked'
    ), 0), 0)
  INTO v_debt_minor, v_locked_minor
  FROM public.ledger_accounts a
  LEFT JOIN public.ledger_entries e ON e.account_id = a.id
  WHERE a.owner_user_id = p_seller_id;

  SELECT debt_warning_minor, debt_critical_minor
  INTO v_warning_minor, v_critical_minor
  FROM public.financial_payout_config
  WHERE singleton;

  INSERT INTO public.seller_risk_accounts (
    seller_id,
    debt_minor,
    locked_minor,
    payouts_blocked,
    alert_level
  )
  VALUES (
    p_seller_id,
    v_debt_minor,
    v_locked_minor,
    v_debt_minor > 0,
    CASE
      WHEN v_debt_minor >= v_critical_minor THEN 'critical'
      WHEN v_debt_minor >= v_warning_minor THEN 'warning'
      ELSE 'none'
    END
  )
  ON CONFLICT (seller_id) DO UPDATE
  SET debt_minor = EXCLUDED.debt_minor,
      locked_minor = EXCLUDED.locked_minor,
      payouts_blocked = EXCLUDED.payouts_blocked,
      alert_level = EXCLUDED.alert_level;
END;
$$;

CREATE OR REPLACE FUNCTION private.consume_seller_debt_from_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.ledger_accounts%ROWTYPE;
  v_debt_minor bigint;
  v_recovered_minor bigint;
  v_journal_id uuid;
  v_debt_account_id uuid;
BEGIN
  IF NEW.amount_minor <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO STRICT v_account
  FROM public.ledger_accounts
  WHERE id = NEW.account_id;

  IF v_account.account_type <> 'seller_pending'
     OR v_account.owner_user_id IS NULL
     OR v_account.transaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT GREATEST(-COALESCE(sum(e.amount_minor), 0), 0)
  INTO v_debt_minor
  FROM public.ledger_accounts a
  LEFT JOIN public.ledger_entries e ON e.account_id = a.id
  WHERE a.owner_user_id = v_account.owner_user_id
    AND a.account_type = 'seller_debt';

  v_recovered_minor := LEAST(v_debt_minor, NEW.amount_minor);
  IF v_recovered_minor = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.ledger_transactions (
    transaction_id,
    journal_type,
    idempotency_key,
    business_reference,
    metadata
  )
  VALUES (
    v_account.transaction_id,
    'seller_debt_recovered',
    'debt-recovery:' || NEW.ledger_transaction_id::text,
    'seller-debt-recovery:' || NEW.ledger_transaction_id::text,
    jsonb_build_object(
      'seller_id', v_account.owner_user_id,
      'amount_minor', v_recovered_minor
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_journal_id;

  IF v_journal_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_debt_account_id := private.get_or_create_ledger_account(
    'seller_debt',
    v_account.owner_user_id,
    v_account.transaction_id,
    v_account.currency
  );

  INSERT INTO public.ledger_entries (
    ledger_transaction_id,
    account_id,
    amount_minor
  )
  VALUES
    (v_journal_id, v_account.id, -v_recovered_minor),
    (v_journal_id, v_debt_account_id, v_recovered_minor);

  PERFORM private.refresh_seller_risk_account(v_account.owner_user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER ledger_credit_consumes_seller_debt
  AFTER INSERT ON public.ledger_entries
  FOR EACH ROW
  WHEN (NEW.amount_minor > 0)
  EXECUTE FUNCTION private.consume_seller_debt_from_credit();

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
        ELSE 'queued'::public.financial_recovery_status
      END,
      last_error = NULL
  RETURNING id INTO v_recovery_id;

  INSERT INTO public.financial_outbox (
    event_type,
    aggregate_id,
    idempotency_key,
    payload
  )
  VALUES (
    v_event_type,
    p_transaction.id,
    'recovery-job:' || v_recovery_id::text || ':'
      || p_target_amount_minor::text,
    jsonb_build_object(
      'recovery_id', v_recovery_id,
      'target_amount_minor', p_target_amount_minor
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_recovery_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.record_seller_debt(
  p_transaction public.transactions,
  p_amount_minor bigint,
  p_idempotency_key text,
  p_journal_type text,
  p_stripe_refund_id text DEFAULT NULL,
  p_stripe_dispute_id text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_journal_id uuid;
  v_debt_account_id uuid;
  v_platform_account_id uuid;
BEGIN
  IF p_amount_minor <= 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.ledger_transactions (
    transaction_id,
    journal_type,
    idempotency_key,
    business_reference,
    stripe_refund_id,
    stripe_dispute_id,
    metadata
  )
  VALUES (
    p_transaction.id,
    p_journal_type,
    p_idempotency_key,
    p_idempotency_key,
    p_stripe_refund_id,
    p_stripe_dispute_id,
    jsonb_build_object('amount_minor', p_amount_minor)
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_journal_id;

  IF v_journal_id IS NULL THEN
    RETURN 0;
  END IF;

  v_debt_account_id := private.get_or_create_ledger_account(
    'seller_debt', p_transaction.seller_id, p_transaction.id, 'EUR'
  );
  v_platform_account_id := private.get_or_create_ledger_account(
    'platform_cash', NULL, p_transaction.id, 'EUR'
  );

  INSERT INTO public.ledger_entries (
    ledger_transaction_id,
    account_id,
    amount_minor
  )
  VALUES
    (v_journal_id, v_debt_account_id, -p_amount_minor),
    (v_journal_id, v_platform_account_id, p_amount_minor);

  PERFORM private.refresh_seller_risk_account(p_transaction.seller_id);
  RETURN p_amount_minor;
END;
$$;

CREATE OR REPLACE FUNCTION private.move_seller_funds(
  p_transaction public.transactions,
  p_amount_minor bigint,
  p_destination_type text,
  p_journal_type text,
  p_idempotency_key text,
  p_stripe_refund_id text DEFAULT NULL,
  p_stripe_dispute_id text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_journal_id uuid;
  v_destination_account_id uuid;
  v_source_account_id uuid;
  v_source_type text;
  v_balance bigint;
  v_take bigint;
  v_remaining bigint := p_amount_minor;
  v_moved bigint := 0;
BEGIN
  IF p_amount_minor <= 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.ledger_transactions (
    transaction_id,
    journal_type,
    idempotency_key,
    business_reference,
    stripe_refund_id,
    stripe_dispute_id,
    metadata
  )
  VALUES (
    p_transaction.id,
    p_journal_type,
    p_idempotency_key,
    p_idempotency_key,
    p_stripe_refund_id,
    p_stripe_dispute_id,
    jsonb_build_object('amount_minor', p_amount_minor)
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_journal_id;

  IF v_journal_id IS NULL THEN
    RETURN 0;
  END IF;

  v_destination_account_id := private.get_or_create_ledger_account(
    p_destination_type,
    CASE WHEN p_destination_type LIKE 'seller_%'
      THEN p_transaction.seller_id ELSE NULL END,
    p_transaction.id,
    'EUR'
  );

  FOREACH v_source_type IN ARRAY ARRAY[
    'seller_locked',
    'seller_pending',
    'seller_available'
  ]
  LOOP
    EXIT WHEN v_remaining = 0;
    IF v_source_type = p_destination_type THEN
      CONTINUE;
    END IF;

    v_source_account_id := private.get_or_create_ledger_account(
      v_source_type, p_transaction.seller_id, p_transaction.id, 'EUR'
    );
    SELECT GREATEST(COALESCE(sum(amount_minor), 0), 0)
    INTO v_balance
    FROM public.ledger_entries
    WHERE account_id = v_source_account_id;

    v_take := LEAST(v_balance, v_remaining);
    IF v_take > 0 THEN
      INSERT INTO public.ledger_entries (
        ledger_transaction_id,
        account_id,
        amount_minor
      )
      VALUES (v_journal_id, v_source_account_id, -v_take);
      v_remaining := v_remaining - v_take;
      v_moved := v_moved + v_take;
    END IF;
  END LOOP;

  IF v_moved = 0 THEN
    RAISE EXCEPTION 'SELLER_FUNDS_UNAVAILABLE: transaction %', p_transaction.id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ledger_entries (
    ledger_transaction_id,
    account_id,
    amount_minor
  )
  VALUES (v_journal_id, v_destination_account_id, v_moved);

  PERFORM private.rebuild_wallet_projection(p_transaction.seller_id);
  PERFORM private.refresh_seller_risk_account(p_transaction.seller_id);
  RETURN v_moved;
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
  ELSIF v_transfer.paid_minor > 0 OR v_transfer.status = 'paid' THEN
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
  ELSIF v_transfer.paid_minor > 0 OR v_transfer.status = 'paid' THEN
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
BEGIN
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
  WHERE r.id = p_recovery_id;
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

CREATE OR REPLACE FUNCTION public.fail_financial_recovery(
  p_recovery_id uuid,
  p_error text
)
RETURNS boolean
LANGUAGE sql
SET search_path = ''
AS $$
  WITH updated AS (
    UPDATE public.financial_recoveries
    SET status = 'failed',
        last_error = left(p_error, 2000)
    WHERE id = p_recovery_id
    RETURNING 1
  )
  SELECT EXISTS(SELECT 1 FROM updated);
$$;

ALTER FUNCTION public.reserve_seller_payout(uuid)
  RENAME TO reserve_seller_payout_original;

CREATE FUNCTION public.reserve_seller_payout(
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

  RETURN QUERY
  SELECT * FROM public.reserve_seller_payout_original(p_seller_id);
END;
$$;

CREATE OR REPLACE VIEW public.financial_risk_alerts
WITH (security_invoker = true)
AS
SELECT
  r.seller_id,
  r.debt_minor,
  r.locked_minor,
  r.payouts_blocked,
  r.alert_level,
  r.updated_at,
  count(d.id) FILTER (
    WHERE d.status IN ('warning_needs_response', 'needs_response')
  ) AS disputes_needing_response,
  min(d.evidence_due_by) FILTER (
    WHERE d.status IN ('warning_needs_response', 'needs_response')
  ) AS next_evidence_due_by
FROM public.seller_risk_accounts r
LEFT JOIN public.transactions t ON t.seller_id = r.seller_id
LEFT JOIN public.stripe_disputes d ON d.transaction_id = t.id
GROUP BY r.seller_id;

REVOKE ALL ON public.financial_risk_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.financial_risk_alerts TO authenticated;

REVOKE ALL ON FUNCTION public.apply_stripe_refund(text, bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_stripe_dispute(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_stripe_dispute(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_financial_recovery(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_financial_recovery(uuid, bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_financial_recovery(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_seller_payout(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_seller_payout_original(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_stripe_refund(text, bigint, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_stripe_dispute(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_stripe_dispute(text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_financial_recovery(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_financial_recovery(uuid, bigint, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_financial_recovery(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_seller_payout(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_seller_payout_original(uuid)
  TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;
