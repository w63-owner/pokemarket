"use server";

import { revalidatePath } from "next/cache";
import { OWN_PROFILE_UPDATE_RETURNING_COLUMNS } from "@pokemarket/shared";
import { createClient } from "@/lib/supabase/server";
import { profileUpdateSchema } from "@/lib/validations";
import type { Profile } from "@/types";

export type ProfileActionResult =
  | { success: true; data: Profile }
  | { success: false; error: string };

export async function updateProfileAction(
  input: unknown,
): Promise<ProfileActionResult> {
  const parsed = profileUpdateSchema.safeParse(input);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Données invalides";
    return { success: false, error: firstError };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Non authentifié" };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id)
    .select(OWN_PROFILE_UPDATE_RETURNING_COLUMNS)
    .single();

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Re-read via profiles_me so Stripe / role / KYC fields remain available to
  // the caller without granting those columns on the base table.
  const { data, error } = await supabase
    .from("profiles_me")
    .select("*")
    .single();

  if (error || !data?.id || !data.username) {
    return { success: false, error: error?.message ?? "Profil introuvable" };
  }

  const profile = data as Profile;

  if (profile.username) {
    revalidatePath(`/u/${profile.username}`);
  }
  revalidatePath("/profile");

  return { success: true, data: profile };
}
