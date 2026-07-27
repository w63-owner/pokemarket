import { NextResponse } from "next/server";

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
      { error: "Aucun compte Stripe Connect associé" },
      { status: 409 },
    );
  }

  const loginLink = await getStripe().accounts.createLoginLink(
    profile.stripe_account_id,
  );
  return NextResponse.json({ url: loginLink.url });
}
