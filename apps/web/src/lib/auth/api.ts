import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

/**
 * Authenticate an API route caller from EITHER:
 *
 *   1. The Supabase auth cookie set by `@supabase/ssr` on the web app
 *      (`createServerClient` reads `cookies()` directly), OR
 *   2. An `Authorization: Bearer <access_token>` header set by the mobile
 *      app (Expo Router) — the only auth channel we have on RN since the
 *      mobile client persists sessions in AsyncStorage, not cookies.
 *
 * Returns the Supabase user when found, otherwise `null`. Lookups are
 * cached implicitly per-request because both paths share the cookie store /
 * admin client, but we don't memoize across requests on purpose: each
 * request re-validates the JWT against Supabase Auth.
 *
 * Usage in a route handler:
 *
 *   const { user } = await getRequestUser(request);
 *   if (!user) return NextResponse.json({ error: "..." }, { status: 401 });
 *
 * Notes on safety:
 *
 *   - We deliberately don't fall back from cookie to Bearer when the cookie
 *     is *malformed* (e.g. expired session) — the cookie path returning
 *     `user = null` short-circuits to Bearer below, but if cookies parsed
 *     fine and the user is just signed out, Bearer is still tried so a
 *     mobile session with a valid header always wins.
 *   - Bearer tokens are validated via `auth.getUser(jwt)` against Supabase,
 *     so RLS-bypassing tokens (anon key, etc.) cannot impersonate a user.
 *   - The admin client is only used to *validate* the JWT — RLS-bound
 *     queries inside the route should still use a per-request anon client
 *     when relevant.
 */
export async function getRequestUser(request: Request): Promise<{
  user: { id: string; email?: string } | null;
  source: "cookie" | "bearer" | null;
}> {
  // Cookie path — works for any web caller. Cheap because the SSR cookie
  // helper reads `cookies()` from the request scope.
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      return { user: { id: user.id, email: user.email }, source: "cookie" };
    }
  } catch {
    // Fall through to bearer path
  }

  // Bearer path — used by the mobile app. We send the JWT to Supabase Auth
  // for validation, which doubles as a freshness check (revoked tokens
  // return null even if not yet expired).
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data.user) {
        return {
          user: { id: data.user.id, email: data.user.email },
          source: "bearer",
        };
      }
    }
  }

  return { user: null, source: null };
}

/**
 * Returns BOTH the authenticated user AND a Supabase client that carries
 * the user's session — the cookie-bound SSR client for web, or an anon
 * client with `Authorization: Bearer <token>` for mobile.
 *
 * Use this when a route handler needs to call an RPC or run a query that
 * relies on `auth.uid()` (e.g. RLS-protected queries, ownership checks
 * inside SECURITY DEFINER functions like `release_escrow_funds`). The
 * plain `getRequestUser` is enough when you only need the user id and
 * you'll use the admin client for the actual data access.
 *
 * Returns `{ user: null, supabase: null }` if authentication fails.
 */
export async function getRequestUserClient(request: Request): Promise<{
  user: { id: string; email?: string } | null;
  supabase: Awaited<ReturnType<typeof createServerClient>> | null;
}> {
  // Prefer cookie path (web) — the SSR client already wires the session.
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      return {
        user: { id: user.id, email: user.email },
        supabase,
      };
    }
  } catch {
    // Fall through to bearer path
  }

  // Bearer path (mobile) — build a per-request anon client that forwards
  // the JWT in the `Authorization` header on every PostgREST call. This
  // makes `auth.uid()` return the buyer id inside Postgres RPCs while
  // RLS policies remain enforced.
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data.user) {
        const supabase = createSupabaseJsClient<Database>(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
            global: {
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        ) as unknown as Awaited<ReturnType<typeof createServerClient>>;
        return {
          user: { id: data.user.id, email: data.user.email },
          supabase,
        };
      }
    }
  }

  return { user: null, supabase: null };
}
