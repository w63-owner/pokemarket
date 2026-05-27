import type {
  Listing,
  Profile,
  Transaction,
  TransactionWithDetails,
} from "@pokemarket/shared";

import { requireUserId } from "@/lib/auth/current-user";
import { supabase } from "@/lib/supabase";
import { api } from "./client";

/** ──────────────────────────────────────────────────────────────────────
 * READ
 * ────────────────────────────────────────────────────────────────────── */

const TRANSACTION_SELECT =
  "*, listing:listings(id, title, cover_image_url), buyer:profiles!transactions_buyer_id_fkey(id, username), seller:profiles!transactions_seller_id_fkey(id, username)";

/** Purchases list includes reservations still awaiting webhook confirmation. */
const BUYER_LIST_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "SHIPPED",
  "COMPLETED",
  "DISPUTED",
  "CANCELLED",
  "REFUNDED",
  "EXPIRED",
] as const;

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
  const userId = await requireUserId();

  const from = pageParam * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("buyer_id", userId)
    .in("status", [...BUYER_LIST_STATUSES])
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
  const userId = await requireUserId();

  const from = pageParam * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("seller_id", userId)
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

export type PurchaseDetail = TransactionWithDetails & {
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
  seller: Pick<Profile, "id" | "username" | "avatar_url">;
};

/**
 * Sale-side detail (only the seller can read). RLS enforces ownership.
 * Mirrors `apps/web/src/lib/api/transactions-history.ts:fetchSaleDetail`.
 */
export async function fetchSaleDetail(
  saleId: string,
): Promise<SaleDetail | null> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "*, listing:listings(id, title, cover_image_url, condition, is_graded, grade_note, grading_company, display_price), buyer:profiles!transactions_buyer_id_fkey(id, username, avatar_url), seller:profiles!transactions_seller_id_fkey(id, username)",
    )
    .eq("id", saleId)
    .eq("seller_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as SaleDetail | null) ?? null;
}

export async function fetchPurchaseDetail(
  purchaseId: string,
): Promise<PurchaseDetail | null> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "*, listing:listings(id, title, cover_image_url, condition, is_graded, grade_note, grading_company, display_price), buyer:profiles!transactions_buyer_id_fkey(id, username), seller:profiles!transactions_seller_id_fkey(id, username, avatar_url)",
    )
    .eq("id", purchaseId)
    .eq("buyer_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as PurchaseDetail | null) ?? null;
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
 * Seller marks a transaction as shipped. Atomic: a single Postgres RPC
 * (`ship_order`) UPDATEs the transaction AND inserts the system message
 * within one server-side transaction, eliminating the previous half-
 * shipped / half-messaged failure mode (e.g. status flipped but the
 * notification message never landed because the network died between
 * the two round-trips).
 *
 * The shipped-notify webhook is fire-and-forget: a network blip on the
 * notification service must never bubble up here.
 */
export async function shipOrder(
  transactionId: string,
  trackingNumber: string,
  trackingUrl: string | null,
  conversationId: string,
): Promise<void> {
  await requireUserId();

  const normalizedUrl =
    trackingUrl && !/^https?:\/\//i.test(trackingUrl)
      ? `https://${trackingUrl}`
      : trackingUrl;

  const { error } = await supabase.rpc("ship_order", {
    p_transaction_id: transactionId,
    p_tracking_number: trackingNumber,
    // Supabase gen-types models all function `TEXT` params as non-nullable
    // `string`, but Postgres TEXT parameters accept NULL just fine. The RPC
    // explicitly handles `IS NULL` for the tracking_url branch.
    p_tracking_url: normalizedUrl as unknown as string,
    p_conversation_id: conversationId,
  });

  if (error) throw new Error(error.message);

  // Fire-and-forget notification. The endpoint accepts Bearer auth so the
  // mobile call goes through fine; we still wrap in catch because a
  // network blip must never bubble up here.
  api
    .post("/api/orders/shipped-notify", { transaction_id: transactionId })
    .catch(() => {});
}

/**
 * Buyer opens a dispute on a SHIPPED transaction. Atomic: a single
 * Postgres RPC (`create_dispute`) inserts the dispute, flips the
 * transaction status, and posts the system message in one server-side
 * transaction.
 */
export async function createDispute(
  transactionId: string,
  reason: DisputeReason,
  description: string,
  conversationId: string,
): Promise<void> {
  await requireUserId();

  const trimmed = description.trim();
  if (trimmed.length < 10) {
    throw new Error("La description doit faire au moins 10 caractères");
  }

  const { error } = await supabase.rpc("create_dispute", {
    p_transaction_id: transactionId,
    p_reason: reason,
    p_description: trimmed,
    p_conversation_id: conversationId,
  });

  if (error) throw new Error(error.message);
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
