import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    const stripe = getStripe();
    let stripeAccountId = profile.stripe_account_id;

    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "FR",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      type: "account_onboarding",
      return_url: `${appUrl}/wallet/return`,
      refresh_url: `${appUrl}/wallet`,
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    console.error("Stripe Connect onboard error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
