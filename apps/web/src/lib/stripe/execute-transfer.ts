import type Stripe from "stripe";

import { stripeIdempotencyKeys } from "@/lib/stripe/idempotency";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

type PreparedTransfer = {
  transaction_id: string;
  seller_id: string;
  amount_minor: number;
  currency: string;
  status:
    | "queued"
    | "processing"
    | "transferred"
    | "payout_pending"
    | "paid"
    | "failed"
    | "reversed";
  stripe_account_id: string | null;
  source_charge_id: string | null;
  transfer_group: string;
  stripe_transfer_id: string | null;
};

export async function executeSellerTransfer(
  transactionId: string,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("prepare_seller_transfer", {
    p_transaction_id: transactionId,
  });

  if (error) throw error;

  const prepared = data?.[0] as PreparedTransfer | undefined;
  if (!prepared) {
    throw new Error(`No seller transfer prepared for ${transactionId}`);
  }

  if (
    ["transferred", "payout_pending", "paid", "reversed"].includes(
      prepared.status,
    )
  ) {
    if (!prepared.stripe_transfer_id) {
      throw new Error(
        `Transfer ${transactionId} is ${prepared.status} without a Stripe id`,
      );
    }
    return prepared.stripe_transfer_id;
  }

  if (!prepared.stripe_account_id || !prepared.source_charge_id) {
    throw new Error(`Transfer ${transactionId} is missing Stripe references`);
  }

  const { data: executable, error: executionError } = await admin.rpc(
    "confirm_seller_transfer_execution",
    { p_transaction_id: prepared.transaction_id },
  );
  if (executionError) throw executionError;
  if (!executable) {
    throw new Error(
      `Transfer ${transactionId} was canceled by a refund or dispute`,
    );
  }

  const stripe = getStripe("operations");

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: prepared.amount_minor,
        currency: prepared.currency.toLowerCase(),
        destination: prepared.stripe_account_id,
        source_transaction: prepared.source_charge_id,
        transfer_group: prepared.transfer_group,
        metadata: {
          transaction_id: prepared.transaction_id,
          seller_id: prepared.seller_id,
          type: "order_release",
        },
      },
      {
        idempotencyKey: stripeIdempotencyKeys.transfer(prepared.transaction_id),
      },
    );

    await persistTransferSuccess(prepared, transfer);
    return transfer.id;
  } catch (cause) {
    const stripeError = asStripeError(cause);
    await admin.rpc("record_seller_transfer_failure", {
      p_transaction_id: prepared.transaction_id,
      p_failure_code: stripeError.code,
      p_failure_message: stripeError.message,
    });
    throw cause;
  }
}

async function persistTransferSuccess(
  prepared: PreparedTransfer,
  transfer: Stripe.Transfer,
): Promise<void> {
  const admin = createAdminClient();
  const sourceCharge =
    typeof transfer.source_transaction === "string"
      ? transfer.source_transaction
      : (transfer.source_transaction?.id ?? prepared.source_charge_id!);

  const { data, error } = await admin.rpc("record_seller_transfer_success", {
    p_transaction_id: prepared.transaction_id,
    p_stripe_transfer_id: transfer.id,
    p_source_charge_id: sourceCharge,
    p_transfer_group: transfer.transfer_group ?? prepared.transfer_group,
  });

  if (error) throw error;
  if (!data) {
    throw new Error(`Unable to persist transfer ${transfer.id}`);
  }
}

function asStripeError(cause: unknown): { code: string; message: string } {
  if (typeof cause === "object" && cause !== null) {
    const value = cause as {
      code?: unknown;
      message?: unknown;
      type?: unknown;
    };
    return {
      code:
        typeof value.code === "string"
          ? value.code
          : typeof value.type === "string"
            ? value.type
            : "stripe_transfer_error",
      message:
        typeof value.message === "string"
          ? value.message
          : "Stripe transfer failed",
    };
  }

  return { code: "stripe_transfer_error", message: String(cause) };
}
