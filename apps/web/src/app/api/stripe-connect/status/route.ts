import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { StripeConnectStatusResponse } from "@deckdealr/shared";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";
import { deriveRecipientKycStatus } from "@/lib/stripe/connect-readiness";
import {
  getStripePayoutCapability,
  getStripeRecipientCapability,
  retrieveStripeRecipientAccount,
} from "@/lib/stripe/connect-account";
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
      const response: StripeConnectStatusResponse = {
        kyc_status: "UNVERIFIED" as KycStatus,
        has_account: false,
        transfers_status: null,
        payouts_status: null,
      };
      return NextResponse.json(response);
    }

    const account = await retrieveStripeRecipientAccount(
      profile.stripe_account_id,
    );

    const kycStatus: KycStatus = deriveRecipientKycStatus(account);
    const transfersStatus =
      getStripeRecipientCapability(account)?.status ?? null;
    const payoutsStatus = getStripePayoutCapability(account)?.status ?? null;

    if (profile.kyc_status !== kycStatus) {
      await admin
        .from("profiles")
        .update({ kyc_status: kycStatus })
        .eq("id", user.id);
    }

    const response: StripeConnectStatusResponse = {
      kyc_status: kycStatus,
      has_account: true,
      transfers_status: transfersStatus,
      payouts_status: payoutsStatus,
    };
    return NextResponse.json(response);
  } catch (err) {
    Sentry.captureException(err);
    console.error("Stripe Connect status error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
