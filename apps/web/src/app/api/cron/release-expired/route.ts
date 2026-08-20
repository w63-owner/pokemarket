import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  reconcileCheckoutSession,
  reconcilePaymentIntent,
} from "@/lib/stripe/reconcile";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PendingExpiredTransaction = {
  id: string;
  listing_id: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
};

/**
 * After reconcile confirms the Stripe object is still unpaid, kill it before
 * we flip the DB row to EXPIRED and unlock the listing.
 *
 * Mobile PaymentIntents do not inherit Checkout Session `expires_at`, so
 * without an explicit cancel the client_secret remains payable for hours
 * after the marketplace lock is released. A late confirmation would charge
 * the buyer while `finalize_paid_transaction` no-ops on EXPIRED — money
 * taken with no order, and a second buyer can purchase the same card.
 *
 * Returns `"keep"` when money may still move (`processing`) or a race
 * shows the object already paid — leave the lock for the next reconcile.
 */
async function terminateUnpaidStripeObjects(
  transaction: PendingExpiredTransaction,
): Promise<"expire" | "keep"> {
  const stripe = getStripe();

  if (transaction.stripe_payment_intent_id) {
    const intent = await stripe.paymentIntents.retrieve(
      transaction.stripe_payment_intent_id,
    );

    if (intent.status === "succeeded") {
      return "keep";
    }

    // SEPA / async methods can sit in `processing` past the lock window.
    // Unlocking here would relist a card that may still settle.
    if (intent.status === "processing") {
      return "keep";
    }

    if (intent.status !== "canceled") {
      await stripe.paymentIntents.cancel(intent.id);
    }
  }

  if (transaction.stripe_checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(
      transaction.stripe_checkout_session_id,
    );

    if (session.payment_status === "paid") {
      return "keep";
    }

    if (session.status === "open") {
      await stripe.checkout.sessions.expire(session.id);
    }
  }

  return "expire";
}

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const { data: expired, error: fetchError } = await admin
      .from("transactions")
      .select(
        "id, listing_id, stripe_checkout_session_id, stripe_payment_intent_id",
      )
      .eq("status", "PENDING_PAYMENT")
      .lt("expiration_date", new Date().toISOString());

    if (fetchError) throw fetchError;
    if (!expired || expired.length === 0) {
      return NextResponse.json({ released: 0, recovered: 0 });
    }

    // CRITICAL: never expire a transaction that Stripe actually charged. The
    // webhook can lag or be lost, and the buyer may never hit the success page
    // (closed tab, mobile background). Expiring such a row would relist a card
    // the buyer already paid for. So we re-check Stripe first and finalize any
    // truly-paid transaction instead of expiring it.
    const toExpire: PendingExpiredTransaction[] = [];
    let recovered = 0;

    for (const tx of expired as PendingExpiredTransaction[]) {
      try {
        let status: string = "PENDING_PAYMENT";
        if (tx.stripe_checkout_session_id) {
          status = await reconcileCheckoutSession(
            tx.id,
            tx.stripe_checkout_session_id,
          );
        } else if (tx.stripe_payment_intent_id) {
          status = await reconcilePaymentIntent(
            tx.id,
            tx.stripe_payment_intent_id,
          );
        }

        if (status === "PAID" || status === "ALREADY_PROCESSED") {
          // The buyer paid after all — finalized by reconcile. Leave it alone.
          recovered++;
          continue;
        }

        // Only terminate Stripe objects we already looked up as unpaid.
        // Rows with no Stripe id (failed mid-checkout) can expire directly.
        if (tx.stripe_checkout_session_id || tx.stripe_payment_intent_id) {
          const decision = await terminateUnpaidStripeObjects(tx);
          if (decision === "keep") {
            continue;
          }
        }
      } catch (err) {
        // Stripe lookup / cancel failed — be conservative and DON'T expire
        // this round. We'll retry on the next cron tick rather than risk
        // relisting a paid card or leaving a payable PI against an EXPIRED row.
        Sentry.captureException(err, {
          extra: {
            context: "release_expired_reconcile",
            transaction_id: tx.id,
          },
        });
        continue;
      }

      toExpire.push(tx);
    }

    if (toExpire.length === 0) {
      return NextResponse.json({ released: 0, recovered });
    }

    const transactionIds = toExpire.map((t) => t.id);
    const listingIds = [...new Set(toExpire.map((t) => t.listing_id))];

    const { error: txError } = await admin
      .from("transactions")
      .update({ status: "EXPIRED" })
      .in("id", transactionIds)
      // Guard against a TOCTOU race: only expire rows still PENDING_PAYMENT
      // (a concurrent webhook/reconcile may have flipped one to PAID).
      .eq("status", "PENDING_PAYMENT");

    if (txError) throw txError;

    for (const listingId of listingIds) {
      const { data: acceptedOffer } = await admin
        .from("offers")
        .select("id")
        .eq("listing_id", listingId)
        .eq("status", "ACCEPTED")
        .maybeSingle();

      const newStatus = acceptedOffer ? "RESERVED" : "ACTIVE";

      await admin
        .from("listings")
        .update({ status: newStatus })
        .eq("id", listingId)
        .eq("status", "LOCKED");
    }

    return NextResponse.json({ released: toExpire.length, recovered });
  } catch (err) {
    console.error("Cron release-expired error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
