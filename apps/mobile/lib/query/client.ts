import { QueryClient } from "@tanstack/react-query";

// Module-level singleton so that places outside the React tree (e.g. the
// `signOut` flow in `hooks/use-auth.ts`) can imperatively `clear()` the
// cache to avoid hydrating the next user's session with the previous
// user's cached data.
//
// `refetchOnReconnect` / `refetchOnWindowFocus` are intentionally `true`:
// on mobile the analog of "window focus" is the app returning from
// background, and we wire `focusManager` + `onlineManager` in
// `lib/query/setup.ts` so React Query picks up these signals from
// `AppState` and `NetInfo` respectively.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});
