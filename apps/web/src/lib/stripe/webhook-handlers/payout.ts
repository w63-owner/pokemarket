import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { sendPushNotification } from "@/lib/push/send";
import { persistPayoutStatus } from "@/lib/stripe/execute-payout";
import { createAdminClient } from "@/lib/supabase/admin";

export async function handlePayoutUpdated(
  payout: Stripe.Payout,
  connectedAccountId: string | null,
): Promise<void> {
  const persisted = await persistPayoutStatus(payout);
  if (!persisted) {
    Sentry.captureMessage(
      `Unmatched payout event (payout=${payout.id}, account=${connectedAccountId})`,
      { level: "warning" },
    );
  }
}

export async function handlePayoutFailed(
  payout: Stripe.Payout,
  connectedAccountId: string | null,
): Promise<void> {
  await handlePayoutUpdated(payout, connectedAccountId);

  const sellerId = await resolveSellerId(payout, connectedAccountId);
  if (!sellerId) return;

  Sentry.captureMessage(
    `Payout failed: ${payout.id} user=${sellerId} reason=${payout.failure_message ?? payout.failure_code}`,
    { level: "warning", tags: { kind: "stripe_payout", action: "failed" } },
  );
  void sendPushNotification(
    sellerId,
    "Virement échoué",
    "Tes fonds restent disponibles. Vérifie tes coordonnées bancaires dans Stripe avant de relancer.",
    "/wallet",
  ).catch((cause) => Sentry.captureException(cause));
}

export async function handlePayoutCanceled(
  payout: Stripe.Payout,
  connectedAccountId: string | null,
): Promise<void> {
  await handlePayoutUpdated(payout, connectedAccountId);

  const sellerId = await resolveSellerId(payout, connectedAccountId);
  if (!sellerId) return;

  void sendPushNotification(
    sellerId,
    "Virement annulé",
    "Le montant a été remis dans ton solde disponible.",
    "/wallet",
  ).catch((cause) => Sentry.captureException(cause));
}

export async function handlePayoutPaid(
  payout: Stripe.Payout,
  connectedAccountId: string | null,
): Promise<void> {
  await handlePayoutUpdated(payout, connectedAccountId);

  const sellerId = await resolveSellerId(payout, connectedAccountId);
  if (!sellerId) return;

  const amountEur = payout.amount / 100;
  void sendPushNotification(
    sellerId,
    "Virement reçu 💸",
    `${amountEur.toFixed(2)} € sont arrivés sur ton compte bancaire.`,
    "/wallet",
  ).catch((cause) => Sentry.captureException(cause));
}

async function resolveSellerId(
  payout: Stripe.Payout,
  connectedAccountId: string | null,
): Promise<string | null> {
  const metadataUserId =
    typeof payout.metadata?.user_id === "string"
      ? payout.metadata.user_id
      : null;
  if (metadataUserId) return metadataUserId;

  const admin = createAdminClient();
  const payoutRecordId =
    typeof payout.metadata?.payout_record_id === "string"
      ? payout.metadata.payout_record_id
      : null;
  if (payoutRecordId) {
    const { data } = await admin
      .from("payouts")
      .select("user_id")
      .eq("id", payoutRecordId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  if (connectedAccountId) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_account_id", connectedAccountId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  Sentry.captureMessage(
    `Payout without identifiable seller (payout=${payout.id}, account=${connectedAccountId})`,
    { level: "error" },
  );
  return null;
}
