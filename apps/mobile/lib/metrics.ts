import { Sentry } from "@/lib/sentry";

/**
 * Product-critical metrics emitted to Sentry. The v7 React Native SDK
 * removed the `Sentry.metrics.*` namespace (deprecated in @sentry/core
 * v10) so we use a mix of:
 *   - one-shot spans + `setMeasurement` for durations (cold start,
 *     slow API calls) — these appear in Sentry Performance/Insights
 *     under their span name with a Distribution histogram.
 *   - tags + breadcrumbs for low-cardinality gauges (channel count) —
 *     queryable on every captured event without spawning extra spans.
 *
 * Every helper is safe to call even when the SDK is uninitialised
 * (no DSN, dev mode without env var) — Sentry's public API no-ops
 * when the client is missing.
 */

/**
 * Records the time from JS bundle eval (module init) to the first
 * usable render. Captured once per cold start in `_layout.tsx` after
 * fonts are loaded — the moment users can actually interact with the
 * UI.
 */
export function recordColdStart(ms: number): void {
  const rounded = Math.round(ms);

  // A one-shot manual span lets the value show up in the Sentry
  // Performance dashboard with proper p50/p95 distribution. We finish
  // it immediately — Sentry derives the histogram from `setMeasurement`
  // values rather than from real wall-clock duration on this span.
  Sentry.startSpan(
    {
      name: "app.cold_start",
      op: "app.start",
      attributes: {
        "app.cold_start_ms": rounded,
      },
    },
    () => {
      Sentry.setMeasurement("app.cold_start", rounded, "millisecond");
    },
  );

  // Tag the session so subsequent crash events carry the cold-start
  // bucket — useful when correlating "slow boot" with "JS crash
  // 8 seconds in".
  Sentry.setTag(
    "app.cold_start_bucket",
    rounded < 1500 ? "fast" : rounded < 3000 ? "medium" : "slow",
  );
}

/**
 * Records the current number of active Supabase Realtime channels.
 * Called periodically from `_layout.tsx` (every 30 s) — gauge metric
 * we want to keep < 5 across the whole app.
 *
 * Set as a scope context (visible on every captured event) rather
 * than a one-shot span: an outlier `n=12` showing up alongside a
 * crash is far more actionable than a standalone metric.
 */
export function recordChannelCount(count: number): void {
  Sentry.setContext("realtime", { channel_count: count });

  // Crumb keeps a rolling history so we can see how `count` evolved
  // before a degraded UX event (e.g. websocket exhaustion).
  Sentry.addBreadcrumb({
    category: "realtime",
    type: "info",
    level: count > 5 ? "warning" : "info",
    message: `active_channels=${count}`,
    data: { channel_count: count },
  });
}

/**
 * Captures an outlier API call. Called from `apiFetch` only when the
 * duration crosses `SLOW_QUERY_THRESHOLD_MS` — we never want to
 * generate one event per request.
 */
export function recordSlowQuery(name: string, durationMs: number): void {
  Sentry.addBreadcrumb({
    category: "http",
    type: "http",
    level: "warning",
    message: `slow_query ${name}`,
    data: {
      name,
      duration_ms: Math.round(durationMs),
    },
  });
}

/**
 * Threshold above which an API call is considered an outlier and
 * deserves a breadcrumb. Aligned with the Supabase RLS-heavy reads
 * audited in Sprint 2 — typical hot-path reads should land < 200 ms.
 */
export const SLOW_QUERY_THRESHOLD_MS = 500;
