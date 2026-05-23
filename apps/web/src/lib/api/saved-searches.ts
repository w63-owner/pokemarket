import { createClient } from "@/lib/supabase/client";
import type { SavedSearch } from "@/types";
import type { FeedFilters } from "@/lib/query-keys";
import type { Json } from "@/types/database";

export async function getSavedSearches(): Promise<SavedSearch[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("saved_searches")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data ?? [];
}

export async function createSavedSearch(
  name: string,
  searchParams: FeedFilters,
): Promise<SavedSearch> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("saved_searches")
    .insert({
      user_id: user.id,
      name,
      search_params: searchParams as unknown as Json,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { error } = await supabase
    .from("saved_searches")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}

export type SavedSearchNewCount = { search_id: string; new_count: number };

export async function getNewCountsForSavedSearches(): Promise<
  SavedSearchNewCount[]
> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc("count_new_for_saved_searches");

  if (error) throw error;

  return (data ?? []) as SavedSearchNewCount[];
}

export async function markSavedSearchSeen(id: string): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { error } = await supabase
    .from("saved_searches")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}
