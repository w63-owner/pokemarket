import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/send";
import { deriveRecipientKycStatus } from "@/lib/stripe/connect-readiness";

/**
 * Accounts v2 requirement/capability events call this handler after fetching
 * the related Account with its recipient configuration included.
 *
 * What we do:
 *   1. Derive readiness from the recipient transfer capability and
 *      requirements (same logic as src/app/api/stripe-connect/status).
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
  account: Stripe.V2.Core.Account,
): Promise<void> {
  const admin = createAdminClient();

  const kycStatus = deriveRecipientKycStatus(account);

  const { data: linkedProfile, error: profileError } = await admin
    .from("profiles")
    .select("id, kyc_status")
    .eq("stripe_account_id", account.id)
    .maybeSingle();

  if (profileError) {
    Sentry.captureException(profileError, {
      extra: {
        context: "account_v2_updated_profile_lookup",
        account_id: account.id,
      },
    });
    return;
  }

  let profile = linkedProfile;
  if (!profile && account.metadata?.user_id) {
    // Recover the narrow failure window where Stripe created the account but
    // the following profile UPDATE failed. The deterministic idempotency key
    // covers immediate retries; the signed account.created event repairs the
    // durable link even after Stripe's idempotency window has elapsed.
    const { data: recoveredProfile, error: recoveryError } = await admin
      .from("profiles")
      .select("id, kyc_status, stripe_account_id")
      .eq("id", account.metadata.user_id)
      .maybeSingle();

    if (recoveryError) throw recoveryError;
    if (recoveredProfile && !recoveredProfile.stripe_account_id) {
      const { error: linkError } = await admin
        .from("profiles")
        .update({
          stripe_account_id: account.id,
          kyc_status: kycStatus,
        })
        .eq("id", recoveredProfile.id)
        .is("stripe_account_id", null);
      if (linkError) throw linkError;
      profile = { id: recoveredProfile.id, kyc_status: kycStatus };
    }
  }

  if (!profile) {
    Sentry.captureMessage(
      `Accounts v2 event received for unknown stripe_account_id ${account.id}`,
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
        context: "account_v2_updated_kyc_persist",
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
  if (kycStatus === "VERIFIED" && profile.kyc_status !== "VERIFIED") {
    sendPushNotification(
      profile.id,
      "Identité vérifiée 🎉",
      "Tu peux maintenant demander un virement depuis ton portefeuille.",
      "/wallet",
    ).catch((err) => Sentry.captureException(err));
  }
}
