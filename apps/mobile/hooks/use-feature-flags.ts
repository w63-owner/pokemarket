import { useQuery } from "@tanstack/react-query";
import {
  FEATURE_FLAG_DEFAULTS,
  FEATURE_FLAG_KEYS,
  queryKeys,
  type FeatureFlag,
  type FeatureFlagsSnapshot,
} from "@pokemarket/shared";
import { api } from "@/lib/api/client";

async function fetchFeatureFlags(): Promise<FeatureFlagsSnapshot> {
  const snapshot = await api.get<FeatureFlagsSnapshot>("/api/feature-flags", {
    authenticated: false,
  });

  for (const key of FEATURE_FLAG_KEYS) {
    if (typeof snapshot.flags?.[key] !== "boolean") {
      throw new Error(`Invalid feature flag value: ${key}`);
    }
  }

  return snapshot;
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
