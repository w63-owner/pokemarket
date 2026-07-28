import { getStripe } from "@/lib/stripe/server";
import { stripeIdempotencyKeys } from "@/lib/stripe/idempotency";
import { createAdminClient } from "@/lib/supabase/admin";

type PreparedRecovery = {
  id: string;
  transaction_id: string;
  seller_id: string;
  kind: "refund" | "dispute" | "dispute_restore";
  target_amount_minor: number;
  completed_amount_minor: number;
  stripe_transfer_id: string;
  stripe_account_id: string;
  source_charge_id: string;
  stripe_dispute_id: string | null;
};

export async function executeFinancialRecovery(
  recoveryId: string,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("prepare_financial_recovery", {
    p_recovery_id: recoveryId,
  });
  if (error) throw error;

  const recovery = data?.[0] as PreparedRecovery | undefined;
  if (!recovery) throw new Error(`Financial recovery ${recoveryId} not found`);

  const amount = recovery.target_amount_minor - recovery.completed_amount_minor;
  if (amount <= 0) return recovery.stripe_transfer_id;

  try {
    const stripe = getStripe("operations");
    let stripeObjectId: string;

    if (recovery.kind === "dispute_restore") {
      const transfer = await stripe.transfers.create(
        {
          amount,
          currency: "eur",
          destination: recovery.stripe_account_id,
          source_transaction: recovery.source_charge_id,
          transfer_group: `order_${recovery.transaction_id}`,
          metadata: {
            transaction_id: recovery.transaction_id,
            seller_id: recovery.seller_id,
            dispute_id: recovery.stripe_dispute_id ?? "",
            type: "dispute_restore",
          },
        },
        {
          idempotencyKey: stripeIdempotencyKeys.disputeRestore(recovery.id),
        },
      );
      stripeObjectId = transfer.id;
    } else {
      const reversal = await stripe.transfers.createReversal(
        recovery.stripe_transfer_id,
        {
          amount,
          metadata: {
            transaction_id: recovery.transaction_id,
            recovery_id: recovery.id,
            recovery_kind: recovery.kind,
          },
        },
        {
          idempotencyKey: stripeIdempotencyKeys.transferReversal(
            recovery.id,
            recovery.target_amount_minor,
          ),
        },
      );
      stripeObjectId = reversal.id;

      const { error: reversalError } = await admin.rpc(
        "apply_stripe_transfer_reversal",
        {
          p_stripe_transfer_id: recovery.stripe_transfer_id,
          p_amount_reversed_minor: recovery.target_amount_minor,
        },
      );
      if (reversalError) throw reversalError;
    }

    const { data: completed, error: completeError } = await admin.rpc(
      "complete_financial_recovery",
      {
        p_recovery_id: recovery.id,
        p_completed_amount_minor: recovery.target_amount_minor,
        p_stripe_object_id: stripeObjectId,
      },
    );
    if (completeError) throw completeError;
    if (!completed) {
      throw new Error(`Unable to complete financial recovery ${recovery.id}`);
    }

    return stripeObjectId;
  } catch (cause) {
    await admin.rpc("fail_financial_recovery", {
      p_recovery_id: recovery.id,
      p_error: cause instanceof Error ? cause.message : String(cause),
    });
    throw cause;
  }
}
