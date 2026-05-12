import type {
  Offer,
  OfferWithContext,
  SentOfferWithContext,
} from "@pokemarket/shared";
import { api } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";

export async function createOffer(
  listingId: string,
  amount: number,
  conversationId: string,
): Promise<Offer> {
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

  if (offerError) throw new Error(offerError.message);

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: `Offre de ${amount.toFixed(2)} €`,
    message_type: "offer",
    offer_id: (offer as Offer).id,
  });

  if (msgError) throw new Error(msgError.message);

  return offer as Offer;
}

export async function acceptOffer(
  offerId: string,
  listingId: string,
  buyerId: string,
  amount: number,
  conversationId: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: updated, error: offerError } = await supabase
    .from("offers")
    .update({ status: "ACCEPTED" })
    .eq("id", offerId)
    .eq("status", "PENDING")
    .select("id");

  if (offerError) throw new Error(offerError.message);
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

  if (listingError) throw new Error(listingError.message);

  const { error: rejectError } = await supabase
    .from("offers")
    .update({ status: "REJECTED" })
    .eq("listing_id", listingId)
    .eq("status", "PENDING")
    .neq("id", offerId);

  if (rejectError) throw new Error(rejectError.message);

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: `Offre de ${amount.toFixed(2)} € acceptée`,
    message_type: "offer_accepted",
    offer_id: offerId,
  });

  if (msgError) throw new Error(msgError.message);
}

export async function rejectOffer(
  offerId: string,
  conversationId: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: updated, error: offerError } = await supabase
    .from("offers")
    .update({ status: "REJECTED" })
    .eq("id", offerId)
    .eq("status", "PENDING")
    .select("id");

  if (offerError) throw new Error(offerError.message);
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

  if (msgError) throw new Error(msgError.message);
}

/**
 * Mobile cancellation goes through the backend route because releasing a
 * RESERVED listing requires the service-role client (RLS would otherwise
 * block the buyer from un-reserving). Mirrors the web behavior.
 */
export async function cancelOffer(
  offerId: string,
  conversationId: string,
): Promise<void> {
  await api.post("/api/offers/cancel", {
    offer_id: offerId,
    conversation_id: conversationId,
  });
}

export async function fetchReceivedOffers(): Promise<OfferWithContext[]> {
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

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OfferWithContext[];
}

export async function fetchSentOffers(): Promise<SentOfferWithContext[]> {
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

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SentOfferWithContext[];
}

export async function fetchActiveOffer(
  conversationId: string,
): Promise<Offer | null> {
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .eq("conversation_id", conversationId)
    .in("status", ["PENDING", "ACCEPTED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as Offer | null) ?? null;
}
