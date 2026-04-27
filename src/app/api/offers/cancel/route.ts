import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
      .select("*")
      .eq("id", offer_id)
      .single();

    if (fetchError || !offer) {
      return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
    }

    if (offer.buyer_id !== user.id) {
      return NextResponse.json(
        { error: "Seul l'acheteur peut annuler son offre" },
        { status: 403 },
      );
    }

    if (offer.status !== "PENDING" && offer.status !== "ACCEPTED") {
      return NextResponse.json(
        { error: "Cette offre ne peut plus être annulée" },
        { status: 400 },
      );
    }

    const wasAccepted = offer.status === "ACCEPTED";

    // Atomic guard: only the first concurrent caller wins. Others get 0 rows
    // back and bail out with 400 (otherwise we'd insert duplicate
    // "Offre annulée" system messages on double-click).
    const { data: updated, error: updateError } = await admin
      .from("offers")
      .update({ status: "CANCELLED" })
      .eq("id", offer_id)
      .in("status", ["PENDING", "ACCEPTED"])
      .select("id");

    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "Cette offre ne peut plus être annulée" },
        { status: 400 },
      );
    }

    if (wasAccepted) {
      const { error: listingError } = await admin
        .from("listings")
        .update({
          status: "ACTIVE",
          reserved_for: null,
          reserved_price: null,
        })
        .eq("id", offer.listing_id)
        .eq("reserved_for", user.id)
        .in("status", ["RESERVED", "LOCKED"]);

      if (listingError) throw listingError;
    }

    const { error: msgError } = await admin.from("messages").insert({
      conversation_id,
      sender_id: user.id,
      content: "Offre annulée",
      message_type: "offer_cancelled",
      offer_id,
    });

    if (msgError) throw msgError;

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    console.error("Cancel offer error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
