"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listingCreateSchema } from "@/lib/validations";
import type { Listing } from "@/types";

export type ListingActionResult<T = Listing> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function createListingAction(
  input: unknown,
): Promise<ListingActionResult<Listing>> {
  const parsed = listingCreateSchema.safeParse(input);

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

  const d = parsed.data;

  const { data, error } = await supabase
    .from("listings")
    .insert({
      seller_id: user.id,
      title: d.title,
      price_seller: d.price_seller,
      condition: d.is_graded ? null : (d.condition ?? null),
      is_graded: d.is_graded,
      grading_company: d.is_graded ? (d.grading_company ?? null) : null,
      grade_note: d.is_graded ? (d.grade_note ?? null) : null,
      delivery_weight_class: d.delivery_weight_class,
      cover_image_url: d.cover_image_url,
      back_image_url: d.back_image_url,
      card_ref_id: d.card_ref_id ?? null,
      card_series: d.card_series ?? null,
      card_block: d.card_block ?? null,
      card_number: d.card_number ?? null,
      card_language: d.card_language ?? null,
      card_rarity: d.card_rarity ?? null,
      card_illustrator: d.card_illustrator ?? null,
      status: "ACTIVE",
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/search");

  return { success: true, data: data as Listing };
}

export async function deleteListingAction(
  listingId: string,
): Promise<ListingActionResult<null>> {
  if (!listingId || typeof listingId !== "string") {
    return { success: false, error: "ID d'annonce invalide" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Non authentifié" };
  }

  const { error } = await supabase
    .from("listings")
    .delete()
    .eq("id", listingId)
    .eq("seller_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath(`/listing/${listingId}`);

  return { success: true, data: null };
}
