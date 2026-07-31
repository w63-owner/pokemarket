import "server-only";

import { unstable_cache } from "next/cache";
import { PostHog } from "posthog-node";
import {
  FEATURE_FLAG_DEFAULTS,
  FEATURE_FLAG_KEYS,
  type FeatureFlag,
  type FeatureFlagsSnapshot,
} from "@pokemarket/shared";

const GLOBAL_DISTINCT_ID = "pokemarket-global";
const REVALIDATE_SECONDS = 10;

let postHogClient: PostHog | null | undefined;

function getPostHogClient(): PostHog | null {
  if (postHogClient !== undefined) return postHogClient;

  const projectKey = process.env.POSTHOG_PROJECT_KEY?.trim();
  if (!projectKey) {
    postHogClient = null;
    return postHogClient;
  }

  postHogClient = new PostHog(projectKey, {
    host: process.env.POSTHOG_HOST?.trim() || "https://eu.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });

  return postHogClient;
}

function defaultSnapshot(): FeatureFlagsSnapshot {
  return {
    flags: { ...FEATURE_FLAG_DEFAULTS },
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchGlobalFeatureFlags(): Promise<FeatureFlagsSnapshot> {
  const client = getPostHogClient();
  if (!client) return defaultSnapshot();

  try {
    const remoteFlags = await client.getAllFlags(GLOBAL_DISTINCT_ID, {
      flagKeys: FEATURE_FLAG_KEYS,
      disableGeoip: true,
    });

    const flags = { ...FEATURE_FLAG_DEFAULTS };
    for (const key of FEATURE_FLAG_KEYS) {
      const value = remoteFlags[key];
      if (value !== undefined) flags[key] = value !== false;
    }

    return { flags, fetchedAt: new Date().toISOString() };
  } catch (error) {
    console.error("[feature-flags] PostHog evaluation failed", error);
    return defaultSnapshot();
  }
}

/**
 * Global capability switches are cached briefly so one PostHog outage cannot
 * sit on every request path. A dashboard change propagates within ten seconds.
 */
export const getFeatureFlags = unstable_cache(
  fetchGlobalFeatureFlags,
  ["global-feature-flags-v1"],
  { revalidate: REVALIDATE_SECONDS },
);

export async function isFeatureEnabled(flag: FeatureFlag): Promise<boolean> {
  const snapshot = await getFeatureFlags();
  return snapshot.flags[flag];
}
