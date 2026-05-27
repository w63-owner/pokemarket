import type { ReportReason } from "@pokemarket/shared";
import { requireUserId } from "@/lib/auth/current-user";
import { supabase } from "@/lib/supabase";

type CreateReportInput = {
  reason: ReportReason;
  description?: string;
};

/**
 * Insert a moderation `report` row for the given listing. Mirrors
 * the web `createReport` helper — RLS enforces that `reporter_id`
 * matches the auth user, so we set it client-side. The unique
 * (reporter_id, listing_id) index produces a friendlier message
 * when the buyer already reported the same listing.
 */
export async function createReport(
  listingId: string,
  input: CreateReportInput,
): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase.from("reports").insert({
    reporter_id: userId,
    listing_id: listingId,
    reason: input.reason,
    description: input.description || null,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("Vous avez déjà signalé cette annonce");
    }
    throw new Error(error.message);
  }
}
