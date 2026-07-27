/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test-utils/db-mock";

const mocks = vi.hoisted(() => ({
  client: null as any,
  sendEmail: vi.fn(),
  sendPushNotification: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.client,
}));
vi.mock("@/lib/emails/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/push/send", () => ({
  sendPushNotification: mocks.sendPushNotification,
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { GET } from "./route";

function request(secret = "test-secret") {
  return new Request("http://localhost/api/cron/drain-notifications", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

function outboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-1",
    channel: "push",
    recipient_user_id: "seller-1",
    payload: { title: "Paid", body: "Ship it" },
    status: "PENDING",
    attempts: 0,
    max_attempts: 5,
    next_attempt_at: new Date(Date.now() - 1_000).toISOString(),
    lease_token: null,
    lease_expires_at: null,
    ...overrides,
  };
}

describe("cron/drain-notifications", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    mocks.sendEmail.mockReset();
    mocks.sendPushNotification.mockReset();
  });

  it("rejects an invalid cron secret", async () => {
    mocks.client = createMockDb({}).client;
    expect((await GET(request("wrong"))).status).toBe(401);
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    mocks.client = createMockDb({}).client;

    expect((await GET(request("undefined"))).status).toBe(401);
  });

  it("claims and acknowledges a push notification", async () => {
    const db = createMockDb({ notifications_outbox: [outboxRow()] });
    mocks.client = db.client;

    const response = await GET(request());

    await expect(response.json()).resolves.toEqual({
      processed: 1,
      sent: 1,
      failed: 0,
      retried: 0,
    });
    expect(mocks.sendPushNotification).toHaveBeenCalledOnce();
    expect(db.state.notifications_outbox[0].status).toBe("SENT");
  });

  it("delivers an in-app message idempotently", async () => {
    const db = createMockDb({
      notifications_outbox: [
        outboxRow({
          channel: "in_app",
          payload: {
            conversationId: "conversation-1",
            senderId: "buyer-1",
            content: "Payment confirmed",
            messageType: "payment_completed",
            metadata: { transaction_id: "tx-1" },
          },
        }),
      ],
    });
    mocks.client = db.client;

    const response = await GET(request());

    expect((await response.json()).sent).toBe(1);
    expect(db.state.messages).toContainEqual(
      expect.objectContaining({
        conversation_id: "conversation-1",
        message_type: "payment_completed",
      }),
    );
  });

  it("acknowledges a replay when the in-app message already exists", async () => {
    const payload = {
      conversationId: "conversation-1",
      senderId: "buyer-1",
      content: "Payment confirmed",
      messageType: "payment_completed",
      metadata: { transaction_id: "tx-1" },
    };
    const db = createMockDb({
      notifications_outbox: [outboxRow({ channel: "in_app", payload })],
      messages: [
        {
          id: "existing-message",
          conversation_id: payload.conversationId,
          sender_id: payload.senderId,
          content: payload.content,
          message_type: payload.messageType,
          metadata: payload.metadata,
        },
      ],
    });
    mocks.client = db.client;

    const response = await GET(request());

    expect((await response.json()).sent).toBe(1);
    expect(db.state.messages).toHaveLength(1);
    expect(db.state.notifications_outbox[0].status).toBe("SENT");
  });

  it("releases a failed delivery for retry", async () => {
    const db = createMockDb({ notifications_outbox: [outboxRow()] });
    mocks.client = db.client;
    mocks.sendPushNotification.mockRejectedValueOnce(new Error("push down"));

    const response = await GET(request());

    await expect(response.json()).resolves.toEqual({
      processed: 1,
      sent: 0,
      failed: 0,
      retried: 1,
    });
    expect(db.state.notifications_outbox[0]).toMatchObject({
      status: "PENDING",
      attempts: 1,
      last_error: "push down",
      lease_token: null,
    });
  });
});
