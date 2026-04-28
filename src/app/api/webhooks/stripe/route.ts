import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";

import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePaidTransaction } from "@/lib/stripe/post-payment";

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

  const result = await finalizePaidTransaction(transactionId);

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
