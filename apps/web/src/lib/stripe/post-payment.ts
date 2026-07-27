import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";
import { enqueueNotification } from "@/lib/notifications/outbox";

type AdminClient = ReturnType<typeof createAdminClient>;

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

export async function finalizePaidTransaction(
  transactionId: string,
  stripeIds?: StripeFinalizeIds,
): Promise<"PAID" | "ALREADY_PROCESSED" | "NOT_FOUND"> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("finalize_paid_transaction", {
    p_transaction_id: transactionId,
    p_stripe_payment_intent_id: stripeIds?.paymentIntentId ?? undefined,
    p_stripe_charge_id: stripeIds?.chargeId ?? undefined,
  });

  if (error) throw error;
  return data as "PAID" | "ALREADY_PROCESSED" | "NOT_FOUND";
}

/**
 * Replays all non-financial effects for a paid transaction. Every enqueue has
 * a deterministic key, so a crash can be retried by the financial outbox
 * worker without duplicating messages, emails, or push notifications.
 */
export async function processPaidTransactionEffects(
  transactionId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: transaction, error } = await admin
    .from("transactions")
    .select(
      "id, buyer_id, seller_id, listing_id, total_amount, fee_amount, shipping_cost, status",
    )
    .eq("id", transactionId)
    .single();

  if (error || !transaction) {
    throw error ?? new Error(`Transaction ${transactionId} not found`);
  }

  if (transaction.status === "REFUNDED" || transaction.status === "CANCELLED") {
    return;
  }

  if (!["PAID", "SHIPPED", "COMPLETED"].includes(transaction.status ?? "")) {
    throw new Error(
      `Transaction ${transactionId} is not paid (status=${transaction.status})`,
    );
  }

  const conversation = await findOrCreateConversation(admin, {
    listingId: transaction.listing_id,
    buyerId: transaction.buyer_id,
    sellerId: transaction.seller_id,
  });

  if (!conversation) {
    throw new Error(`Unable to create conversation for ${transactionId}`);
  }

  const messageResult = await enqueueNotification(admin, {
    channel: "in_app",
    recipientUserId: transaction.buyer_id,
    idempotencyKey: `payment-message:${transactionId}`,
    payload: {
      conversationId: conversation.id,
      senderId: transaction.buyer_id,
      content:
        "Paiement confirmé ✅ Votre achat est validé et le vendeur vient d'être notifié. " +
        "Prochaine étape : le vendeur prépare puis expédie la carte. Vous serez prévenu ici dès l'expédition, " +
        "puis vous pourrez confirmer la réception du colis pour finaliser la transaction.",
      messageType: "payment_completed",
      metadata: { transaction_id: transactionId },
    },
  });
  if (!messageResult.ok) {
    throw new Error(`Unable to enqueue payment message for ${transactionId}`);
  }

  await enqueueTransactionNotifications(
    admin,
    {
      buyer_id: transaction.buyer_id,
      seller_id: transaction.seller_id,
      total_amount: transaction.total_amount,
      fee_amount: transaction.fee_amount,
      shipping_cost: transaction.shipping_cost ?? 0,
      listing_id: transaction.listing_id,
    },
    transactionId,
    conversation.id,
  );
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
  if (createError.code !== "23505") throw createError;

  const { data: afterConflict, error: lookupError } = await lookup();
  if (lookupError) throw lookupError;
  return afterConflict ?? null;
}

async function enqueueTransactionNotifications(
  admin: AdminClient,
  transaction: {
    buyer_id: string;
    seller_id: string;
    total_amount: number;
    fee_amount: number;
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
    transaction.total_amount - transaction.fee_amount,
  );

  if (buyerEmail) {
    const result = await enqueueNotification(admin, {
      channel: "email",
      recipientUserId: transaction.buyer_id,
      idempotencyKey: `payment-email-buyer:${transactionId}`,
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
    if (!result.ok) throw new Error("Unable to enqueue buyer email");
  }

  if (sellerEmail) {
    const result = await enqueueNotification(admin, {
      channel: "email",
      recipientUserId: transaction.seller_id,
      idempotencyKey: `payment-email-seller:${transactionId}`,
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
    if (!result.ok) throw new Error("Unable to enqueue seller email");
  }

  const pushResult = await enqueueNotification(admin, {
    channel: "push",
    recipientUserId: transaction.seller_id,
    idempotencyKey: `payment-push-seller:${transactionId}`,
    payload: {
      title: "Paiement reçu 💰",
      body: "L'acheteur a payé — expédiez le colis !",
      url: `/messages/${conversationId ?? ""}`,
      category: "commerce",
    },
  });
  if (!pushResult.ok) throw new Error("Unable to enqueue seller push");
}
