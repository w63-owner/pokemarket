-- Sprint 2: immutable, balanced ledger and durable financial outbox.
--
-- All ledger amounts are integer minor units (EUR cents). `wallets` remains a
-- read-optimised projection for clients; it is rebuilt from ledger entries and
-- is no longer a source of financial truth.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA private TO service_role;

ALTER TABLE public.notifications_outbox
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_token uuid;

ALTER TABLE public.notifications_outbox
  DROP CONSTRAINT IF EXISTS notifications_outbox_channel_check;

ALTER TABLE public.notifications_outbox
  ADD CONSTRAINT notifications_outbox_channel_check
  CHECK (channel IN ('push', 'email', 'in_app'));

ALTER TABLE public.notifications_outbox
  DROP CONSTRAINT IF EXISTS notifications_outbox_status_check;

ALTER TABLE public.notifications_outbox
  ADD CONSTRAINT notifications_outbox_status_check
  CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED'));

CREATE UNIQUE INDEX IF NOT EXISTS notifications_outbox_idempotency_key_unique
  ON public.notifications_outbox (idempotency_key);

CREATE INDEX IF NOT EXISTS notifications_outbox_expired_lease_idx
  ON public.notifications_outbox (lease_expires_at)
  WHERE status = 'PROCESSING';

CREATE UNIQUE INDEX IF NOT EXISTS messages_payment_completed_transaction_unique
  ON public.messages ((metadata ->> 'transaction_id'))
  WHERE message_type = 'payment_completed'
    AND metadata ? 'transaction_id';

CREATE TABLE public.ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type text NOT NULL CHECK (account_type IN (
    'platform_cash',
    'platform_fee',
    'platform_adjustment',
    'seller_pending',
    'seller_available'
  )),
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency = upper(currency)),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_accounts_owner_shape CHECK (
    (account_type LIKE 'seller_%' AND owner_user_id IS NOT NULL)
    OR
    (account_type LIKE 'platform_%' AND owner_user_id IS NULL)
  ),
  CONSTRAINT ledger_accounts_logical_key
    UNIQUE NULLS NOT DISTINCT (account_type, owner_user_id, transaction_id, currency)
);

CREATE TABLE public.ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE RESTRICT,
  journal_type text NOT NULL CHECK (journal_type IN (
    'payment_captured',
    'escrow_released',
    'opening_balance',
    'wallet_adjustment',
    'projection_adjustment'
  )),
  idempotency_key text NOT NULL UNIQUE,
  business_reference text NOT NULL UNIQUE,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_transactions_reference_shape CHECK (
    (
      journal_type IN ('payment_captured', 'escrow_released')
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
  )
);

CREATE UNIQUE INDEX ledger_transactions_payment_intent_unique
  ON public.ledger_transactions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL
    AND journal_type = 'payment_captured';

CREATE UNIQUE INDEX ledger_transactions_charge_unique
  ON public.ledger_transactions (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL
    AND journal_type = 'payment_captured';

CREATE TABLE public.stripe_object_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL
    REFERENCES public.transactions(id) ON DELETE RESTRICT,
  ledger_transaction_id uuid NOT NULL
    REFERENCES public.ledger_transactions(id) ON DELETE RESTRICT,
  stripe_object_type text NOT NULL CHECK (
    stripe_object_type IN ('payment_intent', 'charge')
  ),
  stripe_object_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_object_bindings_object_unique
    UNIQUE (stripe_object_type, stripe_object_id),
  CONSTRAINT stripe_object_bindings_transaction_type_unique
    UNIQUE (transaction_id, stripe_object_type)
);

CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_transaction_id uuid NOT NULL
    REFERENCES public.ledger_transactions(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor <> 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_account_once
    UNIQUE (ledger_transaction_id, account_id)
);

CREATE INDEX ledger_entries_account_created_idx
  ON public.ledger_entries (account_id, created_at, id);

CREATE INDEX ledger_accounts_owner_type_idx
  ON public.ledger_accounts (owner_user_id, account_type)
  WHERE owner_user_id IS NOT NULL;

CREATE TABLE public.financial_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'payment_finalized',
    'transfer_requested'
  )),
  aggregate_type text NOT NULL DEFAULT 'transaction'
    CHECK (aggregate_type = 'transaction'),
  aggregate_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
  )),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 12 CHECK (max_attempts > 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  lease_token uuid,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX financial_outbox_due_idx
  ON public.financial_outbox (event_type, next_attempt_at, created_at)
  WHERE status IN ('PENDING', 'PROCESSING');

CREATE TRIGGER set_financial_outbox_updated_at
  BEFORE UPDATE ON public.financial_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stripe_object_bindings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.financial_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ledger_accounts FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.ledger_transactions FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.ledger_entries FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.stripe_object_bindings FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.financial_outbox FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.prevent_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_LEDGER: % on %.% is forbidden',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER ledger_accounts_immutable
  BEFORE UPDATE OR DELETE ON public.ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION private.prevent_ledger_mutation();

CREATE TRIGGER ledger_transactions_immutable
  BEFORE UPDATE OR DELETE ON public.ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION private.prevent_ledger_mutation();

CREATE TRIGGER ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION private.prevent_ledger_mutation();

CREATE TRIGGER stripe_object_bindings_immutable
  BEFORE UPDATE OR DELETE ON public.stripe_object_bindings
  FOR EACH ROW EXECUTE FUNCTION private.prevent_ledger_mutation();

CREATE OR REPLACE FUNCTION private.assert_balanced_ledger_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_ledger_transaction_id uuid;
  v_balance bigint;
BEGIN
  v_ledger_transaction_id := COALESCE(NEW.ledger_transaction_id, OLD.ledger_transaction_id);

  SELECT COALESCE(sum(amount_minor), 0)
    INTO v_balance
    FROM public.ledger_entries
   WHERE ledger_transaction_id = v_ledger_transaction_id;

  IF v_balance <> 0 THEN
    RAISE EXCEPTION 'UNBALANCED_LEDGER_TRANSACTION: % has balance % minor units',
      v_ledger_transaction_id, v_balance
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT OR UPDATE OR DELETE ON public.ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.assert_balanced_ledger_transaction();

CREATE OR REPLACE FUNCTION private.assert_ledger_entry_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_account_transaction_id uuid;
  v_journal_transaction_id uuid;
BEGIN
  SELECT transaction_id
    INTO STRICT v_account_transaction_id
    FROM public.ledger_accounts
   WHERE id = NEW.account_id;

  SELECT transaction_id
    INTO STRICT v_journal_transaction_id
    FROM public.ledger_transactions
   WHERE id = NEW.ledger_transaction_id;

  IF v_account_transaction_id IS DISTINCT FROM v_journal_transaction_id THEN
    RAISE EXCEPTION
      'LEDGER_REFERENCE_MISMATCH: account transaction % differs from journal transaction %',
      v_account_transaction_id, v_journal_transaction_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ledger_entries_consistent
  BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION private.assert_ledger_entry_consistency();

CREATE OR REPLACE FUNCTION private.get_or_create_ledger_account(
  p_account_type text,
  p_owner_user_id uuid,
  p_transaction_id uuid,
  p_currency char(3) DEFAULT 'EUR'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  INSERT INTO public.ledger_accounts (
    account_type,
    owner_user_id,
    transaction_id,
    currency
  )
  VALUES (
    p_account_type,
    p_owner_user_id,
    p_transaction_id,
    upper(p_currency)
  )
  ON CONFLICT ON CONSTRAINT ledger_accounts_logical_key
  DO NOTHING
  RETURNING id INTO v_account_id;

  IF v_account_id IS NULL THEN
    SELECT id
      INTO STRICT v_account_id
      FROM public.ledger_accounts
     WHERE account_type = p_account_type
       AND owner_user_id IS NOT DISTINCT FROM p_owner_user_id
       AND transaction_id IS NOT DISTINCT FROM p_transaction_id
       AND currency = upper(p_currency);
  END IF;

  RETURN v_account_id;
END;
$$;

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
      WHERE a.account_type = 'seller_available'
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

CREATE OR REPLACE FUNCTION private.record_payment_ledger(
  p_transaction public.transactions,
  p_stripe_payment_intent_id text,
  p_stripe_charge_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total_minor bigint;
  v_fee_minor bigint;
  v_seller_minor bigint;
  v_ledger_transaction_id uuid;
  v_platform_cash_account uuid;
  v_platform_fee_account uuid;
  v_seller_pending_account uuid;
BEGIN
  v_total_minor := round(p_transaction.total_amount * 100)::bigint;
  v_fee_minor := round(p_transaction.fee_amount * 100)::bigint;
  v_seller_minor := v_total_minor - v_fee_minor;

  IF v_total_minor <= 0 OR v_fee_minor < 0 OR v_seller_minor <= 0 THEN
    RAISE EXCEPTION
      'INVALID_PAYMENT_AMOUNTS: transaction % total=% fee=% seller=%',
      p_transaction.id, v_total_minor, v_fee_minor, v_seller_minor
      USING ERRCODE = '23514';
  END IF;

  SELECT id
    INTO v_ledger_transaction_id
    FROM public.ledger_transactions
   WHERE idempotency_key = 'payment:' || p_transaction.id::text;

  IF v_ledger_transaction_id IS NOT NULL THEN
    RETURN v_ledger_transaction_id;
  END IF;

  INSERT INTO public.ledger_transactions (
    transaction_id,
    journal_type,
    idempotency_key,
    business_reference,
    stripe_payment_intent_id,
    stripe_charge_id,
    metadata
  )
  VALUES (
    p_transaction.id,
    'payment_captured',
    'payment:' || p_transaction.id::text,
    'order-payment:' || p_transaction.id::text,
    p_stripe_payment_intent_id,
    p_stripe_charge_id,
    jsonb_build_object(
      'total_minor', v_total_minor,
      'fee_minor', v_fee_minor,
      'seller_minor', v_seller_minor
    )
  )
  RETURNING id INTO v_ledger_transaction_id;

  v_platform_cash_account := private.get_or_create_ledger_account(
    'platform_cash', NULL, p_transaction.id, 'EUR'
  );
  v_seller_pending_account := private.get_or_create_ledger_account(
    'seller_pending', p_transaction.seller_id, p_transaction.id, 'EUR'
  );

  INSERT INTO public.ledger_entries (
    ledger_transaction_id,
    account_id,
    amount_minor
  )
  VALUES
    (v_ledger_transaction_id, v_platform_cash_account, -v_total_minor),
    (v_ledger_transaction_id, v_seller_pending_account, v_seller_minor);

  IF v_fee_minor > 0 THEN
    v_platform_fee_account := private.get_or_create_ledger_account(
      'platform_fee', NULL, p_transaction.id, 'EUR'
    );
    INSERT INTO public.ledger_entries (
      ledger_transaction_id,
      account_id,
      amount_minor
    )
    VALUES (v_ledger_transaction_id, v_platform_fee_account, v_fee_minor);
  END IF;

  RETURN v_ledger_transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.bind_stripe_object(
  p_transaction_id uuid,
  p_ledger_transaction_id uuid,
  p_stripe_object_type text,
  p_stripe_object_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_binding public.stripe_object_bindings%ROWTYPE;
  v_current_object_id text;
BEGIN
  IF p_stripe_object_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.stripe_object_bindings (
    transaction_id,
    ledger_transaction_id,
    stripe_object_type,
    stripe_object_id
  )
  VALUES (
    p_transaction_id,
    p_ledger_transaction_id,
    p_stripe_object_type,
    p_stripe_object_id
  )
  ON CONFLICT DO NOTHING;

  SELECT *
    INTO v_binding
    FROM public.stripe_object_bindings
   WHERE (
     stripe_object_type = p_stripe_object_type
     AND stripe_object_id = p_stripe_object_id
   )
   OR (
     transaction_id = p_transaction_id
     AND stripe_object_type = p_stripe_object_type
   )
   ORDER BY transaction_id = p_transaction_id DESC
   LIMIT 1;

  IF NOT FOUND
     OR v_binding.transaction_id IS DISTINCT FROM p_transaction_id
     OR v_binding.ledger_transaction_id IS DISTINCT FROM p_ledger_transaction_id
     OR v_binding.stripe_object_id IS DISTINCT FROM p_stripe_object_id THEN
    RAISE EXCEPTION
      'STRIPE_BINDING_CONFLICT: % % cannot bind to transaction %',
      p_stripe_object_type, p_stripe_object_id, p_transaction_id
      USING ERRCODE = '23505';
  END IF;

  IF p_stripe_object_type = 'payment_intent' THEN
    SELECT stripe_payment_intent_id
      INTO v_current_object_id
      FROM public.transactions
     WHERE id = p_transaction_id;

    IF v_current_object_id IS NOT NULL
       AND v_current_object_id IS DISTINCT FROM p_stripe_object_id THEN
      RAISE EXCEPTION 'STRIPE_PAYMENT_INTENT_CONFLICT for transaction %',
        p_transaction_id
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.transactions
       SET stripe_payment_intent_id = p_stripe_object_id
     WHERE id = p_transaction_id
       AND stripe_payment_intent_id IS NULL;
  ELSIF p_stripe_object_type = 'charge' THEN
    SELECT stripe_charge_id
      INTO v_current_object_id
      FROM public.transactions
     WHERE id = p_transaction_id;

    IF v_current_object_id IS NOT NULL
       AND v_current_object_id IS DISTINCT FROM p_stripe_object_id THEN
      RAISE EXCEPTION 'STRIPE_CHARGE_CONFLICT for transaction %',
        p_transaction_id
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.transactions
       SET stripe_charge_id = p_stripe_object_id
     WHERE id = p_transaction_id
       AND stripe_charge_id IS NULL;
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_STRIPE_OBJECT_TYPE: %', p_stripe_object_type
      USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.capture_wallet_projection_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pending_delta bigint;
  v_available_delta bigint;
  v_total_delta bigint;
  v_journal_id uuid;
  v_reference_id uuid := gen_random_uuid();
  v_pending_account_id uuid;
  v_available_account_id uuid;
  v_platform_account_id uuid;
BEGIN
  IF current_setting(
    'pokemarket.rebuilding_wallet_projection',
    true
  ) = 'on' THEN
    RETURN NEW;
  END IF;

  v_pending_delta :=
    round((NEW.pending_balance - OLD.pending_balance) * 100)::bigint;
  v_available_delta :=
    round((NEW.available_balance - OLD.available_balance) * 100)::bigint;
  v_total_delta := v_pending_delta + v_available_delta;

  IF v_pending_delta = 0 AND v_available_delta = 0 THEN
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
    NULL,
    'wallet_adjustment',
    'wallet-adjustment:' || v_reference_id::text,
    'wallet-adjustment:' || v_reference_id::text,
    jsonb_build_object(
      'user_id', NEW.user_id,
      'pending_delta_minor', v_pending_delta,
      'available_delta_minor', v_available_delta,
      'source', 'legacy_wallet_update'
    )
  )
  RETURNING id INTO v_journal_id;

  IF v_pending_delta <> 0 THEN
    v_pending_account_id := private.get_or_create_ledger_account(
      'seller_pending', NEW.user_id, NULL, COALESCE(NEW.currency, 'EUR')
    );
    INSERT INTO public.ledger_entries (
      ledger_transaction_id,
      account_id,
      amount_minor
    )
    VALUES (v_journal_id, v_pending_account_id, v_pending_delta);
  END IF;

  IF v_available_delta <> 0 THEN
    v_available_account_id := private.get_or_create_ledger_account(
      'seller_available', NEW.user_id, NULL, COALESCE(NEW.currency, 'EUR')
    );
    INSERT INTO public.ledger_entries (
      ledger_transaction_id,
      account_id,
      amount_minor
    )
    VALUES (v_journal_id, v_available_account_id, v_available_delta);
  END IF;

  IF v_total_delta <> 0 THEN
    v_platform_account_id := private.get_or_create_ledger_account(
      'platform_adjustment', NULL, NULL, COALESCE(NEW.currency, 'EUR')
    );
    INSERT INTO public.ledger_entries (
      ledger_transaction_id,
      account_id,
      amount_minor
    )
    VALUES (v_journal_id, v_platform_account_id, -v_total_delta);
  END IF;

  RETURN NEW;
END;
$$;

-- The repository has no production financial data, but preserve any local or
-- sandbox balance present when the migration is applied as an opening journal.
DO $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_total_minor bigint;
  v_journal_id uuid;
  v_reference_id uuid;
  v_pending_account_id uuid;
  v_available_account_id uuid;
  v_platform_account_id uuid;
BEGIN
  FOR v_wallet IN
    SELECT *
      FROM public.wallets
     WHERE pending_balance <> 0 OR available_balance <> 0
     FOR UPDATE
  LOOP
    v_reference_id := gen_random_uuid();
    v_total_minor := round(
      (v_wallet.pending_balance + v_wallet.available_balance) * 100
    )::bigint;

    INSERT INTO public.ledger_transactions (
      transaction_id,
      journal_type,
      idempotency_key,
      business_reference,
      metadata
    )
    VALUES (
      NULL,
      'opening_balance',
      'opening-balance:' || v_wallet.user_id::text,
      'opening-balance:' || v_wallet.user_id::text,
      jsonb_build_object('user_id', v_wallet.user_id)
    )
    RETURNING id INTO v_journal_id;

    IF v_wallet.pending_balance <> 0 THEN
      v_pending_account_id := private.get_or_create_ledger_account(
        'seller_pending',
        v_wallet.user_id,
        NULL,
        COALESCE(v_wallet.currency, 'EUR')
      );
      INSERT INTO public.ledger_entries (
        ledger_transaction_id,
        account_id,
        amount_minor
      )
      VALUES (
        v_journal_id,
        v_pending_account_id,
        round(v_wallet.pending_balance * 100)::bigint
      );
    END IF;

    IF v_wallet.available_balance <> 0 THEN
      v_available_account_id := private.get_or_create_ledger_account(
        'seller_available',
        v_wallet.user_id,
        NULL,
        COALESCE(v_wallet.currency, 'EUR')
      );
      INSERT INTO public.ledger_entries (
        ledger_transaction_id,
        account_id,
        amount_minor
      )
      VALUES (
        v_journal_id,
        v_available_account_id,
        round(v_wallet.available_balance * 100)::bigint
      );
    END IF;

    v_platform_account_id := private.get_or_create_ledger_account(
      'platform_adjustment',
      NULL,
      NULL,
      COALESCE(v_wallet.currency, 'EUR')
    );
    INSERT INTO public.ledger_entries (
      ledger_transaction_id,
      account_id,
      amount_minor
    )
    VALUES (v_journal_id, v_platform_account_id, -v_total_minor);
  END LOOP;
END;
$$;

CREATE TRIGGER wallets_capture_ledger_adjustment
  AFTER UPDATE OF pending_balance, available_balance ON public.wallets
  FOR EACH ROW
  WHEN (
    OLD.pending_balance IS DISTINCT FROM NEW.pending_balance
    OR OLD.available_balance IS DISTINCT FROM NEW.available_balance
  )
  EXECUTE FUNCTION private.capture_wallet_projection_change();

CREATE OR REPLACE FUNCTION private.finalize_paid_transaction(
  p_transaction_id uuid,
  p_stripe_payment_intent_id text DEFAULT NULL,
  p_stripe_charge_id text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_existing_ledger_id uuid;
BEGIN
  SELECT *
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'NOT_FOUND';
  END IF;

  SELECT id
    INTO v_existing_ledger_id
    FROM public.ledger_transactions
   WHERE idempotency_key = 'payment:' || p_transaction_id::text;

  IF v_tx.status <> 'PENDING_PAYMENT' THEN
    IF v_existing_ledger_id IS NOT NULL THEN
      PERFORM private.bind_stripe_object(
        p_transaction_id,
        v_existing_ledger_id,
        'payment_intent',
        p_stripe_payment_intent_id
      );
      PERFORM private.bind_stripe_object(
        p_transaction_id,
        v_existing_ledger_id,
        'charge',
        p_stripe_charge_id
      );

      INSERT INTO public.financial_outbox (
        event_type,
        aggregate_id,
        idempotency_key,
        payload
      )
      VALUES (
        'payment_finalized',
        p_transaction_id,
        'payment-finalized:' || p_transaction_id::text,
        jsonb_build_object('transaction_id', p_transaction_id)
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    RETURN 'ALREADY_PROCESSED';
  END IF;

  v_existing_ledger_id := private.record_payment_ledger(
    v_tx,
    p_stripe_payment_intent_id,
    p_stripe_charge_id
  );

  PERFORM private.bind_stripe_object(
    p_transaction_id,
    v_existing_ledger_id,
    'payment_intent',
    p_stripe_payment_intent_id
  );
  PERFORM private.bind_stripe_object(
    p_transaction_id,
    v_existing_ledger_id,
    'charge',
    p_stripe_charge_id
  );

  UPDATE public.transactions
     SET status = 'PAID'
   WHERE id = p_transaction_id;

  UPDATE public.listings
     SET status = 'SOLD'
   WHERE id = v_tx.listing_id;

  UPDATE public.offers
     SET status = 'EXPIRED'
   WHERE listing_id = v_tx.listing_id
     AND status = 'PENDING';

  PERFORM private.rebuild_wallet_projection(v_tx.seller_id);

  INSERT INTO public.financial_outbox (
    event_type,
    aggregate_id,
    idempotency_key,
    payload
  )
  VALUES (
    'payment_finalized',
    p_transaction_id,
    'payment-finalized:' || p_transaction_id::text,
    jsonb_build_object(
      'transaction_id', p_transaction_id,
      'seller_id', v_tx.seller_id,
      'buyer_id', v_tx.buyer_id
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN 'PAID';
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_paid_transaction(
  p_transaction_id uuid,
  p_stripe_payment_intent_id text DEFAULT NULL,
  p_stripe_charge_id text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT private.finalize_paid_transaction(
    p_transaction_id,
    p_stripe_payment_intent_id,
    p_stripe_charge_id
  );
$$;

REVOKE ALL ON FUNCTION public.finalize_paid_transaction(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_paid_transaction(uuid, text, text)
  TO service_role;

GRANT EXECUTE ON FUNCTION private.finalize_paid_transaction(uuid, text, text)
  TO service_role;

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
  v_release_ledger_id uuid;
  v_pending_account_id uuid;
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

  IF v_pending_balance_minor < v_seller_minor THEN
    RAISE EXCEPTION
      'ESCROW_BALANCE_MISMATCH: seller % transaction % has % pending, requires %',
      v_tx.seller_id, v_tx.id, v_pending_balance_minor, v_seller_minor
      USING ERRCODE = 'P0001';
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
    jsonb_build_object('seller_minor', v_seller_minor)
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
    (v_release_ledger_id, v_pending_account_id, -v_seller_minor),
    (v_release_ledger_id, v_available_account_id, v_seller_minor);

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
      'amount_minor', v_seller_minor,
      'currency', 'EUR'
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_escrow_funds(
  p_transaction_id uuid,
  p_buyer_id uuid
)
RETURNS boolean
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT private.release_escrow_funds(p_transaction_id, p_buyer_id);
$$;

REVOKE ALL ON FUNCTION public.release_escrow_funds(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.release_escrow_funds(uuid, uuid)
  TO authenticated, service_role;

GRANT USAGE ON SCHEMA private TO authenticated;

GRANT EXECUTE ON FUNCTION private.release_escrow_funds(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_notifications_outbox(
  p_limit integer DEFAULT 50,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.notifications_outbox
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT id
      FROM public.notifications_outbox
     WHERE next_attempt_at <= now()
       AND (
         status = 'PENDING'
         OR (
           status = 'PROCESSING'
           AND lease_expires_at < now()
         )
       )
     ORDER BY next_attempt_at, created_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE public.notifications_outbox o
     SET status = 'PROCESSING',
         lease_token = gen_random_uuid(),
         lease_expires_at = now()
           + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 10), 900))
    FROM claimable
   WHERE o.id = claimable.id
  RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_notifications_outbox(
  p_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE sql
SET search_path = ''
AS $$
  WITH updated AS (
    UPDATE public.notifications_outbox
       SET status = 'SENT',
           sent_at = now(),
           lease_expires_at = NULL,
           lease_token = NULL,
           last_error = NULL
     WHERE id = p_id
       AND status = 'PROCESSING'
       AND lease_token = p_lease_token
    RETURNING 1
  )
  SELECT EXISTS(SELECT 1 FROM updated);
$$;

CREATE OR REPLACE FUNCTION public.fail_notifications_outbox(
  p_id uuid,
  p_lease_token uuid,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_updated boolean;
BEGIN
  UPDATE public.notifications_outbox
     SET attempts = attempts + 1,
         status = CASE
           WHEN attempts + 1 >= max_attempts THEN 'FAILED'
           ELSE 'PENDING'
         END,
         next_attempt_at = CASE
           WHEN attempts + 1 >= max_attempts THEN next_attempt_at
           ELSE now() + make_interval(
             secs => LEAST(3600, (2 ^ LEAST(attempts + 1, 10))::integer * 60)
           )
         END,
         lease_expires_at = NULL,
         lease_token = NULL,
         last_error = left(p_error, 1000)
   WHERE id = p_id
     AND status = 'PROCESSING'
     AND lease_token = p_lease_token
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notifications_outbox(integer, integer)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.complete_notifications_outbox(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fail_notifications_outbox(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_notifications_outbox(integer, integer)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.complete_notifications_outbox(uuid, uuid)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.fail_notifications_outbox(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_financial_outbox(
  p_event_types text[],
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.financial_outbox
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT id
      FROM public.financial_outbox
     WHERE event_type = ANY(p_event_types)
       AND attempts < max_attempts
       AND next_attempt_at <= now()
       AND (
         status = 'PENDING'
         OR (
           status = 'PROCESSING'
           AND lease_expires_at < now()
         )
       )
     ORDER BY next_attempt_at, created_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE public.financial_outbox o
     SET status = 'PROCESSING',
         attempts = attempts + 1,
         lease_token = gen_random_uuid(),
         lease_expires_at = now()
           + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 10), 900)),
         last_error = NULL
    FROM claimable
   WHERE o.id = claimable.id
  RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_financial_outbox(
  p_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE sql
SET search_path = ''
AS $$
  WITH updated AS (
    UPDATE public.financial_outbox
       SET status = 'COMPLETED',
           completed_at = now(),
           lease_expires_at = NULL,
           lease_token = NULL,
           last_error = NULL
     WHERE id = p_id
       AND status = 'PROCESSING'
       AND lease_token = p_lease_token
    RETURNING 1
  )
  SELECT EXISTS(SELECT 1 FROM updated);
$$;

CREATE OR REPLACE FUNCTION public.fail_financial_outbox(
  p_id uuid,
  p_lease_token uuid,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_updated boolean;
BEGIN
  UPDATE public.financial_outbox
     SET status = CASE
           WHEN attempts >= max_attempts THEN 'FAILED'
           ELSE 'PENDING'
         END,
         next_attempt_at = CASE
           WHEN attempts >= max_attempts THEN next_attempt_at
           ELSE now() + make_interval(
             secs => LEAST(3600, (2 ^ LEAST(attempts, 10))::integer * 15)
           )
         END,
         lease_expires_at = NULL,
         lease_token = NULL,
         last_error = left(p_error, 2000)
   WHERE id = p_id
     AND status = 'PROCESSING'
     AND lease_token = p_lease_token
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_financial_outbox(text[], integer, integer)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.complete_financial_outbox(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fail_financial_outbox(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_financial_outbox(text[], integer, integer)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.complete_financial_outbox(uuid, uuid)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.fail_financial_outbox(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.rebuild_wallet_projections(
  p_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_user_id IN
    SELECT DISTINCT owner_user_id
      FROM public.ledger_accounts
     WHERE owner_user_id IS NOT NULL
       AND (p_user_id IS NULL OR owner_user_id = p_user_id)
  LOOP
    PERFORM private.rebuild_wallet_projection(v_user_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_wallet_projections(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rebuild_wallet_projections(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION private.guard_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'FORBIDDEN: profile role is backend-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_role_immutable_for_users ON public.profiles;

CREATE TRIGGER profiles_role_immutable_for_users
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION private.guard_profile_role_change();

-- Functions receive EXECUTE for PUBLIC by default in Postgres. Remove that
-- implicit privilege from the private schema after all functions exist, then
-- grant only the backend and the buyer-safe escrow entry point.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;

GRANT EXECUTE ON FUNCTION private.release_escrow_funds(uuid, uuid)
  TO authenticated;
