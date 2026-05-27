import { Sentry } from "@/lib/sentry";
import { recordSlowQuery, SLOW_QUERY_THRESHOLD_MS } from "@/lib/metrics";
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
    const token = data.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
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

/**
 * Strips the high-cardinality bits of a URL so span names group
 * properly in Sentry Performance. We keep the host/path skeleton
 * but drop UUIDs, IDs and query strings.
 *
 *   /api/listings/abc-123-uuid?cursor=…   -> /api/listings/:id
 *   /api/checkout/abc-123/confirm         -> /api/checkout/:id/confirm
 */
function normalizeSpanName(method: string, path: string): string {
  const base = path.split("?")[0] ?? path;
  const normalized = base
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "/:id",
    )
    .replace(/\/\d+/g, "/:id");
  return `${method.toUpperCase()} ${normalized}`;
}

export async function apiFetch<TResponse = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const { body, searchParams, authenticated = true, ...rest } = options;
  const method = (rest.method ?? "GET").toString();
  const spanName = normalizeSpanName(method, path);

  // Sentry.startSpan transparently no-ops when tracing is disabled or
  // dropped by the sampler — so the cost on un-sampled calls is a
  // single function indirection.
  return Sentry.startSpan(
    {
      name: spanName,
      op: "http.client",
      attributes: {
        "http.method": method.toUpperCase(),
        "http.url": path,
      },
    },
    async (span) => {
      const startedAt = Date.now();
      const headers = await buildHeaders(authenticated);

      let response: Response;
      try {
        response = await fetch(buildUrl(path, searchParams), {
          ...rest,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (networkError) {
        span?.setAttribute("error", true);
        span?.setStatus({ code: 2, message: "network_error" });
        throw networkError;
      }

      const elapsed = Date.now() - startedAt;
      span?.setAttribute("http.status_code", response.status);
      span?.setAttribute("http.duration_ms", elapsed);

      // Tag outliers with a breadcrumb so we can correlate them with
      // downstream failures without inflating the transaction quota.
      if (elapsed > SLOW_QUERY_THRESHOLD_MS) {
        recordSlowQuery(spanName, elapsed);
      }

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.text().catch(() => null);

      if (!response.ok) {
        const message =
          (typeof data === "object" && data && "error" in data
            ? String((data as { error: unknown }).error)
            : null) ?? `HTTP ${response.status}`;
        span?.setStatus({ code: 2, message });
        throw new ApiError(response.status, message, data);
      }

      return data as TResponse;
    },
  );
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
