import {
  getStripeRecipientCapability,
  type StripeRecipientAccount,
} from "@/lib/stripe/connect-account";

/**
 * Recipient accounts only need the Accounts v2 transfer capability.
 * Legacy `charges_enabled`, `payouts_enabled`, and v1 `transfers` fields are
 * deliberately not accepted as business readiness signals.
 */
export function isStripeRecipientReady(
  account: StripeRecipientAccount,
): boolean {
  return getStripeRecipientCapability(account)?.status === "active";
}

export function deriveRecipientKycStatus(
  account: StripeRecipientAccount,
): "VERIFIED" | "REQUIRED" | "REJECTED" | "PENDING" {
  const capability = getStripeRecipientCapability(account);
  if (capability?.status === "active") return "VERIFIED";
  if (capability?.status === "unsupported") return "REJECTED";

  const statusCodes = new Set(
    capability?.status_details.map((detail) => detail.code) ?? [],
  );

  if (statusCodes.has("requirements_past_due")) return "REQUIRED";
  if (
    statusCodes.has("unsupported_business") ||
    statusCodes.has("unsupported_country") ||
    statusCodes.has("unsupported_entity_type") ||
    statusCodes.has("restricted_other")
  ) {
    return "REJECTED";
  }
  if ((account.requirements?.entries?.length ?? 0) > 0) return "REQUIRED";
  return "PENDING";
}
