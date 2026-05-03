import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Simple health endpoint used by deploy smoke tests and uptime monitors.
 *
 * Returns:
 *   - 200 with {status:"ok",...} when the app can reach Supabase
 *   - 503 with {status:"degraded",...} when Supabase is unreachable
 *
 * Public (no auth) so platforms like UptimeRobot / BetterStack can call it,
 * but does NOT leak secrets or row-level data — only liveness signals.
 */
export async function GET() {
  const startedAt = Date.now();
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown";
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null;

  let dbOk = false;
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  try {
    const admin = createAdminClient();
    const dbStart = Date.now();
    // Cheapest possible query: head request on a tiny seeded table.
    const { error } = await admin
      .from("shipping_matrix")
      .select("*", { head: true, count: "exact" })
      .limit(1);
    dbLatencyMs = Date.now() - dbStart;
    if (error) {
      dbError = error.message;
    } else {
      dbOk = true;
    }
  } catch (err) {
    dbError = err instanceof Error ? err.message : "unknown";
  }

  const body = {
    status: dbOk ? "ok" : "degraded",
    env,
    sha,
    uptime_ms: Math.round(process.uptime() * 1000),
    checks: {
      database: { ok: dbOk, latency_ms: dbLatencyMs, error: dbError },
    },
    duration_ms: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
