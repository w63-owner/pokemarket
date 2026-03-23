import { createClient } from "@/lib/supabase/client";
import type { TransactionWithDetails } from "@/types";

export async function fetchMyPurchases(): Promise<TransactionWithDetails[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "*, listing:listings(id, title, cover_image_url), buyer:profiles!transactions_buyer_id_fkey(id, username), seller:profiles!transactions_seller_id_fkey(id, username)",
    )
    .eq("buyer_id", user.id)
    .in("status", [
      "PAID",
      "SHIPPED",
      "COMPLETED",
      "DISPUTED",
      "CANCELLED",
      "REFUNDED",
    ])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []) as unknown as TransactionWithDetails[];
}

export async function fetchMySales(): Promise<TransactionWithDetails[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "*, listing:listings(id, title, cover_image_url), buyer:profiles!transactions_buyer_id_fkey(id, username), seller:profiles!transactions_seller_id_fkey(id, username)",
    )
    .eq("seller_id", user.id)
    .in("status", [
      "PAID",
      "SHIPPED",
      "COMPLETED",
      "DISPUTED",
      "CANCELLED",
      "REFUNDED",
    ])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []) as unknown as TransactionWithDetails[];
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
