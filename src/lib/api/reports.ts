import { createClient } from "@/lib/supabase/client";
import type { ReportReason } from "@/lib/constants";

interface CreateReportData {
  reason: ReportReason;
  description?: string;
}

export async function createReport(
  listingId: string,
  data: CreateReportData,
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    listing_id: listingId,
    reason: data.reason,
    description: data.description || null,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("Vous avez déjà signalé cette annonce");
    }
    throw error;
  }
}
