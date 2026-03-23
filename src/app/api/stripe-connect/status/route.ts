import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import type { KycStatus } from "@/lib/constants";

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

    if (!profile.stripe_account_id) {
      return NextResponse.json({
        kyc_status: "UNVERIFIED" as KycStatus,
        charges_enabled: false,
        payouts_enabled: false,
      });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(profile.stripe_account_id);

    let kycStatus: KycStatus = "PENDING";

    if (account.charges_enabled && account.payouts_enabled) {
      kycStatus = "VERIFIED";
    } else if (
      account.requirements?.currently_due &&
      account.requirements.currently_due.length > 0
    ) {
      kycStatus = "REQUIRED";
    } else if (account.requirements?.disabled_reason) {
      kycStatus = "REJECTED";
    }

    if (profile.kyc_status !== kycStatus) {
      await admin
        .from("profiles")
        .update({ kyc_status: kycStatus })
        .eq("id", user.id);
    }

    return NextResponse.json({
      kyc_status: kycStatus,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    });
  } catch (err) {
    console.error("Stripe Connect status error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
