"use server";

import { revalidatePath } from "next/cache";
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

  const { data, error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  const profile = data as Profile;

  if (profile.username) {
    revalidatePath(`/u/${profile.username}`);
  }
  revalidatePath("/profile");

  return { success: true, data: profile };
}
