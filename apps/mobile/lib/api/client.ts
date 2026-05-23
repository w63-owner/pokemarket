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
