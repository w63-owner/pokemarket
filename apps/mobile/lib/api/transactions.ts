import type {
  Listing,
  Profile,
  Transaction,
  TransactionWithDetails,
} from "@pokemarket/shared";

import { supabase } from "@/lib/supabase";
import { api } from "./client";

/** ──────────────────────────────────────────────────────────────────────
 * READ
 * ────────────────────────────────────────────────────────────────────── */

const TRANSACTION_SELECT =
  "*, listing:listings(id, title, cover_image_url), buyer:profiles!transactions_buyer_id_fkey(id, username), seller:profiles!transactions_seller_id_fkey(id, username)";

const VISIBLE_STATUSES = [
  "PAID",
  "SHIPPED",
  "COMPLETED",
  "DISPUTED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type PaginatedTransactions = {
  data: TransactionWithDetails[];
  nextCursor: number | undefined;
};

/**
 * Most recent in-progress transaction for a listing. Used by the chat
 * thread to render the right status / action bar.
 */
export async function fetchTransactionByListing(
  listingId: string,
): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("listing_id", listingId)
    .in("status", ["PENDING_PAYMENT", "PAID", "SHIPPED", "COMPLETED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Transaction | null) ?? null;
}

export async function fetchMyPurchases({
  pageParam = 0,
  limit = 20,
}: {
  pageParam?: number;
  limit?: number;
} = {}): Promise<PaginatedTransactions> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const from = pageParam * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("buyer_id", user.id)
    .in("status", [...VISIBLE_STATUSES])
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const items = (data ?? []) as unknown as TransactionWithDetails[];
  return {
    data: items,
    nextCursor: items.length === limit ? pageParam + 1 : undefined,
  };
}

export async function fetchMySales({
  pageParam = 0,
  limit = 20,
}: {
  pageParam?: number;
  limit?: number;
} = {}): Promise<PaginatedTransactions> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const from = pageParam * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("seller_id", user.id)
    .in("status", [...VISIBLE_STATUSES])
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const items = (data ?? []) as unknown as TransactionWithDetails[];
  return {
    data: items,
    nextCursor: items.length === limit ? pageParam + 1 : undefined,
  };
}

export type SaleDetail = TransactionWithDetails & {
  listing: Pick<
    Listing,
    | "id"
    | "title"
    | "cover_image_url"
    | "condition"
    | "is_graded"
    | "grade_note"
    | "grading_company"
    | "display_price"
  >;
  buyer: Pick<Profile, "id" | "username" | "avatar_url">;
};

/**
 * Sale-side detail (only the seller can read). RLS enforces ownership.
 * Mirrors `apps/web/src/lib/api/transactions-history.ts:fetchSaleDetail`.
 */
export async function fetchSaleDetail(
  saleId: string,
): Promise<SaleDetail | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "*, listing:listings(id, title, cover_image_url, condition, is_graded, grade_note, grading_company, display_price), buyer:profiles!transactions_buyer_id_fkey(id, username, avatar_url), seller:profiles!transactions_seller_id_fkey(id, username)",
    )
    .eq("id", saleId)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as SaleDetail | null) ?? null;
}

/** ──────────────────────────────────────────────────────────────────────
 * WRITE — actions used by both the chat thread and the sale detail page
 * ────────────────────────────────────────────────────────────────────── */

export type DisputeReason =
  | "damaged_card"
  | "wrong_card"
  | "empty_package"
  | "other";

/**
 * Seller marks a transaction as shipped + posts a system message + fires
 * a fire-and-forget notification to the buyer.
 *
 * RLS guards the update: only the seller of a PAID transaction can flip
 * it to SHIPPED. The notification call is deliberately not awaited — a
 * failed email/push must never block the seller from continuing.
 */
export async function shipOrder(
  transactionId: string,
  trackingNumber: string,
  trackingUrl: string | null,
  conversationId: string,
): Promise<void> {
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

  // Fire-and-forget notification. The endpoint accepts Bearer auth so the
  // mobile call goes through fine; we still wrap in try/catch because a
  // network blip must never bubble up here.
  api
    .post("/api/orders/shipped-notify", { transaction_id: transactionId })
    .catch(() => {});
}

/**
 * Buyer opens a dispute on a SHIPPED transaction. Mirrors the web helper
 * but uses the mobile supabase client (RLS-bound).
 */
export async function createDispute(
  transactionId: string,
  reason: DisputeReason,
  description: string,
  conversationId: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const trimmed = description.trim();
  if (trimmed.length < 10) {
    throw new Error("La description doit faire au moins 10 caractères");
  }

  const { error: disputeError } = await supabase.from("disputes").insert({
    transaction_id: transactionId,
    opened_by: user.id,
    reason,
    description: trimmed,
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
    metadata: { reason, description: trimmed },
  });

  if (msgError) throw msgError;
}

/**
 * Buyer confirms reception, releasing the escrow. Wraps the
 * `/api/transactions/confirm-reception` REST endpoint (server-side
 * mirror of `confirmReceptionAction`) — Server Actions can't be called
 * from RN because they require a cookie session.
 */
export async function confirmReception(input: {
  transactionId: string;
  conversationId: string;
  rating: number;
  comment: string | null;
}): Promise<void> {
  await api.post("/api/transactions/confirm-reception", input);
}
