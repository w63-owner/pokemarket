import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import {
  applyMessageReadReceipt,
  getNextMessageCursor,
  prependMessageIfMissing,
  reconcileOptimisticMessages,
} from "./messaging";
import { sendMessageRequestSchema } from "../validations";

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    conversation_id: "00000000-0000-4000-8000-000000000001",
    sender_id: "00000000-0000-4000-8000-000000000002",
    content: "Bonjour",
    message_type: "text",
    metadata: null,
    offer_id: null,
    read_at: null,
    created_at: "2026-07-31T12:00:00.000Z",
    ...overrides,
  };
}

describe("messaging cache integration", () => {
  it("reconciles only the optimistic message with the same client_id", () => {
    const keep = message("temp-1", {
      metadata: { client_id: "client-keep" },
    });
    const remove = message("temp-2", {
      metadata: { client_id: "client-remove" },
    });
    const incoming = message("server-1", {
      metadata: { client_id: "client-remove" },
    });

    expect(reconcileOptimisticMessages([keep, remove], incoming)).toEqual([
      keep,
    ]);
  });

  it("deduplicates realtime inserts already returned by the send response", () => {
    const existing = message("server-1");
    const cache = { pages: [{ messages: [existing] }], pageParams: [] };
    expect(prependMessageIfMissing(cache, existing)).toBe(cache);
  });

  it("applies read receipts across paginated pages", () => {
    const target = message("server-2");
    const cache = {
      pages: [{ messages: [message("server-1")] }, { messages: [target] }],
      pageParams: [],
    };
    const updated = applyMessageReadReceipt(cache, {
      id: target.id,
      read_at: "2026-07-31T12:01:00.000Z",
    });
    expect(updated?.pages[1].messages[0].read_at).toBe(
      "2026-07-31T12:01:00.000Z",
    );
  });

  it("returns a stable cursor only for full pages", () => {
    const messages = [
      message("newer"),
      message("older", { created_at: "2026-07-30T12:00:00.000Z" }),
    ];
    expect(getNextMessageCursor(messages, 2)).toEqual({
      created_at: "2026-07-30T12:00:00.000Z",
      id: "older",
    });
    expect(getNextMessageCursor(messages, 3)).toBeNull();
  });
});

describe("send message contract", () => {
  const base = {
    conversation_id: "00000000-0000-4000-8000-000000000001",
    client_id: "client-id-123",
  };

  it("normalizes text and validates image storage ownership shape", () => {
    const text = sendMessageRequestSchema.parse({
      ...base,
      type: "text",
      content: "  Bonjour  ",
    });
    if (text.type !== "text") throw new Error("Expected text payload");
    expect(text.content).toBe("Bonjour");

    expect(
      sendMessageRequestSchema.safeParse({
        ...base,
        type: "image",
        storage_path: "../other-conversation/file.webp",
      }).success,
    ).toBe(false);
  });
});
