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
import {
  getAllowedCheckoutOrigin,
  getStripeLaunchPolicy,
  STRIPE_API_VERSION,
} from "@/lib/env";
import { stripeIdempotencyKeys } from "@/lib/stripe/idempotency";
import { isFeatureEnabled } from "@/lib/feature-flags/server";
import {
  FEATURE_FLAGS,
  SHIPPING_ORIGIN_COUNTRY,
  type CheckoutResponse,
  type MobileCheckoutResponse,
} from "@deckdealr/shared";

export async function POST(request: Request) {
  try {
    const { user } = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    if (!(await isFeatureEnabled(FEATURE_FLAGS.CHECKOUT))) {
      return NextResponse.json(
        { error: "Les paiements sont temporairement indisponibles" },
        { status: 503 },
      );
    }

    const launchPolicy = getStripeLaunchPolicy();
    if (!launchPolicy.checkoutEnabled) {
      return NextResponse.json(
        { error: "Les paiements sont temporairement indisponibles" },
        { status: 503 },
      );
    }
    if (
      launchPolicy.allowedBuyerIds.size > 0 &&
      !launchPolicy.allowedBuyerIds.has(user.id)
    ) {
      return NextResponse.json(
        {
          error: "Le paiement est actuellement réservé au groupe de lancement",
        },
        { status: 403 },
      );
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
    const clientType =
      url.searchParams.get("client") === "mobile" ? "mobile" : "web";
    const appUrl =
      clientType === "web"
        ? getAllowedCheckoutOrigin(request.headers.get("origin"))
        : null;

    if (clientType === "web" && !appUrl) {
      return NextResponse.json(
        { error: "Origine de checkout non autorisée" },
        { status: 403 },
      );
    }

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

    let existingTx: {
      id: string;
      stripe_checkout_session_id: string | null;
      stripe_payment_intent_id: string | null;
    } | null = null;

    if (listing.status === "LOCKED") {
      const { data } = await admin
        .from("transactions")
        .select("id, stripe_checkout_session_id, stripe_payment_intent_id")
        .eq("listing_id", listing_id)
        .eq("buyer_id", user.id)
        .eq("status", "PENDING_PAYMENT")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingTx = data;
    }

    if (!isActive && !isReservedForMe && !existingTx) {
      return NextResponse.json(
        { error: "Cette annonce n'est plus disponible à l'achat" },
        { status: 400 },
      );
    }

    const effectiveDisplayPrice =
      (isReservedForMe
        ? (listing.reserved_price ?? listing.display_price)
        : listing.display_price) ?? 0;

    const shippingCost = await getShippingCost(
      SHIPPING_ORIGIN_COUNTRY,
      shipping_country,
      listing.delivery_weight_class ?? "standard",
    );

    const priceSeller = calcPriceSeller(effectiveDisplayPrice);
    const feeAmount = calcFeeAmount(effectiveDisplayPrice, priceSeller);
    const totalAmount = calcTotalBuyer(effectiveDisplayPrice, shippingCost);
    const totalAmountMinor = Math.round(totalAmount * 100);

    let reuseTransactionId: string | null = null;
    if (listing.status === "LOCKED" && existingTx) {
      const stripe = getStripe();
      let replacedStripeObject = false;

      if (existingTx?.stripe_checkout_session_id) {
        const existingSession = await stripe.checkout.sessions.retrieve(
          existingTx.stripe_checkout_session_id,
        );

        if (existingSession.payment_status === "paid") {
          return NextResponse.json(
            { error: "Le paiement a déjà été effectué pour cet article" },
            { status: 400 },
          );
        }

        if (
          existingSession.status === "complete" &&
          existingSession.payment_status === "unpaid"
        ) {
          return NextResponse.json(
            {
              error:
                "Le paiement est toujours en cours de traitement. Attendez sa confirmation avant de réessayer.",
              transaction_id: existingTx.id,
            },
            { status: 409 },
          );
        }

        const sessionIsOpen =
          existingSession.status === "open" ||
          (existingSession.status === undefined &&
            existingSession.payment_status === "unpaid");
        const sessionAmountIsCurrent =
          existingSession.amount_total === totalAmountMinor &&
          existingSession.currency === "eur";
        if (
          clientType === "web" &&
          sessionIsOpen &&
          sessionAmountIsCurrent &&
          existingSession.url
        ) {
          return NextResponse.json({
            url: existingSession.url,
            transaction_id: existingTx.id,
          } satisfies CheckoutResponse);
        }

        if (sessionIsOpen) {
          await stripe.checkout.sessions.expire(existingSession.id);
        }
        replacedStripeObject = true;
      }

      if (existingTx?.stripe_payment_intent_id) {
        const existingPi = await stripe.paymentIntents.retrieve(
          existingTx.stripe_payment_intent_id,
        );

        if (existingPi.status === "succeeded") {
          return NextResponse.json(
            { error: "Le paiement a déjà été effectué pour cet article" },
            { status: 400 },
          );
        }

        const customerId =
          typeof existingPi.customer === "string"
            ? existingPi.customer
            : existingPi.customer?.id;
        const intentAmountIsCurrent =
          existingPi.amount === totalAmountMinor &&
          existingPi.currency === "eur";
        if (
          clientType === "mobile" &&
          existingPi.status !== "canceled" &&
          intentAmountIsCurrent &&
          existingPi.client_secret &&
          customerId
        ) {
          const ephemeralKey = await createStripeEphemeralKey(
            stripe,
            customerId,
          );
          return NextResponse.json({
            provider: "stripe",
            mode: "payment_intent",
            client_secret: existingPi.client_secret,
            payment_intent_id: existingPi.id,
            ephemeral_key: ephemeralKey.secret!,
            customer_id: customerId,
            transaction_id: existingTx.id,
          } satisfies MobileCheckoutResponse);
        }

        if (existingPi.status !== "canceled") {
          await stripe.paymentIntents.cancel(existingPi.id);
        }
        replacedStripeObject = true;
      }

      if (replacedStripeObject) {
        await admin
          .from("transactions")
          .update({ status: "EXPIRED" })
          .eq("id", existingTx.id)
          .eq("status", "PENDING_PAYMENT");
      } else {
        // A previous network call may have failed before persisting the Stripe
        // object ID. Reuse the same transaction and deterministic key.
        reuseTransactionId = existingTx.id;
      }
    }

    if (
      launchPolicy.maxAmountMinor !== null &&
      totalAmountMinor > launchPolicy.maxAmountMinor
    ) {
      return NextResponse.json(
        {
          error:
            "Le montant de cette commande dépasse le plafond temporaire du lancement",
        },
        { status: 422 },
      );
    }

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

    const transactionResult = reuseTransactionId
      ? { data: { id: reuseTransactionId }, error: null }
      : await admin
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
    const { data: transaction, error: txError } = transactionResult;

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
      const mobileResponse = await createMobileStripeIntent({
        user,
        transactionId: transaction.id,
        listingId: listing_id,
        totalAmount,
        listingTitle: listing.title,
      });
      return NextResponse.json(mobileResponse satisfies MobileCheckoutResponse);
    }

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
    const session = await stripe.checkout.sessions.create(
      {
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
        payment_intent_data: {
          transfer_group: `order_${transaction.id}`,
        },
        integration_identifier: "deckdealr-web-checkout-pkjhbnxq",
        success_url: `${appUrl!}/orders/${transaction.id}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl!}/listing/${listing_id}?checkout=cancelled`,
        expires_at:
          Math.floor(Date.now() / 1000) + LIMITS.CHECKOUT_LOCK_MINUTES * 60,
      },
      {
        idempotencyKey: stripeIdempotencyKeys.checkoutSession(transaction.id),
      },
    );

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
    Sentry.captureException(err, {
      tags: { component: "stripe-checkout" },
    });
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
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
    const customer = await stripe.customers.create(
      {
        email: input.user.email,
        name: profile?.username ?? undefined,
        metadata: { supabase_user_id: input.user.id },
      },
      { idempotencyKey: stripeIdempotencyKeys.customer(input.user.id) },
    );
    customerId = customer.id;
    await admin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", input.user.id);
  }

  // Keep ephemeral keys on the same reviewed API version as stripe-node.
  // Stripe mobile SDKs are backend-version compatible unless explicitly noted.
  const ephemeralKey = await createStripeEphemeralKey(stripe, customerId);

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: Math.round(input.totalAmount * 100),
      currency: "eur",
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      description: input.listingTitle,
      transfer_group: `order_${input.transactionId}`,
      // The same metadata pattern the Checkout Session uses, so the existing
      // `payment_intent.succeeded` webhook handler can finalize the
      // transaction without branching on session vs PI.
      metadata: {
        transaction_id: input.transactionId,
        listing_id: input.listingId,
        source: "mobile",
      },
    },
    {
      idempotencyKey: stripeIdempotencyKeys.paymentIntent(input.transactionId),
    },
  );

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

async function createStripeEphemeralKey(
  stripe: ReturnType<typeof getStripe>,
  customerId: string,
) {
  return stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: STRIPE_API_VERSION },
  );
}
