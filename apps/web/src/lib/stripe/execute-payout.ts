import type Stripe from "stripe";

import { stripeIdempotencyKeys } from "@/lib/stripe/idempotency";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

type PayoutAttempt = {
  id: string;
  user_id: string;
  amount_minor: number;
  currency: string;
  status: "pending" | "in_transit" | "paid" | "failed" | "canceled";
  stripe_account_id: string | null;
  stripe_payout_id: string | null;
};

export async function executeReservedPayout(
  payoutId: string,
): Promise<Stripe.Payout> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payouts")
    .select(
      "id, user_id, amount_minor, currency, status, stripe_account_id, stripe_payout_id",
    )
    .eq("id", payoutId)
    .single();

  if (error || !data) throw error ?? new Error(`Payout ${payoutId} not found`);

  const attempt = data as PayoutAttempt;
  if (!attempt.stripe_account_id) {
    throw new Error(`Payout ${payoutId} has no connected account`);
  }

  const stripe = getStripe("operations");

  if (attempt.stripe_payout_id) {
    const existing = await stripe.payouts.retrieve(
      attempt.stripe_payout_id,
      {},
      { stripeAccount: attempt.stripe_account_id },
    );
    await persistPayoutStatus(existing);
    return existing;
  }

  if (["paid", "failed", "canceled"].includes(attempt.status)) {
    throw new Error(`Payout ${payoutId} is already ${attempt.status}`);
  }

  try {
    await stripe.balanceSettings.update(
      {
        payments: {
          payouts: {
            schedule: { interval: "manual" },
          },
        },
      },
      {
        stripeAccount: attempt.stripe_account_id,
        idempotencyKey: `payout-schedule-manual-${attempt.id}`,
      },
    );

    const payout = await stripe.payouts.create(
      {
        amount: attempt.amount_minor,
        currency: attempt.currency.toLowerCase(),
        metadata: {
          user_id: attempt.user_id,
          payout_record_id: attempt.id,
          type: "seller_bank_payout",
        },
      },
      {
        stripeAccount: attempt.stripe_account_id,
        idempotencyKey: stripeIdempotencyKeys.payout(attempt.id),
      },
    );

    const { data: attached, error: attachError } = await admin.rpc(
      "attach_stripe_payout",
      {
        p_payout_id: attempt.id,
        p_stripe_account_id: attempt.stripe_account_id,
        p_stripe_payout_id: payout.id,
      },
    );
    if (attachError) throw attachError;
    if (!attached)
      throw new Error(`Unable to attach Stripe payout ${payout.id}`);

    await persistPayoutStatus(payout);
    return payout;
  } catch (cause) {
    if (isDefinitiveStripeFailure(cause)) {
      const failure = stripeFailure(cause);
      const { error: restoreError } = await admin.rpc("fail_reserved_payout", {
        p_payout_id: attempt.id,
        p_failure_code: failure.code,
        p_failure_message: failure.message,
      });
      if (restoreError) throw restoreError;
    }
    throw cause;
  }
}

export async function persistPayoutStatus(
  payout: Stripe.Payout,
): Promise<boolean> {
  const status = payout.status;
  if (
    status !== "pending" &&
    status !== "in_transit" &&
    status !== "paid" &&
    status !== "failed" &&
    status !== "canceled"
  ) {
    return false;
  }

  const admin = createAdminClient();
  const initialTransition = await admin.rpc("apply_stripe_payout_transition", {
    p_stripe_payout_id: payout.id,
    p_target_status: status,
    p_failure_code: payout.failure_code ?? undefined,
    p_failure_message: payout.failure_message ?? undefined,
  });
  if (initialTransition.error) throw initialTransition.error;
  let data = initialTransition.data;

  if (!data && payout.metadata?.payout_record_id) {
    const payoutRecordId = payout.metadata.payout_record_id;
    const { data: record, error: recordError } = await admin
      .from("payouts")
      .select("stripe_account_id")
      .eq("id", payoutRecordId)
      .single();
    if (recordError) throw recordError;
    if (!record?.stripe_account_id) return false;

    const { error: attachError } = await admin.rpc("attach_stripe_payout", {
      p_payout_id: payoutRecordId,
      p_stripe_account_id: record.stripe_account_id,
      p_stripe_payout_id: payout.id,
    });
    if (attachError) throw attachError;

    const transition = await admin.rpc("apply_stripe_payout_transition", {
      p_stripe_payout_id: payout.id,
      p_target_status: status,
      p_failure_code: payout.failure_code ?? undefined,
      p_failure_message: payout.failure_message ?? undefined,
    });
    if (transition.error) throw transition.error;
    data = transition.data;
  }

  return Boolean(data);
}

function isDefinitiveStripeFailure(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null || !("type" in cause)) {
    return false;
  }

  return [
    "StripeInvalidRequestError",
    "StripeAuthenticationError",
    "StripePermissionError",
  ].includes(String((cause as { type: unknown }).type));
}

function stripeFailure(cause: unknown): { code: string; message: string } {
  const value = cause as { code?: unknown; message?: unknown; type?: unknown };
  return {
    code:
      typeof value.code === "string"
        ? value.code
        : String(value.type ?? "stripe_payout_error"),
    message:
      typeof value.message === "string"
        ? value.message
        : "Stripe payout failed",
  };
}
