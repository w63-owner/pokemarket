import { NextResponse } from "next/server";
import { createElement } from "react";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcPriceSeller } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";
import { sendEmail } from "@/lib/emails/send";
import { sendPushNotification } from "@/lib/push/send";
import OrderConfirmationEmail from "@/emails/order-confirmation";
import SaleNotificationEmail from "@/emails/sale-notification";

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
          admin,
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
    console.error(`Error processing ${event.type}:`, err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  admin: AdminClient,
) {
  const transactionId = session.metadata?.transaction_id;
  const listingId = session.metadata?.listing_id;

  if (!transactionId || !listingId) {
    throw new Error("Missing transaction_id or listing_id in session metadata");
  }

  const { data: transaction, error: txFetchError } = await admin
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (txFetchError || !transaction) {
    throw new Error(`Transaction ${transactionId} not found`);
  }

  if (transaction.status !== "PENDING_PAYMENT") {
    console.warn(
      `Transaction ${transactionId} already in status ${transaction.status}, skipping`,
    );
    return;
  }

  const { error: txUpdateError } = await admin
    .from("transactions")
    .update({ status: "PAID" })
    .eq("id", transactionId);

  if (txUpdateError) throw txUpdateError;

  const { error: listingUpdateError } = await admin
    .from("listings")
    .update({ status: "SOLD" })
    .eq("id", listingId);

  if (listingUpdateError) throw listingUpdateError;

  const sellerNet = calcPriceSeller(
    transaction.total_amount - (transaction.shipping_cost ?? 0),
  );
  const { data: wallet } = await admin
    .from("wallets")
    .select("pending_balance")
    .eq("user_id", transaction.seller_id)
    .single();

  if (wallet) {
    const newPending =
      Math.round((Number(wallet.pending_balance) + sellerNet) * 100) / 100;

    await admin
      .from("wallets")
      .update({ pending_balance: newPending })
      .eq("user_id", transaction.seller_id);
  }

  await admin
    .from("offers")
    .update({ status: "EXPIRED" })
    .eq("listing_id", listingId)
    .eq("status", "PENDING");

  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", transaction.buyer_id)
    .eq("seller_id", transaction.seller_id)
    .maybeSingle();

  if (conversation) {
    await admin.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: transaction.buyer_id,
      content: "Paiement confirmé ! La commande est en attente d'expédition.",
      message_type: "payment_completed",
      metadata: { transaction_id: transactionId },
    });
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

  await sendPushNotification(
    transaction.seller_id,
    "Paiement reçu 💰",
    "L'acheteur a payé — expédiez le colis !",
    `/messages/${conversation?.id ?? ""}`,
  ).catch(() => {});
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
    console.error("[webhook] Failed to send transaction emails:", err);
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
