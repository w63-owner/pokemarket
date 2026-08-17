-- RETURNS TABLE exposes transaction_id as a PL/pgSQL output variable. Prefer
-- table columns in SQL statements where the names overlap.
create or replace function public.apply_stripe_refund(
  p_stripe_charge_id text,
  p_cumulative_refund_minor bigint,
  p_stripe_refund_id text default null
)
returns table (
  transaction_id uuid,
  seller_delta_minor bigint,
  applied_minor bigint,
  recovery_queued boolean,
  debt_minor bigint
)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tx public.transactions%rowtype;
  v_transfer public.seller_transfers%rowtype;
  v_target bigint;
  v_delta bigint;
  v_applied bigint := 0;
  v_debt bigint := 0;
  v_recovery boolean := false;
  v_key text;
  v_dispute_id uuid;
  v_dispute_available_minor bigint := 0;
  v_dispute_consumed_minor bigint := 0;
begin
  select *
  into v_tx
  from public.transactions
  where stripe_charge_id = p_stripe_charge_id
  for update;

  if not found then
    return;
  end if;

  if p_cumulative_refund_minor < v_tx.refunded_amount_minor then
    return query select v_tx.id, 0::bigint, 0::bigint, false, 0::bigint;
    return;
  end if;

  v_target := private.seller_liability_for_gross_refund(
    v_tx, p_cumulative_refund_minor
  );

  select
    id,
    greatest(locked_minor - consumed_minor, 0),
    consumed_minor
  into v_dispute_id, v_dispute_available_minor, v_dispute_consumed_minor
  from public.stripe_disputes
  where transaction_id = v_tx.id
    and status in (
      'warning_needs_response',
      'warning_under_review',
      'needs_response',
      'under_review',
      'charge_refunded',
      'lost'
    )
  order by created_at desc
  limit 1
  for update;

  v_delta := greatest(
    v_target
      - v_tx.seller_refunded_minor
      - coalesce(v_dispute_consumed_minor, 0),
    0
  );
  if v_delta <= 0 then
    update public.transactions
    set refunded_amount_minor = greatest(
          refunded_amount_minor,
          p_cumulative_refund_minor
        ),
        seller_refund_target_minor = greatest(
          seller_refund_target_minor,
          v_target
        ),
        refunded_amount = greatest(
          coalesce(refunded_amount, 0),
          p_cumulative_refund_minor::numeric / 100
        )
    where id = v_tx.id;
    return query select v_tx.id, 0::bigint, 0::bigint, false, 0::bigint;
    return;
  end if;

  v_key := 'refund:' || v_tx.id::text || ':' || v_target::text;

  select *
  into v_transfer
  from public.seller_transfers
  where transaction_id = v_tx.id
  for update;

  if not found or v_transfer.stripe_transfer_id is null then
    v_applied := private.move_seller_funds(
      v_tx,
      v_delta,
      'platform_cash',
      'refund_applied',
      v_key,
      p_stripe_refund_id,
      null
    );
    if v_applied < v_delta then
      v_debt := private.record_seller_debt(
        v_tx,
        v_delta - v_applied,
        v_key || ':debt',
        'seller_debt_incurred',
        p_stripe_refund_id,
        null
      );
    end if;
  elsif v_transfer.paid_minor > 0 or v_transfer.status = 'paid' then
    v_debt := private.record_seller_debt(
      v_tx,
      v_delta,
      v_key || ':debt',
      'seller_debt_incurred',
      p_stripe_refund_id,
      null
    );
    v_applied := v_debt;
  else
    perform private.insert_recovery_job(
      v_tx,
      'refund',
      v_tx.seller_refunded_minor + v_delta,
      null
    );
    v_recovery := true;
  end if;

  if v_dispute_id is not null and v_applied > 0
     and v_dispute_available_minor > 0 then
    update public.stripe_disputes
    set consumed_minor = consumed_minor
          + least(v_applied, v_dispute_available_minor),
        last_synced_at = now()
    where id = v_dispute_id;
  end if;

  update public.transactions
  set refunded_amount_minor = p_cumulative_refund_minor,
      refunded_amount = p_cumulative_refund_minor::numeric / 100,
      seller_refund_target_minor = v_target,
      seller_refunded_minor = least(
        v_target,
        seller_refunded_minor + v_applied
      ),
      refunded_at = case
        when p_cumulative_refund_minor >= round(total_amount * 100)::bigint
          then coalesce(refunded_at, now())
        else refunded_at
      end,
      status = case
        when p_cumulative_refund_minor >= round(total_amount * 100)::bigint
          then 'REFUNDED'
        else status
      end
  where id = v_tx.id;

  return query select v_tx.id, v_delta, v_applied, v_recovery, v_debt;
end;
$$;
