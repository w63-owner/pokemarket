import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";
import { getStripe } from "@/lib/stripe/server";
import { checkoutSchema } from "@/lib/validations";
import { calcPriceSeller, calcFeeAmount, calcTotalBuyer } from "@/lib/pricing";
import { LIMITS } from "@/lib/constants";
import { checkoutRateLimit, applyRateLimit } from "@/lib/rate-limit";
import { getShippingCost } from "@/lib/shipping";
import { getAppUrl } from "@/lib/env";
import type {
  CheckoutResponse,
  MobileCheckoutResponse,
  PaymentProvider,
} from "@pokemarket/shared";

export async function POST(request: Request) {
  try {
    const { user } = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const rateLimitResponse = await applyRateLimit(checkoutRateLimit, user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    // The mobile app appends `?client=mobile` so the backend knows to
    // return a `MobileCheckoutResponse` (PaymentIntent client_secret) instead
    // of the legacy hosted Checkout Session URL the web flow uses.
    const url = new URL(request.url);
    const clientType = url.searchParams.get("client") === "mobile"
      ? "mobile"
      : "web";

    const {
      listing_id,
      shipping_country,
      shipping_address_line,
      shipping_address_city,
      shipping_address_postcode,
    } = validation.data;

    const admin = createAdminClient();

    const { data: listing, error: listingError } = await admin
      .from("listings")
      .select("*")
      .eq("id", listing_id)
      .single();

    if (listingError || !listing) {
      return NextResponse.json(
        { error: "Annonce introuvable" },
        { status: 404 },
      );
    }

    if (listing.seller_id === user.id) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas acheter votre propre annonce" },
        { status: 400 },
      );
    }

    const isReservedForMe =
      (listing.status === "RESERVED" || listing.status === "LOCKED") &&
      listing.reserved_for === user.id;
    const isActive = listing.status === "ACTIVE";

    if (!isActive && !isReservedForMe) {
      return NextResponse.json(
        { error: "Cette annonce n'est plus disponible à l'achat" },
        { status: 400 },
      );
    }

    const effectiveDisplayPrice =
      (isReservedForMe
        ? (listing.reserved_price ?? listing.display_price)
        : listing.display_price) ?? 0;

    if (listing.status === "LOCKED") {
      const { data: existingTx } = await admin
        .from("transactions")
        .select("id, stripe_checkout_session_id, stripe_payment_intent_id")
        .eq("listing_id", listing_id)
        .eq("buyer_id", user.id)
        .eq("status", "PENDING_PAYMENT")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingTx?.stripe_checkout_session_id) {
        const stripe = getStripe();
        const existingSession = await stripe.checkout.sessions.retrieve(
          existingTx.stripe_checkout_session_id,
        );

        if (existingSession.payment_status === "paid") {
          return NextResponse.json(
            { error: "Le paiement a déjà été effectué pour cet article" },
            { status: 400 },
          );
        }
      }

      // Mirror the same paid-PaymentIntent guard for the mobile flow so a
      // buyer who already paid via PaymentSheet on a prior LOCKED attempt
      // can't accidentally create a duplicate charge.
      if (existingTx?.stripe_payment_intent_id) {
        const stripe = getStripe();
        const existingPi = await stripe.paymentIntents.retrieve(
          existingTx.stripe_payment_intent_id,
        );

        if (existingPi.status === "succeeded") {
          return NextResponse.json(
            { error: "Le paiement a déjà été effectué pour cet article" },
            { status: 400 },
          );
        }
      }

      await admin
        .from("transactions")
        .update({ status: "EXPIRED" })
        .eq("listing_id", listing_id)
        .eq("buyer_id", user.id)
        .eq("status", "PENDING_PAYMENT");
    }

    const shippingCost = await getShippingCost(
      "FR",
      shipping_country,
      listing.delivery_weight_class ?? "standard",
    );

    const priceSeller = calcPriceSeller(effectiveDisplayPrice);
    const feeAmount = calcFeeAmount(effectiveDisplayPrice, priceSeller);
    const totalAmount = calcTotalBuyer(effectiveDisplayPrice, shippingCost);

    if (listing.status !== "LOCKED") {
      // Atomic lock acquire: returns the affected rows so we know whether WE
      // won the race. If 0 rows changed, another buyer (or another browser
      // tab from the same buyer) already locked the listing — bail out so
      // we don't create a duplicate Stripe session that could lead to a
      // double-charge.
      const { data: locked, error: lockError } = await admin
        .from("listings")
        .update({ status: "LOCKED" })
        .eq("id", listing_id)
        .in("status", isReservedForMe ? ["RESERVED"] : ["ACTIVE"])
        .select("id");

      if (lockError) {
        return NextResponse.json(
          { error: "Impossible de verrouiller l'annonce" },
          { status: 500 },
        );
      }

      if (!locked || locked.length === 0) {
        return NextResponse.json(
          {
            error:
              "Cette annonce vient d'être verrouillée par un autre acheteur. Réessayez dans quelques instants.",
          },
          { status: 409 },
        );
      }
    }

    const expirationDate = new Date(
      Date.now() + LIMITS.CHECKOUT_LOCK_MINUTES * 60 * 1000,
    ).toISOString();

    const { data: transaction, error: txError } = await admin
      .from("transactions")
      .insert({
        listing_id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
        total_amount: totalAmount,
        fee_amount: feeAmount,
        shipping_cost: shippingCost,
        status: "PENDING_PAYMENT",
        expiration_date: expirationDate,
        listing_title: listing.title,
        shipping_address_line,
        shipping_address_city,
        shipping_address_postcode,
        shipping_country,
      })
      .select("id")
      .single();

    if (txError || !transaction) {
      const rollbackStatus = isReservedForMe ? "RESERVED" : "ACTIVE";
      await admin
        .from("listings")
        .update({ status: rollbackStatus })
        .eq("id", listing_id);

      return NextResponse.json(
        { error: "Impossible de créer la transaction" },
        { status: 500 },
      );
    }

    if (clientType === "mobile") {
      try {
        const mobileResponse = await createMobileStripeIntent({
          user,
          transactionId: transaction.id,
          listingId: listing_id,
          totalAmount,
          listingTitle: listing.title,
        });
        return NextResponse.json(mobileResponse satisfies MobileCheckoutResponse);
      } catch (err) {
        const rollbackStatus = isReservedForMe ? "RESERVED" : "ACTIVE";
        await admin
          .from("listings")
          .update({ status: rollbackStatus })
          .eq("id", listing_id);
        await admin
          .from("transactions")
          .update({ status: "EXPIRED" })
          .eq("id", transaction.id);
        throw err;
      }
    }

    // Derive the redirect base URL from the inbound request first so a buyer
    // checking out from `localhost:3000` (or a Vercel preview deployment)
    // doesn't get bounced to the production host on the success page. We only
    // fall back to NEXT_PUBLIC_APP_URL when no Origin header is present
    // (e.g. server-to-server invocations during tests).
    const requestOrigin = request.headers.get("origin");
    const appUrl = requestOrigin?.trim().replace(/\/$/, "") ?? getAppUrl();

    const { data: buyerProfile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    const stripeCustomerProps = buyerProfile?.stripe_customer_id
      ? {
          customer: buyerProfile.stripe_customer_id,
          customer_update: { address: "auto" as const, name: "auto" as const },
        }
      : { customer_email: user.email };

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...stripeCustomerProps,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: listing.title,
              images: listing.cover_image_url
                ? [listing.cover_image_url]
                : undefined,
            },
            unit_amount: Math.round(effectiveDisplayPrice * 100),
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "eur",
            product_data: { name: "Frais de livraison" },
            unit_amount: Math.round(shippingCost * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        transaction_id: transaction.id,
        listing_id,
      },
      success_url: `${appUrl}/orders/${transaction.id}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/listing/${listing_id}?checkout=cancelled`,
      expires_at:
        Math.floor(Date.now() / 1000) + LIMITS.CHECKOUT_LOCK_MINUTES * 60,
    });

    await admin
      .from("transactions")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", transaction.id);

    const response: CheckoutResponse = {
      url: session.url!,
      transaction_id: transaction.id,
    };

    return NextResponse.json(response);
  } catch (err) {
    Sentry.captureException(err);
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}

/**
 * Determines which payment provider should drive the mobile checkout for
 * the current rollout. Mobile-only because the web flow keeps using Stripe
 * Checkout Sessions through the entire migration. Honors `PAYMENT_PROVIDER`
 * env (set to `mangopay` once the backend is ready) and defaults to Stripe.
 */
function getActiveMobilePaymentProvider(): PaymentProvider {
  const raw = process.env.PAYMENT_PROVIDER?.toLowerCase();
  if (raw === "mangopay") return "mangopay";
  return "stripe";
}

/**
 * Builds the Stripe-flavoured `MobileCheckoutResponse`: a PaymentIntent
 * client_secret + the buyer's Stripe customer id and a one-shot ephemeral
 * key the SDK uses to render previously-saved cards in PaymentSheet.
 *
 * We use direct PaymentIntents (not Checkout Sessions) so the buyer never
 * leaves the app — Stripe's PaymentSheet renders Apple Pay / Google Pay
 * buttons natively, satisfies App Store guideline 3.1.5, and posts back
 * via `payment_intent.succeeded` on the existing webhook.
 */
async function createMobileStripeIntent(input: {
  user: { id: string; email?: string };
  transactionId: string;
  listingId: string;
  totalAmount: number;
  listingTitle: string;
}): Promise<MobileCheckoutResponse> {
  const provider = getActiveMobilePaymentProvider();

  if (provider !== "stripe") {
    throw new Error(
      `Mobile checkout provider '${provider}' is not implemented yet.`,
    );
  }

  const stripe = getStripe();
  const admin = createAdminClient();

  // Reuse the existing Stripe Customer if we have one; otherwise create a
  // fresh one and persist on the buyer's profile so future PaymentSheets
  // can hydrate saved cards. Mirrors the bookkeeping in
  // `/api/stripe/payment-methods` POST.
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, username")
    .eq("id", input.user.id)
    .single();

  let customerId = profile?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: input.user.email,
      name: profile?.username ?? undefined,
      metadata: { supabase_user_id: input.user.id },
    });
    customerId = customer.id;
    await admin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", input.user.id);
  }

  // Pin the ephemeral key to a known-stable Stripe API version so the
  // React Native SDK (which ships independently from our backend) can
  // decode the saved-card list. Falls back to the same version the rest
  // of our integration uses when not overridden.
  const ephemeralKeyApiVersion =
    process.env.STRIPE_RN_API_VERSION ?? "2024-09-30.acacia";
  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: ephemeralKeyApiVersion },
  );

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(input.totalAmount * 100),
    currency: "eur",
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    description: input.listingTitle,
    // The same metadata pattern the Checkout Session uses, so the existing
    // `payment_intent.succeeded` webhook handler can finalize the
    // transaction without branching on session vs PI.
    metadata: {
      transaction_id: input.transactionId,
      listing_id: input.listingId,
      source: "mobile",
    },
  });

  await admin
    .from("transactions")
    .update({ stripe_payment_intent_id: paymentIntent.id })
    .eq("id", input.transactionId);

  return {
    provider: "stripe",
    mode: "payment_intent",
    client_secret: paymentIntent.client_secret!,
    payment_intent_id: paymentIntent.id,
    ephemeral_key: ephemeralKey.secret,
    customer_id: customerId,
    transaction_id: input.transactionId,
  };
}
