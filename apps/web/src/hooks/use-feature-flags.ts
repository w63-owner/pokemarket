"use client";

import { useQuery } from "@tanstack/react-query";
import {
  FEATURE_FLAG_DEFAULTS,
  FEATURE_FLAG_KEYS,
  queryKeys,
  type FeatureFlag,
  type FeatureFlagsSnapshot,
} from "@pokemarket/shared";

async function fetchFeatureFlags(): Promise<FeatureFlagsSnapshot> {
  const response = await fetch("/api/feature-flags", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Feature flags request failed (${response.status})`);
  }

  const snapshot: unknown = await response.json();
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    !("flags" in snapshot) ||
    typeof snapshot.flags !== "object" ||
    snapshot.flags === null
  ) {
    throw new Error("Invalid feature flags response");
  }

  for (const key of FEATURE_FLAG_KEYS) {
    if (typeof (snapshot.flags as Record<string, unknown>)[key] !== "boolean") {
      throw new Error(`Invalid feature flag value: ${key}`);
    }
  }

  return snapshot as FeatureFlagsSnapshot;
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: queryKeys.featureFlags.all,
    queryFn: fetchFeatureFlags,
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useFeatureFlag(flag: FeatureFlag) {
  const query = useFeatureFlags();

  return {
    enabled:
      query.data?.flags[flag] ?? (query.isError && FEATURE_FLAG_DEFAULTS[flag]),
    isLoading: query.isLoading,
  };
}
