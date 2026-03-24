import { createClient } from "@/lib/supabase/client";
import type { TransactionWithDetails } from "@/types";

export type PaginatedTransactions = {
  data: TransactionWithDetails[];
  nextCursor: number | undefined;
};

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

export async function fetchMyPurchases({
  pageParam = 0,
  limit = 20,
}: {
  pageParam?: number;
  limit?: number;
} = {}): Promise<PaginatedTransactions> {
  const supabase = createClient();

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
  const supabase = createClient();

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
  listing: {
    id: string;
    title: string;
    cover_image_url: string | null;
    condition: string | null;
    is_graded: boolean;
    grade_note: number | null;
    display_price: number;
  };
  buyer: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
};

export async function fetchSaleDetail(
  saleId: string,
): Promise<SaleDetail | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "*, listing:listings(id, title, cover_image_url, condition, is_graded, grade_note, display_price), buyer:profiles!transactions_buyer_id_fkey(id, username, avatar_url), seller:profiles!transactions_seller_id_fkey(id, username)",
    )
    .eq("id", saleId)
    .eq("seller_id", user.id)
    .single();

  if (error) throw error;

  return data as unknown as SaleDetail | null;
}
