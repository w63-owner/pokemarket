import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";
import { calcPriceSeller } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";
import { enqueueNotification } from "@/lib/notifications/outbox";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Side-effects that must run exactly once after a checkout session is paid:
 *   - Mark transaction as PAID, mark listing SOLD, credit seller wallet, and
 *     expire competing offers in one SQL transaction
 *   - Insert "payment_completed" system message in the conversation
 *   - Enqueue buyer + seller emails and the seller push into the durable
 *     notifications outbox (drained + retried by a cron — see outbox.ts)
 *
 * Called from BOTH the Stripe webhook AND the success page reconcile path so
 * the user receives their confirmation regardless of which path lands first.
 *
 * Concurrency model: the financial side-effects run inside
 * `finalize_paid_transaction_core`, which locks the transaction row. Only the
 * caller that sees PENDING_PAYMENT performs the irreversible writes; concurrent
 * callers return ALREADY_PROCESSED without crediting twice.
 */
/**
 * Optional Stripe identifiers captured from the Checkout Session. Passing
 * them lets us index transactions by Payment Intent / Charge so that
 * downstream `charge.refunded` and `charge.dispute.*` webhooks (which only
 * carry charge IDs, not session IDs) can look the row up.
 */
export type StripeFinalizeIds = {
  paymentIntentId: string | null;
  chargeId: string | null;
};

type FinalizeCoreRow = {
  result: "PAID" | "ALREADY_PROCESSED" | "NOT_FOUND";
  id: string | null;
  listing_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  total_amount: number | null;
  shipping_cost: number | null;
};

export async function finalizePaidTransaction(
  transactionId: string,
  stripeIds?: StripeFinalizeIds,
): Promise<"PAID" | "ALREADY_PROCESSED" | "NOT_FOUND"> {
  const admin = createAdminClient();

  const { data: finalizedRows, error: finalizeError } = await admin.rpc(
    "finalize_paid_transaction_core",
    {
      p_transaction_id: transactionId,
      p_payment_intent_id: stripeIds?.paymentIntentId ?? null,
      p_charge_id: stripeIds?.chargeId ?? null,
    },
  );

  if (finalizeError) throw finalizeError;

  const finalized = finalizedRows?.[0] as FinalizeCoreRow | undefined;
  if (!finalized || finalized.result === "NOT_FOUND") return "NOT_FOUND";
  if (finalized.result === "ALREADY_PROCESSED") return "ALREADY_PROCESSED";

  if (
    !finalized.id ||
    !finalized.listing_id ||
    !finalized.buyer_id ||
    !finalized.seller_id ||
    finalized.total_amount == null
  ) {
    throw new Error(
      `finalize_paid_transaction_core returned incomplete payload for ${transactionId}`,
    );
  }

  const transaction = {
    id: finalized.id,
    listing_id: finalized.listing_id,
    buyer_id: finalized.buyer_id,
    seller_id: finalized.seller_id,
    total_amount: Number(finalized.total_amount),
    shipping_cost: Number(finalized.shipping_cost ?? 0),
  };

  // NOTE: revalidatePath() is intentionally NOT called here. This function is
  // invoked from BOTH the Stripe webhook (a route handler — safe) and the
  // /orders/:id/success page (a Server Component render — `revalidatePath`
  // throws there in Next 16). Each caller is responsible for its own cache
  // invalidation: the webhook revalidates `/listing/:id` after this returns;
  // the success page doesn't need to (the listing detail page reloads fresh on
  // next navigation, and the buyer's own `/orders/:id` is the page being
  // rendered).

  // Find (or create) the buyer↔seller conversation for this listing so we
  // always have a thread in which to drop the payment confirmation +
  // next-steps system message — even when the buyer purchased without ever
  // messaging the seller first (e.g. a straight "Acheter" with no prior chat).
  const conversation = await findOrCreateConversation(admin, {
    listingId: transaction.listing_id,
    buyerId: transaction.buyer_id,
    sellerId: transaction.seller_id,
  });

  if (conversation) {
    const { error: msgError } = await admin.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: transaction.buyer_id,
      content:
        "Paiement confirmé ✅ Votre achat est validé et le vendeur vient d'être notifié. " +
        "Prochaine étape : le vendeur prépare puis expédie la carte. Vous serez prévenu ici dès l'expédition, " +
        "puis vous pourrez confirmer la réception du colis pour finaliser la transaction.",
      message_type: "payment_completed",
      metadata: { transaction_id: transactionId },
    });
    if (msgError) throw msgError;
  }

  // Soft channels (push + email) go through the durable outbox. The whole
  // block is best-effort: the transaction is already PAID and the in-app
  // system message above is our strong guarantee, so a failure to enqueue
  // (or to gather render data) must NOT roll back or fail finalization — we
  // capture it and return PAID anyway.
  try {
    await enqueueTransactionNotifications(
      admin,
      {
        buyer_id: transaction.buyer_id,
        seller_id: transaction.seller_id,
        total_amount: transaction.total_amount,
        shipping_cost: transaction.shipping_cost ?? 0,
        listing_id: transaction.listing_id,
      },
      transactionId,
      conversation?.id ?? null,
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: "notifications-outbox" },
      extra: { context: "finalizePaidTransaction", transactionId },
    });
    console.error(
      "[finalizePaidTransaction] Failed to enqueue notifications:",
      err,
    );
  }

  return "PAID";
}

/**
 * Atomically finds the existing buyer↔seller conversation for a listing or
 * creates it. Mirrors the `upsert_conversation` RPC but runs under the admin
 * client (no auth context). The `(listing_id, buyer_id, seller_id)` unique
 * constraint makes the INSERT race-safe: a concurrent caller that wins the
 * race triggers a conflict here, after which we re-read the now-existing row.
 */
async function findOrCreateConversation(
  admin: AdminClient,
  params: { listingId: string; buyerId: string; sellerId: string },
): Promise<{ id: string } | null> {
  const lookup = () =>
    admin
      .from("conversations")
      .select("id")
      .eq("listing_id", params.listingId)
      .eq("buyer_id", params.buyerId)
      .eq("seller_id", params.sellerId)
      .maybeSingle();

  const { data: existing } = await lookup();
  if (existing) return existing;

  const { data: created, error: createError } = await admin
    .from("conversations")
    .insert({
      listing_id: params.listingId,
      buyer_id: params.buyerId,
      seller_id: params.sellerId,
    })
    .select("id")
    .single();

  if (!createError) return created;

  // Conflict (or any transient insert failure): fall back to a fresh read so
  // we still surface the conversation a concurrent path may have just made.
  const { data: afterConflict } = await lookup();
  return afterConflict ?? null;
}

async function enqueueTransactionNotifications(
  admin: AdminClient,
  transaction: {
    buyer_id: string;
    seller_id: string;
    total_amount: number;
    shipping_cost: number;
    listing_id: string;
  },
  transactionId: string,
  conversationId: string | null,
) {
  const [buyerAuth, sellerAuth, listing] = await Promise.all([
    admin.auth.admin.getUserById(transaction.buyer_id),
    admin.auth.admin.getUserById(transaction.seller_id),
    admin
      .from("listings")
      .select("title, cover_image_url")
      .eq("id", transaction.listing_id)
      .single(),
  ]);

  const buyerEmail = buyerAuth.data.user?.email;
  const sellerEmail = sellerAuth.data.user?.email;
  const title = listing.data?.title ?? "Carte Pokemon";
  const coverUrl = listing.data?.cover_image_url ?? null;

  const [{ data: buyerProfile }, { data: sellerProfile }] = await Promise.all([
    admin
      .from("profiles")
      .select("username")
      .eq("id", transaction.buyer_id)
      .single(),
    admin
      .from("profiles")
      .select("username")
      .eq("id", transaction.seller_id)
      .single(),
  ]);

  const totalFormatted = formatPrice(transaction.total_amount);
  const sellerNet = formatPrice(
    calcPriceSeller(transaction.total_amount - transaction.shipping_cost),
  );

  if (buyerEmail) {
    await enqueueNotification(admin, {
      channel: "email",
      recipientUserId: transaction.buyer_id,
      payload: {
        template: "order-confirmation",
        to: buyerEmail,
        subject: `Confirmation de commande — ${title}`,
        data: {
          buyerName: buyerProfile?.username ?? "Dresseur",
          listingTitle: title,
          totalAmount: totalFormatted,
          orderId: transactionId,
          coverImageUrl: coverUrl,
        },
      },
    });
  }

  if (sellerEmail) {
    await enqueueNotification(admin, {
      channel: "email",
      recipientUserId: transaction.seller_id,
      payload: {
        template: "sale-notification",
        to: sellerEmail,
        subject: `Vous avez vendu ${title} !`,
        data: {
          sellerName: sellerProfile?.username ?? "Vendeur",
          listingTitle: title,
          saleAmount: sellerNet,
          orderId: transactionId,
          coverImageUrl: coverUrl,
        },
      },
    });
  }

  await enqueueNotification(admin, {
    channel: "push",
    recipientUserId: transaction.seller_id,
    payload: {
      title: "Paiement reçu 💰",
      body: "L'acheteur a payé — expédiez le colis !",
      url: `/messages/${conversationId ?? ""}`,
      category: "commerce",
    },
  });
}
