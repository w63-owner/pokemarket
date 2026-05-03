import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { onboardRateLimit, applyRateLimit } from "@/lib/rate-limit";

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    if (!stripeAccountId) {
      // Controller properties replace the deprecated type:"express" enum.
      // "stripe" requirement_collection = Stripe hosts the onboarding UI.
      // "application" fees payer = platform is responsible for Stripe fees.
      //
      // business_type: "individual" is hardcoded because ~95% of PokeMarket
      // sellers are individuals (collection clearing). Skipping this would
      // make Stripe ask the seller "Type d'entreprise" (Entrepreneur
      // individuel / Micro-entrepreneur) which is anxiety-inducing for
      // casual sellers. Professional sellers (siret) will be handled by a
      // dedicated `seller_type` profile flag in a future ticket.
      //
      // capabilities only requests `transfers` because we use the
      // "separate charges and transfers" pattern: payments are made on the
      // platform account, then transferred to sellers at payout time.
      // Requesting `card_payments` would force extra KYC requirements that
      // we don't actually need (sellers never directly accept cards).
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
        country: "FR",
        email: user.email,
        business_type: "individual",
        business_profile: {
          mcc: "5945",
          product_description: "Vente de cartes Pokémon entre collectionneurs",
          url: `${appUrl}/seller/${user.id}`,
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
