import { NextResponse } from "next/server";
import type { StripeConnectAccountSessionResponse } from "@pokemarket/shared";

import { getRequestUser } from "@/lib/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";

export async function POST(request: Request) {
  const { user } = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  }
  if (!profile.stripe_account_id) {
    return NextResponse.json(
      { error: "Créez d’abord votre compte Stripe Connect" },
      { status: 409 },
    );
  }

  const session = await getStripe().accountSessions.create({
    account: profile.stripe_account_id,
    components: {
      account_onboarding: { enabled: true },
      notification_banner: { enabled: true },
      account_management: { enabled: true },
      payouts: { enabled: true },
    },
  });

  const response: StripeConnectAccountSessionResponse = {
    client_secret: session.client_secret,
  };
  return NextResponse.json(response);
}
