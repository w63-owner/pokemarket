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
    const appUrl = getAppUrl();
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

      // We hard-code business_type: "individual" because 95 % of PokeMarket
      // sellers are private collectors (vente occasionnelle de cartes
      // personnelles). Pre-declaring this skips the "Type d'entreprise" page
      // in Stripe's hosted onboarding, which used to scare casual sellers
      // into thinking they had to register as auto-entrepreneur.
      //
      // When we add a "compte vendeur professionnel" toggle in the profile
      // settings, this will be replaced by `profile.seller_type === "pro"
      // ? "company" : "individual"`. Tracked separately.
      //
      // We also drop card_payments capability — PokeMarket uses the
      // separate-charges-and-transfers escrow pattern, so charges are
      // created on the platform account, never on the connected account.
      // Keeping only `transfers` reduces KYC requirements for sellers.
      //
      // business_profile: MCC 5945 = Hobby/Toy/Game Shops (the same code
      // used by Vinted, eBay collectibles, and other card marketplaces).
      // Without an MCC, some payments get flagged for review or refused
      // outright by issuing banks.
      const account = await stripe.accounts.create({
        controller: {
          stripe_dashboard: { type: "express" },
          fees: { payer: "application" },
          losses: { payments: "application" },
          requirement_collection: "stripe",
        },
        capabilities: {
          transfers: { requested: true },
        },
        country,
        email: user.email,
        business_type: "individual",
        business_profile: {
          mcc: "5945",
          product_description:
            "Vente de cartes Pokemon entre collectionneurs (marketplace C2C)",
          url: `${appUrl}/profile/${user.id}`,
          support_email: process.env.SUPPORT_EMAIL ?? "support@pokemarket.fr",
        },
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
