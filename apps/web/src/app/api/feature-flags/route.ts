import { NextResponse } from "next/server";
import { getFeatureFlags } from "@/lib/feature-flags/server";

export async function GET() {
  const snapshot = await getFeatureFlags();

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control":
        "public, max-age=0, s-maxage=10, stale-while-revalidate=30",
    },
  });
}
