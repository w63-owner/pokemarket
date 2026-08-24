import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import type {
  OnboardingResponse,
  StripeConnectOnboardingRequest,
} from "@deckdealr/shared";

import { getRequestUser } from "@/lib/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { onboardRateLimit, applyRateLimit } from "@/lib/rate-limit";
import { getAllowedCheckoutOrigin } from "@/lib/env";
import { stripeIdempotencyKeys } from "@/lib/stripe/idempotency";

const onboardingSchema = z.object({
  client: z.enum(["web", "mobile"]).default("web"),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
  entity_type: z.enum(["individual", "company"]).optional(),
});

export async function POST(request: Request) {
  try {
    const { user } = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const rateLimitResponse = await applyRateLimit(onboardRateLimit, user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const admin = createAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("stripe_account_id, kyc_status, username, country_code")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profil introuvable" },
        { status: 404 },
      );
    }

    const stripe = getStripe("connect");
    const requestOrigin = getAllowedCheckoutOrigin(
      request.headers.get("origin"),
    );
    if (!requestOrigin) {
      return NextResponse.json(
        { error: "Origin non autorisée" },
        { status: 403 },
      );
    }

    const rawBody = await request.json().catch(() => ({}));
    const parsed = onboardingSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Paramètres d’onboarding invalides" },
        { status: 400 },
      );
    }

    const input = parsed.data satisfies StripeConnectOnboardingRequest;
    let stripeAccountId = profile.stripe_account_id;

    if (!stripeAccountId) {
      if (!input.country || !input.entity_type) {
        return NextResponse.json(
          {
            error:
              "Le pays et le type de vendeur sont requis avant de créer le compte Stripe.",
            code: "ONBOARDING_DETAILS_REQUIRED",
          },
          { status: 422 },
        );
      }

      const country = input.country.toUpperCase();
      const account = await stripe.v2.core.accounts.create(
        {
          contact_email: user.email,
          display_name: profile.username,
          dashboard: "express",
          defaults: {
            currency: "eur",
            locales: ["fr-FR"],
            profile: {
              business_url: `${requestOrigin}/profile/${user.id}`,
              doing_business_as: profile.username,
              product_description:
                "Vente de cartes à collectionner TCG entre particuliers sur TheDeckDealr",
            },
            responsibilities: {
              fees_collector: "application",
              losses_collector: "application",
            },
          },
          identity: {
            country,
            entity_type: input.entity_type,
          },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: { requested: true },
                },
              },
            },
          },
          include: [
            "configuration.recipient",
            "defaults",
            "identity",
            "requirements",
          ],
          metadata: { user_id: user.id },
        },
        {
          idempotencyKey: stripeIdempotencyKeys.connectAccount(user.id),
        },
      );

      stripeAccountId = account.id;

      const { error: updateError } = await admin
        .from("profiles")
        .update({
          stripe_account_id: stripeAccountId,
          kyc_status: "PENDING",
          country_code: country,
        })
        .eq("id", user.id);

      if (updateError) {
        Sentry.captureException(updateError, {
          tags: {
            component: "stripe-connect-onboard",
            stage: "persist-account",
          },
        });
        return NextResponse.json(
          { error: "Impossible de sauvegarder le compte Stripe" },
          { status: 500 },
        );
      }
    }

    const mobileReturnUrl = `${requestOrigin}/api/stripe-connect/mobile-redirect?target=return`;
    const mobileRefreshUrl = `${requestOrigin}/api/stripe-connect/mobile-redirect?target=refresh`;
    const accountLink = await stripe.v2.core.accountLinks.create({
      account: stripeAccountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          collection_options: {
            fields: "eventually_due",
            future_requirements: "include",
          },
          return_url:
            input.client === "mobile"
              ? mobileReturnUrl
              : `${requestOrigin}/wallet/return`,
          refresh_url:
            input.client === "mobile"
              ? mobileRefreshUrl
              : `${requestOrigin}/wallet?stripe_connect=refresh`,
        },
      },
    });

    const response: OnboardingResponse = {
      provider: "stripe",
      account_id: stripeAccountId,
      url: accountLink.url,
    };
    return NextResponse.json(response);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: "stripe-connect-onboard" },
    });
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
