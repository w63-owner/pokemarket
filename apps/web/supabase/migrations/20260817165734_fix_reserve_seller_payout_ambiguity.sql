-- Output names from RETURNS TABLE are PL/pgSQL variables. Prefer table columns
-- when they share names with seller_transfers fields.
create or replace function public.reserve_seller_payout_original(
  p_seller_id uuid
)
returns table (
  payout_id uuid,
  amount_minor bigint,
  currency text,
  risk_reserve_minor bigint,
  payout_delay_days integer
)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_config public.financial_payout_config%rowtype;
  v_stripe_account_id text;
  v_total_available bigint;
  v_proportional_reserve bigint;
  v_effective_reserve bigint;
  v_payout_amount bigint;
  v_remaining bigint;
  v_allocate bigint;
  v_payout_id uuid := gen_random_uuid();
  v_transfer public.seller_transfers%rowtype;
  v_journal_id uuid;
  v_connected_account_id uuid;
  v_pending_account_id uuid;
begin
  select *
  into strict v_config
  from public.financial_payout_config
  where singleton;

  perform pg_advisory_xact_lock(hashtextextended(p_seller_id::text, 0));

  select stripe_account_id
  into v_stripe_account_id
  from public.profiles
  where id = p_seller_id;

  if v_stripe_account_id is null then
    raise exception 'PAYOUT_ACCOUNT_MISSING: seller %', p_seller_id
      using errcode = 'P0001';
  end if;

  select coalesce(sum(
    amount_minor - amount_reversed_minor - payout_reserved_minor - paid_minor
  ), 0)
  into v_total_available
  from public.seller_transfers
  where seller_id = p_seller_id
    and status in ('transferred', 'paid')
    and transferred_at <= now() - make_interval(days => v_config.payout_delay_days);

  v_proportional_reserve :=
    round(v_total_available::numeric * v_config.dispute_reserve_bps / 10000)::bigint;
  v_effective_reserve := v_config.risk_reserve_minor + v_proportional_reserve;
  v_payout_amount := greatest(v_total_available - v_effective_reserve, 0);

  if v_payout_amount < v_config.minimum_payout_minor then
    raise exception
      'PAYOUT_BELOW_MINIMUM: available=% flat_reserve=% proportional_reserve=% effective_reserve=% minimum=%',
      v_total_available,
      v_config.risk_reserve_minor,
      v_proportional_reserve,
      v_effective_reserve,
      v_config.minimum_payout_minor
      using errcode = 'P0001';
  end if;

  insert into public.payouts (
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
  values (
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

  for v_transfer in
    select *
    from public.seller_transfers
    where seller_id = p_seller_id
      and status in ('transferred', 'paid')
      and transferred_at <= now() - make_interval(days => v_config.payout_delay_days)
      and amount_minor - amount_reversed_minor
          - payout_reserved_minor - paid_minor > 0
    order by transferred_at, created_at, id
    for update
  loop
    exit when v_remaining = 0;

    v_allocate := least(
      v_remaining,
      v_transfer.amount_minor - v_transfer.amount_reversed_minor
        - v_transfer.payout_reserved_minor - v_transfer.paid_minor
    );

    insert into public.payout_items (
      payout_id,
      seller_transfer_id,
      transaction_id,
      amount_minor
    )
    values (
      v_payout_id,
      v_transfer.id,
      v_transfer.transaction_id,
      v_allocate
    );

    update public.seller_transfers
    set status = 'payout_pending',
        payout_reserved_minor = payout_reserved_minor + v_allocate
    where id = v_transfer.id;

    insert into public.ledger_transactions (
      transaction_id,
      journal_type,
      idempotency_key,
      business_reference,
      metadata
    )
    values (
      v_transfer.transaction_id,
      'payout_reserved',
      'payout-reserve:' || v_payout_id::text || ':' || v_transfer.transaction_id::text,
      'seller-payout-reserve:' || v_payout_id::text || ':' || v_transfer.transaction_id::text,
      jsonb_build_object(
        'payout_id', v_payout_id,
        'amount_minor', v_allocate
      )
    )
    returning id into v_journal_id;

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

    insert into public.ledger_entries (
      ledger_transaction_id,
      account_id,
      amount_minor
    )
    values
      (v_journal_id, v_connected_account_id, -v_allocate),
      (v_journal_id, v_pending_account_id, v_allocate);

    v_remaining := v_remaining - v_allocate;
  end loop;

  if v_remaining <> 0 then
    raise exception 'PAYOUT_ALLOCATION_MISMATCH: remaining=%', v_remaining
      using errcode = 'P0001';
  end if;

  perform private.rebuild_wallet_projection(p_seller_id);

  return query
  select
    v_payout_id,
    v_payout_amount,
    'EUR'::text,
    v_effective_reserve,
    v_config.payout_delay_days;
end;
$$;

comment on function public.reserve_seller_payout_original(uuid) is
  'Core payout reservation. Effective reserve = risk_reserve_minor (flat) '
  '+ round(total_available * dispute_reserve_bps / 10_000) (proportional). '
  'The effective reserve is persisted on payouts.risk_reserve_minor.';
