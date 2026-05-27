import type { FeedFilters, Json, SavedSearch } from "@pokemarket/shared";
import { getCurrentUserId, requireUserId } from "@/lib/auth/current-user";
import { supabase } from "@/lib/supabase";

export type SavedSearchNewCount = { search_id: string; new_count: number };

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const userId = getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("saved_searches")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createSavedSearch(
  name: string,
  filters: FeedFilters,
): Promise<SavedSearch> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("saved_searches")
    .insert({
      user_id: userId,
      name,
      search_params: filters as unknown as Json,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase
    .from("saved_searches")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

export async function fetchSavedSearchNewCounts(): Promise<
  SavedSearchNewCount[]
> {
  const userId = getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase.rpc("count_new_for_saved_searches");

  if (error) throw new Error(error.message);
  return (data ?? []) as SavedSearchNewCount[];
}

export async function markSavedSearchSeen(id: string): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase
    .from("saved_searches")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}
