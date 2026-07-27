import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";

export async function handleTransferCreated(
  transfer: Stripe.Transfer,
): Promise<void> {
  const transactionId = transfer.metadata?.transaction_id;
  const sourceCharge =
    typeof transfer.source_transaction === "string"
      ? transfer.source_transaction
      : transfer.source_transaction?.id;

  if (!transactionId || !sourceCharge || !transfer.transfer_group) {
    Sentry.captureMessage(
      `Untraceable transfer.created event (transfer=${transfer.id})`,
      { level: "error" },
    );
    return;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_seller_transfer_success", {
    p_transaction_id: transactionId,
    p_stripe_transfer_id: transfer.id,
    p_source_charge_id: sourceCharge,
    p_transfer_group: transfer.transfer_group,
  });

  if (error) throw error;
  if (!data) {
    throw new Error(`Unable to persist transfer.created ${transfer.id}`);
  }
}

export async function handleTransferReversed(
  transfer: Stripe.Transfer,
): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("apply_stripe_transfer_reversal", {
    p_amount_reversed_minor: transfer.amount_reversed,
    p_stripe_transfer_id: transfer.id,
  });

  if (error) throw error;
  if (!data) {
    Sentry.captureMessage(
      `Unmatched transfer.reversed event (transfer=${transfer.id})`,
      { level: "error" },
    );
  }
}
