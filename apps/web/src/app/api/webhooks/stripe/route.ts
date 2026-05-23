import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";

import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePaidTransaction } from "@/lib/stripe/post-payment";
import { handleAccountUpdated } from "@/lib/stripe/webhook-handlers/account-updated";
import { handleChargeRefunded } from "@/lib/stripe/webhook-handlers/charge-refunded";
import {
  handleChargeDisputeClosed,
  handleChargeDisputeCreated,
  handleChargeDisputeUpdated,
} from "@/lib/stripe/webhook-handlers/charge-dispute";
import {
  handlePayoutFailed,
  handlePayoutPaid,
} from "@/lib/stripe/webhook-handlers/payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    Sentry.captureException(err);
    console.error("Stripe signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { error: idempotencyError } = await admin
    .from("stripe_webhooks_processed")
    .insert({ stripe_event_id: event.id });

  if (idempotencyError) {
    if (idempotencyError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("Idempotency check failed:", idempotencyError);
    return NextResponse.json(
      { error: "Idempotency check failed" },
      { status: 500 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case "checkout.session.expired":
        await handleCheckoutFailed(
          event.data.object as Stripe.Checkout.Session,
          admin,
          "EXPIRED",
        );
        break;

      case "checkout.session.async_payment_failed":
        await handleCheckoutFailed(
          event.data.object as Stripe.Checkout.Session,
          admin,
          "CANCELLED",
        );
        break;

      // ── Mobile PaymentIntent flow ───────────────────────────────────────
      // The mobile app uses Stripe PaymentSheet (PaymentIntents directly),
      // not Checkout Sessions. checkout.session.* events are never fired for
      // this flow, so we must handle payment_intent.succeeded here.
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent,
        );
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(
          event.data.object as Stripe.PaymentIntent,
          admin,
        );
        break;

      // ── Connect account lifecycle ───────────────────────────────────────
      // Fired whenever a connected account's KYC state changes. We rely on
      // this push instead of polling /api/stripe-connect/status from the
      // wallet page on every load.
      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      // ── Refunds ─────────────────────────────────────────────────────────
      // Fires for both admin-initiated refunds and bank-initiated ones.
      // The handler reverses the seller's wallet credit and notifies both
      // parties.
      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      // ── Disputes / chargebacks ──────────────────────────────────────────
      case "charge.dispute.created":
        await handleChargeDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      case "charge.dispute.updated":
        await handleChargeDisputeUpdated(event.data.object as Stripe.Dispute);
        break;
      case "charge.dispute.closed":
        await handleChargeDisputeClosed(event.data.object as Stripe.Dispute);
        break;

      // ── Payouts (seller bank wires) ────────────────────────────────────
      // payout.* events are emitted on the CONNECTED account, not the
      // platform — Stripe sets `event.account` to the connected account id.
      case "payout.failed":
        await handlePayoutFailed(
          event.data.object as Stripe.Payout,
          event.account ?? null,
        );
        break;
      case "payout.paid":
        await handlePayoutPaid(
          event.data.object as Stripe.Payout,
          event.account ?? null,
        );
        break;

      default:
        console.warn(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error(`Error processing ${event.type}:`, err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const transactionId = session.metadata?.transaction_id;
  const listingId = session.metadata?.listing_id;

  if (!transactionId || !listingId) {
    throw new Error("Missing transaction_id or listing_id in session metadata");
  }

  // Capture the Payment Intent + Charge IDs so refund / dispute webhooks
  // (which only carry charge IDs, not session IDs) can find this row.
  // payment_intent can be a string id, an expanded object, or null for
  // pending async-payment sessions — guard accordingly.
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  // The Charge id requires expanding payment_intent.latest_charge or fetching
  // the PaymentIntent. The webhook doesn't expand by default, so we'll
  // fetch the PaymentIntent here when we have its id.
  let chargeId: string | null = null;
  if (paymentIntentId) {
    try {
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      chargeId =
        typeof pi.latest_charge === "string"
          ? pi.latest_charge
          : (pi.latest_charge?.id ?? null);
    } catch (err) {
      // Non-fatal: we still record the Payment Intent and downstream webhooks
      // can re-derive the charge id later. Log so we notice if Stripe rate
      // limits us or returns a transient error.
      Sentry.captureException(err, {
        extra: {
          context: "handleCheckoutCompleted_charge_lookup",
          payment_intent_id: paymentIntentId,
        },
      });
    }
  }

  const result = await finalizePaidTransaction(transactionId, {
    paymentIntentId,
    chargeId,
  });

  if (result === "NOT_FOUND") {
    throw new Error(`Transaction ${transactionId} not found`);
  }

  // Bust the listing detail page cache so the SOLD pill appears immediately.
  // (Safe inside a route handler — only forbidden during Server Component renders.)
  if (result === "PAID") {
    revalidatePath(`/listing/${listingId}`);
  }
}

async function handleCheckoutFailed(
  session: Stripe.Checkout.Session,
  admin: AdminClient,
  targetStatus: "CANCELLED" | "EXPIRED",
) {
  const transactionId = session.metadata?.transaction_id;
  const listingId = session.metadata?.listing_id;

  if (!transactionId || !listingId) {
    throw new Error("Missing transaction_id or listing_id in session metadata");
  }

  const { data: transaction } = await admin
    .from("transactions")
    .select("status")
    .eq("id", transactionId)
    .single();

  if (!transaction || transaction.status !== "PENDING_PAYMENT") {
    console.warn(
      `Transaction ${transactionId} not in PENDING_PAYMENT, skipping`,
    );
    return;
  }

  await admin
    .from("transactions")
    .update({ status: targetStatus })
    .eq("id", transactionId);

  const { data: acceptedOffer } = await admin
    .from("offers")
    .select("id")
    .eq("listing_id", listingId)
    .eq("status", "ACCEPTED")
    .maybeSingle();

  const newListingStatus = acceptedOffer ? "RESERVED" : "ACTIVE";

  await admin
    .from("listings")
    .update({ status: newListingStatus })
    .eq("id", listingId)
    .eq("status", "LOCKED");
}

/**
 * Fired when a Stripe PaymentIntent (mobile PaymentSheet flow) succeeds.
 * The PaymentIntent carries `metadata.transaction_id` set by /api/checkout.
 * We extract the charge id from `latest_charge` and delegate to the same
 * `finalizePaidTransaction` used by the web Checkout Session path so all
 * post-payment side-effects run exactly once.
 */
async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent) {
  const transactionId = intent.metadata?.transaction_id;
  const listingId = intent.metadata?.listing_id;

  if (!transactionId) {
    // Not a PokeMarket checkout PaymentIntent — ignore silently.
    console.warn(
      "[webhook] payment_intent.succeeded: missing transaction_id in metadata, skipping",
    );
    return;
  }

  const chargeId =
    typeof intent.latest_charge === "string"
      ? intent.latest_charge
      : (intent.latest_charge?.id ?? null);

  const result = await finalizePaidTransaction(transactionId, {
    paymentIntentId: intent.id,
    chargeId,
  });

  if (result === "NOT_FOUND") {
    throw new Error(
      `[webhook] payment_intent.succeeded: transaction ${transactionId} not found`,
    );
  }

  if (result === "PAID" && listingId) {
    revalidatePath(`/listing/${listingId}`);
  }
}

/**
 * Fired when a Stripe PaymentIntent (mobile PaymentSheet flow) fails
 * after being created. We release the listing lock so other buyers can
 * purchase it, mirroring the web checkout.session.expired behaviour.
 */
async function handlePaymentIntentFailed(
  intent: Stripe.PaymentIntent,
  admin: AdminClient,
) {
  const transactionId = intent.metadata?.transaction_id;
  const listingId = intent.metadata?.listing_id;

  if (!transactionId || !listingId) return;

  await handleCheckoutFailed(
    // Construct a minimal session-like object reusing the existing helper.
    // We only need `metadata` — the helper ignores all other Session fields.
    {
      metadata: { transaction_id: transactionId, listing_id: listingId },
    } as unknown as Stripe.Checkout.Session,
    admin,
    "CANCELLED",
  );
}
