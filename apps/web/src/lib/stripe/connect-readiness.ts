import type Stripe from "stripe";

type RecipientCapabilityAccount = Pick<
  Stripe.Account,
  "capabilities" | "requirements"
> & {
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: {
            status?: string | null;
          } | null;
        } | null;
      } | null;
    } | null;
  } | null;
};

/**
 * Recipient accounts only need the transfer capability. During the Accounts
 * v1 → v2 transition, accept either capability path without treating
 * `charges_enabled` or `payouts_enabled` as marketplace readiness signals.
 */
export function isStripeRecipientReady(
  account: RecipientCapabilityAccount,
): boolean {
  const v2Status =
    account.configuration?.recipient?.capabilities?.stripe_balance
      ?.stripe_transfers?.status;

  if (v2Status !== undefined && v2Status !== null) {
    return v2Status === "active";
  }

  return account.capabilities?.transfers === "active";
}

export function deriveRecipientKycStatus(
  account: RecipientCapabilityAccount,
): "VERIFIED" | "REQUIRED" | "REJECTED" | "PENDING" {
  if (isStripeRecipientReady(account)) return "VERIFIED";
  if ((account.requirements?.currently_due?.length ?? 0) > 0) return "REQUIRED";
  if (account.requirements?.disabled_reason) return "REJECTED";
  return "PENDING";
}
