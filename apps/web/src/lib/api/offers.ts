import { createClient } from "@/lib/supabase/client";
import type { Offer, OfferWithContext, SentOfferWithContext } from "@/types";

export async function createOffer(
  listingId: string,
  amount: number,
  conversationId: string,
): Promise<Offer> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .insert({
      listing_id: listingId,
      buyer_id: user.id,
      offer_amount: amount,
      status: "PENDING",
      conversation_id: conversationId,
    })
    .select()
    .single();

  if (offerError) throw offerError;

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: `Offre de ${amount.toFixed(2)} €`,
    message_type: "offer",
    offer_id: (offer as Offer).id,
  });

  if (msgError) throw msgError;

  return offer as Offer;
}

export async function acceptOffer(
  offerId: string,
  listingId: string,
  buyerId: string,
  amount: number,
  conversationId: string,
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // Atomic guard: only PENDING → ACCEPTED. A seller double-clicking "Accept"
  // would otherwise insert duplicate system messages.
  const { data: updated, error: offerError } = await supabase
    .from("offers")
    .update({ status: "ACCEPTED" })
    .eq("id", offerId)
    .eq("status", "PENDING")
    .select("id");

  if (offerError) throw offerError;
  if (!updated || updated.length === 0) {
    throw new Error("Cette offre ne peut plus être acceptée");
  }

  const { error: listingError } = await supabase
    .from("listings")
    .update({
      status: "RESERVED",
      reserved_for: buyerId,
      reserved_price: amount,
    })
    .eq("id", listingId);

  if (listingError) throw listingError;

  const { error: rejectError } = await supabase
    .from("offers")
    .update({ status: "REJECTED" })
    .eq("listing_id", listingId)
    .eq("status", "PENDING")
    .neq("id", offerId);

  if (rejectError) throw rejectError;

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: `Offre de ${amount.toFixed(2)} € acceptée`,
    message_type: "offer_accepted",
    offer_id: offerId,
  });

  if (msgError) throw msgError;
}

export async function rejectOffer(
  offerId: string,
  conversationId: string,
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // Atomic guard: only PENDING → REJECTED.
  const { data: updated, error: offerError } = await supabase
    .from("offers")
    .update({ status: "REJECTED" })
    .eq("id", offerId)
    .eq("status", "PENDING")
    .select("id");

  if (offerError) throw offerError;
  if (!updated || updated.length === 0) {
    throw new Error("Cette offre ne peut plus être déclinée");
  }

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: "Offre déclinée",
    message_type: "offer_rejected",
    offer_id: offerId,
  });

  if (msgError) throw msgError;
}

export async function cancelOffer(
  offerId: string,
  conversationId: string,
): Promise<void> {
  const res = await fetch("/api/offers/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      offer_id: offerId,
      conversation_id: conversationId,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Impossible d'annuler l'offre");
  }
}

export async function fetchReceivedOffers(): Promise<OfferWithContext[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("offers")
    .select(
      `
      *,
      listing:listings!inner!listing_id (
        id, title, cover_image_url, display_price
      ),
      buyer:profiles!buyer_id (
        id, username, avatar_url
      )
    `,
    )
    .eq("listing.seller_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as OfferWithContext[];
}

export async function fetchSentOffers(): Promise<SentOfferWithContext[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("offers")
    .select(
      `
      *,
      listing:listings!listing_id (
        id, title, cover_image_url, display_price,
        seller:profiles!seller_id (
          id, username, avatar_url
        )
      )
    `,
    )
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as SentOfferWithContext[];
}

export async function fetchActiveOffer(
  conversationId: string,
): Promise<Offer | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .eq("conversation_id", conversationId)
    .in("status", ["PENDING", "ACCEPTED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return (data as Offer | null) ?? null;
}
