import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  applyRateLimit: vi.fn(),
  sendPushNotification: vi.fn(),
  conversationLimit: vi.fn(),
  transactionLimit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === "conversations") {
        return {
          select: () => ({
            or: () => ({
              limit: mocks.conversationLimit,
            }),
          }),
        };
      }
      return {
        select: () => ({
          or: () => ({
            in: () => ({
              limit: mocks.transactionLimit,
            }),
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: mocks.applyRateLimit,
  pushRateLimit: { name: "push-send" },
}));

vi.mock("@/lib/push/send", () => ({
  sendPushNotification: mocks.sendPushNotification,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { POST } from "./route";

function makeReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/push/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "caller-1" } } });
    mocks.applyRateLimit.mockResolvedValue(null);
    mocks.conversationLimit.mockResolvedValue({
      data: [{ id: "conversation-1" }],
      error: null,
    });
    mocks.transactionLimit.mockResolvedValue({ data: [], error: null });
    mocks.sendPushNotification.mockResolvedValue(undefined);
  });

  it("rejects absolute deep-link URLs before sending", async () => {
    const response = await POST(
      makeReq({
        user_id: "target-1",
        title: "Vérifiez votre compte",
        body: "Action requise",
        url: "https://evil.example/wallet-verify",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "URL de notification invalide",
    });
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });

  it("rejects protocol-relative deep-link URLs", async () => {
    const response = await POST(
      makeReq({
        user_id: "target-1",
        title: "PokeMarket",
        body: "Nouveau message",
        url: "//evil.example/phish",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });

  it("forwards sanitized relative deep links", async () => {
    const response = await POST(
      makeReq({
        user_id: "target-1",
        title: "Nouvelle offre",
        body: "Offre de 10.00 €",
        url: "/messages/conversation-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.sendPushNotification).toHaveBeenCalledWith(
      "target-1",
      "Nouvelle offre",
      "Offre de 10.00 €",
      "/messages/conversation-1",
    );
  });
});
