import type { Session } from "@supabase/supabase-js";
import { apiFetch } from "./client";
import { supabase } from "../supabase";

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
    },
  },
}));

jest.mock("../env", () => ({
  env: { API_URL: "https://api.example.test" },
}));

jest.mock("@/lib/sentry", () => ({
  Sentry: {
    startSpan: jest.fn(
      (
        _options: unknown,
        callback: (span: {
          setAttribute: jest.Mock;
          setStatus: jest.Mock;
        }) => unknown,
      ) =>
        callback({
          setAttribute: jest.fn(),
          setStatus: jest.fn(),
        }),
    ),
  },
}));

jest.mock("@/lib/metrics", () => ({
  recordSlowQuery: jest.fn(),
  SLOW_QUERY_THRESHOLD_MS: 10_000,
}));

const mockGetSession = jest.mocked(supabase.auth.getSession);
const mockRefreshSession = jest.mocked(supabase.auth.refreshSession);

function createSession(accessToken: string, expiresAt: number): Session {
  return {
    access_token: accessToken,
    expires_at: expiresAt,
    expires_in: 3_600,
    refresh_token: "refresh-token",
    token_type: "bearer",
    user: {} as Session["user"],
  };
}

describe("apiFetch authentication", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: jest.fn().mockResolvedValue({ ok: true }),
    });
  });

  it("sends the current access token as a Bearer header", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: createSession(
          "current-token",
          Math.floor(Date.now() / 1000) + 3_600,
        ),
      },
      error: null,
    });

    await apiFetch("/api/ocr", { method: "POST", body: {} });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("Authorization")).toBe(
      "Bearer current-token",
    );
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it("refreshes an expired session before sending the request", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: createSession(
          "expired-token",
          Math.floor(Date.now() / 1000) - 1,
        ),
      },
      error: null,
    });
    const refreshedSession = createSession(
      "fresh-token",
      Math.floor(Date.now() / 1000) + 3_600,
    );
    mockRefreshSession.mockResolvedValue({
      data: {
        session: refreshedSession,
        user: refreshedSession.user,
      },
      error: null,
    });

    await apiFetch("/api/ocr", { method: "POST", body: {} });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("Authorization")).toBe(
      "Bearer fresh-token",
    );
  });

  it("does not send an authenticated request without a session", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(apiFetch("/api/ocr")).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        message: "Veuillez vous connecter pour continuer.",
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
