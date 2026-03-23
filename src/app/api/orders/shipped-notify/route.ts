import { NextResponse } from "next/server";
import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/emails/send";
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
    .select("buyer_id, listing_id, tracking_number, tracking_url")
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
    const [buyerAuth, listing, buyerProfile] = await Promise.all([
      admin.auth.admin.getUserById(tx.buyer_id),
      admin.from("listings").select("title").eq("id", tx.listing_id).single(),
      admin.from("profiles").select("username").eq("id", tx.buyer_id).single(),
    ]);

    const buyerEmail = buyerAuth.data.user?.email;
    if (!buyerEmail) {
      return NextResponse.json({ sent: false, reason: "no_email" });
    }

    const title = listing.data?.title ?? "Carte Pokemon";

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

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("[shipped-notify] Failed:", err);
    return NextResponse.json({ sent: false });
  }
}
