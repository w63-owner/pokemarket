import { revalidatePath } from "next/cache";
import { createElement } from "react";
import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";
import { calcPriceSeller } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";
import { sendEmail } from "@/lib/emails/send";
import { sendPushNotification } from "@/lib/push/send";
import OrderConfirmationEmail from "@/emails/order-confirmation";
import SaleNotificationEmail from "@/emails/sale-notification";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Side-effects that must run exactly once after a checkout session is paid:
 *   - Mark transaction as PAID (atomic transition guard)
 *   - Mark listing as SOLD
 *   - Credit seller wallet pending_balance
 *   - Expire all other PENDING offers on this listing
 *   - Insert "payment_completed" system message in the conversation
 *   - Send buyer + seller emails (best-effort)
 *   - Send push notification to seller (best-effort)
 *
 * Called from BOTH the Stripe webhook AND the success page reconcile path so
 * the user receives their confirmation regardless of which path lands first.
 *
 * Concurrency model: the side-effects (wallet credit, message insert) are
 * only run by the caller that successfully transitions PENDING_PAYMENT → PAID.
 * Any concurrent caller will see the row already PAID and short-circuit with
 * ALREADY_PROCESSED, guaranteeing exactly-once execution under contention.
 *
 * Known limitation: if the winner crashes between the PAID transition and the
 * end of side-effects, partial state can result. Stripe webhook idempotency
 * (`stripe_webhooks_processed`) prevents auto-retry by us; recovery is
 * possible via the success page reconcile path or a future ledger-based
 * recovery cron. Tracked as a follow-up — see audit report.
 */
export async function finalizePaidTransaction(
  transactionId: string,
): Promise<"PAID" | "ALREADY_PROCESSED" | "NOT_FOUND"> {
  const admin = createAdminClient();

  const { data: transaction, error: txFetchError } = await admin
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (txFetchError || !transaction) return "NOT_FOUND";
  if (transaction.status !== "PENDING_PAYMENT") return "ALREADY_PROCESSED";

  // Atomic transition guard — only one caller wins this race. The losing
  // callers (e.g. webhook + reconcile firing simultaneously) will receive
  // 0 rows and bail out without re-running any side-effects.
  const { data: updated, error: txUpdateError } = await admin
    .from("transactions")
    .update({ status: "PAID" })
    .eq("id", transactionId)
    .eq("status", "PENDING_PAYMENT")
    .select("id");

  if (txUpdateError) throw txUpdateError;
  if (!updated || updated.length === 0) return "ALREADY_PROCESSED";

  // ── From here on we are the EXCLUSIVE owner of this transaction's
  //    side-effects. Every step throws on error so a failure surfaces to
  //    the caller (webhook returns 500, success page surfaces an error).

  const { error: listingUpdateError } = await admin
    .from("listings")
    .update({ status: "SOLD" })
    .eq("id", transaction.listing_id);
  if (listingUpdateError) throw listingUpdateError;

  revalidatePath(`/listing/${transaction.listing_id}`);

  const sellerNet = calcPriceSeller(
    transaction.total_amount - (transaction.shipping_cost ?? 0),
  );

  const { data: wallet, error: walletReadError } = await admin
    .from("wallets")
    .select("pending_balance")
    .eq("user_id", transaction.seller_id)
    .single();
  if (walletReadError && walletReadError.code !== "PGRST116") {
    throw walletReadError;
  }

  if (wallet) {
    const newPending =
      Math.round((Number(wallet.pending_balance) + sellerNet) * 100) / 100;
    const { error: walletWriteError } = await admin
      .from("wallets")
      .update({ pending_balance: newPending })
      .eq("user_id", transaction.seller_id);
    if (walletWriteError) throw walletWriteError;
  }

  const { error: offerExpireError } = await admin
    .from("offers")
    .update({ status: "EXPIRED" })
    .eq("listing_id", transaction.listing_id)
    .eq("status", "PENDING");
  if (offerExpireError) throw offerExpireError;

  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("listing_id", transaction.listing_id)
    .eq("buyer_id", transaction.buyer_id)
    .eq("seller_id", transaction.seller_id)
    .maybeSingle();

  if (conversation) {
    const { error: msgError } = await admin.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: transaction.buyer_id,
      content: "Paiement confirmé ! La commande est en attente d'expédition.",
      message_type: "payment_completed",
      metadata: { transaction_id: transactionId },
    });
    if (msgError) throw msgError;
  }

  await sendTransactionEmails(
    admin,
    {
      buyer_id: transaction.buyer_id,
      seller_id: transaction.seller_id,
      total_amount: transaction.total_amount,
      shipping_cost: transaction.shipping_cost ?? 0,
      listing_id: transaction.listing_id,
    },
    transactionId,
  );

  sendPushNotification(
    transaction.seller_id,
    "Paiement reçu 💰",
    "L'acheteur a payé — expédiez le colis !",
    `/messages/${conversation?.id ?? ""}`,
  ).catch((err) => Sentry.captureException(err));

  return "PAID";
}

async function sendTransactionEmails(
  admin: AdminClient,
  transaction: {
    buyer_id: string;
    seller_id: string;
    total_amount: number;
    shipping_cost: number;
    listing_id: string;
  },
  transactionId: string,
) {
  try {
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
    const coverUrl = listing.data?.cover_image_url ?? undefined;

    const [{ data: buyerProfile }, { data: sellerProfile }] = await Promise.all(
      [
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
      ],
    );

    const totalFormatted = formatPrice(transaction.total_amount);
    const sellerNet = formatPrice(
      calcPriceSeller(transaction.total_amount - transaction.shipping_cost),
    );

    if (buyerEmail) {
      sendEmail(
        buyerEmail,
        `Confirmation de commande — ${title}`,
        createElement(OrderConfirmationEmail, {
          buyerName: buyerProfile?.username ?? "Dresseur",
          listingTitle: title,
          totalAmount: totalFormatted,
          orderId: transactionId,
          coverImageUrl: coverUrl,
        }),
      );
    }

    if (sellerEmail) {
      sendEmail(
        sellerEmail,
        `Vous avez vendu ${title} !`,
        createElement(SaleNotificationEmail, {
          sellerName: sellerProfile?.username ?? "Vendeur",
          listingTitle: title,
          saleAmount: sellerNet,
          orderId: transactionId,
          coverImageUrl: coverUrl,
        }),
      );
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error("[finalizePaidTransaction] Failed to send emails:", err);
  }
}
