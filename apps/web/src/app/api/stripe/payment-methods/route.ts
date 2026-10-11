import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestUserClient } from "@/lib/auth/api";
import { getStripe } from "@/lib/stripe/server";
import { getAppUrl } from "@/lib/env";
import {
  getOrCreateStripeCustomer,
  loadOwnedStripeCustomer,
} from "@/lib/stripe/owned-customer";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paymentMethodIdSchema = z
  .string()
  .trim()
  .regex(/^pm_[A-Za-z0-9]+$/, "Identifiant de moyen de paiement invalide");

const updateDefaultSchema = z.object({
  payment_method_id: paymentMethodIdSchema,
});

function getCustomerId(
  customer: string | { id: string } | null,
): string | null {
  if (typeof customer === "string") return customer;
  return customer?.id ?? null;
}

export async function GET(request: Request) {
  try {
    const { user, supabase } = await getRequestUserClient(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const customer = await loadOwnedStripeCustomer(user.id);
    if (!customer) {
      return NextResponse.json({ payment_methods: [] });
    }

    const stripe = getStripe();
    const methods = await stripe.paymentMethods.list({
      customer: customer.id,
      limit: 100,
    });

    const defaultPaymentMethodId =
      customer.invoice_settings.default_payment_method != null
        ? getCustomerId(customer.invoice_settings.default_payment_method)
        : null;

    const cards = methods.data.map((pm) => ({
      id: pm.id,
      type: pm.type,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? pm.sepa_debit?.last4 ?? "????",
      exp_month: pm.card?.exp_month ?? null,
      exp_year: pm.card?.exp_year ?? null,
      is_default: pm.id === defaultPaymentMethodId,
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
    const { user, supabase } = await getRequestUserClient(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const stripe = getStripe();
    const customer = await getOrCreateStripeCustomer({
      userId: user.id,
      email: user.email,
    });
    const customerId = customer.id;

    const appUrl = getAppUrl();

    const [setupIntent, customerSession] = await Promise.all([
      stripe.setupIntents.create({
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        usage: "on_session",
        return_url: `${appUrl}/profile/payments?setup_complete=true`,
      }),
      stripe.customerSessions.create({
        customer: customerId,
        components: {
          mobile_payment_element: {
            enabled: true,
            features: {
              payment_method_save: "enabled",
              payment_method_redisplay: "enabled",
              payment_method_remove: "enabled",
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      client_secret: setupIntent.client_secret,
      customer_id: customerId,
      customer_session_client_secret: customerSession.client_secret,
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Erreur lors de la création du moyen de paiement." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabase } = await getRequestUserClient(request);
    if (!user || !supabase) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const parsed = updateDefaultSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Corps invalide" },
        { status: 400 },
      );
    }

    const customer = await loadOwnedStripeCustomer(user.id);
    if (!customer) {
      return NextResponse.json(
        { error: "Client Stripe introuvable" },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    const paymentMethod = await stripe.paymentMethods.retrieve(
      parsed.data.payment_method_id,
    );

    if (getCustomerId(paymentMethod.customer) !== customer.id) {
      return NextResponse.json(
        { error: "Moyen de paiement introuvable" },
        { status: 404 },
      );
    }

    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du moyen de paiement." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, supabase } = await getRequestUserClient(request);
    if (!user || !supabase) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const parsedId = paymentMethodIdSchema.safeParse(
      new URL(request.url).searchParams.get("id"),
    );
    if (!parsedId.success) {
      return NextResponse.json(
        { error: parsedId.error.issues[0]?.message ?? "Identifiant requis" },
        { status: 400 },
      );
    }

    const customer = await loadOwnedStripeCustomer(user.id);
    if (!customer) {
      return NextResponse.json(
        { error: "Client Stripe introuvable" },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    const paymentMethod = await stripe.paymentMethods.retrieve(parsedId.data);

    if (getCustomerId(paymentMethod.customer) !== customer.id) {
      return NextResponse.json(
        { error: "Moyen de paiement introuvable" },
        { status: 404 },
      );
    }

    const defaultPaymentMethodId =
      customer.invoice_settings.default_payment_method != null
        ? getCustomerId(customer.invoice_settings.default_payment_method)
        : null;

    if (defaultPaymentMethodId === paymentMethod.id) {
      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: "" },
      });
    }

    await stripe.paymentMethods.detach(paymentMethod.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du moyen de paiement." },
      { status: 500 },
    );
  }
}
