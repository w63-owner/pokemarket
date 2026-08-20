import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";

import { getStripeEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/server";
import { verifyStripeWebhookSource } from "@/lib/stripe/webhook-security";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePaidTransaction } from "@/lib/stripe/post-payment";
import {
  handleChargeRefunded,
  handleRefundUpdated,
} from "@/lib/stripe/webhook-handlers/charge-refunded";
import {
  handleChargeDisputeClosed,
  handleChargeDisputeCreated,
  handleChargeDisputeUpdated,
} from "@/lib/stripe/webhook-handlers/charge-dispute";
import {
  handlePayoutCanceled,
  handlePayoutFailed,
  handlePayoutPaid,
  handlePayoutUpdated,
} from "@/lib/stripe/webhook-handlers/payout";
import {
  handleTransferCreated,
  handleTransferReversed,
} from "@/lib/stripe/webhook-handlers/transfer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sourceRejection = verifyStripeWebhookSource(request);
  if (sourceRejection) return sourceRejection;

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
      getStripeEnv().webhookSecret,
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: "stripe-webhook", stage: "signature-verification" },
    });
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
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
    Sentry.captureException(idempotencyError, {
      tags: { component: "stripe-webhook", stage: "idempotency-claim" },
    });
    return NextResponse.json(
      { error: "Idempotency check failed" },
      { status: 500 },
    );
  }

  let handled = false;
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case "checkout.session.async_payment_succeeded":
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
      case "payment_intent.canceled":
        await handlePaymentIntentFailed(
          event.data.object as Stripe.PaymentIntent,
          admin,
        );
        break;

      // ── Refunds ─────────────────────────────────────────────────────────
      // Fires for both admin-initiated refunds and bank-initiated ones.
      // The handler reverses the seller's wallet credit and notifies both
      // parties.
      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      case "refund.created":
      case "refund.updated":
        await handleRefundUpdated(event.data.object as Stripe.Refund);
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

      // ── Transfers (platform → connected account, one per order) ────────
      case "transfer.created":
        await handleTransferCreated(event.data.object as Stripe.Transfer);
        break;
      case "transfer.reversed":
        await handleTransferReversed(event.data.object as Stripe.Transfer);
        break;

      // ── Payouts (seller bank wires) ────────────────────────────────────
      // payout.* events are emitted on the CONNECTED account, not the
      // platform — Stripe sets `event.account` to the connected account id.
      case "payout.created":
      case "payout.updated":
        await handlePayoutUpdated(
          event.data.object as Stripe.Payout,
          event.account ?? null,
        );
        break;
      case "payout.failed":
        await handlePayoutFailed(
          event.data.object as Stripe.Payout,
          event.account ?? null,
        );
        break;
      case "payout.canceled":
        await handlePayoutCanceled(
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
        Sentry.captureMessage("Unhandled Stripe event type", {
          level: "info",
          tags: { component: "stripe-webhook", event_type: event.type },
        });
    }
    handled = true;
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        component: "stripe-webhook",
        stage: "handler",
        event_type: event.type,
      },
    });
  } finally {
    // If the handler threw, release the idempotency claim so Stripe's
    // automatic redelivery is re-processed instead of being swallowed as a
    // duplicate. Without this, a transient failure (DB blip, Stripe API
    // hiccup) would PERMANENTLY mark the event as processed while leaving the
    // transaction / wallet in an inconsistent state — money captured by
    // Stripe but the order never finalized, the seller never credited, or a
    // failed payout never restored. All handlers are independently idempotent
    // (atomic status guards), so re-processing on retry is safe.
    if (!handled) {
      const { error: cleanupError } = await admin
        .from("stripe_webhooks_processed")
        .delete()
        .eq("stripe_event_id", event.id);
      if (cleanupError) {
        Sentry.captureException(cleanupError, {
          extra: {
            context: "webhook_idempotency_cleanup_failed",
            stripe_event_id: event.id,
            event_type: event.type,
          },
        });
      }
    }
  }

  if (!handled) {
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // `completed` means the customer submitted Checkout, not necessarily that
  // an asynchronous payment method has settled. The later
  // async_payment_succeeded event will finalize it once Stripe reports paid.
  if (session.payment_status !== "paid") {
    return;
  }

  const transactionId = session.metadata?.transaction_id;
  const listingId = session.metadata?.listing_id;

  if (!transactionId || !listingId) {
    throw new Error("Missing transaction_id or listing_id in session metadata");
  }

  // Bind amount/currency to the persisted order before side-effects. Metadata
  // alone is insufficient defense-in-depth if Checkout line items ever diverge
  // from the transaction total we credit into escrow.
  const admin = createAdminClient();
  const { data: transaction } = await admin
    .from("transactions")
    .select("id, status, total_amount")
    .eq("id", transactionId)
    .single();

  if (!transaction) {
    throw new Error(`Transaction ${transactionId} not found`);
  }
  if (transaction.status !== "PENDING_PAYMENT") {
    return;
  }

  const expectedAmount = Math.round(Number(transaction.total_amount) * 100);
  if (
    session.amount_total !== expectedAmount ||
    session.currency?.toLowerCase() !== "eur"
  ) {
    Sentry.captureMessage(
      `checkout session amount/currency mismatch for tx=${transactionId}`,
      {
        level: "error",
        extra: {
          session_id: session.id,
          amount_total: session.amount_total,
          currency: session.currency,
          expected_amount: expectedAmount,
        },
      },
    );
    return;
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

  // Atomic status guard: a concurrent checkout.session.completed /
  // payment_intent.succeeded may flip PENDING_PAYMENT → PAID between our
  // read and write. The .eq("status", "PENDING_PAYMENT") prevents overwriting
  // a paid order with EXPIRED/CANCELLED (and then relisting a sold card).
  const { data: updated, error: txError } = await admin
    .from("transactions")
    .update({ status: targetStatus })
    .eq("id", transactionId)
    .eq("status", "PENDING_PAYMENT")
    .select("id");

  if (txError) throw txError;

  if (!updated || updated.length === 0) {
    return;
  }

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
    return;
  }

  const admin = createAdminClient();
  const { data: transaction } = await admin
    .from("transactions")
    .select("id, status, total_amount")
    .eq("id", transactionId)
    .single();

  if (!transaction) {
    throw new Error(
      `[webhook] payment_intent.succeeded: transaction ${transactionId} not found`,
    );
  }
  if (transaction.status !== "PENDING_PAYMENT") {
    return;
  }

  const expectedAmount = Math.round(Number(transaction.total_amount) * 100);
  if (
    intent.currency?.toLowerCase() !== "eur" ||
    intent.amount !== expectedAmount ||
    intent.amount_received !== expectedAmount
  ) {
    Sentry.captureMessage(
      `payment_intent amount/currency mismatch for tx=${transactionId}`,
      {
        level: "error",
        extra: {
          payment_intent_id: intent.id,
          amount: intent.amount,
          amount_received: intent.amount_received,
          currency: intent.currency,
          expected_amount: expectedAmount,
        },
      },
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
 * Fired when a Stripe PaymentIntent (mobile PaymentSheet flow) fails an
 * attempt. CRITICAL: Stripe emits this on EVERY declined attempt (insufficient
 * funds, wrong CVC, 3DS abandon…), and the PaymentIntent stays reusable — the
 * buyer almost always retries in the same sheet and may then succeed.
 *
 * Therefore a failed attempt is NOT terminal: we must NOT cancel the
 * transaction or free the listing here. Doing so created a money-loss path —
 * the retry's `payment_intent.succeeded` would find the transaction already
 * CANCELLED and short-circuit, charging the buyer with no order while the
 * listing may have been resold.
 *
 * The PaymentIntent only becomes truly dead when its status is `canceled`
 * (we never auto-cancel, so this is effectively unreachable today) — only then
 * do we release the lock. Genuinely abandoned PENDING_PAYMENT transactions are
 * reclaimed by the `release-expired` cron once the checkout lock elapses (that
 * cron re-checks Stripe before expiring, so a paid intent is never wrongly
 * expired).
 */
async function handlePaymentIntentFailed(
  intent: Stripe.PaymentIntent,
  admin: AdminClient,
) {
  const transactionId = intent.metadata?.transaction_id;
  const listingId = intent.metadata?.listing_id;

  if (!transactionId || !listingId) return;

  // Only a fully canceled PaymentIntent is terminal. A `requires_payment_method`
  // status (the default after a decline) means the buyer can still retry.
  if (intent.status !== "canceled") {
    return;
  }

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
