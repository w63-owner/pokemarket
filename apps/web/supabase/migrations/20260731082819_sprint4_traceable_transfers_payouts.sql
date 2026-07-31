-- Sprint 4: one traceable Stripe transfer per completed order, followed by a
-- distinct connected-account payout. All state transitions are durable and
-- all balance changes are represented by immutable, balanced ledger entries.

CREATE TYPE public.seller_transfer_status AS ENUM (
  'queued',
  'processing',
  'transferred',
  'payout_pending',
  'paid',
  'failed',
  'reversed'
);

ALTER TABLE public.ledger_accounts
  DROP CONSTRAINT ledger_accounts_account_type_check;

ALTER TABLE public.ledger_accounts
  ADD CONSTRAINT ledger_accounts_account_type_check CHECK (account_type IN (
    'platform_cash',
    'platform_fee',
    'platform_adjustment',
    'seller_pending',
    'seller_available',
    'seller_connected',
    'seller_payout_pending',
    'seller_paid',
    'seller_locked',
    'seller_debt'
  ));

ALTER TABLE public.ledger_transactions
  DROP CONSTRAINT ledger_transactions_journal_type_check,
  DROP CONSTRAINT ledger_transactions_reference_shape;

ALTER TABLE public.ledger_transactions
  ADD COLUMN stripe_transfer_id text,
  ADD COLUMN stripe_payout_id text,
  ADD CONSTRAINT ledger_transactions_journal_type_check CHECK (journal_type IN (
    'payment_captured',
    'escrow_released',
    'transfer_to_connect',
    'transfer_reversed',
    'payout_reserved',
    'payout_paid',
    'payout_restored',
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
        'payout_restored'
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

CREATE UNIQUE INDEX ledger_transactions_transfer_unique
  ON public.ledger_transactions (stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL
    AND journal_type = 'transfer_to_connect';

CREATE INDEX ledger_transactions_payout_idx
  ON public.ledger_transactions (stripe_payout_id)
  WHERE stripe_payout_id IS NOT NULL;

CREATE TABLE public.seller_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE
    REFERENCES public.transactions(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency = upper(currency)),
  status public.seller_transfer_status NOT NULL DEFAULT 'queued',
  stripe_account_id text,
  source_charge_id text,
  transfer_group text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  stripe_transfer_id text UNIQUE,
  amount_reversed_minor bigint NOT NULL DEFAULT 0
    CHECK (amount_reversed_minor >= 0 AND amount_reversed_minor <= amount_minor),
  payout_reserved_minor bigint NOT NULL DEFAULT 0
    CHECK (payout_reserved_minor >= 0),
  paid_minor bigint NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  failure_code text,
  failure_message text,
  processing_started_at timestamptz,
  transferred_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_transfers_allocations_fit CHECK (
    payout_reserved_minor + paid_minor <= amount_minor
  )
);

CREATE INDEX seller_transfers_seller_status_idx
  ON public.seller_transfers (seller_id, status, transferred_at);

CREATE INDEX seller_transfers_processing_idx
  ON public.seller_transfers (processing_started_at)
  WHERE status = 'processing';

CREATE TRIGGER set_seller_transfers_updated_at
  BEFORE UPDATE ON public.seller_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.payouts
  ADD COLUMN amount_minor bigint,
  ADD COLUMN stripe_account_id text,
  ADD COLUMN idempotency_key text,
  ADD COLUMN risk_reserve_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN payout_delay_days integer NOT NULL DEFAULT 0;

UPDATE public.payouts
SET amount_minor = round(amount * 100)::bigint,
    idempotency_key = 'legacy-payout:' || id::text
WHERE amount_minor IS NULL OR idempotency_key IS NULL;

ALTER TABLE public.payouts
  ALTER COLUMN amount_minor SET NOT NULL,
  ALTER COLUMN idempotency_key SET NOT NULL,
  ADD CONSTRAINT payouts_amount_minor_positive CHECK (amount_minor > 0),
  ADD CONSTRAINT payouts_risk_reserve_nonnegative CHECK (risk_reserve_minor >= 0),
  ADD CONSTRAINT payouts_delay_nonnegative CHECK (payout_delay_days >= 0),
  ADD CONSTRAINT payouts_idempotency_key_unique UNIQUE (idempotency_key),
  ADD CONSTRAINT payouts_stripe_payout_id_unique UNIQUE (stripe_payout_id);

CREATE TABLE public.payout_items (
  payout_id uuid NOT NULL REFERENCES public.payouts(id) ON DELETE RESTRICT,
  seller_transfer_id uuid NOT NULL
    REFERENCES public.seller_transfers(id) ON DELETE RESTRICT,
  transaction_id uuid NOT NULL
    REFERENCES public.transactions(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (payout_id, seller_transfer_id)
);

CREATE INDEX payout_items_transfer_idx
  ON public.payout_items (seller_transfer_id);

CREATE TABLE public.financial_payout_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  minimum_payout_minor bigint NOT NULL DEFAULT 1000
    CHECK (minimum_payout_minor > 0),
  risk_reserve_minor bigint NOT NULL DEFAULT 500
    CHECK (risk_reserve_minor >= 0),
  payout_delay_days integer NOT NULL DEFAULT 2
    CHECK (payout_delay_days BETWEEN 0 AND 31),
  schedule_interval text NOT NULL DEFAULT 'manual'
    CHECK (schedule_interval = 'manual'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.financial_payout_config (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TRIGGER set_financial_payout_config_updated_at
  BEFORE UPDATE ON public.financial_payout_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.seller_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_payout_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view their order transfers"
  ON public.seller_transfers FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can view their payout items"
  ON public.payout_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.payouts p
      WHERE p.id = payout_items.payout_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can view payout policy"
  ON public.financial_payout_config FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.seller_transfers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payout_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.financial_payout_config FROM PUBLIC, anon;
GRANT SELECT ON public.seller_transfers, public.payout_items TO authenticated;
GRANT SELECT ON public.financial_payout_config TO authenticated;

CREATE OR REPLACE FUNCTION private.rebuild_wallet_projection(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pending_minor bigint;
  v_available_minor bigint;
BEGIN
  SELECT
    COALESCE(sum(e.amount_minor) FILTER (
      WHERE a.account_type = 'seller_pending'
    ), 0),
    COALESCE(sum(e.amount_minor) FILTER (
      WHERE a.account_type IN ('seller_available', 'seller_connected')
    ), 0)
  INTO v_pending_minor, v_available_minor
  FROM public.ledger_accounts a
  LEFT JOIN public.ledger_entries e ON e.account_id = a.id
  WHERE a.owner_user_id = p_user_id;

  IF v_pending_minor < 0 OR v_available_minor < 0 THEN
    RAISE EXCEPTION
      'NEGATIVE_WALLET_PROJECTION: user % pending=% available=%',
      p_user_id, v_pending_minor, v_available_minor
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('pokemarket.rebuilding_wallet_projection', 'on', true);

  INSERT INTO public.wallets (
    user_id,
    pending_balance,
    available_balance,
    currency
  )
  VALUES (
    p_user_id,
    v_pending_minor::numeric / 100,
    v_available_minor::numeric / 100,
    'EUR'
  )
  ON CONFLICT (user_id) DO UPDATE
    SET pending_balance = EXCLUDED.pending_balance,
        available_balance = EXCLUDED.available_balance,
        currency = EXCLUDED.currency;

  PERFORM set_config('pokemarket.rebuilding_wallet_projection', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION private.create_seller_transfer_from_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.event_type <> 'transfer_requested' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.seller_transfers (
    transaction_id,
    seller_id,
    amount_minor,
    currency,
    stripe_account_id,
    source_charge_id,
    transfer_group,
    idempotency_key
  )
  SELECT
    t.id,
    t.seller_id,
    (NEW.payload ->> 'amount_minor')::bigint,
    upper(COALESCE(NEW.payload ->> 'currency', 'EUR')),
    p.stripe_account_id,
    t.stripe_charge_id,
    'order_' || t.id::text,
    'transfer:' || t.id::text
  FROM public.transactions t
  JOIN public.profiles p ON p.id = t.seller_id
  WHERE t.id = NEW.aggregate_id
  ON CONFLICT (transaction_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_outbox_create_seller_transfer
  AFTER INSERT ON public.financial_outbox
  FOR EACH ROW EXECUTE FUNCTION private.create_seller_transfer_from_outbox();

INSERT INTO public.seller_transfers (
  transaction_id,
  seller_id,
  amount_minor,
  currency,
  stripe_account_id,
  source_charge_id,
  transfer_group,
  idempotency_key
)
SELECT
  t.id,
  t.seller_id,
  (o.payload ->> 'amount_minor')::bigint,
  upper(COALESCE(o.payload ->> 'currency', 'EUR')),
  p.stripe_account_id,
  t.stripe_charge_id,
  'order_' || t.id::text,
  'transfer:' || t.id::text
FROM public.financial_outbox o
JOIN public.transactions t ON t.id = o.aggregate_id
JOIN public.profiles p ON p.id = t.seller_id
WHERE o.event_type = 'transfer_requested'
ON CONFLICT (transaction_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.prepare_seller_transfer(
  p_transaction_id uuid
)
RETURNS SETOF public.seller_transfers
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_transfer public.seller_transfers%ROWTYPE;
BEGIN
  SELECT *
  INTO v_transfer
  FROM public.seller_transfers
  WHERE transaction_id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSFER_NOT_FOUND: transaction %', p_transaction_id
      USING ERRCODE = 'P0002';
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
        failure_code = NULL,
        failure_message = NULL
    WHERE id = v_transfer.id
    RETURNING * INTO v_transfer;
  END IF;

  RETURN NEXT v_transfer;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_seller_transfer_success(
  p_transaction_id uuid,
  p_stripe_transfer_id text,
  p_source_charge_id text,
  p_transfer_group text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_transfer public.seller_transfers%ROWTYPE;
  v_journal_id uuid;
  v_available_account_id uuid;
  v_connected_account_id uuid;
  v_available_balance bigint;
BEGIN
  SELECT *
  INTO v_transfer
  FROM public.seller_transfers
  WHERE transaction_id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSFER_NOT_FOUND: transaction %', p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_transfer.stripe_transfer_id IS NOT NULL
     AND v_transfer.stripe_transfer_id IS DISTINCT FROM p_stripe_transfer_id THEN
    RAISE EXCEPTION 'TRANSFER_ID_CONFLICT: transaction %', p_transaction_id
      USING ERRCODE = '23505';
  END IF;

  IF v_transfer.status IN ('transferred', 'payout_pending', 'paid', 'reversed') THEN
    RETURN true;
  END IF;

  v_available_account_id := private.get_or_create_ledger_account(
    'seller_available',
    v_transfer.seller_id,
    v_transfer.transaction_id,
    v_transfer.currency
  );

  SELECT COALESCE(sum(amount_minor), 0)
  INTO v_available_balance
  FROM public.ledger_entries
  WHERE account_id = v_available_account_id;

  IF v_available_balance < v_transfer.amount_minor THEN
    RAISE EXCEPTION
      'TRANSFER_LEDGER_BALANCE_MISMATCH: transaction % has %, requires %',
      p_transaction_id, v_available_balance, v_transfer.amount_minor
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ledger_transactions (
    transaction_id,
    journal_type,
    idempotency_key,
    business_reference,
    stripe_transfer_id,
    stripe_charge_id,
    metadata
  )
  VALUES (
    v_transfer.transaction_id,
    'transfer_to_connect',
    'transfer:' || v_transfer.transaction_id::text,
    'order-transfer:' || v_transfer.transaction_id::text,
    p_stripe_transfer_id,
    p_source_charge_id,
    jsonb_build_object(
      'amount_minor', v_transfer.amount_minor,
      'stripe_account_id', v_transfer.stripe_account_id,
      'transfer_group', p_transfer_group
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_journal_id;

  IF v_journal_id IS NOT NULL THEN
    v_connected_account_id := private.get_or_create_ledger_account(
      'seller_connected',
      v_transfer.seller_id,
      v_transfer.transaction_id,
      v_transfer.currency
    );

    INSERT INTO public.ledger_entries (
      ledger_transaction_id,
      account_id,
      amount_minor
    )
    VALUES
      (v_journal_id, v_available_account_id, -v_transfer.amount_minor),
      (v_journal_id, v_connected_account_id, v_transfer.amount_minor);
  END IF;

  UPDATE public.seller_transfers
  SET status = 'transferred',
      stripe_transfer_id = p_stripe_transfer_id,
      source_charge_id = p_source_charge_id,
      transfer_group = p_transfer_group,
      transferred_at = COALESCE(transferred_at, now()),
      processing_started_at = NULL,
      failure_code = NULL,
      failure_message = NULL
  WHERE id = v_transfer.id;

  PERFORM private.rebuild_wallet_projection(v_transfer.seller_id);
  RETURN true;
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
      failure_code = left(p_failure_code, 255),
      failure_message = left(p_failure_message, 2000)
  WHERE transaction_id = p_transaction_id
    AND status IN ('queued', 'processing', 'failed');

  RETURN FOUND;
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
DECLARE
  v_config public.financial_payout_config%ROWTYPE;
  v_stripe_account_id text;
  v_total_available bigint;
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

  v_payout_amount := GREATEST(v_total_available - v_config.risk_reserve_minor, 0);

  IF v_payout_amount < v_config.minimum_payout_minor THEN
    RAISE EXCEPTION
      'PAYOUT_BELOW_MINIMUM: available=% reserve=% minimum=%',
      v_total_available,
      v_config.risk_reserve_minor,
      v_config.minimum_payout_minor
      USING ERRCODE = 'P0001';
  END IF;

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
    v_config.risk_reserve_minor,
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
    v_config.risk_reserve_minor,
    v_config.payout_delay_days;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_stripe_payout(
  p_payout_id uuid,
  p_stripe_payout_id text,
  p_stripe_account_id text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.payouts
  SET stripe_payout_id = p_stripe_payout_id,
      stripe_account_id = p_stripe_account_id,
      status = CASE
        WHEN status = 'pending' THEN 'in_transit'::public.payout_status
        ELSE status
      END
  WHERE id = p_payout_id
    AND (
      stripe_payout_id IS NULL
      OR stripe_payout_id = p_stripe_payout_id
    );

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION private.apply_payout_terminal_transition(
  p_payout_id uuid,
  p_target_status public.payout_status,
  p_stripe_payout_id text,
  p_failure_code text,
  p_failure_message text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payout public.payouts%ROWTYPE;
  v_item public.payout_items%ROWTYPE;
  v_transfer public.seller_transfers%ROWTYPE;
  v_journal_id uuid;
  v_pending_account_id uuid;
  v_destination_account_id uuid;
  v_journal_type text;
  v_key_prefix text;
BEGIN
  SELECT *
  INTO v_payout
  FROM public.payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_payout.status = p_target_status THEN
    RETURN true;
  END IF;

  IF v_payout.status IN ('paid', 'failed', 'canceled') THEN
    RETURN true;
  END IF;

  IF p_target_status NOT IN ('paid', 'failed', 'canceled') THEN
    RAISE EXCEPTION 'UNSUPPORTED_PAYOUT_TRANSITION: %', p_target_status
      USING ERRCODE = '22023';
  END IF;

  IF p_target_status = 'paid' THEN
    v_journal_type := 'payout_paid';
    v_key_prefix := 'payout-paid:';
  ELSE
    v_journal_type := 'payout_restored';
    v_key_prefix := 'payout-restored:';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.payout_items
    WHERE payout_id = v_payout.id
    ORDER BY transaction_id
  LOOP
    SELECT *
    INTO STRICT v_transfer
    FROM public.seller_transfers
    WHERE id = v_item.seller_transfer_id
    FOR UPDATE;

    IF v_transfer.status = 'reversed' THEN
      UPDATE public.seller_transfers
      SET payout_reserved_minor = payout_reserved_minor - v_item.amount_minor,
          paid_minor = paid_minor + CASE
            WHEN p_target_status = 'paid' THEN v_item.amount_minor
            ELSE 0
          END
      WHERE id = v_transfer.id;
      CONTINUE;
    END IF;

    INSERT INTO public.ledger_transactions (
      transaction_id,
      journal_type,
      idempotency_key,
      business_reference,
      stripe_payout_id,
      metadata
    )
    VALUES (
      v_item.transaction_id,
      v_journal_type,
      v_key_prefix || v_payout.id::text || ':' || v_item.transaction_id::text,
      v_key_prefix || v_payout.id::text || ':' || v_item.transaction_id::text,
      COALESCE(p_stripe_payout_id, v_payout.stripe_payout_id),
      jsonb_build_object(
        'payout_id', v_payout.id,
        'amount_minor', v_item.amount_minor,
        'target_status', p_target_status
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_journal_id;

    IF v_journal_id IS NOT NULL THEN
      v_pending_account_id := private.get_or_create_ledger_account(
        'seller_payout_pending',
        v_transfer.seller_id,
        v_transfer.transaction_id,
        v_transfer.currency
      );
      v_destination_account_id := private.get_or_create_ledger_account(
        CASE
          WHEN p_target_status = 'paid' THEN 'seller_paid'
          ELSE 'seller_connected'
        END,
        v_transfer.seller_id,
        v_transfer.transaction_id,
        v_transfer.currency
      );

      INSERT INTO public.ledger_entries (
        ledger_transaction_id,
        account_id,
        amount_minor
      )
      VALUES
        (v_journal_id, v_pending_account_id, -v_item.amount_minor),
        (v_journal_id, v_destination_account_id, v_item.amount_minor);
    END IF;

    UPDATE public.seller_transfers
    SET payout_reserved_minor = payout_reserved_minor - v_item.amount_minor,
        paid_minor = paid_minor + CASE
          WHEN p_target_status = 'paid' THEN v_item.amount_minor
          ELSE 0
        END,
        status = CASE
          WHEN status = 'reversed'
            THEN 'reversed'::public.seller_transfer_status
          WHEN p_target_status = 'paid'
               AND paid_minor + v_item.amount_minor
                 >= amount_minor - amount_reversed_minor
            THEN 'paid'::public.seller_transfer_status
          ELSE 'transferred'::public.seller_transfer_status
        END
    WHERE id = v_transfer.id;
  END LOOP;

  UPDATE public.payouts
  SET status = p_target_status,
      stripe_payout_id = COALESCE(stripe_payout_id, p_stripe_payout_id),
      failure_code = CASE
        WHEN p_target_status IN ('failed', 'canceled') THEN left(p_failure_code, 255)
        ELSE NULL
      END,
      failure_message = CASE
        WHEN p_target_status IN ('failed', 'canceled') THEN left(p_failure_message, 2000)
        ELSE NULL
      END,
      completed_at = now()
  WHERE id = v_payout.id;

  PERFORM private.rebuild_wallet_projection(v_payout.user_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_reserved_payout(
  p_payout_id uuid,
  p_failure_code text,
  p_failure_message text
)
RETURNS boolean
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT private.apply_payout_terminal_transition(
    p_payout_id,
    'failed',
    NULL,
    p_failure_code,
    p_failure_message
  );
$$;

CREATE OR REPLACE FUNCTION public.apply_stripe_payout_transition(
  p_stripe_payout_id text,
  p_target_status public.payout_status,
  p_failure_code text DEFAULT NULL,
  p_failure_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_payout_id uuid;
BEGIN
  SELECT id
  INTO v_payout_id
  FROM public.payouts
  WHERE stripe_payout_id = p_stripe_payout_id;

  IF v_payout_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_target_status IN ('pending', 'in_transit') THEN
    UPDATE public.payouts
    SET status = p_target_status
    WHERE id = v_payout_id
      AND status IN ('pending', 'in_transit');
    RETURN true;
  END IF;

  RETURN private.apply_payout_terminal_transition(
    v_payout_id,
    p_target_status,
    p_stripe_payout_id,
    p_failure_code,
    p_failure_message
  );
END;
$$;

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
  END IF;

  INSERT INTO public.ledger_entries (
    ledger_transaction_id,
    account_id,
    amount_minor
  )
  VALUES (v_journal_id, v_locked_account_id, v_delta);

  UPDATE public.seller_transfers
  SET status = 'reversed',
      amount_reversed_minor = p_amount_reversed_minor,
      reversed_at = now()
  WHERE id = v_transfer.id;

  PERFORM private.rebuild_wallet_projection(v_transfer.seller_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_seller_transfer(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_seller_transfer_success(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_seller_transfer_failure(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_seller_payout(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_stripe_payout(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_reserved_payout(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stripe_payout_transition(
  text, public.payout_status, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stripe_transfer_reversal(text, bigint)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prepare_seller_transfer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_seller_transfer_success(uuid, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_seller_transfer_failure(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_seller_payout(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_stripe_payout(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_reserved_payout(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_payout_transition(
  text, public.payout_status, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_transfer_reversal(text, bigint)
  TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;;
