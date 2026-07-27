import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { getStripeEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveStripeRecipientAccount } from "@/lib/stripe/connect-account";
import { getStripe } from "@/lib/stripe/server";
import { handleAccountUpdated } from "@/lib/stripe/webhook-handlers/account-updated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECIPIENT_EVENT_TYPES = new Set([
  "v2.core.account.created",
  "v2.core.account.updated",
  "v2.core.account[configuration.recipient].updated",
  "v2.core.account[configuration.recipient].capability_status_updated",
  "v2.core.account[requirements].updated",
]);

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
  let event;
  try {
    event = stripe.parseEventNotification(
      body,
      signature,
      getStripeEnv().connectWebhookSecret,
    );
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error: claimError } = await admin
    .from("stripe_webhooks_processed")
    .insert({ stripe_event_id: event.id });

  if (claimError) {
    if (claimError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json(
      { error: "Idempotency check failed" },
      { status: 500 },
    );
  }

  try {
    if (RECIPIENT_EVENT_TYPES.has(event.type)) {
      if (!("related_object" in event)) {
        throw new Error(`Missing related object for ${event.type}`);
      }
      const accountId = event.related_object?.id;
      if (!accountId) {
        throw new Error(`Missing related account for ${event.type}`);
      }
      const account = await retrieveStripeRecipientAccount(accountId);
      await handleAccountUpdated(account);
    }
  } catch (error) {
    await admin
      .from("stripe_webhooks_processed")
      .delete()
      .eq("stripe_event_id", event.id);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
