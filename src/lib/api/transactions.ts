import { createClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types";

export async function fetchTransactionByListing(
  listingId: string,
): Promise<Transaction | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("listing_id", listingId)
    .in("status", ["PAID", "SHIPPED", "COMPLETED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return (data as Transaction | null) ?? null;
}

export async function shipOrder(
  transactionId: string,
  trackingNumber: string,
  trackingUrl: string | null,
  conversationId: string,
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const now = new Date().toISOString();

  const { error: txError } = await supabase
    .from("transactions")
    .update({
      status: "SHIPPED",
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      shipped_at: now,
    })
    .eq("id", transactionId)
    .eq("seller_id", user.id)
    .eq("status", "PAID");

  if (txError) throw txError;

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: "Colis expédié",
    message_type: "order_shipped",
    metadata: {
      tracking_number: trackingNumber,
      ...(trackingUrl && { tracking_url: trackingUrl }),
      shipped_at: now,
    },
  });

  if (msgError) throw msgError;
}

export async function confirmReception(
  transactionId: string,
  rating: number,
  comment: string | null,
  conversationId: string,
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: tx, error: fetchError } = await supabase
    .from("transactions")
    .select("seller_id")
    .eq("id", transactionId)
    .eq("buyer_id", user.id)
    .eq("status", "SHIPPED")
    .single();

  if (fetchError || !tx)
    throw fetchError ?? new Error("Transaction introuvable");

  const { error: txError } = await supabase
    .from("transactions")
    .update({ status: "COMPLETED" })
    .eq("id", transactionId);

  if (txError) throw txError;

  const { error: reviewError } = await supabase.from("reviews").insert({
    transaction_id: transactionId,
    reviewer_id: user.id,
    reviewee_id: (tx as { seller_id: string }).seller_id,
    rating,
    ...(comment && { comment }),
  });

  if (reviewError) throw reviewError;

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: "Vente finalisée",
    message_type: "sale_completed",
    metadata: { rating, ...(comment && { comment }) },
  });

  if (msgError) throw msgError;
}
