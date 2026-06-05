import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { finalizePaidTransaction } from "@/lib/stripe/post-payment";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExpiredTransaction = {
  id: string;
  listing_id: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
};

type StripeCheckResult = "expire" | "keep";

function getChargeIdFromPaymentIntent(
  intent: Stripe.PaymentIntent,
): string | null {
  return typeof intent.latest_charge === "string"
    ? intent.latest_charge
    : (intent.latest_charge?.id ?? null);
}

async function reconcileExpiredStripePayment(
  transaction: ExpiredTransaction,
): Promise<StripeCheckResult> {
  const stripe = getStripe();

  if (transaction.stripe_payment_intent_id) {
    const intent = await stripe.paymentIntents.retrieve(
      transaction.stripe_payment_intent_id,
      { expand: ["latest_charge"] },
    );

    if (intent.status === "succeeded") {
      await finalizePaidTransaction(transaction.id, {
        paymentIntentId: intent.id,
        chargeId: getChargeIdFromPaymentIntent(intent),
      });
      return "keep";
    }

    // A processing PaymentIntent can still become succeeded. Keep the lock and
    // let the webhook (or a later cron run) settle it instead of reopening the
    // listing while money may still move.
    if (intent.status === "processing") {
      return "keep";
    }

    if (intent.status !== "canceled") {
      await stripe.paymentIntents.cancel(intent.id);
    }
    return "expire";
  }

  if (transaction.stripe_checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(
      transaction.stripe_checkout_session_id,
      { expand: ["payment_intent.latest_charge"] },
    );

    if (session.payment_status === "paid") {
      const paymentIntent =
        typeof session.payment_intent === "object" &&
        session.payment_intent !== null
          ? session.payment_intent
          : null;
      const paymentIntentId =
        paymentIntent?.id ??
        (typeof session.payment_intent === "string"
          ? session.payment_intent
          : null);
      await finalizePaidTransaction(transaction.id, {
        paymentIntentId,
        chargeId: paymentIntent
          ? getChargeIdFromPaymentIntent(paymentIntent)
          : null,
      });
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
      return NextResponse.json({ released: 0 });
    }

    const releasable: ExpiredTransaction[] = [];
    let finalized = 0;
    let skipped = 0;

    for (const transaction of expired as ExpiredTransaction[]) {
      if (
        !transaction.stripe_checkout_session_id &&
        !transaction.stripe_payment_intent_id
      ) {
        releasable.push(transaction);
        continue;
      }

      try {
        const result = await reconcileExpiredStripePayment(transaction);
        if (result === "expire") {
          releasable.push(transaction);
        } else {
          finalized += 1;
        }
      } catch (err) {
        skipped += 1;
        console.error(
          `Cron release-expired skipped Stripe-backed transaction ${transaction.id}:`,
          err,
        );
      }
    }

    if (releasable.length === 0) {
      return NextResponse.json({ released: 0, finalized, skipped });
    }

    const transactionIds = releasable.map((t) => t.id);
    const listingIds = [...new Set(releasable.map((t) => t.listing_id))];

    const { error: txError } = await admin
      .from("transactions")
      .update({ status: "EXPIRED" })
      .in("id", transactionIds)
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

    return NextResponse.json({
      released: releasable.length,
      finalized,
      skipped,
    });
  } catch (err) {
    console.error("Cron release-expired error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
