import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";
import { getStripe } from "@/lib/stripe/server";
import { getAppUrl } from "@/lib/env";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { user } = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // The mobile app authenticates via Bearer (no cookies → no SSR client),
    // so we need an admin client to read the user's stripe_customer_id.
    // RLS would normally restrict this to the row owner; we already
    // identified the user via the JWT above, so it's safe to scope by id.
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ payment_methods: [] });
    }

    const stripe = getStripe();
    // No type filter → returns all saved payment methods (cards, SEPA, etc.)
    // consistent with dynamic payment methods being enabled on the account.
    const methods = await stripe.paymentMethods.list({
      customer: profile.stripe_customer_id,
    });

    const cards = methods.data.map((pm) => ({
      id: pm.id,
      type: pm.type,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? pm.sepa_debit?.last4 ?? "????",
      exp_month: pm.card?.exp_month ?? null,
      exp_year: pm.card?.exp_year ?? null,
    }));

    return NextResponse.json({ payment_methods: cards });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des moyens de paiement." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const stripe = getStripe();
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id, username")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile?.username ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await admin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const appUrl = getAppUrl();

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      return_url: `${appUrl}/settings/payment-methods?setup_complete=true`,
    });

    return NextResponse.json({
      client_secret: setupIntent.client_secret,
      customer_id: customerId,
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Erreur lors de la création du moyen de paiement." },
      { status: 500 },
    );
  }
}
