import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";
import { getStripe } from "@/lib/stripe/server";
import {
  deriveRecipientKycStatus,
  isStripeRecipientReady,
} from "@/lib/stripe/connect-readiness";
import type { KycStatus } from "@/lib/constants";

export async function GET(request: Request) {
  try {
    const { user } = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("stripe_account_id, kyc_status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profil introuvable" },
        { status: 404 },
      );
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json({
        kyc_status: "UNVERIFIED" as KycStatus,
        charges_enabled: false,
        payouts_enabled: false,
        transfers_enabled: false,
      });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(profile.stripe_account_id);

    const kycStatus: KycStatus = deriveRecipientKycStatus(account);
    const transfersEnabled = isStripeRecipientReady(account);

    if (profile.kyc_status !== kycStatus) {
      await admin
        .from("profiles")
        .update({ kyc_status: kycStatus })
        .eq("id", user.id);
    }

    return NextResponse.json({
      kyc_status: kycStatus,
      // Retained for backwards-compatible clients during the Accounts v2
      // migration. Business readiness is `transfers_enabled`, not these flags.
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      transfers_enabled: transfersEnabled,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("Stripe Connect status error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
