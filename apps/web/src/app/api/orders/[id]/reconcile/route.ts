import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { getRequestUser } from "@/lib/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcilePaymentIntent } from "@/lib/stripe/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side reconcile endpoint for the mobile success page.
 *
 * The mobile checkout creates a Stripe PaymentIntent (not a Checkout
 * Session), so the web success-page reconcile path doesn't apply. The PAID
 * transition is normally driven by the `payment_intent.succeeded` webhook,
 * but webhooks can lag (or never arrive in local dev without
 * `stripe listen`), leaving the buyer's transaction stuck on PENDING_PAYMENT
 * even though Stripe confirmed the charge.
 *
 * The mobile success screen calls this endpoint once on mount: we look up
 * the PaymentIntent on Stripe, and if it succeeded we run the same
 * idempotent `finalizePaidTransaction` the webhook would have run. Safe to
 * call concurrently with the webhook — only one caller wins the atomic
 * PENDING_PAYMENT → PAID update, so side-effects run exactly once.
 *
 * Authn: buyer must own the transaction (we filter on `buyer_id = user.id`
 * before exposing any Stripe id), so a malicious caller can't reconcile
 * someone else's order.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user } = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id: transactionId } = await ctx.params;

  const admin = createAdminClient();
  const { data: transaction } = await admin
    .from("transactions")
    .select("id, status, stripe_payment_intent_id")
    .eq("id", transactionId)
    .eq("buyer_id", user.id)
    .single();

  if (!transaction) {
    return NextResponse.json(
      { error: "Transaction introuvable" },
      { status: 404 },
    );
  }

  // Nothing to do — either already finalised by the webhook, or in a terminal
  // state (CANCELLED, EXPIRED…) that reconcile shouldn't touch.
  if (transaction.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ status: transaction.status });
  }

  if (!transaction.stripe_payment_intent_id) {
    return NextResponse.json({ status: "PENDING_PAYMENT" });
  }

  try {
    const result = await reconcilePaymentIntent(
      transactionId,
      transaction.stripe_payment_intent_id,
    );
    const status =
      result === "PAID" || result === "ALREADY_PROCESSED"
        ? "PAID"
        : "PENDING_PAYMENT";
    return NextResponse.json({ status });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[orders/reconcile] failed:", err);
    return NextResponse.json(
      { error: "Réconciliation impossible" },
      { status: 500 },
    );
  }
}
