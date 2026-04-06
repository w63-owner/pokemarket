import { createClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types";

export type DisputeReason =
  | "damaged_card"
  | "wrong_card"
  | "empty_package"
  | "other";

export async function createDispute(
  transactionId: string,
  reason: DisputeReason,
  description: string,
  conversationId: string,
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { error: disputeError } = await supabase.from("disputes").insert({
    transaction_id: transactionId,
    opened_by: user.id,
    reason,
    description: description.trim(),
  });

  if (disputeError) throw disputeError;

  const { error: txError } = await supabase
    .from("transactions")
    .update({ status: "DISPUTED" })
    .eq("id", transactionId)
    .eq("buyer_id", user.id)
    .eq("status", "SHIPPED");

  if (txError) throw txError;

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: "Litige ouvert",
    message_type: "dispute_opened",
    metadata: { reason, description: description.trim() },
  });

  if (msgError) throw msgError;
}

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
  const normalizedUrl =
    trackingUrl && !/^https?:\/\//i.test(trackingUrl)
      ? `https://${trackingUrl}`
      : trackingUrl;

  const { error: txError } = await supabase
    .from("transactions")
    .update({
      status: "SHIPPED",
      tracking_number: trackingNumber,
      tracking_url: normalizedUrl,
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
      ...(normalizedUrl && { tracking_url: normalizedUrl }),
      shipped_at: now,
    },
  });

  if (msgError) throw msgError;

  fetch("/api/orders/shipped-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_id: transactionId }),
  }).catch(() => {});
}

// confirmReception has been moved to src/actions/transactions.ts (Server Action).
// It now calls the release_escrow_funds RPC atomically and handles
// revalidatePath for /wallet and /orders.
