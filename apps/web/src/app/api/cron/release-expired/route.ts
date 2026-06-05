import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  reconcileCheckoutSession,
  reconcilePaymentIntent,
} from "@/lib/stripe/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const toExpire: { id: string; listing_id: string }[] = [];
    let recovered = 0;

    for (const tx of expired) {
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
      } catch (err) {
        // Stripe lookup failed — be conservative and DON'T expire this round.
        // We'll retry on the next cron tick rather than risk relisting a paid
        // card on a transient Stripe error.
        Sentry.captureException(err, {
          extra: {
            context: "release_expired_reconcile",
            transaction_id: tx.id,
          },
        });
        continue;
      }

      toExpire.push({ id: tx.id, listing_id: tx.listing_id });
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
