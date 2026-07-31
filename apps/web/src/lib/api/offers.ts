import { createClient } from "@/lib/supabase/client";
import type { Offer, OfferWithContext, SentOfferWithContext } from "@/types";

export async function createOffer(
  listingId: string,
  amount: number,
  conversationId: string,
): Promise<Offer> {
  const response = await fetch("/api/offers/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      listing_id: listingId,
      amount,
      conversation_id: conversationId,
    }),
  });
  const result = (await response.json().catch(() => null)) as {
    offer?: Offer;
    error?: string;
  } | null;
  if (!response.ok || !result?.offer) {
    throw new Error(result?.error ?? "Impossible de créer l'offre");
  }
  return result.offer;
}

export async function acceptOffer(
  offerId: string,
  _listingId: string,
  _buyerId: string,
  _amount: number,
  conversationId: string,
): Promise<void> {
  const response = await fetch("/api/offers/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      offer_id: offerId,
      conversation_id: conversationId,
    }),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(result?.error ?? "Impossible d'accepter l'offre");
  }
}

export async function rejectOffer(
  offerId: string,
  conversationId: string,
): Promise<void> {
  const response = await fetch("/api/offers/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      offer_id: offerId,
      conversation_id: conversationId,
    }),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(result?.error ?? "Impossible de décliner l'offre");
  }
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
