import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/send";

import type { KycStatus } from "@/lib/constants";

/**
 * `account.updated` — fired whenever a connected account's KYC state, payouts
 * capability, or requirements list changes.
 *
 * What we do:
 *   1. Derive the current KYC status from charges_enabled / payouts_enabled
 *      / requirements (same logic as src/app/api/stripe-connect/status).
 *   2. Persist it on profiles.kyc_status (replaces the on-demand polling
 *      previously triggered by the wallet page on every load).
 *   3. Notify the seller on the first transition to VERIFIED.
 *
 * Idempotency:
 *   The route-level `stripe_webhooks_processed` guard ensures we only run
 *   this handler once per event id. Even if it ran twice, the kyc_status
 *   compare-and-skip below makes notifications fire at most once per
 *   transition.
 */
export async function handleAccountUpdated(
  account: Stripe.Account,
): Promise<void> {
  const admin = createAdminClient();

  const kycStatus = deriveKycStatus(account);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, kyc_status")
    .eq("stripe_account_id", account.id)
    .maybeSingle();

  if (profileError) {
    Sentry.captureException(profileError, {
      extra: { context: "account.updated_profile_lookup", account_id: account.id },
    });
    return;
  }

  if (!profile) {
    // Could be a Connect account orphaned from a deleted profile, or one we
    // never created (unexpected). Log and move on — no row to update.
    Sentry.captureMessage(
      `account.updated webhook received for unknown stripe_account_id ${account.id}`,
      { level: "warning" },
    );
    return;
  }

  // Skip the UPDATE entirely if nothing changed: spares us a DB round-trip
  // and avoids re-firing notifications on event replays.
  if (profile.kyc_status === kycStatus) return;

  const { error: updateError } = await admin
    .from("profiles")
    .update({ kyc_status: kycStatus })
    .eq("id", profile.id);

  if (updateError) {
    Sentry.captureException(updateError, {
      extra: {
        context: "account.updated_kyc_persist",
        account_id: account.id,
        from: profile.kyc_status,
        to: kycStatus,
      },
    });
    return;
  }

  // Push notification on the happy path (newly verified seller can finally
  // request a payout). Best-effort — never let push failures break the
  // webhook handler.
  if (
    kycStatus === "VERIFIED" &&
    profile.kyc_status !== "VERIFIED"
  ) {
    sendPushNotification(
      profile.id,
      "Identité vérifiée 🎉",
      "Tu peux maintenant demander un virement depuis ton portefeuille.",
      "/wallet",
    ).catch((err) => Sentry.captureException(err));
  }
}

function deriveKycStatus(account: Stripe.Account): KycStatus {
  if (account.charges_enabled && account.payouts_enabled) return "VERIFIED";
  if (
    account.requirements?.currently_due &&
    account.requirements.currently_due.length > 0
  ) {
    return "REQUIRED";
  }
  if (account.requirements?.disabled_reason) return "REJECTED";
  return "PENDING";
}
