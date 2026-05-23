import { NextResponse } from "next/server";
import { createElement } from "react";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/emails/send";
import { sendPushNotification } from "@/lib/push/send";
import OrderShippedEmail from "@/emails/order-shipped";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { transaction_id } = await request.json();
  if (!transaction_id) {
    return NextResponse.json(
      { error: "transaction_id requis" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: tx } = await admin
    .from("transactions")
    .select("buyer_id, seller_id, listing_id, tracking_number, tracking_url")
    .eq("id", transaction_id)
    .eq("seller_id", user.id)
    .eq("status", "SHIPPED")
    .single();

  if (!tx) {
    return NextResponse.json(
      { error: "Transaction introuvable" },
      { status: 404 },
    );
  }

  try {
    const [buyerAuth, listing, buyerProfile, conversation] = await Promise.all([
      admin.auth.admin.getUserById(tx.buyer_id),
      admin.from("listings").select("title").eq("id", tx.listing_id).single(),
      admin.from("profiles").select("username").eq("id", tx.buyer_id).single(),
      admin
        .from("conversations")
        .select("id")
        .eq("listing_id", tx.listing_id)
        .eq("buyer_id", tx.buyer_id)
        .eq("seller_id", tx.seller_id)
        .maybeSingle(),
    ]);

    const buyerEmail = buyerAuth.data.user?.email;
    const title = listing.data?.title ?? "Carte Pokemon";

    if (buyerEmail) {
      sendEmail(
        buyerEmail,
        `Votre carte ${title} est en route !`,
        createElement(OrderShippedEmail, {
          buyerName: buyerProfile.data?.username ?? "Dresseur",
          listingTitle: title,
          trackingNumber: tx.tracking_number ?? "",
          trackingUrl: tx.tracking_url,
          orderId: transaction_id,
        }),
      );
    }

    // Notify the buyer in real-time. Deep-link to the conversation when we
    // have one so the buyer lands directly on the tracking info / actions.
    sendPushNotification(
      tx.buyer_id,
      "Votre commande est en route ! 📦",
      `${title} a été expédiée par le vendeur.`,
      conversation.data?.id
        ? `/messages/${conversation.data.id}`
        : `/orders/${transaction_id}`,
    ).catch((err) => Sentry.captureException(err));

    return NextResponse.json({ sent: true, email: !!buyerEmail });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[shipped-notify] Failed:", err);
    return NextResponse.json({ sent: false });
  }
}
