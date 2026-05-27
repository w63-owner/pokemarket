import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { env } from "./env";

/**
 * Tags the Sentry release/dist so that source maps uploaded by the
 * @sentry/react-native/expo plugin during EAS Build line up with the
 * crashes captured at runtime.
 *
 *  - `release` is `<bundleId>@<version>+<runtimeVersion>` to disambiguate
 *    OTA updates from binary releases.
 *  - `dist` mirrors the native build number / versionCode so iOS and
 *    Android can be filtered separately in Sentry.
 */
function deriveReleaseAndDist() {
  const expo = Constants.expoConfig;
  const version = expo?.version ?? "0.0.0";
  const runtime = expo?.runtimeVersion ?? version;
  const bundleId =
    expo?.ios?.bundleIdentifier ??
    expo?.android?.package ??
    "app.pokemarket.mobile";
  const release = `${bundleId}@${version}+${runtime}`;
  const dist = String(
    expo?.ios?.buildNumber ?? expo?.android?.versionCode ?? "1",
  );
  return { release, dist };
}

/**
 * Per-route sampling buckets. Span/transaction `name` in
 * `@sentry/react-native` v7 is whatever the navigation integration
 * emits — typically the pathname (`/checkout/[listingId]`) or the
 * raw screen name. We match by prefix so deep params don't affect
 * the rate.
 *
 * Rationale:
 *  - 1.0 on money paths (`/checkout`, `/sell`, `/wallet`) — we want
 *    every crash/perf regression there visible immediately.
 *  - 0.05 on low-signal paths (legal, profile edits) — they barely
 *    move the needle and dominate session count.
 *  - 0.2 fallback to stay close to the previous flat rate so the
 *    overall Sentry quota doesn't shift.
 */
const SAMPLER_BUCKETS: ReadonlyArray<{ prefix: string; rate: number }> = [
  { prefix: "/checkout", rate: 1.0 },
  { prefix: "/sell", rate: 1.0 },
  { prefix: "/wallet", rate: 1.0 },
  { prefix: "/orders", rate: 0.5 },
  { prefix: "/inbox", rate: 0.3 },
  { prefix: "/legal", rate: 0.05 },
  { prefix: "/profile/edit", rate: 0.05 },
] as const;

const DEFAULT_TRACES_RATE = 0.2;

function pickRate(name: string): number {
  // Names may be prefixed by the navigation integration (e.g.
  // `Navigation /checkout/123`). Normalize by extracting the first
  // path-shaped substring before bucket matching.
  const path = name.match(/\/[A-Za-z0-9/_\-[\]]+/)?.[0] ?? name;
  for (const bucket of SAMPLER_BUCKETS) {
    if (path.startsWith(bucket.prefix)) return bucket.rate;
  }
  return DEFAULT_TRACES_RATE;
}

export function initSentry() {
  if (!env.SENTRY_DSN) {
    if (__DEV__) console.warn("[sentry] DSN not configured, skipping init");
    return;
  }

  const { release, dist } = deriveReleaseAndDist();

  Sentry.init({
    dsn: env.SENTRY_DSN,
    enableNative: true,
    release,
    dist,
    // Tracing is ALWAYS sampled at 100% in dev (so we can see every
    // transaction in the local Sentry inspector) and bucketed by route
    // in prod via `tracesSampler` — this overrides `tracesSampleRate`
    // when both are set.
    tracesSampler: __DEV__
      ? () => 1.0
      : ({ name, inheritOrSampleWith }) => {
          if (!name) return inheritOrSampleWith(DEFAULT_TRACES_RATE);
          return inheritOrSampleWith(pickRate(name));
        },
    // Session tracking is what powers Sentry's "release health" widget
    // (crash-free users / sessions). v7 renamed `autoSessionTracking`
    // → `enableAutoSessionTracking`; the old key is silently ignored.
    enableAutoSessionTracking: true,
    debug: __DEV__,
    environment: __DEV__ ? "development" : "production",
  });
}

export { Sentry };
