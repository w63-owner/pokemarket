import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

export async function fetchMyProfile(): Promise<Profile | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Sensitive columns are revoked on `profiles` for JWT roles; own-row
  // secrets (address / Stripe / role) are exposed via profiles_me.
  const { data, error } = await supabase
    .from("profiles_me")
    .select("*")
    .single();

  if (error) throw error;
  if (!data?.id || !data.username) return null;

  return data as Profile;
}
