import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

const supabase = createClient();

export async function fetchMyProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateMyProfile(
  updates: Partial<
    Pick<
      Profile,
      | "username"
      | "bio"
      | "avatar_url"
      | "country_code"
      | "instagram_url"
      | "facebook_url"
      | "tiktok_url"
    >
  >,
): Promise<Profile> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchPublicProfile(
  username: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (error) return null;
  return data;
}
