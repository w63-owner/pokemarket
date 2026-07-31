import { describe, expect, it } from "vitest";
import type { Message } from "@/types";
import {
  createMessageClientId,
  getReplySnapshot,
  messagesGroup,
  toReplySnapshot,
} from "./message-thread-utils";

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    conversation_id: "conversation-1",
    sender_id: "user-1",
    content: "Bonjour",
    message_type: "text",
    offer_id: null,
    metadata: null,
    read_at: null,
    created_at: "2026-07-31T12:00:00.000Z",
    ...overrides,
  };
}

describe("message thread utilities", () => {
  it("groups same-sender messages sent within five minutes", () => {
    const first = message();
    const second = message({
      id: "message-2",
      created_at: "2026-07-31T12:04:59.000Z",
    });

    expect(messagesGroup(first, second)).toBe(true);
  });

  it("does not group different senders, system events or distant messages", () => {
    const base = message();

    expect(messagesGroup(base, message({ sender_id: "user-2" }))).toBe(false);
    expect(messagesGroup(base, message({ message_type: "system" }))).toBe(
      false,
    );
    expect(
      messagesGroup(base, message({ created_at: "2026-07-31T12:05:01.000Z" })),
    ).toBe(false);
  });

  it("creates and reads a quoted-message snapshot", () => {
    const original = message({
      message_type: "image",
      content: "path/image.webp",
    });
    const snapshot = toReplySnapshot(original);
    const reply = message({ metadata: { reply_to: snapshot } });

    expect(getReplySnapshot(reply)).toEqual(snapshot);
    expect(
      getReplySnapshot(message({ metadata: { reply_to: { id: 42 } } })),
    ).toBeNull();
  });

  it("generates a stable UUID-shaped client id", () => {
    expect(createMessageClientId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
