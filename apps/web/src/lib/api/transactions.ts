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

  const { error } = await supabase.rpc("create_dispute", {
    p_transaction_id: transactionId,
    p_reason: reason,
    p_description: description.trim(),
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}

export async function fetchTransactionByListing(
  listingId: string,
): Promise<Transaction | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("listing_id", listingId)
    .in("status", ["PENDING_PAYMENT", "PAID", "SHIPPED", "COMPLETED"])
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

  const normalizedUrl =
    trackingUrl && !/^https?:\/\//i.test(trackingUrl)
      ? `https://${trackingUrl}`
      : trackingUrl;

  const { error } = await supabase.rpc("ship_order", {
    p_transaction_id: transactionId,
    p_tracking_number: trackingNumber,
    p_tracking_url: normalizedUrl as unknown as string,
    p_conversation_id: conversationId,
  });
  if (error) throw error;

  fetch("/api/orders/shipped-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_id: transactionId }),
  }).catch(() => {});
}

// confirmReception has been moved to src/actions/transactions.ts (Server Action).
// It now calls the release_escrow_funds RPC atomically and handles
// revalidatePath for /wallet and /orders.
