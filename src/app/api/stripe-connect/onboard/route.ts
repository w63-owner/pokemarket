import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { onboardRateLimit, applyRateLimit } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/env";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const rateLimitResponse = await applyRateLimit(onboardRateLimit, user.id);
    if (rateLimitResponse) return rateLimitResponse;

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

    const stripe = getStripe();
    let stripeAccountId = profile.stripe_account_id;

    if (!stripeAccountId) {
      // Controller properties replace the deprecated type:"express" enum.
      // "stripe" requirement_collection = Stripe hosts the onboarding UI.
      // "application" fees payer = platform is responsible for Stripe fees.
      //
      // Country defaults to "FR" but can be overridden per deployment via
      // STRIPE_CONNECT_DEFAULT_COUNTRY (ISO 3166-1 alpha-2). For a multi-
      // country marketplace, replace this with a value pulled from the user
      // profile collected during signup.
      const country =
        process.env.STRIPE_CONNECT_DEFAULT_COUNTRY?.toUpperCase() ?? "FR";
      const account = await stripe.accounts.create({
        controller: {
          stripe_dashboard: { type: "express" },
          fees: { payer: "application" },
          losses: { payments: "application" },
          requirement_collection: "stripe",
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        country,
        email: user.email,
        metadata: { user_id: user.id },
      });

      stripeAccountId = account.id;

      const { error: updateError } = await admin
        .from("profiles")
        .update({
          stripe_account_id: stripeAccountId,
          kyc_status: "PENDING",
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Failed to save stripe_account_id:", updateError);
        return NextResponse.json(
          { error: "Impossible de sauvegarder le compte Stripe" },
          { status: 500 },
        );
      }
    }

    const appUrl = getAppUrl();

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      type: "account_onboarding",
      return_url: `${appUrl}/wallet/return`,
      refresh_url: `${appUrl}/wallet`,
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    Sentry.captureException(err);
    console.error("Stripe Connect onboard error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
