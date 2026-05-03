import type Stripe from "stripe";
import type { KycStatus } from "@/lib/constants";

/**
 * Compute PokeMarket's local KYC status from a Stripe Connect account.
 *
 * The mapping is intentionally simple — the wallet UI only branches on
 * VERIFIED vs everything-else, but persisting the finer-grained values
 * lets us send a more accurate "Action requise" message later.
 *
 * Order matters:
 *   1. VERIFIED — both capabilities are live; the seller can be paid out.
 *   2. REJECTED — Stripe has explicitly disabled the account.
 *   3. REQUIRED — Stripe has open requirements blocking activation.
 *   4. PENDING  — onboarding link issued but no requirements outstanding
 *      (typically: Stripe is reviewing freshly submitted documents).
 *
 * Used by both:
 *   • /api/stripe-connect/status (manual sync on wallet open)
 *   • account.updated webhook handler (push sync)
 */
export function deriveKycStatus(account: Stripe.Account): KycStatus {
  if (account.charges_enabled && account.payouts_enabled) {
    return "VERIFIED";
  }
  if (account.requirements?.disabled_reason) {
    return "REJECTED";
  }
  if (
    account.requirements?.currently_due &&
    account.requirements.currently_due.length > 0
  ) {
    return "REQUIRED";
  }
  return "PENDING";
}
