import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { collectCardmarketPriceBatch } from "@/lib/cardmarket/collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return (
    typeof secret === "string" &&
    secret.length > 0 &&
    request.headers.get("authorization") === `Bearer ${secret}`
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const metrics = await collectCardmarketPriceBatch();

    Sentry.setContext("cardmarket_collection", metrics);
    Sentry.setMeasurement(
      "cardmarket.collection_coverage",
      metrics.coverage_percent,
      "percent",
    );

    if (metrics.failed > 0) {
      Sentry.captureMessage("Cardmarket daily collection has failed cards", {
        level: "warning",
        tags: { component: "cardmarket-price-collector" },
        extra: metrics,
      });
    }

    return NextResponse.json(metrics);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "cardmarket-price-collector" },
    });
    return NextResponse.json(
      { error: "Unable to collect Cardmarket prices" },
      { status: 500 },
    );
  }
}
