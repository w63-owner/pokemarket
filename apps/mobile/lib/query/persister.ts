import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";

/**
 * `buster` invalidates the entire persisted cache when the JS bundle
 * version changes. Combined with the 24h `maxAge` this guarantees we
 * never serve stale rows shaped by an older serialization layout after
 * an OTA update.
 *
 * `runtimeVersion` is the most stable identifier across OTA + binary
 * releases — falling back to the public `version` for dev clients
 * where `runtimeVersion` is unset.
 */
function deriveBuster(): string {
  const expo = Constants.expoConfig;
  const runtime = expo?.runtimeVersion ?? expo?.version ?? "0.0.0";
  return typeof runtime === "string" ? runtime : "0.0.0";
}

export const persister: Persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "pm.rq.cache.v1",
  // 1.5s debounce: enough to coalesce a burst of writes (feed scroll =
  // many setQueryData calls) without losing the latest snapshot if the
  // user kills the app shortly after.
  throttleTime: 1500,
});

export const persistOptions = {
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24h
  buster: deriveBuster(),
  dehydrateOptions: {
    /**
     * Exclude noisy / volume-heavy query keys from the persisted snapshot.
     *
     *  - `messageAttachment` caches 1h Supabase Storage signed URLs that
     *    are useless after a relaunch (they expire while the app was
     *    backgrounded) and bloat AsyncStorage on heavy threads.
     *  - `feed` infinite queries can grow into the megabytes after a
     *    long scroll session; the next cold start will refetch fresh
     *    page 1 anyway via `refetchOnMount: stale-while-revalidate`.
     */
    shouldDehydrateQuery: (query) => {
      const [scope, subscope] = query.queryKey as readonly unknown[];
      if (scope === "conversations" && subscope === "messageAttachment") {
        return false;
      }
      if (scope === "listings" && subscope === "feed") {
        return false;
      }
      // Don't persist in-flight queries — if they're still pending when
      // the app closes they'll be rehydrated and immediately re-executed
      // on the next cold start, before the Supabase session is restored,
      // causing spurious "Non authentifié" errors.
      if (query.state.status === "pending") return false;
      // Don't persist queries in error state — replaying a stale error
      // on next cold start would surface a misleading toast.
      if (query.state.status === "error") return false;
      return true;
    },
  },
} satisfies {
  persister: Persister;
  maxAge: number;
  buster: string;
  dehydrateOptions: {
    shouldDehydrateQuery: (query: {
      queryKey: readonly unknown[];
      state: { status: string };
    }) => boolean;
  };
};

export type { PersistedClient };
