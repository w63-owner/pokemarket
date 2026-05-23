import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";
import { sendPushNotification } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { user } = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const { offer_id, conversation_id } = body as {
      offer_id?: string;
      conversation_id?: string;
    };

    if (!offer_id || !conversation_id) {
      return NextResponse.json(
        { error: "offer_id et conversation_id requis" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: offer, error: fetchError } = await admin
      .from("offers")
      .select(
        `
        id, offer_amount, buyer_id, listing_id, status,
        listing:listings!listing_id (id, title, seller_id)
      `,
      )
      .eq("id", offer_id)
      .single();

    if (fetchError || !offer) {
      return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
    }

    const listing = offer.listing as {
      id: string;
      title: string;
      seller_id: string;
    } | null;

    if (!listing) {
      return NextResponse.json(
        { error: "Annonce introuvable" },
        { status: 404 },
      );
    }

    if (listing.seller_id !== user.id) {
      return NextResponse.json(
        { error: "Seul le vendeur peut accepter une offre" },
        { status: 403 },
      );
    }

    // Atomic guard: only PENDING → ACCEPTED
    const { data: updated, error: offerError } = await admin
      .from("offers")
      .update({ status: "ACCEPTED" })
      .eq("id", offer_id)
      .eq("status", "PENDING")
      .select("id");

    if (offerError) throw offerError;
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "Cette offre ne peut plus être acceptée" },
        { status: 409 },
      );
    }

    const { error: listingError } = await admin
      .from("listings")
      .update({
        status: "RESERVED",
        reserved_for: offer.buyer_id,
        reserved_price: offer.offer_amount,
      })
      .eq("id", offer.listing_id);

    if (listingError) throw listingError;

    // Reject all other pending offers on this listing
    await admin
      .from("offers")
      .update({ status: "REJECTED" })
      .eq("listing_id", offer.listing_id)
      .eq("status", "PENDING")
      .neq("id", offer_id);

    const { error: msgError } = await admin.from("messages").insert({
      conversation_id,
      sender_id: user.id,
      content: `Offre de ${offer.offer_amount.toFixed(2)} € acceptée`,
      message_type: "offer_accepted",
      offer_id,
    });

    if (msgError) throw msgError;

    sendPushNotification(
      offer.buyer_id,
      "Offre acceptée ! 🎉",
      `Votre offre sur ${listing.title} a été acceptée. Finalisez votre achat.`,
      `/checkout/${offer.listing_id}`,
      { category: "offers" },
    ).catch((err) => Sentry.captureException(err));

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[offers/accept] Failed:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
