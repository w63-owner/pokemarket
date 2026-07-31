import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyRateLimit: vi.fn(),
  createAdminClient: vi.fn(),
  getRequestUser: vi.fn(),
  isFeatureEnabled: vi.fn(),
  sendPushNotification: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  getRequestUser: mocks.getRequestUser,
}));
vi.mock("@/lib/feature-flags/server", () => ({
  isFeatureEnabled: mocks.isFeatureEnabled,
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: mocks.applyRateLimit,
  messageImageNotifyRateLimit: { name: "message-image-notify" },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/push/send", () => ({
  sendPushNotification: mocks.sendPushNotification,
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { POST } from "./route";

const conversationId = "00000000-0000-4000-8000-000000000001";
const messageId = "00000000-0000-4000-8000-000000000002";

function request(body: unknown) {
  return new Request("http://localhost/api/messages/notify-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function query(result: unknown, terminal: "single" | "maybeSingle") {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    or: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder[terminal].mockResolvedValue(result);
  return builder;
}

function mockDatabase({
  conversation = {
    data: { id: conversationId, buyer_id: "user-1", seller_id: "user-2" },
    error: null,
  },
  message = { data: { id: messageId }, error: null },
  block = { data: null, error: null },
}: {
  conversation?: unknown;
  message?: unknown;
  block?: unknown;
} = {}) {
  const conversationQuery = query(conversation, "single");
  const messageQuery = query(message, "maybeSingle");
  const blockQuery = query(block, "maybeSingle");
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "conversations") return conversationQuery;
      if (table === "messages") return messageQuery;
      if (table === "user_blocks") return blockQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
  });
  return { blockQuery, conversationQuery, messageQuery };
}

describe("POST /api/messages/notify-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestUser.mockResolvedValue({ user: { id: "user-1" } });
    mocks.isFeatureEnabled.mockResolvedValue(true);
    mocks.applyRateLimit.mockResolvedValue(null);
    mocks.sendPushNotification.mockResolvedValue(undefined);
  });

  it("requires an authenticated user", async () => {
    mocks.getRequestUser.mockResolvedValue({ user: null });

    const response = await POST(
      request({ conversation_id: conversationId, message_id: messageId }),
    );

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects incomplete payloads before rate limiting", async () => {
    const response = await POST(request({ conversation_id: conversationId }));

    expect(response.status).toBe(400);
    expect(mocks.applyRateLimit).not.toHaveBeenCalled();
  });

  it("rate limits by authenticated user and conversation", async () => {
    mocks.applyRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ error: "Trop de requêtes" }), {
        status: 429,
      }),
    );

    const response = await POST(
      request({ conversation_id: conversationId, message_id: messageId }),
    );

    expect(response.status).toBe(429);
    expect(mocks.applyRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "message-image-notify" }),
      `user-1:${conversationId}`,
    );
  });

  it("rejects users outside the conversation", async () => {
    mockDatabase({
      conversation: {
        data: { id: conversationId, buyer_id: "user-2", seller_id: "user-3" },
        error: null,
      },
    });

    const response = await POST(
      request({ conversation_id: conversationId, message_id: messageId }),
    );

    expect(response.status).toBe(403);
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });

  it("only accepts an image authored by the caller in that conversation", async () => {
    const { messageQuery } = mockDatabase({
      message: { data: null, error: null },
    });

    const response = await POST(
      request({ conversation_id: conversationId, message_id: messageId }),
    );

    expect(response.status).toBe(404);
    expect(messageQuery.eq).toHaveBeenCalledWith(
      "conversation_id",
      conversationId,
    );
    expect(messageQuery.eq).toHaveBeenCalledWith("sender_id", "user-1");
    expect(messageQuery.eq).toHaveBeenCalledWith("message_type", "image");
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });

  it("notifies the other participant for a verified image message", async () => {
    mockDatabase();

    const response = await POST(
      request({ conversation_id: conversationId, message_id: messageId }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.sendPushNotification).toHaveBeenCalledWith(
      "user-2",
      "Nouveau message",
      "📷 Photo",
      `/messages/${conversationId}`,
      { category: "messages", conversationId },
    );
  });

  it("does not notify when either participant blocked the other", async () => {
    mockDatabase({
      block: {
        data: { blocker_id: "user-2" },
        error: null,
      },
    });

    const response = await POST(
      request({ conversation_id: conversationId, message_id: messageId }),
    );

    expect(response.status).toBe(403);
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });
});
