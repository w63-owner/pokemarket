import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyRateLimit: vi.fn(),
  getRequestUser: vi.fn(),
  isFeatureEnabled: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  getRequestUser: mocks.getRequestUser,
}));
vi.mock("@/lib/feature-flags/server", () => ({
  isFeatureEnabled: mocks.isFeatureEnabled,
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: mocks.applyRateLimit,
  messageSendRateLimit: { name: "message-send" },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/push/send", () => ({
  sendPushNotification: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
  setMeasurement: vi.fn(),
}));

import { POST } from "./route";

const conversationId = "00000000-0000-4000-8000-000000000001";

describe("POST /api/messages/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestUser.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isFeatureEnabled.mockResolvedValue(true);
  });

  it("rejects payloads outside the shared contract", async () => {
    const response = await POST(
      new Request("http://localhost/api/messages/send", {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          conversation_id: conversationId,
          client_id: "short",
          storage_path: "../escape.webp",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.applyRateLimit).not.toHaveBeenCalled();
  });

  it("rate limits by user and conversation", async () => {
    mocks.applyRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ error: "Trop de requêtes" }), {
        status: 429,
      }),
    );
    const response = await POST(
      new Request("http://localhost/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "text",
          conversation_id: conversationId,
          client_id: "client-id-123",
          content: "Bonjour",
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(mocks.applyRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "message-send" }),
      `user-1:${conversationId}`,
    );
  });
});
