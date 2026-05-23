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
  const result = await api.post<{ offer: Offer }>("/api/offers/create", {
    listing_id: listingId,
    amount,
    conversation_id: conversationId,
  });
  return result.offer;
}

export async function acceptOffer(
  offerId: string,
  _listingId: string,
  _buyerId: string,
  _amount: number,
  conversationId: string,
): Promise<void> {
  await api.post("/api/offers/accept", {
    offer_id: offerId,
    conversation_id: conversationId,
  });
}

export async function rejectOffer(
  offerId: string,
  conversationId: string,
): Promise<void> {
  await api.post("/api/offers/reject", {
    offer_id: offerId,
    conversation_id: conversationId,
  });
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
