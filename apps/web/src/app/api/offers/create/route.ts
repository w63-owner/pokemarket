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
    const { listing_id, amount, conversation_id } = body as {
      listing_id?: string;
      amount?: number;
      conversation_id?: string;
    };

    if (!listing_id || typeof amount !== "number" || !conversation_id) {
      return NextResponse.json(
        { error: "listing_id, amount et conversation_id requis" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: listing, error: listingError } = await admin
      .from("listings")
      .select("id, title, seller_id, status")
      .eq("id", listing_id)
      .single();

    if (listingError || !listing) {
      return NextResponse.json(
        { error: "Annonce introuvable" },
        { status: 404 },
      );
    }

    if (listing.status !== "ACTIVE" && listing.status !== "RESERVED") {
      return NextResponse.json(
        { error: "Cette annonce n'est plus disponible" },
        { status: 400 },
      );
    }

    if (listing.seller_id === user.id) {
      return NextResponse.json(
        {
          error: "Vous ne pouvez pas faire une offre sur votre propre annonce",
        },
        { status: 400 },
      );
    }

    const { data: conv, error: convError } = await admin
      .from("conversations")
      .select("id, buyer_id, seller_id")
      .eq("id", conversation_id)
      .single();

    if (convError || !conv) {
      return NextResponse.json(
        { error: "Conversation introuvable" },
        { status: 404 },
      );
    }

    if (conv.buyer_id !== user.id && conv.seller_id !== user.id) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 },
      );
    }

    const { data: offer, error: offerError } = await admin
      .from("offers")
      .insert({
        listing_id,
        buyer_id: user.id,
        offer_amount: amount,
        status: "PENDING",
        conversation_id,
      })
      .select()
      .single();

    if (offerError) throw offerError;

    const { error: msgError } = await admin.from("messages").insert({
      conversation_id,
      sender_id: user.id,
      content: `Offre de ${amount.toFixed(2)} €`,
      message_type: "offer",
      offer_id: offer.id,
    });

    if (msgError) throw msgError;

    const { data: buyer } = await admin
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();

    sendPushNotification(
      listing.seller_id,
      `Nouvelle offre sur ${listing.title}`,
      `@${buyer?.username ?? "Un acheteur"} propose ${amount.toFixed(2)} €`,
      `/messages/${conversation_id}`,
      { category: "offers" },
    ).catch((err) => Sentry.captureException(err));

    return NextResponse.json({ offer });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[offers/create] Failed:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
