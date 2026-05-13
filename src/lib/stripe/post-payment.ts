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
 * Concurrency model: critical database side-effects run inside the
 * `finalize_paid_transaction` RPC under a row lock. The single caller that
 * transitions PENDING_PAYMENT -> PAID performs the DB writes; later callers get
 * ALREADY_PROCESSED and skip best-effort notifications.
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

  // All critical DB side effects happen in one Postgres transaction. This
  // avoids the old failure mode where the row was marked PAID before the seller
  // wallet credit, then retries short-circuited forever.
  const { data: result, error: finalizeError } = await admin.rpc(
    "finalize_paid_transaction",
    { p_transaction_id: transactionId },
  );

  if (finalizeError) throw finalizeError;
  if (result === "NOT_FOUND" || result === "ALREADY_PROCESSED") return result;
  if (result !== "PAID") {
    throw new Error(`Unexpected finalize_paid_transaction result: ${result}`);
  }

  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("listing_id", transaction.listing_id)
    .eq("buyer_id", transaction.buyer_id)
    .eq("seller_id", transaction.seller_id)
    .maybeSingle();

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
