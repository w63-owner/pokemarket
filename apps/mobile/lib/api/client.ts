import { env } from "../env";
import { supabase } from "../supabase";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined | null>;
  authenticated?: boolean;
};

async function buildHeaders(authenticated: boolean): Promise<Headers> {
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json",
  });

  if (authenticated) {
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token ?? null;

    // #region agent log
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = data.session?.expires_at ?? 0;
    const dbgPayload = {
      sessionId: "35fba9",
      location: "client.ts:buildHeaders",
      message: "session state before API call",
      data: {
        sessionExists: !!data.session,
        tokenExists: !!token,
        tokenLength: token?.length ?? 0,
        expiresAt,
        nowUnix: now,
        isExpired: expiresAt > 0 ? expiresAt < now : null,
        secondsUntilExpiry: expiresAt > 0 ? expiresAt - now : null,
        authEnabled: authenticated,
      },
      timestamp: Date.now(),
      hypothesisId: "H-A,H-B,H-C",
    };
    console.log(
      "[DEBUG-35fba9] buildHeaders:",
      JSON.stringify(dbgPayload.data),
    );
    fetch("http://127.0.0.1:7638/ingest/38e16e0f-1e33-457e-a7b0-2a438c776c6a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "35fba9",
      },
      body: JSON.stringify(dbgPayload),
    }).catch(() => {});
    // #endregion

    // If no token, try an explicit refresh before giving up. getSession() may
    // have returned a stale session while a background refresh was in flight,
    // or the auto-refresh may not have fired yet (e.g. after app resume).
    if (!token) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      token = refreshed.session?.access_token ?? null;
      // #region agent log
      const dbgRefresh = {
        sessionId: "35fba9",
        location: "client.ts:buildHeaders:refresh",
        message: "refresh attempt result",
        data: { refreshSucceeded: !!token, tokenLength: token?.length ?? 0 },
        timestamp: Date.now(),
        hypothesisId: "H-A",
      };
      console.log(
        "[DEBUG-35fba9] buildHeaders refresh:",
        JSON.stringify(dbgRefresh.data),
      );
      fetch(
        "http://127.0.0.1:7638/ingest/38e16e0f-1e33-457e-a7b0-2a438c776c6a",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "35fba9",
          },
          body: JSON.stringify(dbgRefresh),
        },
      ).catch(() => {});
      // #endregion
    }

    if (!token) {
      throw new ApiError(401, "Session expirée. Veuillez vous reconnecter.");
    }

    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

function buildUrl(path: string, searchParams?: RequestOptions["searchParams"]) {
  const url = new URL(path.startsWith("http") ? path : `${env.API_URL}${path}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function apiFetch<TResponse = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const { body, searchParams, authenticated = true, ...rest } = options;
  const headers = await buildHeaders(authenticated);

  const response = await fetch(buildUrl(path, searchParams), {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    const message =
      (typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : null) ?? `HTTP ${response.status}`;
    throw new ApiError(response.status, message, data);
  }

  return data as TResponse;
}

export const api = {
  get: <T = unknown>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ) => apiFetch<T>(path, { ...options, method: "PATCH", body }),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),
  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};
