-- Keep transfer-requested outbox replay idempotent and support legacy payloads
-- that do not contain an explicit amount.
create or replace function private.create_seller_transfer_from_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type <> 'transfer_requested' then
    return new;
  end if;

  -- Avoid building an invalid candidate row before ON CONFLICT can run.
  if exists (
    select 1
    from public.seller_transfers as st
    where st.transaction_id = new.aggregate_id
  ) then
    return new;
  end if;

  insert into public.seller_transfers (
    transaction_id,
    seller_id,
    amount_minor,
    currency,
    stripe_account_id,
    source_charge_id,
    transfer_group,
    idempotency_key
  )
  select
    t.id,
    t.seller_id,
    coalesce(
      (new.payload ->> 'amount_minor')::bigint,
      round((t.total_amount - t.fee_amount) * 100)::bigint
    ),
    upper(coalesce(new.payload ->> 'currency', 'EUR')),
    p.stripe_account_id,
    t.stripe_charge_id,
    'order_' || t.id::text,
    'transfer:' || t.id::text
  from public.transactions as t
  join public.profiles as p on p.id = t.seller_id
  where t.id = new.aggregate_id
  on conflict (transaction_id) do nothing;

  return new;
end;
$$;
